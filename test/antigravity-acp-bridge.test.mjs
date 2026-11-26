/**
 * DSH tool bridge over the persistent ACP transport: the header goes into the
 * agy session once, the answer is parsed into DSH tool calls, and the tool
 * results continue the same agy session incrementally. Fake ACP client only.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAcpTransport } from '../components/subscriptions/lib/antigravity-acp-transport.js';
import { deliverAcpContext } from '../components/subscriptions/lib/antigravity-context-delivery.js';
import { forgetBridgeTag } from '../components/subscriptions/lib/antigravity-tool-bridge.js';

const ask = (text) => ({ role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } });
const tools = [
	{ name: 'read', description: 'Read a file.', parameters: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] } }
];
const textChunks = (text) => [
	{ type: 'block-start', index: 0, blockType: 'text' },
	{ type: 'text-delta', index: 0, text },
	{ type: 'block-end', index: 0, block: { type: 'text', text } },
	{ type: 'finish', reason: { kind: 'stop' } }
];
const collect = async (iter) => { const out = []; for await (const chunk of iter) out.push(chunk); return out; };

async function fixture(t, { bridge = true } = {}) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spig-acp-bridge-'));
	const prompts = [];
	let sessions = 0;
	let reply = () => 'ok';
	const transport = createAcpTransport({
		root,
		modeOf: () => 'acp',
		bridgeEnabledOf: () => bridge,
		fallback: async function* () { throw new Error('fallback must not run'); },
		clientFactory: () => ({
			alive: true,
			async initialize() {},
			async newSession() { sessions += 1; return `agy-${sessions}`; },
			async loadSession() { return true; },
			async *prompt({ text }) { prompts.push(text); yield* textChunks(reply(text)); },
			dispose() { this.alive = false; }
		})
	});
	t.after(async () => { await transport.disposeAll(); await fs.rm(root, { recursive: true, force: true }); });
	const options = (messages, extra) => ({ sessionId: 'dsh-bridge', model: 'gemini-3-flash', messages, tools, ...extra });
	return { transport, prompts, options, sessions: () => sessions, setReply: (fn) => { reply = fn; } };
}

const tagOf = (prompt) => /<(dsh_tc_[0-9a-f]{12})>\{"name":"TOOL_NAME"/u.exec(prompt)?.[1];

test('the first turn carries the header and a tagged answer becomes DSH tool calls', async (t) => {
	const f = await fixture(t);
	f.setReply((prompt) => { const tag = tagOf(prompt); return `Looking.\n<${tag}>{"name":"read","arguments":{"file_path":"a.txt"}}</${tag}>`; });
	const chunks = await collect(f.transport.stream(f.options([ask('what is in a.txt?')])));
	assert.ok(f.prompts[0].startsWith('Tool protocol (DeepSeek Harness bridge)'));
	assert.ok(!chunks.some((chunk) => chunk.type === 'text-delta' && chunk.text.includes('dsh_tc_')), 'raw tags leaked as text');
	const call = chunks.find((chunk) => chunk.type === 'block-end' && chunk.block.type === 'tool-call');
	assert.equal(call.block.name, 'read');
	assert.equal(call.block.arguments, '{"file_path":"a.txt"}');
	assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'tool-calls' } });
});

test('tool results continue the same agy session without resending history or header', async (t) => {
	const f = await fixture(t);
	f.setReply((prompt) => { const tag = tagOf(prompt); return `Looking.\n<${tag}>{"name":"read","arguments":{"file_path":"a.txt"}}</${tag}>`; });
	const first = ask('what is in a.txt? ORIGINAL-ASK');
	const chunks = await collect(f.transport.stream(f.options([first])));
	const call = chunks.find((chunk) => chunk.type === 'block-end' && chunk.block.type === 'tool-call').block;
	// What DSH records for that step, then the result DSH produced.
	const assistant = { role: 'assistant', content: [{ type: 'text', text: 'Looking.' }, call] };
	const result = { role: 'tool', toolCallId: call.id, content: [{ type: 'text', text: 'ALPHA-CONTENT' }] };
	f.setReply(() => 'a.txt says ALPHA-CONTENT');
	const second = await collect(f.transport.stream(f.options([first, assistant, result])));
	assert.equal(f.sessions(), 1, 'the agy session was rebuilt');
	assert.doesNotMatch(f.prompts[1], /ORIGINAL-ASK/u);
	assert.doesNotMatch(f.prompts[1], /Tool protocol/u);
	assert.ok(f.prompts[1].includes(`[id=${call.id}]\nALPHA-CONTENT`), f.prompts[1]);
	assert.match(f.prompts[1], /call more tools if you still need them/u);
	assert.equal(second.at(-1).reason.kind, 'stop');
	assert.equal(second.find((chunk) => chunk.type === 'text-delta').text, 'a.txt says ALPHA-CONTENT');
});

test('a changed tool catalog rebuilds the agy session with the new header', async (t) => {
	const f = await fixture(t);
	const first = ask('hi');
	await collect(f.transport.stream(f.options([first])));
	const more = [...tools, { name: 'grep', description: 'Search.', parameters: { type: 'object', properties: {} } }];
	await collect(f.transport.stream(f.options([first, { role: 'assistant', content: [{ type: 'text', text: 'ok' }] }, ask('again')], { tools: more })));
	assert.equal(f.sessions(), 2);
	assert.match(f.prompts[1], /- grep/u);
});

test('with the bridge off ACP streams text as before and sends no header', async (t) => {
	const f = await fixture(t, { bridge: false });
	f.setReply(() => 'plain');
	const chunks = await collect(f.transport.stream(f.options([ask('hi')])));
	assert.doesNotMatch(f.prompts[0], /Tool protocol/u);
	assert.equal(chunks.at(-1).reason.kind, 'stop');
});

test('all-invalid bridge blocks trigger one corrective retry on the same ACP session', async (t) => {
	const f = await fixture(t);
	let calls = 0;
	let tag;
	f.setReply((prompt) => {
		calls += 1;
		if (calls === 1) {
			tag = tagOf(prompt);
			return `<${tag}>{not valid json}</${tag}>`;
		}
		assert.match(prompt, /no block was valid/u);
		return `Fixed.
<${tag}>{"name":"read","arguments":{"file_path":"ok.txt"}}</${tag}>`;
	});
	const chunks = await collect(f.transport.stream(f.options([ask('read ok.txt')])));
	assert.equal(calls, 2);
	assert.equal(f.sessions(), 1);
	const call = chunks.find((chunk) => chunk.type === 'block-end' && chunk.block.type === 'tool-call');
	assert.equal(call.block.name, 'read');
	assert.equal(call.block.arguments, '{"file_path":"ok.txt"}');
	assert.equal(chunks.at(-1).reason.kind, 'tool-calls');
});

test('persisted bridgeTag allows resuming the same ACP session after a process restart', async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spig-acp-bridge-restart-'));
	const sessionId = 'dsh-bridge-restart';
	let newSessions = 0;
	let loadedSessions = 0;
	const makeTransport = () => createAcpTransport({
		root,
		modeOf: () => 'acp',
		bridgeEnabledOf: () => true,
		fallback: async function* () { throw new Error('fallback must not run'); },
		clientFactory: () => ({
			alive: true,
			async initialize() {},
			async newSession() { newSessions += 1; return `agy-${newSessions}`; },
			async loadSession() { loadedSessions += 1; return true; },
			async *prompt() { yield* textChunks('ok'); },
			dispose() { this.alive = false; }
		})
	});
	const firstTransport = makeTransport();
	let secondTransport;
	t.after(async () => {
		await firstTransport.disposeAll();
		if (secondTransport) await secondTransport.disposeAll();
		forgetBridgeTag(sessionId);
		await fs.rm(root, { recursive: true, force: true });
	});
	const first = ask('hello');
	await collect(firstTransport.stream({ sessionId, model: 'gemini-3-flash', messages: [first], tools }));
	await firstTransport.disposeAll();
	// Simulate DSH restart: clear in-memory bridge tag cache and create a fresh transport.
	forgetBridgeTag(sessionId);
	secondTransport = makeTransport();
	await collect(secondTransport.stream({
		sessionId,
		model: 'gemini-3-flash',
		messages: [first, { role: 'assistant', content: [{ type: 'text', text: 'ok' }] }, ask('follow-up')],
		tools
	}));
	assert.equal(newSessions, 1, 'should reuse persisted agy session instead of creating a new one');
	assert.equal(loadedSessions, 1, 'should call loadSession after restart');
});

test('archive pointer instructs the model to use DSH read tool when bridge is active', async (t) => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'spig-acp-archive-bridge-'));
	t.after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
	const bigTurn = 'x'.repeat(2_000);
	const messages = [ask(bigTurn), { role: 'assistant', content: [{ type: 'text', text: bigTurn }] }, ask('now')];
	const delivered = await deliverAcpContext({ messages }, {
		contextDir: dir,
		limitBytes: 1_000,
		bridge: { tag: 'dsh_tc_0123456789ab', header: 'Tool protocol', names: ['read'] }
	});
	assert.ok(delivered.archivePath);
	assert.match(delivered.text, /with the read tool \(file_path, 1-based offset and limit/u);
	assert.doesNotMatch(delivered.text, /read_file/u);
});

test('oversized parallel tool results in an incremental ACP step spill to contextDir without breaking the live session', async (t) => {
	const f = await fixture(t);
	f.setReply((prompt) => {
		const tag = tagOf(prompt);
		return `<${tag}>{"name":"read","arguments":{"file_path":"big.js"}}</${tag}>
<${tag}>{"name":"read","arguments":{"file_path":"small.js"}}</${tag}>`;
	});
	const first = ask('inspect both files');
	const step1 = await collect(f.transport.stream(f.options([first])));
	const calls = step1.filter((c) => c.type === 'block-end' && c.block.type === 'tool-call').map((c) => c.block);
	assert.equal(calls.length, 2);
	const bigContent = Array.from({ length: 2000 }, (_, i) => `line ${i + 1}: ${'A'.repeat(75)}`).join('\n');
	const smallContent = 'SMALL-FILE-BODY';
	const assistant = { role: 'assistant', content: calls };
	const results = [
		{ role: 'tool', toolCallId: calls[0].id, content: [{ type: 'text', text: bigContent }] },
		{ role: 'tool', toolCallId: calls[1].id, content: [{ type: 'text', text: smallContent }] },
	];
	f.setReply(() => 'Analyzed both.');
	const step2 = await collect(f.transport.stream(f.options([first, assistant, ...results])));
	assert.equal(f.sessions(), 1, 'must stay on the same incremental ACP session');
	assert.ok(Buffer.byteLength(f.prompts[1], 'utf8') <= 150_000);
	assert.ok(f.prompts[1].includes(`[id=${calls[1].id}]\nSMALL-FILE-BODY`));
	assert.match(f.prompts[1], /Full output saved to: ([^\n]+agy-tool-results-[^\s]+\.md) \(lines (\d+)-(\d+)\)/u);
	const [, savedPath, start, end] = /Full output saved to: ([^\n]+agy-tool-results-[^\s]+\.md) \(lines (\d+)-(\d+)\)/u.exec(f.prompts[1]);
	const saved = await fs.readFile(savedPath, 'utf8');
	assert.equal(saved.split('\n').slice(Number(start) - 1, Number(end)).join('\n'), bigContent);
	assert.equal(step2.at(-1).reason.kind, 'stop');
});
