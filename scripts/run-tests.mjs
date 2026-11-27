/**
 * Test runner wrapper that isolates the test suite from live host debug logs.
 *
 * Sets DSH_AGY_DEBUG=0 by default so running `npm test` (or pre-commit) never
 * appends synthetic test events to `$DSH_HOME/plugins/subscriptions/agy-debug.log`
 * even when `agy-debug.flag` is enabled on the developer's host.
 *
 * Usage:
 *   npm test                              # runs all test/*.test.mjs
 *   npm test -- test/toolkit.test.mjs     # runs focused test file(s)
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const userArgs = process.argv.slice(2);

const testArgs = userArgs.length > 0
	? userArgs
	: readdirSync(join(ROOT, 'test'))
		.filter((name) => name.endsWith('.test.mjs'))
		.sort()
		.map((name) => join('test', name));

const env = { ...process.env };
if (!env.DSH_AGY_DEBUG) {
	env.DSH_AGY_DEBUG = '0';
}

const res = spawnSync(process.execPath, ['--test', ...testArgs], {
	cwd: ROOT,
	env,
	stdio: 'inherit',
});

process.exit(res.status ?? 1);
