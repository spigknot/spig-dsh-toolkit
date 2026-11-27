import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { buildPrompt, createAgy, parseModels, classifyFailure, parseUsage } from '../components/subscriptions/lib/antigravity-cli-local.js';

/** Minimal stand-in for a spawned CLI that records its argv and what it was fed on stdin. */
function fakeSpawn(behaviour) {
	const calls = [];
	const spawn = (bin, args, options) => {
		const call = { bin, args, options, stdin: '', settings: undefined };
		// The transport deletes its temp directory on return, so snapshot the policy here.
		const settingsAt = args.indexOf('--settings');
		if (settingsAt !== -1) {
			try {
				call.settings = JSON.parse(readFileSync(args[settingsAt + 1], 'utf8'));
			} catch {}
		}
		calls.push(call);
		const child = new EventEmitter();
		child.stdout = new PassThrough();
		child.stderr = new PassThrough();
		child.stdin = new PassThrough();
		child.stdin.on('data', (chunk) => { call.stdin += chunk; });
		child.kill = () => {};
		setImmediate(() => behaviour({ args, stdout: child.stdout, stderr: child.stderr, child }));
		return child;
	};
	return { spawn, calls };
}

const modelsOutput = [
	'Fetching available models...',
	'gemini-4-hydrogen-medium\tGemini 4 Hydrogen (Medium)',
	'gemini-4-hydrogen-xhigh\tGemini 4 Hydrogen (XHigh)',
	''
].join('\n');

test('parseModels keeps only <slug>\t<label> rows', () => {
	assert.deepEqual(parseModels(modelsOutput), [
		{ id: 'gemini-4-hydrogen-medium', name: 'Gemini 4 Hydrogen (Medium)' },
		{ id: 'gemini-4-hydrogen-xhigh', name: 'Gemini 4 Hydrogen (XHigh)' }
	]);
});

test('buildPrompt sends one user turn verbatim and refuses non-text blocks', () => {
	assert.equal(buildPrompt({ messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] }), 'hi');
	assert.match(buildPrompt({ messages: [
		{ role: 'user', content: [{ type: 'text', text: 'q' }] },
		{ role: 'assistant', content: [{ type: 'text', text: 'a' }] },
		{ role: 'user', content: [{ type: 'text', text: 'q2' }] }
	] }), /^User: q\n\nAssistant: a\n\nUser: q2$/);
	assert.throws(() => buildPrompt({ messages: [{ role: 'user', content: [{ type: 'image', attachment: {} }] }] }), /text-only/u);
});

test('buildPrompt drops reasoning and tool-call blocks so a mid-session switch survives', () => {
	const prompt = buildPrompt({ messages: [
		{ role: 'user', content: [{ type: 'text', text: 'q' }] },
		{ role: 'assistant', content: [{ type: 'reasoning', text: 'private thinking' }, { type: 'tool-call', name: 'pwsh', arguments: '{"command":"ls"}' }, { type: 'text', text: 'a' }] },
		{ role: 'user', content: [{ type: 'reasoning', text: 'more thinking' }, { type: 'text', text: 'q2' }] }
	] });
	assert.equal(prompt, 'User: q\n\nAssistant: a\n\nUser: q2');
	assert.doesNotMatch(prompt, /thinking|ls/u);
});

test('buildPrompt keeps tool-result text and still refuses a nested image', () => {
	const prompt = buildPrompt({ messages: [
		{ role: 'user', content: [{ type: 'text', text: 'q' }] },
		{ role: 'assistant', content: [{ type: 'text', text: 'a' }] },
		{ role: 'tool', content: [{ type: 'tool-result', content: [{ type: 'text', text: 'ok' }] }] },
		{ role: 'user', content: [{ type: 'text', text: 'next' }] }
	] });
	assert.match(prompt, /Tool result: ok\n\nUser: next$/u);
	assert.throws(() => buildPrompt({ messages: [
		{ role: 'tool', content: [{ type: 'tool-result', content: [{ type: 'text', text: 'ok' }, { type: 'image', attachment: {} }] }] }
	] }), /text-only/u);
});

