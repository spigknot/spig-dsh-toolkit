/**
 * Single source of truth for Antigravity route time limits and expiry
 * diagnostics across both transports (ACP and CLI stream-json).
 *
 * ACP emits live `session/update` notifications while working, so it uses an
 * activity-renewed idle limit bounded by a total cap. CLI `stream-json` may
 * buffer stdout until the final `result` event during heavy reasoning, so it
 * uses a generous total cap without an aggressive idle cut.
 */
export const ANTIGRAVITY_TIMEOUTS = Object.freeze({
	/** ACP process spawn + initialize + session setup ceiling. */
	startupMs: 30_000,
	/** Auxiliary CLI calls (`agy models`, `/usage`, `--version`). */
	auxiliaryMs: 60_000,
	/** ACP idle limit between `session/update` or permission events. */
	acpIdleMs: 180_000,
	/** ACP hard cap for a single `session/prompt` step even with activity. */
	acpTotalMaxMs: 15 * 60_000,
	/** CLI `stream-json` hard cap (no guaranteed mid-turn heartbeat). */
	cliTotalMaxMs: 60 * 60_000,
});

/**
 * Build a safe, prompt-free diagnostic string describing a timeout expiry.
 */
export function formatTimeoutDiagnostic({ method, kind, updates = 0, lastActivityAt, startedAt, now = Date.now() }) {
	const totalSec = startedAt === undefined ? 0 : Math.max(0, Math.round((now - startedAt) / 1000));
	const idlePart = lastActivityAt === undefined
		? ''
		: `, last ${Math.max(0, Math.round((now - lastActivityAt) / 1000))}s ago`;
	return `${method} ${kind} timeout; ${updates} update(s)${idlePart}, ${totalSec}s total`;
}
