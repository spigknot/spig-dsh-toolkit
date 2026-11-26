import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompactionModelStore, installCompactionRouting, summaryChunkBudget } from '../components/subscriptions/lib/compaction-model.js';

async function tempStore(t) {
	const dir = await mkdtemp(join(tmpdir(), 'dsh-compaction-model-'));
	t.after(() => rm(dir, { recursive: true, force: true }));
	return { path: join(dir, 'compaction-model.json'), dir };
}

/** A runtime double: `stream` records the routed call, `resolveModelInfo` describes the target. */
function fakeRuntime(info = {}) {
	const calls = [];
	return {
		calls,
		async resolveModelInfo(provider, model) {
			return { provider, id: model, name: model, ...info };
		},
		async *stream(options) {
			calls.push(options);
			yield { type: 'finish', reason: { kind: 'stop' } };
		}
	};
}

function listenerOf(store) {
	let registered;
	const ctx = { on: (name, fn) => { registered = { name, fn }; return () => {}; } };
	installCompactionRouting(ctx, { store });
	assert.equal(registered.name, 'llm/stream');
	return registered.fn;
}

async function drain(iterable) {
	const chunks = [];
	for await (const chunk of iterable) chunks.push(chunk);
	return chunks;
}

const nextMarker = () => (async function* () { yield { type: 'finish', reason: { kind: 'stop' }, from: 'next' }; })();

test('the choice persists and absent means "same model as the conversation"', async (t) => {
	const { path } = await tempStore(t);
	const store = new CompactionModelStore(path);
	assert.equal(store.get(), undefined);
	await store.set({ provider: 'deepseek', model: 'deepseek-v4.1-flash', scope: 'all' });
	// An omitted effort means "default": the model's own.
	assert.deepEqual(new CompactionModelStore(path).get(), { provider: 'deepseek', model: 'deepseek-v4.1-flash', scope: 'all', effort: 'default' });
	assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { provider: 'deepseek', model: 'deepseek-v4.1-flash', scope: 'all', effort: 'default' });
	await store.set(null);
	assert.equal(new CompactionModelStore(path).get(), undefined);
});

test('invalid choices are refused', async (t) => {
	const store = new CompactionModelStore((await tempStore(t)).path);
	await assert.rejects(store.set({ provider: '', model: 'm', scope: 'all' }), /provider/u);
	await assert.rejects(store.set({ provider: 'p', model: ' ', scope: 'all' }), /model/u);
	await assert.rejects(store.set({ provider: 'p', model: 'm', scope: 'everything' }), /scope/u);
});

test('compaction calls go to the chosen model; everything else is untouched', async (t) => {
	const store = new CompactionModelStore((await tempStore(t)).path);
	await store.set({ provider: 'deepseek', model: 'deepseek-v4.1-flash', scope: 'all' });
	const listener = listenerOf(store);
	const runtime = fakeRuntime();
	// A conversation request: not touched.
	const normal = await drain(listener.call(runtime, { provider: 'claude', model: 'opus', purpose: undefined, messages: [] }, nextMarker));
	assert.equal(normal[0].from, 'next');
	assert.equal(runtime.calls.length, 0);
	// A summarization request: re-routed, everything else preserved.
	const signal = new AbortController().signal;
	await drain(listener.call(runtime, { provider: 'antigravity', model: 'claude-opus-5-5', purpose: 'compaction', messages: [{ role: 'user', content: 'x' }], sessionId: 's', signal, maxTokens: 4096 }, nextMarker));
	assert.equal(runtime.calls.length, 1);
	const [routed] = runtime.calls;
	assert.equal(routed.provider, 'deepseek');
	assert.equal(routed.model, 'deepseek-v4.1-flash');
	assert.equal(routed.purpose, 'compaction');
	assert.equal(routed.sessionId, 's');
	assert.equal(routed.signal, signal);
	assert.deepEqual(routed.messages, [{ role: 'user', content: 'x' }]);
	assert.equal(routed.reasoningEffort, undefined, 'the conversation effort is not carried to another model');
});

test('the chosen reasoning effort goes to the summary call only', async (t) => {
	const store = new CompactionModelStore((await tempStore(t)).path);
	await store.set({ provider: 'deepseek', model: 'deepseek-v4.1-flash', scope: 'all', effort: 'low' });
	assert.equal(store.get().effort, 'low');
	const listener = listenerOf(store);
	const runtime = fakeRuntime({ reasoning: { efforts: [{ id: 'low' }, { id: 'medium' }], defaultEffort: 'medium' } });
	await drain(listener.call(runtime, { provider: 'antigravity', model: 'm', purpose: 'compaction', messages: [], reasoningEffort: 'medium' }, nextMarker));
	assert.equal(runtime.calls[0].reasoningEffort, 'low', 'the conversation effort is replaced by the chosen one');
	// A conversation request keeps its own effort.
	await drain(listener.call(runtime, { provider: 'antigravity', model: 'm', messages: [], reasoningEffort: 'medium' }, nextMarker));
	assert.equal(runtime.calls.length, 1);
});

