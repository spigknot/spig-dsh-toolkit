import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
	computeCodeFingerprint,
	createLifecycleLogger,
	flushLifecycleLogs,
	mountWithLifecycleJournal,
	registerAdapterWithJournal,
} from '../components/subscriptions/lib/lifecycle-journal.js';

const parseJsonl = (raw) => raw.trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));

test('computeCodeFingerprint hashes package version, index.js, and Antigravity route modules', () => {
	const fp = computeCodeFingerprint();
	assert.match(fp.packageVersion, /^\d+\.\d+\.\d+/u);
	assert.match(fp.indexSha256, /^[0-9a-f]{12}$/u);
	assert.match(fp.antigravitySha256, /^[0-9a-f]{12}$/u);
	assert.match(fp.combined, /^[0-9a-f]{12}$/u);
	assert.deepEqual(computeCodeFingerprint(), fp, 'fingerprint must be deterministic');
});

test('lifecycle journal writes always-on events independent of DSH_AGY_DEBUG and rotates at maxBytes', async (t) => {
	const dir = await mkdtemp(join(tmpdir(), 'spig-lifecycle-'));
	const logFile = join(dir, 'subscriptions-lifecycle.log');
	const prevDebug = process.env.DSH_AGY_DEBUG;
	process.env.DSH_AGY_DEBUG = '0';
	t.after(async () => {
		if (prevDebug === undefined) delete process.env.DSH_AGY_DEBUG;
		else process.env.DSH_AGY_DEBUG = prevDebug;
		await rm(dir, { recursive: true, force: true });
	});

	const log = createLifecycleLogger({ logFile, maxBytes: 450, mirrorToDebug: false });
	await log({ event: 'subscriptions-mount:begin', mountId: 'm1' });
	await log({ event: 'antigravity-register:ok', provider: 'antigravity', mountId: 'm1' });
	await log({ event: 'subscriptions-mount:returned', mountId: 'm1' });
	await log({ event: 'subscriptions-unmount', mountId: 'm1' });

	assert.equal(existsSync(logFile), true);
	assert.equal(existsSync(`${logFile}.1`), true, 'log must rotate to .1 once it exceeds maxBytes');
	const rotated = parseJsonl(await readFile(`${logFile}.1`, 'utf8'));
	const current = parseJsonl(await readFile(logFile, 'utf8'));
	const all = [...rotated, ...current];
	assert.equal(all.length, 4);
	assert.ok(all.every((entry) => entry.code?.combined && entry.code?.indexSha256 && entry.code?.antigravitySha256));
});

test('registerAdapterWithJournal records failure stack and fingerprint when registerAdapter throws', async (t) => {
	const dir = await mkdtemp(join(tmpdir(), 'spig-lifecycle-reg-'));
	const logFile = join(dir, 'subscriptions-lifecycle.log');
	t.after(async () => { await rm(dir, { recursive: true, force: true }); });

	const log = createLifecycleLogger({ logFile, mirrorToDebug: false });
	const cleanups = [];
	const fakeCtx = {
		llm: {
			registerAdapter() {
				throw new Error('duplicate provider registration');
			},
		},
		effect(fn) {
			const cleanup = fn();
			if (typeof cleanup === 'function') cleanups.push(cleanup);
		},
	};

	assert.throws(
		() => registerAdapterWithJournal(fakeCtx, { provider: 'antigravity', adapter: {}, providers: ['antigravity'], mountId: 'fail-1', log }),
		/duplicate provider registration/u,
	);
	await flushLifecycleLogs();
	const events = parseJsonl(await readFile(logFile, 'utf8'));
	assert.deepEqual(events.map((e) => e.event), ['antigravity-register:begin', 'antigravity-register:failed']);
	assert.equal(events[1].provider, 'antigravity');
	assert.equal(events[1].mountId, 'fail-1');
	assert.match(events[1].stack, /duplicate provider registration/u);
	assert.match(events[1].code.combined, /^[0-9a-f]{12}$/u);
	assert.equal(cleanups.length, 0, 'unmount effect should not register when adapter registration fails');
});

