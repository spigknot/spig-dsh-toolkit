/**
 * The bridge wired into the CLI transport (prompt, policy, guard) and into the
 * adapter (StreamChunk emission). Fake spawn only: no quota is used.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createCliAdapter } from '../components/subscriptions/lib/antigravity-cli-adapter.js';
import { AGY_PROMPT_TOO_LARGE, MAX_AGY_PROMPT_BYTES, agyBridgeReserveBytes, agyToolBridge, buildPrompt, createAgy, estimateMessageBytes, setAgyToolBridge } from '../components/subscriptions/lib/antigravity-cli-local.js';

function fakeSpawn(reply = () => 'ok') {
	const calls = [];
	const spawn = (bin, args) => {
		const call = { args, stdin: '', settings: undefined };
		const at = args.indexOf('--settings');
		if (at !== -1) call.settings = JSON.parse(readFileSync(args[at + 1], 'utf8'));
		calls.push(call);
		const child = new EventEmitter();
		child.stdout = new PassThrough();
		child.stderr = new PassThrough();
		child.stdin = new PassThrough();
		child.kill = () => {};
		child.stdin.on('data', (chunk) => { call.stdin += chunk; });
		child.stdin.on('end', () => {
			call.prompt = JSON.parse(call.stdin).message.content[0].text;
			child.stdout.end(`${JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: reply(call.prompt) } })}\n`);
			setImmediate(() => child.emit('close', 0));
		});
		return child;
	};
	return { spawn, calls };
}

const tools = [
	{ name: 'read', description: 'Read a file.', parameters: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] } },
	{ name: 'pwsh', description: 'Run PowerShell.', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } }
];
const ask = (text) => ({ role: 'user', content: [{ type: 'text', text }] });

test('the bridge is on by default and can be switched off', () => {
	assert.equal(agyToolBridge(), true);
	setAgyToolBridge(false);
	assert.equal(agyToolBridge(), false);
	setAgyToolBridge(true);
	assert.equal(agyToolBridge(), true);
});

test('with tools the prompt opens with the bridge header, no read-only note, and every CLI tool denied', async () => {
	const { spawn, calls } = fakeSpawn();
	const agy = createAgy({ spawn, bin: 'agy', bridgeOf: () => true });
	const result = await agy.run({ model: 'm', messages: [ask('list the repo')], tools, sessionId: 'route-1' });
	const { prompt, settings } = calls[0];
	assert.match(result.bridge.tag, /^dsh_tc_[0-9a-f]{12}$/u);
	assert.deepEqual(result.bridge.tools, ['read', 'pwsh']);
	assert.ok(prompt.startsWith('Tool protocol (DeepSeek Harness bridge)'));
	assert.ok(prompt.includes(`<${result.bridge.tag}>{"name":"TOOL_NAME"`));
	assert.ok(prompt.endsWith('list the repo'));
	assert.doesNotMatch(prompt, /cannot run shell commands/u);
	assert.deepEqual(settings.permissions.allow ?? [], []);
	for (const action of ['read_file', 'read_url', 'write_file', 'command', 'execute_url', 'download_url', 'mcp']) assert.ok(settings.permissions.deny.includes(`${action}(*)`), action);
	assert.ok(agyBridgeReserveBytes('route-1') > 0);
});

test('without the switch, without tools, or for a summary the legacy read-only route is unchanged', async () => {
	for (const [bridgeOn, options] of [[false, { tools }], [true, {}], [true, { tools, purpose: 'compaction' }]]) {
		const { spawn, calls } = fakeSpawn();
		const agy = createAgy({ spawn, bin: 'agy', bridgeOf: () => bridgeOn });
		const result = await agy.run({ model: 'm', messages: [ask('hello')], ...options });
		assert.equal(result.bridge, undefined);
		assert.match(calls[0].prompt, /^Route note: this Antigravity route cannot run shell commands/u);
		assert.deepEqual(calls[0].settings.permissions.allow, ['read_file(*)', 'read_url(*)']);
	}
});

const toolHistory = [
	ask('what is in a.txt?'),
	{ role: 'assistant', content: [{ type: 'text', text: 'Reading it.' }, { type: 'tool-call', id: 'agy_tc_111111111111', name: 'read', arguments: '{"file_path":"a.txt"}' }] },
	{ role: 'tool', toolCallId: 'agy_tc_111111111111', content: [{ type: 'text', text: 'ALPHA CONTENT' }] }
];

test('history keeps tool calls in the bridge format and tool results with their id and name', () => {
	const bridge = { tag: 'dsh_tc_abcdefabcdef' };
	const prompt = buildPrompt({ messages: toolHistory }, bridge);
	assert.ok(prompt.includes('Assistant: Reading it.\n<dsh_tc_abcdefabcdef>{"id":"agy_tc_111111111111","name":"read","arguments":{"file_path":"a.txt"}}</dsh_tc_abcdefabcdef>'), prompt);
	assert.ok(prompt.includes('Tool result: [id=agy_tc_111111111111 name=read]\nALPHA CONTENT'), prompt);
	assert.match(prompt, /call more tools if you still need them/u);
	assert.ok(prompt.indexOf('ALPHA CONTENT') < prompt.lastIndexOf('call more tools'));
});

test('a failed tool and an image inside a tool result are carried as text instead of failing the call', () => {
	const bridge = { tag: 'dsh_tc_abcdefabcdef' };
	const prompt = buildPrompt({ messages: [
		...toolHistory.slice(0, 2),
		{ role: 'tool', toolCallId: 'agy_tc_111111111111', isError: true, content: [{ type: 'text', text: 'ENOENT' }, { type: 'image', mediaType: 'image/png', dataBase64: 'AAAA' }] }
	] }, bridge);
	assert.ok(prompt.includes('Tool result: [id=agy_tc_111111111111 name=read ERROR]\nENOENT'), prompt);
	assert.match(prompt, /\[image omitted/u);
});

test('without the bridge the history renders exactly as before', () => {
	assert.equal(buildPrompt({ messages: toolHistory }), 'User: what is in a.txt?\n\nAssistant: Reading it.\n\nTool result: ALPHA CONTENT\n\nUser: Continue the task from the tool results above and answer the most recent request.');
});

test('the 180 kB guard counts the tool catalog', async () => {
	const bulky = Array.from({ length: 40 }, (_, index) => ({ name: `t${index}`, description: 'd'.repeat(240), parameters: { type: 'object', properties: { v: { type: 'string', description: 'p'.repeat(120) } } } }));
	const history = [ask('x'.repeat(80_000)), { role: 'assistant', content: [{ type: 'text', text: 'y'.repeat(85_000) }] }, ask('current request')];
	// Fits without the catalog...
	const plain = fakeSpawn();
	await createAgy({ spawn: plain.spawn, bin: 'agy', bridgeOf: () => true }).run({ model: 'm', messages: history });
	assert.ok(Buffer.byteLength(plain.calls[0].prompt) < MAX_AGY_PROMPT_BYTES);
	// ...and is refused with it, before anything is spawned.
	const bridged = fakeSpawn();
	await assert.rejects(
		createAgy({ spawn: bridged.spawn, bin: 'agy', bridgeOf: () => true }).run({ model: 'm', messages: history, tools: bulky, sessionId: 'guard-1' }),
		(error) => error.code === AGY_PROMPT_TOO_LARGE
	);
	assert.equal(bridged.calls.length, 0);
	assert.ok(agyBridgeReserveBytes('guard-1') > 10_000);
});

test('the compaction estimate counts the bridge rendering of tool calls and results', () => {
	setAgyToolBridge(true);
	const withBridge = estimateMessageBytes(toolHistory);
	setAgyToolBridge(false);
	const without = estimateMessageBytes(toolHistory);
	setAgyToolBridge(true);
	assert.ok(withBridge > without + 60, `${withBridge} vs ${without}`);
});

// ---- adapter -------------------------------------------------------------

const TAG = 'dsh_tc_0123456789ab';
const adapterWith = (run) => createCliAdapter({ list: async () => [{ id: 'gemini-3-flash', name: 'Gemini 3 Flash' }], run });
const stream = (adapter, extra = {}) => Array.fromAsync(adapter.stream({ provider: 'antigravity', model: 'gemini-3-flash', messages: [ask('go')], tools, ...extra }));

test('bridge calls become DSH tool-call blocks and the step finishes with tool-calls', async () => {
	const adapter = adapterWith(async () => ({
		text: `Checking.\n<${TAG}>{"name":"read","arguments":{"file_path":"a"}}</${TAG}>\n<${TAG}>{"name":"pwsh","arguments":{"command":"ls"}}</${TAG}>`,
		usage: { inputTokens: 10, outputTokens: 5 },
		bridge: { tag: TAG, tools: ['read', 'pwsh'] }
	}));
	const chunks = await stream(adapter);
	const starts = chunks.filter((chunk) => chunk.type === 'block-start');
	assert.deepEqual(starts.map((chunk) => [chunk.index, chunk.blockType]), [[0, 'text'], [1, 'tool-call'], [2, 'tool-call']]);
	const deltas = chunks.filter((chunk) => chunk.type === 'tool-call-delta');
	assert.deepEqual(deltas.map((chunk) => [chunk.index, chunk.name, chunk.argumentsDelta]), [[1, 'read', '{"file_path":"a"}'], [2, 'pwsh', '{"command":"ls"}']]);
	const ends = chunks.filter((chunk) => chunk.type === 'block-end');
	assert.deepEqual(ends[0].block, { type: 'text', text: 'Checking.' });
	assert.equal(ends[1].block.type, 'tool-call');
	assert.equal(ends[1].block.id, deltas[0].id);
	assert.equal(ends[1].block.arguments, '{"file_path":"a"}');
	assert.equal(chunks.find((chunk) => chunk.type === 'usage').usage.inputTokens, 10);
	assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'tool-calls' } });
});

test('a bridged answer without blocks is a normal text answer', async () => {
	const chunks = await stream(adapterWith(async () => ({ text: 'All done.', bridge: { tag: TAG, tools: ['read'] } })));
	assert.equal(chunks.find((chunk) => chunk.type === 'text-delta').text, 'All done.');
	assert.equal(chunks.at(-1).reason.kind, 'stop');
});

test('when every block is invalid the CLI is asked once to fix it', async () => {
	const seen = [];
	const adapter = adapterWith(async (options) => {
		seen.push(options.messages);
		return seen.length === 1
			? { text: `<${TAG}>{"name":"nope","arguments":{}}</${TAG}>`, bridge: { tag: TAG, tools: ['read'] } }
			: { text: `<${TAG}>{"name":"read","arguments":{"file_path":"b"}}</${TAG}>`, bridge: { tag: TAG, tools: ['read'] } };
	});
	const chunks = await stream(adapter);
	assert.equal(seen.length, 2);
	const feedback = seen[1].at(-1).content[0].text;
	assert.match(feedback, /unknown tool "nope"/u);
	assert.equal(seen[1].at(-2).role, 'assistant');
	assert.equal(chunks.at(-1).reason.kind, 'tool-calls');
});

test('a second invalid reply ends as text, never as an empty response', async () => {
	let count = 0;
	const adapter = adapterWith(async () => {
		count += 1;
		return { text: `Trying.\n<${TAG}>{"name":"read","arguments":</${TAG}>`, bridge: { tag: TAG, tools: ['read'] } };
	});
	const chunks = await stream(adapter);
	assert.equal(count, 2);
	assert.match(chunks.find((chunk) => chunk.type === 'text-delta').text, /Trying\.[\s\S]*could not be run/u);
	assert.equal(chunks.at(-1).reason.kind, 'stop');
});

test('invalid blocks next to valid ones are dropped with a visible note', async () => {
	const adapter = adapterWith(async () => ({
		text: `<${TAG}>{"name":"ghost"}</${TAG}><${TAG}>{"name":"read","arguments":{"file_path":"c"}}</${TAG}>`,
		bridge: { tag: TAG, tools: ['read'] }
	}));
	const chunks = await stream(adapter);
	assert.match(chunks.find((chunk) => chunk.type === 'text-delta').text, /unknown tool "ghost"/u);
	assert.equal(chunks.filter((chunk) => chunk.type === 'tool-call-delta').length, 1);
	assert.equal(chunks.at(-1).reason.kind, 'tool-calls');
});
