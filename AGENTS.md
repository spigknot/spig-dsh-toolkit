# AGENTS.md — spig-dsh-toolkit

Operational notes for coding agents working in `D:\Projetos\spig-dsh-toolkit`.

## Source of truth
- This repository is the **only** source for the Subscriptions, Thinking Provider, and General Configs components (`spig-dsh-subscriptions` is retired).
- Host runtime loads `lib/index.js` → `src/components/subscriptions.js` → `components/subscriptions/lib/index.js` and the external `antigravity-*.js`, `compaction-model.js`, and `lifecycle-journal.js` modules.
- `npm run build` (`node scripts/build.mjs`) rebuilds only the browser bundle `lib/client.js` (required after editing `src/client/*` or `components/*/lib/client.js`; verified by `npm run check`). Host-side changes in `src/` and `components/*/lib/` do not pass through `build.mjs`. See `docs/ARCHITECTURE.md` for component layout.

## Host reload & verifying running code
- The DSH host may remount plugins in-process, **or** keep previously loaded ESM modules cached until a full host restart.
- Always verify which code is loaded in the live host via `node scripts/diagnose-antigravity.mjs --check-live` (compares disk fingerprint against `code` in `$DSH_HOME/plugins/subscriptions/subscriptions-lifecycle.log`).

## Commands & gates
- **Git on this Windows host:** the inherited shell environment may set `GIT_CONFIG_COUNT` without matching keys; prefix git commands with `$env:GIT_CONFIG_COUNT='0'` (PowerShell) or `GIT_CONFIG_COUNT=0`.
- **Validation:** run `npm run check && npm test` before every commit (focused run: `npm test -- test/<file>.test.mjs`). Never use `--no-verify` or `--force`.
- **Install local pre-commit hook:** `npm run hooks:install` (points `core.hooksPath` to `.githooks`).
- **Keep commits focused:** do not mix Antigravity runtime fixes with unrelated General Configs / UI changes.

## Diagnosing Antigravity incidents
- Run the read-only summary script (safe: prints no prompts or credentials):
  ```powershell
  node scripts/diagnose-antigravity.mjs [session-id-or-substring]
  ```
- **Always-on lifecycle log:** `$DSH_HOME/plugins/subscriptions/subscriptions-lifecycle.log` (rotates to `.1` at 256 KB). Captures mount, adapter registration, failures with stack, unmount, and code fingerprint.
- **Opt-in call journal (local-only, temporary):**
  - Enable without restarting DSH: create empty file `$DSH_HOME/plugins/subscriptions/agy-debug.flag` (or set `DSH_AGY_DEBUG=1`); writes to `$DSH_HOME/plugins/subscriptions/agy-debug.log`.
  - Delete `agy-debug.flag` immediately after triage and never paste its contents into commits, PRs, or reports.

## Antigravity safety & testing conventions
- Prefer offline tests and fakes in `test/`. When a live Antigravity CLI probe is unavoidable, use `gemini-4-hydrogen` (low) to conserve quota.
- ACP security invariants: isolated overlay (`--cli_dir_name=spig-acp --include-default-customizations=false --sandbox`), mandatory `default` mode (fail-closed), and never log raw prompts or credentials in always-on logs or diagnostic outputs.
