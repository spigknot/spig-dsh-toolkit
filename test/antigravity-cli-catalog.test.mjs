import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupCliModels, pickCliModel } from '../components/subscriptions/lib/antigravity-cli-catalog.js';

const rows = [
  { id: 'gemini-4-hydrogen-high', name: 'Gemini 4 Hydrogen (High)' },
  { id: 'gemini-4-hydrogen-xhigh', name: 'Gemini 4 Hydrogen (XHigh)' },
  { id: 'gemini-4-hydrogen-medium', name: 'Gemini 4 Hydrogen (Medium)' },
  { id: 'gemini-pro-orchestrator-neon', name: 'Orchestrator (Neon)' },
];

test('advertises Hydrogen with only the efforts listed by the official CLI', () => {
  const entries = groupCliModels(rows);
  assert.deepEqual(entries.map(entry => entry.id), ['gemini-4-hydrogen', 'gemini-pro-orchestrator-neon']);
  assert.equal(entries[0].name, 'Gemini 4 Hydrogen');
  assert.deepEqual(entries[0].reasoning.efforts.map(effort => effort.id), ['medium', 'high', 'xhigh']);
  assert.equal(entries[0].reasoning.defaultEffort, 'medium');
});

test('selects exact CLI variants and rejects unavailable models and efforts', () => {
  const entries = groupCliModels(rows);
  assert.equal(pickCliModel(entries, 'gemini-4-hydrogen', 'xhigh'), 'gemini-4-hydrogen-xhigh');
  assert.equal(pickCliModel(entries, 'gemini-4-hydrogen-high'), 'gemini-4-hydrogen-high');
  assert.equal(pickCliModel(entries, 'gemini-4-hydrogen'), 'gemini-4-hydrogen-medium');
  assert.throws(() => pickCliModel(entries, 'gemini-4-hydrogen-high', 'medium'));
  assert.throws(() => pickCliModel(entries, 'gemini-4-hydrogen', 'max'));
  assert.throws(() => pickCliModel(entries, 'unavailable'));
});
