import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { ACP_DENIED_ANSWER, createAcpClient } from '../components/subscriptions/lib/antigravity-acp-client.js';

const initResult = { protocolVersion: 1, agentInfo: { name: 'Antigravity ACP Server', version: '1.5.17' } };
const defaultMode = { modes: { currentModeId: 'default' } };
const workspaceDir = path.resolve('fake-workspace');
const contextDir = path.resolve('fake-context');
const stateDir = path.resolve('fake-state');

function fake(t, onRequest, options = {}) {
	assert.equal(typeof createAcpClient, 'function', 'ACP client must export createAcpClient');
	const child = new EventEmitter();
	child.stdin = new PassThrough();
	child.stdout = new PassThrough();
	child.stderr = new PassThrough();
	child.pid = 617;
	let eof = false;
	let kills = 0;
	let invocation;
	const sent = [];
	const receive = (message) => child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
	const reply = ({ id }, result) => receive({ id, result });
	child.stdin.setEncoding('utf8');
	child.stdin.on('data', (chunk) => {
		for (const line of chunk.trimEnd().split('\n')) {
			const message = JSON.parse(line);
			sent.push(message);
			queueMicrotask(() => onRequest?.(message, { receive, reply, child }));
		}
	});
	child.stdin.on('end', () => {
		eof = true;
		if (!options.ignoreEof) child.emit('close', 0);
	});
	child.kill = () => { kills++; child.emit('close', 1); };
	const { ignoreEof, ...clientOptions } = options;
	const client = createAcpClient({ workspaceDir, contextDir, stateDir, bin: 'fake-agy', startupTimeoutMs: 500, turnTimeoutMs: 500, shutdownGraceMs: 20, ...clientOptions, spawn: (...args) => {
		invocation = args;
		return child;
	} });
	t.after(() => client.dispose());
	return { client, child, receive, sent, get invocation() { return invocation; }, get eof() { return eof; }, get kills() { return kills; } };
}

test('handshakes over NDJSON v1 in private cwd with explicit sandbox flags and no client capabilities', async (t) => {
	const fx = fake(t, (request, io) => {
		if (request.method === 'initialize') io.reply(request, initResult);
	});
	assert.equal(fx.client.alive, false);
	await fx.client.initialize();
	assert.equal(fx.client.alive, true);
	assert.deepEqual(fx.invocation, ['fake-agy', [
		'acp', '--stdio', '--sandbox', `--gemini-dir=${stateDir}`, '--cli_dir_name=spig-acp', '--include-default-customizations=false',
		'--add-dir', workspaceDir, '--add-dir', contextDir,
	], { cwd: contextDir, stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true }]);
	assert.deepEqual(fx.sent.map(({ id, ...request }) => request), [{ jsonrpc: '2.0', method: 'initialize', params: { protocolVersion: 1, clientCapabilities: {} } }]);
	await fx.client.dispose();
	assert.equal(fx.client.alive, false);
	assert.equal(fx.eof, true);
	assert.equal(fx.kills, 0);
});

test('accepts verified 1.x CLI versions >= 1.5.17 and rejects older, major-bumped, or malformed versions', async (t) => {
	for (const version of ['1.5.17', '1.5.18', '1.6.0', '1.5.18-beta.1']) {
		const fx = fake(t, (request, io) => io.reply(request, { ...initResult, agentInfo: { ...initResult.agentInfo, version } }));
		await fx.client.initialize();
		assert.equal(fx.client.alive, true, `expected ${version} to be accepted`);
		await fx.client.dispose();
	}
	for (const version of ['1.5.16', '1.4.99', '2.0.0', '0.9.0', '', undefined]) {
		const fx = fake(t, (request, io) => io.reply(request, { ...initResult, agentInfo: { ...initResult.agentInfo, version } }));
		await assert.rejects(fx.client.initialize(), { code: 'ACP_TRANSPORT' }, `expected ${String(version)} to be rejected`);
		assert.equal(fx.client.alive, false);
	}
});

