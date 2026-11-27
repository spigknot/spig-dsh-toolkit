/**
 * Configure git in this repository to use the versioned `.githooks/` directory.
 * Safe on Windows hosts where the inherited environment sets GIT_CONFIG_COUNT.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, GIT_CONFIG_COUNT: '0' };

execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: ROOT, env, stdio: 'inherit' });
console.log('Git hooks configured: core.hooksPath = .githooks');