test('with the route fix on, the CLI is called shell-free and the prompt says so', async () => {
	const { spawn, calls } = fakeSpawn(({ stdout, child }) => {
		// `--output-format stream-json` on 1.5.14: one event per line, last one wins.
		stdout.end([
			'{"event":"init","conversation_id":"c1","init":{"model":"gemini-4-hydrogen-medium"}}',
			'{"event":"step_update","step_update":{"step_index":1,"state":"ACTIVE","step_type":"agent_response","text_delta":"OK"}}',
			JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'OK\n', usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6, thinking_tokens: 1 } } }),
			''
		].join('\n'));
		child.emit('close', 0);
	});
	const agy = createAgy({ spawn, bin: 'agy-under-test' });
	const result = await agy.run({ model: 'gemini-4-hydrogen-medium', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] });
	assert.equal(result.text, 'OK\n');
	assert.equal(result.usage.totalTokens, 6);
	assert.equal(result.usage.reasoningTokens, 1);
	const [call] = calls;
	assert.equal(call.bin, 'agy-under-test');
	assert.equal(call.options.shell, false);
	// The prompt rides stdin, never argv: argv has a hard size cap on Windows.
	assert.deepEqual(call.args.slice(0, 4), ['--input-format', 'stream-json', '--output-format', 'stream-json']);
	assert.ok(call.args.includes('gemini-4-hydrogen-medium'));
	assert.ok(!call.args.some((arg) => arg.includes('"hi"')), 'prompt must not appear in argv');
	const turn = JSON.parse(call.stdin.trim());
	assert.equal(turn.event, 'user');
	// The route note comes first, then the request itself.
	const text = turn.message.content[0].text;
	assert.match(text, /^Route note:/u);
	assert.match(text, /\n\nhi$/u);
	// The policy is a file (argv has a size cap), passed by path.
	const settingsPath = call.args[call.args.indexOf('--settings') + 1];
	assert.match(settingsPath, /settings\.json$/u);
	assert.deepEqual(call.settings, {
		permissions: {
			allow: ['read_file(*)', 'read_url(*)'],
			deny: ['write_file(*)', 'command(*)', 'execute_url(*)', 'download_url(*)', 'mcp(*)']
		}
	});
	// Without a workspace the CLI runs in its temp directory and adds nothing.
	assert.ok(!call.args.includes('--add-dir'), 'no workspace, no --add-dir');
	assert.ok(settingsPath.startsWith(call.options.cwd), 'policy lives next to the run cwd');
	assert.match(settingsPath, /settings\.json$/u);
});

test('with the route fix off, every CLI tool is granted and no note is added', async () => {
	const { spawn, calls } = fakeSpawn(({ stdout, child }) => {
		stdout.end('{"event":"result","result":{"status":"SUCCESS","response":"ok"}}\n');
		child.emit('close', 0);
	});
	// The switch is read per call, so the same transport follows a live change.
	let fix = false;
	const agy = createAgy({ spawn, bin: 'agy-under-test', fixOf: () => fix });
	await agy.run({ model: 'gemini-4-hydrogen-medium', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] });
	const [call] = calls;
	// No note: the prompt is exactly the request.
	assert.equal(JSON.parse(call.stdin.trim()).message.content[0].text, 'hi');
	// Every tool granted, and no deny list at all.
	assert.deepEqual(call.settings, { permissions: { allow: ['*'] } });
});

