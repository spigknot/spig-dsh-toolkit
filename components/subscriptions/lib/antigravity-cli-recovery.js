/**
 * History recovery for the `antigravity` CLI route.
 *
 * The transport refuses any prompt above {@link MAX_AGY_PROMPT_BYTES} with
 * {@link AGY_PROMPT_TOO_LARGE}, before anything is sent: agy keeps only the
 * first ~192 kB of a message and drops the rest silently, and the dropped tail
 * is where the current request lives. This listener turns that refusal into a
 * compaction of the session history and one retry of the same step.
 *
 * It does not use DSH's stock overflow recovery, for two reasons:
 *
 * 1. The stock `context-overflow` path compacts every surface node but the
 *    last. DSH admits runtime/time context AFTER the person's message, so the
 *    last node is often that context and the person's request would be folded
 *    into the summary — the retry would then answer the checkpoint, the very
 *    "answers an older topic" failure this route had.
 * 2. The summarization call itself goes through this route by default, so a
 *    300–450 kB history cannot be summarized in one call either.
 *
 * Here the active tail — everything after the last assistant answer, i.e. the
 * request and the context admitted with it — is never inside a compacted range,
 * and the history is summarized oldest-first in spans whose summarization
 * prompt fits the route. Only this route's own failure code is handled; every
 * other failure, and every other provider, goes to `next()` untouched.
 */
import { AGY_PROMPT_OVERHEAD_BYTES, AGY_PROMPT_TOO_LARGE, agyBridgeReserveBytes, MAX_AGY_PROMPT_BYTES, estimateMessageBytes, noteRecoveryFailure } from './antigravity-cli-local.js';

/** DSH's compaction instruction (~2.6 kB) plus labels and checkpoint framing. */
const SUMMARY_RESERVE_BYTES = 8_000;
/** Estimates count attachments as placeholders; stay a little under the ceiling. */
const ESTIMATE_MARGIN_BYTES = 4_000;
/** Upper bound on summarization calls per recovery. */
const MAX_ROUNDS = 8;

/** Surface nodes with their event and derived model message. */
function surfaceEntries(session) {
	return session.surface.nodes.map((seq) => {
		const event = session.eventAt(seq);
		return { seq, event, message: event === undefined ? null : session.deriveEventMessage(event) };
	});
}

/** Index of the first node after the last assistant answer: the request being answered and its context. */
export function activeTailStart(entries) {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		if (entries[index].message?.role === 'assistant') return index + 1;
	}
	return 0;
}

/** Estimated CLI prompt bytes for the whole surface. */
export function surfaceBytes(entries) {
	return AGY_PROMPT_OVERHEAD_BYTES + estimateMessageBytes(entries.map((entry) => entry.message));
}

/**
 * The oldest history span whose summarization prompt — system head, the span,
 * and DSH's instruction — fits `budget`. The span never reaches the active
 * tail and never ends between a tool call and its results.
 * @returns inclusive surface seqs, or `null` when not even one node fits.
 */
export function chooseCompactionRange(entries, budget = MAX_AGY_PROMPT_BYTES) {
	const first = entries[0]?.message?.role === 'system' ? 1 : 0;
	const tail = activeTailStart(entries);
	const head = first === 1 ? estimateMessageBytes([entries[0].message]) : 0;
	const room = budget - AGY_PROMPT_OVERHEAD_BYTES - SUMMARY_RESERVE_BYTES - head;
	let end = -1;
	let used = 0;
	for (let index = first; index < tail; index += 1) {
		used += estimateMessageBytes([entries[index].message]);
		if (used > room) break;
		if (entries[index + 1]?.event?.type !== 'tool/result') end = index;
	}
	return end < first ? null : { start: entries[first].seq, end: entries[end].seq };
}

/**
 * Compact the history until the whole surface fits the route, keeping the
 * active tail verbatim.
 * @returns the number of compactions performed.
 * @throws when the history cannot be brought under the ceiling.
 */
