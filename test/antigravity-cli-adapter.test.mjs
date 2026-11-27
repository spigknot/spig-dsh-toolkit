import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCliAdapter} from '../components/subscriptions/lib/antigravity-cli-adapter.js';
const setup = run => createCliAdapter({list: async () => [{id:'gemini-4-hydrogen-medium', name:'Gemini 4 Hydrogen (Medium)'}], run});
test('Hydrogen is resolved from CLI and yields DSH text and finish', async () => {
  const adapter = setup(async options => { assert.equal(options.model, 'gemini-4-hydrogen-medium'); return 'OK'; });
  assert.deepEqual((await adapter.listModels('antigravity')).map(model => model.id), ['gemini-4-hydrogen']);
  assert.equal((await adapter.resolveModel('antigravity','gemini-4-hydrogen')).reasoning.defaultEffort,'medium');
  // Compaction sizes its budget from this; without it every mid-session switch fails.
  const resolved = await adapter.resolveModel('antigravity','gemini-4-hydrogen');
  assert.equal(resolved.context.contextWindow, 1048576);
  assert.equal(resolved.defaultMaxTokens, 32768);
  const chunks = await Array.fromAsync(adapter.stream({provider:'antigravity',model:'gemini-4-hydrogen'}));
  assert.equal(chunks.find(chunk => chunk.type === 'text-delta').text,'OK');
  assert.equal(chunks.at(-1).reason.kind,'stop');
});
test('quota error propagates after one call', async () => {
  let calls=0;
  const error=Object.assign(new Error('quota'),{code:'RATE_LIMIT'});
  const adapter=setup(async () => {calls++; throw error;});
  await assert.rejects(Array.fromAsync(adapter.stream({provider:'antigravity',model:'gemini-4-hydrogen'})), value => value === error);
  assert.equal(calls,1);
});

test('stale-if-error returns last known-good catalog on transient list failure and backs off', async () => {
  let clock = 1_000;
  let listCalls = 0;
  let shouldFail = false;
  const adapter = createCliAdapter({
    list: async () => {
      listCalls++;
      if (shouldFail) throw new Error('lookup daily-cloudcode-pa.googleapis.com: no such host');
      return [{ id: 'gemini-4-hydrogen-medium', name: 'Gemini 4 Hydrogen (Medium)' }];
    },
    run: async () => 'OK',
    ttlMs: 300_000,
    failureBackoffMs: 15_000,
    now: () => clock,
  });

  // Initial cold fetch populates cache.
  const first = await adapter.listModels('antigravity');
  assert.deepEqual(first.map(m => m.id), ['gemini-4-hydrogen']);
  assert.equal(listCalls, 1);

  // Within TTL, cache is reused without calling list().
  clock += 100_000;
  await adapter.listModels('antigravity');
  assert.equal(listCalls, 1);

  // After TTL expires, transient failure falls back to stale cache.
  clock += 250_000;
  shouldFail = true;
  const stale = await adapter.listModels('antigravity');
  assert.deepEqual(stale.map(m => m.id), ['gemini-4-hydrogen']);
  assert.equal(listCalls, 2);

  // During failure backoff, subsequent calls reuse stale cache without retrying list().
  clock += 5_000;
  const resolved = await adapter.resolveModel('antigravity', 'gemini-4-hydrogen');
  assert.equal(resolved.id, 'gemini-4-hydrogen');
  assert.equal(listCalls, 2);

  // After backoff expires and network recovers, list() refreshes the catalog.
  clock += 20_000;
  shouldFail = false;
  await adapter.listModels('antigravity');
  assert.equal(listCalls, 3);
});

test('cold list failure with no cached catalog still propagates error', async () => {
  const adapter = createCliAdapter({
    list: async () => { throw new Error('DNS down'); },
    run: async () => 'OK',
  });
  await assert.rejects(adapter.listModels('antigravity'), /DNS down/);
});
