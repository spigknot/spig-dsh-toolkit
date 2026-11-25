import { a as pluginSectionId, c as settingsChangeEvents, g as LOG_PREFIX, h as LLM_PI_AI_NS, i as settingsModelForRuntime, s as readSettingsSectionUser, t as Config, v as PLUGIN_NS, w as isUnknownRecord, y as SNAPSHOT_KIND } from "../src-Cwr6N05S.js";
import { join } from "node:path";
import { AsyncResource } from "node:async_hooks";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { parse } from "../vendor-deps.js";
//#region packages/kit/src/compat/legacy-migration.ts
/**
* The control object the Host keeps in the plugin's own settings section to
* drive the legacy-data migration prompt, and the accessors both halves read it
* through.
*
* The Client cannot read files and this plugin exposes no Remote, so the
* Settings section is the only channel between the two halves: the Host scans
* the legacy documents and writes this object, the Client renders the prompt
* from it and writes back one decision, and the Host performs the migration.
*
* Every field is optional because a hand-written section may omit any of them
* and the schema supplies the defaults on resolution.
*/
/** The decisions the Client may write into `decision`; the Host acts on each. */
const LEGACY_DECISIONS = [
	"migrate",
	"dismiss",
	"scan"
];
/** `lastResult` after a successful migration. */
const LEGACY_RESULT_APPLIED = "applied";
/** `lastResult` after the user chose not to be asked again. */
const LEGACY_RESULT_DISMISSED = "dismissed";
/**
* `lastResult` after a rescan the user asked for that found nothing left to
* migrate. The Client renders its "nothing pending" message from this value;
* without it a completed scan recorded an empty string, which reads as "no
* result yet" and left that message unreachable.
*/
const LEGACY_RESULT_NOTHING_PENDING = "nothing-pending";
/** Prefix of `lastResult` when the write was refused; the reason follows. */
const LEGACY_FAILED_PREFIX = "failed:";
function record$1(value) {
	return isUnknownRecord(value) ? value : void 0;
}
/** The `legacyMigration` object of one published section's `user` layer. */
function legacyMigrationOf(user) {
	return record$1(record$1(user)?.legacyMigration);
}
/** The decision the Client last wrote, when it is one the Host acts on. */
function legacyDecisionOf(user) {
	const decision = legacyMigrationOf(user)?.decision;
	return typeof decision === "string" && LEGACY_DECISIONS.includes(decision) ? decision : void 0;
}
//#endregion
//#region packages/migration/src/apply.ts
/**
* The snapshot version the plugin's own snapshot schema declares.
*
* The kind is imported from the shared module rather than restated; the version
* stays a literal because it is a schema number the Host and the Client each
* declare independently, not a cross-module identifier.
*/
const SNAPSHOT_VERSION = 1;
/**
* Keys of the plugin's own section that must never ride inside a snapshot of
* that section: `profiles` is the snapshot library itself and `autoBackup` is
* the slot this snapshot is written to, so capturing either would nest one
* rollback copy inside the next. `legacyMigration` is this feature's own
* control object — a rollback copy of the user's *settings* has no business
* resurrecting a stale prompt offer. The first two mirror the Client's
* `PLUGIN_SNAPSHOT_EXCLUDED_KEYS`.
*/
const SNAPSHOT_EXCLUDED_KEYS = [
	"profiles",
	"autoBackup",
	"legacyMigration"
];
/**
* Keys that must never be copied into an accumulator, whatever a layer holds.
* A parsed document can carry an own `__proto__` (see `legacy-shape.ts`), and
* `copy[key] = value` on one would drop the entry and rewrite the accumulator's
* prototype — the same risk the repo already blocks in
* `src/client/config-snapshot/library.ts` and `parse.ts`.
*/
const RESERVED_PATH_KEYS$1 = [
	"__proto__",
	"constructor",
	"prototype"
];
/** One candidate as a path write into the plugin's own section. */
function opsForCandidates(candidates) {
	return candidates.map((candidate) => ({
		op: "set",
		path: [...candidate.path],
		value: candidate.value
	}));
}
/**
* A rollback copy of the settings a migration is about to extend.
*
* Built from the user layers alone — never from a resolved section — so
* restoring it cannot pin the schema defaults a resolved read would have
* carried. `sourceProfile` reads `migration`, which is how the copy is told
* apart from one the import feature took.
*
* @param input - the plugin's section id, the live user layers and a timestamp.
* @returns the snapshot object, ready to be written to `autoBackup`.
*/
function rollbackSnapshot(input) {
	const sections = {};
	for (const [ns, user] of Object.entries(input.sections)) {
		const copy = {};
		for (const [key, value] of Object.entries(user)) {
			if (RESERVED_PATH_KEYS$1.includes(key)) continue;
			if (ns === input.pluginNs && SNAPSHOT_EXCLUDED_KEYS.includes(key)) continue;
			copy[key] = value;
		}
		sections[ns] = copy;
	}
	return {
		kind: SNAPSHOT_KIND,
		version: SNAPSHOT_VERSION,
		createdAt: input.createdAt,
		pluginVersion: "",
		sourceProfile: "migration",
		sections
	};
}
function reason(error) {
	return error instanceof Error ? error.message : String(error);
}
/**
* Write the offered values into the plugin's own settings section, preceded by
* a rollback snapshot of the settings they extend.
*
* Both halves ride ONE `mutate`: the snapshot is the batch's first op and the
* values follow it. That ordering is what makes "a rollback copy exists" and
* "the migration happened" the same fact — a batch the host refuses cannot
* leave a snapshot of a migration that never ran, and it cannot half-apply.
*
* Every value op targets a path the plugin's schema declares and the user has
* not set, so the batch never overwrites a value the user chose; the snapshot
* is there because the migration does extend their document.
*
* Failures are reported as a `lastResult` string rather than thrown: a refused
* write is a state the prompt has to show and offer to retry, not an error that
* should escape into the settings event that triggered it.
*
* @param input - the service, section id, candidates, snapshot builder and clearer.
* @returns `applied`, or `failed:<reason>`.
*/
async function applyLegacyMigration(input) {
	const ops = opsForCandidates(input.candidates);
	if (ops.length === 0) return LEGACY_RESULT_APPLIED;
	const mutate = input.settings.mutate;
	if (typeof mutate !== "function") return `${LEGACY_FAILED_PREFIX} settings service cannot address paths (no mutate)`;
	try {
		const batch = [{
			op: "set",
			path: ["autoBackup"],
			value: input.snapshot()
		}, ...ops];
		await mutate.call(input.settings, input.ns, batch);
	} catch (error) {
		return `${LEGACY_FAILED_PREFIX} ${reason(error)}`;
	}
	try {
		await input.clear();
	} catch {}
	return LEGACY_RESULT_APPLIED;
}
//#endregion
//#region packages/migration/src/shape.ts
/**
* Which paths of a legacy settings document are fields this plugin owns.
*
* The traversal is driven by a declared shape, not by the document: dynamic keys
* (`providers`, `models`) are declared as dicts so their live keys are read,
* while every fixed key must be listed. A key the shape does not declare is
* dropped at any depth, so arbitrary content a user hand-wrote into their
* settings document can never become a write into the plugin's own section.
*/
/**
* A text leaf: an effort level, a mode name, a template, a regex.
*
* The type is declared per leaf rather than inferred from the value, because a
* hand-edited document can put a string where the schema declares a boolean.
* Emitting it would send a wrongly-typed path write, and under the entry-config
* model the host refuses a write batch WHOLE when a value does not fit the
* schema — so one bad leaf would take every good one down with it. Dropping it
* here is what keeps a malformed document from costing the rest of the batch.
*/
const TEXT = {
	kind: "scalar",
	type: "string"
};
/** A boolean leaf: a per-model or per-route toggle. */
const FLAG = {
	kind: "scalar",
	type: "boolean"
};
/**
* Keys a path must never contain, whatever a document states.
*
* A dict node takes its keys from the document, and a parsed `{"__proto__": {...}}`
* carries an own enumerable `__proto__`, so without this filter a document could
* put `__proto__` (or `constructor`) into a leaf path that later becomes a path
* write. The Client's `RESERVED_PATH_KEYS` in `src/client/config-snapshot/types.ts`
* holds the same three names; this is a host-side copy because the Host bundle
* must not import client code.
*/
const RESERVED_PATH_KEYS = [
	"__proto__",
	"constructor",
	"prototype"
];
/**
* The legacy `dsh-thinking-effort` namespace. `profiles` and `autoBackup` are
* deliberately absent: they hold the user's saved backup library, which the
* migration does not move. `legacyMigration` is absent for a different reason —
* it is this feature's own control object, not a user setting, so a document
* stating one has nothing worth migrating. All three omissions are deliberate;
* do not "fix" them by adding the keys.
*/
const LEGACY_OWN_SHAPE = {
	kind: "object",
	fields: {
		subagentEffort: TEXT,
		opencodeSession: {
			kind: "object",
			fields: {
				providers: {
					kind: "dict",
					of: {
						kind: "object",
						fields: { models: {
							kind: "dict",
							of: FLAG
						} }
					}
				},
				format: {
					kind: "object",
					fields: {
						mode: TEXT,
						time: TEXT,
						template: TEXT,
						expression: TEXT,
						script: TEXT,
						validate: TEXT,
						onInvalid: TEXT
					}
				},
				userAgent: {
					kind: "object",
					fields: {
						value: TEXT,
						providers: {
							kind: "dict",
							of: {
								kind: "object",
								fields: {
									enabled: FLAG,
									value: TEXT,
									models: {
										kind: "dict",
										of: FLAG
									}
								}
							}
						}
					}
				}
			}
		}
	}
};
/**
* The legacy `llm-pi-ai` namespace, of which this plugin ever wrote exactly one
* key before 0.1.7. `providers` is absent for the same reason.
*/
const LEGACY_LLM_SHAPE = {
	kind: "object",
	fields: { subagentEffort: TEXT }
};
function record(value) {
	return isUnknownRecord(value) ? value : void 0;
}
/** Whether a document value is exactly the type its declared leaf requires. */
function matches(value, type) {
	return typeof value === type;
}
function walk(shape, value, path, out) {
	if (shape.kind === "scalar") {
		if (matches(value, shape.type)) out.push({
			path,
			value
		});
		return;
	}
	const object = record(value);
	if (object === void 0) return;
	if (shape.kind === "dict") {
		for (const [key, member] of Object.entries(object)) {
			if (RESERVED_PATH_KEYS.includes(key)) continue;
			walk(shape.of, member, [...path, key], out);
		}
		return;
	}
	for (const [key, member] of Object.entries(shape.fields)) {
		if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
		walk(member, object[key], [...path, key], out);
	}
}
/**
* Every declared leaf one document section states.
* @param shape - the declared shape for that section.
* @param section - the section as parsed from the document.
* @returns leaf paths and their scalar values; empty for a non-object section.
*/
function leavesOf(shape, section) {
	const out = [];
	walk(shape, section, [], out);
	return out;
}
//#endregion
//#region packages/migration/src/scan.ts
/** Where one candidate came from, as the prompt reports it. */
const LEGACY_MIGRATION_SOURCES = {
	live: LLM_PI_AI_NS,
	document: "settings.yaml",
	imported: "settings.yaml.imported"
};
/**
* A path's sort order, compared by code unit rather than `localeCompare`.
*
* The signature is a PERSISTED identity: `localeCompare`'s default order depends
* on the runtime locale, so the same legacy data could hash differently on two
* machines and re-prompt a user who had already declined. Code-unit order is the
* same everywhere.
*/
function comparePaths(left, right) {
	const a = left.join(".");
	const b = right.join(".");
	return a < b ? -1 : a > b ? 1 : 0;
}
/**
* Whether a path is already declared in the plugin's own user layer.
*
* Presence of the key is what counts, even when its value is `undefined` or
* `null`: schemastery spells "unset" as an explicit empty value in some places,
* and treating that as "the user set it" is the safe direction — the migration
* then leaves the path alone rather than overwriting a value the user chose.
* The write side never re-checks, so this is the one place the rule lives.
*/
function declared(ownUser, path) {
	let node = ownUser;
	for (const key of path) {
		if (typeof node !== "object" || node === null || Array.isArray(node)) return false;
		if (!Object.prototype.hasOwnProperty.call(node, key)) return false;
		node = node[key];
	}
	return true;
}
function parseDocument(text) {
	try {
		return parse(text);
	} catch {
		return;
	}
}
function sectionOf(document, key) {
	if (typeof document !== "object" || document === null || Array.isArray(document)) return void 0;
	return document[key];
}
/**
* Every legacy leaf worth offering for migration.
*
* Sources are consulted in priority order and the first statement of a path
* wins, so a document that is still live (`settings.yaml`) outranks the renamed
* one, and the live `llm-pi-ai` layer outranks both. A path the plugin's own
* section already declares is dropped: the migration only ever fills in values
* the user has not set, so it cannot overwrite anything.
*
* @param input - the home, a document reader and both live user layers.
* @returns the candidates and their signature; never throws.
*/
async function scanLegacyData(input) {
	const found = /* @__PURE__ */ new Map();
	const offer = (leaf, source) => {
		const key = leaf.path.join("\0");
		if (found.has(key) || declared(input.ownUser, leaf.path)) return;
		found.set(key, {
			path: [...leaf.path],
			value: leaf.value,
			source
		});
	};
	for (const leaf of leavesOf(LEGACY_LLM_SHAPE, input.llmPiAiUser)) offer(leaf, LEGACY_MIGRATION_SOURCES.live);
	for (const source of [LEGACY_MIGRATION_SOURCES.document, LEGACY_MIGRATION_SOURCES.imported]) {
		const path = join(input.home, source);
		let text;
		try {
			text = await input.read(path);
		} catch {
			continue;
		}
		const document = parseDocument(text);
		for (const leaf of leavesOf(LEGACY_OWN_SHAPE, sectionOf(document, PLUGIN_NS))) offer(leaf, source);
		for (const leaf of leavesOf(LEGACY_LLM_SHAPE, sectionOf(document, LLM_PI_AI_NS))) offer(leaf, source);
	}
	const candidates = [...found.values()].sort((left, right) => comparePaths(left.path, right.path));
	return {
		candidates,
		signature: signatureOf(candidates)
	};
}
/**
* A stable identity for one offer. Sorted by path, so document key order and
* source order cannot change it; used to tell "the user already declined this
* exact offer" from "the legacy data changed since they declined".
*/
function signatureOf(candidates) {
	const sorted = [...candidates].sort((left, right) => comparePaths(left.path, right.path));
	return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}
