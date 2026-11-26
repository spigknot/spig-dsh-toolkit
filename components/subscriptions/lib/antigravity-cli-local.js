/**
 * Official Antigravity CLI transport for the `antigravity` route.
 *
 * Nothing here talks to `cloudcode-pa.googleapis.com`: every call runs the
 * user's installed `agy` binary with whatever Google account that binary is
 * already signed in to. No token is copied, refreshed or stored, and no second
 * account is tried when the account is rate limited — a quota error surfaces as
 * a quota error.
 *
 * The CLI's own tools run with full permission: the prompt goes in over
 * stdin and the session workspace is added to the CLI, so the model reads,
 * writes and executes there. This runs outside the DSH sandbox and audit
 * trail by design; use it only for workspaces you trust.
 */
import { spawn as nodeSpawn } from 'node:child_process';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bridgeHeader, bridgeTag, serializeToolsCompact, shouldBridge } from './antigravity-tool-bridge.js';

/**
 * Permission resources granted to the Antigravity engine: file reads and web
 * reads. Both were verified working on this host.
 */
const ALLOWED_ACTIONS = ['read_file', 'read_url'];

/**
 * Everything else denied, spelled per action.
 *
 * `command` matters most: the CLI's own `run_command` fails on this host with
 * `0xC0000142` (STATUS_DLL_INIT_FAILED) no matter how `agy` is spawned — it
 * returns "No output from the command" every time. When the model needs the
 * shell it retries the broken tool until the turn ends with an empty response
 * (that is the "resposta vazia" bug). An explicit denial answers immediately,
 * so the model stops instead of looping.
 */
const DENIED_ACTIONS = ['write_file', 'command', 'execute_url', 'download_url', 'mcp'];

/** Deny beats ask, and ask beats allow. */
const ROUTE_RULES = {
	permissions: {
		allow: ALLOWED_ACTIONS.map((action) => `${action}(*)`),
		deny: DENIED_ACTIONS.map((action) => `${action}(*)`)
	}
};

/**
 * Policy while the DSH tool bridge is active: every CLI tool denied, reads
 * included. The harness runs the tools (antigravity-tool-bridge.js), so each
 * action shows up in DSH with its sandbox, approval and card; a CLI-side read
 * would be invisible there.
 */
const BRIDGE_RULES = {
	permissions: {
		allow: [],
		deny: [...ALLOWED_ACTIONS, ...DENIED_ACTIONS].map((action) => `${action}(*)`)
	}
};

/** Stated up front so the model does not spend the turn rediscovering the denials. */
const ROUTE_NOTE = 'Route note: this Antigravity route cannot run shell commands or write files — those permissions are denied. Read the files you need and answer in text.';

/**
 * Largest prompt, in UTF-8 bytes, this route hands to `agy`.
 *
 * agy 1.5.16 accepts a longer stream-json turn and records it whole, but the
 * representation it generates from keeps only the first ~192,000 bytes and
 * marks the rest `<truncated N bytes>` — still reporting SUCCESS. The cut tail
 * is where the current request lives, so a longer prompt produced answers to an
 * older topic. This is a conservative ceiling below the observed cut, not the
 * model's token window and not a documented limit: re-measure when agy changes.
 */
export const MAX_AGY_PROMPT_BYTES = 180_000;

/**
 * Failure code for "the history makes this prompt too large". Deliberately not
 * DSH's CONTEXT_WINDOW_EXCEEDED: the stock overflow recovery compacts all but
 * the last surface node, which can fold the current request into the summary.
 * The route's own recovery (antigravity-cli-recovery.js) owns this code.
 */
export const AGY_PROMPT_TOO_LARGE = 'ANTIGRAVITY_PROMPT_TOO_LARGE';

/**
 * Why the history compaction for a session failed, kept until the retry the
 * recovery requests reads it, so the turn ends with the real cause (a 429, an
 * oversized message) instead of a generic "must be compacted" refusal.
 */
const recoveryFailures = new Map();
const RECOVERY_NOTE_TTL_MS = 10 * 60_000;

/** Record a failed history compaction for one session (called by the recovery). */
export function noteRecoveryFailure(sessionId, error) {
	if (sessionId === undefined || sessionId === null) return false;
	recoveryFailures.set(String(sessionId), {
		at: Date.now(),
		code: typeof error?.code === 'string' ? error.code : undefined,
		message: String(error?.message ?? error)
	});
	return true;
}

