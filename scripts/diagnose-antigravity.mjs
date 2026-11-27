/**
 * Read-only diagnostic summary for Antigravity route incidents.
 *
 * Usage:
 *   node scripts/diagnose-antigravity.mjs [session-id-or-substring] [--check-live]
 *
 * Never prints prompts, user messages, tool contents, or credentials.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { computeCodeFingerprint } from '../components/subscriptions/lib/lifecycle-journal.js';

const dshHome = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
const subDir = join(dshHome, 'plugins', 'subscriptions');
const acpRoot = join(subDir, 'agy-acp');
const rawArgs = process.argv.slice(2);
const checkLive = rawArgs.includes('--check-live');
const query = rawArgs.find((a) => !a.startsWith('--'))?.trim() || '';
const diskFingerprint = computeCodeFingerprint();

function safeReadJsonl(file, tail = 10) {
	if (!existsSync(file)) return [];
	const lines = readFileSync(file, 'utf8').split(/\r?\n/u).filter(Boolean).slice(-tail);
	const out = [];
	for (const line of lines) {
		try { out.push(JSON.parse(line)); } catch {}
	}
	return out;
}

function sanitizeText(value, max = 140) {
	return String(value ?? '').replace(/[\r\n\t]+/gu, ' ').replace(/Bearer\s+\S+/giu, 'Bearer [REDACTED]').slice(0, max);
}

function findSessionFile(sessionsDir, needle) {
	if (!needle || !existsSync(sessionsDir)) return null;
	const stack = [sessionsDir];
	while (stack.length > 0) {
		const dir = stack.pop();
		let entries;
		try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name.includes(needle)) {
					const candidate = join(full, 'session.v4.jsonl.zstd');
					if (existsSync(candidate)) return { sessionId: entry.name, file: candidate };
				}
				stack.push(full);
			}
		}
	}
	return null;
}

console.log('=== Antigravity Route Diagnostic (read-only) ===');
console.log(`DSH_HOME: ${dshHome}`);
console.log(`Disk code fingerprint: ${diskFingerprint.packageVersion}/${diskFingerprint.combined}`);
console.log(`agy-debug.flag: ${existsSync(join(subDir, 'agy-debug.flag'))}`);

// 1. Always-on lifecycle journal
console.log('\n-- Lifecycle Journal (last 8) --');
const lifecyclePath = join(subDir, 'subscriptions-lifecycle.log');
const lifecycleEvents = safeReadJsonl(lifecyclePath, 8);
if (lifecycleEvents.length === 0) {
	console.log('  (no entries yet in subscriptions-lifecycle.log)');
} else {
	for (const ev of lifecycleEvents) {
		const fp = ev.code ? `${ev.code.packageVersion}/${ev.code.combined}` : 'n/a';
		const err = ev.error ? ` err="${sanitizeText(ev.error, 100)}"` : '';
		console.log(`  ${ev.at} pid=${ev.pid ?? '?'} ${ev.event} mount=${ev.mountId ?? '-'} code=${fp}${err}`);
	}
}

// 2. Opt-in debug log (filtered: no prompts/responses)
const debugPath = join(subDir, 'agy-debug.log');
const debugEvents = safeReadJsonl(debugPath, 20).filter((e) => e.fallback || e.failure || e.lifecycle);
if (debugEvents.length > 0) {
	console.log('\n-- Opt-in Debug Journal (recent lifecycle/fallback/failure, redacted) --');
	for (const ev of debugEvents.slice(-6)) {
		if (ev.lifecycle) console.log(`  ${ev.at} lifecycle=${ev.lifecycle} mount=${ev.mountId ?? '-'}`);
		else if (ev.fallback) console.log(`  ${ev.at} fallback reason=${ev.reason} stage=${ev.stage} detail="${sanitizeText(ev.detail, 90)}" session=${ev.session ?? '-'}`);
		else if (ev.failure) console.log(`  ${ev.at} failure model=${ev.model ?? '?'} code=${ev.failure.code} msg="${sanitizeText(ev.failure.message, 90)}"`);
	}
}

// 3. Resolve session (optional query)
let resolvedSessionId = query;
let sessionFile = null;
if (query) {
	const found = findSessionFile(join(dshHome, 'sessions'), query);
	if (found) {
		resolvedSessionId = found.sessionId;
		sessionFile = found.file;
	}
}
const acpKey = resolvedSessionId ? createHash('sha256').update(JSON.stringify(String(resolvedSessionId))).digest('hex') : '';

// 4. ACP bindings
console.log('\n-- ACP Bindings --');
const bindingsPath = join(acpRoot, 'agy-acp-sessions.json');
let matchedKey = acpKey;
if (existsSync(bindingsPath)) {
	try {
		const data = JSON.parse(readFileSync(bindingsPath, 'utf8'));
		const entries = Object.entries(data?.entries ?? {});
		console.log(`  stored bindings: ${entries.length}`);
		if (acpKey && data?.entries?.[acpKey]) {
			const b = data.entries[acpKey];
			console.log(`  matched ${acpKey.slice(0, 12)}: agySession=${b.agySessionId} model=${b.model} effort=${b.effort ?? '-'} synced=${b.syncedCount} bridge=${Boolean(b.bridgeTag)}`);
		} else if (query) {
			console.log(`  no active binding for ${resolvedSessionId} (key ${acpKey.slice(0, 12)})`);
		}
	} catch (err) {
		console.log(`  could not parse bindings: ${err.message}`);
	}
} else {
	console.log('  (no agy-acp-sessions.json)');
}

// 5. Latest ACP server log & archive count
let acpDir = matchedKey && existsSync(join(acpRoot, matchedKey)) ? join(acpRoot, matchedKey) : null;
if (!acpDir && existsSync(acpRoot)) {
	const dirs = readdirSync(acpRoot, { withFileTypes: true })
		.filter((d) => d.isDirectory() && /^[a-f0-9]{64}$/u.test(d.name))
		.map((d) => ({ path: join(acpRoot, d.name), mtime: statSync(join(acpRoot, d.name)).mtimeMs }))
		.sort((a, b) => b.mtime - a.mtime);
	acpDir = dirs[0]?.path ?? null;
}
if (acpDir) {
	console.log(`\n-- ACP Dir (${acpDir.slice(-12)}) --`);
	const ctxDir = join(acpDir, 'context');
	if (existsSync(ctxDir)) {
		const archives = readdirSync(ctxDir)
			.filter((f) => /^agy-(?:context|tool-results)-.*\.md$/u.test(f))
			.map((f) => ({ name: f, ...statSync(join(ctxDir, f)) }))
			.sort((a, b) => b.mtimeMs - a.mtimeMs);
		console.log(`  archives: ${archives.length}/32${archives.length >= 28 ? ' [WARNING: near quota]' : ''}`);
		for (const a of archives.slice(0, 3)) {
			console.log(`    ${a.name} (${a.size} B, ${new Date(a.mtimeMs).toISOString()})`);
		}
	}
	const logDir = join(acpDir, 'gemini', 'antigravity-cli', 'spig-acp', 'log');
	if (existsSync(logDir)) {
		const logs = readdirSync(logDir)
			.filter((f) => f.endsWith('.log'))
			.map((f) => ({ name: f, path: join(logDir, f), mtime: statSync(join(logDir, f)).mtimeMs }))
			.sort((a, b) => b.mtime - a.mtime);
		const latest = logs[0];
		if (latest) {
			console.log(`  latest server log: ${latest.name} (${statSync(latest.path).size} B)`);
			const hits = readFileSync(latest.path, 'utf8')
				.split(/\r?\n/u)
				.filter((line) => /ACP Request received|Created conversation|Switching model|error|failed|denied/iu.test(line))
				.slice(-10);
			for (const line of hits) console.log(`    ${sanitizeText(line, 130)}`);
		}
	}
}

// 6. Optional best-effort DSH session failure/compaction summary
if (sessionFile) {
	console.log(`\n-- DSH Session Summary (${resolvedSessionId}) --`);
	try {
		const raw = zstdDecompressSync(readFileSync(sessionFile)).toString('utf8');
		let compactions = 0;
		const failures = [];
		for (const line of raw.split(/\r?\n/u)) {
			if (!line) continue;
			let rec;
			try { rec = JSON.parse(line); } catch { continue; }
			if (rec.type === 'compaction/start') compactions += 1;
			if (rec.type === 'assistant/attempt') {
				for (const c of rec.data?.stream ?? []) {
					if (c.chunk?.type === 'finish' && c.chunk.reason?.kind === 'error') {
						failures.push({
							at: new Date(rec.time || 0).toISOString(),
							code: c.chunk.reason.code ?? c.chunk.reason.error?.code ?? 'ERROR',
							msg: sanitizeText(c.chunk.reason.message ?? c.chunk.reason.error?.message ?? '', 120),
						});
					}
				}
			}
		}
		console.log(`  compactions: ${compactions}, error attempts: ${failures.length}`);
		for (const f of failures.slice(-8)) {
			console.log(`  ${f.at} [${f.code}] ${f.msg}`);
		}
	} catch (err) {
		console.log(`  could not decode session.v4.jsonl.zstd (${err.message})`);
	}
}

if (checkLive) {
	const withCode = lifecycleEvents.filter((ev) => ev.code?.combined);
	const liveEvent = [...withCode].reverse().find((ev) => !String(ev.event ?? '').endsWith('unmount')) ?? withCode.at(-1);
	const diskTag = `${diskFingerprint.packageVersion}/${diskFingerprint.combined}`;
	if (!liveEvent) {
		console.log(`
LIVE PARITY: UNKNOWN (no lifecycle entries with code fingerprint; disk=${diskTag})`);
		process.exit(2);
	}
	const liveTag = `${liveEvent.code.packageVersion}/${liveEvent.code.combined}`;
	if (liveTag === diskTag) {
		console.log(`
LIVE PARITY: OK (live=${liveTag} matches disk, event=${liveEvent.event}, pid=${liveEvent.pid ?? '?'})`);
	} else {
		console.log(`
LIVE PARITY: DRIFT (live=${liveTag} != disk=${diskTag}; reload the DSH host to pick up the on-disk code)`);
		process.exit(1);
	}
}
