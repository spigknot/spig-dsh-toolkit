import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const STUB_URL = 'data:text/javascript,' + encodeURIComponent([
  'export const CONTEXT_WINDOW_EXCEEDED_CODE = "CONTEXT_WINDOW_EXCEEDED";',
  'export const EMPTY_RESPONSE_CODE = "EMPTY_RESPONSE";',
  'export const ToolCallId = (id) => id;',
  'export class LlmError extends Error { constructor(msg, code) { super(msg); this.code = code; } }',
].join('\n'));

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-llm') {
      return { url: STUB_URL, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { sanitizeAnthropicToolId, toAnthropicMessages } = await import('../components/subscriptions/lib/translate/anthropic.js');

const ANTHROPIC_ID_RE = /^[a-zA-Z0-9_-]+$/;

test('sanitizeAnthropicToolId preserves valid Anthropic ids unchanged', () => {
  assert.equal(sanitizeAnthropicToolId('toolu_01ABC_def-99'), 'toolu_01ABC_def-99');
  assert.equal(sanitizeAnthropicToolId('call_502eec11e94a42b7807f1855e7f4fadb'), 'call_502eec11e94a42b7807f1855e7f4fadb');
});

test('sanitizeAnthropicToolId deterministically normalizes cross-provider ids with invalid characters', () => {
  const codexId = 'call_260c8982bc7c42899ff4dc8d119dc0e3|fc_04ded117bb9e3496016b0374ed3eb887d2820ea2a0d0b4f73d';
  const a = sanitizeAnthropicToolId(codexId);
  const b = sanitizeAnthropicToolId(codexId);
  assert.equal(a, b);
  assert.match(a, ANTHROPIC_ID_RE);
  assert.notEqual(a, codexId);

  const other = 'call_706a4b83ac344e2c968d021d3f17512c|fc_04ded117bb9e3496016b03750b033c87d2889b87a1d4ba67e0';
  assert.notEqual(a, sanitizeAnthropicToolId(other));
});

test('toAnthropicMessages pairs sanitized tool_use.id with tool_result.tool_use_id for both block and tool-role results', () => {
  const id1 = 'call_260c8982bc7c42899ff4dc8d119dc0e3|fc_04ded117bb9e3496016b0374ed3eb887d2820ea2a0d0b4f73d';
  const id2 = 'call_706a4b83ac344e2c968d021d3f17512c|fc_04ded117bb9e3496016b03750b033c87d2889b87a1d4ba67e0';
  const messages = [
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    {
      role: 'assistant',
      content: [
        { type: 'tool-call', id: id1, name: 'read', arguments: '{"file_path":"a"}' },
        { type: 'tool-call', id: id2, name: 'read', arguments: '{"file_path":"b"}' },
      ],
    },
    {
      role: 'tool',
      toolCallId: id1,
      content: [{ type: 'text', text: 'ok1' }],
    },
    {
      role: 'user',
      content: [{ type: 'tool-result', toolCallId: id2, content: [{ type: 'text', text: 'ok2' }] }],
    },
  ];

  const out = toAnthropicMessages(messages);
  const assistantBlocks = out.find(m => m.role === 'assistant').content;
  const userResultBlocks = out[out.length - 1].content.filter(b => b.type === 'tool_result');

  assert.equal(assistantBlocks.length, 2);
  assert.equal(userResultBlocks.length, 2);
  for (let i = 0; i < 2; i++) {
    assert.match(assistantBlocks[i].id, ANTHROPIC_ID_RE);
    assert.equal(userResultBlocks[i].tool_use_id, assistantBlocks[i].id);
  }
});