function takeRecoveryFailure(sessionId) {
	if (sessionId === undefined || sessionId === null) return undefined;
	const key = String(sessionId);
	const note = recoveryFailures.get(key);
	recoveryFailures.delete(key);
	return note !== undefined && Date.now() - note.at < RECOVERY_NOTE_TTL_MS ? note : undefined;
}

/** The pre-fix behaviour: every CLI tool granted, and no note in the prompt. */
const PERMISSIVE_RULES = { permissions: { allow: ['*'] } };

/**
 * Route-fix state, on by default.
 *
 * The host owns persistence (Settings → Subscriptions) and keeps this flag in
 * step through {@link setAgyRouteFix}; the transport only reads it per call so
 * flipping the switch applies to the next request without a restart.
 */
let agyFixEnabled = true;

/** Turn the shell-free route fix on or off; the host persists the user's choice. */
export function setAgyRouteFix(enabled) {
	agyFixEnabled = enabled !== false;
}

/** Whether the shell-free route fix is currently on. */
export function agyRouteFix() {
	return agyFixEnabled;
}

/**
 * Long-prompt guard state, on by default (Settings → Subscriptions →
 * Antigravity). On: a prompt above {@link MAX_AGY_PROMPT_BYTES} is never sent
 * and the history is compacted instead. Off: the pre-guard behaviour, where agy
 * may silently drop the tail of a long prompt. Read per call.
 */
let agyGuardEnabled = true;

/** Turn the long-prompt guard on or off; the host persists the user's choice. */
export function setAgyPromptGuard(enabled) {
	agyGuardEnabled = enabled !== false;
}

/** Whether the long-prompt guard is currently on. */
export function agyPromptGuard() {
	return agyGuardEnabled;
}

let agyTransportMode = 'compaction';
const agyTransportListeners = new Set();

export function agyTransport() {
	return agyTransportMode;
}

export function setAgyTransport(mode) {
	if (mode !== 'compaction' && mode !== 'acp') throw new TypeError('Unknown Antigravity transport');
	if (mode === agyTransportMode) return;
	agyTransportMode = mode;
	for (const listener of agyTransportListeners) listener(mode);
}

export function onAgyTransportChange(listener) {
	agyTransportListeners.add(listener);
	return () => { agyTransportListeners.delete(listener); };
}

/**
 * DSH tool bridge state, on by default (Settings → Subscriptions →
 * Antigravity). On: a call that carries DSH tools describes them in the prompt
 * and the adapter turns the model's bridge blocks into DSH tool calls. Off: the
 * read-only route. Read per call.
 */
let agyBridgeEnabled = true;

/** Turn the DSH tool bridge on or off; the host persists the user's choice. */
export function setAgyToolBridge(enabled) {
	agyBridgeEnabled = enabled !== false;
}

/** Whether the DSH tool bridge is currently on. */
export function agyToolBridge() {
	return agyBridgeEnabled;
}

/** Bytes of the last bridge header per session: the recovery reserves them when it compacts. */
const bridgeReserves = new Map();

/** Exact non-surface bytes (system prompt, bridge header, formatting delta) measured on the last CLI prompt per session. */
const promptReserves = new Map();

/** UTF-8 bytes outside the session surface (system prompt, bridge header) that recovery must reserve when compacting. */
export function agyBridgeReserveBytes(sessionId) {
	const key = String(sessionId);
	return Math.max(bridgeReserves.get(key) ?? 0, promptReserves.get(key) ?? 0);
}

/**
 * The bridge for one call, or undefined when the call is not bridged (switch
 * off, no tools, or a summarization). Shared by both transports.
 * @returns `{ tag, header, names, journal }`.
 */
export function agyBridgeFor({ tools, purpose, sessionId }, { enabled = agyBridgeEnabled, catalogMaxBytes, tag: preferredTag } = {}) {
	const known = sessionId !== undefined && sessionId !== null;
	if (!shouldBridge({ enabled, tools, purpose })) {
		// A summarization says nothing about the session's own prompts.
		if (purpose !== 'compaction' && known) bridgeReserves.delete(String(sessionId));
		return undefined;
	}
	const catalog = serializeToolsCompact(tools, catalogMaxBytes === undefined ? undefined : { maxBytes: catalogMaxBytes });
	const tag = bridgeTag(sessionId, preferredTag);
	const header = bridgeHeader(tag, catalog);
	if (known) bridgeReserves.set(String(sessionId), Buffer.byteLength(`${header}\n\n`, 'utf8'));
	return { tag, header, names: catalog.names, journal: { tools: catalog.names.length, catalogBytes: catalog.bytes, catalogLevel: catalog.level, overBudget: catalog.overBudget } };
}

