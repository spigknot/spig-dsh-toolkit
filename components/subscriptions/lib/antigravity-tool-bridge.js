/**
 * DSH tool-calling bridge for the `antigravity` CLI route (Variante 1A).
 *
 * `agy` has no structured tool-call channel the harness can drive: it runs its
 * own tools, and on this host its command executor fails with `0xC0000142`
 * under the DSH process. So the CLI's tools stay denied and the harness's tools
 * are described in the prompt instead. The model asks for a call by writing a
 * block delimited by a per-session tag with an unguessable nonce:
 *
 *   <dsh_tc_a1b2c3d4e5f6>{"name":"read","arguments":{"file_path":"README.md"}}</dsh_tc_a1b2c3d4e5f6>
 *
 * The adapter turns each valid block into a DSH `tool-call` block and finishes
 * the step with `tool-calls`, so DSH's own executor runs the call — sandbox,
 * approvals, cards, history — and sends the result back on the next step.
 *
 * Pure module: no process, no I/O. Everything here is unit-testable.
 */
import { randomBytes, randomUUID } from 'node:crypto';

/** Tag of every bridge block: `dsh_tc_` + 12 hex digits. */
const TAG_PREFIX = 'dsh_tc_';
const TAG_PATTERN = /^dsh_tc_[0-9a-f]{12}$/u;
/** Sessions whose tag is remembered; the oldest is forgotten past this. */
const MAX_TAGS = 500;
const tags = new Map();

const newTag = () => `${TAG_PREFIX}${randomBytes(6).toString('hex')}`;

/**
 * The bridge tag of one session: stable for the session's life in this
 * process (the prompt prefix stays cacheable), fresh for a call without one.
 * When `preferred` is a valid persisted tag and the session has no tag in
 * memory yet, it is reused so a restart keeps the same ACP binding.
 */
export function bridgeTag(sessionId, preferred) {
	const validPreferred = typeof preferred === 'string' && TAG_PATTERN.test(preferred) ? preferred : undefined;
	if (sessionId === undefined || sessionId === null || sessionId === '') return validPreferred ?? newTag();
	const key = String(sessionId);
	let tag = tags.get(key);
	if (tag === undefined) {
		tag = validPreferred ?? newTag();
		tags.set(key, tag);
		if (tags.size > MAX_TAGS) tags.delete(tags.keys().next().value);
	}
	return tag;
}

/** Drop a session's tag (the next call gets a new one). */
export function forgetBridgeTag(sessionId) {
	tags.delete(String(sessionId));
}

/** Whether a call goes through the bridge: enabled, with tools, and not a summarization. */
export function shouldBridge({ enabled, tools, purpose }) {
	return enabled === true && Array.isArray(tools) && tools.length > 0 && purpose !== 'compaction';
}

/** Default catalog ceiling: the catalog rides in every prompt under the 180 kB route cap. */
export const DEFAULT_CATALOG_MAX_BYTES = 32_000;