//#endregion
//#region packages/migration/src/watcher.ts
/** The `llm-pi-ai` section id, the alias `levels` exports for it. */
const SETTINGS_NAMESPACE = LLM_PI_AI_NS;
/**
* Most scan/act passes one settings event may run before the chain stops
* re-running itself. The migration's own writes raise the event it listens to,
* so the budget is what keeps a hostile or confused host from spinning.
*/
const MAX_MIGRATION_PASSES = 5;
function log(...args) {
	console.log(LOG_PREFIX, ...args);
}
function recordOf(value) {
	return isUnknownRecord(value) ? value : void 0;
}
/**
* The launcher's `profileContext.home` — the DSH home this process actually
* runs against — when this host exposes one.
*
* `profileContext` is NOT part of this plugin's declared `HostContext`: it is a
* launcher-owned service, present on the releases this migration targets and
* absent from older lines. Both reads are therefore defensive. `get` is tried
* first because it is the one access that answers `undefined` for a service
* nobody provided — a bare `ctx.profileContext` on a context that cannot
* resolve it THROWS (cordis resolves service properties through `inject`), and
* a sandboxed host façade denies property access to every service the plugin
* did not declare. The property form is the fallback for a context object
* without `get`, such as the test doubles that inject a home directly.
*/
function profileHome(ctx) {
	const context = recordOf(ctx);
	if (context === void 0) return void 0;
	let service;
	const lookup = context.get;
	if (typeof lookup === "function") try {
		service = lookup.call(ctx, "profileContext");
	} catch {
		service = void 0;
	}
	if (service === void 0) try {
		service = context.profileContext;
	} catch {
		service = void 0;
	}
	const home = recordOf(service)?.home;
	return typeof home === "string" && home.trim().length > 0 ? home : void 0;
}
/**
* The documents a scan reads and the home they sit under.
*
* The home is resolved the way the harness resolves it — `profileContext.home`
* (which the launcher derives from `resolveDshHome()`), then a non-empty
* `$DSH_HOME`, then `~/.dsh` — so the scanner reads the SAME directory the
* user's settings actually live in. `process.cwd()` is deliberately not a
* candidate: the harness never runs from the home, so a scan that fell back to
* it found nothing and the whole feature did nothing, silently.
*
* @param ctx - the plugin context, read for the launcher's profile home.
* @returns the resolved home and the document reader.
*/
function defaultFiles(ctx) {
	const configured = process.env.DSH_HOME;
	return {
		home: profileHome(ctx) ?? (typeof configured === "string" && configured.trim().length > 0 ? configured.trim() : void 0) ?? join(homedir(), ".dsh"),
		read: (path) => readFile(path, "utf8")
	};
}
/**
* The legacy-data migration: scan the documents DSH's 0.1.7 rename stranded,
* ask the user through the plugin's own settings section, and write back what
* they accept.
*
* Only an `entry-config` host runs this. Under the namespace model the plugin's
* own section IS the legacy `dsh-thinking-effort` namespace, so nothing is
* stranded and a prompt would be noise.
*
* @param ctx - the plugin context.
* @param files - overrides for the documents; tests inject a fake reader.
*/
function installLegacyMigration(ctx, files = defaultFiles(ctx)) {
	const settings = ctx.settings;
	if (settings === void 0) return;
	if (settingsModelForRuntime({ settings }) !== "entry-config") return;
	const ns = pluginSectionId();
	ctx.effect(() => {
		/**
		* The context migration writes run in.
		*
		* 0.1.7 raises the change event from inside the write that caused it, while
		* the config editor still holds its `hmr.runExclusive` transaction open; a
		* listener that writes back is refused with "HMR transactions cannot be
		* nested", and so is anything it defers, because the transaction context
		* travels with `AsyncLocalStorage`. This resource is created while the
		* plugin is applied — outside that transaction — so entering it gives the
		* write a context the host accepts.
		*/
		const scope = new AsyncResource("dsh-thinking-effort:legacy-migration");
		let alive = true;
		let inFlight = false;
		let queued = false;
		let current = Promise.resolve();
		/** Read the plugin's own user layer as published. */
		const ownUser = () => readSettingsSectionUser(settings, ns);
		/**
		* That layer when the host actually publishes it, or `undefined` while the
		* section has not materialized yet. The distinction matters: an absent layer
		* makes every path look unset, which is not a fact to act on.
		*/
		const ownLayer = (user) => isUnknownRecord(user) ? user : void 0;
		/**
		* Run one unit of work in the apply-time context. EVERY write the migration
		* performs goes through here — the control-object writes below AND the
		* migration batch itself. `applyLegacyMigration` invokes its `mutate` before
		* its first `await`, so entering the scope around the call is what gives that
		* batch the context the host accepts; without it the batch is refused as a
		* nested transaction on 0.1.7 and `decision=migrate` could never land.
		*/
		const inScope = (work) => scope.runInAsyncScope(work);
		const write = (ops) => new Promise((resolve, reject) => {
			inScope(() => {
				const mutate = settings.mutate;
				if (typeof mutate !== "function") {
					reject(/* @__PURE__ */ new Error("settings service cannot address paths"));
					return;
				}
				Promise.resolve(mutate.call(settings, ns, ops)).then(() => resolve(), reject);
			});
		});
		const set = (path, value) => write([{
			op: "set",
			path: [...path],
			value
		}]);
		/**
		* One current read of the legacy documents against the live sections.
		*
		* `own` is passed in rather than read here so that ONE pass decides "has my
		* section materialized yet?" from ONE snapshot. Reading it twice lets the
		* scan see an absent layer — every path then looks unset, so the whole set is
		* offered — while a later read sees the section published, and the pass arms
		* an offer computed from a state that no longer holds.
		*/
		const scan = (own) => scanLegacyData({
			home: files.home,
			read: files.read,
			ownUser: own,
			llmPiAiUser: readSettingsSectionUser(settings, SETTINGS_NAMESPACE)
		});
		/**
		* Write one complete control object. Every field is restated because a path
		* `set` replaces the value at that path wholesale; the ones a caller does
		* not care about are carried over from the published object so a write
		* never loses them.
		*/
		const publish = (next) => set(["legacyMigration"], {
			pending: next.pending,
			candidates: next.candidates,
			signature: next.signature,
			dismissedSignature: next.dismissedSignature ?? legacyMigrationOf(ownUser())?.dismissedSignature ?? "",
			decision: "",
			lastResult: next.lastResult ?? "",
			scannedAt: next.scannedAt ?? legacyMigrationOf(ownUser())?.scannedAt ?? "",
			decidedAt: next.decidedAt ?? ""
		});
		/** Persist a fresh offer. */
		const arm = async (result) => {
			await publish({
				pending: true,
				candidates: result.candidates,
				signature: result.signature,
				scannedAt: (/* @__PURE__ */ new Date()).toISOString()
			});
			log("legacy migration: offered", result.candidates.length, "value(s)");
		};
		/**
		* Close the offer out with nothing migrated.
		*
		* `lastResult` is recorded only when the pass ran because the user asked for
		* a scan: a completed scan is a fact the card has to report, while the other
		* callers are reconciling an offer that was already declined or already
		* applied and must not put a result line on screen for a scan nobody asked
		* for. An omitted result clears any earlier one, which is what a fresh offer
		* needs.
		*/
		const settleEmpty = async (result, lastResult) => {
			await publish({
				pending: false,
				candidates: [],
				signature: result.signature,
				scannedAt: (/* @__PURE__ */ new Date()).toISOString(),
				lastResult
			});
		};
		const dismiss = async (signature) => {
			await publish({
				pending: false,
				candidates: [],
				signature,
				dismissedSignature: signature,
				lastResult: LEGACY_RESULT_DISMISSED,
				decidedAt: (/* @__PURE__ */ new Date()).toISOString()
			});
		};
		const clearAfterApply = async (signature, candidates, lastResult) => {
			const failed = lastResult.startsWith(LEGACY_FAILED_PREFIX);
			await publish({
				pending: failed,
				candidates: failed ? candidates : [],
				signature,
				lastResult,
				decidedAt: (/* @__PURE__ */ new Date()).toISOString()
			});
		};
		/** One pass: act on a decision if the user has made one, then reconcile the offer. */
		const pass = async () => {
			const own = ownUser();
			const before = legacyMigrationOf(own);
			const decision = legacyDecisionOf(own);
			if (decision === "migrate") {
				const fresh = await scan(own);
				if (fresh.candidates.length === 0) {
					await settleEmpty(fresh);
					return;
				}
				const lastResult = await inScope(() => applyLegacyMigration({
					settings,
					ns,
					candidates: fresh.candidates,
					snapshot: () => rollbackSnapshot({
						pluginNs: ns,
						createdAt: (/* @__PURE__ */ new Date()).toISOString(),
						sections: {
							[ns]: readSettingsSectionUser(settings, ns) ?? {},
							[SETTINGS_NAMESPACE]: readSettingsSectionUser(settings, SETTINGS_NAMESPACE) ?? {}
						}
					}),
					clear: async () => {}
				}));
				await clearAfterApply(fresh.signature, fresh.candidates, lastResult);
				return;
			}
			if (decision === "dismiss") {
				await dismiss(before?.signature ?? "");
				return;
			}
			const fresh = await scan(own);
			if (decision === "scan") {
				if (fresh.candidates.length > 0) await arm(fresh);
				else await settleEmpty(fresh, LEGACY_RESULT_NOTHING_PENDING);
				return;
			}
			if (ownLayer(own) === void 0) return;
			if (fresh.candidates.length === 0) {
				if (before?.pending === true) await settleEmpty(fresh);
				return;
			}
			if (fresh.signature === before?.dismissedSignature) return;
			if (before?.pending === true && before.signature === fresh.signature) return;
			await arm(fresh);
		};
		const run = () => {
			if (inFlight) {
				queued = true;
				return current;
			}
			inFlight = true;
			let finish = () => {};
			let fail = () => {};
			const settled = new Promise((resolve, reject) => {
				finish = resolve;
				fail = reject;
			});
			current = settled;
			(async () => {
				let passes = 0;
				try {
					do {
						queued = false;
						passes += 1;
						if (!alive) break;
						try {
							await pass();
						} catch (error) {
							log("legacy migration pass error:", error instanceof Error ? error.message : String(error));
						}
					} while (queued && passes < MAX_MIGRATION_PASSES);
					finish();
					if (queued) ctx.timeout(() => run(), 0);
				} catch (error) {
					fail(error);
				} finally {
					inFlight = false;
				}
			})();
			return settled;
		};
		for (const event of settingsChangeEvents("entry-config")) {
			const disposer = ctx.on(event, (...args) => {
				if (args[0] !== ns && args[0] !== SETTINGS_NAMESPACE) return void 0;
				return run();
			});
			ctx.effect(() => () => {
				if (typeof disposer === "function") disposer();
			}, `${LOG_PREFIX}: legacy migration watcher`);
		}
		ctx.effect(() => () => {
			alive = false;
		}, `${LOG_PREFIX}: legacy migration lifetime`);
		ctx.timeout(() => run(), 0);
		run();
		return () => {
			alive = false;
		};
	}, `${LOG_PREFIX}: legacy migration`);
}
//#endregion
//#region lib/types/src/entries/migration.js
/** The legacy-migration entry: scans pre-0.1.7 settings and offers to migrate. */
const name = "spig-dsh-thinking-provider/migration";
const inject = ["settings", "timer"];
function apply(ctx) {
	installLegacyMigration(ctx);
}
//#endregion
export { Config, apply, inject, name };