const QUOTA = /RESOURCE_EXHAUSTED|QUOTA_EXHAUSTED|quota (?:exceeded|reached|exhausted)|rate[ -]?limit|"?code"?\s*[:=]\s*"?429|status"?\s*[:=]\s*"?429|too many requests/i;
const MODEL_ROW = /^([a-z0-9][a-z0-9._-]*)\t(.+)$/u;

/** Quota families the subscription meters, as the CLI names them. */
const QUOTA_SCOPES = ['Gemini Models', 'Claude and GPT models', 'Gemini 4 Argon'];

/**
 * Parse the `/usage` payload into the window shape the panel renders.
 *
 * The CLI reports what is *left*, so a bucket of 0.94 becomes 6% used.
 */
export function parseUsage(payload) {
	const groups = payload?.command?.data?.groups;
	if (!Array.isArray(groups)) return [];
	const windows = [];
	for (const group of groups) {
		const scope = QUOTA_SCOPES.find((name) => name === group?.name);
		if (scope === undefined || !Array.isArray(group?.buckets)) continue;
		for (const bucket of group.buckets) {
			const fraction = typeof bucket?.remaining_fraction === 'number' ? bucket.remaining_fraction : Number.NaN;
			if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) continue;
			const label = `${bucket.window ?? ''} ${bucket.name ?? ''}`.toLowerCase();
			const kind = bucket.window === 'weekly' || /week/.test(label) ? 'weekly' : bucket.window === '5h' || /(?:5|five)[ _-]?h/.test(label) ? 'session' : undefined;
			if (kind === undefined) continue;
			const resetsAt = typeof bucket.reset_time === 'string' ? Date.parse(bucket.reset_time) : Number.NaN;
			windows.push({ kind, scope, usedPercent: (1 - fraction) * 100, ...Number.isFinite(resetsAt) ? { resetsAt } : {} });
		}
	}
	return windows;
}

/** A CLI failure carrying a stable code so DSH can classify it. */
export class AgyCliError extends Error {
	constructor(message, code = 'ANTIGRAVITY_CLI', extra = {}) {
		super(message);
		this.name = 'AgyCliError';
		this.code = code;
		Object.assign(this, extra);
	}
}

/** Parse `agy models` stdout; progress lines carry no tab and are skipped. */
export function parseModels(stdout) {
	const rows = [];
	for (const line of String(stdout ?? '').split(/\r?\n/u)) {
		const match = MODEL_ROW.exec(line.trim());
		if (match !== null) rows.push({ id: match[1], name: match[2].trim() });
	}
	return rows;
}

/** Flatten one tool-result block; only text can be carried by a text prompt. */
function toolResultText(block) {
	const content = Array.isArray(block?.content) ? block.content : typeof block?.content === 'string' ? [{ type: 'text', text: block.content }] : [];
	const texts = [];
	for (const part of content) {
		if (part?.type !== 'text') throw new AgyCliError(`Antigravity CLI route is text-only and cannot send a ${String(part?.type)} block inside a tool result`, 'UNSUPPORTED_CONTENT');
		texts.push(part.text);
	}
	return texts.join('\n');
}

/**
 * User-role messages DSH injects as context rather than as a request, by the
 * `source.kind` their producer stamps on them (never by their text: a person may
 * quote `<system-reminder>` in a real request). Anything else that arrives as a
 * user message — the person, a retry, a goal round, a subagent report, a
 * schedule, an auxiliary instruction without a source — is a request.
 */
const CONTEXT_SOURCES = new Set([
	'runtime-context', 'time-context', 'model-selection', 'agent-instructions',
	'skill-catalog', 'skill-invocation', 'compact-checkpoint'
]);
const LABELS = { system: 'System', developer: 'Developer', assistant: 'Assistant', tool: 'Tool result', user: 'User', context: 'Context' };
const RETRY_REQUEST = 'Retry the last request: the previous attempt did not complete. Answer the most recent request above.';
const TOOL_CONTINUATION = 'Continue the task from the tool results above and answer the most recent request.';
const BRIDGE_CONTINUATION = 'Continue the task from the tool results above: call more tools if you still need them, otherwise answer the most recent request.';
/** Same length as a real tag, so estimates match what is sent. */
const ESTIMATE_BRIDGE = { tag: 'dsh_tc_000000000000' };

/** Placeholder size used when estimating a message whose attachment DSH projects to text later. */
const ATTACHMENT_ESTIMATE = '[attachment reference]'.padEnd(400, ' ');

