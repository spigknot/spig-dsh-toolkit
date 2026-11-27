import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ANTIGRAVITY_TIMEOUTS, formatTimeoutDiagnostic } from '../components/subscriptions/lib/antigravity-timeouts.js';

test('centralized Antigravity timeout policy enforces coherent ordering and bounds', () => {
	assert.ok(ANTIGRAVITY_TIMEOUTS.startupMs > 0);
	assert.ok(ANTIGRAVITY_TIMEOUTS.auxiliaryMs >= ANTIGRAVITY_TIMEOUTS.startupMs);
	assert.ok(ANTIGRAVITY_TIMEOUTS.acpIdleMs > 0);
	assert.ok(ANTIGRAVITY_TIMEOUTS.acpTotalMaxMs >= ANTIGRAVITY_TIMEOUTS.acpIdleMs);
	assert.ok(ANTIGRAVITY_TIMEOUTS.cliTotalMaxMs >= ANTIGRAVITY_TIMEOUTS.acpTotalMaxMs);
	assert.ok(Object.isFrozen(ANTIGRAVITY_TIMEOUTS));
});

test('both ACP and CLI transports source their defaults from antigravity-timeouts.js', () => {
	const acpSource = readFileSync(new URL('../components/subscriptions/lib/antigravity-acp-client.js', import.meta.url), 'utf8');
	const cliSource = readFileSync(new URL('../components/subscriptions/lib/antigravity-cli-local.js', import.meta.url), 'utf8');
	assert.match(acpSource, /ANTIGRAVITY_TIMEOUTS\.startupMs/u);
	assert.match(acpSource, /ANTIGRAVITY_TIMEOUTS\.acpIdleMs/u);
	assert.match(acpSource, /ANTIGRAVITY_TIMEOUTS\.acpTotalMaxMs/u);
	assert.match(cliSource, /ANTIGRAVITY_TIMEOUTS\.cliTotalMaxMs/u);
	assert.match(cliSource, /ANTIGRAVITY_TIMEOUTS\.auxiliaryMs/u);
});

test('formatTimeoutDiagnostic produces structured, prompt-free expiry details', () => {
	const text = formatTimeoutDiagnostic({
		method: 'session/prompt',
		kind: 'idle',
		updates: 4,
		lastActivityAt: 100_000,
		startedAt: 50_000,
		now: 130_000,
	});
	assert.equal(text, 'session/prompt idle timeout; 4 update(s), last 30s ago, 80s total');
});