test('the route fix follows the switch without rebuilding the transport', async () => {
	const { spawn, calls } = fakeSpawn(({ stdout, child }) => {
		stdout.end('{"event":"result","result":{"status":"SUCCESS","response":"ok"}}\n');
		child.emit('close', 0);
	});
	let fix = true;
	const agy = createAgy({ spawn, bin: 'agy-under-test', fixOf: () => fix });
	const run = () => agy.run({ model: 'gemini-4-hydrogen-medium', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] });
	await run();
	fix = false;
	await run();
	const [on, off] = calls;
	assert.deepEqual(on.settings.permissions, {
		allow: ['read_file(*)', 'read_url(*)'],
		deny: ['write_file(*)', 'command(*)', 'execute_url(*)', 'download_url(*)', 'mcp(*)']
	});
	assert.match(JSON.parse(on.stdin.trim()).message.content[0].text, /^Route note:/u);
	assert.deepEqual(off.settings, { permissions: { allow: ['*'] } });
	assert.equal(JSON.parse(off.stdin.trim()).message.content[0].text, 'hi');
});

test('a session workspace becomes the CLI cwd and is registered with --add-dir', async () => {
	const { spawn, calls } = fakeSpawn(({ stdout, child }) => {
		stdout.end('{"event":"result","result":{"status":"SUCCESS","response":"ok"}}\n');
		child.emit('close', 0);
	});
	const agy = createAgy({ spawn, bin: 'agy-under-test' });
	await agy.run({ model: 'gemini-4-hydrogen-medium', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], workspaceDir: 'D:\\Projetos\\SIG' });
	const [call] = calls;
	const at = call.args.indexOf('--add-dir');
	assert.notEqual(at, -1);
	assert.equal(call.args[at + 1], 'D:\\Projetos\\SIG');
	assert.equal(call.options.cwd, 'D:\\Projetos\\SIG');
	// The policy file still lives in the temp directory, not in the repo.
	const settingsPath = call.args[call.args.indexOf('--settings') + 1];
	assert.ok(!settingsPath.startsWith('D:\\Projetos\\SIG'), 'policy must not pollute the workspace');
	assert.deepEqual(call.settings, {
		permissions: {
			allow: ['read_file(*)', 'read_url(*)'],
			deny: ['write_file(*)', 'command(*)', 'execute_url(*)', 'download_url(*)', 'mcp(*)']
		}
	});
});

test('a prompt far past the Windows command-line cap is still delivered', async () => {
	// ~4x the ~32 KB argv cap, yet under the route's prompt ceiling.
	const longText = 'x'.repeat(128 * 1024);
	let seen = '';
	const { spawn, calls } = fakeSpawn(({ stdout, child }) => {
		stdout.end('{"event":"result","result":{"status":"SUCCESS","response":"ok"}}\n');
		child.emit('close', 0);
	});
	const agy = createAgy({ spawn, bin: 'agy-under-test' });
	await agy.run({ model: 'gemini-4-hydrogen-medium', messages: [{ role: 'user', content: [{ type: 'text', text: longText }] }] });
	const [call] = calls;
	const argvBytes = call.args.reduce((total, arg) => total + Buffer.byteLength(arg) + 1, 0);
	assert.ok(argvBytes < 8192, `argv stayed small (${argvBytes} bytes)`);
	seen = JSON.parse(call.stdin.trim()).message.content[0].text;
	// The route note prefixes the prompt; the payload itself must survive whole.
	assert.ok(seen.endsWith(longText), 'prompt body delivered intact');
});