/** One past call in the bridge format, so the model sees its own protocol in the history. */
function bridgeCallText(block, tag) {
	let args = block.arguments ?? {};
	if (typeof args === 'string') {
		try {
			args = JSON.parse(args);
		} catch {}
	}
	return `<${tag}>${JSON.stringify({ id: String(block.id ?? ''), name: block.name, arguments: args })}</${tag}>`;
}

/** A tool result as the bridge shows it: call id, tool name and failure flag, then the text. */
function bridgeResultText(id, isError, content, names) {
	const parts = Array.isArray(content) ? content : typeof content === 'string' ? [{ type: 'text', text: content }] : [];
	const texts = parts.map((part) => part?.type === 'text' ? part.text : `[${String(part?.type)} omitted: this route carries text only]`);
	const name = names?.get(String(id));
	return `[id=${String(id)}${name === undefined ? '' : ` name=${name}`}${isError === true ? ' ERROR' : ''}]\n${texts.join('\n')}`;
}

function messageText(message, { estimate = false, bridge, names } = {}) {
	const blocks = Array.isArray(message?.content) ? message.content : typeof message?.content === 'string' ? [{ type: 'text', text: message.content }] : [];
	if (bridge !== undefined && message?.role === 'tool' && message.toolCallId !== undefined) return bridgeResultText(message.toolCallId, message.isError, blocks, names);
	const texts = [];
	for (const block of blocks) {
		const type = block?.type;
		if (bridge !== undefined && type === 'tool-call' && message?.role === 'assistant') {
			texts.push(bridgeCallText(block, bridge.tag));
			continue;
		}
		if (bridge !== undefined && type === 'tool-result') {
			texts.push(bridgeResultText(block.toolCallId, block.isError, block.content, names));
			continue;
		}
		// Reasoning is model scaffolding and a tool call is an instruction to an
		// executor: neither is conversation content, so a history that carries them
		// (every mid-session model switch does) must not fail here.
		if (type === 'reasoning' || type === 'tool-call' || type === 'tool-addition' || type === 'tool-removal') continue;
		if (type === 'tool-result') {
			const text = toolResultText(block);
			if (text.length > 0) texts.push(text);
			continue;
		}
		if (type === 'text') {
			texts.push(block.text);
			continue;
		}
		if (estimate && (type === 'file' || type === 'image')) {
			texts.push(ATTACHMENT_ESTIMATE);
			continue;
		}
		throw new AgyCliError(`Antigravity CLI route is text-only and cannot send a ${String(type)} block`, 'UNSUPPORTED_CONTENT');
	}
	return texts.join('\n');
}

function userKind(message) {
	return CONTEXT_SOURCES.has(message?.source?.kind) ? 'context' : 'user';
}

/**
 * Split a DSH request into the history and the active tail.
 *
 * The tail is every message after the last assistant answer: what this call
 * must respond to, plus the context DSH admitted with it. Its request messages
 * are rendered last, after that context, so the CLI never sees a timestamp,
 * model-switch notice or runtime block in the place of the request.
 */
export function splitPrompt({ messages, system }, options) {
	const list = Array.from(messages ?? []);
	if (options?.bridge !== undefined && options.names === undefined) {
		// Tool results carry only their call id; name them from the calls.
		const names = new Map();
		for (const message of list) {
			if (message?.role !== 'assistant' || !Array.isArray(message.content)) continue;
			for (const block of message.content) if (block?.type === 'tool-call') names.set(String(block.id), block.name);
		}
		options = { ...options, names };
	}
	let lastAnswer = -1;
	for (let index = list.length - 1; index >= 0; index -= 1) {
		if (list[index]?.role === 'assistant') {
			lastAnswer = index;
			break;
		}
	}
	const head = [];
	const history = [];
	const context = [];
	const requests = [];
	let lastRequestEmpty = false;
	let turn = 0;
	let turnAnswered = false;
	let activeTurn = Infinity;
	list.forEach((message, index) => {
		const role = message?.role;
		const text = messageText(message, options);
		const realUser = role === 'user' && userKind(message) === 'user';
		// Delivery metadata only: do not split a user/tool/assistant sequence at a
		// tool-call assistant message or between unanswered requests.
		if (realUser && turnAnswered) {
			turn += 1;
			turnAnswered = false;
		}
		if (role === 'assistant' && text.trim() && !(Array.isArray(message.content) && message.content.some((block) => block?.type === 'tool-call'))) {
			turnAnswered = true;
		}
		if (index === 0 && role === 'system') {
			if (text.trim().length > 0) head.push({ label: LABELS.system, text });
			return;
		}
		if (index <= lastAnswer) {
			if (text.trim().length > 0) history.push({ label: role === 'user' ? LABELS[userKind(message)] : LABELS[role] ?? LABELS.user, text, turn, sourceKind: message?.source?.kind });
			return;
		}
		if (realUser || role === 'tool') activeTurn = Math.min(activeTurn, turn);
		if (realUser) {
			const request = message?.source?.kind === 'retry' && text.trim().length === 0 ? RETRY_REQUEST : text;
			lastRequestEmpty = request.trim().length === 0;
			if (!lastRequestEmpty) requests.push({ label: LABELS.user, text: request, retry: message?.source?.kind === 'retry' && text.trim().length === 0 });
			return;
		}
		if (text.trim().length > 0) context.push({ label: role === 'user' ? LABELS.context : LABELS[role] ?? LABELS.context, text, tool: role === 'tool' });
	});
	if (lastRequestEmpty) throw new AgyCliError('Antigravity CLI route received an empty request; nothing was sent', 'EMPTY_REQUEST');
	if (requests.length === 0) {
		if (!context.some((part) => part.tool)) throw new AgyCliError('Antigravity CLI route has no request after the last answer (only harness context); nothing was sent', 'EMPTY_REQUEST');
		requests.push({ label: LABELS.user, text: options?.bridge === undefined ? TOOL_CONTINUATION : BRIDGE_CONTINUATION });
	}
	const instructions = typeof system === 'string' ? system.trim() : '';
	return { instructions, head, history, context, requests, activeTurn };
}

