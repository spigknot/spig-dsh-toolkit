/**
 * Always-on, size-bounded rotating lifecycle journal for the Subscriptions
 * component and Antigravity adapter.
 *
 * Records mount, adapter-registration, registration-failure (with stack), and
 * unmount events along with a fingerprint of the loaded code (package.json
 * version + SHA-256 of index.js + SHA-256 of the Antigravity route modules),
 * independent of the opt-in prompt/response diagnostic flag.
 *
 * Every filesystem error is swallowed: diagnostics must never break plugin
 * lifecycle.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { debugLog } from './antigravity-cli-local.js';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(LIB_DIR, '..', '..', '..');

export const DEFAULT_MAX_LOG_BYTES = 256 * 1024;

const writeQueues = new Map();

function defaultLogPath() {
	const override = process.env.DSH_SUBSCRIPTIONS_LIFECYCLE_LOG?.trim();
	if (override) return override;
	const dshHome = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
	return join(dshHome, 'plugins', 'subscriptions', 'subscriptions-lifecycle.log');
}

function shortSha256(content) {
	return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

/**
 * Compute a deterministic fingerprint of the loaded Subscriptions + Antigravity
 * code on disk at load time.
 */
export function computeCodeFingerprint({ libDir = LIB_DIR, repoRoot = REPO_ROOT } = {}) {
	let packageVersion = 'unknown';
	try {
		const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
		if (typeof pkg?.version === 'string' && pkg.version.trim()) packageVersion = pkg.version.trim();
	} catch {}

	let indexSha256 = 'missing';
	try {
		const indexPath = join(libDir, 'index.js');
		if (existsSync(indexPath)) indexSha256 = shortSha256(readFileSync(indexPath));
	} catch {}

	let antigravitySha256 = 'missing';
	try {
		const files = readdirSync(libDir)
			.filter((name) => /^antigravity-.*\.js$/u.test(name) || name === 'compaction-model.js' || name === 'lifecycle-journal.js')
			.sort();
		if (files.length > 0) {
			const hash = createHash('sha256');
			for (const name of files) {
				hash.update(`${name}\n`);
				hash.update(readFileSync(join(libDir, name)));
				hash.update('\n');
			}
			antigravitySha256 = hash.digest('hex').slice(0, 12);
		}
	} catch {}

	const combined = shortSha256(`${packageVersion}:${indexSha256}:${antigravitySha256}`);
	return { packageVersion, indexSha256, antigravitySha256, combined };
}

let cachedFingerprint;
export function loadedCodeFingerprint() {
	return (cachedFingerprint ??= computeCodeFingerprint());
}

export function newMountId() {
	return randomBytes(4).toString('hex');
}

async function rotateIfNeeded(file, maxBytes) {
	try {
		const info = await stat(file);
		if (info.size < maxBytes) return;
		const backup = `${file}.1`;
		await unlink(backup).catch(() => {});
		await rename(file, backup);
	} catch {}
}

/**
 * Append one structured lifecycle event to the rotating log.
 * Always active (does not depend on agy-debug.flag / DSH_AGY_DEBUG).
 */
export function createLifecycleLogger({ logFile, maxBytes = DEFAULT_MAX_LOG_BYTES, fingerprintOf = loadedCodeFingerprint, mirrorToDebug = true } = {}) {
	return function log(record) {
		const file = typeof logFile === 'function' ? logFile() : (logFile ?? defaultLogPath());
		const entry = {
			at: new Date().toISOString(),
			pid: process.pid,
			code: fingerprintOf(),
			...record,
		};
		const line = `${JSON.stringify(entry)}\n`;
		const previous = writeQueues.get(file) ?? Promise.resolve();
		const current = previous.catch(() => {}).then(async () => {
			try {
				await mkdir(dirname(file), { recursive: true, mode: 0o700 });
				await rotateIfNeeded(file, maxBytes);
				await appendFile(file, line, { encoding: 'utf8', mode: 0o600 });
			} catch {}
			if (mirrorToDebug) {
				await debugLog({ lifecycle: entry.event, ...record, code: entry.code }).catch(() => {});
			}
		});
		writeQueues.set(file, current);
		current.finally(() => {
			if (writeQueues.get(file) === current) writeQueues.delete(file);
		});
		return current;
	};
}

export const lifecycleLog = createLifecycleLogger();

/** Wait for all queued lifecycle writes to settle (useful in tests). */
export async function flushLifecycleLogs() {
	await Promise.all([...writeQueues.values()]);
}

/**
 * Wrap plugin mount/unmount with always-on lifecycle events.
 */
export function mountWithLifecycleJournal(ctx, { component = 'subscriptions', apply, config, mountId = newMountId(), log = lifecycleLog }) {
	void log({ event: `${component}-mount:begin`, component, mountId });
	ctx.effect?.(() => () => {
		void log({ event: `${component}-unmount`, component, mountId });
	});
	try {
		const result = apply(ctx, config ?? {});
		void log({ event: `${component}-mount:returned`, component, mountId });
		return result;
	} catch (error) {
		void log({
			event: `${component}-mount:failed`,
			component,
			mountId,
			error: String(error?.message ?? error).slice(0, 500),
			stack: String(error?.stack ?? error).slice(0, 2000),
		});
		throw error;
	}
}

/**
 * Register one LLM provider adapter while recording begin/ok/failed/unmount
 * events in the always-on lifecycle journal.
 */
export function registerAdapterWithJournal(ctx, { provider, adapter, providers, mountId = newMountId(), log = lifecycleLog }) {
	void log({ event: `${provider}-register:begin`, provider, mountId, ...(providers ? { providers } : {}) });
	let handle;
	try {
		handle = ctx.llm.registerAdapter([provider], adapter);
		void log({ event: `${provider}-register:ok`, provider, mountId });
	} catch (error) {
		void log({
			event: `${provider}-register:failed`,
			provider,
			mountId,
			error: String(error?.message ?? error).slice(0, 500),
			stack: String(error?.stack ?? error).slice(0, 2000),
		});
		throw error;
	}
	ctx.effect?.(() => () => {
		void log({ event: `${provider}-unmount`, provider, mountId });
	}, `dsh-plugin-subscriptions: ${provider} adapter lifecycle journal`);
	return handle;
}