test('the quota report becomes one window per bucket, remaining turned into used', () => {
	// Shape captured from `agy -p /usage --output-format json` on 1.5.14.
	const payload = { command: { name: 'usage', data: { groups: [
		{ name: 'Gemini Models', buckets: [
			{ id: 'gemini-weekly', window: 'weekly', remaining_fraction: 0.9678482413291931, reset_time: '2026-11-29T19:31:40Z' },
			{ id: 'gemini-5h', window: '5h', remaining_fraction: 0.9442857503890991, reset_time: '2026-11-23T05:31:40Z' }
		] },
		{ name: 'Claude and GPT models', buckets: [
			{ id: '3p-weekly', window: 'weekly', remaining_fraction: 0.9427, reset_time: '2026-11-29T21:42:20Z' }
		] },
		{ name: 'Unmetered', buckets: [{ id: 'x', window: 'weekly', remaining_fraction: 0.5 }] }
	] } } };
	const windows = parseUsage(payload);
	assert.deepEqual(windows.map((w) => `${w.scope}/${w.kind}`), [
		'Gemini Models/weekly',
		'Gemini Models/session',
		'Claude and GPT models/weekly'
	]);
	assert.ok(Math.abs(windows[0].usedPercent - 3.215175867080689) < 1e-9);
	assert.equal(windows[1].resetsAt, Date.parse('2026-11-23T05:31:40Z'));
	assert.deepEqual(parseUsage({}), []);
});

test('a quota failure surfaces once, as RATE_LIMIT, without another attempt', async () => {
	let attempts = 0;
	const { spawn } = fakeSpawn(({ stderr, child }) => {
		attempts += 1;
		stderr.end('AGY_ERROR: {"short_error":"Resource has been exhausted (e.g. check quota).","status":"RESOURCE_EXHAUSTED","retryable":false}');
		child.emit('close', 1);
	});
	const agy = createAgy({ spawn, bin: 'agy-under-test' });
	await assert.rejects(
		agy.run({ model: 'gemini-4-hydrogen-medium', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] }),
		(error) => error.code === 'RATE_LIMIT' && error.status === 429
	);
	assert.equal(attempts, 1);
});

test('a signed-out CLI is reported as AUTH, not as a model failure', () => {
	assert.equal(classifyFailure('UNAUTHENTICATED: please sign in').code, 'AUTH');
	assert.equal(classifyFailure('boom').code, 'ANTIGRAVITY_CLI');
});

test('listing models runs the CLI once and then serves the cached catalog', async () => {
	let runs = 0;
	const { spawn } = fakeSpawn(({ stdout, child }) => {
		runs += 1;
		stdout.end('gemini-4-hydrogen-medium\tGemini 4 Hydrogen (Medium)\n');
		child.emit('close', 0);
	});
	const agy = createAgy({ spawn, bin: 'agy-under-test' });
	assert.equal((await agy.listModels()).length, 1);
	assert.equal((await agy.listModels()).length, 1);
	assert.equal(runs, 1);
});

test('the CLI version is read once and reported', async () => {
	const { spawn, calls } = fakeSpawn(({ stdout, child }) => {
		stdout.end('1.5.15\n');
		child.emit('close', 0);
	});
	const agy = createAgy({ spawn, bin: 'agy-under-test' });
	assert.equal(await agy.version(), '1.5.15');
	assert.deepEqual(calls[0].args, ['--version']);
});

test('the opt-in journal records what was sent and what came back', async () => {
	const log = join(tmpdir(), `dsh-agy-test-${Date.now()}.log`);
	const { spawn } = fakeSpawn(({ stdout, child }) => {
		stdout.end('{"event":"result","result":{"status":"SUCCESS","response":"resposta de teste"}}\n');
		child.emit('close', 0);
	});
	const prevDebug = process.env.DSH_AGY_DEBUG;
	const prevLog = process.env.DSH_AGY_DEBUG_LOG;
	process.env.DSH_AGY_DEBUG = '1';
	process.env.DSH_AGY_DEBUG_LOG = log;
	try {
		const agy = createAgy({ spawn, bin: 'agy-under-test' });
		await agy.run({ model: 'gemini-4-hydrogen', messages: [{ role: 'user', content: [{ type: 'text', text: 'pedido atual' }] }] });
		const line = JSON.parse(readFileSync(log, 'utf8').trim().split('\n').at(-1));
		assert.equal(line.model, 'gemini-4-hydrogen');
		assert.equal(line.fix, true);
		assert.ok(line.promptBytes > 0);
		assert.match(line.promptTail, /pedido atual$/u);
		assert.equal(line.responseHead, 'resposta de teste');
		assert.ok(line.ms >= 0);
	} finally {
		if (prevDebug === undefined) delete process.env.DSH_AGY_DEBUG;
		else process.env.DSH_AGY_DEBUG = prevDebug;
		if (prevLog === undefined) delete process.env.DSH_AGY_DEBUG_LOG;
		else process.env.DSH_AGY_DEBUG_LOG = prevLog;
		await rm(log, { force: true });
	}
});