export function renderPrompt({ instructions, head, history, context, requests }) {
	const parts = [...head, ...history, ...context, ...requests];
	// One request and nothing else goes verbatim, so the CLI answers the prompt and not a transcript.
	if (parts.length === 1) return instructions.length === 0 ? parts[0].text : `${instructions}\n\n${parts[0].text}`;
	const transcript = parts.map((part) => `${part.label}: ${part.text}`).join('\n\n');
	return instructions.length === 0 ? transcript : `System instructions:\n${instructions}\n\n${transcript}`;
}

/** Flatten a DSH request into one prompt whose last part is the request this call must answer. */
export function buildPrompt(request, bridge) {
	return renderPrompt(splitPrompt(request, bridge === undefined ? undefined : { bridge }));
}

/** The prompt with its history removed: what remains however much DSH compacts. */
function irreduciblePrompt(request, bridge) {
	return renderPrompt({ ...splitPrompt(request, bridge === undefined ? undefined : { bridge }), history: [] });
}

/**
 * Wrap a prompt the way {@link createAgy} sends it: the bridge header when DSH
 * tools are bridged (it replaces the read-only note), else the note when the
 * route fix is on.
 */
export function finalPrompt(text, fix, header) {
	if (typeof header === 'string' && header.length > 0) return `${header}\n\n${text}`;
	return fix ? `${ROUTE_NOTE}\n\n${text}` : text;
}

/**
 * Estimate the UTF-8 bytes these messages add to a CLI prompt, whatever their
 * order. File and image blocks, which DSH projects to short text references at
 * dispatch, count as a fixed placeholder. Used to size a compaction region so
 * the summarization call itself stays within {@link MAX_AGY_PROMPT_BYTES}.
 */
export function estimateMessageBytes(messages) {
	let total = 0;
	for (const message of messages ?? []) {
		if (message === null || message === undefined) continue;
		const text = messageText(message, { estimate: true, bridge: agyBridgeEnabled ? ESTIMATE_BRIDGE : undefined });
		if (text.trim().length > 0) total += Buffer.byteLength(`Context: ${text}\n\n`, 'utf8');
	}
	return total;
}

/** Bytes of the route note and framing every CLI prompt carries. */
export const AGY_PROMPT_OVERHEAD_BYTES = Buffer.byteLength(`${ROUTE_NOTE}\n\nSystem instructions:\n\n\n`, 'utf8');

/** Map the CLI's own diagnostic onto the codes DSH already understands. */
export function classifyFailure(output) {
	const detail = String(output ?? '');
	let payload;
	const embedded = /AGY_ERROR:\s*(\{[\s\S]*\})/u.exec(detail)?.[1];
	if (embedded !== undefined) {
		try {
			payload = JSON.parse(embedded);
		} catch {}
	}
	const message = payload?.short_error ?? payload?.message ?? detail.trim().split(/\r?\n/u).filter(Boolean).slice(-3).join(' ');
	if (QUOTA.test(detail)) return new AgyCliError(`Antigravity CLI quota exhausted: ${message}`, 'RATE_LIMIT', { status: 429 });
	if (/UNAUTHENTICATED|PERMISSION_DENIED|"?status"?\s*[:=]\s*401/u.test(detail)) return new AgyCliError(`Antigravity CLI is not signed in: ${message}`, 'AUTH');
	return new AgyCliError(`Antigravity CLI failed: ${message.length > 0 ? message : 'no diagnostic output'}`, payload?.status ?? 'ANTIGRAVITY_CLI');
}

