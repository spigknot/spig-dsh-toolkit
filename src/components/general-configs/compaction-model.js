/**
 * User-chosen model for context compaction.
 *
 * DSH summarizes history with the conversation's own model unless the
 * compaction plugin is configured otherwise. That spends the most expensive
 * quota on the most mechanical task, and on the Antigravity CLI route it also
 * forces the history to be summarized in ≤180 kB slices. This lets the user
 * pick any registered provider/model (e.g. DeepSeek) for that job.
 *
 * Mechanism: an `llm/stream` listener re-routes only calls whose `purpose` is
 * `'compaction'` — the summarization call DSH's compaction issues — to the
 * chosen route. Conversation requests are never touched, and the re-routed call
 * goes through the full LLM runtime (projection, retries, other listeners).
 */
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const COMPACTION_SCOPES = ['all', 'antigravity'];

/**
 * Reasoning effort for the summary call. `'default'` leaves the choice to the
 * model (its configured default, or the provider's own); the rest are the
 * effort ids DSH routes use. The conversation's own effort is never inherited:
 * it belongs to a different model.
 */
export const COMPACTION_EFFORTS = ['default', 'off', 'low', 'medium', 'high', 'xhigh', 'max'];

/** Bytes per token assumed when turning a context window into a byte budget (conservative). */
const BYTES_PER_TOKEN = 2.5;
/** Share of the summarizer's window one summarization prompt may take. */
const WINDOW_SHARE = 0.6;
/** Upper bound for one summarization prompt, whatever the window. */
const MAX_CHUNK_BYTES = 4_000_000;

function validate(value) {
	if (value === null || value === undefined) return undefined;
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error('compaction model must be an object');
	const provider = typeof value.provider === 'string' ? value.provider.trim() : '';
	const model = typeof value.model === 'string' ? value.model.trim() : '';
	const scope = value.scope ?? 'all';
	const effort = value.effort ?? 'default';
	if (provider.length === 0) throw new Error('compaction model needs a provider');
	if (model.length === 0) throw new Error('compaction model needs a model id');
	if (!COMPACTION_SCOPES.includes(scope)) throw new Error(`compaction scope must be one of ${COMPACTION_SCOPES.join(', ')}`);
	if (!COMPACTION_EFFORTS.includes(effort)) throw new Error(`compaction effort must be one of ${COMPACTION_EFFORTS.join(', ')}`);
	return { provider, model, scope, effort };
}

/** The persisted choice; absent means DSH's default (the conversation's own model). */
export class CompactionModelStore {
	current;
	writes = Promise.resolve();

	constructor(path) {
		this.path = path;
		try {
			this.current = validate(JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, '')));
		} catch (error) {
			if (error?.code !== 'ENOENT') this.current = undefined;
		}
	}

	get() {
		return this.current === undefined ? undefined : { ...this.current };
	}

	/** Save a choice, or `null` to go back to the conversation's own model. */
	set(value) {
		let next;
		try {
			next = validate(value);
		} catch (error) {
			return Promise.reject(error);
		}
		const run = this.writes.then(async () => {
			await mkdir(dirname(this.path), { recursive: true });
			if (next === undefined) {
				await rm(this.path, { force: true });
			} else {
				const temporary = `${this.path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
				try {
					await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
					await rename(temporary, this.path);
				} finally {
					await rm(temporary, { force: true });
				}
			}
			this.current = next;
		});
		this.writes = run.catch(() => undefined);
		return run;
	}
}

/** Whether a compaction call from `provider` should go to `target`. */
function routes(target, options) {
	if (target === undefined || options?.purpose !== 'compaction') return false;
	if (target.scope === 'antigravity' && options.provider !== 'antigravity') return false;
	// The re-routed call passes through this listener again: let it through.
	return !(options.provider === target.provider && options.model === target.model);
}

/**
 * Re-route compaction calls to the stored choice.
 * @returns the listener disposer.
 */
export function installCompactionRouting(ctx, { store, onWarn = () => {} }) {
	return ctx.on('llm/stream', function (options, next) {
		const target = store.get();
		if (!routes(target, options)) return next();
		const runtime = this;
		return (async function* () {
			let maxTokens = options.maxTokens;
			const chosen = target.effort === undefined || target.effort === 'default' ? undefined : target.effort;
			// Whether the chosen effort is unusable for this model; unknown (`undefined`)
			// means the model could not be inspected, so the effort is left as chosen.
			let supported;
			try {
				const info = await runtime.resolveModelInfo(target.provider, target.model, options.signal);
				// The compaction cap is sized for the conversation model; never ask the
				// chosen model for more than it declares.
				if (typeof info?.defaultMaxTokens === 'number' && (maxTokens === undefined || maxTokens > info.defaultMaxTokens)) maxTokens = info.defaultMaxTokens;
				if (chosen !== undefined) {
					const declared = (info?.reasoning?.efforts ?? []).map((entry) => entry.id);
					supported = info?.reasoning !== undefined && declared.includes(chosen);
				}
			} catch (error) {
				onWarn(`compaction model ${target.provider}/${target.model} could not be resolved: ${error instanceof Error ? error.message : String(error)}`);
			}
			// The conversation's reasoning effort belongs to its own model; the
			// summary uses the chosen one, or none at all ("default").
			const { reasoningEffort: _effort, ...rest } = options;
			let effort = chosen;
			if (chosen !== undefined && supported === false) {
				// DSH rejects an effort the model does not declare, which would fail the
				// whole compaction: fall back to the model's own default instead.
				onWarn(`compaction model ${target.provider}/${target.model} does not declare reasoning effort "${chosen}"; the summary uses its default`);
				effort = undefined;
			}
			yield* runtime.stream({
				...rest,
				provider: target.provider,
				model: target.model,
				...(effort === undefined ? {} : { reasoningEffort: effort }),
				...(maxTokens === undefined ? {} : { maxTokens })
			});
		})();
	});
}

/**
 * Byte budget for one summarization prompt when the chosen summarizer is not
 * the Antigravity CLI, derived from its context window. `undefined` keeps the
 * CLI ceiling (no choice, a CLI summarizer, or an unknown window).
 */
export async function summaryChunkBudget({ store, llm, signal }) {
	const target = store.get();
	if (target === undefined || target.provider === 'antigravity') return undefined;
	let window;
	try {
		window = (await llm.resolveModelInfo(target.provider, target.model, signal))?.context?.contextWindow;
	} catch {
		return undefined;
	}
	if (typeof window !== 'number' || !(window > 0)) return undefined;
	return Math.min(Math.floor(window * BYTES_PER_TOKEN * WINDOW_SHARE), MAX_CHUNK_BYTES);
}
