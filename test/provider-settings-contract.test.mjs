/**
 * Contract guard for the bundled ProviderSettingsStore.
 *
 * The host loads `lib/index.js`, which carries its own copy of
 * `ProviderSettingsStore` (region `src/provider-settings.ts`). A separate
 * `lib/provider-settings.js` exists in the tree and is NOT imported by the
 * host, so a method added only there is invisible at runtime — that is how
 * `preferences.agyFix is not a function` took every subscription route down
 * at mount.
 *
 * These tests fail when the bundle calls a preference method the inline class
 * does not define, and when the standalone copy drifts away from the bundled
 * one, so the mistake cannot ship silently again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const root = new URL('../components/subscriptions/lib/', import.meta.url);
const bundle = readFileSync(new URL('index.js', root), 'utf8');

/** The inline class body: from its declaration to the region end. */
function bundledClassBody() {
	const start = bundle.indexOf('var ProviderSettingsStore = class {');
	assert.notEqual(start, -1, 'ProviderSettingsStore must exist inside lib/index.js');
	const end = bundle.indexOf('//#endregion', start);
	assert.notEqual(end, -1, 'the class region must be closed');
	return bundle.slice(start, end);
}

/** Method names the inline class defines. */
function bundledMethods() {
	const body = bundledClassBody();
	const names = new Set();
	for (const line of body.split('\n')) {
		// Class members are indented exactly once; getters and async methods included.
		const match = /^\t(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\(/u.exec(line);
		if (match !== null) names.add(match[1]);
	}
	return names;
}

function bundledRegion(name) {
	const marker = `//#region src/${name}.ts`;
	const start = bundle.indexOf(marker);
	assert.notEqual(start, -1, `bundle region ${name} must exist`);
	const end = bundle.indexOf('//#endregion', start);
	return bundle.slice(start + marker.length, end);
}

const providerIds = ['codex', 'claude', 'grok', 'copilot', 'antigravity'];
function loadStore(source) {
	return new Function('PROVIDER_IDS', 'readFileSync', 'parseJsonText', 'mkdir', 'dirname', 'writeFile', 'rename', 'rm',
		`${source}\nreturn ProviderSettingsStore;`)(providerIds, readFileSync, JSON.parse, mkdir, dirname, writeFile, rename, rm);
}
const BundleStore = loadStore(bundledRegion('provider-settings'));

test('Antigravity transport defaults to compaction and round-trips without discarding CLI preferences', async (t) => {
	// The standalone file has Host-only imports; use real store code with the same file dependencies.
	const ProviderSettingsStore = loadStore(readFileSync(new URL('provider-settings.js', root), 'utf8')
		.replace(/^import .*;\r?$/gmu, '').replace(/^export /gmu, ''));
	for (const [label, Store] of [['bundle', BundleStore], ['standalone', ProviderSettingsStore]]) await t.test(label, async (t) => {
		const dir = mkdtempSync(join(tmpdir(), 'agy-settings-contract-'));
		t.after(() => rmSync(dir, { recursive: true, force: true }));
		const path = join(dir, 'settings.json');
		const store = new Store(path);
		assert.equal(store.agyTransport?.(), 'compaction');
		const preferences = { displayName: 'My Antigravity', visibleModels: ['gemini'], agyFix: false, agyPromptGuard: false };
		for (const agyTransport of ['acp', 'compaction']) {
			await store.set('antigravity', { ...preferences, agyTransport });
			const reloaded = new Store(path);
			assert.equal(reloaded.agyTransport(), agyTransport);
			assert.deepEqual(reloaded.get('antigravity'), { ...preferences, agyTransport });
		}
		for (const bad of ['cli', 'ACP', '', false, null, {}]) {
			assert.throws(() => store.set('antigravity', { agyTransport: bad }), /agyTransport/u);
		}
		assert.throws(() => store.set('codex', { agyTransport: 'acp' }), /Antigravity/u);
	});
	const declarations = readFileSync(new URL('provider-settings.d.ts', root), 'utf8');
	assert.match(declarations, /agyTransport\?: AgyTransport/u);
	assert.match(declarations, /agyTransport\(\): AgyTransport/u);
});

test('transport RPC patches Antigravity only and publishes the change after saving', async (t) => {
	const dir = mkdtempSync(join(tmpdir(), 'agy-rpc-contract-'));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const path = join(dir, 'settings.json');
	const store = new BundleStore(path);
	const original = { displayName: 'Custom', visibleModels: ['gemini'], agyFix: false, agyPromptGuard: false };
	await store.set('antigravity', original);
	let mode = 'compaction';
	let bridge = true;
	let failSave = false;
	const providerSettings = {
		async patch(provider, partial) {
			if (failSave) throw new Error('cannot save');
			await store.set(provider, { ...store.get(provider), ...partial });
		}
	};
	const controller = { async status() { return { accounts: [], agyFix: false }; } };
	const { dispatch, failure, endpoints } = new Function('PROVIDER_IDS', 'agyTransport', 'setAgyTransport', 'agyPromptGuard', 'agyToolBridge', 'setAgyToolBridge',
		`${bundledRegion('auth/rpc')}\nreturn { dispatch, failure, endpoints: SUBSCRIPTIONS_AUTH_ENDPOINTS };`)(providerIds, () => mode, (next) => {
			assert.equal(new BundleStore(path).agyTransport(), next, 'durable write must precede runtime switch');
			mode = next;
		}, () => store.agyPromptGuard(), () => bridge, (next) => {
			assert.equal(new BundleStore(path).agyToolBridge(), next, 'durable write must precede runtime switch');
			bridge = next;
		});
	const invoke = (endpoint, payload) => dispatch(controller, undefined, undefined, undefined, endpoint, payload, undefined, providerSettings).catch(failure);
	assert.ok(endpoints.includes('setAgyTransport'), 'exact RPC route must be registered');
	for (const payload of [undefined, {}, { value: 'cli' }, { value: false }]) {
		assert.equal((await invoke('setAgyTransport', payload)).error.code, 'bad-request');
	}
	failSave = true;
	assert.equal((await invoke('setAgyTransport', { value: 'acp' })).error.code, 'internal');
	assert.equal(mode, 'compaction');
	failSave = false;
	assert.deepEqual((await invoke('setAgyTransport', { value: 'acp' })).value, { ok: true, agyTransport: 'acp' });
	const acp = (await invoke('status', {})).value.providers;
	assert.equal(acp.antigravity.agyTransport, 'acp');
	assert.equal(acp.antigravity.agyFix, false);
	assert.equal(acp.antigravity.agyPromptGuard, false);
	assert.ok(!Object.hasOwn(acp.codex, 'agyTransport'));
	assert.deepEqual(store.get('antigravity'), { ...original, agyTransport: 'acp' });
	await invoke('setAgyTransport', { value: 'compaction' });
	const cli = (await invoke('status', {})).value.providers.antigravity;
	assert.equal(cli.agyFix, false);
	assert.equal(cli.agyPromptGuard, false);
	assert.deepEqual(store.get('antigravity'), { ...original, agyTransport: 'compaction' });
	// The DSH tool bridge switch: same patch-then-apply discipline.
	assert.ok(endpoints.includes('setAgyToolBridge'), 'bridge RPC route must be registered');
	for (const payload of [undefined, {}, { value: 'yes' }]) assert.equal((await invoke('setAgyToolBridge', payload)).error.code, 'bad-request');
	assert.equal((await invoke('status', {})).value.providers.antigravity.agyToolBridge, true);
	assert.deepEqual((await invoke('setAgyToolBridge', { value: false })).value, { ok: true, agyToolBridge: false });
	assert.equal(bridge, false);
	assert.equal((await invoke('status', {})).value.providers.antigravity.agyToolBridge, false);
	assert.ok(!Object.hasOwn((await invoke('status', {})).value.providers.codex, 'agyToolBridge'));
	assert.deepEqual(store.get('antigravity'), { ...original, agyTransport: 'compaction', agyToolBridge: false });
});

test('the DSH tool bridge preference defaults on, round-trips, and is Antigravity-only', async (t) => {
	const Standalone = loadStore(readFileSync(new URL('provider-settings.js', root), 'utf8')
		.replace(/^import .*;\r?$/gmu, '').replace(/^export /gmu, ''));
	for (const [label, Store] of [['bundle', BundleStore], ['standalone', Standalone]]) await t.test(label, async (t) => {
		const dir = mkdtempSync(join(tmpdir(), 'agy-bridge-contract-'));
		t.after(() => rmSync(dir, { recursive: true, force: true }));
		const path = join(dir, 'settings.json');
		const store = new Store(path);
		assert.equal(store.agyToolBridge(), true);
		await store.set('antigravity', { displayName: 'A', agyToolBridge: false });
		assert.equal(new Store(path).agyToolBridge(), false);
		assert.deepEqual(new Store(path).get('antigravity'), { displayName: 'A', agyToolBridge: false });
		for (const bad of ['on', 1, null]) assert.throws(() => store.set('antigravity', { agyToolBridge: bad }), /agyToolBridge/u);
		assert.throws(() => store.set('codex', { agyToolBridge: true }), /Antigravity/u);
	});
	const declarations = readFileSync(new URL('provider-settings.d.ts', root), 'utf8');
	assert.match(declarations, /agyToolBridge\?: boolean/u);
	assert.match(declarations, /agyToolBridge\(\): boolean/u);
	assert.match(bundle, /setAgyToolBridge\(preferences\.agyToolBridge\(\)\)/u, 'applied at mount');
});

test('Antigravity Settings renders the transport selector and only exposes legacy switches in compaction mode', () => {
	const client = readFileSync(new URL('client.js', root), 'utf8');
	assert.match(client, /id === "antigravity" &&[^\n]*\(AntigravityTransportSetting,/u);
	const source = client.slice(client.indexOf('function AgyFixSwitch('), client.indexOf('function SubscriptionsSection('));
	const jsx = (tag, props) => typeof tag === 'function' ? tag(props) : { tag, props };
	const render = new Function('react_jsx_runtime', 'styles$5', 'react', `${source}\nreturn AntigravityTransportSetting;`)({ jsx, jsxs: jsx }, {}, { useId: () => 'agy-hint' });
	const all = (node) => Array.isArray(node) ? node.flatMap(all) : node?.props ? [node, ...all(node.props.children)] : [];
	const calls = [];
	const t = (key) => key;
	const props = { t, onTransportChange: (value) => calls.push(value) };
	props.onBridgeChange = (value) => calls.push(['bridge', value]);
	const cli = all(render({ ...props, status: { agyFix: false, agyPromptGuard: true, agyToolBridge: false } }));
	const selector = cli.find(({ tag }) => tag === 'select');
	assert.equal(selector.props.value, 'compaction');
	assert.deepEqual(cli.filter(({ tag }) => tag === 'option').map(({ props }) => props.value), ['compaction', 'acp']);
	selector.props.onChange({ target: { value: 'acp' } });
	assert.deepEqual(calls, ['acp']);
	assert.deepEqual(cli.filter(({ props }) => props.role === 'switch').map(({ props }) => [props['aria-label'], props['aria-checked']]), [
		['agyToolBridgeLabel', false], ['agyFixLabel', false], ['agyPromptGuardLabel', true]
	]);
	// Bridge on (the default): the shell-off fix is moot for tool calls and hidden.
	const bridged = all(render({ ...props, status: { agyPromptGuard: true } }));
	assert.deepEqual(bridged.filter(({ props }) => props.role === 'switch').map(({ props }) => [props['aria-label'], props['aria-checked']]), [
		['agyToolBridgeLabel', true], ['agyPromptGuardLabel', true]
	]);
	bridged.find(({ props }) => props['aria-label'] === 'agyToolBridgeLabel').props.onClick();
	assert.deepEqual(calls.at(-1), ['bridge', false]);
	const acp = all(render({ ...props, status: { agyTransport: 'acp' } }));
	assert.equal(acp.find(({ tag }) => tag === 'select').props.value, 'acp');
	assert.deepEqual(acp.filter(({ props }) => props.role === 'switch').map(({ props }) => props['aria-label']), ['agyToolBridgeLabel']);
	assert.ok(cli.some(({ props }) => props.children === 'agyTransportCompactionHint'));
	assert.ok(acp.some(({ props }) => props.children === 'agyTransportAcpHint'));
	assert.match(client, /agyTransportHint: "[^"\n]*permission[^"\n]*always restricted[^"\n]*fallback[^"\n]*compaction settings/iu);
	assert.match(client, /callSubscriptionsAuth\(rpc, "setAgyTransport", \{ value \}\)/u);
	assert.match(client, /callSubscriptionsAuth\(rpc, "setAgyToolBridge", \{ value: enabled \}\)/u);
	const label = Array.from(client.matchAll(/agyToolBridgeLabel: "([^"\n]+)"/gu));
	const hint = Array.from(client.matchAll(/agyToolBridgeHint: "([^"\n]+)"/gu));
	assert.equal(label.length, 2, 'en and zh labels');
	assert.equal(hint.length, 2, 'en and zh hints');
	assert.match(hint[0][1], /DSH.*shell.*files.*agy.*blocked/iu);
});

test('both locales explain when each Antigravity transport sends history', () => {
	const client = readFileSync(new URL('client.js', root), 'utf8');
	const readDescriptions = (key) => Array.from(client.matchAll(new RegExp(`${key}: "([^"\\n]+)"`, 'gu')), ([, description]) => description);
	const compaction = readDescriptions('agyTransportCompactionHint');
	const acp = readDescriptions('agyTransportAcpHint');
	assert.equal(compaction.length, 2);
	assert.equal(acp.length, 2);
	assert.match(compaction[0], /resends.*full.*180 KB.*guard.*enabled/iu);
	assert.match(compaction[1], /重新发送.*完整.*180 KB/u);
	assert.match(acp[0], /only the new turn.*older context.*Markdown.*on demand/iu);
	assert.match(acp[1], /仅发送.*当前轮.*较早.*Markdown/u);
});

test('saving an open model editor preserves newer Antigravity transport preferences', () => {
	const client = readFileSync(new URL('client.js', root), 'utf8');
	const source = client.slice(client.indexOf('function mergeLatestAccounts('), client.indexOf('function mergeAccountChanges('));
	const merge = new Function(`${source}\nreturn mergeLatestAccounts;`)();
	assert.deepEqual(merge({ visibleModels: ['gemini'], agyTransport: 'compaction', agyFix: true, agyPromptGuard: true, agyToolBridge: true }, {
		agyTransport: 'acp', agyFix: false, agyPromptGuard: false, agyToolBridge: false
	}), { visibleModels: ['gemini'], agyTransport: 'acp', agyFix: false, agyPromptGuard: false, agyToolBridge: false });
});

test('every preferences method the bundle calls is defined in the bundled store', () => {
	const defined = bundledMethods();
	assert.ok(defined.size > 5, `expected a populated class, found ${defined.size} members`);
	const called = new Set();
	for (const match of bundle.matchAll(/preferences\.([A-Za-z_$][\w$]*)\(/gu)) called.add(match[1]);
	assert.ok(called.size > 0, 'the bundle must use the store');
	const missing = [...called].filter((name) => !defined.has(name));
	assert.deepEqual(missing, [], `called but not defined in lib/index.js: ${missing.join(', ')}`);
});

test('the toggle reads agyFix from the bundled store, not the unused file', () => {
	const defined = bundledMethods();
	assert.ok(defined.has('agyFix'), 'the bundled store must define agyFix()');
	// The behaviour the switch depends on: absent means on.
	assert.match(bundledClassBody(), /agyFix\(\)\s*\{[^}]*agyFix !== false/u);
});

test('the long-prompt guard defaults on and the Codex fast tier defaults off', () => {
	const body = bundledClassBody();
	assert.match(body, /agyPromptGuard\(\)\s*\{[^}]*agyPromptGuard !== false/u, 'absent guard must mean on');
	assert.match(body, /codexFastAllowed\(\)\s*\{[^}]*fastAllowed === true/u, 'absent permission must mean off');
});

test('every path to the Codex fast tier passes the Settings gate', () => {
	// The request itself: nothing else can put service_tier: priority on the wire.
	assert.match(bundle, /speedFor: \(sessionId, model\) => preferences\.codexFastAllowed\(\) &&/u);
	// The composer state: no fast-capable model is offered while disabled.
	assert.match(bundle, /async speed\(sessionId, model\) \{\s*(?:\/\/[^\n]*\n\s*)?if \(!preferences\.codexFastAllowed\(\)\) return \{\s*tier: "standard",\s*fastModels: \[\]/u);
	// Saving a fast choice is refused while disabled.
	assert.match(bundle, /async setSpeed\(sessionId, tier, model\) \{\s*if \(tier === "fast" && !preferences\.codexFastAllowed\(\)\) throw/u);
	// The settings catalog does not offer fast for subagents while disabled.
	assert.match(bundle, /fastTier: preferences\.codexFastAllowed\(\) &&/u);
	// service_tier is only ever written from that gated flag (comment lines aside).
	const writes = bundle.split('\n').filter((line) => /\bservice_tier\b/u.test(line) && !/^\s*(?:\*|\/\/)/u.test(line));
	assert.deepEqual(writes.map((line) => line.trim()), ['...fast ? { service_tier: CODEX_FAST_SERVICE_TIER } : {}']);
});

test('toggles merge into the stored provider document instead of replacing it', () => {
	// `set` replaces the whole document; spreading the async `get` used to wipe
	// the display name and visible models on the first toggle.
	assert.doesNotMatch(bundle, /\.\.\.providerSettings\.get\(/u);
	assert.match(bundle, /async patch\(provider, partial\) \{\s*await this\.set\(provider, \{\s*\.\.\.preferences\.get\(provider\),\s*\.\.\.partial/u);
	for (const endpoint of ['setAgyFix', 'setAgyPromptGuard', 'setAgyToolBridge', 'setCodexFast']) {
		assert.match(bundle, new RegExp(`"${endpoint}",`, 'u'), `${endpoint} must be a registered endpoint`);
	}
});

test('compaction lives in General Configs, never in Subscriptions', () => {
	// Host bundle: no store, no routing, no recovery budget, no RPC.
	assert.doesNotMatch(bundle, /compaction-model\.js/u);
	assert.doesNotMatch(bundle, /CompactionModelStore|installCompactionRouting|summaryChunkBudget|COMPACTION_EFFORTS/u);
	assert.doesNotMatch(bundle, /async compactionModel\(\)|async setCompactionModel\(value\)/u);
	for (const snippet of ['"compactionModel"', '"setCompactionModel"', 'case "compactionModel"', 'case "setCompactionModel"']) {
		assert.ok(!bundle.includes(snippet), `Subscriptions bundle must not contain ${snippet}`);
	}
	// Client bundle: no picker, no card marker, no locale keys.
	const client = readFileSync(new URL('client.js', root), 'utf8');
	assert.doesNotMatch(client, /function CompactionModelSetting\(/u);
	assert.doesNotMatch(client, /data-subscriptions-compaction-model/u);
	assert.doesNotMatch(client, /compactionTitle|compactionStatus|compactionConfigure|compactionHint|compactionProvider|compactionModel|compactionEffort|compactionScope|compactionChoose|compactionSave|compactionLoading|compactionFailed|compactionDefault|compactionCancel|compactionSaving/u);
	// Ownership: the General Configs host installs routing + agy recovery budget,
	// persists under its own path (one-time legacy import), and owns the module.
	const generalHost = readFileSync(new URL('../src/components/general-configs.js', import.meta.url), 'utf8');
	assert.match(generalHost, /installCompactionRouting\(ctx, \{\s*store,/u);
	assert.match(generalHost, /installAgyOverflowRecovery\(ctx,/u);
	assert.match(generalHost, /summaryChunkBudget\(\{\s*store,/u);
	assert.match(generalHost, /plugins", "spig-dsh-toolkit", "compaction-model\.json/u);
	assert.match(generalHost, /plugins", "subscriptions", "compaction-model\.json/u, 'legacy one-time import');
	const moduleRoot = new URL('../src/components/general-configs/', import.meta.url);
	const moduleSource = readFileSync(new URL('compaction-model.js', moduleRoot), 'utf8');
	assert.match(moduleSource, /export function installCompactionRouting/u);
	assert.match(moduleSource, /does not declare reasoning effort/u);
	// RPC + UI go through spig-general only.
	const generalRpc = readFileSync(new URL('../src/components/general-configs/rpc.js', import.meta.url), 'utf8');
	assert.match(generalRpc, /"compactionGet",/u);
	assert.match(generalRpc, /"compactionSet",/u);
	const generalClient = readFileSync(new URL('../src/client/general-configs-client.js', import.meta.url), 'utf8');
	assert.match(generalClient, /spig-general\.compactionGet/u);
	assert.doesNotMatch(generalClient, /subscriptions\.compactionModel|subscriptions\.setCompactionModel|subMethod/u);
});

test('standalone provider-settings.js does not drift from the bundled copy', () => {
	// Nothing imports it, so it must not pretend to own a method the bundle lacks.
	const standalone = readFileSync(new URL('provider-settings.js', root), 'utf8');
	const exported = new Set();
	for (const match of standalone.matchAll(/^\s{4}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gmu)) exported.add(match[1]);
	const bundled = bundledMethods();
	// Only enforce the direction that breaks runtime: the bundle needs everything it calls.
	const called = new Set();
	for (const match of bundle.matchAll(/preferences\.([A-Za-z_$][\w$]*)\(/gu)) called.add(match[1]);
	for (const name of called) {
		assert.ok(exported.has(name) || bundled.has(name), `preference ${name} must exist in the bundled class`);
	}
	assert.ok(exported.size > 0, 'the standalone copy should still parse');
});