export async function compactHistoryForAgy({ agent, compaction, signal, budget = MAX_AGY_PROMPT_BYTES, chunkBudget, reserveBytes = 0 }) {
	// `budget` is what the conversation prompt must fit (the CLI ceiling);
	// `chunkBudget` is what one summarization prompt may take — larger when the
	// summary is made by a model outside the CLI route (see compaction-model.js).
	const summaryBudget = typeof chunkBudget === 'number' && chunkBudget > 0 ? chunkBudget : budget;
	const session = agent.session;
	// `reserveBytes` is what the session's prompt carries besides the surface —
	// the DSH tool bridge header — so the surface must leave room for it.
	const reserve = Number.isFinite(reserveBytes) && reserveBytes > 0 ? reserveBytes : 0;
	const target = budget - ESTIMATE_MARGIN_BYTES - reserve;
	const initial = surfaceEntries(session);
	const protectedSeqs = initial.slice(activeTailStart(initial)).map((entry) => entry.seq);
	let rounds = 0;
	for (let entries = initial; surfaceBytes(entries) > target; entries = surfaceEntries(session)) {
		if (rounds >= MAX_ROUNDS) throw new Error(`history still above ${target} bytes after ${MAX_ROUNDS} compactions`);
		signal?.throwIfAborted();
		const range = chooseCompactionRange(entries, summaryBudget);
		if (range === null) throw new Error('no history span small enough to summarize through this route (a single message is larger than the route allows)');
		const before = { generation: session.surface.replaceGeneration, bytes: surfaceBytes(entries) };
		await compaction.compactRegion(range.start, range.end, agent, signal);
		rounds += 1;
		const nodes = session.surface.nodes;
		// The request being answered must survive verbatim, in place, or the retry
		// would answer something else: fail rather than retry on a mutilated surface.
		if (!protectedSeqs.every((seq) => nodes.includes(seq))) throw new Error('compaction removed part of the current request');
		if (session.surface.replaceGeneration <= before.generation) throw new Error('compaction did not change the history');
		if (surfaceBytes(surfaceEntries(session)) >= before.bytes) throw new Error('compaction did not reduce the history');
	}
	return rounds;
}

/**
 * Handle {@link AGY_PROMPT_TOO_LARGE} for `provider`: compact, then retry the
 * step once. Registered with `prepend` and on a code no stock listener knows,
 * so no other recovery acts on this failure.
 * @returns the listener disposer.
 */
export function installAgyOverflowRecovery(ctx, { provider = 'antigravity', budget = MAX_AGY_PROMPT_BYTES, onWarn = () => {}, chunkBudgetFor = async () => undefined, reserveFor = (agent) => agyBridgeReserveBytes(agent?.session?.id) } = {}) {
	const tried = new WeakMap();
	return ctx.on('agent/request-error', async (payload, next) => {
		const { agent, turn, step, failure, signal } = payload;
		if (payload.provider !== provider || failure?.code !== AGY_PROMPT_TOO_LARGE) return next();
		const attempt = `${turn}:${step}`;
		// One recovery per step: a second refusal after compacting is terminal.
		if (tried.get(agent) === attempt) return undefined;
		tried.set(agent, attempt);
		// A failure is reported through one more attempt: the adapter finds the
		// note and ends the turn with the real cause (e.g. a 429 with its reset
		// time) without starting agy. That attempt's error is not ours, so the
		// step cannot loop.
		const fail = (error) => {
			onWarn(`Antigravity CLI history compaction failed: ${error instanceof Error ? error.message : String(error)}; the request was not sent`);
			return noteRecoveryFailure(agent?.session?.id, error) ? { kind: 'retry' } : undefined;
		};
		const compaction = ctx.get('agentPresets')?.serviceFor?.(agent, 'compaction') ?? ctx.get('compaction');
		if (compaction === undefined) return fail(new Error('no compaction service is available for this agent'));
		try {
			const chunkBudget = await chunkBudgetFor(agent, signal).catch(() => undefined);
			let reserveBytes = 0;
			try { reserveBytes = Number(reserveFor(agent)) || 0; } catch {}
			const rounds = await compactHistoryForAgy({ agent, compaction, signal, budget, chunkBudget, reserveBytes });
			return rounds > 0 ? { kind: 'retry' } : undefined;
		} catch (error) {
			if (signal?.aborted) throw error;
			return fail(error);
		}
	}, { prepend: true });
}
