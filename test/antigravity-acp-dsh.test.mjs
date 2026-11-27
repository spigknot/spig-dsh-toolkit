/** Real installed DSH agent/session/compaction with offline ACP and stream-json peers. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createCliAdapter, streamCliResult } from '../components/subscriptions/lib/antigravity-cli-adapter.js';
import { createAcpTransport } from '../components/subscriptions/lib/antigravity-acp-transport.js';
import { AgyCliError, createAgy, MAX_AGY_PROMPT_BYTES } from '../components/subscriptions/lib/antigravity-cli-local.js';
import { installAgyOverflowRecovery } from '../components/subscriptions/lib/antigravity-cli-recovery.js';

const packages = [
	'llm', 'agent', 'tools', 'system-prompt', 'session-projection', 'session', 'token-meter',
	'tool-executor-native', 'agent-loop', 'compaction-basic'
];
const runtime = process.env.DSH_INSTALL_DIR;
const needsElectron = runtime?.includes('.asar') && !process.versions.electron;
const requireDsh = runtime ? createRequire(join(runtime, 'package.json')) : createRequire(import.meta.url);
const dsh = (name) => requireDsh(`@deepseek-ai/dsh-${name}`);
const model = 'gemini-4-hydrogen-low';
const factsIn = (text) => [...new Set(text.match(/FACT=[a-z0-9-]+/gu) ?? [])];
const messageText = (message) => typeof message?.content === 'string' ? message.content : message?.content.map(block => block.text ?? '').join('');
const lastLine = (text) => text.split('\n').at(-1).replace(/^User: /u, '');

function missingPackage() {
	for (const name of ['@deepseek-ai/cordis', ...packages.map(name => `@deepseek-ai/dsh-${name}`)]) {
		try { requireDsh.resolve(name); }
		catch (error) { if (error.code === 'MODULE_NOT_FOUND') return name; throw error; }
	}
}

function* chunks(text) {
	yield { type: 'block-start', index: 0, blockType: 'text' };
	const split = Math.ceil(text.length / 2);
	yield { type: 'text-delta', index: 0, text: text.slice(0, split) };
	yield { type: 'text-delta', index: 0, text: text.slice(split) };
	yield { type: 'block-end', index: 0, block: { type: 'text', text } };
	yield { type: 'finish', reason: { kind: 'stop' } };
}

async function fixture(t, { recovery = false } = {}) {
	const { Context } = requireDsh('@deepseek-ai/cordis');
	const { LlmAdapter, LlmError, createUserMessage } = dsh('llm');
	const ctx = new Context();
	const root = await mkdtemp(join(tmpdir(), 'dsh-acp-integration-'));
	const fibers = [];
	const warnings = [], cli = [], fallback = [], failures = [], acp = [], clients = [], calls = [];
	let mode = 'acp', seeding = false;
	let answerAcp = async ({ text }) => `ACP: ${lastLine(text)}`;
	const { run } = createAgy({
		bin: 'fixture-agy', guardOf: () => true, fixOf: () => true,
		spawn(bin, args) {
			assert.equal(bin, 'fixture-agy');
			assert.deepEqual(args.slice(0, 4), ['--input-format', 'stream-json', '--output-format', 'stream-json']);
			const child = new EventEmitter();
			child.stdout = new PassThrough();
			child.stderr = new PassThrough();
			child.stdin = new PassThrough();
			child.kill = () => {};
			const buffers = [];
			child.stdin.on('data', chunk => buffers.push(chunk));
			child.stdin.on('end', () => {
				const [{ text }] = JSON.parse(Buffer.concat(buffers).toString('utf8')).message.content;
				cli.push(text);
				const response = text.includes('acting as a compaction engine')
					? `## Primary Request and Intent\n- ${factsIn(text).join(' ')}`
					: `CLI: ${lastLine(text)}`;
				child.stdout.end(`${JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response } })}\n`);
				setImmediate(() => child.emit('close', 0));
			});
			return child;
		}
	});
	const transport = createAcpTransport({
		root, modeOf: () => mode, onWarn: message => warnings.push(message),
		fallback: async function* (options) {
			fallback.push(options);
			yield* streamCliResult(run, options);
		},
		clientFactory({ contextDir }) {
			let alive = true;
			const sessionId = `fixture-agy-${clients.length + 1}`;
			const client = {
				get alive() { return alive; },
				async initialize() {},
				async newSession() { return sessionId; },
				async loadSession() { return false; },
				async *prompt({ sessionId, text }) {
					const prompt = { sessionId, text, contextDir };
					acp.push(prompt);
					yield* chunks(await answerAcp(prompt));
				},
				dispose() { alive = false; }
			};
			clients.push(client);
			return client;
		}
	});
	t.after(async () => {
		await transport.disposeAll();
		try { for (const fiber of fibers.reverse()) await fiber.dispose(); }
		finally { await rm(root, { recursive: true, force: true }); }
	});
	for (const name of packages) {
		const plugin = dsh(name);
		const fiber = ctx.plugin(plugin.default ?? plugin, name === 'compaction-basic' ? { auto: false } : undefined);
		fibers.push(fiber);
		await fiber;
	}
	ctx.llm.registerAdapter(['antigravity'], Object.assign(new LlmAdapter(), createCliAdapter({
		list: async () => [{ id: model, name: 'Fixture (Low)' }],
		stream: async function* (options) {
			// Seed via the real agent loop without creating an ACP session first.
			if (seeding) { yield* chunks('Seed recorded.'); return; }
			calls.push(options);
			try { yield* transport.stream(options); }
			catch (cause) {
				options.signal?.throwIfAborted();
				failures.push(cause);
				throw new LlmError(cause.message, cause.code ?? 'ANTIGRAVITY_CLI');
			}
		},
		error: (message, code) => new LlmError(message, code)
	})));
	if (recovery) installAgyOverflowRecovery(ctx, { onWarn: message => warnings.push(message) });
	const agent = await ctx.agentLoop.create('fixture-ACP', { provider: 'antigravity', model });
	const messages = () => agent.session.deriveMessages();
	async function turn(text) {
		let unlisten;
		const ended = new Promise(resolve => {
			unlisten = ctx.on('agent/status', ({ agent: owner, status }) => {
				if (owner === agent && status === 'idle') resolve();
			});
		});
		const timer = setTimeout(() => agent.cancel({ kind: 'disposed' }), 20_000);
		try {
			agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }));
			await ended;
		} finally { clearTimeout(timer); unlisten(); }
		return agent.session.snapshotEvents(0).findLast(event => event.type === 'turn/end')?.data.reason;
	}
	async function completed(text) {
		const reason = await turn(text);
		assert.equal(reason?.kind, 'completed', `${JSON.stringify(reason)}; warnings=${warnings.join(' | ')}`);
		const reply = messages().at(-1);
		assert.equal(reply?.role, 'assistant');
		return messageText(reply);
	}
	return {
		ctx, agent, messages, acp, cli, fallback, clients, warnings, calls, failures, turn, completed,
		setMode: value => { mode = value; }, setAnswer: handler => { answerAcp = handler; },
		async seed(inputs) {
			seeding = true;
			try { for (const text of inputs) await completed(text); }
			finally { seeding = false; }
		}
	};
}

async function readArchivedTurn({ text, contextDir }) {
	const path = /^.*Archive: (.+\.md)$/mu.exec(text)?.[1];
	assert.ok(path && isAbsolute(path), 'ACP supplied an absolute archive pointer');
	assert.equal(dirname(path), contextDir);
	assert.match(text, /read_file.*StartLine.*EndLine/u);
	const lines = (await readFile(path, 'utf8')).split('\n');
	const index = lines.slice(0, 16).join('\n');
	const [, first, last] = /- Turn 1: lines (\d+)-(\d+)/u.exec(index) ?? [];
	assert.ok(+first > 1 && +last >= +first, 'the first turn can be located via the archive index');
	return lines.slice(+first - 1, +last).join('\n');
}

if (needsElectron && process.env.DSH_NODE_EXECUTABLE) {
	test('DSH ACP integration (re-run under the DSH runtime)', () => {
		const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
		delete env.NODE_TEST_CONTEXT;
		const result = spawnSync(process.env.DSH_NODE_EXECUTABLE, ['--test', fileURLToPath(import.meta.url)], {
			env, encoding: 'utf8', timeout: 90_000, windowsHide: true
		});
		if (result.error) throw result.error;
		assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
	});
} else {
	const missing = missingPackage();
	const options = { skip: missing && `requires installed DSH packages (missing ${missing})`, timeout: 30_000 };

	test('first ACP turn with >500 KB of DSH history reads the archive; next turn sends only the delta', options, async t => {
		const f = await fixture(t);
		const historicalFact = 'FACT=cobalt-river-7729';
		const seeds = Array.from({ length: 6 }, (_, index) =>
			`Seed ${index + 1}${index === 0 ? ` ${historicalFact}` : ''}\n${'registro detalhado de teste ó.\n'.repeat(2_850)}`);
		assert.ok(seeds.reduce((bytes, text) => bytes + Buffer.byteLength(text), 0) > 500_000);
		await f.seed(seeds);
		const first = 'CURRENT=ivory-kite-1349';
		const next = 'NEXT=jade-door-5812';
		const remembered = new Map();
		f.setAnswer(async prompt => {
			if (prompt.text.includes(first)) {
				assert.doesNotMatch(prompt.text, /FACT=cobalt-river-7729/u);
				remembered.set(prompt.sessionId, factsIn(await readArchivedTurn(prompt)).join(' '));
			}
			return `${remembered.get(prompt.sessionId) ?? 'no-memory'} ${prompt.text.includes(next) ? next : first}`;
		});
		assert.equal(await f.completed(first), `${historicalFact} ${first}`);
		assert.equal(await f.completed(next), `${historicalFact} ${next}`);
		assert.deepEqual(f.calls.map(call => call.purpose), [undefined, undefined]);
		assert.ok(f.calls.every(call => call.sessionId === f.agent.session.id));
		assert.equal(f.acp.length, 2);
		assert.equal(f.acp[0].sessionId, f.acp[1].sessionId);
		assert.ok(Buffer.byteLength(f.acp[0].text) <= MAX_AGY_PROMPT_BYTES);
		assert.ok(f.acp[0].text.endsWith(first));
		assert.equal(f.acp[1].text.trimEnd(), next);
		assert.equal(f.fallback.length, 0);
		assert.equal(f.cli.length, 0);
	});

	test('ACP transient failure on a long session retries ACP on a rebuilt session without forcing CLI compaction', options, async t => {
		const f = await fixture(t, { recovery: true });
		const fact = 'FACT=silver-orchid-1831';
		const historical = `${'registro detalhado de teste ó.\n'.repeat(2_850)}`;
		await f.seed([`${fact}\n${historical}`, `Older turn\n${historical}`]);
		let attempts = 0;
		f.setAnswer(async ({ text }) => {
			attempts += 1;
			if (attempts === 1) throw new AgyCliError('fixture disconnected before output', 'ACP_TRANSPORT');
			return `ACP-RECOVERED: ${lastLine(text)}`;
		});
		const current = `CURRENT=guarded-fig-4016\n${'dados do pedido atual. '.repeat(450)}guarded-fig-4016`;
		assert.match(await f.completed(current), /^ACP-RECOVERED: .*guarded-fig-4016$/u);
		assert.deepEqual(f.failures, [], 'no ANTIGRAVITY_PROMPT_TOO_LARGE compaction triggered');
		assert.equal(f.fallback.length, 0, 'never fell back to stream-json on a long session');
		assert.equal(f.cli.length, 0);
		assert.equal(f.acp.length, 2, 'initial failed attempt + fresh rebuilt ACP session');
		assert.ok(f.warnings.some(message => message.includes('retrying ACP on a fresh session')));
	});

	test('ACP failure on a short session still falls back to stream-json without compaction', options, async t => {
		const f = await fixture(t, { recovery: true });
		f.setAnswer(async () => { throw new AgyCliError('fixture disconnected before output', 'ACP_TRANSPORT'); });
		assert.equal(await f.completed('SHORT=fallback-ok'), 'CLI: SHORT=fallback-ok');
		assert.equal(f.fallback.length, 1);
		assert.equal(f.cli.length, 1);
		assert.equal(f.warnings.filter(message => message.includes('using stream-json')).length, 1);
		f.setAnswer(async () => 'ACP restored on the next turn');
		assert.equal(await f.completed('NEXT=unpin-2186'), 'ACP restored on the next turn');
		assert.equal(f.acp.length, 2);
	});

	test('mode changes apply to the same live DSH agent without leaking stale ACP history', options, async t => {
		const f = await fixture(t);
		assert.equal(await f.completed('MODE=first-acp'), 'ACP: MODE=first-acp');
		f.setMode('compaction');
		assert.equal(await f.completed('MODE=first-cli'), 'CLI: MODE=first-cli');
		assert.equal(f.acp.length, 1);
		f.setMode('acp');
		assert.equal(await f.completed('MODE=back-to-acp'), 'ACP: MODE=back-to-acp');
		assert.equal(f.acp.length, 2);
		assert.notEqual(f.acp[1].sessionId, f.acp[0].sessionId, 'CLI turns invalidate the old upstream history');
		assert.ok(f.acp[1].text.includes('CLI: MODE=first-cli'));
		assert.equal(f.clients[0].alive, false);
		f.setMode('compaction');
		assert.equal(await f.completed('MODE=back-to-cli'), 'CLI: MODE=back-to-cli');
		assert.equal(f.acp.length, 2);
		assert.equal(f.cli.length, 2);
		assert.ok(f.cli[1].includes('ACP: MODE=back-to-acp'));
		assert.deepEqual(f.warnings, [], 'explicit mode selection is not an ACP failure');
	});

	test('native DSH compaction bypasses ACP and the next turn rebuilds from the checkpoint', options, async t => {
		const f = await fixture(t);
		const fact = 'FACT=orange-tide-9127';
		const original = `RAW=retired-history ${fact}\n${'dados antigos sem valor no resumo. '.repeat(500)}\nEND=old-turn`;
		assert.equal(await f.completed(original), 'ACP: END=old-turn');
		assert.equal(await f.completed('RETAIN=latest-turn'), 'ACP: RETAIN=latest-turn');
		assert.equal(f.acp.length, 2);
		const before = f.agent.session.surface.replaceGeneration;
		const compaction = await f.ctx.compaction.compactNow(f.agent, AbortSignal.timeout(10_000));
		assert.ok(messageText({ content: compaction?.summary ?? [] }).includes(fact), 'native compaction kept the historical fact');
		assert.ok(f.agent.session.surface.replaceGeneration > before);
		assert.equal(f.acp.length, 2, 'the native summary must not enter the ACP trajectory');
		assert.deepEqual(f.fallback.map(call => call.purpose), ['compaction']);
		assert.equal(f.cli.length, 1);
		assert.match(f.cli[0], /acting as a compaction engine/u);
		const checkpoint = f.messages().find(message => message.source?.kind === 'compact-checkpoint');
		assert.ok(messageText(checkpoint)?.includes(fact));
		assert.ok(!f.messages().some(message => messageText(message)?.includes('RAW=retired-history')));

		const current = 'CURRENT=after-native-compaction';
		f.setAnswer(async ({ text }) => `${factsIn(text).join(' ')} ${lastLine(text)}`);
		assert.equal(await f.completed(current), `${fact} ${current}`);
		assert.equal(f.acp.length, 3);
		const [initial, retained, rebuilt] = f.acp;
		assert.equal(retained.sessionId, initial.sessionId);
		assert.notEqual(rebuilt.sessionId, initial.sessionId);
		assert.equal(f.clients[0].alive, false);
		assert.doesNotMatch(rebuilt.text, /RAW=retired-history/u);
		assert.ok(rebuilt.text.includes(fact));
		assert.ok(rebuilt.text.endsWith(current));
		assert.deepEqual(f.calls.map(call => call.purpose), [undefined, undefined, 'compaction', undefined]);
	});
}