function defaultBin() {
	const configured = process.env.DSH_AGY_BIN?.trim();
	return configured !== undefined && configured.length > 0 ? configured : 'agy';
}

/** Whether a complete stdout line already carries the stream's final `result` event. */
function hasResultLine(stdout) {
	if (!stdout.includes('"result"')) return false;
	const lines = stdout.split('\n');
	lines.pop(); // the last element is an incomplete line (or empty)
	return lines.some((line) => {
		const trimmed = line.trim();
		if (!trimmed.startsWith('{') || !trimmed.includes('"result"')) return false;
		try {
			return JSON.parse(trimmed)?.event === 'result';
		} catch {
			return false;
		}
	});
}

/**
 * One bounded subprocess: it dies with the caller's signal and with a hard cap.
 * When `stdin` is given it is written to the child and the stream is closed.
 * When `doneWhen(stdout)` holds, the call settles at once and the child is
 * terminated: agy 1.5.16 keeps running ~10 minutes after its final result when
 * it works in a git workspace, and nothing it does after the result matters.
 */
function runProcess(spawn, args, { signal, cwd, timeoutMs, stdin, doneWhen }) {
	return new Promise((resolve, reject) => {
		const child = spawn(args[0], args.slice(1), { cwd, shell: false, windowsHide: true, stdio: [stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		let settled = false;
		let timer;
		const finish = (fn, value) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener('abort', abort);
			fn(value);
		};
		const abort = () => {
			child.kill();
			finish(reject, new AgyCliError('Antigravity CLI call aborted', 'ABORTED'));
		};
		if (signal?.aborted === true) {
			abort();
			return;
		}
		signal?.addEventListener('abort', abort, { once: true });
		timer = setTimeout(() => {
			child.kill();
			finish(reject, new AgyCliError(`Antigravity CLI exceeded ${Math.round(timeoutMs / 1000)}s`, 'TIMEOUT'));
		}, timeoutMs);
		timer.unref?.();
		child.stdout?.setEncoding?.('utf8');
		child.stderr?.setEncoding?.('utf8');
		child.stdout?.on('data', (chunk) => {
			stdout += chunk;
			if (!settled && doneWhen?.(stdout)) {
				finish(resolve, { stdout, stderr });
				try {
					child.kill();
				} catch {}
			}
		});
		child.stderr?.on('data', (chunk) => { stderr += chunk; });
		if (stdin !== undefined) {
			child.stdin?.on('error', () => void 0);
			child.stdin?.end(stdin);
		}
		child.on('error', (error) => finish(reject, new AgyCliError(`Antigravity CLI could not start (${args[0]}): ${error.message}`, 'NO_ADAPTER')));
		child.on('close', (code) => {
			if (code === 0) finish(resolve, { stdout, stderr });
			else finish(reject, classifyFailure(`${stderr}\n${stdout}`));
		});
	});
}

/** One NDJSON turn for `--input-format stream-json`. */
const streamTurn = (prompt) => JSON.stringify({ event: 'user', message: { role: 'user', content: [{ type: 'text', text: prompt }] } });

/**
 * Opt-in call journal, for the day a reply does not match the request.
 *
 * Set `DSH_AGY_DEBUG=1` to append one JSON line per call with the prompt size,
 * the last 200 characters of what was actually sent, and the shape of the
 * answer. Disabled by default, and every failure is swallowed: a diagnostic
 * must never break a call.
 */
export async function debugLog(record) {
	if (process.env.DSH_AGY_DEBUG?.trim() !== '1') return;
	try {
		const file = process.env.DSH_AGY_DEBUG_LOG?.trim() || join(tmpdir(), 'dsh-agy-debug.log');
		await appendFile(file, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, 'utf8');
	} catch {}
}

/** Flatten a `--output-format stream-json` transcript into the single result record. */
function parseStreamResult(stdout) {
	let result;
	for (const line of String(stdout ?? '').split(/\r?\n/u)) {
		const trimmed = line.trim();
		if (!trimmed.startsWith('{')) continue;
		let event;
		try {
			event = JSON.parse(trimmed);
		} catch {
			continue;
		}
		if (event?.event === 'result' && event.result !== undefined) result = event.result;
	}
	if (result === undefined) throw new AgyCliError('Antigravity CLI returned no result event in its stream', 'EMPTY_RESPONSE');
	return result;
}

/**
 * Build the transport the `antigravity` adapter uses.
 * @param options - spawn implementation, binary name, time limits, and the
 *   route-fix reader; injectable for tests.
 */
export function createAgy({ spawn = nodeSpawn, bin = defaultBin(), timeoutMs = 60 * 60_000, modelsTimeoutMs = 60_000, fixOf = () => agyFixEnabled, guardOf = () => agyGuardEnabled, bridgeOf = () => agyBridgeEnabled, catalogMaxBytes } = {}) {
	let listed;
	let listedAt = 0;
	async function listModels({ signal } = {}) {
		if (listed !== undefined && Date.now() - listedAt < 60_000) return listed;
		const { stdout } = await runProcess(spawn, [bin, 'models'], { signal, timeoutMs: modelsTimeoutMs });
		const rows = parseModels(stdout);
		if (rows.length === 0) {
			listed = undefined;
			throw new AgyCliError('Antigravity CLI listed no models; check that agy is signed in', 'NO_ADAPTER');
		}
		listed = rows;
		listedAt = Date.now();
		return rows;
	}
	async function run({ model, messages, system, signal, workspaceDir, purpose, sessionId, tools }) {
		const startedAt = Date.now();
		const fix = fixOf() !== false;
		const guard = guardOf() !== false;
		const journal = { model, fix, guard, purpose, workspaceDir };
		let tmp;
		try {
			signal?.throwIfAborted();
			// DSH tools go through the bridge: described in a header that replaces
			// the read-only note, executed by DSH when the model asks for them.
			const bridge = agyBridgeFor({ tools, purpose, sessionId }, { enabled: bridgeOf() !== false, catalogMaxBytes });
			if (bridge !== undefined) journal.bridge = bridge.journal;
			const prompt = finalPrompt(buildPrompt({ messages, system }, bridge), fix, bridge?.header);
			journal.promptBytes = Buffer.byteLength(prompt, 'utf8');
			if (purpose !== 'compaction' && sessionId !== undefined && sessionId !== null) {
				const nonSurface = Math.max(0, journal.promptBytes - AGY_PROMPT_OVERHEAD_BYTES - estimateMessageBytes(messages));
				promptReserves.set(String(sessionId), nonSurface);
			}
			// Measured on the exact text that would go to stdin, before anything
			// starts: a prompt over the ceiling is never sent, never cut.
			if (guard && journal.promptBytes > MAX_AGY_PROMPT_BYTES) {
				const detail = `Antigravity CLI prompt is ${journal.promptBytes} UTF-8 bytes; this route sends at most ${MAX_AGY_PROMPT_BYTES} because agy silently drops the tail of a longer message. Nothing was sent.`;
				if (purpose === 'compaction') {
					throw new AgyCliError(`${detail} The history region chosen for summarization does not fit this route.`, 'INVALID_REQUEST');
				}
				const minimumBytes = Buffer.byteLength(finalPrompt(irreduciblePrompt({ messages, system }, bridge), fix, bridge?.header), 'utf8');
				if (minimumBytes > MAX_AGY_PROMPT_BYTES) {
					throw new AgyCliError(`${detail} The current request with its instructions alone is ${minimumBytes} bytes, so compacting the history cannot help: shorten the request or use another route.`, 'INVALID_REQUEST');
				}
				const failed = takeRecoveryFailure(sessionId);
				if (failed !== undefined) {
					// The recovery already tried and failed: report why, with its code
					// (a quota error stays a rate limit), and keep whatever it compacted.
					const cause = `The conversation history could not be compacted to fit this route: ${failed.message}`;
					throw failed.code === 'RATE_LIMIT'
						? new AgyCliError(`${cause} Any summary already made was kept. ${detail}`, 'RATE_LIMIT', { status: 429 })
						: new AgyCliError(`${cause} Any summary already made was kept. ${detail}`, 'INVALID_REQUEST');
				}
				throw new AgyCliError(`${detail} The conversation history must be compacted first.`, AGY_PROMPT_TOO_LARGE, { promptBytes: journal.promptBytes, minimumBytes });
			}
			journal.promptTail = prompt.slice(-200);
			tmp = await mkdtemp(join(tmpdir(), 'dsh-agy-'));
			// Neither big payload touches argv: Windows caps a command line near
			// 32 KB, and a long session overflows it (spawn ENAMETOOLONG) before the
			// model is ever reached. The prompt goes in as one NDJSON turn on stdin;
			// the policy goes in a file inside this call's temp directory.
			const settingsPath = join(tmp, 'settings.json');
			await writeFile(settingsPath, JSON.stringify(bridge !== undefined ? BRIDGE_RULES : fix ? ROUTE_RULES : PERMISSIVE_RULES), 'utf8');
			const args = [bin, '--input-format', 'stream-json', '--output-format', 'stream-json', '--model', model, '--settings', settingsPath];
			// The CLI works where the session works: with a workspace, run there
			// and register it, so relative paths resolve to the repo instead of
			// the temp directory. Without one, fall back to the temp directory.
			let cwd = tmp;
			if (typeof workspaceDir === 'string' && workspaceDir.length > 0) {
				args.push('--add-dir', workspaceDir);
				cwd = workspaceDir;
			}
			const { stdout, stderr } = await runProcess(spawn, args, { signal, cwd, timeoutMs, stdin: `${streamTurn(prompt)}\n`, doneWhen: hasResultLine });
			const payload = parseStreamResult(stdout);
			if (payload.status !== undefined && payload.status !== 'SUCCESS') {
				const reason = [payload.error, payload.response, stderr].filter((part) => typeof part === 'string' && part.trim().length > 0).join('\n').trim();
				const classified = classifyFailure(reason);
				// Quota and sign-in failures keep their codes (a quota error must not read as a generic failure).
				if (classified.code === 'RATE_LIMIT' || classified.code === 'AUTH') throw classified;
				throw new AgyCliError(`Antigravity CLI reported ${payload.status}: ${payload.error ?? payload.response ?? ''}`, 'ANTIGRAVITY_CLI');
			}
			const text = typeof payload.response === 'string' ? payload.response : '';
			if (text.trim().length === 0) throw new AgyCliError('Antigravity CLI returned an empty answer', 'EMPTY_RESPONSE');
			const usage = payload.usage;
			await debugLog({ ...journal, ms: Date.now() - startedAt, responseBytes: Buffer.byteLength(text, 'utf8'), responseHead: text.slice(0, 200) });
			return {
				text,
				...(bridge === undefined ? {} : { bridge: { tag: bridge.tag, tools: bridge.names } }),
				...(usage === undefined ? {} : { usage: {
					inputTokens: usage.input_tokens ?? 0,
					outputTokens: usage.output_tokens ?? 0,
					...(usage.total_tokens === undefined ? {} : { totalTokens: usage.total_tokens }),
					...(usage.cache_read_tokens ? { cacheReadTokens: usage.cache_read_tokens } : {}),
					...(usage.thinking_tokens ? { reasoningTokens: usage.thinking_tokens } : {})
				} })
			};
		} catch (error) {
			await debugLog({ ...journal, ms: Date.now() - startedAt, failure: { code: error?.code, message: String(error?.message ?? error).slice(0, 300) } });
			throw error;
		} finally {
			if (tmp !== undefined) await rm(tmp, { recursive: true, force: true }).catch(() => {});
		}
	}
	async function usage({ signal } = {}) {
		const { stdout } = await runProcess(spawn, [bin, '-p', '/usage', '--output-format', 'json'], { signal, timeoutMs: modelsTimeoutMs });
		let payload;
		try {
			payload = JSON.parse(stdout.trim());
		} catch {
			throw new AgyCliError('Antigravity CLI returned no parsable quota report', 'EMPTY_RESPONSE');
		}
		const windows = parseUsage(payload);
		if (windows.length === 0) throw new AgyCliError('Antigravity CLI reported no quota windows', 'EMPTY_RESPONSE');
		return windows;
	}

	async function version({ signal } = {}) {
		const { stdout, stderr } = await runProcess(spawn, [bin, '--version'], { signal, timeoutMs: modelsTimeoutMs });
		const line = `${stdout}\n${stderr}`.split(/\r?\n/u).map((part) => part.trim()).find((part) => /^\d+\.\d+/u.test(part));
		if (line === undefined) throw new AgyCliError('Antigravity CLI reported no version', 'EMPTY_RESPONSE');
		return line;
	}

	return { listModels, run, usage, version };
}

let shared;
const transport = () => (shared ??= createAgy());

/** The transport calls the adapter uses; created on first call. */
export const listAgyModels = (options) => transport().listModels(options);
export const runAgy = (options) => transport().run(options);
export const readAgyUsage = (options) => transport().usage(options);

/** CLI version, resolved once: it only changes when the user updates the CLI. */
let versionCache;
export const readAgyVersion = async (options) => (versionCache ??= await transport().version(options).catch(() => undefined));
