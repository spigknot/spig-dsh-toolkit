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