test('warns on accepted-but-unverified CLI versions and stays silent on verified ones', async (t) => {
	for (const version of ['1.5.17', '1.5.18']) {
		const warnings = [];
		const fx = fake(t, (request, io) => io.reply(request, { ...initResult, agentInfo: { ...initResult.agentInfo, version } }), { onWarn: (m) => warnings.push(m) });
		await fx.client.initialize();
		assert.deepEqual(warnings, [], `expected no warning for verified ${version}`);
		await fx.client.dispose();
	}
	const warnings = [];
	const fx = fake(t, (request, io) => io.reply(request, { ...initResult, agentInfo: { ...initResult.agentInfo, version: '1.6.0' } }), { onWarn: (m) => warnings.push(m) });
	await fx.client.initialize();
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /1\.6\.0.*not yet verified/u);
	await fx.client.dispose();
	const rejectedWarnings = [];
	const rejected = fake(t, (request, io) => io.reply(request, { ...initResult, agentInfo: { ...initResult.agentInfo, version: '1.5.16' } }), { onWarn: (m) => rejectedWarnings.push(m) });
	await assert.rejects(rejected.client.initialize(), { code: 'ACP_TRANSPORT' });
	assert.deepEqual(rejectedWarnings, [], 'rejected versions warn nothing: the transport error itself is the signal');
});

function withInit(handler) {
	return (request, io) => request.method === 'initialize' ? io.reply(request, initResult) : handler(request, io);
}

function update(io, sessionId, sessionUpdate, fields) {
	io.receive({ method: 'session/update', params: { sessionId, update: { sessionUpdate, ...fields } } });
}

test('creates a session in the private cwd and switches the exact model', async (t) => {
	const fx = fake(t, withInit((request, io) => {
		if (request.method === 'session/new') io.reply(request, { sessionId: 'created', ...defaultMode });
		if (request.method === 'session/set_model') io.reply(request, {});
	}));
	await fx.client.initialize();
	assert.equal(await fx.client.newSession({ model: 'model-id' }), 'created');
	assert.deepEqual(fx.sent.slice(1).map(({ method, params }) => ({ method, params })), [
		{ method: 'session/new', params: { cwd: contextDir, mcpServers: [] } },
		{ method: 'session/set_model', params: { sessionId: 'created', modelId: 'model-id' } },
	]);
});

test('loads only the requested session and maps only -32002 to missing', async (t) => {
	const fx = fake(t, withInit((request, io) => {
		if (request.method === 'session/set_model') return io.reply(request, {});
		assert.equal(request.method, 'session/load');
		assert.deepEqual(request.params, { sessionId: request.params.sessionId, cwd: contextDir, mcpServers: [] });
		if (request.params.sessionId === 'missing') return io.receive({ id: request.id, error: { code: -32002, message: 'not found' } });
		if (request.params.sessionId === 'auth') return io.receive({ id: request.id, error: { code: 401, message: 'UNAUTHENTICATED' } });
		update(io, 'loaded', 'user_message_chunk', { content: { type: 'text', text: 'past user' } });
		update(io, 'loaded', 'agent_message_chunk', { content: { type: 'text', text: 'past agent' } });
		io.reply(request, defaultMode);
	}));
	await fx.client.initialize();
	assert.equal(await fx.client.loadSession({ sessionId: 'loaded', model: 'new-model' }), true);
	assert.deepEqual(fx.sent.at(-1).params, { sessionId: 'loaded', modelId: 'new-model' });
	assert.equal(await fx.client.loadSession({ sessionId: 'missing', model: 'unused' }), false);
	assert.equal(fx.sent.at(-1).method, 'session/load');
	await assert.rejects(fx.client.loadSession({ sessionId: 'auth' }), { code: 'AUTH' });
});

for (const mode of ['plan', undefined]) {
	for (const method of ['new', 'load']) {
		test(`${method} session fails closed for mode ${String(mode)}`, async (t) => {
			const fx = fake(t, withInit((request, io) => io.reply(request, { sessionId: 's', modes: { currentModeId: mode } })));
			await fx.client.initialize();
			await assert.rejects(method === 'new' ? fx.client.newSession({ model: 'm' }) : fx.client.loadSession({ sessionId: 's', model: 'm' }), { code: 'ACP_TRANSPORT' });
			assert.equal(fx.client.alive, false);
			assert.equal(fx.sent.length, 2);
		});
	}
}

function withSession(handler) {
	return withInit((request, io) => {
		if (request.method === 'session/new') return io.reply(request, { sessionId: 's', ...defaultMode });
		return handler(request, io);
	});
}

async function collect(stream) {
	const chunks = [];
	for await (const chunk of stream) chunks.push(chunk);
	return chunks;
}