test('"default" effort leaves the choice to the model', async (t) => {
	const store = new CompactionModelStore((await tempStore(t)).path);
	await store.set({ provider: 'deepseek', model: 'deepseek-v4.1-flash', scope: 'all', effort: 'default' });
	assert.equal(store.get().effort, 'default');
	const listener = listenerOf(store);
	const runtime = fakeRuntime();
	await drain(listener.call(runtime, { provider: 'antigravity', model: 'm', purpose: 'compaction', messages: [], reasoningEffort: 'medium' }, nextMarker));
	assert.equal(runtime.calls[0].reasoningEffort, undefined, 'no effort is forced');
});

test('an effort the chosen model does not declare falls back to its default instead of failing', async (t) => {
	const store = new CompactionModelStore((await tempStore(t)).path);
	await store.set({ provider: 'deepseek', model: 'deepseek-v4.1-flash', scope: 'all', effort: 'xhigh' });
	const warnings = [];
	let registered;
	const ctx = { on: (_name, fn) => { registered = fn; return () => {}; }, get: () => undefined };
	installCompactionRouting(ctx, { store, onWarn: (message) => warnings.push(message) });
	// This model declares off/low/high/max only.
	const runtime = fakeRuntime({ reasoning: { efforts: [{ id: 'off' }, { id: 'low' }, { id: 'high' }, { id: 'max' }], defaultEffort: 'high' } });
	await drain(registered.call(runtime, { provider: 'antigravity', model: 'm', purpose: 'compaction', messages: [] }, nextMarker));
	assert.equal(runtime.calls[0].reasoningEffort, undefined, 'no unsupported effort is forced');
	assert.match(warnings.join(' '), /does not declare reasoning effort "xhigh"/u);
});

test('a declared effort is used as chosen', async (t) => {
	const store = new CompactionModelStore((await tempStore(t)).path);
	await store.set({ provider: 'deepseek', model: 'deepseek-v4.1-flash', scope: 'all', effort: 'low' });
	const listener = listenerOf(store);
	const runtime = fakeRuntime({ reasoning: { efforts: [{ id: 'off' }, { id: 'low' }, { id: 'high' }], defaultEffort: 'high' } });
	await drain(listener.call(runtime, { provider: 'antigravity', model: 'm', purpose: 'compaction', messages: [] }, nextMarker));
	assert.equal(runtime.calls[0].reasoningEffort, 'low');
});

test('an unknown effort is refused', async (t) => {
	const store = new CompactionModelStore((await tempStore(t)).path);
	await assert.rejects(store.set({ provider: 'p', model: 'm', scope: 'all', effort: 'turbo' }), /effort/u);
});

test('the re-routed call itself is not routed again', async (t) => {
	const store = new CompactionModelStore((await tempStore(t)).path);
	await store.set({ provider: 'deepseek', model: 'deepseek-v4.1-flash', scope: 'all' });
	const listener = listenerOf(store);
	const runtime = fakeRuntime();
	const chunks = await drain(listener.call(runtime, { provider: 'deepseek', model: 'deepseek-v4.1-flash', purpose: 'compaction', messages: [] }, nextMarker));
	assert.equal(chunks[0].from, 'next');
	assert.equal(runtime.calls.length, 0);
});

test('scope "antigravity" only re-routes compactions of Antigravity conversations', async (t) => {
	const store = new CompactionModelStore((await tempStore(t)).path);
	await store.set({ provider: 'deepseek', model: 'deepseek-v4.1-flash', scope: 'antigravity' });
	const listener = listenerOf(store);
	const runtime = fakeRuntime();
	await drain(listener.call(runtime, { provider: 'codex', model: 'gpt', purpose: 'compaction', messages: [] }, nextMarker));
	assert.equal(runtime.calls.length, 0);
	await drain(listener.call(runtime, { provider: 'antigravity', model: 'gemini-4-neon', purpose: 'compaction', messages: [] }, nextMarker));
	assert.equal(runtime.calls.length, 1);
});

test('the output cap is lowered to what the chosen model declares', async (t) => {
	const store = new CompactionModelStore((await tempStore(t)).path);
	await store.set({ provider: 'deepseek', model: 'deepseek-v4.1-flash', scope: 'all' });
	const listener = listenerOf(store);
	const runtime = fakeRuntime({ defaultMaxTokens: 8192 });
	await drain(listener.call(runtime, { provider: 'antigravity', model: 'm', purpose: 'compaction', messages: [], maxTokens: 65536 }, nextMarker));
	assert.equal(runtime.calls[0].maxTokens, 8192);
});

test('a summarizer outside the CLI route lets the recovery summarize far more than 180 kB at once', async (t) => {
	const store = new CompactionModelStore((await tempStore(t)).path);
	const runtime = fakeRuntime({ context: { contextWindow: 1_000_000 } });
	assert.equal(await summaryChunkBudget({ store, llm: runtime }), undefined, 'no choice: the CLI ceiling applies');
	await store.set({ provider: 'antigravity', model: 'gemini-4-neon', scope: 'all' });
	assert.equal(await summaryChunkBudget({ store, llm: runtime }), undefined, 'the CLI itself: the CLI ceiling applies');
	await store.set({ provider: 'deepseek', model: 'deepseek-v4.1-flash', scope: 'all' });
	const budget = await summaryChunkBudget({ store, llm: runtime });
	assert.ok(budget > 1_000_000, `budget ${budget}`);
	const small = fakeRuntime({ context: { contextWindow: 64_000 } });
	assert.ok((await summaryChunkBudget({ store, llm: small })) < 180_000, 'a small window is respected');
});