test('oversized history raises DSH context overflow without launching the CLI', async () => {
	const { spawn, calls } = fakeSpawn(({ stdout, child }) => {
		stdout.end('{"event":"result","result":{"status":"SUCCESS","response":"stale topic"}}\n');
		child.emit('close', 0);
	});
	const agy = createAgy({ spawn, bin: 'agy-under-test', fixOf: () => false });
	await assert.rejects(agy.run({ model: 'test', messages: [
		{ role: 'user', content: 'q' },
		{ role: 'assistant', content: 'ó'.repeat(100_000) },
		{ role: 'user', content: 'pedido atual' }
	] }), { code: 'ANTIGRAVITY_PROMPT_TOO_LARGE' });
	assert.equal(calls.length, 0);
});

test('the answer is returned as soon as the result arrives, without waiting for agy to exit', async () => {
	// agy 1.5.16 in a git workspace keeps running ~10 minutes after its result.
	let killed = false;
	const { spawn } = fakeSpawn(({ stdout, child }) => {
		child.kill = () => { killed = true; };
		stdout.write('{"event":"init","conversation_id":"c"}\n');
		stdout.write('{"event":"result","result":{"status":"SUCCESS","response":"pronto"}}\n');
		// no end, no close: the process lingers
	});
	const agy = createAgy({ spawn, bin: 'agy-under-test', timeoutMs: 60_000 });
	const started = Date.now();
	const result = await agy.run({ model: 'test', messages: [{ role: 'user', content: 'q' }] });
	assert.equal(result.text, 'pronto');
	assert.ok(Date.now() - started < 5_000);
	assert.equal(killed, true, 'the lingering process is terminated');
});

test('a quota error result is classified as a rate limit, not a generic failure', async () => {
	const { spawn } = fakeSpawn(({ stdout, child }) => {
		child.kill = () => {};
		stdout.write(`${JSON.stringify({ event: 'result', result: { status: 'ERROR', response: '', error: 'transport error (ResourceExhausted, HTTP 429): Individual quota reached. Resets in 107h16m44s.' } })}\n`);
	});
	const agy = createAgy({ spawn, bin: 'agy-under-test' });
	await assert.rejects(agy.run({ model: 'test', messages: [{ role: 'user', content: 'q' }] }), (error) => error.code === 'RATE_LIMIT' && /Individual quota reached/u.test(error.message));
});

test('with the long-prompt guard off the route sends everything, as before', async () => {
	const { spawn, calls } = fakeSpawn(({ stdout, child }) => {
		stdout.end('{"event":"result","result":{"status":"SUCCESS","response":"ok"}}\n');
		child.emit('close', 0);
	});
	const agy = createAgy({ spawn, bin: 'agy-under-test', fixOf: () => false, guardOf: () => false });
	const text = 'x'.repeat(250_000);
	await agy.run({ model: 'test', messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }, { role: 'user', content: text }] });
	assert.equal(calls.length, 1);
	assert.ok(JSON.parse(calls[0].stdin.trim()).message.content[0].text.endsWith(text));
});