test('registerAdapterWithJournal and mountWithLifecycleJournal record full mount/unmount lifecycle', async (t) => {
	const dir = await mkdtemp(join(tmpdir(), 'spig-lifecycle-ok-'));
	const logFile = join(dir, 'subscriptions-lifecycle.log');
	t.after(async () => { await rm(dir, { recursive: true, force: true }); });

	const log = createLifecycleLogger({ logFile, mirrorToDebug: false });
	const cleanups = [];
	const fakeCtx = {
		llm: {
			registerAdapter(ids) {
				return { ids, dispose() {} };
			},
		},
		effect(fn) {
			const cleanup = fn();
			if (typeof cleanup === 'function') cleanups.push(cleanup);
		},
	};

	mountWithLifecycleJournal(fakeCtx, {
		component: 'subscriptions',
		mountId: 'ok-1',
		log,
		apply(ctx) {
			registerAdapterWithJournal(ctx, { provider: 'antigravity', adapter: {}, providers: ['antigravity'], mountId: 'ok-1', log });
		},
	});
	for (const cleanup of cleanups) cleanup();
	await flushLifecycleLogs();

	const events = parseJsonl(await readFile(logFile, 'utf8'));
	assert.deepEqual(events.map((e) => e.event), [
		'subscriptions-mount:begin',
		'antigravity-register:begin',
		'antigravity-register:ok',
		'subscriptions-mount:returned',
		'subscriptions-unmount',
		'antigravity-unmount',
	]);
});

test('subscriptions bundle and component wrapper wire the always-on lifecycle journal', () => {
	const bundle = readFileSync(new URL('../components/subscriptions/lib/index.js', import.meta.url), 'utf8');
	const wrapper = readFileSync(new URL('../src/components/subscriptions.js', import.meta.url), 'utf8');
	assert.match(bundle, /registerAdapterWithJournal\(ctx,/u);
	assert.match(wrapper, /mountWithLifecycleJournal\(ctx,/u);
});

test('DSH_AGY_DEBUG=0 prevents tests from writing to agy-debug.log even when agy-debug.flag exists', async (t) => {
	const { agyDebugEnabled, debugLog } = await import('../components/subscriptions/lib/antigravity-cli-local.js');
	const fakeHome = await mkdtemp(join(tmpdir(), 'spig-dsh-home-'));
	const subDir = join(fakeHome, 'plugins', 'subscriptions');
	await mkdir(subDir, { recursive: true });
	await writeFile(join(subDir, 'agy-debug.flag'), '', 'utf8');
	const prevHome = process.env.DSH_HOME;
	const prevDebug = process.env.DSH_AGY_DEBUG;
	const prevLog = process.env.DSH_AGY_DEBUG_LOG;
	process.env.DSH_HOME = fakeHome;
	process.env.DSH_AGY_DEBUG = '0';
	delete process.env.DSH_AGY_DEBUG_LOG;
	t.after(async () => {
		if (prevHome === undefined) delete process.env.DSH_HOME;
		else process.env.DSH_HOME = prevHome;
		if (prevDebug === undefined) delete process.env.DSH_AGY_DEBUG;
		else process.env.DSH_AGY_DEBUG = prevDebug;
		if (prevLog === undefined) delete process.env.DSH_AGY_DEBUG_LOG;
		else process.env.DSH_AGY_DEBUG_LOG = prevLog;
		await rm(fakeHome, { recursive: true, force: true });
	});

	assert.equal(agyDebugEnabled(), false);
	await debugLog({ fallback: true, reason: 'TEST_ISOLATION' });
	assert.equal(existsSync(join(subDir, 'agy-debug.log')), false, 'agy-debug.log must not be created when DSH_AGY_DEBUG=0');
});

test('diagnose-antigravity.mjs --check-live exits 0 on matching fingerprint and 1 on drift', async (t) => {
	const { spawnSync } = await import('node:child_process');
	const scriptPath = new URL('../scripts/diagnose-antigravity.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
	const fakeHome = await mkdtemp(join(tmpdir(), 'spig-diag-live-'));
	const subDir = join(fakeHome, 'plugins', 'subscriptions');
	await mkdir(subDir, { recursive: true });
	t.after(async () => { await rm(fakeHome, { recursive: true, force: true }); });

	const fp = computeCodeFingerprint();
	const logFile = join(subDir, 'subscriptions-lifecycle.log');
	await writeFile(logFile, `${JSON.stringify({ at: new Date().toISOString(), pid: 1234, event: 'antigravity-register:ok', mountId: 'm1', code: fp })}\n`, 'utf8');
	const okRes = spawnSync(process.execPath, [scriptPath, '--check-live'], { env: { ...process.env, DSH_HOME: fakeHome }, encoding: 'utf8' });
	assert.equal(okRes.status, 0, okRes.stdout + okRes.stderr);
	assert.match(okRes.stdout, /LIVE PARITY: OK/u);

	const staleFp = { ...fp, combined: '000000000000' };
	await writeFile(logFile, `${JSON.stringify({ at: new Date().toISOString(), pid: 1234, event: 'antigravity-register:ok', mountId: 'm2', code: staleFp })}\n`, 'utf8');
	const driftRes = spawnSync(process.execPath, [scriptPath, '--check-live'], { env: { ...process.env, DSH_HOME: fakeHome }, encoding: 'utf8' });
	assert.equal(driftRes.status, 1, driftRes.stdout + driftRes.stderr);
	assert.match(driftRes.stdout, /LIVE PARITY: DRIFT/u);
});