test('streams split NDJSON text only for the active prompt and commits usage from its result', async (t) => {
	let finish;
	const fx = fake(t, withSession((request, io) => {
		assert.equal(request.method, 'session/prompt');
		assert.deepEqual(request.params, { sessionId: 's', prompt: [{ type: 'text', text: 'question' }] });
		update(io, 'different', 'agent_message_chunk', { content: { type: 'text', text: 'unrelated' } });
		update(io, 's', 'user_message_chunk', { content: { type: 'text', text: 'replay' } });
		update(io, 's', 'usage_update', { used: 3, size: 9 });
		io.child.stdout.write('Antigravity diagnostic line (not JSON)\r\n');
		const msg = Buffer.from(`${JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'olá' } } } })}\r\n`);
		const split = msg.indexOf(Buffer.from('á')) + 1;
		io.child.stdout.write(msg.subarray(0, split));
		io.child.stdout.write(msg.subarray(split));
		finish = () => {
			update(io, 's', 'agent_message_chunk', { content: { type: 'text', text: ' mundo' } });
			io.reply(request, { stopReason: 'end_turn', usage: { inputTokens: 11, outputTokens: 5, cachedReadTokens: 4, cachedWriteTokens: 2, thoughtTokens: 3, totalTokens: 16 } });
		};
	}));
	await fx.client.initialize();
	await fx.client.newSession();
	const stream = fx.client.prompt({ sessionId: 's', text: 'question' })[Symbol.asyncIterator]();
	assert.deepEqual(await stream.next(), { done: false, value: { type: 'block-start', index: 0, blockType: 'text' } });
	assert.deepEqual(await stream.next(), { done: false, value: { type: 'text-delta', index: 0, text: 'olá' } });
	finish();
	assert.deepEqual(await collect(stream), [
		{ type: 'text-delta', index: 0, text: ' mundo' },
		{ type: 'block-end', index: 0, block: { type: 'text', text: 'olá mundo' } },
		{ type: 'usage', usage: { inputTokens: 11, outputTokens: 5, cacheReadTokens: 4, cacheWriteTokens: 2, reasoningTokens: 3, totalTokens: 16 } },
		{ type: 'finish', reason: { kind: 'stop' } },
	]);
	assert.equal(fx.client.alive, true);
});

test('maps ACP thoughts and text to separate DSH blocks and propagates max_tokens', async (t) => {
	const fx = fake(t, withSession((request, io) => {
		update(io, 's', 'agent_thought_chunk', { content: { type: 'text', text: 'think' } });
		update(io, 's', 'agent_message_chunk', { content: { type: 'text', text: 'answer' } });
		io.reply(request, { stopReason: 'max_tokens' });
	}));
	await fx.client.initialize();
	await fx.client.newSession();
	assert.deepEqual(await collect(fx.client.prompt({ sessionId: 's', text: 'question' })), [
		{ type: 'block-start', index: 0, blockType: 'reasoning' },
		{ type: 'reasoning-delta', index: 0, text: 'think' },
		{ type: 'block-end', index: 0, block: { type: 'reasoning', text: 'think' } },
		{ type: 'block-start', index: 1, blockType: 'text' },
		{ type: 'text-delta', index: 1, text: 'answer' },
		{ type: 'block-end', index: 1, block: { type: 'text', text: 'answer' } },
		{ type: 'finish', reason: { kind: 'max-tokens' } },
	]);
});

test('empty prompt completion throws EMPTY_RESPONSE without leaking usage or whitespace content', async (t) => {
	const fx = fake(t, withSession((request, io) => {
		update(io, 's', 'agent_message_chunk', { content: { type: 'text', text: '  ' } });
		io.reply(request, { stopReason: 'end_turn', usage: { inputTokens: 11, outputTokens: 0 } });
	}));
	await fx.client.initialize();
	await fx.client.newSession();
	const stream = fx.client.prompt({ sessionId: 's', text: 'question' })[Symbol.asyncIterator]();
	await assert.rejects(stream.next(), { code: 'EMPTY_RESPONSE' });
});

function readCall(target) {
	return { name: 'read_file', kind: 'read', rawInput: { Path: target }, args: { Path: target }, locations: [{ path: target }], url: 'not inspected' };
}
const permissionOptions = [
	{ kind: 'allow_always', optionId: 'unacceptable' }, { kind: 'allow_once', optionId: 'yes' }, { kind: 'reject_once', optionId: 'no' },
];

