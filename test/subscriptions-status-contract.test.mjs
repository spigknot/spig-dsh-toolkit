/**
 * Contract guard for the progressive Subscriptions first paint.
 *
 * Opening Settings → Subscriptions used to wait ~2.4s on a single `status`
 * RPC: the host awaited every provider (including two sequential `agy`
 * CLI spawns) inside one Promise.all, and the client painted only after the
 * joint payload arrived — every provider appeared late, together.
 *
 * The fix has two halves and this file pins both:
 * 1. `statusAccounts` answers account identities with no CLI spawns and no
 *    network, so the page lists every provider instantly; the full `status`
 *    fills in versions and model counts afterwards.
 * 2. The Antigravity `status` probes version and models concurrently instead
 *    of in sequence (~0.8s + ~2.4s).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const libRoot = new URL('../components/subscriptions/lib/', import.meta.url);
const bundle = readFileSync(new URL('index.js', libRoot), 'utf8');

function bundledRegion(name) {
	const marker = `//#region src/${name}.ts`;
	const start = bundle.indexOf(marker);
	assert.notEqual(start, -1, `bundle region ${name} must exist`);
	const end = bundle.indexOf('//#endregion', start);
	return bundle.slice(start + marker.length, end);
}

const providerIds = ['codex', 'claude', 'grok', 'copilot', 'antigravity'];

function loadDispatch() {
	const factory = new Function('PROVIDER_IDS', 'agyTransport', 'setAgyTransport', 'agyPromptGuard', 'agyToolBridge', 'setAgyToolBridge',
		`${bundledRegion('auth/rpc')}\nreturn { dispatch, failure, endpoints: SUBSCRIPTIONS_AUTH_ENDPOINTS };`);
	return factory(providerIds, () => 'compaction', () => {}, () => true, () => true, () => {});
}

const { dispatch, failure, endpoints } = loadDispatch();
const invoke = (controller, endpoint, payload, providerSettings) =>
	dispatch(controller, undefined, undefined, undefined, endpoint, payload, undefined, providerSettings).catch(failure);

function fakeController(overrides = {}) {
	const calls = [];
	return {
		calls,
		async statusAccounts(provider) {
			calls.push(provider);
			if (overrides.fail?.includes(provider)) throw new Error(`${provider} store unreadable`);
			if (provider === 'antigravity') {
				return { busy: false, accounts: [{ key: 'agy-cli', isDefault: true, account: 'me@example.com' }] };
			}
			return { busy: false, accounts: [{ key: `${provider}-1`, isDefault: true, expiresAt: undefined, account: `${provider}@x`, plan: 'pro' }] };
		},
	};
}

test('statusAccounts is a registered endpoint answering accounts without CLI probes', async () => {
	assert.ok(endpoints.includes('statusAccounts'), 'exact RPC route must be registered');
	const controller = fakeController();
	const res = await invoke(controller, 'statusAccounts', {});
	assert.equal(res.ok, true);
	const providers = res.value.providers;
	assert.deepEqual(Object.keys(providers).sort(), [...providerIds].sort());
	for (const id of providerIds) {
		const status = providers[id];
		assert.ok(Array.isArray(status.accounts), `${id} must carry accounts`);
		assert.equal(typeof status.busy, 'boolean', `${id} must carry a busy flag`);
		assert.ok(!('modelCount' in status), `${id} fast lane must not wait on model counts`);
		assert.ok(!('clientVersion' in status), `${id} fast lane must not wait on CLI version probes`);
	}
	assert.deepEqual(controller.calls.sort(), [...providerIds].sort(), 'every provider is queried concurrently');
});

test('statusAccounts degrades per provider instead of blinding the page', async () => {
	const controller = fakeController({ fail: ['grok'] });
	const res = await invoke(controller, 'statusAccounts', {});
	assert.equal(res.ok, true);
	const providers = res.value.providers;
	assert.deepEqual(providers.grok, { busy: false, accounts: [], detail: 'grok store unreadable' });
	assert.equal(providers.codex.accounts.length, 1);
	assert.equal(providers.antigravity.accounts[0].key, 'agy-cli');
});

test('antigravity status probes version and models concurrently', () => {
	const start = bundle.indexOf('async status(provider)');
	assert.notEqual(start, -1, 'controller status must exist in the bundle');
	const head = bundle.slice(start, bundle.indexOf('const entries = await listAccounts', start));
	const parallel = head.match(/Promise\.all\(\[([\s\S]*?)\]\)/);
	assert.ok(parallel, 'version and model probes must share one Promise.all');
	assert.match(parallel[1], /readAgyVersion/, 'version probe participates');
	assert.match(parallel[1], /listAgyModels/, 'model probe participates');
	assert.doesNotMatch(head, /await readAgyVersion[\s\S]*await listAgyModels/, 'probes must not run in sequence');
});

test('standalone auth/rpc.js mirrors the fast lane (no bundle drift)', () => {
	const standalone = readFileSync(new URL('auth/rpc.js', libRoot), 'utf8');
	assert.match(standalone, /'statusAccounts'/, 'endpoint must be registered in the mirror');
	assert.match(standalone, /case 'statusAccounts':/, 'dispatch must answer it in the mirror');
});

test('client paints accounts first and fills in full status afterwards', () => {
	const client = readFileSync(new URL('client.js', libRoot), 'utf8');
	const fastCall = client.indexOf('callSubscriptionsAuth(rpc, "statusAccounts"');
	assert.notEqual(fastCall, -1, 'refresh must request the fast lane');
	const fullCall = client.indexOf('callSubscriptionsAuth(rpc, "status", {');
	assert.notEqual(fullCall, -1, 'refresh must still request the full status');
	assert.ok(fastCall < fullCall, 'accounts must paint before the slow status resolves');
});