/** Shrink a description to `max` characters, preferring a sentence end. */
function summarize(text, max) {
	if (max <= 0 || typeof text !== 'string') return '';
	const flat = text.replace(/\s+/gu, ' ').trim();
	if (flat.length <= max) return flat;
	const cut = flat.slice(0, max);
	const sentence = cut.lastIndexOf('. ');
	if (sentence >= max * 0.5) return cut.slice(0, sentence + 1);
	const space = cut.lastIndexOf(' ');
	return `${(space > max * 0.5 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** JSON Schema keys worth their bytes to a model writing arguments. */
function compactSchema(node, propertyDescriptionMax, nested = false) {
	if (Array.isArray(node)) return node.map((item) => compactSchema(item, propertyDescriptionMax, nested));
	if (node === null || typeof node !== 'object') return node;
	const out = {};
	if (node.type !== undefined) out.type = node.type;
	if (nested && typeof node.description === 'string') {
		const description = summarize(node.description, propertyDescriptionMax);
		if (description.length > 0) out.description = description;
	}
	if (Array.isArray(node.enum)) out.enum = node.enum;
	if (node.const !== undefined) out.const = node.const;
	if (node.items !== undefined) out.items = compactSchema(node.items, propertyDescriptionMax, true);
	if (node.properties !== null && typeof node.properties === 'object') {
		out.properties = {};
		for (const [key, value] of Object.entries(node.properties)) out.properties[key] = compactSchema(value, propertyDescriptionMax, true);
	}
	if (node.required !== undefined) out.required = node.required;
	for (const key of ['anyOf', 'oneOf', 'allOf']) if (Array.isArray(node[key])) out[key] = compactSchema(node[key], propertyDescriptionMax, true);
	return out;
}

/** [tool description chars, property description chars], most to least detailed. */
const LEVELS = [[240, 120], [160, 60], [80, 0], [0, 0]];

function renderCatalog(tools, [toolMax, propertyMax]) {
	return tools.map((tool) => {
		const description = summarize(tool.description, toolMax);
		const schema = tool.parameters ?? tool.inputSchema ?? tool.input_schema ?? {};
		return `- ${tool.name}${description.length > 0 ? `: ${description}` : ''}\n  params: ${JSON.stringify(compactSchema(schema, propertyMax))}`;
	}).join('\n');
}

/**
 * Describe DSH's tools compactly: names, short descriptions and lean schemas.
 * Descriptions shrink level by level until the catalog fits `maxBytes`; names
 * and parameter signatures are never dropped (the last level may exceed the
 * budget, which `overBudget` reports).
 */
export function serializeToolsCompact(tools, { maxBytes = DEFAULT_CATALOG_MAX_BYTES } = {}) {
	const list = (tools ?? []).filter((tool) => typeof tool?.name === 'string' && tool.name.length > 0);
	let text = '';
	let level = 0;
	for (; level < LEVELS.length; level += 1) {
		text = renderCatalog(list, LEVELS[level]);
		if (Buffer.byteLength(text, 'utf8') <= maxBytes) break;
	}
	const bytes = Buffer.byteLength(text, 'utf8');
	return { text, bytes, names: list.map((tool) => tool.name), level: Math.min(level, LEVELS.length - 1), overBudget: bytes > maxBytes };
}

/**
 * The protocol header that replaces the read-only route note while the bridge
 * is active. English, short, and placed first so it is a stable prefix.
 */
export function bridgeHeader(tag, catalog) {
	return [
		'Tool protocol (DeepSeek Harness bridge): the harness running this conversation executes tools for you — shell, file reads and edits, search and the rest listed below. This CLI\'s own built-in tools are disabled on this route; do not call them.',
		'To call a tool, write one block per call, with strict JSON and an object in "arguments":',
		`<${tag}>{"name":"TOOL_NAME","arguments":{...}}</${tag}>`,
		'Several blocks in one reply run as parallel calls. After the last block stop: write nothing after it and never invent a result. The harness runs the calls and sends each result back as "Tool result: [id=... name=...]".',
		`When you need no tool, answer normally without any <${tag}> block.`,
		'Available tools (name: description; params as compact JSON Schema):',
		catalog.text
	].join('\n');
}

/** Strip a ```json fence a model may put around the block body. */
function unfence(body) {
	const match = /^```[a-z]*\s*\n?([\s\S]*?)\n?```$/iu.exec(body);
	return match === null ? body : match[1].trim();
}

function parseBlock(body, allowedTools) {
	const trimmed = unfence(body.trim());
	let parsed;
	try {
		parsed = JSON.parse(trimmed);
	} catch (error) {
		return { reason: `invalid JSON: ${error.message}` };
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { reason: 'the block is not a JSON object' };
	if (typeof parsed.name !== 'string' || parsed.name.length === 0) return { reason: 'missing "name"' };
	if (!allowedTools.has(parsed.name)) return { reason: `unknown tool "${parsed.name}"` };
	let args = parsed.arguments ?? {};
	if (typeof args === 'string') {
		try {
			args = JSON.parse(args);
		} catch {
			return { reason: '"arguments" is a string that is not JSON' };
		}
	}
	if (args === null || typeof args !== 'object' || Array.isArray(args)) return { reason: '"arguments" must be a JSON object' };
	return { call: { id: `agy_tc_${randomUUID().replace(/-/gu, '').slice(0, 12)}`, name: parsed.name, arguments: JSON.stringify(args) } };
}

/**
 * Split a CLI answer into text and tool calls.
 *
 * Rules: only blocks with this exact tag count; text before the last block is
 * kept (an explanation the model gives before calling); text after the last
 * block is dropped when a valid call exists, because it can only be an
 * invented result; with no valid call the whole answer stays text. Invalid
 * blocks are reported in `invalid` and never emitted.
 */
export function parseToolBridgeOutput(raw, tag, allowedTools) {
	const text = String(raw ?? '');
	const open = `<${tag}>`;
	const close = `</${tag}>`;
	const allowed = allowedTools instanceof Set ? allowedTools : new Set(allowedTools ?? []);
	const calls = [];
	const invalid = [];
	const before = [];
	let cursor = 0;
	let blocks = 0;
	let tail = '';
	for (;;) {
		const start = text.indexOf(open, cursor);
		if (start < 0) {
			tail = text.slice(cursor);
			break;
		}
		before.push(text.slice(cursor, start));
		const bodyStart = start + open.length;
		const end = text.indexOf(close, bodyStart);
		const body = end < 0 ? text.slice(bodyStart) : text.slice(bodyStart, end);
		cursor = end < 0 ? text.length : end + close.length;
		if (body.trim().length === 0) continue;
		blocks += 1;
		const { call, reason } = parseBlock(body, allowed);
		if (call !== undefined) calls.push(call);
		else invalid.push({ reason, body: body.trim().slice(0, 300) });
	}
	if (blocks === 0) return { text, calls, invalid, droppedTrailing: 0 };
	if (calls.length === 0) return { text: [...before, tail].join('').trim(), calls, invalid, droppedTrailing: 0 };
	return { text: before.join('').trim(), calls, invalid, droppedTrailing: Buffer.byteLength(tail.trim(), 'utf8') };
}

/** Text of an answer with its invalid blocks named, so the person and the model both see them. */
export function noteInvalidCalls(text, invalid) {
	if (invalid.length === 0) return text;
	const reasons = invalid.map((entry) => entry.reason).join('; ');
	return `${text}${text ? '\n\n' : ''}[Antigravity bridge: ${invalid.length} tool call(s) could not be run: ${reasons}]`;
}

/**
 * The DSH StreamChunks of one finished answer: optional reasoning, a text
 * block (always present when there is no call), then one tool-call block per
 * call, usage, and `finish` — `tool-calls` when DSH must run something.
 */
export function* answerChunks({ text = '', calls = [], usage, reasoning }) {
	let index = 0;
	if (typeof reasoning === 'string' && reasoning.length > 0) {
		yield { type: 'block-start', index, blockType: 'reasoning' };
		yield { type: 'reasoning-delta', index, text: reasoning };
		yield { type: 'block-end', index, block: { type: 'reasoning', text: reasoning } };
		index += 1;
	}
	if (text.trim().length > 0 || calls.length === 0) {
		yield { type: 'block-start', index, blockType: 'text' };
		yield { type: 'text-delta', index, text };
		yield { type: 'block-end', index, block: { type: 'text', text } };
		index += 1;
	}
	for (const call of calls) {
		yield { type: 'block-start', index, blockType: 'tool-call' };
		yield { type: 'tool-call-delta', index, id: call.id, name: call.name, argumentsDelta: call.arguments };
		yield { type: 'block-end', index, block: { type: 'tool-call', id: call.id, name: call.name, arguments: call.arguments } };
		index += 1;
	}
	if (usage) yield { type: 'usage', usage };
	yield { type: 'finish', reason: { kind: calls.length > 0 ? 'tool-calls' : 'stop' } };
}

/**
 * Canonical form of an assistant answer — its text plus each call's name and
 * arguments — so a transport can recognise its own answer in DSH's history.
 * Reasoning is ignored; any other block makes it unrecognisable (undefined).
 */
export function canonicalAnswer(content) {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return undefined;
	let text = '';
	let calls = '';
	for (const block of content) {
		if (block?.type === 'text') text += block.text;
		else if (block?.type === 'tool-call') calls += `\u0000${block.name}\u0000${block.arguments}`;
		else if (block?.type !== 'reasoning') return undefined;
	}
	return text + calls;
}

/** Feedback for a reply whose every bridge block was invalid (one corrective retry). */
export function invalidCallFeedback(tag, invalid) {
	const reasons = invalid.map((entry) => `- ${entry.reason}`).join('\n');
	return `Your previous reply tried to call a tool, but no block was valid:\n${reasons}\nWrite the call again exactly as <${tag}>{"name":"TOOL_NAME","arguments":{...}}</${tag}> with a tool from the list and strict JSON, or answer without a tool.`;
}
