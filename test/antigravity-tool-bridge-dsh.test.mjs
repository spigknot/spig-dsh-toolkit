/**
 * End-to-end DSH tool bridge through the installed DSH runtime: real agent
 * loop, tool registry and native tool executor, with a fake `agy` that answers
 * in the bridge protocol. Proves that `finish: tool-calls` makes DSH itself run
 * the tool and send its real result back on the next step.
 *
 * No Google quota is used. On a packaged (ASAR) DSH the file re-runs itself
 * under the DSH executable, which can read the archive.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createCliAdapter } from '../components/subscriptions/lib/antigravity-cli-adapter.js';
import { createAgy } from '../components/subscriptions/lib/antigravity-cli-local.js';

const packages = ['llm', 'agent', 'agent-loop', 'tools', 'system-prompt', 'session-projection', 'session', 'token-meter', 'tool-executor-native'];
const runtime = process.env.DSH_INSTALL_DIR;
const needsElectron = runtime?.includes('.asar') && !process.versions.electron;
const requireDsh = runtime ? createRequire(join(runtime, 'package.json')) : createRequire(import.meta.url);

function missingPackage() {
	for (const name of ['@deepseek-ai/cordis', ...packages.map((name) => `@deepseek-ai/dsh-${name}`)]) {
		try {
			requireDsh.resolve(name);
		} catch (error) {
			if (error.code === 'MODULE_NOT_FOUND') return name;
			throw error;
		}
	}
}

if (needsElectron && process.env.DSH_NODE_EXECUTABLE) {
	test('DSH tool bridge (re-run under the DSH runtime)', () => {
		const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
		delete env.NODE_TEST_CONTEXT;
		const result = spawnSync(process.env.DSH_NODE_EXECUTABLE, ['--test', fileURLToPath(import.meta.url)], { env, encoding: 'utf8', timeout: 60_000, windowsHide: true });
		if (result.error) throw result.error;
		assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
	});
} else {
	const missing = missingPackage();
	test('a bridged call is executed by DSH and its real result reaches the next step', { skip: missing && `requires installed DSH packages (missing ${missing})`, timeout: 30_000 }, async (t) => {
		const dsh = (name) => requireDsh(`@deepseek-ai/dsh-${name}`);
		const { Context } = requireDsh('@deepseek-ai/cordis');
		const { LlmAdapter, LlmError, createUserMessage } = dsh('llm');
		const { defineTool } = dsh('tools');
		const ctx = new Context();
		const fibers = [];
		const dir = mkdtempSync(join(tmpdir(), 'dsh-agy-bridge-'));
		t.after(async () => {
			for (const fiber of fibers.reverse()) await fiber.dispose();
			rmSync(dir, { recursive: true, force: true });
		});
		const mount = async (name) => {
			const plugin = dsh(name);
			const fiber = ctx.plugin(plugin.default ?? plugin);
			fibers.push(fiber);
			await fiber;
		};
		for (const service of packages.filter((name) => name !== 'agent-loop')) await mount(service);
		await mount('agent-loop');

		// A harness tool with a real side effect DSH must perform.
		const target = join(dir, 'bridge-proof.txt');
		const executed = [];
		ctx.tools.register(defineTool({
			name: 'fixture_write',
			description: 'Write text to a file and report how many bytes were written.',
			parameters: {
				path: { type: 'string', required: true, description: 'Absolute file path.' },
				text: { type: 'string', required: true, description: 'Content.' }
			},
			output: {
				schema: { type: 'object', additionalProperties: false, properties: { bytes: { type: 'number', required: true } } },
				render: (_args, value) => [{ type: 'text', text: `WROTE ${value.bytes} BYTES` }]
			},
			async execute(args) {
				executed.push(args);
				writeFileSync(args.path, args.text, 'utf8');
				return { bytes: Buffer.byteLength(args.text, 'utf8') };
			}
		}));

		const prompts = [];
		const policies = [];
		const transport = createAgy({ bin: 'fixture-cli', bridgeOf: () => true, spawn(_bin, args) {
			const child = new EventEmitter();
			child.stdout = new PassThrough();
			child.stderr = new PassThrough();
			child.stdin = new PassThrough();
			child.kill = () => {};
			const at = args.indexOf('--settings');
			policies.push(JSON.parse(readFileSync(args[at + 1], 'utf8')));
			const buffers = [];
			child.stdin.on('data', (chunk) => buffers.push(chunk));
			child.stdin.on('end', () => {
				const [{ text }] = JSON.parse(Buffer.concat(buffers).toString('utf8')).message.content;
				prompts.push(text);
				const tag = /<(dsh_tc_[0-9a-f]{12})>\{"name":"TOOL_NAME"/u.exec(text)?.[1];
				const response = /WROTE \d+ BYTES/u.test(text)
					? `Done: ${/WROTE (\d+) BYTES/u.exec(text)[1]} bytes written.`
					: `I will write the file.\n<${tag}>${JSON.stringify({ name: 'fixture_write', arguments: { path: target, text: 'ponte-ok' } })}</${tag}>`;
				child.stdout.end(`${JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response } })}\n`);
				setImmediate(() => child.emit('close', 0));
			});
			return child;
		} });
		const seenTools = [];
		const model = 'gemini-3-flash';
		ctx.llm.registerAdapter(['antigravity'], Object.assign(new LlmAdapter(), createCliAdapter({
			list: async () => [{ id: model, name: 'Gemini 3 Flash' }],
			run: async (options) => {
				seenTools.push((options.tools ?? []).map((tool) => tool.name));
				try {
					return await transport.run(options);
				} catch (cause) {
					options.signal?.throwIfAborted();
					throw new LlmError(cause.message, cause.code ?? 'ANTIGRAVITY_CLI');
				}
			},
			error: (message, code) => new LlmError(message, code)
		})));

		const agent = await ctx.agentLoop.create('fixture-bridge', { provider: 'antigravity', model });
		let unlisten;
		const ended = new Promise((resolve) => {
			unlisten = ctx.on('agent/status', ({ agent: owner, status }) => {
				if (owner === agent && status === 'idle') resolve();
			});
		});
		const timer = setTimeout(() => agent.cancel({ kind: 'disposed' }), 20_000);
		try {
			agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Create the proof file.' }] }));
			await ended;
		} finally {
			clearTimeout(timer);
			unlisten();
		}

		const turnEnd = agent.session.snapshotEvents(0).findLast((event) => event.type === 'turn/end')?.data;
		assert.equal(turnEnd?.reason?.kind, 'completed', JSON.stringify(turnEnd));
		assert.ok(seenTools[0].includes('fixture_write'), `DSH did not pass its tools: ${seenTools[0]}`);
		assert.deepEqual(executed, [{ path: target, text: 'ponte-ok' }], 'DSH did not execute the bridged call');
		assert.ok(existsSync(target) && readFileSync(target, 'utf8') === 'ponte-ok', 'the side effect is missing');
		assert.equal(prompts.length, 2, 'one step to call, one step to answer');
		assert.ok(prompts[1].includes('"name":"fixture_write"'), 'the call is missing from the second prompt');
		assert.match(prompts[1], /Tool result: \[id=agy_tc_[0-9a-f]{12} name=fixture_write\]\n[\s\S]*WROTE 8 BYTES/u);
		for (const policy of policies) {
			assert.deepEqual(policy.permissions.allow, []);
			assert.ok(policy.permissions.deny.includes('command(*)') && policy.permissions.deny.includes('read_file(*)'));
		}
		const messages = agent.session.deriveMessages();
		const call = messages.find((message) => message.role === 'assistant' && message.content.some((block) => block.type === 'tool-call'));
		assert.ok(call, 'no structured tool call in the DSH history');
		const reply = messages.at(-1);
		assert.equal(reply.role, 'assistant');
		assert.equal(reply.content.map((block) => block.text ?? '').join(''), 'Done: 8 bytes written.');
	});
}