test('permission callbacks allow only coherent in-root real files, never paths into private state', async (t) => {
	const clean = path.join(workspaceDir, 'readme.md');
	const archive = path.join(contextDir, 'context.txt');
	const outside = path.resolve('fake-workspace-sibling', 'escape.txt');
	const privateState = path.join(workspaceDir, 'private-state');
	const stateFile = path.join(privateState, 'settings.json');
	const escaped = path.join(workspaceDir, 'junction', 'escape.txt');
	const aliasState = path.join(workspaceDir, 'alias', 'settings.json');
	const cases = [
		[readCall(clean), 'yes'], [readCall(archive), 'yes'], [readCall(outside), 'no'], [readCall(escaped), 'no'],
		[readCall(stateFile), 'no'], [readCall(aliasState), 'no'],
		[readCall(`${clean}:stream`), 'no'], [readCall('\\\\server\\share\\file'), 'no'], [readCall('\\\\?\\C:\\path\\file'), 'no'],
		[readCall(path.join(workspaceDir, 'NUL.txt')), 'no'], [readCall(path.join(workspaceDir, 'ALIAS~1.txt')), 'no'],
		[readCall(`${workspaceDir}${path.sep}..${path.sep}file`), 'no'], [readCall(`${clean}.`), 'no'],
		[{ ...readCall(clean), name: 'write_file' }, 'no'], [{ ...readCall(clean), kind: 'edit' }, 'no'],
		[{ ...readCall(clean), rawInput: undefined }, 'no'], [{ ...readCall(clean), args: { Path: outside } }, 'no'],
		[{ ...readCall(clean), locations: [{ path: clean }, { path: outside }] }, 'no'],
	];
	let replyToPrompt;
	let responses = 0;
	const fx = fake(t, withSession((request, io) => {
		if (request.method === 'session/prompt') {
			replyToPrompt = () => io.reply(request, { usage: { inputTokens: 7, outputTokens: 0 } });
			io.receive({ method: 'fs/read_text_file', id: 'fs', params: { path: clean } });
			cases.forEach(([toolCall], id) => io.receive({ id: `ask-${id}`, method: 'session/request_permission', params: { sessionId: 's', toolCall, options: permissionOptions } }));
		} else if (++responses === cases.length + 1) replyToPrompt();
	}), {
		stateDir: privateState,
		realpath: async (file) => file === escaped ? outside : file === aliasState ? stateFile : file,
		stat: async () => ({ isFile: () => true }),
	});
	await fx.client.initialize();
	await fx.client.newSession();
	const chunks = await collect(fx.client.prompt({ sessionId: 's', text: 'question' }));
	assert.deepEqual(fx.sent.find(m => m.id === 'fs').error.code, -32601);
	assert.deepEqual(cases.map((_, id) => fx.sent.find(m => m.id === `ask-${id}`).result.outcome.optionId), cases.map(([, expected]) => expected));
	assert.equal(ACP_DENIED_ANSWER, 'No text response: Antigravity ACP allows only reads.');
	assert.deepEqual(chunks[1], { type: 'text-delta', index: 0, text: ACP_DENIED_ANSWER });
});

test('denyNativeTools rejects even coherent in-root read_file calls so bridged turns stay on DSH tools', async (t) => {
	const workspaceDir = path.resolve('fake-workspace');
	const clean = path.join(workspaceDir, 'notes.md');
	let finish;
	const fx = fake(t, withSession((request, io) => {
		if (request.method === 'session/prompt') {
			finish = () => io.reply(request, {});
			io.receive({ id: 'ask-read', method: 'session/request_permission', params: { sessionId: 's', toolCall: readCall(clean), options: permissionOptions } });
		} else finish();
	}), {
		workspaceDir,
		denyNativeTools: true,
		realpath: async (file) => file,
		stat: async () => ({ isFile: () => true }),
	});
	await fx.client.initialize();
	await fx.client.newSession();
	const chunks = await collect(fx.client.prompt({ sessionId: 's', text: 'read notes.md' }));
	assert.equal(fx.sent.find(m => m.id === 'ask-read').result.outcome.optionId, 'no');
	assert.equal(chunks.find(c => c.type === 'text-delta')?.text, ACP_DENIED_ANSWER);
});

test('denies a permission without a reject_once option using cancelled', async (t) => {
	let finish;
	const fx = fake(t, withSession((request, io) => {
		if (request.method === 'session/prompt') {
			finish = () => io.reply(request, {});
			io.receive({ id: 'ask', method: 'session/request_permission', params: { sessionId: 's', toolCall: { name: 'run_command', kind: 'execute' }, options: [{ kind: 'reject_always', optionId: 'permanent' }] } });
		} else finish();
	}));
	await fx.client.initialize();
	await fx.client.newSession();
	await collect(fx.client.prompt({ sessionId: 's', text: 'question' }));
	assert.deepEqual(fx.sent.at(-1).result, { outcome: { outcome: 'cancelled' } });
});

