/**
 * Repository static & module-load check.
 *
 * 1. Syntax-checks lib/, src/, scripts/, and Subscriptions/Antigravity host files.
 * 2. Dynamically imports every standalone Antigravity route module so missing
 *    exports or broken relative imports fail immediately.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildClientBundle } from './build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function collectJsFiles(dir, predicate = (name) => /\.m?js$/u.test(name)) {
	const results = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) results.push(...collectJsFiles(full, predicate));
		else if (predicate(entry)) results.push(full);
	}
	return results;
}

const syntaxTargets = [
	join(ROOT, 'lib', 'index.js'),
	join(ROOT, 'lib', 'client.js'),
	...collectJsFiles(join(ROOT, 'src')),
	...collectJsFiles(join(ROOT, 'scripts')),
	join(ROOT, 'components', 'subscriptions', 'lib', 'index.js'),
	...collectJsFiles(
		join(ROOT, 'components', 'subscriptions', 'lib'),
		(name) => /^(?:antigravity-.*|lifecycle-journal)\.js$/u.test(name),
	),
	join(ROOT, 'components', 'subscriptions', 'lib', 'translate', 'anthropic.js'),
	join(ROOT, 'components', 'subscriptions', 'lib', 'providers', 'rate-limit.js'),
	...collectJsFiles(join(ROOT, 'components', 'thinking-provider', 'lib')),
];

for (const file of syntaxTargets) {
	execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

const importTargets = [
	'components/subscriptions/lib/antigravity-acp-client.js',
	'components/subscriptions/lib/antigravity-acp-transport.js',
	'components/subscriptions/lib/antigravity-cli-adapter.js',
	'components/subscriptions/lib/antigravity-cli-catalog.js',
	'components/subscriptions/lib/antigravity-cli-local.js',
	'components/subscriptions/lib/antigravity-cli-recovery.js',
	'components/subscriptions/lib/antigravity-context-delivery.js',
	'components/subscriptions/lib/antigravity-timeouts.js',
	'components/subscriptions/lib/antigravity-tool-bridge.js',
	'components/subscriptions/lib/lifecycle-journal.js',
	'src/components/general-configs/compaction-model.js',
];

for (const rel of importTargets) {
	await import(pathToFileURL(join(ROOT, rel)).href);
}

const expectedClient = buildClientBundle();
const actualClient = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8');
if (actualClient !== expectedClient) {
	console.error('check failed: lib/client.js is out of sync with client sources. Run "npm run build" to regenerate it.');
	process.exit(1);
}

console.log(`check ok: ${syntaxTargets.length} syntax-checked, ${importTargets.length} route modules imported, lib/client.js parity verified (${relative(ROOT, ROOT) || '.'}).`);