test('a prompt exactly at the ceiling is sent whole', async () => {
	const { spawn, calls } = fakeSpawn(({ stdout, child }) => {
		stdout.end('{"event":"result","result":{"status":"SUCCESS","response":"ok"}}\n');
		child.emit('close', 0);
	});
	const agy = createAgy({ spawn, bin: 'agy-under-test', fixOf: () => false });
	const text = 'x'.repeat(180_000 - 2) + 'é';
	assert.equal(Buffer.byteLength(text, 'utf8'), 180_000);
	await agy.run({ model: 'test', messages: [{ role: 'user', content: text }] });
	assert.equal(JSON.parse(calls[0].stdin.trim()).message.content[0].text, text);
});

test('a non-compactable oversized request fails with INVALID_REQUEST before spawn', async () => {
	const { spawn, calls } = fakeSpawn(() => {});
	const agy = createAgy({ spawn, bin: 'agy-under-test', fixOf: () => false });
	await assert.rejects(agy.run({ model: 'test', messages: [
		{ role: 'user', content: 'q' },
		{ role: 'assistant', content: 'a' },
		{ role: 'user', content: 'é'.repeat(90_001) }
	] }), { code: 'INVALID_REQUEST', message: /current request with its instructions alone/u });
	assert.equal(calls.length, 0);
});

test('oversized auxiliary compaction input fails without requesting another compaction', async () => {
	const { spawn, calls } = fakeSpawn(() => {});
	const agy = createAgy({ spawn, bin: 'agy-under-test', fixOf: () => false });
	await assert.rejects(agy.run({ model: 'test', purpose: 'compaction', messages: [
		{ role: 'user', content: 'x'.repeat(180_000) },
		{ role: 'user', content: 'summarize this region' }
	] }), { code: 'INVALID_REQUEST', message: /summariz/u });
	assert.equal(calls.length, 0);
});

test('without the switch the journal stays silent', async () => {
	const log = join(tmpdir(), `dsh-agy-test-off-${Date.now()}.log`);
	const { spawn } = fakeSpawn(({ stdout, child }) => {
		stdout.end('{"event":"result","result":{"status":"SUCCESS","response":"ok"}}\n');
		child.emit('close', 0);
	});
	const prevDebug = process.env.DSH_AGY_DEBUG;
	const prevLog = process.env.DSH_AGY_DEBUG_LOG;
	process.env.DSH_AGY_DEBUG = '0';
	process.env.DSH_AGY_DEBUG_LOG = log;
	try {
		await createAgy({ spawn, bin: 'agy-under-test' }).run({ model: 'gemini-4-hydrogen', messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] });
		assert.equal(existsSync(log), false);
	} finally {
		if (prevDebug === undefined) delete process.env.DSH_AGY_DEBUG;
		else process.env.DSH_AGY_DEBUG = prevDebug;
		if (prevLog === undefined) delete process.env.DSH_AGY_DEBUG_LOG;
		else process.env.DSH_AGY_DEBUG_LOG = prevLog;
	}
});


test('real user text starting with reminder markup is preserved in full', () => {
	const prompt = buildPrompt({ messages: [
		{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '<system-reminder>quoted</system-reminder>' }, { type: 'text', text: 'NEW_REQUEST' }] },
		{ role: 'user', source: { kind: 'runtime-context' }, content: 'live runtime facts' },
		{ role: 'user', source: { kind: 'time-context' }, content: 'sampled time' },
		{ role: 'user', source: { kind: 'model-selection', form: 'notice' }, content: 'route notice' }
	] });
	assert.match(prompt, /<system-reminder>quoted<\/system-reminder>\nNEW_REQUEST$/u);
	// Context admitted with the request stays visible, but ahead of it.
	for (const context of ['live runtime facts', 'sampled time', 'route notice']) {
		assert.ok(prompt.indexOf(context) !== -1 && prompt.indexOf(context) < prompt.indexOf('NEW_REQUEST'), context);
	}
});

test('a system head is labelled as system, not as a user turn', () => {
	const prompt = buildPrompt({ messages: [
		{ role: 'system', source: { kind: 'system-prompt' }, content: 'BE BRIEF' },
		{ role: 'user', source: { kind: 'user' }, content: 'q' }
	] });
	assert.equal(prompt, 'System: BE BRIEF\n\nUser: q');
});