for (const mode of ['return', 'abort', 'timeout', 'dispose']) {
	test(`${mode} cancels the active ACP prompt before closing stdin and forcing the process tree`, async (t) => {
		const killed = [];
		const fx = fake(t, withSession((request, io) => {
			if (request.method === 'session/prompt') update(io, 's', 'agent_message_chunk', { content: { type: 'text', text: 'partial' } });
		}), { turnTimeoutMs: 45, ignoreEof: true, platform: 'win32', killTree(child) { killed.push(child.pid); child.kill(); } });
		const controller = new AbortController();
		await fx.client.initialize();
		await fx.client.newSession();
		const stream = fx.client.prompt({ sessionId: 's', text: 'question', signal: controller.signal })[Symbol.asyncIterator]();
		await stream.next();
		if (mode === 'return') await stream.return();
		else {
			await stream.next();
			const next = stream.next();
			if (mode === 'abort') controller.abort();
			if (mode === 'dispose') void fx.client.dispose();
			await assert.rejects(next, { code: mode === 'abort' ? 'ABORTED' : mode === 'timeout' ? 'TIMEOUT' : 'ACP_TRANSPORT' });
		}
		assert.equal(fx.client.alive, false);
		await fx.client.dispose();
		assert.deepEqual(killed, [fx.child.pid]);
		assert.equal(fx.eof, true);
		assert.deepEqual(fx.sent.filter(m => m.method === 'session/cancel'), [{ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: 's' } }]);
	});
}

test('prompt RPC result classification preserves quota and auth without synthetic text', async (t) => {
	const fx = fake(t, withSession((request, io) => {
		io.receive({ id: request.id, error: { code: request.params.prompt[0].text === 'quota' ? 429 : 401, message: 'RPC error' } });
	}));
	await fx.client.initialize();
	await fx.client.newSession();
	for (const [text, code] of [['quota', 'RATE_LIMIT'], ['auth', 'AUTH']]) {
		await assert.rejects(collect(fx.client.prompt({ sessionId: 's', text })), { code });
	}
});

test('prompt progress keeps the idle timeout alive; silence and the total cap still time out with a diagnostic', async (t) => {
	// Regression: a long model step was cut at a fixed 180 s even while working.
	let tick;
	const fx = fake(t, withSession((request, io) => {
		if (request.method !== 'session/prompt') return;
		let n = 0;
		tick = setInterval(() => {
			n += 1;
			update(io, 's', 'agent_thought_chunk', { content: { type: 'text', text: `t${n}` } });
			if (n === 6) { clearInterval(tick); update(io, 's', 'agent_message_chunk', { content: { type: 'text', text: 'done' } }); io.reply(request, { stopReason: 'end_turn' }); }
		}, 30);
	}), { turnTimeoutMs: 80 });
	t.after(() => clearInterval(tick));
	await fx.client.initialize();
	await fx.client.newSession();
	const chunks = await collect(fx.client.prompt({ sessionId: 's', text: 'question' }));
	assert.equal(chunks.at(-1).type, 'finish', 'six 30 ms updates outlived an 80 ms idle limit');

	const silent = fake(t, withSession(() => {}), { turnTimeoutMs: 60, ignoreEof: true });
	await silent.client.initialize();
	await silent.client.newSession();
	await assert.rejects(collect(silent.client.prompt({ sessionId: 's', text: 'question' })), (error) => {
		assert.equal(error.code, 'TIMEOUT');
		assert.match(error.acpDiagnostic, /^session\/prompt idle timeout; 0 update\(s\)/u);
		return true;
	});

	let keepAlive;
	const capped = fake(t, withSession((request, io) => {
		if (request.method === 'session/prompt') keepAlive = setInterval(() => update(io, 's', 'agent_thought_chunk', { content: { type: 'text', text: '.' } }), 20);
	}), { turnTimeoutMs: 80, turnMaxMs: 150, ignoreEof: true });
	t.after(() => clearInterval(keepAlive));
	await capped.client.initialize();
	await capped.client.newSession();
	await assert.rejects(collect(capped.client.prompt({ sessionId: 's', text: 'question' })), (error) => {
		assert.equal(error.code, 'TIMEOUT');
		assert.match(error.acpDiagnostic, /total timeout/u);
		return true;
	});
});

