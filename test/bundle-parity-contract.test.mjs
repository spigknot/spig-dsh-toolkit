/**
 * Bundle parity contract for `components/subscriptions/lib/index.js`.
 *
 * The DSH host executes `components/subscriptions/lib/index.js`, which carries
 * inline Rollup regions alongside standalone `translate/*` and `providers/*`
 * files. This test exercises the actual code inside the bundle (not only the
 * standalone files) for every mirrored fix or TOOLKIT DIVERGENCE so a fix
 * applied to only one copy fails immediately.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

const STUB_LLM_URL = 'data:text/javascript,' + encodeURIComponent([
	'export const CONTEXT_WINDOW_EXCEEDED_CODE = "CONTEXT_WINDOW_EXCEEDED";',
	'export const EMPTY_RESPONSE_CODE = "EMPTY_RESPONSE";',
	'export const QUOTA_EXCEEDED_CODE = "QUOTA_EXCEEDED";',
	'export const ToolCallId = (id) => id;',
	'export const resolveRetryPolicy = (policy) => ({ ...policy });',
	'export class LlmError extends Error { constructor(msg, code) { super(msg); this.code = code; } }',
].join('\n'));

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === '@deepseek-ai/dsh-llm') return { url: STUB_LLM_URL, shortCircuit: true };
		return nextResolve(specifier, context);
	},
});

const bundlePath = new URL('../components/subscriptions/lib/index.js', import.meta.url);
const bundle = readFileSync(bundlePath, 'utf8');

function extractRegion(regionName) {
	const marker = `//#region ${regionName}`;
	const start = bundle.indexOf(marker);
	assert.notEqual(start, -1, `bundle region ${regionName} must exist in index.js`);
	const end = bundle.indexOf('//#endregion', start);
	assert.notEqual(end, -1, `bundle region ${regionName} must have a closing //#endregion`);
	return bundle.slice(start + marker.length, end);
}

const standaloneAnthropic = await import('../components/subscriptions/lib/translate/anthropic.js');
const standaloneRateLimit = await import('../components/subscriptions/lib/providers/rate-limit.js');

test('bundled src/translate/anthropic.ts matches standalone sanitizeAnthropicToolId and assembleAnthropicMessages', () => {
	const region = extractRegion('src/translate/anthropic.ts');
	const LlmError = class extends Error { constructor(msg, code) { super(msg); this.code = code; } };
	const bundled = new Function(
		'createHash', 'CONTEXT_WINDOW_EXCEEDED_CODE', 'EMPTY_RESPONSE_CODE', 'ToolCallId', 'LlmError',
		'parseJsonText', 'isQuotaExceededError', 'isContextWindowExceededError',
		`${region}\nreturn { sanitizeAnthropicToolId, assembleAnthropicMessages };`,
	)(createHash, 'CONTEXT_WINDOW_EXCEEDED', 'EMPTY_RESPONSE', (id) => id, LlmError, JSON.parse, () => false, () => false);

	const sampleIds = [
		'toolu_01ABC_def-99',
		'call_502eec11e94a42b7807f1855e7f4fadb',
		'call_260c8982bc7c42899ff4dc8d119dc0e3|fc_04ded117bb9e3496016b0374ed3eb887d2820ea2a0d0b4f73d',
		'call with spaces & symbols:123/456',
		'',
	];
	for (const id of sampleIds) {
		assert.equal(
			bundled.sanitizeAnthropicToolId(id),
			standaloneAnthropic.sanitizeAnthropicToolId(id),
			`bundled vs standalone sanitizeAnthropicToolId diverged for ${JSON.stringify(id)}`,
		);
	}

	const id1 = 'call_abc|fc_123';
	const id2 = 'call_def|fc_456';
	const messages = [
		{ role: 'user', content: [{ type: 'text', text: 'check' }] },
		{
			role: 'assistant',
			content: [
				{ type: 'tool-call', id: id1, name: 'read', arguments: '{"file_path":"a.js"}' },
				{ type: 'tool-call', id: id2, name: 'read', arguments: '{"file_path":"b.js"}' },
			],
		},
		{ role: 'tool', toolCallId: id1, content: [{ type: 'text', text: 'out1' }] },
		{ role: 'user', content: [{ type: 'tool-result', toolCallId: id2, content: [{ type: 'text', text: 'out2' }] }] },
	];
	assert.deepEqual(bundled.assembleAnthropicMessages(messages).messages, standaloneAnthropic.toAnthropicMessages(messages));
});

test('bundled src/providers/rate-limit.ts matches standalone fail-fast quota wait defaults and policy', () => {
	const region = extractRegion('src/providers/rate-limit.ts');
	const bundled = new Function(
		'resolveRetryPolicy', 'QUOTA_EXCEEDED_CODE', 'LlmError',
		`${region}\nreturn { DEFAULT_RATE_LIMIT_MAX_WAIT_MS, DEFAULT_RATE_LIMIT_WAIT, DEFAULT_RETRY, resolveRateLimitWait, subscriptionRetryPolicy };`,
	)((policy) => ({ ...policy }), 'QUOTA_EXCEEDED', Error);

	assert.equal(bundled.DEFAULT_RATE_LIMIT_MAX_WAIT_MS, standaloneRateLimit.DEFAULT_RATE_LIMIT_MAX_WAIT_MS);
	assert.equal(bundled.DEFAULT_RATE_LIMIT_MAX_WAIT_MS, 120_000);
	assert.deepEqual({ ...bundled.DEFAULT_RATE_LIMIT_WAIT }, { ...standaloneRateLimit.DEFAULT_RATE_LIMIT_WAIT });
	assert.deepEqual(
		{ ...bundled.resolveRateLimitWait(undefined, 'contract') },
		{ ...standaloneRateLimit.resolveRateLimitWait(undefined, 'contract') },
	);
	assert.deepEqual(
		bundled.subscriptionRetryPolicy(bundled.DEFAULT_RETRY, bundled.DEFAULT_RATE_LIMIT_WAIT, 'contract'),
		standaloneRateLimit.subscriptionRetryPolicy(standaloneRateLimit.DEFAULT_RETRY, standaloneRateLimit.DEFAULT_RATE_LIMIT_WAIT, 'contract'),
	);
	assert.deepEqual(
		bundled.subscriptionRetryPolicy(bundled.DEFAULT_RETRY, bundled.resolveRateLimitWait({ wait: true, maxWaitMs: 600_000 }, 'contract'), 'contract'),
		standaloneRateLimit.subscriptionRetryPolicy(standaloneRateLimit.DEFAULT_RETRY, standaloneRateLimit.resolveRateLimitWait({ wait: true, maxWaitMs: 600_000 }, 'contract'), 'contract'),
	);
});

test('every TOOLKIT DIVERGENCE region inside index.js is explicitly covered by a bundle contract test', () => {
	const guardedRegions = new Set([
		'src/providers/rate-limit.ts',
		'src/translate/anthropic.ts',
		'src/provider-settings.ts',
		'src/index.ts',
	]);
	const regionPattern = /\/\/#region ([^\r\n]+)([\s\S]*?)\/\/#endregion/gu;
	const unguarded = [];
	for (const match of bundle.matchAll(regionPattern)) {
		const [, name, body] = match;
		if (body.includes('TOOLKIT DIVERGENCE') && !guardedRegions.has(name.trim())) {
			unguarded.push(name.trim());
		}
	}
	assert.deepEqual(unguarded, [], `Unguarded TOOLKIT DIVERGENCE regions in index.js: ${unguarded.join(', ')}`);
});

test('index.js imports external Antigravity and lifecycle modules directly', () => {
	const head = bundle.slice(0, 1500);
	for (const spec of [
		'./antigravity-cli-adapter.js',
		'./antigravity-acp-transport.js',
		'./antigravity-cli-local.js',
		'./lifecycle-journal.js',
	]) {
		assert.ok(head.includes(spec), `index.js must import ${spec} from its external single-source module`);
	}
});