test('a whitespace-only current request does not fall back to an older user message', () => {
	assert.throws(() => buildPrompt({ messages: [
		{ role: 'user', source: { kind: 'user' }, content: 'old question' },
		{ role: 'user', source: { kind: 'user' }, content: '  ' },
		{ role: 'user', source: { kind: 'time-context' }, content: 'sampled time' }
	] }), { code: 'EMPTY_REQUEST' });
});

test('a projected attachment alone remains the actual request', () => {
	const ref = 'Attached file: NEW.md (123 bytes, sha256:12345678)';
	assert.ok(buildPrompt({ messages: [
		{ role: 'user', source: { kind: 'user' }, content: ref },
		{ role: 'user', source: { kind: 'time-context' }, content: 'sampled time' }
	] }).endsWith(ref));
});

test('a typed retry becomes an explicit continuation', () => {
	assert.match(buildPrompt({ messages: [
		{ role: 'user', source: { kind: 'user' }, content: 'request to resume' },
		{ role: 'assistant', content: 'partial answer' },
		{ role: 'user', source: { kind: 'retry' }, content: [] }
	] }), /retry the last request/iu);
});

test('context admitted after the request never takes its place at the end', () => {
	const prompt = buildPrompt({
		messages: [
			{ role: 'user', source: { kind: 'user' }, content: 'relatorio da R38 anexado' },
			{ role: 'assistant', content: 'li o relatorio' },
			{ role: 'user', source: { kind: 'user' }, content: 'gere o prompt da R39' },
			{ role: 'user', source: { kind: 'time-context' }, content: 'Time sampled while preparing turn 59, step 1' },
			{ role: 'user', source: { kind: 'model-selection', form: 'notice' }, content: '[model changed: gemini-4-argon -> gemini-4-hydrogen]' }
		]
	});
	assert.match(prompt, /User: gere o prompt da R39$/u);
	assert.ok(prompt.indexOf('model changed') < prompt.indexOf('gere o prompt da R39'));
});

test('only harness context after the last answer fails closed instead of answering the history', () => {
	// Without a request after the last answer the model would continue an older
	// round; that must be an explicit failure, never a guess.
	assert.throws(
		() => buildPrompt({
			messages: [
				{ role: 'user', source: { kind: 'user' }, content: 'relatorio da R30 anexado' },
				{ role: 'assistant', content: 'parecer da R30' },
				{ role: 'user', source: { kind: 'skill-catalog' }, content: '<available_skills>…</available_skills>' },
				{ role: 'user', source: { kind: 'time-context' }, content: 'Time sampled while preparing turn 59, step 1' },
				{ role: 'user', source: { kind: 'model-selection', form: 'notice' }, content: '[model changed: gemini-4-argon -> gemini-4-neon]' }
			]
		}),
		(error) => error.code === 'EMPTY_REQUEST'
	);
});

test('a lone model-switch notice is not a request', () => {
	assert.throws(
		() => buildPrompt({ messages: [{ role: 'user', source: { kind: 'model-selection', form: 'notice' }, content: '[model changed: a -> b]' }] }),
		(error) => error.code === 'EMPTY_REQUEST'
	);
});

test('tool results after the last answer continue the task instead of failing', () => {
	const prompt = buildPrompt({ messages: [
		{ role: 'user', source: { kind: 'user' }, content: 'list the files' },
		{ role: 'assistant', content: [{ type: 'tool-call', id: 't1', name: 'ls', arguments: '{}' }] },
		{ role: 'tool', content: [{ type: 'tool-result', content: [{ type: 'text', text: 'a.txt' }] }] }
	] });
	assert.match(prompt, /Tool result: a\.txt\n\nUser: Continue the task/u);
});