test('iterator return cancels even when a next call is still waiting for provider text', async (t) => {
	let entered;
	const started = new Promise(resolve => { entered = resolve; });
	const fx = fake(t, withSession((request) => {
		if (request.method === 'session/prompt') entered();
	}), { turnTimeoutMs: 100 });
	await fx.client.initialize();
	await fx.client.newSession();
	const stream = fx.client.prompt({ sessionId: 's', text: 'question' })[Symbol.asyncIterator]();
	const next = assert.rejects(stream.next(), { code: 'ABORTED' });
	await started;
	assert.equal((await stream.return()).done, true);
	await next;
	assert.equal(fx.sent.at(-1).method, 'session/cancel');
});

test('ignores notifications arriving after the prompt RPC result in the same stdout chunk', async (t) => {
	const fx = fake(t, withSession((request, io) => {
		const messages = [
			{ id: request.id, result: { usage: { inputTokens: 1, outputTokens: 1 } } },
			{ method: 'session/update', params: { sessionId: 's', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'late text' } } } },
		];
		io.child.stdout.write(messages.map(message => JSON.stringify({ jsonrpc: '2.0', ...message })).join('\n') + '\n');
	}));
	await fx.client.initialize();
	await fx.client.newSession();
	await assert.rejects(collect(fx.client.prompt({ sessionId: 's', text: 'question' })), { code: 'EMPTY_RESPONSE' });
});

test('unexpected default-mode changes during a turn close the connection without text', async (t) => {
	const fx = fake(t, withSession((request, io) => {
		update(io, 's', 'current_mode_update', { currentModeId: 'plan' });
		update(io, 's', 'agent_message_chunk', { content: { type: 'text', text: 'not accepted' } });
		io.reply(request, {});
	}));
	await fx.client.initialize();
	await fx.client.newSession();
	await assert.rejects(fx.client.prompt({ sessionId: 's', text: 'question' }).next(), { code: 'ACP_TRANSPORT' });
	assert.equal(fx.client.alive, false);
});

test('opens an archive-only client when the workspace is absent', async (t) => {
	const fx = fake(t, withInit(() => {}), { workspaceDir: null });
	await fx.client.initialize();
	assert.deepEqual(fx.invocation[1].slice(6), ['--add-dir', contextDir]);
});

test('partially consumed prompt still disposes its client when an RPC result was already buffered', async (t) => {
	const fx = fake(t, withSession((request, io) => {
		update(io, 's', 'agent_message_chunk', { content: { type: 'text', text: 'buffered answer' } });
		io.reply(request, {});
	}));
	await fx.client.initialize();
	await fx.client.newSession();
	for await (const _chunk of fx.client.prompt({ sessionId: 's', text: 'question' })) break;
	assert.equal(fx.client.alive, false);
	assert.equal(fx.eof, true);
});

test('abort does not expose queued text after a block-start already yielded', async (t) => {
	const fx = fake(t, withSession((request, io) => {
		update(io, 's', 'agent_message_chunk', { content: { type: 'text', text: 'buffered content' } });
	}));
	const controller = new AbortController();
	await fx.client.initialize();
	await fx.client.newSession();
	const stream = fx.client.prompt({ sessionId: 's', text: 'question', signal: controller.signal });
	await stream.next();
	controller.abort();
	await assert.rejects(stream.next(), { code: 'ABORTED' });
});

test('load without matching user and assistant text replay returns false without model change', async (t) => {
	const fx = fake(t, withInit((request, io) => {
		if (request.method === 'session/load') {
			update(io, 's', 'user_message_chunk', { content: { type: 'text', text: 'old user' } });
			update(io, 'different', 'agent_message_chunk', { content: { type: 'text', text: 'wrong session' } });
			io.reply(request, defaultMode);
		} else io.reply(request, {});
	}));
	await fx.client.initialize();
	assert.equal(await fx.client.loadSession({ sessionId: 's', model: 'm' }), false);
	assert.equal(fx.sent.at(-1).method, 'session/load');
});

test('mode changes during model selection fail closed before the session becomes usable', async (t) => {
	const fx = fake(t, withSession((request, io) => {
		update(io, 's', 'current_mode_update', { currentModeId: 'plan' });
		io.reply(request, {});
	}));
	await fx.client.initialize();
	await assert.rejects(fx.client.newSession({ model: 'm' }), { code: 'ACP_TRANSPORT' });
	assert.equal(fx.client.alive, false);
});
