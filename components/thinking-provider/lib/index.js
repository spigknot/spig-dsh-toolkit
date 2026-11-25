import { c as settingsChangeEvents, d as DEFAULT_LEVELS$1, g as LOG_PREFIX, h as LLM_PI_AI_NS, i as settingsModelForRuntime, l as settingsEntryId, o as readSettingsSection, r as hostCapabilities, s as readSettingsSectionUser, t as Config, w as isUnknownRecord } from "./src-Cwr6N05S.js";
import { n as OPENCODE_SESSION_NAMESPACE } from "./opencode-session-KAA2P7O4.js";
import { n as isProviderProfile } from "./types-B5KklnpI.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { AsyncResource } from "node:async_hooks";
//#region packages/kit/src/host/marker.ts
const MARKER = join(process.env.DSH_HOME || process.cwd(), "thinking-effort-loaded.json");
function mark(event) {
	try {
		writeFileSync(MARKER, JSON.stringify({
			event,
			name: "spig-dsh-thinking-provider",
			at: (/* @__PURE__ */ new Date()).toISOString(),
			pid: process.pid
		}, null, 2));
	} catch {}
}
//#endregion
//#region packages/levels/src/settings.ts
const SETTINGS_NAMESPACE = LLM_PI_AI_NS;
const DEFAULT_LEVELS = DEFAULT_LEVELS$1;
/**
* Most fill passes one trigger may run before it stops re-running itself.
*
* A healthy host needs two: the write raises `settings/document-updated` at the
* end of `write()`, and the queued pass re-reads the filled section and finds
* nothing to do. A host whose write is accepted but never becomes observable
* raises that event after every pass, so the count is bounded here rather than
* left to spin. The budget belongs to the running chain, not to the trigger
* that started it: an event that arrives mid-fill is queued into that chain and
* spends the same budget rather than beginning a fresh one.
*/
const MAX_FILL_PASSES = 5;
function log(...args) {
	console.log(LOG_PREFIX, ...args);
}
function record(value) {
	return isUnknownRecord(value) ? value : void 0;
}
/**
* One read of the user's own layer.
*
* `providers` is the `providers` object of that layer — the only value any fill
* payload may quote.
*
* `readable` says whether the service returned a layer at all. It is not the
* same as `providers` being empty: under the namespace model the resolved read
* (`get`) and this layer read (`describe`) are separate service calls, so a
* resolved section can be available while the layer has not landed yet. An
* absent layer makes every resolved entry look unreachable, which must not be
* mistaken for a verdict (see {@link fillDefaults}).
*
* Deliberately not {@link readSettingsSection}, which returns the *resolved*
* section (schema defaults under composition base under the user's own keys).
* A path write merges into the user layer, so quoting a resolved entry is what
* pins `input`, `compat`, `headers`, `thinkingBudgets`, `defaultContextWindow`
* and friends into the user's document, where a later release can no longer
* reach them. `tests/settings-fill-write.test.ts` asserts the written payload
* against this layer alone, with the resolved layer carrying fields the user
* never wrote.
*
* Two host behaviours keep this the raw layer rather than a resolved snapshot,
* and a later DSH release changing either one re-introduces the inflation
* silently — the fill would keep writing what it reads here:
*
* - Under the `entry-config` model the descriptor's `user` value is
*   `projectForm(form, override)`, where `override` is the profile patch's own
*   row (`dsh-settings` `describe`). It carries only what that row states.
* - A path write's `current` is `projectForm(form, raw)` with
*   `raw = entry.options.config` (`dsh-settings` `write` → `dsh-config-editor`
*   `edit`), and `entry.options.config` stays raw because the loader's
*   config-update path passes `noSave = true`; `update` and `mutate` both go
*   through it. A write therefore merges into the user's layer, not into a
*   resolved value.
*
* No in-process test can observe either behaviour, because both live in the
* host. `tests/loader-composition.test.ts` asserts both against the pinned
* `0.1.7-alpha.1` root when the opt-in loader integration suite runs
* (`DSH_LOADER_INTEGRATION=1`): it writes one minimal path into this section
* and requires the user layer to hold exactly that path while the resolved
* value still carries the fields the user never wrote. A later host release is
* covered once that root moves; until then a change there reaches this fill
* unobserved.
*/
function readUserLayer(settings, namespace) {
	const user = readSettingsSectionUser(settings, namespace);
	if (!isUnknownRecord(user)) return {
		providers: void 0,
		readable: false
	};
	return {
		providers: user.providers,
		readable: true
	};
}
/**
* One model array with the default level set added where the resolved entry
* lacks it.
*
* Only entries the user's own layer carries can be written: the array is
* written whole, so an entry the user never declared has no user-layer fields
* to contribute, and adding it would replace the lower layer's copy of that
* entry (see {@link fillProviderDefaults}). Those entries, and every resolved
* entry past the user's own list, are counted as missing but unreachable.
*/
function withDefaultLevels(userModels, resolvedModels, skipped) {
	const reachable = userModels.flatMap((userEntry, index) => {
		const resolved = resolvedModels[index];
		if (record(resolved)?.reasoningEfforts !== void 0) return [];
		skipped.missing += 1;
		if (!isUnknownRecord(userEntry)) {
			skipped.unmatched += 1;
			return [];
		}
		return [{
			index,
			userEntry
		}];
	});
	for (const resolved of resolvedModels.slice(userModels.length)) {
		if (record(resolved)?.reasoningEfforts !== void 0) continue;
		skipped.missing += 1;
		skipped.unmatched += 1;
	}
	const models = [...userModels];
	for (const { index, userEntry } of reachable) models[index] = {
		...userEntry,
		reasoningEfforts: DEFAULT_LEVELS
	};
	return {
		models,
		changed: reachable.length
	};
}
/** Every resolved entry that still lacks a level set, none of them writable. */
function countUnreachable(resolvedModels, skipped) {
	for (const resolved of resolvedModels) {
		if (record(resolved)?.reasoningEfforts !== void 0) continue;
		skipped.missing += 1;
		skipped.unmatched += 1;
	}
	return {
		models: [],
		changed: 0
	};
}
/**
* The path edits that give every model a default thinking-level set.
*
* `providers` is the resolved section, which decides *where* a level is
* missing; `user` is the user's own layer, which supplies *what* is written.
* No payload may quote `providers`, or the write pins the schema defaults the
* entry took on (`input`, `compat`, `headers`, `thinkingBudgets`,
* `defaultContextWindow`, …) into the user's document, and a later release
* changing one of those defaults would never reach the user.
*
* A model array is addressed as a whole because the older settings service
* walks paths through plain objects only: a numeric index would replace the
* array with an object.
*
* That is also why a resolved entry the user's layer does not carry is reported
* in `skipped` rather than materialized. The reason is not that the service
* refuses the write: 0.1.7 accepts a `set` at `models[<userArrayLength>]` (its
* bounds check allows an index equal to the length when the op is a `set` and
* the path ends there), and a minimal `{ id, reasoningEfforts }` entry pins no
* resolved field. The reason is the container. An array has no per-element
* layer: `mergeLayers` replaces it wholesale (`if (!isPlainObject(under) ||
* !isPlainObject(over)) return over`), so materializing a base-only entry in
* the user's layer replaces the lower layer's copy of that entry. Its `name`,
* `contextWindow`, `input`, `compat` and the rest are then lost from the
* resolved section unless this fill restates them — the inflation this function
* exists to avoid.
*
* A model override is a dict keyed by model id, so its partial entry does merge
* over whatever a lower layer already describes. That asymmetry is the shape of
* the two containers, not a preference: a lower-layer override is filled and
* left minimal.
*/
function fillProviderDefaults(providers, user) {
	const skipped = {
		missing: 0,
		unmatched: 0
	};
	if (!isUnknownRecord(providers)) return {
		ops: [],
		filled: 0,
		skipped
	};
	const userProviders = record(user);
	const ops = [];
	let filled = 0;
	for (const [route, rawProfile] of Object.entries(providers)) {
		if (!isProviderProfile(rawProfile)) continue;
		const userProfile = userProviders?.[route];
		const ownProfile = record(userProfile);
		const models = rawProfile.models;
		const userModels = ownProfile?.models;
		if (Array.isArray(models)) {
			const merged = Array.isArray(userModels) ? withDefaultLevels(userModels, models, skipped) : countUnreachable(models, skipped);
			if (merged.changed > 0) {
				ops.push({
					op: "set",
					path: [
						"providers",
						route,
						"models"
					],
					value: merged.models
				});
				filled += merged.changed;
			}
		}
		const overrides = rawProfile.modelOverrides;
		if (isUnknownRecord(overrides)) for (const [id, rawEntry] of Object.entries(overrides)) {
			if (!isUnknownRecord(rawEntry) || rawEntry.reasoningEfforts !== void 0) continue;
			skipped.missing += 1;
			filled += 1;
			ops.push({
				op: "set",
				path: [
					"providers",
					route,
					"modelOverrides",
					id,
					"reasoningEfforts"
				],
				value: DEFAULT_LEVELS
			});
		}
	}
	return {
		ops,
		filled,
		skipped
	};
}
/**
* Report work the fill could see but could not reach, once per attempt. A
* section whose levels are all set stays silent, and so does a user who has
* written nothing yet: the line exists for the case an operator cannot
* otherwise distinguish from "nothing to do" — models supplied by a lower
* settings layer, whose entries cannot be materialized into the user's own
* layer without pinning the defaults resolution gave them. Without it, the only
* symptom is a reasoning-effort selector that never appears in Composer.
*/
function reportSkipped(skipped) {
	if (skipped.unmatched === 0) return;
	log("left", skipped.unmatched, "model(s) unfilled: declared by a lower settings layer,", "which an array path write cannot address without pinning that layer’s resolved fields");
}
/**
* Read the pi-ai section under either settings model. The `entry-config` model
* has no `get`, so the value comes from `describe()`; `readSettingsSection`
* covers both and never throws.
*
* This read only has a `providers` to fill because `llm-pi-ai` declares its
* `Config` as `z.object({ providers: z.dict(profile).default({}).volatile() })`:
* `describe()` lists an entry only when a volatile field makes its form live
* (`volatileForm`), so dropping that `.volatile()` removes the entry from the
* service reads entirely and this fill goes dead rather than inflating.
* `tests/loader-composition.test.ts` asserts all three halves against the pinned
* `0.1.7-alpha.1` root when the opt-in integration suite runs
* (`DSH_LOADER_INTEGRATION=1`): the entry is listed, a write under `providers`
* is accepted, and the fill's own write lands.
*/
function readSection(settings) {
	return readSettingsSection(settings, SETTINGS_NAMESPACE);
}
/**
* The section this plugin's own switch lives in on the running host.
*
* A section is addressed by its Loader entry id, which `settingsEntryId`
* reads from the fiber and which `cordis.patch.yml` declares on every supported
* release. The pre-0.1.7 lines registered a namespace instead and are no longer
* supported, so there is no second candidate to probe.
*/
function ownSectionId(ctx) {
	return settingsEntryId(ctx, OPENCODE_SESSION_NAMESPACE);
}
function autoFillEnabled(settings, ownSection) {
	return record(readSettingsSectionUser(settings, ownSection))?.autoFillDefaults !== false;
}
async function fillDefaults(settings, ctx) {
	if (settings.writable !== true) return { filled: 0 };
	if (!autoFillEnabled(settings, ownSectionId(ctx))) return {
		filled: 0,
		remaining: 0
	};
	const notYet = { filled: 0 };
	const section = readSection(settings);
	if (!isUnknownRecord(section)) return notYet;
	const user = readUserLayer(settings, SETTINGS_NAMESPACE);
	if (!user.readable) return notYet;
	const result = fillProviderDefaults(section.providers, user.providers);
	reportSkipped(result.skipped);
	const reachable = result.skipped.missing - result.skipped.unmatched;
	if (result.filled === 0) return {
		filled: 0,
		remaining: reachable
	};
	const mutate = settings.mutate;
	if (typeof mutate !== "function") {
		log("settings service cannot address paths; left", result.filled, "model(s) unfilled");
		return {
			filled: 0,
			remaining: reachable
		};
	}
	await mutate.call(settings, SETTINGS_NAMESPACE, result.ops);
	mark(`filled-${result.filled}`);
	log("filled default thinking levels for", result.filled, "model(s)");
	return {
		filled: result.filled,
		remaining: reachable
	};
}
function installSettingsWatcher(ctx) {
	const settings = ctx.settings;
	if (hostCapabilities({ settings }).settings === "none" || settings === void 0) {
		log("settings capability unavailable");
		return;
	}
	const watchedSections = /* @__PURE__ */ new Set([settingsEntryId(ctx, OPENCODE_SESSION_NAMESPACE), OPENCODE_SESSION_NAMESPACE]);
	ctx.effect(() => {
		let alive = true;
		let retries = 0;
		let inFlight = false;
		let queued = false;
		let current = Promise.resolve({ filled: 0 });
		const timerDisposers = [];
		/**
		* Run fills one at a time, and run one more when a trigger arrives while a
		* fill is in progress.
		*
		* Running the second trigger alongside the first would make both read the
		* section before either write lands, so it would write the same fill and
		* bump the document revision twice. Dropping it instead is worse: a settings
		* change that lands mid-fill is never re-evaluated, so a fill derived from a
		* section the user was still writing stands. The queued run re-reads the
		* section after the write it was racing, which is what makes a
		* freshly-written section — the state a fill most needs to see — win.
		*
		* The caller's promise settles from inside the loop rather than through a
		* `finally` chain, so a trigger's continuation — including the retry a failed
		* fill schedules — runs in the same turn the last fill settles, and one
		* awaited trigger still performs exactly one scheduling decision.
		*
		* The pass count is bounded by {@link MAX_FILL_PASSES}, because the fill's
		* own write is one of the triggers this loop consumes.
		*/
		/**
		* The context the fill's write runs in.
		*
		* Under 0.1.7 the change event is raised from inside the write that caused
		* it: `dsh-settings` `write` → `describe` → emit, while
		* `dsh-config-editor.edit` still holds its `hmr.runExclusive` transaction
		* open. That transaction is tracked with `AsyncLocalStorage`, so a listener
		* that writes back is refused with "HMR transactions cannot be nested" —
		* and so is anything it defers, because a timer or promise created inside
		* the transaction inherits its context. The fill would then never write on
		* this model, which is exactly the case this resource exists for: it is
		* created while the plugin is applied, outside that transaction, so
		* entering it gives the write a context the host accepts.
		*/
		const fillScope = new AsyncResource("dsh-thinking-effort:settings-fill");
		const runFill = () => {
			if (inFlight) {
				queued = true;
				return current;
			}
			inFlight = true;
			let finish = () => {};
			let fail = () => {};
			const run = new Promise((resolve, reject) => {
				finish = resolve;
				fail = reject;
			});
			current = run;
			(async () => {
				try {
					let outcome = { filled: 0 };
					let passes = 0;
					do {
						queued = false;
						outcome = await fillDefaults(settings, ctx);
						passes += 1;
					} while (alive && queued && passes < MAX_FILL_PASSES);
					if (alive && queued) {
						queued = false;
						log("stopped the fill after", passes, "passes: the settings change never settled");
					}
					finish(outcome);
				} catch (error) {
					fail(error);
				} finally {
					inFlight = false;
				}
			})();
			return run;
		};
		const schedule = (delay) => {
			if (!alive) return;
			const disposer = ctx.timeout(() => {
				if (!alive) return;
				tryOnce();
			}, delay);
			if (typeof disposer === "function") timerDisposers.push(() => {
				disposer();
			});
		};
		const tryOnce = async () => {
			if (!alive) return;
			let settled = false;
			let outcome = {
				filled: 0,
				remaining: 0
			};
			try {
				outcome = await runFill();
				settled = true;
				if (outcome.filled > 0) return;
			} catch (error) {
				if (!alive) return;
				log("fill error:", error instanceof Error ? error.message : String(error));
			}
			if (!alive) return;
			if (settled && outcome.remaining === 0) return;
			retries += 1;
			if (retries <= 5) schedule(2e3);
		};
		schedule(500);
		const model = settingsModelForRuntime({ settings });
		const listenerDisposers = [];
		if (model !== void 0) for (const event of settingsChangeEvents(model)) {
			const disposer = ctx.on(event, (...args) => {
				if (!alive || args[0] !== SETTINGS_NAMESPACE && !watchedSections.has(String(args[0]))) return;
				fillScope.runInAsyncScope(() => runFill()).catch((error) => {
					if (alive) log("watch fill error:", error instanceof Error ? error.message : String(error));
				});
			});
			if (typeof disposer === "function") listenerDisposers.push(() => {
				disposer();
			});
		}
		return () => {
			alive = false;
			for (const dispose of timerDisposers.splice(0)) dispose();
			for (const dispose of listenerDisposers.splice(0)) dispose();
		};
	}, "dsh-thinking-effort: settings watcher");
}
//#endregion
//#region lib/types/src/index.js
/**
* The core entry: the default-levels fill, plus the plugin's settings section.
*
* This entry keeps the `thinking-effort` id its bundle row always had. Existing
* profiles carry `- id: thinking-effort` with their whole `config` under it, so
* renaming the id would strand that configuration on upgrade.
*
* The other six features are their own entries — see `src/entries/`. Nothing
* else is installed here: a feature mounted twice would register its listeners
* twice, and the point of splitting the bundle is that each row owns exactly
* one thing.
*/
const name = "spig-dsh-thinking-provider";
const inject = ["settings", "timer"];
function apply(ctx) {
	mark("apply");
	installSettingsWatcher(ctx);
}
//#endregion
export { Config, apply, inject, name };
