window.__ModuleLoader__.load({ id: 'spig-dsh-thinking-provider', factory: (require) => { var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let react = require("react");
react = __toESM(react, 1);
let react_jsx_runtime = require("react/jsx-runtime");
//#region packages/kit/src/shared/guards.ts
/**
* The shared plain-object guard. Every `record()`/`isRecord()` helper across
* `src/` delegates here, so both bundles import this one implementation;
* `src/host/types.ts` re-exports it so existing host callers keep their import
* path. `scripts/check-conventions.mjs` fails the suite if the body below is
* restated anywhere else.
*
* A plain data object is anything non-null, non-array, and `typeof 'object'`,
* which deliberately admits class instances: every call site treats the value
* as an untrusted settings/document read, where an instance is no more
* trustworthy than a literal. `src/compat/model-source.ts` keeps its own
* `isPlainObject` because it must EXCLUDE instances to distinguish a
* hand-written profile from a constructed one.
*/
function isUnknownRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
//#endregion
//#region packages/kit/src/shared/conflict.ts
/**
* Whether a refused settings write was refused because the section moved since
* the caller last read it.
*
* Three call sites grew three different tests. This is their union, ordered by
* how much the transport guarantees:
*
* - `settings/conflict` is the modern Remote's stable code.
* - `SETTINGS_CONFLICT` is the in-process `SettingsConflictError.code`.
* - Neither survives a legacy bridge that only forwards the message text, so
*   the message is matched as a last resort. `changed since it was read` is
*   `SettingsConflictError`'s own wording; a bare `conflict` catches the
*   wrapper message a profile editor produces.
*/
function isSettingsConflict(error) {
	if (error === null || typeof error !== "object") return false;
	const code = error.code;
	if (code === "settings/conflict" || code === "SETTINGS_CONFLICT") return true;
	const message = error.message;
	if (typeof message !== "string") return false;
	return /changed since it was read/i.test(message) || /conflict/i.test(message);
}
//#endregion
//#region packages/kit/src/shared/compaction.ts
/**
* The plugin's own context-compaction policy vocabulary, shared by both
* bundles.
*
* The plugin does NOT mount a compaction backend. In the shipped Web profile the
* official `@deepseek-ai/dsh-compaction-basic` backend lives inside each agent
* preset's isolate realm, so a host-plane plugin cannot read `ctx.compaction`;
* it reaches the exact instance through `ctx.agentPresets.serviceFor(agent,
* 'compaction')`. This module therefore owns only the POLICY the plugin applies
* — the percentages and the per-model overrides — and leaves thresholds,
* retention, and summarization to the official backend.
*
* Why the plugin keeps its own percentages instead of writing
* `compaction-basic.modelPolicies`: that table is a Loader row inside a preset
* declaration, not a settings namespace. Writing it would mean restating the
* whole shipped preset through `configEditor`, which drifts on every DSH
* release. Keeping the policy here costs nothing in behavior as long as the
* plugin's ratio stays BELOW the official one: the plugin compacts first, and
* the official automatic policy then measures a surface already under its own
* threshold and returns without work.
*
* `scripts/check-conventions.mjs` treats the constants below as single-source
* literals; see `docs/CONVENTIONS.md`.
*/
/**
* The fraction of the model's context window at which the plugin compacts.
*
* 0.6 leaves a wide margin under the official backend's default 0.8, so the two
* policies nest instead of racing: the plugin's pass brings pressure back under
* 0.6, and the official automatic check — which runs its own `agent/pre-step`
* listener — then finds the surface below 0.8 and returns `null`. A deployment
* that raises this above the official ratio must also disable the official
* `auto` flag, because otherwise the official pass fires first and this policy
* never sees pressure at all.
*/
const DEFAULT_THRESHOLD_RATIO = .6;
/** The fraction of the message budget the plugin keeps verbatim. */
const DEFAULT_RETAIN_RATIO = .16;
/**
* Why a candidate ratio pair is unusable, or `undefined` when it is fine.
*
* The official backend rejects a retention at or above its threshold at load
* time, which makes a bad pair a broken preset rather than a bad setting. The
* panel validates with this before writing so the user cannot reach that state.
*
* @param thresholdRatio - candidate threshold fraction.
* @param retainRatio - candidate retention fraction.
* @returns a user-facing reason, or `undefined`.
*/
function ratioProblem(thresholdRatio, retainRatio) {
	if (!Number.isFinite(thresholdRatio)) return "threshold-ratio-not-a-number";
	if (thresholdRatio < .1 || thresholdRatio > .95) return "threshold-ratio-out-of-range";
	if (!Number.isFinite(retainRatio)) return "retain-ratio-not-a-number";
	if (retainRatio < .01) return "retain-ratio-out-of-range";
	if (retainRatio >= thresholdRatio) return "retain-ratio-not-below-threshold";
}
/**
* Parse one ratio typed into a text field.
*
* Accepts the percent form the panel shows (`60` meaning 60%) and the fraction
* form (`0.6`), because a user who types either should not have to guess which
* one the field wants. Values above 1 are read as percentages; everything else
* as a fraction.
*
* @param input - raw field text.
* @returns the fraction, or `undefined` when the text is not a number.
*/
function parseRatioInput(input) {
	const trimmed = input.trim();
	if (trimmed.length === 0) return void 0;
	const value = Number(trimmed);
	if (!Number.isFinite(value) || value < 0) return void 0;
	return value > 1 ? value / 100 : value;
}
/**
* Render one fraction for the percent field.
*
* @param ratio - a fraction such as `0.6`.
* @returns the percent spelling without a trailing `%`, e.g. `60`.
*/
function formatRatioPercent(ratio) {
	const percent = ratio * 100;
	return Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
}
/**
* Narrow an untrusted settings read to the policy shape.
*
* The section is a resolved schemastery object on every host that publishes one,
* so this mostly guards the legacy path where the plugin reads its own
* registered namespace and an older document may lack the field entirely.
*
* @param value - the `compaction` field of a resolved section.
* @returns the resolved policy, falling back to the defaults for anything absent.
*/
function compactionPolicyFrom(value) {
	const fallback = {
		thresholdRatio: DEFAULT_THRESHOLD_RATIO,
		retainRatio: DEFAULT_RETAIN_RATIO,
		models: {}
	};
	if (!isUnknownRecord(value)) return fallback;
	const models = {};
	const rawModels = value.models;
	if (isUnknownRecord(rawModels)) for (const [provider, byModel] of Object.entries(rawModels)) {
		if (!isUnknownRecord(byModel)) continue;
		const entries = {};
		for (const [model, rawPolicy] of Object.entries(byModel)) {
			if (!isUnknownRecord(rawPolicy)) continue;
			const threshold = typeof rawPolicy.thresholdRatio === "number" && Number.isFinite(rawPolicy.thresholdRatio) ? rawPolicy.thresholdRatio : void 0;
			const retain = typeof rawPolicy.retainRatio === "number" && Number.isFinite(rawPolicy.retainRatio) ? rawPolicy.retainRatio : void 0;
			entries[model] = {
				...threshold === void 0 ? {} : { thresholdRatio: threshold },
				...retain === void 0 ? {} : { retainRatio: retain }
			};
		}
		if (Object.keys(entries).length > 0) models[provider] = entries;
	}
	return {
		thresholdRatio: typeof value.thresholdRatio === "number" && Number.isFinite(value.thresholdRatio) ? value.thresholdRatio : DEFAULT_THRESHOLD_RATIO,
		retainRatio: typeof value.retainRatio === "number" && Number.isFinite(value.retainRatio) ? value.retainRatio : DEFAULT_RETAIN_RATIO,
		models
	};
}
//#endregion
//#region packages/kit/src/shared/component-switches.ts
/**
* Every row this bundle declares, in composition order.
*
* The root row keeps the id `thinking-effort` rather than `thinking-effort-levels`
* because existing profiles already carry it with their whole `config`; see the
* note in `cordis.patch.yml`.
*/
const COMPONENT_ROWS = {
	levels: {
		rowId: "thinking-effort",
		moduleName: "spig-dsh-thinking-provider"
	},
	settings: {
		rowId: "thinking-effort-settings",
		moduleName: "spig-dsh-thinking-provider/settings"
	},
	opencode: {
		rowId: "thinking-effort-opencode",
		moduleName: "spig-dsh-thinking-provider/opencode"
	},
	compaction: {
		rowId: "thinking-effort-compaction",
		moduleName: "spig-dsh-thinking-provider/compaction"
	},
	subagent: {
		rowId: "thinking-effort-subagent",
		moduleName: "spig-dsh-thinking-provider/subagent"
	},
	migration: {
		rowId: "thinking-effort-migration",
		moduleName: "spig-dsh-thinking-provider/migration"
	},
	composer: {
		rowId: "thinking-effort-composer",
		moduleName: "spig-dsh-thinking-provider/composer"
	}
};
/**
* Which components stop working when another one is switched off.
*
* The rows are not peers. Every feature entry reads its configuration from the
* settings section the ROOT row publishes, and every settings card is rendered
* by the panel that the `settings` row owns — so switching either of those off
* leaves the dependants running against a section nobody publishes, or with no
* surface to configure them.
*
* The direction is "these stop when I stop": {@link COMPONENT_DEPENDENCIES}
* maps a parent to the children it takes down with it. Dependencies are
* transitive — switching the root off disables everything — and a child may
* name several parents, any one of which is enough.
*
* Deliberately NOT a dependency: `composer`. The seat renders the tiers the
* OFFICIAL `modelDirectories` service resolves, not anything this plugin
* writes, so it keeps working with the root off.
*/
const COMPONENT_DEPENDENCIES = {
	/** The root row publishes the settings section every other feature reads. */
	levels: [
		"settings",
		"opencode",
		"compaction",
		"subagent",
		"migration"
	],
	/** The panel is the only surface that configures those features. */
	settings: [
		"opencode",
		"compaction",
		"subagent",
		"migration"
	]
};
/**
* Resolve every component switch from one inventory snapshot.
*
* A row is matched by module name rather than by entry id: the inventory's
* `entryId` is a Loader-internal branded id, while `moduleName` is the specifier
* the composition declares — the same string this bundle's `cordis.patch.yml`
* names. Matching on it keeps the answer correct even if the Loader renumbers
* entry ids across a reload.
*
* @param snapshot - the Host's inventory, or `undefined` when it could not be read.
* @returns one state per component.
*/
function componentSwitchesFrom(snapshot) {
	const states = {};
	for (const key of Object.keys(COMPONENT_ROWS)) {
		const { moduleName } = COMPONENT_ROWS[key];
		const row = snapshot?.entries?.find((entry) => entry.moduleName === moduleName);
		states[key] = row === void 0 ? snapshot === void 0 ? "unknown" : "off" : row.enabled === true ? "on" : "off";
	}
	return cascadeDependencies(states);
}
/**
* Take a component down when a component it depends on is off.
*
* The Host reports each row's OWN switch, so a profile can leave a child row on
* while the parent it needs is off — and then the child would render controls
* whose configuration section nobody publishes, or that have no surface to
* reach them from. Resolving the cascade here means every consumer sees one
* answer instead of each surface re-deriving it.
*
* Only `off` propagates: a parent whose state is `unknown` was not reported as
* disabled, and cascading that would hide working controls on a host that merely
* cannot answer.
*
* @param states - each row's own state, as the Host reported it.
* @returns the same map with dependants of a disabled parent switched off.
*/
function cascadeDependencies(states) {
	const resolved = { ...states };
	for (let pass = 0; pass < Object.keys(COMPONENT_ROWS).length; pass += 1) {
		let changed = false;
		for (const [parent, children] of Object.entries(COMPONENT_DEPENDENCIES)) {
			if (resolved[parent] !== "off") continue;
			for (const child of children) {
				if (resolved[child] === "off") continue;
				resolved[child] = "off";
				changed = true;
			}
		}
		if (!changed) break;
	}
	return resolved;
}
/**
* Whether a component's client surface should render.
*
* `unknown` counts as enabled: a Host that cannot report its inventory is one
* this plugin supports (the inventory remote is newer than the entry-config
* settings model), and a working surface is the safer default there.
*
* @param state - one resolved switch.
* @returns whether to render that component's UI.
*/
function componentEnabled(state) {
	return state !== "off";
}
//#endregion
//#region packages/kit/src/shared/component-switch-store.ts
/**
* Create a store that starts at "every part on" and is updated from the Host.
*
* Starting at all-on matters: the first read is asynchronous, and a store that
* began at all-off would blank the panel for a frame. All-on also matches what
* an older host without the inventory remote resolves to.
*
* @returns the store plus the setter the reader calls.
*/
function createComponentSwitchStore() {
	let current = componentSwitchesFrom(void 0);
	const listeners = /* @__PURE__ */ new Set();
	const notify = () => {
		for (const listener of listeners) listener();
	};
	return {
		store: {
			getSnapshot: () => current,
			subscribe: (listener) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			}
		},
		update: (next) => {
			if (Object.keys(next).every((key) => next[key] === current[key])) return;
			current = next;
			notify();
		}
	};
}
/**
* Whether one part of a surface should render, from a store snapshot.
*
* @param snapshot - the store's current answer.
* @param key - the component row to ask about.
* @returns whether that part renders.
*/
function partEnabled(snapshot, key) {
	return componentEnabled(snapshot[key]);
}
/** Keep a slot registered for as long as its component is enabled. */
function registerComponentSlot(switches, key, register) {
	let unregister;
	const sync = () => {
		if (switches === void 0 || partEnabled(switches.getSnapshot(), key)) unregister ??= register();
		else {
			unregister?.();
			unregister = void 0;
		}
	};
	sync();
	const unsubscribe = switches?.subscribe(sync);
	return () => {
		unsubscribe?.();
		unregister?.();
	};
}
//#endregion
//#region packages/kit/src/shared/read-component-switches.ts
function snapshotOf(answer) {
	if (typeof answer !== "object" || answer === null) return void 0;
	const envelope = answer;
	if (envelope.ok === false) return void 0;
	const value = envelope.ok === true ? envelope.value : answer;
	if (typeof value !== "object" || value === null) return void 0;
	const snapshot = value;
	return Array.isArray(snapshot.entries) ? snapshot : void 0;
}
/**
* Read the Loader inventory on startup and after plugin-manager changes.
* Returns a manual read for hosts that only report changes on demand.
*/
function readComponentSwitches(context, onChange) {
	let reread;
	context.inject(["remote.pluginInventory"], function watchInventory(scope) {
		const remote = scope.get("remote");
		const inventory = remote?.pluginInventory;
		if (typeof inventory?.list !== "function") return;
		let version = 0;
		let active = true;
		const read = async () => {
			const request = ++version;
			let snapshot;
			try {
				snapshot = snapshotOf(await inventory.list());
			} catch {
				return false;
			}
			if (!active || request !== version || snapshot === void 0) return false;
			onChange(componentSwitchesFrom(snapshot));
			return true;
		};
		reread = read;
		scope.effect(() => {
			const unsubscribe = remote?.$on?.("plugin-manager/changed", () => {
				read();
			});
			read();
			return () => {
				active = false;
				if (reread === read) reread = void 0;
				unsubscribe?.();
			};
		}, "dsh-thinking-effort: component inventory");
	});
	return () => reread?.() ?? Promise.resolve(false);
}
//#endregion
//#region packages/kit/src/compat/gateway/fields.ts
const COMPLETIONS = ["openai-completions"];
const RESPONSES = [
	"openai-responses",
	"azure-openai-responses",
	"openai-codex-responses"
];
const COMPLETIONS_AND_RESPONSES = [...COMPLETIONS, ...RESPONSES];
const STRICT_MODE_PROTOCOLS = [...COMPLETIONS_AND_RESPONSES, "bedrock-converse-stream"];
const LONG_CACHE_PROTOCOLS = [...COMPLETIONS_AND_RESPONSES, "anthropic-messages"];
const GATEWAY_COMPAT_GROUPS = [
	{
		id: "role",
		titleKey: "gatewayGroupRole"
	},
	{
		id: "format",
		titleKey: "gatewayGroupFormat"
	},
	{
		id: "stream",
		titleKey: "gatewayGroupStream"
	},
	{
		id: "cache",
		titleKey: "gatewayGroupCache"
	}
];
const SUPPORTED_THINKING_FORMATS = [
	"openai",
	"openrouter",
	"deepseek",
	"together",
	"baseten",
	"zai",
	"qwen",
	"chat-template",
	"qwen-chat-template",
	"string-thinking",
	"ant-ling"
];
const MAX_TOKENS_FIELDS = ["max_tokens", "max_completion_tokens"];
/** DSH's own list, so the enum offers exactly the wire spellings pi-ai accepts. */
const THINKING_TOKEN_BUDGET_FIELDS = [
	"thinking_token_budget",
	"thinking_budget",
	"thinking_budget_tokens"
];
function booleanField(key, group, protocols) {
	return {
		key,
		kind: "boolean",
		group,
		labelKey: key,
		protocols
	};
}
function enumField(key, group, protocols, enumValues, enumOptions) {
	return {
		key,
		kind: "enum",
		group,
		labelKey: key,
		protocols,
		enumValues,
		enumOptions
	};
}
function numberField(key, group, protocols, step) {
	return {
		key,
		kind: "number",
		group,
		labelKey: key,
		protocols,
		step
	};
}
const GATEWAY_COMPAT_FIELDS = {
	supportsDeveloperRole: booleanField("supportsDeveloperRole", "role", COMPLETIONS_AND_RESPONSES),
	supportsReasoningEffort: booleanField("supportsReasoningEffort", "role", COMPLETIONS),
	supportsThinkingTokenBudget: booleanField("supportsThinkingTokenBudget", "role", COMPLETIONS),
	thinkingTokenBudgetField: enumField("thinkingTokenBudgetField", "role", COMPLETIONS, THINKING_TOKEN_BUDGET_FIELDS, [
		{
			value: "thinking_token_budget",
			labelKey: "thinkingTokenBudgetFieldTokenBudget"
		},
		{
			value: "thinking_budget",
			labelKey: "thinkingTokenBudgetFieldBudget"
		},
		{
			value: "thinking_budget_tokens",
			labelKey: "thinkingTokenBudgetFieldBudgetTokens"
		}
	]),
	thinkingFormat: enumField("thinkingFormat", "format", COMPLETIONS, SUPPORTED_THINKING_FORMATS),
	maxTokensField: enumField("maxTokensField", "format", COMPLETIONS, MAX_TOKENS_FIELDS, [{
		value: "max_tokens",
		labelKey: "maxTokensFieldStandard"
	}, {
		value: "max_completion_tokens",
		labelKey: "maxTokensFieldCompletion"
	}]),
	vllmPriority: numberField("vllmPriority", "format", COMPLETIONS, 1),
	supportsMaxOutputTokens: booleanField("supportsMaxOutputTokens", "format", RESPONSES),
	requiresThinkingAsText: booleanField("requiresThinkingAsText", "format", COMPLETIONS),
	requiresReasoningContentOnAssistantMessages: booleanField("requiresReasoningContentOnAssistantMessages", "format", COMPLETIONS),
	supportsUsageInStreaming: booleanField("supportsUsageInStreaming", "stream", COMPLETIONS),
	supportsFinishReason: booleanField("supportsFinishReason", "stream", COMPLETIONS),
	requiresToolResultName: booleanField("requiresToolResultName", "stream", COMPLETIONS),
	requiresAssistantAfterToolResult: booleanField("requiresAssistantAfterToolResult", "stream", COMPLETIONS),
	supportsStrictMode: booleanField("supportsStrictMode", "stream", STRICT_MODE_PROTOCOLS),
	supportsStore: booleanField("supportsStore", "cache", COMPLETIONS),
	supportsLongCacheRetention: booleanField("supportsLongCacheRetention", "cache", LONG_CACHE_PROTOCOLS),
	cacheControlFormat: enumField("cacheControlFormat", "cache", COMPLETIONS, ["anthropic"], [{
		value: "anthropic",
		labelKey: "cacheControlFormatAnthropic"
	}])
};
const GATEWAY_COMPAT_FIELD_KEYS = Object.keys(GATEWAY_COMPAT_FIELDS);
/**
* Return the gateway compat fields offered by a route's `api` protocol. An
* unknown or missing api offers every registered field, so routes that do not
* declare a protocol keep the previous full-field compatibility behavior.
* Handles api values that are a string, an object (e.g. the provider profile),
* or undefined.
*/
function fieldsForApi(api) {
	const rawProtocol = typeof api === "string" && api.length > 0 ? api : record$8(api)?.api;
	const protocol = typeof rawProtocol === "string" && rawProtocol.length > 0 ? rawProtocol : void 0;
	if (protocol === void 0) return GATEWAY_COMPAT_FIELD_KEYS;
	const offered = GATEWAY_COMPAT_FIELD_KEYS.filter((key) => GATEWAY_COMPAT_FIELDS[key].protocols.some((candidate) => candidate === protocol));
	return offered.length > 0 ? offered : GATEWAY_COMPAT_FIELD_KEYS;
}
function record$8(value) {
	return isUnknownRecord(value) ? value : void 0;
}
/**
* The fields DSH began offering in `0.1.3-alpha.2`. Verified against the real
* package: `COMPLETIONS_COMPAT_GATE` grew `thinkingTokenBudgetField` (and
* `vllmPriority`, task 7) and `RESPONSES_COMPAT_GATE` grew
* `supportsMaxOutputTokens`, taking the offer counts from 17/3 to 19/4.
* `0.1.2-alpha.2` and `0.1.2-rc.1` were checked and do NOT have them, which is
* why the boundary is `0.1.3-alpha.2` and not the older `0.1.2-alpha.1`.
*
* The boundary is a PRERELEASE comparison, so `0.1.3-0` and `0.1.3-alpha.1`
* stay in the previous window: `0.1.3-0` < `0.1.3-alpha.1` < `0.1.3-alpha.2`.
*/
const ALPHA3_PLUS_COMPAT_FIELDS = [
	...[
		...[
			"supportsStore",
			"supportsDeveloperRole",
			"supportsReasoningEffort",
			"supportsUsageInStreaming",
			"maxTokensField",
			"requiresToolResultName",
			"requiresAssistantAfterToolResult",
			"requiresThinkingAsText",
			"requiresReasoningContentOnAssistantMessages",
			"supportsStrictMode",
			"thinkingFormat",
			"cacheControlFormat",
			"supportsLongCacheRetention"
		],
		"supportsFinishReason",
		"supportsThinkingTokenBudget"
	],
	"thinkingTokenBudgetField",
	"vllmPriority",
	"supportsMaxOutputTokens"
];
function fieldsInGroup(group) {
	return GATEWAY_COMPAT_FIELD_KEYS.map((key) => GATEWAY_COMPAT_FIELDS[key]).filter((spec) => spec.group === group);
}
//#endregion
//#region packages/kit/src/shared/constants.ts
/**
* The single source of every cross-module identifier. Both bundles import this
* module, so it may not reach a `node:` built-in.
*
* `scripts/check-conventions.mjs` enforces the table in `docs/CONVENTIONS.md`:
* it fails the suite when any of these literals reappears elsewhere under
* `src/`, which is what stops the drift that produced four spellings of
* `llm-pi-ai` and two of the level table.
*
* `src/client/index.ts`'s `SLOT_ID` is deliberately NOT here: it is a UI slot
* id, not a settings section id.
*/
const LLM_PI_AI_NS = "llm-pi-ai";
const PLUGIN_NS = "dsh-thinking-effort";
const PLUGIN_ENTRY_ID = "thinking-effort";
const SNAPSHOT_KIND = "dsh-thinking-effort/config-snapshot";
/** DSH's reasoning levels, in the order both the Host and the Client render them. */
const ALL_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
/** The levels this plugin adds to a hand-declared model that declares none. */
const DEFAULT_LEVELS$1 = {
	off: null,
	high: "high",
	max: "max"
};
/** The `x-opencode-session` generator vocabularies; one copy each. */
const FORMAT_MODES = [
	"ses-derive",
	"passthrough",
	"template",
	"expression",
	"script"
];
const FORMAT_TIMES = ["firstUse", "hash"];
const FORMAT_INVALID_POLICIES = [
	"warn",
	"drop",
	"send"
];
/**
* The locale namespace both client packages register dictionaries under.
*
* It lives in kit because two separate client packages bind it: the settings
* panel and the Composer seat. Duplicating the literal would let the two drift
* and one of them silently fall back to raw keys.
*/
const LOCALE_NS = "settings.thinkingEffort";
const PLUGIN_VERSION = "0.4.2";
//#endregion
//#region packages/kit/src/compat/version-map.ts
const semverPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
/**
* Half-open capability windows. Each `maximumExclusive` bound marks the first
* DSH version whose capabilities are not yet known, so a release newer than the
* newest window maps to nothing. An unmapped version is not an error: callers
* fall back to the runtime capability the host actually exposes, and
* `resolveCompatibility` reports the detected profile without a mismatch
* diagnostic. Extend the newest bound when a release is verified to stay inside
* the window it would otherwise fall out of.
*
* The newest window is bounded per minor line, matching how `0.1.6-0` was
* chosen for the `0.1.5` line: `0.1.6-alpha.1` was verified directly (modern
* Settings transport, `user`-layer reads, the same editable compat fields as
* the window it joins, external language packs, optional takeover) and the
* bound moved to `0.1.7-0` so the whole `0.1.6` line resolves instead of
* falling out of the map.
*
* The `0.1.2-alpha.1` line splits at `0.1.3-alpha.2`: that prerelease is what
* grew the editable field set (`thinkingTokenBudgetField` on completions,
* `supportsMaxOutputTokens` on Responses, plus the numeric `vllmPriority`),
* measured against the real packages. The split is a prerelease comparison, so
* `0.1.3-0` and `0.1.3-alpha.1` still resolve to the narrower set.
*
* The `0.1.7` window records the settings rewrite: `0.1.7-alpha.1` was verified
* directly and keeps the modern transport, the `user` layer, the same editable
* compat fields, external language packs and optional takeover, but replaces
* namespace registration with per-entry `Config` forms. `0.2.0-rc.2` was
* verified to stay inside that same window: the settings controller,
* `configForms`, `plugin-compatibility`, the locale pack and the model
* directory are byte-identical to `0.2.0-rc.1`, the pi-ai `compatProfile` is
* unchanged, and the one gate that release adds (`mistral-conversations`)
* offers no field, so the plugin's editable set is untouched. `0.2.1-alpha.1`
* was verified the same way against `0.2.0-rc.2`: every API this plugin reads
* is byte-identical (settings controller, `configForms`,
* `plugin-compatibility`, locale pack, model directory, the
* `conversation.input.model` seat contract — still `{ locked }` — and the
* `modelDirectories`/`remote.session` faces), pi-ai stays at 0.87.1 with the
* same offered field sets, and the release's breaking changes miss this
* plugin: it imports no `./invariant` entry, registers no input-stats
* extension, and is configured as a package-root specifier rather than a
* subpath specifier. `0.2.1-rc.5` keeps the consumed API faces of `0.2.1-rc.4`;
* its Chat reasoning-body Slot change is unused by this plugin. `0.2.2-alpha.2`
* keeps the settings and gateway capabilities in this window, but changes the
* AgentLoop selection contract. The Host applies subagent effort through
* `agent.model.select()` at `agent/created` when available, with the legacy
* `agent/request` fallback for older hosts. The bound is `0.2.3-0`, the first
* release of the next minor line.
*/
const versionRanges = [{
	minimum: "0.1.7-alpha.1",
	maximumExclusive: "0.2.3-0",
	capabilities: {
		settingsTransport: "modern",
		settingsApi: "remote.settings",
		settingsModel: "entry-config",
		baseModelFields: [
			"reasoningEfforts",
			"input",
			"contextWindow"
		],
		gatewayCompatFields: ALPHA3_PLUS_COMPAT_FIELDS,
		externalLanguages: true,
		takeoverTransport: "optional"
	}
}];
function comparableVersion(value) {
	const [withoutBuild] = value.split("+", 2);
	const separator = withoutBuild.indexOf("-");
	const core = separator === -1 ? withoutBuild : withoutBuild.slice(0, separator);
	const prerelease = separator === -1 ? void 0 : withoutBuild.slice(separator + 1);
	const [major, minor, patch] = core.split(".").map(Number);
	return {
		major,
		minor,
		patch,
		prerelease: prerelease === void 0 ? [] : prerelease.split(".").map((part) => /^\d+$/.test(part) ? Number(part) : part)
	};
}
function compareVersions(left, right) {
	for (const key of [
		"major",
		"minor",
		"patch"
	]) if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
	if (left.prerelease.length === 0 || right.prerelease.length === 0) {
		if (left.prerelease.length === right.prerelease.length) return 0;
		return left.prerelease.length === 0 ? 1 : -1;
	}
	const length = Math.max(left.prerelease.length, right.prerelease.length);
	for (let index = 0; index < length; index += 1) {
		const leftPart = left.prerelease[index];
		const rightPart = right.prerelease[index];
		if (leftPart === void 0 || rightPart === void 0) return leftPart === void 0 ? -1 : 1;
		if (leftPart === rightPart) continue;
		if (typeof leftPart === "number" && typeof rightPart === "string") return -1;
		if (typeof leftPart === "string" && typeof rightPart === "number") return 1;
		return leftPart < rightPart ? -1 : 1;
	}
	return 0;
}
function isValidSemver(value) {
	return typeof value === "string" && semverPattern.test(value);
}
function capabilitiesForVersion(version) {
	if (!isValidSemver(version)) return void 0;
	const comparable = comparableVersion(version);
	return versionRanges.find((range) => compareVersions(comparable, comparableVersion(range.minimum)) >= 0 && compareVersions(comparable, comparableVersion(range.maximumExclusive)) < 0)?.capabilities;
}
function takeoverTransportForVersion(version) {
	return capabilitiesForVersion(version)?.takeoverTransport;
}
function takeoverSupportedForVersion(version) {
	return takeoverTransportForVersion(version) === "optional";
}
//#endregion
//#region packages/kit/src/compat/capabilities.ts
function hasMethods(value, methods) {
	if (typeof value !== "object" && typeof value !== "function" || value === null) return false;
	return methods.every((method) => {
		let current = value;
		while (current !== null) {
			const descriptor = Object.getOwnPropertyDescriptor(current, method);
			if (descriptor === void 0) {
				current = Object.getPrototypeOf(current);
				continue;
			}
			return "value" in descriptor ? typeof descriptor.value === "function" : typeof Reflect.get(value, method) === "function";
		}
		return false;
	});
}
function capabilities(settings, externalLanguages) {
	return {
		settings,
		externalLanguages
	};
}
function clientCapabilities(input) {
	return capabilities(hasMethods(input.remoteSettings, ["describe", "mutate"]) ? "remote" : hasMethods(input.legacySettings, ["describe", "mutate"]) ? "legacy" : "none", typeof input.addLanguage === "function");
}
//#endregion
//#region packages/kit/src/compat/gateway/validation.ts
function record$7(value) {
	return isUnknownRecord(value) ? value : void 0;
}
function hasProperty(value, key) {
	const object = record$7(value);
	return object !== void 0 && Object.prototype.hasOwnProperty.call(object, key);
}
function dereference(value, refs) {
	let current = value;
	const seen = /* @__PURE__ */ new Set();
	while (typeof current === "number" && refs !== void 0) {
		const key = String(current);
		if (seen.has(key) || !Object.prototype.hasOwnProperty.call(refs, key)) return void 0;
		seen.add(key);
		current = refs[key];
	}
	return current;
}
/**
* The schema node one field path addresses.
*
* `schema` is whatever a `settings/describe` row publishes — under the
* `entry-config` model that is `Schema.prototype.toJSON()`, a `{ uid, refs }`
* envelope whose root sits at `refs[String(uid)]` and whose children are
* numeric references into the same table. An envelope carries no top-level
* `dict`, so `schema.dict` reads nothing there: reading a form's fields means
* resolving the root through here first. Paths name `dict`/`properties` keys,
* with `*` for the `additionalProperties`/inner node of a dict or array. A
* plain (non-envelope) schema is walked in place, which is what the
* hand-written fixtures use.
*/
function schemaNodeAtPath(schema, path) {
	const envelope = record$7(schema);
	const refs = record$7(envelope?.refs);
	let node = refs !== void 0 && envelope?.uid !== void 0 ? refs[String(envelope.uid)] : schema;
	for (const key of path) {
		const object = record$7(dereference(node, refs));
		if (object === void 0) return void 0;
		const properties = record$7(object.dict) ?? record$7(object.properties);
		node = dereference((key === "*" ? object.additionalProperties ?? properties?.["*"] : properties?.[key]) ?? (object.type === "dict" || object.type === "array" ? object.inner : void 0), refs);
	}
	return record$7(dereference(node, refs));
}
function schemaProperties(value) {
	const object = record$7(value);
	if (!object) return void 0;
	const properties = record$7(object.properties) ?? record$7(object.dict);
	if (properties) return properties;
	const schema = record$7(object.schema);
	if (schema) return schemaProperties(schema);
	const inner = record$7(object.inner);
	if (inner) return schemaProperties(inner);
	const objectSchema = record$7(object.object);
	if (objectSchema) return schemaProperties(objectSchema);
	const additionalProperties = record$7(object.additionalProperties);
	if (additionalProperties) return schemaProperties(additionalProperties);
	const items = record$7(object.items);
	if (items) return schemaProperties(items);
}
function compatProperties(schema) {
	const pathProperties = schemaProperties(schemaNodeAtPath(schema, [
		"providers",
		"*",
		"compat"
	]));
	if (pathProperties && GATEWAY_COMPAT_FIELD_KEYS.some((field) => hasProperty(pathProperties, field))) return pathProperties;
	const direct = schemaProperties(schema);
	if (direct && GATEWAY_COMPAT_FIELD_KEYS.some((field) => hasProperty(direct, field))) return direct;
	const providers = direct?.providers;
	const compat = schemaProperties(providers)?.compat;
	const nested = schemaProperties(compat);
	if (nested) return nested;
	const descriptor = record$7(schema);
	if (!descriptor) return void 0;
	for (const key of [
		"schema",
		"value",
		"descriptor"
	]) {
		const nestedResult = compatProperties(descriptor[key]);
		if (nestedResult) return nestedResult;
	}
}
function schemaAllowsField(schema, field) {
	const properties = compatProperties(schema);
	return properties !== void 0 && hasProperty(properties, field);
}
function runtimeAllowsField(capabilities, field) {
	if (capabilities === "modern" || capabilities === "legacy") return true;
	if (capabilities === "unknown" || capabilities === void 0 || capabilities === null || typeof capabilities !== "object") return false;
	return Array.isArray(capabilities.gatewayCompatFields) && capabilities.gatewayCompatFields.includes(field);
}
/**
* Compute which gateway compat fields are editable for a provider route.
*
* A field must pass (a) the runtime version capabilities, (b) the descriptor
* schema offering it, and — when `api` is provided — (c) the route protocol's
* offer (`fieldsForApi`). When `api` is absent the protocol gate is skipped, so
* routes without a declared protocol keep full-field compatibility. The
* resulting availability map only marks fields the filtered set offers, so the
* UI never presents (and never attempts to write) a field DSH's
* `assertOfferedCompatFields` would reject for that protocol.
*/
function editableProviderCompatFields(capabilities, descriptorSchema, api) {
	const protocolFields = api === void 0 ? void 0 : fieldsForApi(api);
	const editableFieldsResult = GATEWAY_COMPAT_FIELD_KEYS.filter((field) => runtimeAllowsField(capabilities, field) && schemaAllowsField(descriptorSchema, field) && (protocolFields === void 0 || protocolFields.includes(field)));
	return {
		...Object.fromEntries(editableFieldsResult.map((field) => [field, true])),
		editableFields: editableFieldsResult
	};
}
//#endregion
//#region packages/kit/src/compat/model-source.ts
function isPlainObject$1(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
function hasModelSourceConflict(profile) {
	if (!isPlainObject$1(profile) || !Array.isArray(profile.models) || profile.models.length === 0) return false;
	const overrides = profile.modelOverrides;
	return isPlainObject$1(overrides) && Object.getOwnPropertyNames(overrides).length > 0;
}
function hasLayeredModelSourceConflict(namespace, route) {
	if (route.trim() === "" || !isPlainObject$1(namespace)) return false;
	let hasModels = false;
	let hasOverrides = false;
	for (const layerName of [
		"value",
		"base",
		"user"
	]) {
		if (!Object.prototype.hasOwnProperty.call(namespace, layerName)) continue;
		const layer = namespace[layerName];
		if (!isPlainObject$1(layer)) continue;
		const providers = layer.providers;
		if (!isPlainObject$1(providers) || !Object.prototype.hasOwnProperty.call(providers, route)) continue;
		const profile = providers[route];
		if (!isPlainObject$1(profile)) continue;
		hasModels ||= Array.isArray(profile.models) && profile.models.length > 0;
		hasOverrides ||= isPlainObject$1(profile.modelOverrides) && Object.getOwnPropertyNames(profile.modelOverrides).length > 0;
		if (hasModels && hasOverrides) return true;
	}
	return false;
}
//#endregion
//#region packages/kit/src/compat/gateway/takeover.ts
/** Read-only interoperability helpers for the optional OpenAI-completions takeover. */
function runtimeCapabilities(input) {
	if (input.version !== void 0) {
		if (typeof input.version !== "string") return void 0;
		const mapped = capabilitiesForVersion(input.version);
		if (mapped !== void 0) return takeoverSupportedForVersion(input.version) ? mapped : void 0;
	}
	if (input.runtimeProfile !== "legacy" && input.runtimeProfile !== "modern") return void 0;
	const editability = editableProviderCompatFields(input.runtimeProfile, input.descriptorSchema);
	if (editability.supportsDeveloperRole !== true || editability.maxTokensField !== true) return void 0;
	return {
		settingsTransport: input.runtimeProfile,
		settingsApi: input.runtimeProfile === "modern" ? "remote.settings" : "connection.api.settings",
		settingsModel: "entry-config",
		baseModelFields: ["reasoningEfforts"],
		gatewayCompatFields: GATEWAY_COMPAT_FIELD_KEYS,
		externalLanguages: input.runtimeProfile === "modern",
		takeoverTransport: "optional"
	};
}
const OFFICIAL_HOST_RE = /(?:^|\.)(?:deepseek\.com|openai\.com|openrouter\.ai|anthropic\.com|googleapis\.com|ai\.google\.dev|mistral\.ai|x\.ai)$/i;
function isEffortsTable(value) {
	return isUnknownRecord(value);
}
function modelRows(profile) {
	if (profile === void 0 || hasModelSourceConflict(profile)) return [];
	const rows = [];
	if (Array.isArray(profile.models)) rows.push(...profile.models.filter(isUnknownRecord));
	if (isUnknownRecord(profile.modelOverrides)) rows.push(...Object.values(profile.modelOverrides).filter(isUnknownRecord));
	return rows;
}
/** Whether this profile points to a custom OpenAI-compatible endpoint. */
function isCustomOpenAiGateway(profile) {
	if (profile?.api !== "openai-completions" || typeof profile.baseURL !== "string" || profile.baseURL.trim() === "") return false;
	try {
		const endpoint = new URL(profile.baseURL);
		if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") return false;
		return !OFFICIAL_HOST_RE.test(endpoint.hostname);
	} catch {
		return false;
	}
}
/** Whether any shared llm-pi-ai model declares thinking capability. */
function declaresThinking(profile) {
	return modelRows(profile).some((model) => isEffortsTable(model.reasoningEfforts));
}
/** Identify custom thinking routes only when the mapped runtime allows takeover. */
function identifyTakeoverProviders(section, capabilities) {
	if (capabilities?.takeoverTransport !== "optional") return [];
	const providers = section?.providers;
	if (!isUnknownRecord(providers)) return [];
	return Object.entries(providers).filter(([, profile]) => isCustomOpenAiGateway(profile) && declaresThinking(profile)).map(([provider]) => provider);
}
/**
* Read the optional transport-layer takeover list. `null` means the transport
* plugin is not installed; an empty array means installed but inactive.
*/
function takeoverProvidersOf(section) {
	if (section === void 0) return null;
	if (section.enabled !== true || !Array.isArray(section.providers)) return [];
	return section.providers.filter((provider) => typeof provider === "string");
}
/**
* Resolve the providers eligible for the current runtime. Unknown versions and
* unsupported mapped versions intentionally produce no takeover candidates.
*/
function resolveTakeoverProviders(input) {
	const capabilities = runtimeCapabilities(input);
	if (capabilities === void 0) return [];
	const identified = identifyTakeoverProviders(input.piAi, capabilities);
	const configured = takeoverProvidersOf(input.takeover);
	return configured === null ? identified : identified.filter((provider) => configured.includes(provider));
}
function modelCompatFor(profile, model) {
	if (model === void 0 || hasModelSourceConflict(profile)) return void 0;
	if (isUnknownRecord(profile.modelOverrides) && Object.prototype.hasOwnProperty.call(profile.modelOverrides, model)) {
		const override = profile.modelOverrides[model];
		if (isUnknownRecord(override)) return override.compat;
		return;
	}
	if (Array.isArray(profile.models)) {
		const row = profile.models.find((candidate) => isUnknownRecord(candidate) && candidate.id === model);
		if (isUnknownRecord(row)) return row.compat;
	}
}
/** Project the shared provider/model config without retaining live settings objects. */
function takeoverGatewayCompatInputs(section, provider, model) {
	const providers = section?.providers;
	if (!isUnknownRecord(providers) || !Object.prototype.hasOwnProperty.call(providers, provider)) return {};
	const profileValue = providers[provider];
	if (!isUnknownRecord(profileValue)) return {};
	const profile = profileValue;
	const modelCompat = modelCompatFor(profile, model);
	return {
		providerCompat: profile.compat,
		...modelCompat === void 0 ? {} : { modelCompat }
	};
}
//#endregion
//#region packages/kit/src/compat/gateway/resolve.ts
function record$6(value) {
	return isUnknownRecord(value) ? value : void 0;
}
function compatRecord(value) {
	const input = record$6(value);
	if (!input) return void 0;
	return record$6(input.compat) ?? input;
}
function readCompat(value) {
	const candidates = Array.isArray(value) ? value : [value];
	const output = {};
	for (const candidate of candidates) {
		const input = compatRecord(candidate);
		if (!input) continue;
		for (const spec of Object.values(GATEWAY_COMPAT_FIELDS)) {
			if (output[spec.key] !== void 0) continue;
			const fieldValue = input[spec.key];
			if (spec.kind === "boolean") {
				if (typeof fieldValue === "boolean") output[spec.key] = fieldValue;
			} else if (spec.kind === "enum") {
				if (typeof fieldValue === "string" && spec.enumValues.some((entry) => entry === fieldValue)) output[spec.key] = fieldValue;
			} else if (typeof fieldValue === "number" && Number.isFinite(fieldValue)) output[spec.key] = fieldValue;
		}
	}
	return output;
}
function sourceFor(field, sources) {
	for (const candidate of sources) {
		const value = candidate.value[field];
		if (value !== void 0) return {
			value,
			source: candidate.source
		};
	}
	return {
		value: void 0,
		source: "unknown"
	};
}
function resolveGatewayCompat(input) {
	const sources = [
		{
			value: readCompat(input.modelCompat),
			source: "model"
		},
		{
			value: readCompat(input.providerCompat),
			source: "provider"
		},
		{
			value: readCompat(input.baseCompat),
			source: "base"
		},
		{
			value: readCompat(input.catalogCompat),
			source: "catalog"
		},
		{
			value: readCompat(input.protocolDefault),
			source: "protocol"
		}
	];
	const fields = {};
	for (const key of GATEWAY_COMPAT_FIELD_KEYS) fields[key] = sourceFor(key, sources);
	return {
		provider: input.provider,
		...input.model === void 0 ? {} : { model: input.model },
		...fields,
		...input.versionCapabilities === void 0 ? {} : { versionCapabilities: input.versionCapabilities }
	};
}
function resolveTakeoverGatewayCompat(input) {
	const version = input.version;
	if (!resolveTakeoverProviders({
		version,
		runtimeProfile: input.runtimeProfile,
		descriptorSchema: input.descriptorSchema,
		piAi: input.piAi,
		takeover: input.takeover
	}).includes(input.provider)) return void 0;
	const capabilities = typeof version === "string" ? capabilitiesForVersion(version) : void 0;
	const projected = takeoverGatewayCompatInputs(input.piAi, input.provider, input.model);
	return resolveGatewayCompat({
		provider: input.provider,
		...input.model === void 0 ? {} : { model: input.model },
		...projected,
		...capabilities === void 0 ? {} : { versionCapabilities: capabilities }
	});
}
function selectionFor(modelCompatValue, kind) {
	if (modelCompatValue === void 0) return "auto";
	if (kind === "boolean") return modelCompatValue ? "supported" : "unsupported";
	return String(modelCompatValue);
}
function isFieldAvailable(editability, key, resolved) {
	const record = editability;
	if (Object.prototype.hasOwnProperty.call(record, key)) return record[key] === true;
	if (Object.prototype.hasOwnProperty.call(record, `${key}Available`)) return record[`${key}Available`] === true;
	const ef = record.editableFields;
	if (Array.isArray(ef)) return ef.includes(key);
	return resolved !== void 0;
}
function resolveModelGatewayCompat(input, editability = {}) {
	const resolution = resolveGatewayCompat(input);
	const modelCompat = readCompat(input.modelCompat);
	const out = {
		provider: input.provider,
		model: input.model
	};
	for (const key of GATEWAY_COMPAT_FIELD_KEYS) {
		const spec = GATEWAY_COMPAT_FIELDS[key];
		out[key] = selectionFor(modelCompat[key], spec.kind);
		out[`${key}Source`] = resolution[key].source;
		out[`${key}Resolved`] = resolution[key].value;
		out[`${key}Available`] = isFieldAvailable(editability, key, resolution[key].value);
	}
	return out;
}
function providerSource(resolution) {
	const sources = GATEWAY_COMPAT_FIELD_KEYS.map((key) => resolution[key].source);
	if (sources.includes("model") || sources.includes("provider")) return "user";
	if (sources.includes("protocol") || sources.includes("base")) return "base";
	if (sources.includes("catalog")) return "catalog";
	return "unknown";
}
function resolveProviderGatewayCompat(input, editability = {}) {
	const resolution = resolveGatewayCompat({
		...input,
		model: void 0,
		modelCompat: void 0
	});
	const out = { provider: input.provider };
	for (const key of GATEWAY_COMPAT_FIELD_KEYS) {
		const spec = GATEWAY_COMPAT_FIELDS[key];
		out[key] = selectionFor(resolution[key].source === "provider" ? resolution[key].value : void 0, spec.kind);
		out[`${key}Source`] = resolution[key].source;
		out[`${key}Resolved`] = resolution[key].value;
		out[`${key}Available`] = isFieldAvailable(editability, key, resolution[key].value);
	}
	out.source = providerSource(resolution);
	return out;
}
//#endregion
//#region packages/kit/src/compat/gateway/ops.ts
function providerPath(provider, field) {
	return [
		"providers",
		provider,
		"compat",
		field
	];
}
function fieldValue(spec, value) {
	if (value === "auto") return void 0;
	if (spec.kind === "boolean") {
		if (value === "supported") return true;
		if (value === "unsupported") return false;
		return;
	}
	if (spec.kind === "enum") {
		if (typeof value === "string" && spec.enumValues.some((entry) => entry === value)) return value;
		return;
	}
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		if (Number.isFinite(parsed) && Number.isInteger(parsed)) return parsed;
	}
}
function pushFieldOperation(operations, path, spec, value) {
	const result = fieldValue(spec, value);
	if (result === void 0) {
		if (value === "auto") operations.push({
			op: "unset",
			path
		});
		return;
	}
	operations.push({
		op: "set",
		path,
		value: result
	});
}
function fieldEditable(editability, key, spec, value) {
	if (typeof value === "string" && (value === "auto" || fieldValue(spec, value) !== void 0)) return editability?.[key] === true;
	return false;
}
function opsForProviderCompat(provider, update, editability) {
	if (provider.trim() === "") return [];
	const fields = Object.keys(update);
	if (fields.length === 0) return [];
	if (fields.some((field) => {
		if (!GATEWAY_COMPAT_FIELD_KEYS.includes(field)) return true;
		const key = field;
		return !fieldEditable(editability, key, GATEWAY_COMPAT_FIELDS[key], update[key]);
	})) return [];
	const operations = [];
	GATEWAY_COMPAT_FIELD_KEYS.forEach((key) => {
		if (!Object.prototype.hasOwnProperty.call(update, key)) return;
		pushFieldOperation(operations, providerPath(provider, key), GATEWAY_COMPAT_FIELDS[key], update[key]);
	});
	return operations;
}
function opsForModelCompat(item, update, editability) {
	if (item.inOverrides !== true || item.modelSourceConflict === true || typeof item.route !== "string" || item.route.trim() === "" || typeof item.model !== "string" || item.model.trim() === "") return [];
	const fields = Object.keys(update);
	if (fields.length === 0) return [];
	if (fields.some((field) => {
		if (!GATEWAY_COMPAT_FIELD_KEYS.includes(field)) return true;
		const key = field;
		return !fieldEditable(editability, key, GATEWAY_COMPAT_FIELDS[key], update[key]);
	})) return [];
	const prefix = [
		"providers",
		item.route,
		"modelOverrides",
		item.model,
		"compat"
	];
	const operations = [];
	GATEWAY_COMPAT_FIELD_KEYS.forEach((key) => {
		if (!Object.prototype.hasOwnProperty.call(update, key)) return;
		pushFieldOperation(operations, [...prefix, key], GATEWAY_COMPAT_FIELDS[key], update[key]);
	});
	return operations;
}
function opsForModelArrayCompat(inventory, item, update, editability) {
	if (item.inOverrides !== false || item.modelSourceConflict === true || typeof item.route !== "string" || item.route.trim() === "" || typeof item.model !== "string" || item.model.trim() === "" || !Number.isInteger(item.index) || item.index < 0) return [];
	if (inventory.some((candidate) => candidate.route === item.route && (candidate.modelSourceConflict === true || candidate.inOverrides === true))) return [];
	if (inventory.filter((candidate) => candidate.inOverrides === false && candidate.route === item.route && candidate.index === item.index && candidate.model === item.model).length !== 1) return [];
	const fields = Object.keys(update);
	if (fields.length === 0) return [];
	if (fields.some((field) => {
		if (!GATEWAY_COMPAT_FIELD_KEYS.includes(field)) return true;
		const key = field;
		return !fieldEditable(editability, key, GATEWAY_COMPAT_FIELDS[key], update[key]);
	})) return [];
	const clone = (value) => {
		if (Array.isArray(value)) return value.map((entry) => clone(entry));
		if (typeof value !== "object" || value === null) return value;
		const source = value;
		const copy = {};
		for (const [key, entry] of Object.entries(source)) Object.defineProperty(copy, key, {
			configurable: true,
			enumerable: true,
			value: clone(entry),
			writable: true
		});
		return copy;
	};
	const snapshot = item.modelsSnapshot ?? inventory.filter((candidate) => candidate.inOverrides === false && candidate.route === item.route).sort((left, right) => left.index - right.index).map((candidate) => candidate.raw);
	if (!Array.isArray(snapshot) || snapshot.length <= item.index) return [];
	const originalTarget = snapshot[item.index];
	if (typeof originalTarget !== "object" || originalTarget === null || Array.isArray(originalTarget) || originalTarget.id !== item.model) return [];
	const models = snapshot.map((entry, index) => {
		if (index !== item.index) return clone(entry);
		const model = clone(entry);
		const compatSource = model.compat;
		const compat = isUnknownRecord(compatSource) ? { ...compatSource } : {};
		GATEWAY_COMPAT_FIELD_KEYS.forEach((key) => {
			if (!Object.prototype.hasOwnProperty.call(update, key)) return;
			const value = update[key];
			if (value === "auto") delete compat[key];
			else compat[key] = fieldValue(GATEWAY_COMPAT_FIELDS[key], value);
		});
		if (Object.keys(compat).length === 0) delete model.compat;
		else model.compat = compat;
		return model;
	});
	return [{
		op: "set",
		path: [
			"providers",
			item.route,
			"models"
		],
		value: models
	}];
}
/** Prefix of `lastResult` when the write was refused; the reason follows. */
const LEGACY_FAILED_PREFIX = "failed:";
function record$5(value) {
	return isUnknownRecord(value) ? value : void 0;
}
/** The `legacyMigration` object of one published section's `user` layer. */
function legacyMigrationOf(user) {
	return record$5(record$5(user)?.legacyMigration);
}
/** The candidates a prompt lists; empty when none was ever written. */
function legacyCandidatesOf(user) {
	const candidates = legacyMigrationOf(user)?.candidates;
	return Array.isArray(candidates) ? candidates : [];
}
/**
* Whether the Host is asking the user to decide. `pending` alone is not enough:
* a section mid-write can carry the flag before its candidates land, and a
* prompt with nothing to show would be an empty dialog.
*/
function isLegacyMigrationPending(user) {
	return legacyMigrationOf(user)?.pending === true && legacyCandidatesOf(user).length > 0;
}
//#endregion
//#region packages/kit/src/compat/model-selection-directory.ts
function selectionOf(value) {
	if (!isUnknownRecord(value) || typeof value.provider !== "string" || typeof value.model !== "string") return null;
	if (value.provider.length === 0 || value.model.length === 0) return null;
	if (value.reasoningEffort !== void 0 && typeof value.reasoningEffort !== "string") return null;
	return value;
}
function nextOf(projected) {
	const value = projected.getSnapshot();
	return isUnknownRecord(value) ? selectionOf(value.next) : null;
}
function sameSelection(left, right) {
	return left === right || left !== null && right !== null && left.provider === right.provider && left.model === right.model && left.reasoningEffort === right.reasoningEffort;
}
/** Preserve a confirmed session selection across missing projection frames. */
function createSelectionDirectory(instance, projected) {
	let confirmed = nextOf(projected);
	let observed = confirmed;
	let ignoredPending = null;
	let projectionRevision = 0;
	let generation = 0;
	let disposed = false;
	let active = null;
	let selectionError = null;
	const listeners = /* @__PURE__ */ new Set();
	function read() {
		const raw = instance.store.getSnapshot();
		const rawPending = raw.pending ?? null;
		const pending = active ?? (sameSelection(rawPending, ignoredPending) ? null : rawPending);
		const current = pending ?? confirmed ?? raw.current;
		const routable = current === null || raw.routable === null ? null : raw.groups.some((group) => group.id === current.provider && group.models.some((model) => model.id === current.model));
		const status = selectionError === null ? raw.status : "error";
		const error = selectionError ?? raw.error;
		return sameSelection(current, raw.current) && sameSelection(pending, raw.pending ?? null) && routable === raw.routable && status === raw.status && error === raw.error ? raw : {
			...raw,
			current,
			pending,
			routable,
			status,
			error
		};
	}
	let snapshot = read();
	function publish() {
		if (disposed) return;
		snapshot = read();
		for (const listener of listeners) listener();
	}
	const unsubscribeDirectory = instance.store.subscribe(() => {
		const pending = instance.store.getSnapshot().pending ?? null;
		if (!sameSelection(pending, ignoredPending)) {
			ignoredPending = null;
			if (pending !== null) selectionError = null;
		}
		if (selectionError !== null && pending === null && instance.store.getSnapshot().status !== "selecting") selectionError = null;
		if (active !== null && pending !== null && !sameSelection(active, pending)) {
			++generation;
			active = null;
		}
		publish();
	});
	const unsubscribeProjection = projected.subscribe(() => {
		const next = nextOf(projected);
		const pending = instance.store.getSnapshot().pending ?? null;
		const confirmsPending = pending !== null && sameSelection(next, pending) && !sameSelection(next, confirmed);
		if (next !== null && (!sameSelection(next, observed) || confirmsPending)) {
			observed = next;
			confirmed = next;
			selectionError = null;
			projectionRevision++;
			if (pending !== null && !sameSelection(pending, next)) ignoredPending = pending;
			if (active !== null && !sameSelection(active, next)) {
				++generation;
				active = null;
			}
		}
		publish();
	});
	return {
		directory: {
			getSnapshot: () => snapshot,
			subscribe: (listener) => {
				if (disposed) return () => {};
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			}
		},
		load: () => {
			if (!disposed) instance.load().catch(() => {});
		},
		select: async (selection) => {
			if (disposed) return false;
			const operation = ++generation;
			const revision = projectionRevision;
			active = selection;
			selectionError = null;
			ignoredPending = null;
			publish();
			let accepted = false;
			let rejection = null;
			try {
				const result = await instance.select(selection);
				accepted = !isUnknownRecord(result) || result.ok !== false;
			} catch (error) {
				rejection = error instanceof Error ? error.message : String(error);
			}
			if (disposed || operation !== generation) return false;
			if (!accepted) {
				const pending = instance.store.getSnapshot().pending ?? null;
				if (sameSelection(pending, selection)) ignoredPending = pending;
				selectionError = rejection;
			}
			if (accepted && revision === projectionRevision) confirmed = selection;
			active = null;
			publish();
			return accepted;
		},
		reset: () => {
			if (disposed) return;
			++generation;
			confirmed = null;
			observed = null;
			ignoredPending = null;
			selectionError = null;
			active = null;
			publish();
		},
		dispose: () => {
			if (disposed) return;
			disposed = true;
			++generation;
			unsubscribeDirectory();
			unsubscribeProjection();
			listeners.clear();
		}
	};
}
//#endregion
//#region packages/kit/src/compat/model-directory.ts
/** The plain directory face used whenever the retained-selection overlay cannot run. */
function plainFace(instance) {
	return {
		directory: instance.store,
		load: () => {
			instance.load().catch(() => {});
		},
		select: (selection) => instance.select(selection).then((result) => !isUnknownRecord(result) || result.ok !== false, () => false)
	};
}
/** Resolve public projection access without reading the directory's private fields. */
function createModelDirectoryFaceResolver(context, directories) {
	const value = context.get("sessions");
	const sessions = isUnknownRecord(value) && typeof value.binding === "function" && typeof value.scope === "function" ? value : void 0;
	const cached = /* @__PURE__ */ new WeakMap();
	const active = /* @__PURE__ */ new Map();
	if (sessions !== void 0) {
		context.on("connection/reset", () => {
			for (const face of active.keys()) face.reset();
		});
		context.effect(() => () => {
			for (const dispose of active.values()) dispose();
			active.clear();
		});
	}
	return (sessionId) => {
		const instance = directories.directoryFor(sessionId);
		const binding = sessions?.binding(sessionId);
		const owner = sessions?.scope(sessionId);
		const scope = typeof owner?.effect === "function" ? owner : void 0;
		const projections = binding?.session?.projections;
		const projected = typeof projections?.faceOf === "function" ? projections.faceOf("modelSelection") : void 0;
		if (binding === void 0 || scope === void 0 || !isUnknownRecord(projected) || typeof projected.getSnapshot !== "function" || typeof projected.subscribe !== "function") return plainFace(instance);
		const projection = projected;
		const previous = cached.get(binding);
		if (previous?.instance === instance && previous.projected === projection) return previous.face;
		const face = createSelectionDirectory(instance, projection);
		let disposed = false;
		let releaseOwner;
		const dispose = () => {
			if (disposed) return;
			disposed = true;
			face.dispose();
			active.delete(face);
			if (cached.get(binding)?.face === face) cached.delete(binding);
			if (typeof releaseOwner === "function") releaseOwner();
		};
		try {
			releaseOwner = scope.effect(() => dispose);
		} catch {
			face.dispose();
			return plainFace(instance);
		}
		previous?.dispose();
		cached.set(binding, {
			instance,
			projected: projection,
			face,
			dispose
		});
		active.set(face, dispose);
		return face;
	};
}
/** Read and narrow the optional host model-directory service. */
function asModelDirectories(value) {
	if (value === null || typeof value !== "object") return void 0;
	return typeof value.directoryFor === "function" ? value : void 0;
}
/**
* Detect the modern session Remote namespace by method shape. DSH rc.7/rc.8
* use `connection.api.sessions` and do not provide `remote.session`.
* @param context - Client context with inject-free service reads.
* @returns Whether the session Remote generation is installed.
*/
function hasSessionRemote(context) {
	return hasMethods(context.get("remote.session"), ["modelCatalog"]);
}
/**
* Build the exact Cordis dependencies for the official model-directory
* generation. Older DSH builds must not inject the missing `remote.session`
* service: Cordis parks such a fiber until the service exists.
* @param context - Client context used for the generation probe.
* @returns The generation and its required injected services.
*/
function modelDirectoryCompatibility(context) {
	return hasSessionRemote(context) ? {
		generation: "session",
		inject: [
			"slots",
			"modelDirectories",
			"sessions",
			"remote",
			"remote.session"
		]
	} : {
		generation: "connection",
		inject: [
			"slots",
			"modelDirectories",
			"sessions",
			"connection",
			"remote"
		]
	};
}
//#endregion
//#region packages/kit/src/compat/opencode-expression.ts
function tokenize(source) {
	const tokens = [];
	let index = 0;
	while (index < source.length) {
		const char = source[index];
		if (char === " " || char === "	" || char === "\n" || char === "\r") {
			index += 1;
			continue;
		}
		if (char === "\"" || char === "'") {
			const quote = char;
			index += 1;
			let value = "";
			let closed = false;
			while (index < source.length) {
				const current = source[index];
				if (current === "\\") {
					value += source[index + 1] ?? "";
					index += 2;
					continue;
				}
				if (current === quote) {
					index += 1;
					closed = true;
					break;
				}
				value += current;
				index += 1;
			}
			if (!closed) throw new Error("unterminated string literal");
			tokens.push({
				type: "string",
				value
			});
			continue;
		}
		if (/[0-9]/.test(char)) {
			let value = "";
			while (index < source.length && /[0-9.]/.test(source[index])) {
				value += source[index];
				index += 1;
			}
			tokens.push({
				type: "number",
				value
			});
			continue;
		}
		if (/[A-Za-z_]/.test(char)) {
			let value = "";
			while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) {
				value += source[index];
				index += 1;
			}
			tokens.push({
				type: "ident",
				value
			});
			continue;
		}
		if (char === "(") {
			tokens.push({
				type: "lparen",
				value: "("
			});
			index += 1;
			continue;
		}
		if (char === ")") {
			tokens.push({
				type: "rparen",
				value: ")"
			});
			index += 1;
			continue;
		}
		if (char === ",") {
			tokens.push({
				type: "comma",
				value: ","
			});
			index += 1;
			continue;
		}
		if (char === "+") {
			tokens.push({
				type: "op",
				value: "+"
			});
			index += 1;
			continue;
		}
		throw new Error(`unexpected character '${char}'`);
	}
	tokens.push({
		type: "eof",
		value: ""
	});
	return tokens;
}
var ExpressionParser = class {
	tokens;
	index = 0;
	constructor(tokens) {
		this.tokens = tokens;
	}
	parse() {
		const node = this.parseAdditive();
		const tail = this.tokens[this.index];
		if (tail?.type !== "eof") throw new Error(`unexpected token '${tail?.value ?? ""}'`);
		return node;
	}
	parseAdditive() {
		let left = this.parsePrimary();
		while (this.tokens[this.index]?.type === "op" && this.tokens[this.index]?.value === "+") {
			this.index += 1;
			const right = this.parsePrimary();
			left = {
				kind: "binary",
				op: "+",
				left,
				right
			};
		}
		return left;
	}
	parsePrimary() {
		const token = this.tokens[this.index];
		if (token === void 0) throw new Error("unexpected end of expression");
		if (token.type === "string") {
			this.index += 1;
			return {
				kind: "literal",
				value: token.value
			};
		}
		if (token.type === "number") {
			this.index += 1;
			return {
				kind: "literal",
				value: Number(token.value)
			};
		}
		if (token.type === "lparen") {
			this.index += 1;
			const node = this.parseAdditive();
			if (this.tokens[this.index]?.type !== "rparen") throw new Error("expected ')'");
			this.index += 1;
			return node;
		}
		if (token.type === "ident") {
			const name = token.value;
			this.index += 1;
			if (this.tokens[this.index]?.type === "lparen") {
				this.index += 1;
				const args = [];
				if (this.tokens[this.index]?.type !== "rparen") {
					args.push(this.parseAdditive());
					while (this.tokens[this.index]?.type === "comma") {
						this.index += 1;
						args.push(this.parseAdditive());
					}
				}
				if (this.tokens[this.index]?.type !== "rparen") throw new Error("expected ')' after arguments");
				this.index += 1;
				return {
					kind: "call",
					name,
					args
				};
			}
			return {
				kind: "ref",
				name
			};
		}
		throw new Error(`unexpected token '${token.value}'`);
	}
};
/**
* Parse an expression without evaluating it.
*
* The Host uses this path indirectly (through {@link evaluateNode}) and the
* Client uses it directly: a configuration that cannot be parsed makes the
* Host fall back to `ses-derive`, so the card must refuse to save one.
* @param source - expression text from the settings document.
* @returns the parsed node.
* @throws when the source is not a valid expression.
*/
function parseExpression(source) {
	return new ExpressionParser(tokenize(source)).parse();
}
/**
* Every identifier the evaluation scope provides — the data keys of the Host's
* `SessionFormatContext`. The Host asserts these two sets are exactly equal at
* compile time, so this list cannot drift away from what evaluation sees.
*/
const SESSION_CONTEXT_KEYS = [
	"provider",
	"model",
	"rawSessionId",
	"sessionId",
	"now",
	"hex12",
	"tail62",
	"sha256"
];
/** Every helper function `expression` mode may call. Also type-checked against the Host's table. */
const EXPRESSION_HELPER_NAMES = [
	"sha256",
	"slice",
	"lower",
	"upper"
];
/**
* Collect the names a parsed expression references or calls.
*
* The Host evaluates a name it does not know by throwing (`unknown identifier` /
* `unknown function`), which the caller catches and turns into a silent fall
* back to `ses-derive`. A validator therefore cannot stop at syntax: it has to
* know which names exist.
* @param node - a parsed expression.
* @returns the referenced identifiers and the called function names.
*/
function collectExpressionNames(node) {
	const refs = [];
	const calls = [];
	const visit = (current) => {
		switch (current.kind) {
			case "literal": return;
			case "ref":
				refs.push(current.name);
				return;
			case "call":
				calls.push(current.name);
				for (const arg of current.args) visit(arg);
				return;
			case "binary":
				visit(current.left);
				visit(current.right);
				return;
		}
	};
	visit(node);
	return {
		refs,
		calls
	};
}
//#endregion
//#region packages/kit/src/compat/opencode-session.ts
/**
* The section id under the registered-namespace settings model (rc.7 … 0.1.6).
* The 0.1.7 entry-config model addresses the section by Loader entry id
* instead, which `settingsEntryId` reads from the live fiber.
*/
const OPENCODE_SESSION_NAMESPACE = PLUGIN_NS;
/**
* Whether a settings section id is this plugin's own. Which id that is depends
* on the settings model the running host exposes, and the Client cannot ask:
* its settings bridge answers `describe`/`mutate` only, so every host looks
* like the entry-config model from there. Accepting BOTH ids is what keeps a
* legacy host resolving `dsh-thinking-effort` while a 0.1.7 host resolves the
* entry id, with no model detection anywhere.
*/
function isOpenCodeSessionSectionId(value) {
	return value === OPENCODE_SESSION_NAMESPACE || value === "thinking-effort";
}
function record$4(value) {
	return isUnknownRecord(value) ? value : void 0;
}
function ownRecord$2(value, key) {
	const object = record$4(value);
	if (object === void 0 || !Object.prototype.hasOwnProperty.call(object, key)) return void 0;
	return record$4(object[key]);
}
function isOpenCodeSessionEnabled(settings, provider, model) {
	if (provider.length === 0 || model.length === 0) return false;
	const models = ownRecord$2(ownRecord$2(ownRecord$2(ownRecord$2(settings, "opencodeSession"), "providers"), provider), "models");
	return Object.prototype.hasOwnProperty.call(models ?? {}, model) && models?.[model] === true;
}
function modelPath(provider, model) {
	if (provider.length === 0 || model.length === 0) return void 0;
	return [
		"opencodeSession",
		"providers",
		provider,
		"models",
		model
	];
}
//#endregion
//#region packages/kit/src/compat/version-adapter.ts
function profileForCapabilities(capabilities) {
	if (capabilities.settings === "remote") return "modern";
	if (capabilities.settings === "legacy") return "legacy";
	return "unknown";
}
function invalidVersionDiagnostic(version, capabilities) {
	return {
		code: "invalid-version",
		...version === void 0 ? {} : { version },
		actualCapabilities: capabilities,
		message: "Runtime version metadata is not a valid semver value."
	};
}
function mismatchDiagnostic(version, expectedProfile, capabilities) {
	return {
		code: "version-capability-mismatch",
		version,
		expectedProfile,
		actualCapabilities: capabilities,
		message: `Version metadata expects ${expectedProfile}, but detected capabilities select ${profileForCapabilities(capabilities)}.`
	};
}
function resolveCompatibility(input) {
	const { capabilities } = input;
	const actualProfile = profileForCapabilities(capabilities);
	const version = input.version;
	const diagnostics = [];
	if (version === void 0) return {
		profile: actualProfile,
		capabilities,
		diagnostics
	};
	if (!isValidSemver(version)) return {
		profile: "unknown",
		...typeof version === "string" ? { version } : {},
		capabilities,
		diagnostics: [invalidVersionDiagnostic(typeof version === "string" ? version : void 0, capabilities)]
	};
	const mappedCapabilities = capabilitiesForVersion(version);
	const expected = mappedCapabilities === void 0 ? void 0 : mappedCapabilities.settingsTransport;
	if (expected === void 0) return {
		profile: actualProfile,
		version,
		capabilities,
		diagnostics
	};
	if (expected !== actualProfile) {
		diagnostics.push(mismatchDiagnostic(version, expected, capabilities));
		return {
			profile: actualProfile,
			version,
			expected,
			versionCapabilities: mappedCapabilities,
			capabilities,
			diagnostics
		};
	}
	return {
		profile: expected,
		version,
		expected,
		versionCapabilities: mappedCapabilities,
		capabilities,
		diagnostics
	};
}
//#endregion
//#region packages/kit/src/client-types.ts
function revisionOf(input, ns) {
	const section = Array.isArray(input) ? input.find((candidate) => candidate.ns === ns) : input;
	return typeof section?.revision === "number" ? section.revision : 0;
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.4/node_modules/@deepseek-ai/cosmokit/lib/index.js
/** Return true when a value is `null` or `undefined`. */
function isNullable(value) {
	return value === null || value === void 0;
}
/** Return true for non-array object values. */
function isPlainObject(data) {
	return data && typeof data === "object" && !Array.isArray(data);
}
/** Filter object entries and return a new object. */
function filterKeys(object, filter) {
	return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
/** Map object values while preserving the original key set. */
function mapValues(object, transform) {
	return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
/** Pick selected keys from an object, optionally including `undefined` values. */
function pick(source, keys, forced) {
	if (!keys) return { ...source };
	const result = {};
	for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
	return result;
}
/** Shared config references used by schema validators and plugin runtimes. */
const write = Symbol.for("cosmokit.volatile.write");
function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
	if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
	if (value === null || typeof value !== "object") return value;
	if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
	ancestors.add(value);
	try {
		if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
		if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
		return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
	} finally {
		ancestors.delete(value);
	}
}
/**
* Create a detached reference containing an immutable copy of the supplied data.
* @param value - validated config data; class instances and functions are unsupported.
* @returns a reference whose value is updated only by its owning runtime.
*/
function createVolatile(value) {
	let current = snapshot(value);
	return Object.freeze({
		get: () => current,
		[write]: (value) => {
			current = value;
		}
	});
}
/**
* Identify references across ESM/CJS copies of the shared library.
* @param value - a parsed config value.
* @returns whether the value implements the shared reference protocol.
*/
function isVolatile(value) {
	return typeof value === "object" && value !== null && write in value;
}
/** Test values using `instanceof` with a `toStringTag` fallback. */
function is(type, value) {
	if (arguments.length === 1) return (value) => is(type, value);
	return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
	return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
	return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
/** Binary source detection and base64/hex conversion helpers. */
var Binary;
(function(Binary) {
	Binary.is = isArrayBufferLike;
	Binary.isSource = isArrayBufferSource;
	function fromSource(source) {
		if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
		else return source;
	}
	Binary.fromSource = fromSource;
	function toBase64(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
		let binary = "";
		const bytes = new Uint8Array(source);
		for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
		return btoa(binary);
	}
	Binary.toBase64 = toBase64;
	function fromBase64(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
		return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
	}
	Binary.fromBase64 = fromBase64;
	function toHex(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
		return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
	}
	Binary.toHex = toHex;
	function fromHex(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
		const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
		const buffer = [];
		for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
		return Uint8Array.from(buffer).buffer;
	}
	Binary.fromHex = fromHex;
})(Binary || (Binary = {}));
Binary.fromBase64;
Binary.toBase64;
Binary.fromHex;
Binary.toHex;
/** Deep-clone common JavaScript values while preserving prototypes and cycles. */
function clone(source, refs = /* @__PURE__ */ new Map()) {
	if (!source || typeof source !== "object") return source;
	if (is("Date", source)) return new Date(source.valueOf());
	if (is("RegExp", source)) return new RegExp(source.source, source.flags);
	if (isArrayBufferLike(source)) return source.slice(0);
	if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
	const cached = refs.get(source);
	if (cached) return cached;
	if (Array.isArray(source)) {
		const result = [];
		refs.set(source, result);
		source.forEach((value, index) => {
			result[index] = Reflect.apply(clone, null, [value, refs]);
		});
		return result;
	}
	const result = Object.create(Object.getPrototypeOf(source));
	refs.set(source, result);
	for (const key of Reflect.ownKeys(source)) {
		const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
		if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
		Reflect.defineProperty(result, key, descriptor);
	}
	return result;
}
/**
* Compare values recursively, treating two volatile references as equal regardless of value.
* Strict comparison distinguishes null/undefined, treats opaque objects by identity,
* compares URLs by normalized href, treats array holes as undefined, and considers distinct cyclic structures unequal.
* @param a - first value.
* @param b - second value.
* @param strict - whether to require strict data equality outside volatile references.
* @returns whether the values compare equal.
*/
function deepEqual(a, b, strict) {
	const ancestors = /* @__PURE__ */ new Set();
	function compare(a, b) {
		if (a === b) return true;
		if (isVolatile(a) || isVolatile(b)) return isVolatile(a) && isVolatile(b);
		if (!strict && isNullable(a) && isNullable(b)) return true;
		if (typeof a !== typeof b || typeof a !== "object" || !a || !b) return false;
		if (ancestors.has(a)) return false;
		function check(test, then) {
			return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
		}
		ancestors.add(a);
		try {
			return check(Array.isArray, (a, b) => {
				if (a.length !== b.length) return false;
				for (let index = 0; index < a.length; index++) if (!compare(a[index], b[index])) return false;
				return true;
			}) ?? check(is("Date"), (a, b) => a.valueOf() === b.valueOf()) ?? check(is("URL"), (a, b) => a.href === b.href) ?? check(is("RegExp"), (a, b) => a.source === b.source && a.flags === b.flags) ?? check(isArrayBufferLike, (a, b) => {
				if (a.byteLength !== b.byteLength) return false;
				const viewA = new Uint8Array(a);
				const viewB = new Uint8Array(b);
				for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
				return true;
			}) ?? ((!strict || [a, b].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
				...a,
				...b
			}).every((key) => compare(a[key], b[key])));
		} finally {
			ancestors.delete(a);
		}
	}
	return compare(a, b);
}
/** Time constants plus parsing and formatting helpers. */
var Time;
(function(Time) {
	Time.millisecond = 1;
	Time.second = 1e3;
	Time.minute = Time.second * 60;
	Time.hour = Time.minute * 60;
	Time.day = Time.hour * 24;
	Time.week = Time.day * 7;
	let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
	function setTimezoneOffset(offset) {
		timezoneOffset = offset;
	}
	Time.setTimezoneOffset = setTimezoneOffset;
	function getTimezoneOffset() {
		return timezoneOffset;
	}
	Time.getTimezoneOffset = getTimezoneOffset;
	function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
		if (typeof date === "number") date = new Date(date);
		if (offset === void 0) offset = timezoneOffset;
		return Math.floor((date.valueOf() / Time.minute - offset) / 1440);
	}
	Time.getDateNumber = getDateNumber;
	function fromDateNumber(value, offset) {
		const date = new Date(value * Time.day);
		if (offset === void 0) offset = timezoneOffset;
		return new Date(+date + offset * Time.minute);
	}
	Time.fromDateNumber = fromDateNumber;
	const numeric = /\d+(?:\.\d+)?/.source;
	const timeRegExp = new RegExp(`^${[
		"w(?:eek(?:s)?)?",
		"d(?:ay(?:s)?)?",
		"h(?:our(?:s)?)?",
		"m(?:in(?:ute)?(?:s)?)?",
		"s(?:ec(?:ond)?(?:s)?)?"
	].map((unit) => `(${numeric}${unit})?`).join("")}$`);
	function parseTime(source) {
		const capture = timeRegExp.exec(source);
		if (!capture) return 0;
		return (parseFloat(capture[1]) * Time.week || 0) + (parseFloat(capture[2]) * Time.day || 0) + (parseFloat(capture[3]) * Time.hour || 0) + (parseFloat(capture[4]) * Time.minute || 0) + (parseFloat(capture[5]) * Time.second || 0);
	}
	Time.parseTime = parseTime;
	function parseDate(date) {
		const parsed = parseTime(date);
		if (parsed) date = Date.now() + parsed;
		else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
		else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
		return date ? new Date(date) : /* @__PURE__ */ new Date();
	}
	Time.parseDate = parseDate;
	function format(ms) {
		const abs = Math.abs(ms);
		if (abs >= Time.day - Time.hour / 2) return Math.round(ms / Time.day) + "d";
		else if (abs >= Time.hour - Time.minute / 2) return Math.round(ms / Time.hour) + "h";
		else if (abs >= Time.minute - Time.second / 2) return Math.round(ms / Time.minute) + "m";
		else if (abs >= Time.second) return Math.round(ms / Time.second) + "s";
		return ms + "ms";
	}
	Time.format = format;
	function toDigits(source, length = 2) {
		return source.toString().padStart(length, "0");
	}
	Time.toDigits = toDigits;
	function template(template, time = /* @__PURE__ */ new Date()) {
		return template.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
	}
	Time.template = template;
})(Time || (Time = {}));
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+schemastery@3.18.3/node_modules/@deepseek-ai/schemastery/lib/index.mjs
const kSchema = Symbol.for("schemastery");
const kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
	options;
	name = "ValidationError";
	constructor(message, options) {
		let prefix = "$";
		for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
		else if (typeof segment === "number") prefix += "[" + segment + "]";
		else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
		if (prefix.startsWith(".")) prefix = prefix.slice(1);
		super((prefix === "$" ? "" : `${prefix} `) + message);
		this.options = options;
	}
	static is(error) {
		return !!error?.[kValidationError];
	}
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
const Schema = function(options) {
	const schema = function(data, options = {}) {
		return Schema.resolve(data, schema, options)[0];
	};
	if (options.refs) {
		const refs = mapValues(options.refs, (options) => new Schema(options));
		const getRef = (uid) => refs[uid];
		for (const key in refs) {
			const options = refs[key];
			options.sKey = getRef(options.sKey);
			options.inner = getRef(options.inner);
			options.list = options.list && options.list.map(getRef);
			options.dict = options.dict && mapValues(options.dict, getRef);
		}
		return refs[options.uid];
	}
	Object.assign(schema, options);
	if (typeof schema.callback === "string") try {
		schema.callback = new Function("return " + schema.callback)();
	} catch {}
	Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
	Object.setPrototypeOf(schema, Schema.prototype);
	schema.meta ||= {};
	schema.toString = schema.toString.bind(schema);
	return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
	return {
		version: 1,
		vendor: "schemastery",
		validate: (value) => {
			try {
				return { value: Schema.resolve(value, this, {})[0] };
			} catch (error) {
				if (ValidationError.is(error)) return { issues: [{
					message: error.message,
					path: error.options.path
				}] };
				throw error;
			}
		}
	};
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
	if (globalThis.__schemastery_refs__) {
		globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
		return this.uid;
	}
	globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
	globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
	const result = {
		uid: this.uid,
		refs: globalThis.__schemastery_refs__
	};
	globalThis.__schemastery_refs__ = void 0;
	return result;
};
Schema.prototype.set = function set(key, value) {
	this.dict[key] = value;
	return this;
};
Schema.prototype.push = function push(value) {
	this.list.push(value);
	return this;
};
function mergeDesc(original, messages) {
	const result = typeof original === "string" ? { "": original } : { ...original };
	for (const locale in messages) {
		const value = messages[locale];
		if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
		else if (typeof value === "string") result[locale] = value;
	}
	return result;
}
function getInner(value) {
	return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
	return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
	const schema = Schema(this);
	const desc = mergeDesc(schema.meta.description, messages);
	if (Object.keys(desc).length) schema.meta.description = desc;
	if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
		return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
	});
	if (schema.list) schema.list = schema.list.map((inner, index) => {
		return inner.i18n(mapValues(messages, (data = {}) => {
			if (Array.isArray(getInner(data))) return getInner(data)[index];
			if (Array.isArray(data)) return data[index];
			return extractKeys(data);
		}));
	});
	if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
		if (getInner(data)) return getInner(data);
		return extractKeys(data);
	}));
	if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
	return schema;
};
Schema.prototype.extra = function extra(key, value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
};
for (const key of [
	"required",
	"disabled",
	"collapse",
	"hidden",
	"loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
Schema.prototype.deprecated = function deprecated() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "deprecated",
		type: "danger"
	});
	return schema;
};
Schema.prototype.experimental = function experimental() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "experimental",
		type: "warning"
	});
	return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
	const schema = Schema(this);
	const pattern = pick(regexp, ["source", "flags"]);
	schema.meta = {
		...schema.meta,
		pattern
	};
	return schema;
};
Schema.prototype.simplify = function simplify(value) {
	if (isVolatile(value)) value = value.get();
	if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
	if (isNullable(value)) return value;
	if (this.type === "object" || this.type === "dict") {
		const result = {};
		for (const key in value) {
			const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
			if (this.type === "dict" || !isNullable(item)) result[key] = item;
		}
		if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
		return result;
	} else if (this.type === "array" || this.type === "tuple") {
		const result = [];
		value.forEach((value, index) => {
			const schema = this.type === "array" ? this.inner : this.list[index];
			const item = schema ? schema.simplify(value) : value;
			result.push(item);
		});
		return result;
	} else if (this.type === "intersect") {
		const result = {};
		for (const item of this.list) Object.assign(result, item.simplify(value));
		return result;
	} else if (this.type === "union") for (const schema of this.list) try {
		Schema.resolve(value, schema, {});
		return schema.simplify(value);
	} catch {}
	return value;
};
Schema.prototype.toString = function toString(inline) {
	return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		role,
		extra
	};
	return schema;
};
for (const key of [
	"default",
	"link",
	"comment",
	"description",
	"max",
	"min",
	"step"
]) Object.assign(Schema.prototype, { [key](value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
Schema.prototype.volatile = function volatile() {
	if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
	return this.extra("volatile", true);
};
const resolvers = {};
const checkedVolatile = Symbol("checked-volatile-schema");
function validateVolatileSchema(schema, path = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
	const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
	if (states.has(blocked)) return;
	states.add(blocked);
	seen.set(schema, states);
	if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path });
	const nested = blocked || !!schema.meta?.volatile;
	if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path, key], nested, seen);
	if (schema.sKey) validateVolatileSchema(schema.sKey, [...path, "<key>"], true, seen);
	if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path, "*"], true, seen);
	if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
}
Schema.extend = function extend(type, resolve) {
	resolvers[type] = resolve;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
	if (!schema) return [data];
	if (!options[checkedVolatile]) {
		validateVolatileSchema(schema, options.path);
		options = {
			...options,
			[checkedVolatile]: true
		};
	}
	if (schema.meta?.volatile) {
		const inner = Schema(schema);
		inner.meta = {
			...schema.meta,
			volatile: false
		};
		const [value, adapted] = Schema.resolve(data, inner, options, strict);
		try {
			return [createVolatile(value), adapted];
		} catch (error) {
			throw new ValidationError(error instanceof Error ? error.message : String(error), options);
		}
	}
	if (options.ignore?.(data, schema)) return [data];
	if (isNullable(data) && schema.type !== "lazy") {
		if (schema.meta.required) throw new ValidationError(`missing required value`, options);
		let current = schema;
		let fallback = schema.meta.default;
		while (current?.type === "intersect" && isNullable(fallback)) {
			current = current.list[0];
			fallback = current?.meta.default;
		}
		if (isNullable(fallback)) return [data];
		data = clone(fallback);
	}
	const callback = resolvers[schema.type];
	if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
	try {
		return callback(data, schema, options, strict);
	} catch (error) {
		if (!schema.meta.loose) throw error;
		return [schema.meta.default];
	}
};
Schema.from = function from(source) {
	if (isNullable(source)) return Schema.any();
	else if ([
		"string",
		"number",
		"boolean"
	].includes(typeof source)) return Schema.const(source).required();
	else if (source[kSchema]) return source;
	else if (typeof source === "function") switch (source) {
		case String: return Schema.string().required();
		case Number: return Schema.number().required();
		case Boolean: return Schema.boolean().required();
		case Function: return Schema.function().required();
		default: return Schema.is(source).required();
	}
	else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
	const toJSON = () => {
		if (!schema.inner[kSchema]) {
			schema.inner = schema.builder();
			schema.inner.meta = {
				...schema.meta,
				...schema.inner.meta
			};
		}
		return schema.inner.toJSON();
	};
	const schema = new Schema({
		type: "lazy",
		builder,
		inner: { toJSON }
	});
	return schema;
};
Schema.natural = function natural() {
	return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
	return Schema.number().step(.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
	return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
		const date = new Date(value);
		if (isNaN(+date)) throw new ValidationError(`invalid date "${value}"`, options);
		return date;
	}, true)]);
};
Schema.regExp = function regExp(flag = "") {
	return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
		try {
			return new RegExp(value, flag);
		} catch (e) {
			throw new ValidationError(e.message, options);
		}
	}, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
	return Schema.union([
		Schema.is(ArrayBuffer),
		Schema.is(SharedArrayBuffer),
		Schema.transform(Schema.any(), (value, options) => {
			if (Binary.isSource(value)) return Binary.fromSource(value);
			throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
		}, true),
		...encoding ? [Schema.transform(Schema.string(), (value, options) => {
			try {
				return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
			} catch (e) {
				throw new ValidationError(e.message, options);
			}
		}, true)] : []
	]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
	if (!schema.inner[kSchema]) {
		schema.inner = schema.builder();
		schema.inner.meta = {
			...schema.meta,
			...schema.inner.meta
		};
		validateVolatileSchema(schema.inner, options.path, true);
	}
	return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
	return [data];
});
Schema.extend("never", (data, _, options) => {
	throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
	if (deepEqual(data, value)) return [value];
	throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
	const { max = Infinity, min = -Infinity } = meta;
	if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
	if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
	if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
	if (meta.pattern) {
		const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
		if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
	}
	checkWithinRange(data.length, meta, "string length", options);
	return [data];
});
function decimalShift(data, digits) {
	const str = data.toString();
	if (str.includes("e")) return data * Math.pow(10, digits);
	const index = str.indexOf(".");
	if (index === -1) return data * Math.pow(10, digits);
	const frac = str.slice(index + 1);
	const integer = str.slice(0, index);
	if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
	return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
	step = Math.abs(step);
	if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
	const index = step.toString().indexOf(".");
	const digits = step.toString().slice(index + 1).length;
	return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
	if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
	checkWithinRange(data, meta, "number", options);
	const { step } = meta;
	if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
	return [data];
});
Schema.extend("boolean", (data, _, options) => {
	if (typeof data === "boolean") return [data];
	throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
	let value = 0, keys = [];
	if (typeof data === "number") {
		value = data;
		for (const key in bits) if (data & bits[key]) keys.push(key);
	} else if (Array.isArray(data)) {
		keys = data;
		for (const key of keys) {
			if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
			if (key in bits) value |= bits[key];
		}
	} else throw new ValidationError(`expected number or array but got ${data}`, options);
	if (value === meta.default) return [value];
	return [value, keys];
});
Schema.extend("function", (data, _, options) => {
	if (typeof data === "function") return [data];
	throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
	if (typeof constructor === "function") {
		if (data instanceof constructor) return [data];
		throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
	} else {
		if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
		let prototype = Object.getPrototypeOf(data);
		while (prototype) {
			if (prototype.constructor?.name === constructor) return [data];
			prototype = Object.getPrototypeOf(prototype);
		}
		throw new ValidationError(`expected ${constructor} but got ${data}`, options);
	}
});
function property(data, key, schema, options) {
	try {
		const [value, adapted] = Schema.resolve(data[key], schema, {
			...options,
			path: [...options.path || [], key]
		});
		if (adapted !== void 0) data[key] = adapted;
		return value;
	} catch (e) {
		if (!options?.autofix) throw e;
		delete data[key];
		return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
	}
}
Schema.extend("array", (data, { inner, meta }, options) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
	return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in data) {
		let rKey;
		try {
			rKey = Schema.resolve(key, sKey, options)[0];
		} catch (error) {
			if (strict) continue;
			throw error;
		}
		result[rKey] = property(data, key, inner, options);
		data[rKey] = data[key];
		if (key !== rKey) delete data[key];
	}
	return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	const result = list.map((inner, index) => property(data, index, inner, options));
	if (strict) return [result];
	result.push(...data.slice(list.length));
	return [result];
});
function merge(result, data) {
	for (const key in data) {
		if (key in result) continue;
		result[key] = data[key];
	}
}
Schema.extend("object", (data, { dict }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in dict) {
		const value = property(data, key, dict[key], options);
		if (!isNullable(value) || key in data) result[key] = value;
	}
	if (!strict) merge(result, data);
	return [result];
});
Schema.extend("union", (data, { list, toString }, options, strict) => {
	const messages = [];
	for (const inner of list) try {
		return Schema.resolve(data, inner, options, strict);
	} catch (error) {
		messages.push(error);
	}
	throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString }, options, strict) => {
	if (!list.length) return [data];
	let result;
	for (const inner of list) {
		const value = Schema.resolve(data, inner, options, true)[0];
		if (isNullable(value)) continue;
		if (isNullable(result)) result = value;
		else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
		else if (typeof value === "object") merge(result ??= {}, value);
		else if (result !== value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
	}
	if (!strict && isPlainObject(data)) merge(result, data);
	return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
	const [result, adapted = data] = Schema.resolve(data, inner, options, true);
	if (preserve) return [callback(result)];
	else return [callback(result), callback(adapted)];
});
const formatters = {};
function defineMethod(name, keys, format) {
	formatters[name] = format;
	Object.assign(Schema, { [name](...args) {
		const schema = new Schema({ type: name });
		keys.forEach((key, index) => {
			switch (key) {
				case "sKey":
					schema.sKey = args[index] ?? Schema.string();
					break;
				case "inner":
					schema.inner = Schema.from(args[index]);
					break;
				case "list":
					schema.list = args[index].map(Schema.from);
					break;
				case "dict":
					schema.dict = mapValues(args[index], Schema.from);
					break;
				case "bits":
					schema.bits = {};
					for (const key in args[index]) {
						if (typeof args[index][key] !== "number") continue;
						schema.bits[key] = args[index][key];
					}
					break;
				case "callback": {
					const callback = schema.callback = args[index];
					callback["toJSON"] ||= () => callback.toString();
					break;
				}
				case "constructor": {
					const constructor = schema.constructor = args[index];
					if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
					break;
				}
				default: schema[key] = args[index];
			}
		});
		if (name === "object" || name === "dict") schema.meta.default = {};
		else if (name === "array" || name === "tuple") schema.meta.default = [];
		else if (name === "bitset") schema.meta.default = 0;
		return schema;
	} });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
	if (typeof constructor === "function") return constructor.name;
	else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
	if (Object.keys(dict).length === 0) return "{}";
	return `{ ${Object.entries(dict).map(([key, inner]) => {
		return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
	}).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
	const result = list.map(({ toString: format }) => format()).join(" | ");
	return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
	return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
	"inner",
	"callback",
	"preserve"
], ({ inner }, isInner) => inner.toString(isInner));
//#endregion
//#region packages/kit/src/plugin-settings.ts
/**
* One stored configuration snapshot. Fields carry defaults so a section
* hand-written without them still resolves; `createdAt` is the sentinel for
* "never written", because the defaults materialize this object either way.
*/
const configSnapshot = Schema.object({
	kind: Schema.string().default(SNAPSHOT_KIND),
	version: Schema.number().default(1),
	createdAt: Schema.string().default(""),
	pluginVersion: Schema.string().default(""),
	sourceProfile: Schema.string().default("unknown"),
	sections: Schema.dict(Schema.any()).default({})
});
const openCodeSessionModels = Schema.dict(Schema.boolean()).default({});
const openCodeSessionProvider = Schema.object({ models: openCodeSessionModels }).default({ models: {} });
const openCodeSessionProviders = Schema.dict(openCodeSessionProvider).default({});
/**
* Defaults shared by the `format` section schema and the stored namespace
* shape, so the three literal copies stay in sync by construction.
*/
const OPENCODE_SESSION_FORMAT_DEFAULTS = {
	mode: "ses-derive",
	time: "firstUse",
	template: "",
	expression: "",
	script: "",
	validate: "",
	onInvalid: "warn"
};
const openCodeSessionFormat = Schema.object({
	mode: Schema.string().default("ses-derive"),
	time: Schema.string().default("firstUse"),
	template: Schema.string().default(""),
	expression: Schema.string().default(""),
	script: Schema.string().default(""),
	validate: Schema.string().default(""),
	onInvalid: Schema.string().default("warn")
}).default({ ...OPENCODE_SESSION_FORMAT_DEFAULTS });
/**
* Defaults shared by the `userAgent` section schema and the stored namespace
* shape (mirrors the `format` section above).
*/
const OPENCODE_SESSION_USER_AGENT_DEFAULTS = {
	value: "",
	providers: {}
};
const openCodeSessionUserAgent = Schema.object({
	value: Schema.string().default(""),
	providers: Schema.dict(Schema.object({
		enabled: Schema.boolean().default(false),
		value: Schema.string().default(""),
		models: openCodeSessionModels
	}).default({
		enabled: false,
		value: "",
		models: {}
	})).default({})
}).default({ ...OPENCODE_SESSION_USER_AGENT_DEFAULTS });
/**
* The resolved `opencodeSession` section, described once for both the section
* default and the namespace default below.
*/
const OPENCODE_SESSION_DEFAULTS = {
	providers: {},
	format: { ...OPENCODE_SESSION_FORMAT_DEFAULTS },
	userAgent: { ...OPENCODE_SESSION_USER_AGENT_DEFAULTS }
};
/** The `opencodeSession` section, shared by both schema roots. */
const openCodeSession = Schema.object({
	providers: openCodeSessionProviders,
	format: openCodeSessionFormat,
	userAgent: openCodeSessionUserAgent
}).default({ ...OPENCODE_SESSION_DEFAULTS });
/**
* One per-model compaction override. Both fields are optional and default to
* absent so a row can carry only the ratio the user actually edited — a written
* default would pin the global value into the override and make a later global
* change invisible to that model.
*/
const compactionModelPolicy = Schema.object({
	thresholdRatio: Schema.number(),
	retainRatio: Schema.number()
});
/**
* The plugin's own compaction policy section.
*
* `models` is a two-level dict rather than an array of `{ provider, model }`
* records because the panel already addresses a model by that exact pair (the
* same shape `modelOverrides` uses), and a dict cannot express a duplicate
* target — the official backend rejects duplicates at load, so the storage
* shape removes the failure instead of validating it.
*/
const compactionPolicy = Schema.object({
	thresholdRatio: Schema.number().default(DEFAULT_THRESHOLD_RATIO),
	retainRatio: Schema.number().default(DEFAULT_RETAIN_RATIO),
	models: Schema.dict(Schema.dict(compactionModelPolicy)).default({})
}).default({
	thresholdRatio: DEFAULT_THRESHOLD_RATIO,
	retainRatio: DEFAULT_RETAIN_RATIO,
	models: {}
});
/**
* The subagent default route.
*
* Empty strings mean "unset", which is what keeps the current inheritance
* behavior: a child that inherits its parent's route is the shipped default, and
* the plugin must not pin a route the user never chose. The two fields are
* written together — a provider without a model names no route — so the panel
* clears both in one op batch.
*/
const subagentModel = Schema.object({
	provider: Schema.string().default(""),
	model: Schema.string().default("")
}).default({
	provider: "",
	model: ""
});
/**
* One legacy leaf offered for migration. Declared here because the entry-config
* model derives the plugin's settings form from this schema, and a field the
* schema does not declare is neither publishable nor writable — the host would
* refuse a write to it for the whole batch.
*/
const legacyCandidate = Schema.object({
	path: Schema.array(Schema.string()).default([]),
	value: Schema.union([
		Schema.string(),
		Schema.boolean(),
		Schema.number()
	]).default(""),
	source: Schema.string().default("")
});
/**
* The migration control object. The Host owns every field; the Client writes
* only `decision`.
*/
const legacyMigration = Schema.object({
	pending: Schema.boolean().default(false),
	candidates: Schema.array(legacyCandidate).default([]),
	signature: Schema.string().default(""),
	dismissedSignature: Schema.string().default(""),
	/** `''` | `'migrate'` | `'dismiss'` | `'scan'`. */
	decision: Schema.string().default(""),
	/** `''` | `'applied'` | `'dismissed'` | `'failed:<reason>'`. */
	lastResult: Schema.string().default(""),
	scannedAt: Schema.string().default(""),
	decidedAt: Schema.string().default("")
}).default({
	pending: false,
	candidates: [],
	signature: "",
	dismissedSignature: "",
	decision: "",
	lastResult: "",
	scannedAt: "",
	decidedAt: ""
});
/**
* The fields both schema roots expose: the namespace the older releases
* register, and the Loader entry schema `Config` below. They are declared once
* so a field can never reach one root without the other.
*
* `subagentEffort` belongs here rather than in a section of its own because
* the 0.1.7 entry-config model derives one form per Loader entry, so the
* plugin owns exactly one section and every plugin setting lives in it.
*/
const PLUGIN_SETTINGS_FIELDS = {
	opencodeSession: openCodeSession,
	subagentEffort: Schema.string().default(""),
	autoFillDefaults: Schema.boolean().default(true),
	/**
	* The subagent default provider/model pair the plugin selects before a child's
	* first step. Empty means inherit the parent route, which is the shipped
	* behavior and the reason both fields default to an empty string rather than
	* being required.
	*/
	subagentModel,
	/**
	* The plugin's own context-compaction policy. It is deliberately NOT a
	* `compaction-basic` config write: that backend is a Loader row inside each
	* preset's isolate realm, so the plugin owns its own percentages here and
	* applies them through the official `compactRegion()` seam.
	*/
	compaction: compactionPolicy,
	legacyMigration,
	profiles: Schema.dict(configSnapshot).default({}),
	autoBackup: configSnapshot
};
/**
* The value an absent namespace resolves to. Both roots share it because
* schemastery deep-clones a fallback before normalizing it, so a resolution
* through one root is invisible to the other.
*
* It only supplies an empty `autoBackup`; a section that was written but never
* had a backup taken still resolves one from `configSnapshot`'s own defaults.
*/
const PLUGIN_SETTINGS_DEFAULTS = {
	opencodeSession: { ...OPENCODE_SESSION_DEFAULTS },
	subagentEffort: "",
	autoFillDefaults: true,
	subagentModel: {
		provider: "",
		model: ""
	},
	compaction: {
		thresholdRatio: DEFAULT_THRESHOLD_RATIO,
		retainRatio: DEFAULT_RETAIN_RATIO,
		models: {}
	},
	legacyMigration: {
		pending: false,
		candidates: [],
		signature: "",
		dismissedSignature: "",
		decision: "",
		lastResult: "",
		scannedAt: "",
		decidedAt: ""
	},
	profiles: {},
	autoBackup: {
		kind: SNAPSHOT_KIND,
		version: 1,
		createdAt: "",
		pluginVersion: "",
		sourceProfile: "unknown",
		sections: {}
	}
};
Schema.object(PLUGIN_SETTINGS_FIELDS).default({ ...PLUGIN_SETTINGS_DEFAULTS });
Schema.object(PLUGIN_SETTINGS_FIELDS).default({ ...PLUGIN_SETTINGS_DEFAULTS }).volatile();
//#endregion
//#region packages/settings-ui/src/locales/en.json
var en_default = {
	title: "Third-party model reasoning effort",
	description: "Select an effort and enter the exact value sent to the gateway. For example, set high to ultra to send ultra when High is selected in Composer. Models without a declaration use the default options (Off / High / Max).",
	subagentTitle: "Subagent reasoning effort",
	currentDefault: "Current default: {effort}",
	unconfiguredSubagent: "Not configured (subagents inherit the parent session's effort)",
	providerDefault: "Inherit from parent session",
	apply: "Apply",
	presetOfficial: "Apply to all: Off / High / Max (official DeepSeek style)",
	presetGeneric: "Apply to all: Off / Low / Medium / High (generic)",
	searchPlaceholder: "Search models by name or ID…",
	loading: "Loading…",
	noModels: "No hand-declared pi-ai models",
	noMatches: "No matching models",
	noDeclared: "Not declared",
	route: "Route: {route}",
	customize: "Customize effort",
	collapse: "Collapse",
	editorTitle: "Edit effort (select a level, enter its wire value, then apply)",
	applyLevel: "Apply effort",
	restoreDefault: "Restore defaults",
	expandedCount: "{count} models expanded",
	versionLabel: "Plugin version",
	languageLabel: "Page language",
	languageChinese: "中文",
	languageEnglish: "English",
	languageJapanese: "日本語",
	languageKorean: "한국어",
	customPlaceholder: "Custom effort, e.g. ultra",
	offPlaceholder: "Empty = do not send",
	wirePlaceholder: "Custom wire value, e.g. ultra",
	noNamespace: "llm-pi-ai settings were not found (no third-party model configuration).",
	customEffortRequired: "Enter a custom reasoning effort",
	levelNeedsValue: "Effort {level} needs a wire value",
	atLeastThinking: "Select at least one reasoning effort",
	readSettingsFailed: "Failed to read settings: {message}",
	writeFailed: "Write failed. Please try again.",
	writeError: "Write failed: {message}",
	levelOff: "off",
	levelMinimal: "minimal",
	levelLow: "low",
	levelMedium: "medium",
	levelHigh: "high",
	levelXhigh: "xhigh",
	levelMax: "max",
	levelSuffix: " effort",
	pageTitle: "Model capabilities and effort",
	subagentCardTitle: "Subagent default effort",
	autoFillDefaultsTitle: "Automatically fill default efforts",
	autoFillDefaultsDescription: "On startup and model settings changes, add Off / High / Max to models without reasoning efforts. Disabling keeps existing values.",
	inputCapabilityMinimum: "Enable at least one input capability",
	contextInteger: "Context length must be an integer or a k value meaning ×1024 (e.g. 64k = 65536), range 2000-1000000",
	contextRange: "Context length must be between 2000 and 1000000",
	saveMissingNamespace: "Saved, but the latest settings were not returned",
	settingsUpdated: "Settings updated",
	modelSettingsSaved: "Model settings saved",
	restoreReasoning: "Default reasoning effort restored",
	restoreCapability: "Default capabilities restored",
	officialPreset: "official preset",
	genericPreset: "generic preset",
	subagentSaved: "Subagent default effort saved",
	quickSettings: "Quick settings",
	vendor: "Provider",
	modelCount: "{count} models",
	searchResults: "Search results",
	model: "Model",
	unsaved: "Unsaved",
	textEnabled: "Text input: enabled",
	textDisabled: "Text input: disabled",
	imageEnabled: "Image input: enabled",
	imageDisabled: "Image input: disabled",
	openModelSettings: "Open model settings",
	closeModelSettings: "Collapse model settings",
	contextLength: "Context length",
	oneMillionMode: "1M mode",
	inputCapabilities: "Input capabilities",
	textInput: "Text input",
	imageInput: "Image input",
	reasoningLevels: "Reasoning effort",
	saveChanges: "Save changes",
	saved: "Saved",
	saveModelChanges: "Save model changes",
	noPendingChanges: "No pending changes",
	expandedSettings: "{count} models expanded",
	collapseProvider: "Collapse provider",
	expandProvider: "Expand provider",
	providerDefaultShort: "Provider default",
	contextTitle: "Context {value}",
	contextLabel: "Context {label}",
	gatewayMoreFields: "More fields ({count})",
	gatewayExpandedLess: "Fewer fields",
	gatewayGroupRole: "Role",
	gatewayGroupFormat: "Format",
	gatewayGroupStream: "Streaming",
	gatewayGroupCache: "Cache",
	gatewayCompatTitle: "Gateway compatibility",
	supportsDeveloperRole: "Developer role",
	maxTokensField: "Max tokens field",
	supportsStore: "Store",
	supportsReasoningEffort: "Reasoning effort",
	supportsUsageInStreaming: "Usage in streaming",
	supportsFinishReason: "Finish reason",
	requiresToolResultName: "Tool result name",
	requiresAssistantAfterToolResult: "Assistant after tool result",
	requiresThinkingAsText: "Thinking as text",
	requiresReasoningContentOnAssistantMessages: "Reasoning content on assistant messages",
	supportsThinkingTokenBudget: "Thinking token budget",
	thinkingTokenBudgetField: "Thinking budget field",
	supportsMaxOutputTokens: "Supports max output tokens",
	supportsStrictMode: "Strict mode",
	supportsLongCacheRetention: "Long cache retention",
	thinkingFormat: "Thinking format",
	cacheControlFormat: "Cache control format",
	cacheControlFormatAnthropic: "anthropic",
	gatewayCompatAuto: "Auto",
	gatewayCompatSupported: "Supported",
	gatewayCompatUnsupported: "Unsupported",
	maxTokensFieldStandard: "max_tokens",
	maxTokensFieldCompletion: "max_completion_tokens",
	vllmPriority: "vLLM priority",
	thinkingTokenBudgetFieldTokenBudget: "thinking_token_budget",
	thinkingTokenBudgetFieldBudget: "thinking_budget",
	thinkingTokenBudgetFieldBudgetTokens: "thinking_budget_tokens",
	gatewayCompatUnavailable: "Unavailable",
	saveGatewayCompat: "Save gateway compatibility",
	gatewayCompatSaved: "Gateway compatibility saved",
	gatewayCompatSaveFailed: "Failed to save gateway compatibility",
	modelGatewayCompatTitle: "Model gateway compatibility",
	compatSourceModel: "Model override",
	compatSourceBase: "Base configuration",
	compatSourceProvider: "Provider",
	compatSourceCatalog: "Model catalog",
	compatSourceProtocol: "Protocol default",
	compatSourceUnknown: "Unknown source",
	inheritProviderCompat: "Auto inherits provider compatibility",
	saveModelGatewayCompat: "Save model compatibility",
	modelGatewayCompatSaved: "Model gateway compatibility saved",
	seatModelLoading: "Loading model…",
	seatNoModel: "No model selected",
	seatNoEfforts: "This model provides no reasoning effort levels",
	seatError: "Model directory failed to load: {message}",
	seatFollowDefault: "Follow model default",
	seatSliderLabel: "Reasoning effort",
	seatReasoningLabel: "Reasoning level",
	seatModelLabel: "Model",
	providerAccount: "DeepSeek Account",
	seatSearchModels: "Search models",
	seatNoModelResults: "No matching models",
	seatErrorAction: "Model operation failed: {message}",
	modelsArrayCompatSaveNote: "Saving changes updates only this model; other models are not affected.",
	opencodeSessionHeader: "OpenCode session Header",
	opencodeSessionHeaderTitle: "OpenCode session Header",
	opencodeSessionHeaderDescription: "For OpenCode, OpenCode Go, or a forwarding proxy, send a session value derived from the current DSH session as x-opencode-session for this model; the default generator matches the upstream format and is configurable under opencodeSession.format.",
	opencodeSessionSaved: "OpenCode session Header saved",
	opencodeSessionSaveFailed: "Failed to save OpenCode session Header: {message}",
	backupCardTitle: "Backup and profiles",
	backupCollapsedHint: "{count} profiles",
	backupCollapsedHintEmpty: "No profiles",
	backupProfilesTitle: "Profile library",
	backupProfilesEmpty: "No saved profiles yet",
	backupProfileNamePlaceholder: "Profile name, e.g. \"work\"",
	backupSaveCurrent: "Save current config",
	backupApply: "Apply",
	backupExportProfile: "Export",
	backupDeleteProfile: "Delete",
	backupDeleteConfirm: "Confirm delete",
	backupCancel: "Cancel",
	backupExportCurrent: "Export current config",
	backupExportHint: "The export can contain plaintext such as provider headers. Keep the file safe.",
	backupImportTitle: "Import config",
	backupImportChoose: "Choose file…",
	backupPreviewTitle: "Import preview",
	backupModeMerge: "Merge (keep what the file omits)",
	backupModeReplace: "Replace (the file wins)",
	backupSummary: "{added} added · {overwritten} overwritten · {removed} removed",
	backupSummaryEmpty: "Already matches this configuration; nothing to write",
	backupSummaryLibraryOnly: "The file carries only the profile library and the pre-import backup; neither is imported, so there is nothing to write",
	backupIgnored: "Ignored {count} unsupported entries",
	backupWiringSkipped: "Skipped {count} endpoint/credential setting(s); a snapshot only carries capability configuration",
	backupWiringInclude: "Also import endpoints and credentials (advanced)",
	formatCardTitle: "Session value generator",
	formatCardHint: "Current: {mode}",
	formatModeLabel: "Generator mode",
	formatModeSesDerive: "Derived ses_ value (default)",
	formatModePassthrough: "Send the DSH session id as-is",
	formatModeTemplate: "Template",
	formatModeExpression: "Expression",
	formatModeScript: "External script",
	formatTimeLabel: "Timestamp source",
	formatTimeFirstUse: "Minted on first use (fixed per session)",
	formatTimeHash: "Derived from the session digest (identical across machines)",
	formatApply: "Apply",
	formatSaved: "Generator settings saved",
	formatSaveFailed: "Saving generator settings failed: {message}",
	formatConflict: "Settings changed elsewhere; apply again.",
	formatOnInvalidLabel: "When validation fails",
	formatUnsupportedStored: "The stored value is not supported; resolved to: {detail}",
	formatTemplateLabel: "Template string",
	formatTemplateHint: "Placeholders: {hex12} {tail62} {sessionId} {rawSessionId} {sha256} {now} {provider} {model}",
	formatExpressionLabel: "Expression",
	formatExpressionHint: "Same identifiers as the template, plus sha256 / slice / lower / upper",
	formatScriptLabel: "Absolute script path",
	formatScriptHint: "Exports a format(context) function; reloaded within a second of changing",
	formatValidateLabel: "Validation regex",
	formatValidateHint: "Empty means no validation; the built-in shape is ^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$",
	formatOnInvalidWarn: "Log it and still send",
	formatOnInvalidDrop: "Omit the Header",
	formatOnInvalidSend: "Send silently",
	formatErrValidateRegex: "Not a valid regular expression; the Host would fall back to no validation at all",
	formatErrTemplateRequired: "Template mode needs a template, or the Host falls back to the derived value",
	formatErrExpressionRequired: "Expression mode needs an expression, or the Host falls back to the derived value",
	formatErrExpressionSyntax: "The expression cannot be parsed; the Host would fall back to the derived value",
	formatErrExpressionUnknownName: "The expression references a name that does not exist; the Host would silently fall back to the derived value",
	formatErrScriptRequired: "Script mode needs a path, or the Host falls back to the derived value",
	formatErrScriptNotAbsolute: "Must be an absolute path (the Host resolves relative paths against its own working directory)",
	backupWiringWarning: "This import rewrites endpoint and credential settings",
	backupSourceFile: "From file",
	backupSourceProfile: "From profile \"{name}\"",
	backupSourceAutoBackup: "From the pre-import backup",
	backupConfirmImport: "Confirm import",
	backupApplied: "Configuration applied",
	backupAppliedPartial: "Partially applied: {detail}",
	backupSkipped: "No changes; nothing was written",
	backupRestartRequired: "Restart DSH to take effect: {namespaces}",
	backupAutoBackupFailed: "Could not write the pre-import backup: {message}",
	backupSavedProfile: "Saved profile \"{name}\"",
	backupSaveProfileFailed: "Could not save the profile: {message}",
	backupDeleteProfileFailed: "Could not delete the profile: {message}",
	backupImportFailed: "Import failed: {message}",
	backupReadFailed: "Could not read the file: {message}",
	backupProfileLimit: "At most {max} profiles; delete one first",
	backupNameRequired: "Enter a profile name",
	backupNameTooLong: "Profile names are limited to {max} characters",
	backupNameReserved: "That profile name is reserved",
	backupNameInvalid: "Profile names cannot contain control characters",
	backupNameTaken: "A profile with that name already exists",
	backupReadOnly: "The active settings source is read-only",
	backupAutoBackupTitle: "Pre-import backup",
	backupAutoBackupNone: "No automatic backup yet",
	backupAutoBackupRestore: "Restore the pre-import config",
	backupConflict: "The configuration changed in another window; review and retry",
	backupParseInvalidJson: "The file is not valid JSON",
	backupParseNotObject: "The file does not contain a configuration object",
	backupParseKindMismatch: "This file was not exported by this plugin",
	backupParseVersion: "Snapshot version {version} is not supported (supported: {supported})",
	backupParseSections: "The file is missing its sections",
	backupParseSection: "The {ns} section of the file is malformed",
	backupParseReserved: "The file contains an unsafe field name \"{key}\"",
	backupParseTooLarge: "The file is too large; the limit is {maxBytes} bytes",
	legacyMigrationTitle: "Legacy settings data found",
	legacyMigrationBody: "DSH 0.1.7 changed how settings are stored, so these {count} legacy settings could not be imported automatically. Write them into the new settings?",
	legacyMigrationFieldEffort: "Subagent default thinking effort",
	legacyMigrationSourceLive: "legacy llm-pi-ai settings",
	legacyMigrationSourceDocument: "settings.yaml",
	legacyMigrationSourceImported: "settings.yaml.imported",
	legacyMigrationApply: "Migrate",
	legacyMigrationDismiss: "Don't ask again",
	legacyMigrationLater: "Later",
	legacyMigrationApplied: "Legacy settings migrated.",
	legacyMigrationDismissed: "Ignored. You will be asked again if the legacy data changes.",
	legacyMigrationFailed: "Migration failed: {reason}",
	legacyMigrationTimedOut: "The host did not confirm the result in time. Please try again.",
	legacyMigrationRescan: "Rescan legacy data",
	legacyMigrationRescanHint: "Manually check the legacy settings documents for items that were not migrated yet.",
	legacyMigrationNothingPending: "No legacy data is pending migration.",
	compactionSectionTitle: "Context compaction",
	compactionThreshold: "Compaction threshold",
	compactionThresholdHint: "The plugin compacts early once context use reaches this percentage of the window; empty follows the global setting.",
	compactionRetain: "Retain recent context",
	compactionRetainHint: "After the plugin compacts, this percentage of recent messages stays verbatim; empty follows the global setting.",
	compactionAutoSave: "Saves automatically as you type",
	compactionFollowGlobal: "Follow global {percent}%",
	compactionInvalidThreshold: "The compaction threshold must be between 10% and 95%",
	compactionInvalidRetain: "The retention ratio must be greater than 0",
	compactionRetainNotBelow: "The retention ratio must stay below the compaction threshold",
	compactionSaved: "Compaction settings saved",
	subagentModelTitle: "Subagent default model",
	subagentModelInherit: "Inherit the parent session",
	subagentModelProvider: "Provider",
	subagentModelModel: "Model",
	subagentModelUnavailable: "Saved but not currently available ({route})",
	subagentModelHint: "New subagents switch to this model; choosing “Inherit the parent session” keeps the parent’s model.",
	subagentModelAutoSave: "Saves automatically on selection",
	subagentModelSaved: "Subagent default model saved",
	compactionSectionHint: "Empty fields follow the global ratio; a percentage here affects this model only."
};
//#endregion
//#region packages/settings-ui/src/client/locales.ts
const LOCALE_DATA = {
	zh: {
		title: "第三方模型思考强度档位",
		description: "勾选档位后，右侧输入框可自由定义发送给网关的线上值。例如给 high 填 ultra，Composer 选中 High 时网关会收到 ultra。未设置档位的模型自动采用默认档位（Off / High / Max）。",
		subagentTitle: "子 agent 思考强度（Subagent 默认档位）",
		currentDefault: "当前默认：{effort}",
		unconfiguredSubagent: "未配置（子 agent 继承父会话的档位）",
		providerDefault: "继承父会话档位",
		apply: "应用",
		presetOfficial: "应用到全部：Off / High / Max（官方 DeepSeek 风格）",
		presetGeneric: "应用到全部：Off / Low / Medium / High（通用）",
		searchPlaceholder: "搜索模型（名称或 ID）…",
		loading: "加载中…",
		noModels: "没有手工声明的 pi-ai 模型",
		noMatches: "没有匹配的模型",
		noDeclared: "未声明",
		route: "路由：{route}",
		customize: "自定义档位",
		collapse: "收起",
		editorTitle: "编辑档位（勾选后填写线上值，点击“应用此档位”保存）",
		applyLevel: "应用此档位",
		restoreDefault: "恢复默认档位",
		expandedCount: "已展开 {count} 个模型，可编辑档位",
		versionLabel: "插件版本",
		languageLabel: "页面语言",
		languageChinese: "中文",
		languageEnglish: "English",
		languageJapanese: "日本語",
		languageKorean: "한국어",
		customPlaceholder: "自定义档位，如 ultra",
		offPlaceholder: "留空 = 不发送",
		wirePlaceholder: "自定义线上值，如 ultra",
		noNamespace: "未找到 llm-pi-ai 设置命名空间（无第三方模型配置）。",
		customEffortRequired: "请输入自定义思考档位",
		levelNeedsValue: "档位 {level} 需要填写线上值",
		atLeastThinking: "至少需要一个思考档位",
		readSettingsFailed: "读取设置失败：{message}",
		writeFailed: "写入失败，请重试",
		writeError: "写入失败：{message}",
		levelOff: "off",
		levelMinimal: "minimal",
		levelLow: "low",
		levelMedium: "medium",
		levelHigh: "high",
		levelXhigh: "xhigh",
		levelMax: "max",
		levelSuffix: " 档位",
		pageTitle: "模型能力与档位",
		subagentCardTitle: "子 agent 默认档位",
		autoFillDefaultsTitle: "自动补齐默认档位",
		autoFillDefaultsDescription: "启动及模型设置变更时，为缺少思考档位的模型补充 Off / High / Max；关闭不会删除已有档位。",
		inputCapabilityMinimum: "至少启用一种输入能力",
		contextInteger: "上下文长度须为整数或用 k 表示 1024 倍（如 64k 即 65536），范围 2000-1000000",
		contextRange: "上下文长度必须在 2000 到 1000000 之间",
		saveMissingNamespace: "保存成功但未返回最新设置",
		settingsUpdated: "设置已更新",
		modelSettingsSaved: "模型设置已保存",
		restoreReasoning: "已恢复默认思考档位",
		restoreCapability: "已恢复默认能力",
		officialPreset: "官方预设",
		genericPreset: "通用预设",
		subagentSaved: "子 agent 默认档位已保存",
		quickSettings: "一键设置",
		vendor: "供应商",
		modelCount: "{count} 个模型",
		searchResults: "搜索结果",
		model: "模型",
		unsaved: "未保存",
		textEnabled: "文字输入：已启用",
		textDisabled: "文字输入：未启用",
		imageEnabled: "图像输入：已启用",
		imageDisabled: "图像输入：未启用",
		openModelSettings: "打开模型设置",
		closeModelSettings: "收起模型设置",
		contextLength: "上下文长度",
		oneMillionMode: "1M 模式",
		inputCapabilities: "输入能力",
		textInput: "文字输入",
		imageInput: "图像输入",
		reasoningLevels: "思考档位",
		saveChanges: "保存更改",
		saved: "已保存",
		saveModelChanges: "保存模型更改",
		noPendingChanges: "没有待保存的更改",
		expandedSettings: "已展开 {count} 个模型，可编辑设置",
		collapseProvider: "收起供应商",
		expandProvider: "展开供应商",
		providerDefaultShort: "提供方默认",
		contextTitle: "上下文 {value}",
		contextLabel: "上下文 {label}",
		gatewayMoreFields: "还有 {count} 个字段",
		gatewayExpandedLess: "收起字段",
		gatewayGroupRole: "角色",
		gatewayGroupFormat: "格式",
		gatewayGroupStream: "流式传输",
		gatewayGroupCache: "缓存",
		gatewayCompatTitle: "网关兼容性",
		supportsDeveloperRole: "Developer 角色",
		maxTokensField: "最大令牌字段",
		supportsStore: "存储支持",
		supportsReasoningEffort: "推理强度支持",
		supportsUsageInStreaming: "流式用量上报",
		supportsFinishReason: "结束原因",
		requiresToolResultName: "工具结果需含名称",
		requiresAssistantAfterToolResult: "工具结果后需 assistant 消息",
		requiresThinkingAsText: "思考以文本传递",
		requiresReasoningContentOnAssistantMessages: "assistant 消息需 reasoning 内容",
		supportsThinkingTokenBudget: "思考预算支持",
		thinkingTokenBudgetField: "思考预算字段",
		supportsMaxOutputTokens: "支持最大输出 token 数",
		supportsStrictMode: "严格模式",
		supportsLongCacheRetention: "长缓存保留",
		thinkingFormat: "思考格式",
		cacheControlFormat: "缓存控制格式",
		cacheControlFormatAnthropic: "anthropic",
		gatewayCompatAuto: "自动",
		gatewayCompatSupported: "支持",
		gatewayCompatUnsupported: "不支持",
		maxTokensFieldStandard: "max_tokens",
		maxTokensFieldCompletion: "max_completion_tokens",
		vllmPriority: "vLLM 优先级",
		thinkingTokenBudgetFieldTokenBudget: "thinking_token_budget",
		thinkingTokenBudgetFieldBudget: "thinking_budget",
		thinkingTokenBudgetFieldBudgetTokens: "thinking_budget_tokens",
		gatewayCompatUnavailable: "不可用",
		saveGatewayCompat: "保存网关兼容性",
		gatewayCompatSaved: "网关兼容性已保存",
		gatewayCompatSaveFailed: "保存网关兼容性失败",
		modelGatewayCompatTitle: "模型网关兼容性",
		compatSourceModel: "模型覆盖",
		compatSourceBase: "基础配置",
		compatSourceProvider: "提供方",
		compatSourceCatalog: "模型目录",
		compatSourceProtocol: "协议默认值",
		compatSourceUnknown: "来源未知",
		inheritProviderCompat: "自动继承提供方兼容性",
		saveModelGatewayCompat: "保存模型兼容性",
		modelGatewayCompatSaved: "模型网关兼容性已保存",
		seatModelLoading: "加载模型…",
		seatNoModel: "未选择模型",
		seatNoEfforts: "当前模型未提供推理档位",
		seatError: "模型目录加载失败：{message}",
		seatFollowDefault: "跟随模型默认",
		seatSliderLabel: "推理档位",
		seatReasoningLabel: "推理等级",
		seatModelLabel: "模型",
		providerAccount: "DeepSeek 账号",
		seatSearchModels: "搜索模型",
		seatNoModelResults: "没有匹配的模型",
		seatErrorAction: "模型操作失败：{message}",
		modelsArrayCompatSaveNote: "保存后只会修改当前模型的设置，不会影响其他模型。",
		opencodeSessionHeader: "OpenCode 会话 Header",
		opencodeSessionHeaderTitle: "OpenCode 会话 Header",
		opencodeSessionHeaderDescription: "为 OpenCode、OpenCode Go 或会继续转发该 Header 的中转服务，为当前模型生成与 DSH 会话绑定的派生会话值（x-opencode-session）；默认生成器符合上游格式，可在设置文档的 opencodeSession.format 中调整。",
		opencodeSessionSaved: "OpenCode 会话 Header 已保存",
		opencodeSessionSaveFailed: "OpenCode 会话 Header 保存失败：{message}",
		backupCardTitle: "配置备份与方案",
		backupCollapsedHint: "{count} 份方案",
		backupCollapsedHintEmpty: "未保存方案",
		backupProfilesTitle: "方案库",
		backupProfilesEmpty: "还没有保存的方案",
		backupProfileNamePlaceholder: "方案名称，例如「工作」",
		backupSaveCurrent: "保存当前配置",
		backupApply: "应用",
		backupExportProfile: "导出",
		backupDeleteProfile: "删除",
		backupDeleteConfirm: "确认删除",
		backupCancel: "取消",
		backupExportCurrent: "导出当前配置",
		backupExportHint: "导出内容可能包含 provider 的 headers 等明文信息，请妥善保管文件。",
		backupImportTitle: "导入配置",
		backupImportChoose: "选择文件…",
		backupPreviewTitle: "导入预览",
		backupModeMerge: "合并（保留文件里没有的配置）",
		backupModeReplace: "替换（完全以文件为准）",
		backupSummary: "新增 {added} · 覆盖 {overwritten} · 删除 {removed}",
		backupSummaryEmpty: "与当前配置一致，无需写入",
		backupSummaryLibraryOnly: "文件中只有方案库和导入前的自动备份，这两项不会被导入，因此没有可写入的内容",
		backupIgnored: "已忽略 {count} 项不支持的配置",
		backupWiringSkipped: "已跳过 {count} 项端点/凭据设置（快照只迁移能力配置）",
		backupWiringInclude: "同时导入端点与凭据（高级）",
		formatCardTitle: "会话值生成器",
		formatCardHint: "当前：{mode}",
		formatModeLabel: "生成模式",
		formatModeSesDerive: "派生 ses_ 值（默认）",
		formatModePassthrough: "原样发送 DSH 会话 ID",
		formatModeTemplate: "模板",
		formatModeExpression: "表达式",
		formatModeScript: "外部脚本",
		formatTimeLabel: "时间戳来源",
		formatTimeFirstUse: "首次使用时铸造（会话内固定）",
		formatTimeHash: "由会话摘要派生（跨机器一致）",
		formatApply: "应用",
		formatSaved: "生成器设置已保存",
		formatSaveFailed: "生成器设置保存失败：{message}",
		formatConflict: "设置已被其他改动更新，请重新应用。",
		formatOnInvalidLabel: "校验失败时",
		formatUnsupportedStored: "已存值不受支持，已回退为：{detail}",
		formatTemplateLabel: "模板字符串",
		formatTemplateHint: "可用占位符：{hex12} {tail62} {sessionId} {rawSessionId} {sha256} {now} {provider} {model}",
		formatExpressionLabel: "表达式",
		formatExpressionHint: "可用标识符同模板占位符，另有函数 sha256 / slice / lower / upper",
		formatScriptLabel: "脚本绝对路径",
		formatScriptHint: "导出一个 format(context) 函数；文件变化后最多 1 秒内重新加载",
		formatValidateLabel: "校验正则",
		formatValidateHint: "留空表示不校验；内建默认形态为 ^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$",
		formatOnInvalidWarn: "记录日志并仍然发送",
		formatOnInvalidDrop: "不发送该 Header",
		formatOnInvalidSend: "静默发送",
		formatErrValidateRegex: "不是合法的正则表达式，宿主会退化为「不校验」",
		formatErrTemplateRequired: "模板模式下模板不能为空，否则宿主会回退为派生值",
		formatErrExpressionRequired: "表达式模式下表达式不能为空，否则宿主会回退为派生值",
		formatErrExpressionSyntax: "表达式无法解析，宿主会回退为派生值",
		formatErrExpressionUnknownName: "表达式引用了不存在的标识符或函数，宿主会静默回退为派生值",
		formatErrScriptRequired: "脚本模式下路径不能为空，否则宿主会回退为派生值",
		formatErrScriptNotAbsolute: "必须是绝对路径（宿主按自己的运行目录解析相对路径）",
		backupWiringWarning: "本次导入会改写端点/凭据设置",
		backupSourceFile: "来自文件",
		backupSourceProfile: "来自方案「{name}」",
		backupSourceAutoBackup: "来自导入前的自动备份",
		backupConfirmImport: "确认导入",
		backupApplied: "配置已应用",
		backupAppliedPartial: "部分应用：{detail}",
		backupSkipped: "配置无变化，未写入",
		backupRestartRequired: "需要重启 DSH 后生效：{namespaces}",
		backupAutoBackupFailed: "写入导入前的自动备份失败：{message}",
		backupSavedProfile: "方案「{name}」已保存",
		backupSaveProfileFailed: "保存方案失败：{message}",
		backupDeleteProfileFailed: "删除方案失败：{message}",
		backupImportFailed: "导入失败：{message}",
		backupReadFailed: "读取文件失败：{message}",
		backupProfileLimit: "最多保存 {max} 份方案，请先删除一份",
		backupNameRequired: "请填写方案名称",
		backupNameTooLong: "方案名称不能超过 {max} 个字符",
		backupNameReserved: "方案名称不能使用保留字",
		backupNameInvalid: "方案名称不能包含控制字符",
		backupNameTaken: "已存在同名方案",
		backupReadOnly: "当前配置源只读，无法写入",
		backupAutoBackupTitle: "导入前的自动备份",
		backupAutoBackupNone: "暂无自动备份",
		backupAutoBackupRestore: "恢复导入前的配置",
		backupConflict: "配置已被其他窗口修改，请确认后重试",
		backupParseInvalidJson: "文件不是合法的 JSON",
		backupParseNotObject: "文件内容不是一个配置对象",
		backupParseKindMismatch: "这不是本插件导出的配置文件",
		backupParseVersion: "配置文件版本 {version} 不受支持（当前支持 {supported}）",
		backupParseSections: "配置文件缺少 sections",
		backupParseSection: "配置文件中的 {ns} 段格式不正确",
		backupParseReserved: "配置包含不安全的字段名「{key}」",
		backupParseTooLarge: "文件过大，上限 {maxBytes} 字节",
		legacyMigrationTitle: "发现旧版本设置数据",
		legacyMigrationBody: "DSH 0.1.7 更换了设置存储方式，以下 {count} 项旧设置未能自动导入。是否把它们写入新设置？",
		legacyMigrationFieldEffort: "子 agent 默认思考强度",
		legacyMigrationSourceLive: "旧 llm-pi-ai 设置",
		legacyMigrationSourceDocument: "settings.yaml",
		legacyMigrationSourceImported: "settings.yaml.imported",
		legacyMigrationApply: "迁移",
		legacyMigrationDismiss: "不再询问",
		legacyMigrationLater: "稍后",
		legacyMigrationApplied: "旧设置已迁移。",
		legacyMigrationDismissed: "已忽略，旧数据变化时会再次提示。",
		legacyMigrationFailed: "迁移失败：{reason}",
		legacyMigrationTimedOut: "宿主没有在预期时间内确认结果，请重试。",
		legacyMigrationRescan: "重新扫描旧数据",
		legacyMigrationRescanHint: "手动检查旧设置文档中尚未迁移的项。",
		legacyMigrationNothingPending: "没有待迁移的旧数据。",
		compactionSectionTitle: "上下文压缩",
		compactionThreshold: "压缩阈值",
		compactionThresholdHint: "上下文用量达到窗口该百分比时，由插件提前压缩；留空沿用全局设置。",
		compactionRetain: "保留最近上下文",
		compactionRetainHint: "插件压缩后按该百分比原样保留最近的消息；留空沿用全局设置。",
		compactionAutoSave: "修改后自动保存",
		compactionFollowGlobal: "跟随全局 {percent}%",
		compactionInvalidThreshold: "压缩阈值需在 10% 到 95% 之间",
		compactionInvalidRetain: "保留比例需大于 0",
		compactionRetainNotBelow: "保留比例必须小于压缩阈值",
		compactionSaved: "压缩设置已保存",
		subagentModelTitle: "子 agent 默认模型",
		subagentModelInherit: "继承父会话",
		subagentModelProvider: "供应商",
		subagentModelModel: "模型",
		subagentModelUnavailable: "已保存但当前不可用（{route}）",
		subagentModelHint: "子 agent 创建时切换到该模型；选择「继承父会话」则沿用父会话的模型。",
		subagentModelAutoSave: "选择后自动保存",
		subagentModelSaved: "子 agent 默认模型已保存",
		compactionSectionHint: "留空则跟随全局比例；填写的百分比只影响该模型。"
	},
	en: en_default,
	ja: {
		title: "サードパーティモデルの推論強度",
		description: "推論強度を選択し、ゲートウェイに送信する値を入力します。たとえば high に ultra を設定すると、Composer で High を選択したときに ultra が送信されます。未設定のモデルには既定の選択肢（Off / High / Max）が使用されます。",
		subagentTitle: "Subagent の推論強度",
		currentDefault: "現在の既定値：{effort}",
		unconfiguredSubagent: "未設定（Subagent は親セッションのレベルを継承）",
		providerDefault: "親セッションのレベルを継承",
		apply: "適用",
		presetOfficial: "すべてに適用：Off / High / Max（公式 DeepSeek 形式）",
		presetGeneric: "すべてに適用：Off / Low / Medium / High（汎用）",
		searchPlaceholder: "モデル名または ID で検索…",
		loading: "読み込み中…",
		noModels: "手動で宣言された pi-ai モデルはありません",
		noMatches: "一致するモデルはありません",
		noDeclared: "未宣言",
		route: "ルート：{route}",
		customize: "推論強度をカスタマイズ",
		collapse: "折りたたむ",
		editorTitle: "推論強度を編集（レベルを選択し、送信値を入力して適用）",
		applyLevel: "推論強度を適用",
		restoreDefault: "既定値に戻す",
		expandedCount: "{count} 個のモデルを展開中",
		versionLabel: "プラグインバージョン",
		languageLabel: "ページの言語",
		languageChinese: "中文",
		languageEnglish: "English",
		languageJapanese: "日本語",
		languageKorean: "한국어",
		customPlaceholder: "カスタム推論強度（例：ultra）",
		offPlaceholder: "空欄 = 送信しない",
		wirePlaceholder: "カスタム送信値（例：ultra）",
		noNamespace: "llm-pi-ai の設定名前空間が見つかりません（サードパーティモデルの設定がありません）。",
		customEffortRequired: "カスタム推論強度を入力してください",
		levelNeedsValue: "推論強度 {level} には送信値が必要です",
		atLeastThinking: "少なくとも 1 つの推論強度を選択してください",
		readSettingsFailed: "設定の読み込みに失敗しました：{message}",
		writeFailed: "書き込みに失敗しました。もう一度お試しください。",
		writeError: "書き込みに失敗しました：{message}",
		levelOff: "off",
		levelMinimal: "minimal",
		levelLow: "low",
		levelMedium: "medium",
		levelHigh: "high",
		levelXhigh: "xhigh",
		levelMax: "max",
		levelSuffix: " の推論強度",
		pageTitle: "モデルの能力と推論強度",
		subagentCardTitle: "Subagent の既定の推論強度",
		autoFillDefaultsTitle: "既定の推論強度を自動補完",
		autoFillDefaultsDescription: "起動時とモデル設定の変更時に、推論強度が未設定のモデルへ Off / High / Max を追加します。無効にしても既存の値は削除されません。",
		inputCapabilityMinimum: "少なくとも 1 つの入力能力を有効にしてください",
		contextInteger: "コンテキスト長は整数、または 1024 倍を表す k（例: 64k = 65536）で入力してください（2000-1000000）",
		contextRange: "コンテキスト長は 2000 から 1000000 の範囲で指定してください",
		saveMissingNamespace: "保存しましたが、最新の設定が返されませんでした",
		settingsUpdated: "設定を更新しました",
		modelSettingsSaved: "モデル設定を保存しました",
		restoreReasoning: "既定の推論強度に戻しました",
		restoreCapability: "既定の能力に戻しました",
		officialPreset: "公式プリセット",
		genericPreset: "汎用プリセット",
		subagentSaved: "Subagent の既定の推論強度を保存しました",
		quickSettings: "クイック設定",
		vendor: "プロバイダー",
		modelCount: "{count} 個のモデル",
		searchResults: "検索結果",
		model: "モデル",
		unsaved: "未保存",
		textEnabled: "テキスト入力：有効",
		textDisabled: "テキスト入力：無効",
		imageEnabled: "画像入力：有効",
		imageDisabled: "画像入力：無効",
		openModelSettings: "モデル設定を開く",
		closeModelSettings: "モデル設定を折りたたむ",
		contextLength: "コンテキスト長",
		oneMillionMode: "1M モード",
		inputCapabilities: "入力能力",
		textInput: "テキスト入力",
		imageInput: "画像入力",
		reasoningLevels: "推論強度",
		saveChanges: "変更を保存",
		saved: "保存済み",
		saveModelChanges: "モデルの変更を保存",
		noPendingChanges: "保存する変更はありません",
		expandedSettings: "{count} 個のモデル設定を展開中",
		collapseProvider: "プロバイダーを折りたたむ",
		expandProvider: "プロバイダーを展開",
		providerDefaultShort: "プロバイダーの既定値",
		contextTitle: "コンテキスト {value}",
		contextLabel: "コンテキスト {label}",
		gatewayMoreFields: "その他のフィールド（{count}）",
		gatewayExpandedLess: "フィールドを折りたたむ",
		gatewayGroupRole: "ロール",
		gatewayGroupFormat: "形式",
		gatewayGroupStream: "ストリーミング",
		gatewayGroupCache: "キャッシュ",
		gatewayCompatTitle: "ゲートウェイ互換性",
		supportsDeveloperRole: "Developer ロール",
		maxTokensField: "最大トークン項目",
		supportsStore: "ストレージ対応",
		supportsReasoningEffort: "推論強度対応",
		supportsUsageInStreaming: "ストリーミング中の使用量",
		supportsFinishReason: "終了理由",
		requiresToolResultName: "ツール結果名",
		requiresAssistantAfterToolResult: "ツール結果の後に Assistant",
		requiresThinkingAsText: "思考をテキストとして送信",
		requiresReasoningContentOnAssistantMessages: "Assistant メッセージに推論内容",
		supportsThinkingTokenBudget: "思考トークン予算対応",
		thinkingTokenBudgetField: "思考予算フィールド",
		supportsMaxOutputTokens: "最大出力トークン数に対応",
		supportsStrictMode: "Strict モード",
		supportsLongCacheRetention: "長期キャッシュ保持",
		thinkingFormat: "思考フォーマット",
		cacheControlFormat: "キャッシュ制御形式",
		cacheControlFormatAnthropic: "anthropic",
		gatewayCompatAuto: "自動",
		gatewayCompatSupported: "対応",
		gatewayCompatUnsupported: "非対応",
		maxTokensFieldStandard: "max_tokens",
		maxTokensFieldCompletion: "max_completion_tokens",
		vllmPriority: "vLLM 優先度",
		thinkingTokenBudgetFieldTokenBudget: "thinking_token_budget",
		thinkingTokenBudgetFieldBudget: "thinking_budget",
		thinkingTokenBudgetFieldBudgetTokens: "thinking_budget_tokens",
		gatewayCompatUnavailable: "利用不可",
		saveGatewayCompat: "ゲートウェイ互換性を保存",
		gatewayCompatSaved: "ゲートウェイ互換性を保存しました",
		gatewayCompatSaveFailed: "ゲートウェイ互換性の保存に失敗しました",
		modelGatewayCompatTitle: "モデルゲートウェイ互換性",
		compatSourceModel: "モデルの上書き",
		compatSourceBase: "ベース設定",
		compatSourceProvider: "プロバイダー",
		compatSourceCatalog: "モデルカタログ",
		compatSourceProtocol: "プロトコルの既定値",
		compatSourceUnknown: "不明なソース",
		inheritProviderCompat: "自動でプロバイダーの互換性を継承",
		saveModelGatewayCompat: "モデルの互換性を保存",
		modelGatewayCompatSaved: "モデルゲートウェイ互換性を保存しました",
		seatModelLoading: "モデルを読み込み中…",
		seatNoModel: "モデルが選択されていません",
		seatNoEfforts: "現在のモデルには推論レベルの指定がありません",
		seatError: "モデルディレクトリの読み込みに失敗しました：{message}",
		seatFollowDefault: "モデルの既定値に従う",
		seatSliderLabel: "推論強度",
		seatReasoningLabel: "推論レベル",
		seatModelLabel: "モデル",
		providerAccount: "DeepSeek アカウント",
		seatSearchModels: "モデルを検索",
		seatNoModelResults: "一致するモデルがありません",
		seatErrorAction: "モデル操作に失敗しました：{message}",
		modelsArrayCompatSaveNote: "保存すると、このモデルの設定だけが変更され、他のモデルには影響しません。",
		opencodeSessionHeader: "OpenCode セッション Header",
		opencodeSessionHeaderTitle: "OpenCode セッション Header",
		opencodeSessionHeaderDescription: "OpenCode、OpenCode Go、またはこの Header を転送するプロキシ向けに、現在の DSH セッションから導出した値を x-opencode-session としてこのモデルに送信します。既定の生成器は上流の形式に従い、opencodeSession.format で変更できます。",
		opencodeSessionSaved: "OpenCode セッション Header を保存しました",
		opencodeSessionSaveFailed: "OpenCode セッション Header の保存に失敗しました：{message}",
		backupCardTitle: "設定のバックアップとプロファイル",
		backupCollapsedHint: "{count} 件のプロファイル",
		backupCollapsedHintEmpty: "プロファイルなし",
		backupProfilesTitle: "プロファイル一覧",
		backupProfilesEmpty: "保存されたプロファイルはまだありません",
		backupProfileNamePlaceholder: "プロファイル名（例：「仕事」）",
		backupSaveCurrent: "現在の設定を保存",
		backupApply: "適用",
		backupExportProfile: "書き出し",
		backupDeleteProfile: "削除",
		backupDeleteConfirm: "削除を確定",
		backupCancel: "キャンセル",
		backupExportCurrent: "現在の設定を書き出す",
		backupExportHint: "書き出した内容には provider の headers などの平文が含まれる場合があります。ファイルの保管にご注意ください。",
		backupImportTitle: "設定を読み込む",
		backupImportChoose: "ファイルを選択…",
		backupPreviewTitle: "読み込みプレビュー",
		backupModeMerge: "マージ（ファイルにない設定は保持）",
		backupModeReplace: "置換（ファイルの内容を優先）",
		backupSummary: "追加 {added} · 上書き {overwritten} · 削除 {removed}",
		backupSummaryEmpty: "現在の設定と同じため、書き込みは不要です",
		backupSummaryLibraryOnly: "ファイルにはプロファイル一覧と読み込み前の自動バックアップしか含まれておらず、これらは読み込まれないため、書き込む内容がありません",
		backupIgnored: "未対応の {count} 項目を無視しました",
		backupWiringSkipped: "エンドポイント/認証情報の設定 {count} 件をスキップしました（スナップショットは能力設定のみを移行します）",
		backupWiringInclude: "エンドポイントと認証情報もインポートする（上級者向け）",
		formatCardTitle: "セッション値ジェネレーター",
		formatCardHint: "現在：{mode}",
		formatModeLabel: "生成モード",
		formatModeSesDerive: "派生 ses_ 値（既定）",
		formatModePassthrough: "DSH セッション ID をそのまま送信",
		formatModeTemplate: "テンプレート",
		formatModeExpression: "式",
		formatModeScript: "外部スクリプト",
		formatTimeLabel: "タイムスタンプの取得元",
		formatTimeFirstUse: "初回使用時に生成（セッション内で固定）",
		formatTimeHash: "セッションのダイジェストから導出（マシン間で同一）",
		formatApply: "適用",
		formatSaved: "ジェネレーター設定を保存しました",
		formatSaveFailed: "ジェネレーター設定の保存に失敗しました：{message}",
		formatConflict: "設定が他で更新されました。もう一度適用してください。",
		formatOnInvalidLabel: "検証に失敗したとき",
		formatUnsupportedStored: "保存された値は未対応です。次のように解決しました：{detail}",
		formatTemplateLabel: "テンプレート文字列",
		formatTemplateHint: "使用できるプレースホルダー：{hex12} {tail62} {sessionId} {rawSessionId} {sha256} {now} {provider} {model}",
		formatExpressionLabel: "式",
		formatExpressionHint: "識別子はテンプレートと同じ。関数 sha256 / slice / lower / upper も利用できます",
		formatScriptLabel: "スクリプトの絶対パス",
		formatScriptHint: "format(context) をエクスポートするファイル。変更後 1 秒以内に再読み込みされます",
		formatValidateLabel: "検証用正規表現",
		formatValidateHint: "空欄は検証なし。組み込みの既定形式は ^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$",
		formatOnInvalidWarn: "ログに記録して送信する",
		formatOnInvalidDrop: "Header を送信しない",
		formatOnInvalidSend: "黙って送信する",
		formatErrValidateRegex: "正規表現として不正です。ホストは「検証なし」に後退します",
		formatErrTemplateRequired: "テンプレートモードではテンプレートが必須です。空だとホストは派生値に後退します",
		formatErrExpressionRequired: "式モードでは式が必須です。空だとホストは派生値に後退します",
		formatErrExpressionSyntax: "式を解析できません。ホストは派生値に後退します",
		formatErrExpressionUnknownName: "式に存在しない識別子または関数があります。ホストは黙って派生値に後退します",
		formatErrScriptRequired: "スクリプトモードではパスが必須です。空だとホストは派生値に後退します",
		formatErrScriptNotAbsolute: "絶対パスである必要があります（ホストは相対パスを自身の作業ディレクトリで解決します）",
		backupWiringWarning: "このインポートはエンドポイントと認証情報の設定を書き換えます",
		backupSourceFile: "ファイルから",
		backupSourceProfile: "プロファイル「{name}」から",
		backupSourceAutoBackup: "読み込み前の自動バックアップから",
		backupConfirmImport: "読み込みを実行",
		backupApplied: "設定を適用しました",
		backupAppliedPartial: "一部のみ適用：{detail}",
		backupSkipped: "変更がないため書き込みませんでした",
		backupRestartRequired: "DSH の再起動後に反映されます：{namespaces}",
		backupAutoBackupFailed: "読み込み前の自動バックアップの保存に失敗：{message}",
		backupSavedProfile: "プロファイル「{name}」を保存しました",
		backupSaveProfileFailed: "プロファイルの保存に失敗：{message}",
		backupDeleteProfileFailed: "プロファイルの削除に失敗：{message}",
		backupImportFailed: "読み込みに失敗：{message}",
		backupReadFailed: "ファイルの読み取りに失敗：{message}",
		backupProfileLimit: "プロファイルは最大 {max} 件です。先に削除してください",
		backupNameRequired: "プロファイル名を入力してください",
		backupNameTooLong: "プロファイル名は {max} 文字以内で入力してください",
		backupNameReserved: "そのプロファイル名は予約されています",
		backupNameInvalid: "プロファイル名に制御文字は使用できません",
		backupNameTaken: "同名のプロファイルが既にあります",
		backupReadOnly: "現在の設定ソースは読み取り専用です",
		backupAutoBackupTitle: "読み込み前の自動バックアップ",
		backupAutoBackupNone: "自動バックアップはまだありません",
		backupAutoBackupRestore: "読み込み前の設定に戻す",
		backupConflict: "他のウィンドウで設定が変更されました。確認して再試行してください",
		backupParseInvalidJson: "ファイルが正しい JSON ではありません",
		backupParseNotObject: "ファイルの内容が設定オブジェクトではありません",
		backupParseKindMismatch: "このプラグインが書き出したファイルではありません",
		backupParseVersion: "設定ファイルのバージョン {version} は未対応です（対応：{supported}）",
		backupParseSections: "設定ファイルに sections がありません",
		backupParseSection: "設定ファイルの {ns} セクションの形式が正しくありません",
		backupParseReserved: "設定に安全でないフィールド名「{key}」が含まれています",
		backupParseTooLarge: "ファイルが大きすぎます（上限 {maxBytes} バイト）",
		legacyMigrationTitle: "旧バージョンの設定データが見つかりました",
		legacyMigrationBody: "DSH 0.1.7 で設定の保存方法が変わったため、次の {count} 件の旧設定を自動で取り込めませんでした。新しい設定に書き込みますか？",
		legacyMigrationFieldEffort: "サブエージェントの既定思考強度",
		legacyMigrationSourceLive: "旧 llm-pi-ai 設定",
		legacyMigrationSourceDocument: "settings.yaml",
		legacyMigrationSourceImported: "settings.yaml.imported",
		legacyMigrationApply: "移行",
		legacyMigrationDismiss: "今後表示しない",
		legacyMigrationLater: "後で",
		legacyMigrationApplied: "旧設定を移行しました。",
		legacyMigrationDismissed: "無視しました。旧データが変わると再び表示されます。",
		legacyMigrationFailed: "移行に失敗しました：{reason}",
		legacyMigrationTimedOut: "ホストが時間内に結果を確認できませんでした。もう一度お試しください。",
		legacyMigrationRescan: "旧データを再スキャン",
		legacyMigrationRescanHint: "旧設定ドキュメントに未移行の項目がないか手動で確認します。",
		legacyMigrationNothingPending: "移行待ちの旧データはありません。",
		compactionSectionTitle: "コンテキスト圧縮",
		compactionThreshold: "圧縮しきい値",
		compactionThresholdHint: "コンテキスト使用量がウィンドウのこの割合に達したとき、プラグインが早めに圧縮します。空欄は全体設定に従います。",
		compactionRetain: "直近のコンテキストを保持",
		compactionRetainHint: "プラグインの圧縮後、この割合の直近メッセージをそのまま保持します。空欄は全体設定に従います。",
		compactionAutoSave: "入力すると自動保存されます",
		compactionFollowGlobal: "グローバルに従う {percent}%",
		compactionInvalidThreshold: "圧縮しきい値は 10%〜95% の範囲で指定してください",
		compactionInvalidRetain: "保持率は 0 より大きい必要があります",
		compactionRetainNotBelow: "保持率は圧縮しきい値より小さくしてください",
		compactionSaved: "圧縮設定を保存しました",
		subagentModelTitle: "Subagent の既定モデル",
		subagentModelInherit: "親セッションを継承",
		subagentModelProvider: "プロバイダー",
		subagentModelModel: "モデル",
		subagentModelUnavailable: "保存済みですが現在は利用できません（{route}）",
		subagentModelHint: "Subagent の作成時にこのモデルへ切り替えます。「親セッションを継承」を選ぶと親のモデルを使います。",
		subagentModelAutoSave: "選択すると自動保存されます",
		subagentModelSaved: "Subagent の既定モデルを保存しました",
		compactionSectionHint: "空欄は全体の割合に従います。入力した割合はこのモデルにのみ適用されます。"
	},
	ko: {
		title: "타사 모델 추론 강도",
		description: "추론 강도를 선택하고 게이트웨이에 보낼 값을 입력합니다. 예를 들어 high에 ultra를 설정하면 Composer에서 High를 선택할 때 ultra가 전송됩니다. 설정이 없는 모델은 기본 선택 항목(Off / High / Max)을 사용합니다.",
		subagentTitle: "Subagent 추론 강도",
		currentDefault: "현재 기본값: {effort}",
		unconfiguredSubagent: "설정되지 않음 (Subagent는 부모 세션의 단계를 상속)",
		providerDefault: "부모 세션 단계 상속",
		apply: "적용",
		presetOfficial: "전체에 적용: Off / High / Max (공식 DeepSeek 방식)",
		presetGeneric: "전체에 적용: Off / Low / Medium / High (일반 방식)",
		searchPlaceholder: "모델 이름 또는 ID로 검색…",
		loading: "로드 중…",
		noModels: "수동으로 선언된 pi-ai 모델이 없습니다",
		noMatches: "일치하는 모델이 없습니다",
		noDeclared: "선언되지 않음",
		route: "라우트: {route}",
		customize: "추론 강도 사용자 지정",
		collapse: "접기",
		editorTitle: "추론 강도 편집 (단계를 선택하고 전송 값을 입력한 후 적용)",
		applyLevel: "추론 강도 적용",
		restoreDefault: "기본값 복원",
		expandedCount: "모델 {count}개 펼침",
		versionLabel: "플러그인 버전",
		languageLabel: "페이지 언어",
		languageChinese: "中文",
		languageEnglish: "English",
		languageJapanese: "日本語",
		languageKorean: "한국어",
		customPlaceholder: "사용자 지정 추론 강도 (예: ultra)",
		offPlaceholder: "비워 둠 = 전송하지 않음",
		wirePlaceholder: "사용자 지정 전송 값 (예: ultra)",
		noNamespace: "llm-pi-ai 설정 네임스페이스를 찾을 수 없습니다 (타사 모델 설정이 없습니다).",
		customEffortRequired: "사용자 지정 추론 강도를 입력하세요",
		levelNeedsValue: "추론 강도 {level}에는 전송 값이 필요합니다",
		atLeastThinking: "추론 강도를 하나 이상 선택하세요",
		readSettingsFailed: "설정을 읽지 못했습니다: {message}",
		writeFailed: "쓰기에 실패했습니다. 다시 시도하세요.",
		writeError: "쓰기에 실패했습니다: {message}",
		levelOff: "off",
		levelMinimal: "minimal",
		levelLow: "low",
		levelMedium: "medium",
		levelHigh: "high",
		levelXhigh: "xhigh",
		levelMax: "max",
		levelSuffix: " 추론 강도",
		pageTitle: "모델 기능 및 추론 강도",
		subagentCardTitle: "Subagent 기본 추론 강도",
		autoFillDefaultsTitle: "기본 추론 강도 자동 보완",
		autoFillDefaultsDescription: "시작 및 모델 설정 변경 시 추론 강도가 없는 모델에 Off / High / Max를 추가합니다. 자동 보완을 중지할 뿐 기존 값은 삭제하지 않습니다.",
		inputCapabilityMinimum: "입력 기능을 하나 이상 활성화하세요",
		contextInteger: "컨텍스트 길이는 정수 또는 1024 배를 나타내는 k(예: 64k = 65536)로 입력하세요 (2000-1000000)",
		contextRange: "컨텍스트 길이는 2000에서 1000000 사이여야 합니다",
		saveMissingNamespace: "저장했지만 최신 설정을 받지 못했습니다",
		settingsUpdated: "설정이 업데이트되었습니다",
		modelSettingsSaved: "모델 설정이 저장되었습니다",
		restoreReasoning: "기본 추론 강도를 복원했습니다",
		restoreCapability: "기본 기능을 복원했습니다",
		officialPreset: "공식 프리셋",
		genericPreset: "일반 프리셋",
		subagentSaved: "Subagent 기본 추론 강도가 저장되었습니다",
		quickSettings: "빠른 설정",
		vendor: "제공자",
		modelCount: "모델 {count}개",
		searchResults: "검색 결과",
		model: "모델",
		unsaved: "저장되지 않음",
		textEnabled: "텍스트 입력: 활성화됨",
		textDisabled: "텍스트 입력: 비활성화됨",
		imageEnabled: "이미지 입력: 활성화됨",
		imageDisabled: "이미지 입력: 비활성화됨",
		openModelSettings: "모델 설정 열기",
		closeModelSettings: "모델 설정 접기",
		contextLength: "컨텍스트 길이",
		oneMillionMode: "1M 모드",
		inputCapabilities: "입력 기능",
		textInput: "텍스트 입력",
		imageInput: "이미지 입력",
		reasoningLevels: "추론 강도",
		saveChanges: "변경 사항 저장",
		saved: "저장됨",
		saveModelChanges: "모델 변경 사항 저장",
		noPendingChanges: "저장할 변경 사항이 없습니다",
		expandedSettings: "모델 설정 {count}개 펼침",
		collapseProvider: "제공자 접기",
		expandProvider: "제공자 펼치기",
		providerDefaultShort: "제공자 기본값",
		contextTitle: "컨텍스트 {value}",
		contextLabel: "컨텍스트 {label}",
		gatewayMoreFields: "추가 필드 {count}개",
		gatewayExpandedLess: "필드 접기",
		gatewayGroupRole: "역할",
		gatewayGroupFormat: "형식",
		gatewayGroupStream: "스트리밍",
		gatewayGroupCache: "캐시",
		gatewayCompatTitle: "게이트웨이 호환성",
		supportsDeveloperRole: "Developer 역할",
		maxTokensField: "최대 토큰 필드",
		supportsStore: "스토어 지원",
		supportsReasoningEffort: "추론 강도 지원",
		supportsUsageInStreaming: "스트리밍 중 사용량",
		supportsFinishReason: "종료 이유",
		requiresToolResultName: "도구 결과 이름",
		requiresAssistantAfterToolResult: "도구 결과 후 Assistant",
		requiresThinkingAsText: "사고를 텍스트로 전달",
		requiresReasoningContentOnAssistantMessages: "Assistant 메시지에 추론 콘텐츠",
		supportsThinkingTokenBudget: "사고 토큰 예산 지원",
		thinkingTokenBudgetField: "사고 예산 필드",
		supportsMaxOutputTokens: "최대 출력 토큰 지원",
		supportsStrictMode: "엄격 모드",
		supportsLongCacheRetention: "장기 캐시 보존",
		thinkingFormat: "사고 형식",
		cacheControlFormat: "캐시 제어 형식",
		cacheControlFormatAnthropic: "anthropic",
		gatewayCompatAuto: "자동",
		gatewayCompatSupported: "지원",
		gatewayCompatUnsupported: "지원 안 함",
		maxTokensFieldStandard: "max_tokens",
		maxTokensFieldCompletion: "max_completion_tokens",
		vllmPriority: "vLLM 우선순위",
		thinkingTokenBudgetFieldTokenBudget: "thinking_token_budget",
		thinkingTokenBudgetFieldBudget: "thinking_budget",
		thinkingTokenBudgetFieldBudgetTokens: "thinking_budget_tokens",
		gatewayCompatUnavailable: "사용할 수 없음",
		saveGatewayCompat: "게이트웨이 호환성 저장",
		gatewayCompatSaved: "게이트웨이 호환성을 저장했습니다",
		gatewayCompatSaveFailed: "게이트웨이 호환성을 저장하지 못했습니다",
		modelGatewayCompatTitle: "모델 게이트웨이 호환성",
		compatSourceModel: "모델 재정의",
		compatSourceBase: "기본 구성",
		compatSourceProvider: "제공자",
		compatSourceCatalog: "모델 카탈로그",
		compatSourceProtocol: "프로토콜 기본값",
		compatSourceUnknown: "알 수 없는 출처",
		inheritProviderCompat: "자동으로 제공자 호환성 상속",
		saveModelGatewayCompat: "모델 호환성 저장",
		modelGatewayCompatSaved: "모델 게이트웨이 호환성이 저장되었습니다",
		seatModelLoading: "모델 로드 중…",
		seatNoModel: "모델이 선택되지 않았습니다",
		seatNoEfforts: "현재 모델에는 추론 수준이 제공되지 않습니다",
		seatError: "모델 디렉터리를 불러오지 못했습니다: {message}",
		seatFollowDefault: "모델 기본값 따르기",
		seatSliderLabel: "추론 강도",
		seatReasoningLabel: "추론 수준",
		seatModelLabel: "모델",
		providerAccount: "DeepSeek 계정",
		seatSearchModels: "모델 검색",
		seatNoModelResults: "일치하는 모델이 없습니다",
		seatErrorAction: "모델 작업에 실패했습니다: {message}",
		modelsArrayCompatSaveNote: "저장하면 현재 모델의 설정만 변경되며 다른 모델에는 영향을 주지 않습니다.",
		opencodeSessionHeader: "OpenCode 세션 Header",
		opencodeSessionHeaderTitle: "OpenCode 세션 Header",
		opencodeSessionHeaderDescription: "OpenCode, OpenCode Go 또는 이 Header를 전달하는 프록시를 위해 현재 DSH 세션에서 파생한 값을 이 모델의 x-opencode-session으로 보냅니다. 기본 생성기는 상류 형식을 따르며 opencodeSession.format에서 변경할 수 있습니다.",
		opencodeSessionSaved: "OpenCode 세션 Header를 저장했습니다",
		opencodeSessionSaveFailed: "OpenCode 세션 Header를 저장하지 못했습니다: {message}",
		backupCardTitle: "설정 백업 및 프로필",
		backupCollapsedHint: "프로필 {count}개",
		backupCollapsedHintEmpty: "프로필 없음",
		backupProfilesTitle: "프로필 목록",
		backupProfilesEmpty: "저장된 프로필이 없습니다",
		backupProfileNamePlaceholder: "프로필 이름 (예: \"업무\")",
		backupSaveCurrent: "현재 설정 저장",
		backupApply: "적용",
		backupExportProfile: "내보내기",
		backupDeleteProfile: "삭제",
		backupDeleteConfirm: "삭제 확인",
		backupCancel: "취소",
		backupExportCurrent: "현재 설정 내보내기",
		backupExportHint: "내보낸 내용에는 provider 의 headers 등 평문 정보가 포함될 수 있습니다. 파일을 안전하게 보관하세요.",
		backupImportTitle: "설정 가져오기",
		backupImportChoose: "파일 선택…",
		backupPreviewTitle: "가져오기 미리보기",
		backupModeMerge: "병합 (파일에 없는 설정은 유지)",
		backupModeReplace: "교체 (파일 내용 기준)",
		backupSummary: "추가 {added} · 덮어쓰기 {overwritten} · 삭제 {removed}",
		backupSummaryEmpty: "현재 설정과 동일하여 기록하지 않습니다",
		backupSummaryLibraryOnly: "파일에는 프로필 목록과 가져오기 전 자동 백업만 들어 있으며, 이 항목들은 가져오지 않으므로 기록할 내용이 없습니다",
		backupIgnored: "지원하지 않는 항목 {count}개를 무시했습니다",
		backupWiringSkipped: "엔드포인트/자격 증명 설정 {count}건을 건너뛰었습니다(스냅샷은 능력 설정만 이전합니다)",
		backupWiringInclude: "엔드포인트와 자격 증명도 가져오기(고급)",
		formatCardTitle: "세션 값 생성기",
		formatCardHint: "현재: {mode}",
		formatModeLabel: "생성 모드",
		formatModeSesDerive: "파생 ses_ 값(기본)",
		formatModePassthrough: "DSH 세션 ID를 그대로 전송",
		formatModeTemplate: "템플릿",
		formatModeExpression: "표현식",
		formatModeScript: "외부 스크립트",
		formatTimeLabel: "타임스탬프 원본",
		formatTimeFirstUse: "최초 사용 시 생성(세션 내 고정)",
		formatTimeHash: "세션 다이제스트에서 파생(머신 간 동일)",
		formatApply: "적용",
		formatSaved: "생성기 설정을 저장했습니다",
		formatSaveFailed: "생성기 설정 저장 실패: {message}",
		formatConflict: "설정이 다른 곳에서 변경되었습니다. 다시 적용하세요.",
		formatOnInvalidLabel: "검증 실패 시",
		formatUnsupportedStored: "저장된 값을 지원하지 않습니다. 다음과 같이 해석했습니다: {detail}",
		formatTemplateLabel: "템플릿 문자열",
		formatTemplateHint: "사용 가능한 자리 표시자: {hex12} {tail62} {sessionId} {rawSessionId} {sha256} {now} {provider} {model}",
		formatExpressionLabel: "표현식",
		formatExpressionHint: "식별자는 템플릿과 같고, 함수 sha256 / slice / lower / upper도 쓸 수 있습니다",
		formatScriptLabel: "스크립트 절대 경로",
		formatScriptHint: "format(context)를 내보내는 파일이며, 변경 후 1초 이내에 다시 로드됩니다",
		formatValidateLabel: "검증 정규식",
		formatValidateHint: "비우면 검증하지 않습니다. 내장 기본 형식은 ^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$",
		formatOnInvalidWarn: "로그를 남기고 그대로 전송",
		formatOnInvalidDrop: "Header를 보내지 않음",
		formatOnInvalidSend: "조용히 전송",
		formatErrValidateRegex: "정규식이 올바르지 않습니다. 호스트는 '검증 없음'으로 후퇴합니다",
		formatErrTemplateRequired: "템플릿 모드에는 템플릿이 필요합니다. 비우면 호스트가 파생 값으로 후퇴합니다",
		formatErrExpressionRequired: "표현식 모드에는 표현식이 필요합니다. 비우면 호스트가 파생 값으로 후퇴합니다",
		formatErrExpressionSyntax: "표현식을 해석할 수 없습니다. 호스트가 파생 값으로 후퇴합니다",
		formatErrExpressionUnknownName: "표현식에 존재하지 않는 식별자나 함수가 있습니다. 호스트가 조용히 파생 값으로 후퇴합니다",
		formatErrScriptRequired: "스크립트 모드에는 경로가 필요합니다. 비우면 호스트가 파생 값으로 후퇴합니다",
		formatErrScriptNotAbsolute: "절대 경로여야 합니다(호스트는 상대 경로를 자신의 작업 디렉터리 기준으로 해석합니다)",
		backupWiringWarning: "이번 가져오기는 엔드포인트와 자격 증명 설정을 변경합니다",
		backupSourceFile: "파일에서",
		backupSourceProfile: "프로필 \"{name}\" 에서",
		backupSourceAutoBackup: "가져오기 전 자동 백업에서",
		backupConfirmImport: "가져오기 실행",
		backupApplied: "설정을 적용했습니다",
		backupAppliedPartial: "일부만 적용됨: {detail}",
		backupSkipped: "변경 사항이 없어 기록하지 않았습니다",
		backupRestartRequired: "DSH 재시작 후 적용됩니다: {namespaces}",
		backupAutoBackupFailed: "가져오기 전 자동 백업 저장 실패: {message}",
		backupSavedProfile: "프로필 \"{name}\" 을(를) 저장했습니다",
		backupSaveProfileFailed: "프로필 저장 실패: {message}",
		backupDeleteProfileFailed: "프로필 삭제 실패: {message}",
		backupImportFailed: "가져오기 실패: {message}",
		backupReadFailed: "파일을 읽지 못했습니다: {message}",
		backupProfileLimit: "프로필은 최대 {max}개입니다. 먼저 삭제하세요",
		backupNameRequired: "프로필 이름을 입력하세요",
		backupNameTooLong: "프로필 이름은 {max}자 이내여야 합니다",
		backupNameReserved: "사용할 수 없는 프로필 이름입니다",
		backupNameInvalid: "프로필 이름에 제어 문자를 쓸 수 없습니다",
		backupNameTaken: "같은 이름의 프로필이 이미 있습니다",
		backupReadOnly: "현재 설정 소스는 읽기 전용입니다",
		backupAutoBackupTitle: "가져오기 전 자동 백업",
		backupAutoBackupNone: "자동 백업이 아직 없습니다",
		backupAutoBackupRestore: "가져오기 전 설정으로 복원",
		backupConflict: "다른 창에서 설정이 변경되었습니다. 확인 후 다시 시도하세요",
		backupParseInvalidJson: "파일이 올바른 JSON 이 아닙니다",
		backupParseNotObject: "파일 내용이 설정 객체가 아닙니다",
		backupParseKindMismatch: "이 플러그인이 내보낸 파일이 아닙니다",
		backupParseVersion: "설정 파일 버전 {version} 은(는) 지원되지 않습니다 (지원: {supported})",
		backupParseSections: "설정 파일에 sections 가 없습니다",
		backupParseSection: "설정 파일의 {ns} 섹션 형식이 올바르지 않습니다",
		backupParseReserved: "설정에 안전하지 않은 필드 이름 \"{key}\" 이(가) 있습니다",
		backupParseTooLarge: "파일이 너무 큽니다 (최대 {maxBytes} 바이트)",
		legacyMigrationTitle: "이전 버전 설정 데이터를 발견했습니다",
		legacyMigrationBody: "DSH 0.1.7에서 설정 저장 방식이 바뀌어 다음 {count}개 항목을 자동으로 가져오지 못했습니다. 새 설정에 기록할까요?",
		legacyMigrationFieldEffort: "서브에이전트 기본 사고 강도",
		legacyMigrationSourceLive: "이전 llm-pi-ai 설정",
		legacyMigrationSourceDocument: "settings.yaml",
		legacyMigrationSourceImported: "settings.yaml.imported",
		legacyMigrationApply: "마이그레이션",
		legacyMigrationDismiss: "다시 묻지 않기",
		legacyMigrationLater: "나중에",
		legacyMigrationApplied: "이전 설정을 마이그레이션했습니다.",
		legacyMigrationDismissed: "무시했습니다. 이전 데이터가 바뀌면 다시 알려드립니다.",
		legacyMigrationFailed: "마이그레이션 실패: {reason}",
		legacyMigrationTimedOut: "호스트가 제때 결과를 확인하지 못했습니다. 다시 시도해 주세요.",
		legacyMigrationRescan: "이전 데이터 다시 검사",
		legacyMigrationRescanHint: "이전 설정 문서에서 아직 마이그레이션되지 않은 항목을 직접 확인합니다.",
		legacyMigrationNothingPending: "마이그레이션할 이전 데이터가 없습니다.",
		compactionSectionTitle: "컨텍스트 압축",
		compactionThreshold: "압축 임계값",
		compactionThresholdHint: "컨텍스트 사용량이 창의 이 비율에 도달하면 플러그인이 미리 압축합니다. 비워 두면 전역 설정을 따릅니다.",
		compactionRetain: "최근 컨텍스트 유지",
		compactionRetainHint: "플러그인이 압축한 뒤 이 비율만큼 최근 메시지를 그대로 유지합니다. 비워 두면 전역 설정을 따릅니다.",
		compactionAutoSave: "입력하면 자동 저장됩니다",
		compactionFollowGlobal: "전역 설정 따르기 {percent}%",
		compactionInvalidThreshold: "압축 임계값은 10%~95% 사이여야 합니다",
		compactionInvalidRetain: "유지 비율은 0보다 커야 합니다",
		compactionRetainNotBelow: "유지 비율은 압축 임계값보다 작아야 합니다",
		compactionSaved: "압축 설정이 저장되었습니다",
		subagentModelTitle: "Subagent 기본 모델",
		subagentModelInherit: "상위 세션 상속",
		subagentModelProvider: "제공자",
		subagentModelModel: "모델",
		subagentModelUnavailable: "저장되었지만 현재 사용할 수 없습니다 ({route})",
		subagentModelHint: "Subagent를 만들 때 이 모델로 전환합니다. \"상위 세션 상속\"을 선택하면 상위 세션의 모델을 사용합니다.",
		subagentModelAutoSave: "선택하면 자동 저장됩니다",
		subagentModelSaved: "Subagent 기본 모델이 저장되었습니다",
		compactionSectionHint: "비워 두면 전역 비율을 따릅니다. 입력한 비율은 이 모델에만 적용됩니다."
	}
};
//#endregion
//#region packages/settings-ui/src/client/settings-bridge.ts
function directResult(response) {
	if (response !== null && typeof response === "object" && "result" in response) {
		const result = response.result;
		if (result !== null && typeof result === "object") return result;
	}
	return response;
}
/**
* Narrow the optional `ctx.configForms` service by method shape.
*
* Inject-free on purpose: `configForms` is absent on every host before 0.1.7,
* and a declared-but-missing service parks the consuming fiber. A value that is
* not an object, or carries no callable `get`, yields `undefined` — and then
* the bridge attaches no `formFor` at all.
*
* The returned closure is deliberately thin: it re-asks the service on every
* call, which is what lets a late-activated `configForms` reach an already
* mounted editor when the caller passes a live view.
*
* @param configForms - The raw fourth argument handed to {@link settingsBridge}.
* @returns A `formFor` lookup, or `undefined` when no service face is present.
*/
function formFace(configForms) {
	const service = configForms;
	if (service === null || service === void 0 || typeof service.get !== "function") return void 0;
	return (entryId) => service.get(entryId) ?? void 0;
}
/**
* Build the settings transport one client generation exposes.
*
* `configForms` is optional and last so every existing 1-to-3 argument call
* keeps the exact object it built before: when the probe finds no service face,
* no `formFor` key is attached, so a legacy host's `SettingsApi` is unchanged
* key for key. When the host does expose `ctx.configForms` (DSH 0.1.7 and
* later), `formFor` joins BOTH branches — the form family is orthogonal to
* whichever `describe`/`mutate` pair the generation uses.
*
* @param connection - Client connection owning the possibly-legacy settings API.
* @param remoteSettings - The modern `remote.settings` service, when present.
* @param addLanguage - The locale `addLanguage` face, for capability detection.
* @param configForms - The optional `ctx.configForms` service, or a live view of it.
* @returns The transport, or `undefined` when the host exposes no settings API.
*/
function settingsBridge(connection, remoteSettings, addLanguage, configForms) {
	const formFor = formFace(configForms);
	const legacySettings = connection?.api?.settings;
	const legacyCapabilities = clientCapabilities({
		legacySettings,
		addLanguage
	});
	if (legacyCapabilities.settings === "legacy" && legacySettings !== void 0) {
		const legacy = legacySettings;
		return {
			externalLanguages: legacyCapabilities.externalLanguages,
			compatibilityProfile: resolveCompatibility({ capabilities: legacyCapabilities }).profile,
			describe: () => legacy.describe({}).then((response) => directResult(response)),
			mutate: (ns, ops, expectedRevision) => legacy.mutate({
				ns,
				ops,
				expectedRevision
			}).then((response) => directResult(response)),
			...formFor === void 0 ? {} : { formFor }
		};
	}
	const capabilities = clientCapabilities({
		remoteSettings,
		legacySettings,
		addLanguage
	});
	const compatibility = resolveCompatibility({ capabilities });
	if (compatibility.profile === "modern" && remoteSettings !== void 0) {
		const modern = remoteSettings;
		return {
			externalLanguages: capabilities.externalLanguages,
			compatibilityProfile: compatibility.profile,
			describe: () => modern.describe().then((response) => directResult(response)),
			mutate: (ns, ops, expectedRevision) => modern.mutate(ns, ops, expectedRevision).then((response) => directResult(response)),
			...formFor === void 0 ? {} : { formFor }
		};
	}
}
//#endregion
//#region packages/settings-ui/src/client/takeover-runtime.ts
const EMPTY_RESOLUTION = {
	providers: [],
	compat: []
};
function createTakeoverRuntimeStore() {
	let current = EMPTY_RESOLUTION;
	let active = true;
	const listeners = /* @__PURE__ */ new Set();
	return {
		getSnapshot: () => current,
		subscribe: (listener) => {
			if (!active) return () => void 0;
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		update: (resolution) => {
			if (!active) return;
			current = resolution;
			for (const listener of listeners) listener();
		},
		dispose: () => {
			active = false;
			current = EMPTY_RESOLUTION;
			listeners.clear();
		}
	};
}
function record$3(value) {
	return isUnknownRecord(value) ? value : void 0;
}
function piAiValue(namespace) {
	return record$3(namespace?.value);
}
function takeoverValue(namespace) {
	return record$3(namespace?.value);
}
function modelNames(profile) {
	if (profile === void 0 || hasModelSourceConflict(profile)) return [];
	const names = [];
	if (Array.isArray(profile.models)) for (const model of profile.models) {
		const row = record$3(model);
		if (typeof row?.id === "string") names.push(row.id);
	}
	const overrides = record$3(profile.modelOverrides);
	if (overrides !== void 0) names.push(...Object.keys(overrides));
	return names.length === 0 ? [void 0] : names;
}
function resolveTakeoverDescription(settings, response) {
	if (!response.ok) return EMPTY_RESOLUTION;
	const namespaces = response.value?.namespaces;
	if (!Array.isArray(namespaces)) return EMPTY_RESOLUTION;
	const piAiNamespace = namespaces.find((namespace) => namespace.ns === LLM_PI_AI_NS);
	if (piAiNamespace === void 0) return EMPTY_RESOLUTION;
	const takeoverNamespace = namespaces.find((namespace) => namespace.ns === "llm-openai-completions");
	const piAi = piAiValue(piAiNamespace);
	const takeover = takeoverValue(takeoverNamespace);
	const input = {
		runtimeProfile: settings.compatibilityProfile,
		descriptorSchema: piAiNamespace.schema,
		piAi,
		takeover
	};
	const providers = resolveTakeoverProviders(input).filter((provider) => !hasLayeredModelSourceConflict(piAiNamespace, provider));
	const profiles = record$3(piAi?.providers);
	if (profiles === void 0) return {
		providers,
		compat: []
	};
	const compat = [];
	for (const [provider, value] of Object.entries(profiles)) {
		if (!providers.includes(provider)) continue;
		const profile = record$3(value);
		const providerResolution = resolveTakeoverGatewayCompat({
			...input,
			provider
		});
		if (providerResolution !== void 0) compat.push(providerResolution);
		for (const model of modelNames(profile)) {
			if (model === void 0) continue;
			const resolution = resolveTakeoverGatewayCompat({
				...input,
				provider,
				model
			});
			if (resolution !== void 0) compat.push(resolution);
		}
	}
	return {
		providers,
		compat
	};
}
function observeTakeoverSettings(settings, onResolution) {
	let active = true;
	let sequence = 0;
	let mutationGeneration = 0;
	let pendingRefreshGeneration;
	const nextSequence = () => {
		sequence += 1;
		return sequence;
	};
	const publish = (requestSequence, requestGeneration, response, refresh) => {
		if (!active || requestGeneration !== mutationGeneration) return;
		if (refresh) {
			if (pendingRefreshGeneration !== requestGeneration) return;
			pendingRefreshGeneration = void 0;
			onResolution(resolveTakeoverDescription(settings, response));
			return;
		}
		if (pendingRefreshGeneration === requestGeneration || requestSequence !== sequence) return;
		onResolution(resolveTakeoverDescription(settings, response));
	};
	return {
		...settings,
		describe: () => {
			const requestSequence = nextSequence();
			const requestGeneration = mutationGeneration;
			return settings.describe().then((response) => {
				publish(requestSequence, requestGeneration, response, false);
				return response;
			});
		},
		mutate: async (ns, ops, expectedRevision) => {
			const response = await settings.mutate(ns, ops, expectedRevision);
			if (!response.ok || !active) return response;
			mutationGeneration += 1;
			const refreshGeneration = mutationGeneration;
			const refreshSequence = nextSequence();
			pendingRefreshGeneration = refreshGeneration;
			settings.describe().then((description) => {
				publish(refreshSequence, refreshGeneration, description, true);
			}).catch(() => {
				if (!active || pendingRefreshGeneration !== refreshGeneration) return;
				pendingRefreshGeneration = void 0;
				onResolution(EMPTY_RESOLUTION);
			});
			return response;
		},
		dispose: () => {
			active = false;
			sequence += 1;
			pendingRefreshGeneration = void 0;
		}
	};
}
const emptyTakeoverRuntimeResolution = EMPTY_RESOLUTION;
//#endregion
//#region packages/settings-ui/src/client/constants.ts
const DEFAULT_LEVELS = DEFAULT_LEVELS$1;
const PRESETS = [{
	key: "official",
	levels: DEFAULT_LEVELS,
	labelKey: "presetOfficial"
}, {
	key: "generic",
	levels: {
		off: null,
		low: "low",
		medium: "medium",
		high: "high"
	},
	labelKey: "presetGeneric"
}];
const NS = LLM_PI_AI_NS;
const CONTEXT_1M = 1e6;
const INPUT_MODALITIES = ["text", "image"];
const LEVEL_LABEL_KEYS = {
	off: "levelOff",
	minimal: "levelMinimal",
	low: "levelLow",
	medium: "levelMedium",
	high: "levelHigh",
	xhigh: "levelXhigh",
	max: "levelMax"
};
//#endregion
//#region packages/settings-ui/src/client/model-inventory.ts
function record$2(value) {
	return isUnknownRecord(value) ? value : void 0;
}
function ownedData(value) {
	if (Array.isArray(value)) return value.map((entry) => ownedData(entry));
	const object = record$2(value);
	if (object === void 0) return value;
	const copy = {};
	for (const [key, entry] of Object.entries(object)) Object.defineProperty(copy, key, {
		configurable: true,
		enumerable: true,
		value: ownedData(entry),
		writable: true
	});
	return copy;
}
function modelItem(route, model, raw, index, inOverrides, modelsSnapshot, modelSourceConflict = false) {
	const levels = raw.reasoningEfforts === void 0 ? null : raw.reasoningEfforts;
	const contextWindow = Number.isInteger(raw.contextWindow) ? raw.contextWindow : void 0;
	const input = Array.isArray(raw.input) ? raw.input : [];
	return {
		route,
		model,
		name: typeof raw.name === "string" && raw.name.length > 0 ? raw.name : model,
		levels,
		contextWindow,
		input,
		raw,
		...modelSourceConflict ? { modelSourceConflict: true } : {},
		...modelsSnapshot === void 0 ? {} : { modelsSnapshot },
		index,
		inOverrides
	};
}
function layerCompat(layer, provider) {
	return record$2(record$2(record$2(record$2(layer)?.providers)?.[provider])?.compat);
}
/**
* Resolve the `api` protocol string a route declares across the descriptor
* value, user, and base layers. `undefined` means the route declares no
* protocol; the UI then keeps full-field compatibility.
*/
function routeApi(namespace, route) {
	for (const layer of [
		"value",
		"user",
		"base"
	]) {
		const profile = record$2(record$2(record$2(record$2(namespace)?.[layer])?.providers)?.[route]);
		if (profile === void 0) continue;
		const api = profile.api;
		if (typeof api === "string" && api.length > 0) return api;
	}
}
function modelLayerCompat(layer, provider, model) {
	const profile = record$2(record$2(record$2(layer)?.providers)?.[provider]);
	if (!profile) return void 0;
	if (hasModelSourceConflict(profile)) return void 0;
	const overrides = record$2(profile.modelOverrides);
	if (overrides !== void 0 && Object.prototype.hasOwnProperty.call(overrides, model)) {
		const override = record$2(overrides[model]);
		return override === void 0 ? void 0 : record$2(override.compat);
	}
	if (Array.isArray(profile.models)) return record$2(record$2(profile.models.find((entry) => record$2(entry)?.id === model))?.compat);
}
function modelRuntimeCompatFor(runtime, provider, model) {
	return runtime?.compat.find((resolution) => resolution.provider === provider && resolution.model === model);
}
function protocolCompatFrom(resolution) {
	if (resolution === void 0) return void 0;
	const projection = {};
	for (const key of GATEWAY_COMPAT_FIELD_KEYS) {
		const field = record$2(record$2(resolution)?.[key]);
		if (field?.source === "protocol" && field.value !== void 0) projection[key] = field.value;
	}
	return Object.keys(projection).length > 0 ? projection : void 0;
}
function modelGatewayCompatViewFrom(namespace, item, compatibilityProfile = "unknown", takeoverRuntime) {
	const descriptor = record$2(namespace);
	const sourceConflict = hasLayeredModelSourceConflict(namespace, item.route);
	const userModel = sourceConflict ? void 0 : modelLayerCompat(descriptor?.user, item.route, item.model);
	const userProvider = layerCompat(descriptor?.user, item.route);
	const baseModel = sourceConflict ? void 0 : modelLayerCompat(descriptor?.base, item.route, item.model);
	const baseProvider = layerCompat(descriptor?.base, item.route);
	const catalogProfile = record$2(record$2(record$2(descriptor?.value)?.providers)?.[item.route]);
	const catalogModel = sourceConflict || hasModelSourceConflict(catalogProfile) ? void 0 : record$2(item.raw?.compat) ?? modelLayerCompat(descriptor?.value, item.route, item.model);
	const catalogProvider = layerCompat(descriptor?.value, item.route);
	const modelSelection = userModel;
	const runtimeModel = modelRuntimeCompatFor(takeoverRuntime, item.route, item.model);
	const editability = editableProviderCompatFields(compatibilityProfile, descriptor?.schema, routeApi(namespace, item.route));
	return resolveModelGatewayCompat({
		provider: item.route,
		model: item.model,
		modelCompat: modelSelection,
		providerCompat: userProvider,
		baseCompat: [baseModel, baseProvider],
		catalogCompat: [catalogModel, catalogProvider],
		protocolDefault: protocolCompatFrom(runtimeModel)
	}, editability);
}
function modelCompatKey(route, model) {
	return JSON.stringify([route, model]);
}
function modelGatewayCompatViewsFrom(namespace, inventory, compatibilityProfile = "unknown", takeoverRuntime) {
	return Object.fromEntries(inventory.flatMap((item) => {
		if (hasLayeredModelSourceConflict(namespace, item.route)) return [];
		return [[modelCompatKey(item.route, item.model), modelGatewayCompatViewFrom(namespace, item, compatibilityProfile, takeoverRuntime)]];
	}));
}
function takeoverCompatFor(runtime, provider) {
	if (runtime === void 0 || !runtime.providers.includes(provider)) return void 0;
	return runtime.compat.find((resolution) => resolution.provider === provider && resolution.model === void 0);
}
function providerGatewayCompatViewFrom(namespace, provider, compatibilityProfile = "unknown", takeoverRuntime) {
	const descriptor = record$2(namespace);
	const user = layerCompat(descriptor?.user, provider);
	const base = layerCompat(descriptor?.base, provider);
	const value = layerCompat(descriptor?.value, provider);
	const runtime = takeoverCompatFor(takeoverRuntime, provider);
	const api = routeApi(namespace, provider);
	const editability = editableProviderCompatFields(compatibilityProfile, descriptor?.schema, api);
	const out = { ...resolveProviderGatewayCompat({
		provider,
		providerCompat: user,
		baseCompat: base,
		catalogCompat: value,
		protocolDefault: protocolCompatFrom(runtime)
	}, editability) };
	for (const key of GATEWAY_COMPAT_FIELD_KEYS) out[`${key}Available`] = editability[key] === true;
	return out;
}
function providerGatewayCompatViewsFrom(namespace, compatibilityProfile = "unknown", takeoverRuntime) {
	const providers = record$2(record$2(record$2(namespace)?.value)?.providers);
	if (!providers) return {};
	return Object.fromEntries(Object.keys(providers).map((provider) => [provider, providerGatewayCompatViewFrom(namespace, provider, compatibilityProfile, takeoverRuntime)]));
}
function inventoryFrom(namespace) {
	const providers = record$2(record$2(record$2(namespace)?.value)?.providers);
	if (!providers) return [];
	const inventory = [];
	for (const [route, profileValue] of Object.entries(providers)) {
		const profile = record$2(profileValue);
		if (!profile) continue;
		const modelSourceConflict = hasLayeredModelSourceConflict(namespace, route);
		if (Array.isArray(profile.models)) {
			const modelsSnapshot = ownedData(profile.models);
			profile.models.forEach((entry, index) => {
				const raw = record$2(entry);
				const model = typeof raw?.id === "string" ? raw.id : void 0;
				if (raw && model !== void 0) inventory.push(modelItem(route, model, raw, index, false, modelsSnapshot, modelSourceConflict));
			});
		}
		const overrides = record$2(profile.modelOverrides);
		if (overrides) for (const [model, entry] of Object.entries(overrides)) inventory.push(modelItem(route, model, record$2(entry) ?? {}, -1, true, void 0, modelSourceConflict));
	}
	return inventory;
}
//#endregion
//#region packages/settings-ui/src/client/model-header-ops.ts
function record$1(value) {
	return isUnknownRecord(value) ? value : void 0;
}
function ownRecord$1(value, key) {
	const object = record$1(value);
	if (object === void 0 || !Object.prototype.hasOwnProperty.call(object, key)) return void 0;
	return record$1(object[key]);
}
function validSettingsValue(value) {
	const providers = ownRecord$1(ownRecord$1(value, "opencodeSession"), "providers");
	if (providers === void 0) return false;
	for (const provider of Object.values(providers)) {
		const models = ownRecord$1(provider, "models");
		if (models === void 0) return false;
		if (Object.values(models).some((enabled) => typeof enabled !== "boolean")) return false;
	}
	return true;
}
function isOpenCodeSessionNamespace(value) {
	const namespace = record$1(value);
	return namespace !== void 0 && isOpenCodeSessionSectionId(namespace.ns) && typeof namespace.revision === "number" && Number.isSafeInteger(namespace.revision) && namespace.revision >= 0 && validSettingsValue(namespace.value);
}
function openCodeSessionKey(item) {
	return JSON.stringify([item.route, item.model]);
}
function openCodeSessionView(namespace, item) {
	if (!isOpenCodeSessionNamespace(namespace)) return false;
	return isOpenCodeSessionEnabled(namespace.value, item.route, item.model);
}
function openCodeSessionOp(provider, model, enabled) {
	const path = modelPath(provider, model);
	if (path === void 0) return void 0;
	return enabled ? {
		op: "set",
		path,
		value: true
	} : {
		op: "unset",
		path
	};
}
function openCodeSessionStateFor(namespace, inventory, previous) {
	if (!isOpenCodeSessionNamespace(namespace)) return {
		namespace: null,
		views: {},
		drafts: {},
		dirty: {},
		found: namespace !== void 0,
		available: false
	};
	const views = {};
	const drafts = {};
	const dirty = {};
	for (const item of inventory) {
		const key = openCodeSessionKey(item);
		const view = openCodeSessionView(namespace, item);
		views[key] = view;
		if (previous?.dirty[key] === true && previous.drafts[key] !== void 0) {
			drafts[key] = previous.drafts[key];
			dirty[key] = true;
		} else drafts[key] = view;
	}
	return {
		namespace,
		views,
		drafts,
		dirty,
		found: true,
		available: true
	};
}
//#endregion
//#region packages/settings-ui/src/client/model-ops.ts
function cloneOwned(value) {
	if (Array.isArray(value)) return value.map((entry) => cloneOwned(entry));
	if (typeof value !== "object" || value === null) return value;
	const copy = {};
	for (const [key, entry] of Object.entries(value)) Object.defineProperty(copy, key, {
		configurable: true,
		enumerable: true,
		value: cloneOwned(entry),
		writable: true
	});
	return copy;
}
function mergeModelUpdate(raw, update) {
	const next = { ...raw };
	if (update.levels !== void 0) next.reasoningEfforts = update.levels;
	if (update.contextWindowTouched === true) {
		if (update.contextWindow === void 0) delete next.contextWindow;
		else next.contextWindow = update.contextWindow;
	}
	if (update.inputTouched === true) {
		if (update.input === void 0) delete next.input;
		else next.input = update.input;
	}
	return next;
}
function setOps(inventory, updates) {
	const groups = /* @__PURE__ */ new Map();
	for (const update of updates) {
		const { item } = update;
		if (!item) continue;
		const type = item.inOverrides ? "modelOverrides" : "models";
		const key = `${item.route}\u0000${type}`;
		const group = groups.get(key) ?? {
			route: item.route,
			type,
			updates: []
		};
		group.updates.push(update);
		groups.set(key, group);
	}
	return [...groups.values()].map((group) => {
		const candidates = inventory.filter((candidate) => candidate.route === group.route && (group.type === "modelOverrides" ? candidate.inOverrides : !candidate.inOverrides));
		if (group.type === "modelOverrides") {
			const overrides = Object.fromEntries(candidates.map((candidate) => [candidate.model, { ...candidate.raw }]));
			for (const update of group.updates) {
				const model = update.item.model;
				const current = Object.prototype.hasOwnProperty.call(overrides, model) ? overrides[model] : {};
				Object.defineProperty(overrides, model, {
					configurable: true,
					enumerable: true,
					value: mergeModelUpdate(current, update),
					writable: true
				});
			}
			return {
				op: "set",
				path: [
					"providers",
					group.route,
					"modelOverrides"
				],
				value: overrides
			};
		}
		const snapshot = group.updates.find((update) => update.item.modelsSnapshot !== void 0)?.item.modelsSnapshot;
		const models = snapshot !== void 0 ? snapshot.map((entry, index) => {
			const raw = isUnknownRecord(entry) ? entry : void 0;
			const update = raw?.id === void 0 ? void 0 : group.updates.find((candidate) => candidate.item.index === index && candidate.item.model === raw.id);
			return update ? mergeModelUpdate({ ...raw }, update) : cloneOwned(entry);
		}) : [...candidates].sort((a, b) => a.index - b.index).map((candidate) => {
			const update = group.updates.find((entry) => entry.item.index === candidate.index && entry.item.model === candidate.model);
			return update ? mergeModelUpdate({ ...candidate.raw }, update) : { ...candidate.raw };
		});
		return {
			op: "set",
			path: [
				"providers",
				group.route,
				"models"
			],
			value: models
		};
	});
}
//#endregion
//#region packages/settings-ui/src/client/subagent-section.ts
/**
* The plugin's own settings section when the running host publishes one.
*
* Under the 0.1.7 entry-config model a Loader entry owns exactly one section,
* addressed by the entry id, and every plugin setting — the OpenCode session
* fields, the config snapshots and `subagentEffort` — lives in it. Legacy
* releases register the `dsh-thinking-effort` namespace instead and never
* publish an entry id, so this returns `undefined` there and callers keep the
* `llm-pi-ai` path.
*/
function pluginEntrySection(namespaces) {
	return namespaces.find((entry) => entry.ns === PLUGIN_ENTRY_ID);
}
/**
* The one section this plugin's configuration lives in under whichever model
* the running host exposes.
*
* The Client cannot detect the model itself: its settings bridge exposes only
* `describe`/`mutate`, so `settingsModelOf` always answers `entry-config`
* there. The published section ids are the only discriminator, so they are
* read once here rather than as an `ns === …` comparison at every call site:
* the entry section when the host published one (0.1.7 and later), and the
* registered `dsh-thinking-effort` namespace otherwise (rc.7 … 0.1.6), which
* is also the answer when neither exists — a missing section reads as
* unconfigured either way.
*/
function pluginSection(namespaces) {
	return pluginEntrySection(namespaces) ?? namespaces.find((entry) => entry.ns === OPENCODE_SESSION_NAMESPACE);
}
/** The id of `pluginSection`, resolved the same way and falling back to the legacy namespace id. */
function pluginSectionId(namespaces) {
	return pluginSection(namespaces)?.ns ?? OPENCODE_SESSION_NAMESPACE;
}
/**
* Whether `section` is the plugin's own Loader entry section — the one the
* 0.1.7 entry-config model derives from this plugin's exported `Config`.
*
* The published section id is the only discriminator the Client has, so this is
* the one place that compares it. Callers hold the plugin's section in a single
* field and ask this when the answer decides where a setting is written: a
* section that is not the entry section is the legacy registered namespace, and
* `subagentEffort` may only be written into the entry section.
*/
function isPluginEntrySection(section) {
	return section !== null && section !== void 0 && section.ns === "thinking-effort";
}
/**
* Where a `subagentEffort` write goes. Entry-config hosts store it in the
* plugin's own section; legacy hosts keep writing the `llm-pi-ai` section they
* already hold, so an existing user's setting stays where that host reads it.
*/
function subagentEffortTarget(ownSection, legacyRevision) {
	if (ownSection === null || ownSection === void 0) return {
		ns: NS,
		revision: legacyRevision,
		ownSection: false
	};
	return {
		ns: ownSection.ns,
		revision: typeof ownSection.revision === "number" ? ownSection.revision : 0,
		ownSection: true
	};
}
//#endregion
//#region packages/settings-ui/src/client/validation.ts
function draftFrom(levels) {
	const draft = {};
	for (const level of ALL_LEVELS) {
		const value = levels?.[level];
		const wire = value === void 0 ? "" : value === null ? "" : String(value);
		draft[level] = {
			on: wire !== "" || level === "off" && levels?.off === null,
			wire
		};
	}
	return draft;
}
function buildLevels(draft) {
	const output = {};
	for (const level of ALL_LEVELS) {
		const cell = draft[level];
		if (!cell?.on) continue;
		output[level] = level === "off" ? cell.wire.trim() === "" ? null : cell.wire.trim() : cell.wire.trim();
	}
	return output;
}
function contextDraftFrom(item) {
	const contextWindow = Number.isInteger(item.contextWindow) ? item.contextWindow : void 0;
	const value = contextWindow === void 0 ? "" : String(contextWindow);
	return {
		value,
		oneMillion: contextWindow === CONTEXT_1M,
		previousValue: contextWindow === 1e6 ? "" : value,
		touched: false
	};
}
function inputDraftFrom(item) {
	const declared = Array.isArray(item.input) ? item.input : [];
	const effective = declared.length > 0 ? declared : ["text"];
	return {
		text: effective.includes("text"),
		image: effective.includes("image"),
		touched: false
	};
}
function buildInput(draft, translate) {
	if (!draft) return { value: void 0 };
	const value = INPUT_MODALITIES.filter((modality) => draft[modality] === true);
	return value.length === 0 ? { error: translate("inputCapabilityMinimum") } : { value };
}
function validateContextWindow(draft, translate) {
	if (!draft) return { value: void 0 };
	if (draft.oneMillion) return { value: CONTEXT_1M };
	const raw = typeof draft.value === "string" ? draft.value.trim().toLowerCase() : "";
	if (raw === "") return { value: void 0 };
	const kSuffix = /^(\d+)\s*k$/.exec(raw);
	if (kSuffix === null && !/^\d+$/.test(raw)) return { error: translate("contextInteger") };
	const value = kSuffix === null ? Number(raw) : Number(kSuffix[1]) * 1024;
	if (!Number.isSafeInteger(value) || value < 2e3 || value > 1e6) return { error: translate("contextRange") };
	return { value };
}
function validateLevels(levels, translate) {
	let hasThinking = false;
	for (const [level, wire] of Object.entries(levels)) {
		if (level === "off") continue;
		hasThinking = true;
		if (typeof wire !== "string" || wire.length === 0) return translate("levelNeedsValue", { level: translate(LEVEL_LABEL_KEYS[level] ?? level) });
	}
	return hasThinking ? null : translate("atLeastThinking");
}
/**
* Why one model's editor cannot be saved, or `null` when it can.
*
* The write path and the Save button's affordance must agree on this: the
* button is disabled on exactly the condition the write would refuse, so the
* refusal is visible where the user is looking instead of only in the
* page-top banner. Both read this one function rather than restating the
* order of the checks, which is also the order the errors are reported in.
*
* Only a TOUCHED context or input draft is validated, matching the write path:
* an untouched field means "leave the stored value alone", so its placeholder
* value is not a refusal.
*/
function modelSaveBlockedReason(levels, contextDraft, inputDraft, translate) {
	const levelError = validateLevels(levels, translate);
	if (levelError !== null) return levelError;
	if (contextDraft?.touched === true) {
		const context = validateContextWindow(contextDraft, translate);
		if (context.error !== void 0) return context.error;
	}
	if (inputDraft?.touched === true) {
		const input = buildInput(inputDraft, translate);
		if (input.error !== void 0) return input.error;
	}
	return null;
}
//#endregion
//#region packages/settings-ui/src/client/section-editor/state.ts
const initialState$2 = {
	loading: true,
	namespace: null,
	openCodeSessionReads: 0,
	openCodeSessionViews: {},
	openCodeSessionDrafts: {},
	openCodeSessionDirty: {},
	openCodeSessionFound: false,
	openCodeSessionAvailable: false,
	inventory: [],
	providerViews: {},
	providerDrafts: {},
	providerDirty: {},
	providerCompatDirty: {},
	providerCompatExpanded: {},
	modelCompatViews: {},
	modelCompatDrafts: {},
	modelCompatDirty: {},
	modelCompatExpanded: {},
	revision: 0,
	expanded: {},
	expandedProviders: {},
	drafts: {},
	contextDrafts: {},
	inputDrafts: {},
	compactionDrafts: {},
	dirty: {},
	busy: false,
	error: null,
	notice: null,
	query: "",
	nsFound: true,
	pluginSection: null,
	subagent: null,
	subagentDraft: "default",
	subagentCustom: "",
	subagentModelDraft: {
		provider: "",
		model: "",
		touched: false
	},
	quickSettingsOpen: false
};
/** One model's row key: the same identity the inventory and the ops use. */
function keyOf(item) {
	return modelCompatKey(item.route, item.model);
}
/**
* The plugin's compaction policy as the panel edits it.
*
* The resolved `value` layer is authoritative when the host publishes it — it is
* the schema defaults merged with the user document, so it already reflects every
* write this panel makes. A section carrying no `compaction` there is the
* legacy/unresolved case, where the raw user layer is the only source.
*/
function compactionPolicyOf(section) {
	const resolved = compactionPolicyFrom(section?.value?.compaction);
	if (isUnknownRecord(section?.value?.compaction)) return resolved;
	return compactionPolicyFrom(section?.user?.compaction);
}
/**
* The percent text the model editor shows for one route.
*
* An unset override renders as an EMPTY field rather than as the inherited
* number: writing the inherited value into the input would silently convert
* "follow the global setting" into a pinned per-model override the moment the
* user saved an unrelated field.
*/
function compactionDraftFrom(policy, route, model) {
	const override = policy.models[route]?.[model];
	return {
		threshold: override?.thresholdRatio === void 0 ? "" : formatRatioPercent(override.thresholdRatio),
		retain: override?.retainRatio === void 0 ? "" : formatRatioPercent(override.retainRatio),
		touched: false
	};
}
/**
* Rebuild the per-model compaction drafts from a freshly read section.
*
* An untouched draft is replaced outright so a re-read shows what the document
* now holds; a touched one is kept, because it is the user's unsaved edit and a
* refresh (a sibling save, another window's write) must not silently discard it.
* Drafts for models that left the inventory are dropped: their key addresses a
* route the panel can no longer render, and keeping it would resurrect the row's
* pending state if the same model ever came back under different settings.
*/
function compactionDraftsFor(current, policy, inventory) {
	const next = {};
	for (const item of inventory) {
		const key = keyOf(item);
		const existing = current.compactionDrafts[key];
		next[key] = existing !== void 0 && existing.touched ? existing : compactionDraftFrom(policy, item.route, item.model);
	}
	return next;
}
/**
* Read the stored subagent default route into the picker's draft.
*
* An untouched draft follows the document; a touched one survives the re-read.
* A cleared pair arrives as either absent fields or empty strings — the schema
* defaults both to `''` — so both spell "inherit".
*/
function subagentModelDraftFor(current, namespace) {
	if (current.subagentModelDraft.touched) return current.subagentModelDraft;
	const stored = isUnknownRecord(namespace?.value?.subagentModel) ? namespace.value.subagentModel : namespace?.user?.subagentModel;
	return {
		provider: isUnknownRecord(stored) && typeof stored.provider === "string" ? stored.provider : "",
		model: isUnknownRecord(stored) && typeof stored.model === "string" ? stored.model : "",
		touched: false
	};
}
/**
* Re-point a model update at the same model in a freshly read inventory.
*
* The model-level ops carry a whole `models` array (or `modelOverrides` dict)
* rebuilt from this panel's inventory. Replaying that container unchanged after
* a conflict would write the stale copy over the document and silently drop
* whatever another writer did meanwhile — an edit to a sibling model, or a
* model the Host's own default-levels fill had just added. Rebuilding from the
* fresh inventory is what makes the retry additive instead of destructive.
*
* An update whose model is gone is dropped rather than resurrected: there is
* nothing left to write to, and re-adding it would undo the deletion.
*/
function rebaseItem(fresh, item) {
	return fresh.find((candidate) => candidate.route === item.route && candidate.model === item.model && candidate.inOverrides === item.inOverrides);
}
/** Re-point model updates at the same models in a freshly read inventory. */
function rebaseUpdates(fresh, updates) {
	return updates.flatMap((update) => {
		const item = rebaseItem(fresh, update.item);
		return item === void 0 ? [] : [{
			...update,
			item
		}];
	});
}
/**
* How many compat fields a view offers beyond the two rendered inline.
*
* The props pass this count to the "more fields" disclosure, so it has to match
* the fields that disclosure actually renders: the two inline ones are excluded
* because they already have their own controls above it.
*/
function availableCompatFieldCount(view) {
	const values = view;
	return GATEWAY_COMPAT_FIELD_KEYS.filter((key) => key !== "supportsDeveloperRole" && key !== "maxTokensField" && values[`${key}Available`] === true).length;
}
/** Drop `fields` from one key's dirty map, and the key itself once it states nothing. */
function removeDirtyFields(dirty, key, fields) {
	const next = { ...dirty };
	const entry = { ...next[key] ?? {} };
	fields.forEach((field) => {
		delete entry[field];
	});
	if (Object.keys(entry).length === 0) delete next[key];
	else next[key] = entry;
	return next;
}
/**
* Collapsing a row leaves the OpenCode toggle's draft alone.
*
* The toggle saves immediately, so its draft always equals the persisted
* namespace value; clearing it here would make the reopened row render a blank
* switch until the next read.
*/
function clearOpenCodeSessionState(current, _key) {
	return current;
}
/**
* Collapse one model's row editor, keeping the OpenCode toggle's draft.
*
* The OpenCode Header toggle saves immediately, so its draft always equals the
* persisted namespace value. Collapsing the editor must not clear it; reopening
* renders the saved value.
*/
function clearModelEditorState(current, key) {
	const expanded = { ...clearOpenCodeSessionState(current, key).expanded };
	delete expanded[key];
	const drafts = { ...current.drafts };
	delete drafts[key];
	const contextDrafts = { ...current.contextDrafts };
	delete contextDrafts[key];
	const inputDrafts = { ...current.inputDrafts };
	delete inputDrafts[key];
	const dirty = { ...current.dirty };
	delete dirty[key];
	return {
		...current,
		expanded,
		drafts,
		contextDrafts,
		inputDrafts,
		dirty
	};
}
/**
* The section whose `user` layer holds `subagentEffort`: the plugin's own entry
* section when the host publishes one (0.1.7 and later), else the `llm-pi-ai`
* section the releases before it wrote the value into. `null` while the model
* registry itself is missing, which is the state the editor already reports as
* "unconfigured": the setting is only meaningful beside the models it applies
* to, and `nsFound` hides the rest of the page in exactly that case.
*/
function subagentSection(pluginSection, llmSection) {
	return isPluginEntrySection(pluginSection) && llmSection !== null ? pluginSection : llmSection;
}
/** The OpenCode session state the editor holds, in the shape its merge helpers take. */
function openCodeStateOf(current) {
	return {
		namespace: isOpenCodeSessionNamespace(current.pluginSection) ? current.pluginSection : null,
		views: current.openCodeSessionViews,
		drafts: current.openCodeSessionDrafts,
		dirty: current.openCodeSessionDirty,
		found: current.openCodeSessionFound,
		available: current.openCodeSessionAvailable
	};
}
//#endregion
//#region packages/settings-ui/src/client/section-editor/open-code-session.ts
/**
* Project a section descriptor onto the OpenCode session toggle views.
*
* `previous` carries the drafts the panel already holds, so an edit that has not
* been saved yet survives the read that resolved a different stored value.
*/
function createOpenCodeSessionState(namespace, inventory, previous) {
	return openCodeSessionStateFor(namespace, inventory, previous);
}
/**
* Merge one accepted mutation's descriptor back into the toggle views.
*
* A refusal and a malformed descriptor both leave the state untouched: the
* toggle's draft was already set optimistically by the caller, and only an
* accepted write has anything to project.
*/
function applyOpenCodeSessionMutation(state, response, inventory, savedKey) {
	if (!response.ok || !isOpenCodeSessionNamespace(response.value)) return state;
	const previous = {
		...state,
		dirty: { ...state.dirty }
	};
	if (savedKey !== void 0) delete previous.dirty[savedKey];
	return openCodeSessionStateFor(response.value, inventory, previous);
}
//#endregion
//#region packages/settings-ui/src/client/section-editor/subagent.ts
/**
* Project a section descriptor onto the subagent default-effort card.
*
* An absent `subagentEffort` reads as "follow the model default" (`'default'`),
* a value naming one of the shipped levels selects it, and anything else is a
* custom wire spelling the card edits as free text — the same three states the
* card renders.
*/
function subagentView(namespace) {
	if (!namespace) return {
		subagent: null,
		draft: "default",
		custom: "",
		revision: 0
	};
	const revision = revisionOf(namespace);
	const user = namespace.user ?? {};
	const effort = typeof user.subagentEffort === "string" && user.subagentEffort.length > 0 ? user.subagentEffort : null;
	const draft = effort === null ? "default" : ALL_LEVELS.includes(effort) ? effort : "custom";
	return {
		subagent: {
			effort,
			revision
		},
		draft,
		custom: draft === "custom" ? effort ?? "" : "",
		revision
	};
}
/**
* The op one subagent-card draft resolves to.
*
* `'default'` unsets the field so the card follows inheritance again; a custom
* entry trims its text because the wire spelling is matched verbatim. An empty
* custom entry yields `undefined` and the caller reports it — writing `''` would
* store a value no model can map.
*/
function subagentEffortOp(draft, custom) {
	if (draft === "default") return {
		op: "unset",
		path: ["subagentEffort"]
	};
	const value = draft === "custom" ? custom.trim() : draft;
	if (!value) return void 0;
	return {
		op: "set",
		path: ["subagentEffort"],
		value
	};
}
//#endregion
//#region packages/settings-ui/src/client/section-editor/views.ts
/**
* The gateway-compat views and drafts a section read produces.
*
* A draft that the panel has marked dirty keeps its edited value: the re-read
* resolved a different one, and silently overwriting the edit is what the dirty
* map exists to prevent. Every other draft follows the read.
*/
function compatViewsOf(namespace, inventory, profile, takeoverResolution, current) {
	const providerViews = providerGatewayCompatViewsFrom(namespace, profile, takeoverResolution);
	const providerDrafts = { ...current.providerDrafts };
	for (const [provider, providerView] of Object.entries(providerViews)) if (current.providerDirty[provider] !== true) providerDrafts[provider] = providerView;
	const modelCompatViews = modelGatewayCompatViewsFrom(namespace, inventory, profile, takeoverResolution);
	const modelCompatDrafts = { ...current.modelCompatDrafts };
	for (const item of inventory) {
		const key = keyOf(item);
		const view = modelCompatViews[key];
		if (view === void 0) continue;
		const dirty = current.modelCompatDirty[key];
		const draft = modelCompatDrafts[key];
		if (!dirty) {
			modelCompatDrafts[key] = view;
			continue;
		}
		if (!draft) continue;
		const preserved = { ...view };
		for (const field of GATEWAY_COMPAT_FIELD_KEYS) if (dirty[field] === true) Object.assign(preserved, { [field]: draft[field] });
		modelCompatDrafts[key] = preserved;
	}
	return {
		providerViews,
		providerDrafts,
		modelCompatViews,
		modelCompatDrafts
	};
}
/**
* Project a freshly read `llm-pi-ai` section onto the editor state.
*
* `notice` is the success message to surface once the read lands, and
* `pluginSection` is the descriptor of the plugin's own section from the same
* `describe` — the two are read together because one description answers both.
*/
function applyNamespaceView(current, nextNamespace, notice, pluginSection, profile, takeoverResolution) {
	const view = subagentView(subagentSection(pluginSection, nextNamespace));
	const nextInventory = inventoryFrom(nextNamespace);
	const compat = compatViewsOf(nextNamespace, nextInventory, profile, takeoverResolution, current);
	const ownSection = pluginSection ?? current.pluginSection;
	return {
		...current,
		loading: false,
		namespace: nextNamespace,
		busy: false,
		nsFound: true,
		pluginSection,
		inventory: nextInventory,
		...compat,
		compactionDrafts: compactionDraftsFor(current, compactionPolicyOf(ownSection), nextInventory),
		revision: revisionOf(nextNamespace),
		subagent: view.subagent,
		subagentDraft: view.draft,
		subagentCustom: view.custom,
		subagentModelDraft: subagentModelDraftFor(current, ownSection),
		notice
	};
}
/**
* Refresh every view of the plugin's one section from a single descriptor.
*
* `subagentEffort` and the OpenCode session fields live in the same section
* under the 0.1.7 entry-config model, so one write to either returns the
* descriptor that supersedes what the editor holds for both — and the revision
* in it is the `expectedRevision` the NEXT write to that section has to send.
* Revisions are per section there, so a view left on the pre-write copy made the
* second of any two such writes fail as a conflict. Every write whose response
* targets this section lands here; `savedKey` names the OpenCode toggle just
* persisted, whose draft is no longer dirty.
*/
function applyPluginSectionView(current, section, notice, savedKey) {
	const previous = openCodeStateOf(current);
	const refreshed = section === null ? createOpenCodeSessionState(void 0, current.inventory, previous) : applyOpenCodeSessionMutation(previous, {
		ok: true,
		value: section
	}, current.inventory, savedKey);
	const ownSection = section ?? current.pluginSection;
	const view = subagentView(subagentSection(section, current.namespace));
	return {
		...current,
		busy: false,
		pluginSection: section,
		openCodeSessionReads: current.openCodeSessionReads + 1,
		openCodeSessionViews: refreshed.views,
		openCodeSessionDrafts: refreshed.drafts,
		openCodeSessionDirty: refreshed.dirty,
		openCodeSessionFound: refreshed.found,
		openCodeSessionAvailable: refreshed.available,
		compactionDrafts: compactionDraftsFor(current, compactionPolicyOf(ownSection), current.inventory),
		subagent: view.subagent,
		subagentDraft: view.draft,
		subagentCustom: view.custom,
		subagentModelDraft: subagentModelDraftFor(current, ownSection),
		notice
	};
}
/**
* Recompute only the compat views and drafts, for a runtime snapshot change
* that leaves the sections themselves unchanged.
*/
function reapplyCompatViews(current, profile, takeoverResolution) {
	if (current.namespace === null) return current;
	const compat = compatViewsOf(current.namespace, current.inventory, profile, takeoverResolution, current);
	return {
		...current,
		...compat
	};
}
//#endregion
//#region packages/settings-ui/src/client/compaction-section.ts
/**
* Client-side plumbing for the plugin's own compaction policy.
*
* The model editor edits `compaction.models[provider][model]`, which is a leaf
* of the plugin's entry section — NOT part of the `providers[route].models`
* array the rest of the editor rewrites as a whole. That difference is why the
* policy needs its own helpers: a leaf write can be replayed verbatim after a
* conflict, while a container write has to be rebuilt from a fresh inventory
* (see `model-ops.ts`).
*
* The ratio vocabulary itself lives in `src/shared/compaction.ts`; nothing here
* restates a limit, a default, or a parse rule.
*/
/**
* Resolve one draft against the policy and validate the resulting pair.
*
* Empty text means "follow the global ratio", so the effective pair is the mix
* of typed and inherited values. Validating the EFFECTIVE pair — not just the
* two typed fields — is what stops a user from pinning a retain ratio that only
* exceeds the threshold through the inherited half: the official backend
* refuses such a pair at load time, which would make the preset unloadable.
*
* @param policy - the resolved plugin policy.
* @param route - provider id.
* @param model - exact model id.
* @param draft - the editable percent strings.
* @returns the override to write, `value: undefined` meaning "remove it", or a
*   `ratioProblem` code naming what is wrong.
*/
function checkCompactionDraft(policy, route, model, draft) {
	const thresholdText = draft.threshold.trim();
	const retainText = draft.retain.trim();
	const thresholdTyped = thresholdText.length === 0 ? void 0 : parseRatioInput(thresholdText);
	const retainTyped = retainText.length === 0 ? void 0 : parseRatioInput(retainText);
	if (thresholdText.length > 0 && thresholdTyped === void 0) return {
		ok: false,
		problem: "threshold-ratio-not-a-number"
	};
	if (retainText.length > 0 && retainTyped === void 0) return {
		ok: false,
		problem: "retain-ratio-not-a-number"
	};
	const problem = ratioProblem(thresholdTyped ?? policy.thresholdRatio, retainTyped ?? policy.retainRatio);
	if (problem !== void 0) return {
		ok: false,
		problem
	};
	const value = {};
	if (thresholdTyped !== void 0) value.thresholdRatio = thresholdTyped;
	if (retainTyped !== void 0) value.retainRatio = retainTyped;
	return {
		ok: true,
		value: thresholdTyped === void 0 && retainTyped === void 0 ? void 0 : value
	};
}
/**
* The settings ops that persist one accepted draft.
*
* Clearing is an `unset` of the whole override rather than a `set` of empty
* fields, because the stored shape has no way to say "inherit this one ratio":
* a written `thresholdRatio` is always an override, and the schema cannot carry
* a `null` that would mean otherwise.
*
* @param route - provider id.
* @param model - exact model id.
* @param check - an accepted `checkCompactionDraft` result.
* @returns one op, safe to replay verbatim after a conflict.
*/
function compactionOps(route, model, check) {
	const path = [
		"compaction",
		"models",
		route,
		model
	];
	return check.value === void 0 ? [{
		op: "unset",
		path
	}] : [{
		op: "set",
		path,
		value: check.value
	}];
}
const COMPACTION_PROBLEM_KEYS = {
	"threshold-ratio-not-a-number": "compactionInvalidThreshold",
	"threshold-ratio-out-of-range": "compactionInvalidThreshold",
	"retain-ratio-not-a-number": "compactionInvalidRetain",
	"retain-ratio-out-of-range": "compactionInvalidRetain",
	"retain-ratio-not-below-threshold": "compactionRetainNotBelow"
};
/**
* The user-facing sentence for one `ratioProblem` code.
*
* @param problem - a code returned by `ratioProblem` or by the draft check.
* @param t - the active translation.
* @returns the localized reason, falling back to the threshold copy.
*/
function compactionProblemText(problem, t) {
	return t(COMPACTION_PROBLEM_KEYS[problem] ?? "compactionInvalidThreshold");
}
//#endregion
//#region packages/settings-ui/src/client/section-editor/use-save-queue.ts
/**
* The write queue every save in the settings panel goes through.
*
* It is a hook rather than a plain helper because it closes over the live
* `settings` service and the panel's own state setters, and because the form
* lookup has to run per write — the service can activate after this plugin's
* `apply`, since client entries are created concurrently.
*
* Two transports exist and they are NOT interchangeable. When the host
* publishes a write-capable config form, the form owns a serialized queue, a
* revision fence and a post-refusal re-read, so the panel hands the ops over
* and reloads on success — the form's `mutate` answers a bare boolean and
* carries no descriptor. Otherwise the panel writes through
* `settings.mutate` itself and projects the returned descriptor.
*/
function useSaveQueue({ settings, t, onAccepted, reload, setBusy, setError }) {
	/**
	* Re-read one section as the document now stands, so a write refused as stale
	* can be retried against it.
	*
	* `undefined` means the section could not be re-read; the caller then reports
	* the original conflict rather than writing without a revision, because a
	* write that cannot establish the current state has no business bypassing the
	* check that exists to protect it.
	*/
	const latestSection = (target) => settings.describe().then((response) => {
		if (!response.ok) return void 0;
		return response.value.namespaces.find((entry) => entry.ns === target);
	}).catch(() => void 0);
	/**
	* The official write queue for one section, when this host publishes one.
	*
	* Only a WRITE-CAPABLE form is served. An absent revision would make the host
	* read the write as unconditional, and a memory-mode form (off-loopback)
	* answers every mutation with `false` — in both cases the hand-rolled
	* transport is the better answer, so those forms are ignored rather than
	* allowed to swallow a save.
	*/
	const formForWrite = (target) => {
		const form = settings.formFor?.(target);
		if (form === void 0) return void 0;
		const snapshot = form.getSnapshot();
		return snapshot.writable === true && typeof snapshot.revision === "number" ? form : void 0;
	};
	return react.default.useCallback((request) => {
		const { ns, revision, ops, rebuildOps, successMessage, onSuccess, openCodeSessionSavedKey, entrySectionWrite } = request;
		const writeError = (message) => isOpenCodeSessionSectionId(ns) && entrySectionWrite !== true ? t("opencodeSessionSaveFailed", { message }) : t("writeError", { message });
		setBusy();
		const succeed = (value) => {
			if (!value || typeof value !== "object") {
				setError(t("saveMissingNamespace"));
				return;
			}
			if (ns !== "llm-pi-ai" && entrySectionWrite !== true && (openCodeSessionSavedKey === void 0 || !isOpenCodeSessionNamespace(value))) {
				setError(t("saveMissingNamespace"));
				return;
			}
			onSuccess?.();
			onAccepted(request, value);
		};
		const writeOnce = async (writeOps, expectedRevision) => {
			try {
				const response = await settings.mutate(ns, writeOps, expectedRevision);
				return response.ok ? {
					ok: true,
					value: response.value
				} : {
					ok: false,
					message: response.error.message,
					conflict: isSettingsConflict(response.error),
					threw: false
				};
			} catch (error) {
				return {
					ok: false,
					message: error instanceof Error ? error.message : String(error),
					conflict: isSettingsConflict(error),
					threw: true
				};
			}
		};
		const run = async () => {
			const form = formForWrite(ns);
			if (form !== void 0) {
				if (await form.mutate(ops)) {
					onSuccess?.();
					reload(successMessage);
					return;
				}
				if (rebuildOps !== void 0) {
					const fresh = await latestSection(ns);
					if (fresh !== void 0) {
						const rebuilt = rebuildOps(fresh);
						if (rebuilt.length > 0 && await form.mutate(rebuilt, revisionOf(fresh))) {
							onSuccess?.();
							reload(successMessage);
							return;
						}
					}
				}
				setError(writeError(t("writeFailed")));
				return;
			}
			let outcome = await writeOnce(ops, revision);
			if (!outcome.ok && outcome.conflict && rebuildOps !== void 0) {
				const fresh = await latestSection(ns);
				if (fresh !== void 0) {
					const freshRevision = revisionOf(fresh);
					if (freshRevision !== revision) {
						const rebuilt = rebuildOps(fresh);
						if (rebuilt.length > 0) outcome = await writeOnce(rebuilt, freshRevision);
					}
				}
			}
			if (outcome.ok) {
				succeed(outcome.value);
				return;
			}
			const message = outcome.message;
			setError(outcome.threw && message.length === 0 ? t("writeFailed") : writeError(message));
		};
		run().catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			setError(message.length > 0 ? writeError(message) : t("writeFailed"));
		});
	}, [
		settings,
		t,
		onAccepted,
		reload,
		setBusy,
		setError
	]);
}
//#endregion
//#region packages/settings-ui/src/client/theme.ts
function isDark(environment) {
	if (environment?.backgroundColor !== void 0) {
		const values = environment.backgroundColor.match(/\d+(?:\.\d+)?/g);
		const alpha = values && values.length > 3 ? Number(values[3]) : 1;
		if (values && values.length >= 3 && alpha > 0) {
			const rgb = values.slice(0, 3).map(Number);
			return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 < 145;
		}
	}
	if (environment?.prefersDark !== void 0) return environment.prefersDark;
	return true;
}
function iosPalette(environment) {
	let dark = true;
	if (environment === void 0) try {
		const body = typeof document === "undefined" ? void 0 : document.body;
		dark = isDark({
			backgroundColor: body === void 0 ? void 0 : getComputedStyle(body).backgroundColor,
			prefersDark: typeof window === "undefined" || typeof window.matchMedia !== "function" ? void 0 : window.matchMedia("(prefers-color-scheme: dark)").matches
		});
	} catch {
		dark = true;
	}
	else dark = isDark(environment);
	return dark ? {
		canvas: "var(--dsw-alias-bg-base, #1C1C1E)",
		group: "var(--dsw-alias-bg-layer-1, #2C2C2E)",
		raised: "var(--dsw-alias-bg-layer-2, #3A3A3C)",
		field: "var(--dsw-specific-input-major, #2C2C2E)",
		border: "var(--dsw-alias-border-l2, rgba(255,255,255,0.12))",
		divider: "var(--dsw-alias-border-l1, rgba(255,255,255,0.10))",
		text: "var(--dsw-alias-label-primary, #F5F5F7)",
		secondary: "var(--dsw-alias-label-secondary, rgba(235,235,245,0.60))",
		foreground: "var(--dsw-alias-label-primary-foreground, #FFFFFF)",
		accent: "var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary, #0A84FF))",
		accentSoft: "var(--dsw-alias-state-business-tertiary, rgba(10,132,255,0.16))",
		accentBorder: "var(--dsw-alias-state-business-primary, rgba(10,132,255,0.42))",
		switchOff: "var(--dsw-alias-bg-layer-3, #39393D)",
		danger: "var(--dsw-alias-state-error-primary, #FF453A)",
		dangerBg: "var(--dsw-alias-state-error-tertiary, rgba(255,69,58,0.16))",
		dangerBorder: "var(--dsw-alias-state-error-primary, rgba(255,69,58,0.30))",
		shadow: "var(--dsw-shadow-lv1, 0 1px 1px rgba(0,0,0,0.24))"
	} : {
		canvas: "var(--dsw-alias-bg-base, #F2F2F7)",
		group: "var(--dsw-alias-bg-layer-1, #FFFFFF)",
		raised: "var(--dsw-alias-bg-layer-2, #F9F9FB)",
		field: "var(--dsw-specific-input-major, #F2F2F7)",
		border: "var(--dsw-alias-border-l2, rgba(60,60,67,0.18))",
		divider: "var(--dsw-alias-border-l1, rgba(60,60,67,0.18))",
		text: "var(--dsw-alias-label-primary, #1C1C1E)",
		secondary: "var(--dsw-alias-label-secondary, #6D6D72)",
		foreground: "var(--dsw-alias-label-primary-foreground, #FFFFFF)",
		accent: "var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary, #007AFF))",
		accentSoft: "var(--dsw-alias-state-business-tertiary, rgba(0,122,255,0.10))",
		accentBorder: "var(--dsw-alias-state-business-primary, rgba(0,122,255,0.32))",
		switchOff: "var(--dsw-alias-bg-layer-3, #E5E5EA)",
		danger: "var(--dsw-alias-state-error-primary, #FF3B30)",
		dangerBg: "var(--dsw-alias-state-error-tertiary, rgba(255,59,48,0.12))",
		dangerBorder: "var(--dsw-alias-state-error-primary, rgba(255,59,48,0.28))",
		shadow: "var(--dsw-shadow-lv1, 0 1px 1px rgba(0,0,0,0.05))"
	};
}
//#endregion
//#region packages/settings-ui/src/client/components/Controls.tsx
function Icon({ name, size = 15 }) {
	const children = [];
	if (name === "sliders" || name === "settings") children.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 6h16M4 12h16M4 18h16" }, "lines"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
		cx: "8",
		cy: "6",
		r: "2"
	}, "a"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
		cx: "15",
		cy: "12",
		r: "2"
	}, "b"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
		cx: "10",
		cy: "18",
		r: "2"
	}, "c"));
	else if (name === "chevronDown") children.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m6 9 6 6 6-6" }, "path"));
	else if (name === "chevronUp") children.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m18 15-6-6-6 6" }, "path"));
	else if (name === "check") children.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m5 12 4 4L19 6" }, "path"));
	else if (name === "refresh") children.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M20 11a8 8 0 1 0-1.6 5.6" }, "arc"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M20 5v6h-6" }, "head"));
	else if (name === "restore") children.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M9 7H5v4" }, "arrow"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M5 11a7 7 0 1 1 2 6" }, "curve"));
	else if (name === "search") children.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
		cx: "11",
		cy: "11",
		r: "6.5"
	}, "circle"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m16 16 4 4" }, "handle"));
	else if (name === "layers") children.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m12 3 8 4-8 4-8-4 8-4Z" }, "top"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m4 12 8 4 8-4" }, "middle"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m4 17 8 4 8-4" }, "bottom"));
	else if (name === "text") children.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M5 5h14M12 5v14M8 19h8" }, "path"));
	else if (name === "image") children.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
		x: "3",
		y: "4",
		width: "18",
		height: "16",
		rx: "2"
	}, "rect"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
		cx: "8.5",
		cy: "9",
		r: "1.5"
	}, "circle"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m4 17 5-5 3 3 2-2 6 4" }, "mountain"));
	else if (name === "model") children.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" }, "box"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m4 7.5 8 4.5 8-4.5" }, "top"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 12v9" }, "side"));
	else if (name === "context") children.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 4H5v16h3M16 4h3v16h-3" }, "brackets"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M10 8h4M10 12h4M10 16h4" }, "lines"));
	else if (name === "sparkles") children.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m12 3-1.2 4.8L6 9l4.8 1.2L12 15l1.2-4.8L18 9l-4.8-1.2L12 3Z" }, "large"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m19 14-.7 2.3L16 17l2.3.7L19 20l.7-2.3L22 17l-2.3-.7L19 14Z" }, "small"));
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.8,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": "true",
		focusable: "false",
		style: {
			display: "block",
			flex: "0 0 auto"
		},
		children
	});
}
function ActionButton({ text = "", onClick, disabled = false, tone = "secondary", palette, icon, label, testId, children }) {
	const visual = tone === "primary" ? {
		background: palette.accent,
		color: palette.foreground,
		border: palette.accent
	} : tone === "danger" ? {
		background: palette.dangerBg,
		color: palette.danger,
		border: palette.dangerBorder
	} : tone === "ghost" ? {
		background: "transparent",
		color: palette.accent,
		border: "transparent"
	} : {
		background: palette.field,
		color: palette.text,
		border: palette.border
	};
	const iconOnly = text.length === 0 && children === void 0;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
		type: "button",
		"data-testid": testId,
		title: label,
		"aria-label": label,
		disabled,
		onClick,
		style: {
			height: "28px",
			minWidth: "28px",
			width: iconOnly ? "28px" : void 0,
			padding: iconOnly ? 0 : "0 9px",
			borderRadius: "8px",
			border: `1px solid ${visual.border}`,
			backgroundColor: visual.background,
			color: visual.color,
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			gap: "5px",
			fontSize: "12px",
			fontWeight: 600,
			letterSpacing: 0,
			whiteSpace: "nowrap",
			cursor: disabled ? "default" : "pointer",
			opacity: disabled ? .5 : 1,
			boxShadow: tone === "primary" ? palette.shadow : "none",
			transition: "background-color 150ms ease, opacity 150ms ease, transform 150ms ease"
		},
		children: [icon ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
			name: icon,
			size: 14
		}) : null, text ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: text }) : children]
	});
}
function SwitchControl({ checked, onChange, disabled = false, label, palette }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		role: "switch",
		"aria-checked": checked,
		"aria-label": label,
		title: label,
		disabled,
		onClick: () => onChange(!checked),
		style: {
			width: "38px",
			height: "22px",
			minWidth: "38px",
			padding: 0,
			position: "relative",
			border: `1px solid ${checked ? palette.accent : palette.border}`,
			borderRadius: "11px",
			backgroundColor: checked ? palette.accent : palette.switchOff,
			cursor: disabled ? "default" : "pointer",
			opacity: disabled ? .5 : 1,
			transition: "background-color 160ms ease, border-color 160ms ease, opacity 160ms ease"
		},
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
			position: "absolute",
			top: "2px",
			left: "2px",
			width: "16px",
			height: "16px",
			borderRadius: "50%",
			backgroundColor: palette.foreground,
			boxShadow: "0 1px 2px rgba(0,0,0,0.22)",
			transform: checked ? "translateX(16px)" : "translateX(0)",
			transition: "transform 160ms ease"
		} })
	});
}
//#endregion
//#region \0dsh-css:/home/runner/work/dsh-thinking-effort/dsh-thinking-effort/packages/settings-ui/src/client/settings.module.css.mjs
const css$1 = ".O9xm1q_settingsRoot{max-width:920px;margin:0 auto;padding:6px 8px 34px;position:relative}.O9xm1q_controlRow{flex-wrap:wrap;align-items:center;gap:6px;display:flex}.O9xm1q_controlRowEnd{flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:6px;display:flex}.O9xm1q_pairGrid{grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:8px;display:grid}.O9xm1q_pairGridTight{grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:6px;display:grid}.O9xm1q_labelControlRow{grid-template-columns:minmax(0,1fr) minmax(min(110px,40%),auto);align-items:center;gap:7px;min-width:0;display:grid}.O9xm1q_headerCluster{grid-template-columns:154px 28px;align-items:center;column-gap:8px;min-width:0;display:grid}.O9xm1q_entityHeader{grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:8px;min-width:0;display:grid}.O9xm1q_contextRow{grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;min-width:0;display:grid}.O9xm1q_capabilityRow{grid-template-columns:auto minmax(0,1fr) minmax(0,1fr);align-items:center;gap:8px;min-width:0;display:grid}.O9xm1q_levelRow{grid-template-columns:38px 72px minmax(0,1fr);align-items:center;gap:8px;display:grid}.O9xm1q_modelBadges{grid-template-columns:22px 22px minmax(86px,1fr);align-items:center;column-gap:8px;min-width:0;display:grid}.O9xm1q_wideFieldRow{grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;display:grid}.O9xm1q_responsiveSelect{min-width:min(100%,136px)}.O9xm1q_responsiveSelectWide{min-width:min(100%,180px)}.O9xm1q_responsiveCustomInput{box-sizing:border-box;flex:160px;min-width:min(100%,140px)}@media (width<=1023px){.O9xm1q_headerCluster{grid-template-columns:minmax(0,auto) 28px}}@media (width<=767px){.O9xm1q_pairGrid,.O9xm1q_pairGridTight{grid-template-columns:1fr}.O9xm1q_contextRow,.O9xm1q_capabilityRow{grid-template-columns:auto minmax(0,1fr)}.O9xm1q_contextRow>:last-child,.O9xm1q_capabilityRow>:last-child{grid-column:1/-1;justify-content:flex-start}}@media (width<=480px){.O9xm1q_settingsRoot{padding-left:4px;padding-right:4px}.O9xm1q_labelControlRow,.O9xm1q_entityHeader,.O9xm1q_wideFieldRow{grid-template-columns:minmax(0,1fr);row-gap:5px}.O9xm1q_headerCluster{grid-template-columns:auto auto}.O9xm1q_modelBadges{grid-template-columns:22px 22px minmax(0,1fr)}.O9xm1q_contextRow,.O9xm1q_capabilityRow{grid-template-columns:minmax(0,1fr);row-gap:5px}.O9xm1q_levelRow{grid-template-columns:38px minmax(0,1fr)}.O9xm1q_levelRow>:nth-child(2){display:none}.O9xm1q_responsiveSelect,.O9xm1q_responsiveSelectWide,.O9xm1q_responsiveCustomInput{width:100%;min-width:0}.O9xm1q_controlRowEnd{justify-content:flex-start}}";
const tagId$1 = "spig-dsh-thinking-provider/settings.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
	const tag = document.createElement("style");
	tag.dataset.plugin = "spig-dsh-thinking-provider";
	tag.dataset.pluginCss = tagId$1;
	tag.textContent = css$1;
	document.head.appendChild(tag);
}
var settings_module_css_default = {
	"capabilityRow": "O9xm1q_capabilityRow",
	"contextRow": "O9xm1q_contextRow",
	"controlRow": "O9xm1q_controlRow",
	"controlRowEnd": "O9xm1q_controlRowEnd",
	"entityHeader": "O9xm1q_entityHeader",
	"headerCluster": "O9xm1q_headerCluster",
	"labelControlRow": "O9xm1q_labelControlRow",
	"levelRow": "O9xm1q_levelRow",
	"modelBadges": "O9xm1q_modelBadges",
	"pairGrid": "O9xm1q_pairGrid",
	"pairGridTight": "O9xm1q_pairGridTight",
	"responsiveCustomInput": "O9xm1q_responsiveCustomInput",
	"responsiveSelect": "O9xm1q_responsiveSelect",
	"responsiveSelectWide": "O9xm1q_responsiveSelectWide",
	"settingsRoot": "O9xm1q_settingsRoot",
	"wideFieldRow": "O9xm1q_wideFieldRow"
};
//#endregion
//#region packages/settings-ui/src/client/components/GatewayCompatGroup.tsx
function defaultTranslation(key) {
	return en_default[key] ?? key;
}
function selectStyle$2(palette) {
	return {
		boxSizing: "border-box",
		minWidth: 0,
		height: "28px",
		padding: "0 7px",
		border: `1px solid ${palette.border}`,
		borderRadius: "8px",
		backgroundColor: palette.group,
		color: palette.text,
		fontSize: "12px"
	};
}
function fieldOptions(spec, t) {
	if (spec.kind === "enum") return [{
		value: "auto",
		label: t("gatewayCompatAuto")
	}, ...spec.enumValues.map((value) => {
		const option = spec.enumOptions?.find((candidate) => candidate.value === value);
		return {
			value,
			label: option?.labelKey === void 0 ? value : t(option.labelKey)
		};
	})];
	return [
		{
			value: "auto",
			label: t("gatewayCompatAuto")
		},
		{
			value: "supported",
			label: t("gatewayCompatSupported")
		},
		{
			value: "unsupported",
			label: t("gatewayCompatUnsupported")
		}
	];
}
function renderField(spec, view, onChange, disabled, palette, t) {
	const key = spec.key;
	const value = view[key] ?? "auto";
	if (spec.kind === "number") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
		className: settings_module_css_default.labelControlRow,
		style: {
			fontSize: "12px",
			color: palette.text
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: {
				minWidth: 0,
				overflowWrap: "anywhere"
			},
			children: t(spec.labelKey)
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
			"aria-label": t(spec.labelKey),
			type: "number",
			step: spec.step,
			value: value === "auto" ? "" : value,
			placeholder: t("gatewayCompatAuto"),
			disabled,
			onChange: (event) => onChange({ [key]: event.currentTarget.value === "" ? "auto" : event.currentTarget.value }),
			style: selectStyle$2(palette)
		})]
	}, key);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
		className: settings_module_css_default.labelControlRow,
		style: {
			fontSize: "12px",
			color: palette.text
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: {
				minWidth: 0,
				overflowWrap: "anywhere"
			},
			children: t(spec.labelKey)
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
			"aria-label": t(spec.labelKey),
			value,
			disabled,
			onChange: (event) => onChange({ [key]: event.currentTarget.value }),
			style: selectStyle$2(palette),
			children: fieldOptions(spec, t).map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
				value: option.value,
				children: option.label
			}, option.value))
		})]
	}, key);
}
function GatewayCompatGroup({ groupId, view, onChange, disabled = false, excludeKeys, palette = iosPalette(), t = defaultTranslation }) {
	const excluded = new Set(excludeKeys ?? []);
	const available = fieldsInGroup(groupId).filter((spec) => !excluded.has(spec.key) && view[`${spec.key}Available`] === true);
	if (available.length === 0) return null;
	const titleKey = GATEWAY_COMPAT_GROUPS.find((group) => group.id === groupId)?.titleKey ?? groupId;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			display: "grid",
			gap: "4px"
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			style: {
				fontSize: "11px",
				fontWeight: 700,
				color: palette.secondary
			},
			children: t(titleKey)
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: settings_module_css_default.pairGridTight,
			children: available.map((spec) => renderField(spec, view, onChange, disabled, palette, t))
		})]
	});
}
//#endregion
//#region packages/settings-ui/src/client/components/GatewayCompatControls.tsx
function selectStyle$1(palette) {
	return {
		boxSizing: "border-box",
		minWidth: 0,
		height: "28px",
		padding: "0 7px",
		border: `1px solid ${palette.border}`,
		borderRadius: "8px",
		backgroundColor: palette.group,
		color: palette.text,
		fontSize: "12px"
	};
}
function sourceKey(source) {
	return {
		model: "compatSourceModel",
		provider: "compatSourceProvider",
		base: "compatSourceBase",
		catalog: "compatSourceCatalog",
		protocol: "compatSourceProtocol",
		unknown: "compatSourceUnknown"
	}[source];
}
function sourceLabel(t, source) {
	return t(sourceKey(source));
}
function isModelView(scope, view) {
	return scope === "model" && "model" in view;
}
function renderGatewayCompatControls({ scope = "provider", view, onChange, disabled = false, expanded = false, onToggleExpanded, availableCount, expandedLabel, collapsedHint }, { palette, t }) {
	if (!GATEWAY_COMPAT_FIELD_KEYS.some((key) => view[`${key}Available`] === true)) return null;
	const modelView = isModelView(scope, view);
	const patch = (next) => {
		if (modelView) onChange(next);
		else onChange({
			...view,
			...next
		});
	};
	const fieldSource = (source) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
		style: {
			color: palette.secondary,
			fontSize: "10px",
			fontWeight: 500
		},
		children: [
			"(",
			sourceLabel(t, source),
			")"
		]
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		"data-provider": view.provider,
		"data-scope": modelView ? "model" : "provider",
		style: {
			display: "grid",
			gap: "5px",
			marginBottom: "4px",
			padding: "6px 8px",
			border: `1px solid ${palette.border}`,
			borderRadius: "8px",
			backgroundColor: palette.group
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "grid",
					gap: "2px",
					fontSize: "12px",
					fontWeight: 700,
					color: palette.text
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(modelView ? "modelGatewayCompatTitle" : "gatewayCompatTitle") }), modelView ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						fontSize: "11px",
						fontWeight: 600,
						overflowWrap: "anywhere"
					},
					children: view.model
				}) : null]
			}),
			view.supportsDeveloperRoleAvailable || view.maxTokensFieldAvailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_module_css_default.pairGridTight,
				children: [view.supportsDeveloperRoleAvailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: settings_module_css_default.labelControlRow,
					style: {
						fontSize: "12px",
						color: palette.text
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: "4px",
							minWidth: 0,
							flexWrap: "wrap"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("supportsDeveloperRole") }), modelView ? fieldSource(view.supportsDeveloperRoleSource) : null]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						"aria-label": t("supportsDeveloperRole"),
						value: view.supportsDeveloperRole,
						disabled,
						onChange: (event) => patch({ supportsDeveloperRole: event.currentTarget.value }),
						style: selectStyle$1(palette),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "auto",
								children: t("gatewayCompatAuto")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "supported",
								children: t("gatewayCompatSupported")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "unsupported",
								children: t("gatewayCompatUnsupported")
							})
						]
					})]
				}) : null, view.maxTokensFieldAvailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: settings_module_css_default.labelControlRow,
					style: {
						fontSize: "12px",
						color: palette.text
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: "4px",
							minWidth: 0,
							flexWrap: "wrap"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("maxTokensField") }), modelView ? fieldSource(view.maxTokensFieldSource) : null]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						"aria-label": t("maxTokensField"),
						value: view.maxTokensField,
						disabled,
						onChange: (event) => patch({ maxTokensField: event.currentTarget.value }),
						style: selectStyle$1(palette),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "auto",
								children: t("gatewayCompatAuto")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "max_tokens",
								children: t("maxTokensFieldStandard")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "max_completion_tokens",
								children: t("maxTokensFieldCompletion")
							})
						]
					})]
				}) : null]
			}) : null,
			availableCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "grid",
					gap: "3px",
					justifyItems: "start"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					"aria-expanded": expanded,
					onClick: () => onToggleExpanded?.(),
					disabled,
					style: {
						border: 0,
						padding: "2px 0",
						background: "transparent",
						color: palette.accent,
						fontSize: "11px",
						fontWeight: 650,
						cursor: disabled ? "default" : "pointer"
					},
					children: expanded ? t("gatewayExpandedLess") : expandedLabel ?? t("gatewayMoreFields", { count: availableCount })
				}), !expanded && collapsedHint ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						color: palette.secondary,
						fontSize: "10px"
					},
					children: collapsedHint
				}) : null]
			}) : null,
			expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "grid",
					gap: "9px",
					paddingTop: "2px"
				},
				children: GATEWAY_COMPAT_GROUPS.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GatewayCompatGroup, {
					groupId: group.id,
					view,
					onChange: patch,
					disabled,
					excludeKeys: ["supportsDeveloperRole", "maxTokensField"],
					palette,
					t
				}, group.id))
			}) : null,
			modelView ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					color: palette.secondary,
					fontSize: "10px"
				},
				children: t("inheritProviderCompat")
			}) : null
		]
	});
}
/**
* Persist a draft once typing pauses, instead of on a Save button.
*
* The hook owns only the timing and the "one write per settled value" rule; it
* knows nothing about settings, ops or revisions, so the same call serves the
* per-model compaction ratios and the subagent route picker.
*
* Three cases deliberately do NOT write:
*
* - an untouched draft, because nothing changed;
* - an unwritable one, because the field is mid-edit or invalid;
* - a value identical to the last one written, which is what stops the reload
*   that follows a successful write from triggering another one.
*
* `save` is read through a ref so a caller can pass an inline closure without
* restarting the timer on every render, which would otherwise postpone the
* write until the user stopped typing *and* the parent stopped re-rendering.
*
* @param draft - the current editable value and whether it may be written.
* @param save - called with the settled text; performs the actual write.
* @returns nothing; the caller keeps rendering from its own state.
*/
function useAutoSave(draft, save) {
	const saveRef = react.default.useRef(save);
	saveRef.current = save;
	const settled = react.default.useRef(void 0);
	const timer = react.default.useRef(void 0);
	react.default.useEffect(() => {
		if (!draft.touched) {
			settled.current = draft.text;
			return;
		}
		if (!draft.writable) return void 0;
		if (draft.text === settled.current) return void 0;
		if (timer.current !== void 0) clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			timer.current = void 0;
			if (draft.text === settled.current) return;
			settled.current = draft.text;
			saveRef.current(draft.text);
		}, 600);
		return () => {
			if (timer.current !== void 0) {
				clearTimeout(timer.current);
				timer.current = void 0;
			}
		};
	}, [
		draft.text,
		draft.writable,
		draft.touched
	]);
}
//#endregion
//#region packages/settings-ui/src/client/components/ModelEditor.tsx
function ModelEditor({ item, draft, contextDraft, inputDraft, dirty, busy, palette, t, onLevelChange, onContextChange, onOneMillionChange, onInputChange, onSave, blockedReason, onRestoreReasoning, onRestoreCapability, compatView, onCompatChange, onSaveCompat, compatDirty, compatExpanded, onToggleCompatExpanded, openCodeSession, openCodeSessionAvailable = false, onOpenCodeSessionChange, compaction }) {
	const levelLabel = (level) => t(LEVEL_LABEL_KEYS[level]);
	const compactionDraft = compaction?.draft;
	useAutoSave({
		text: compactionDraft === void 0 ? "" : `${compactionDraft.threshold}\u0000${compactionDraft.retain}`,
		writable: compaction !== void 0 && compaction.problem === null,
		touched: compactionDraft?.touched === true
	}, () => {
		compaction?.onCommit();
	});
	const anyCompatDirty = compatDirty !== void 0 && GATEWAY_COMPAT_FIELD_KEYS.some((key) => compatDirty[key] === true);
	const modelCompatControls = compatView !== void 0 ? renderGatewayCompatControls({
		scope: "model",
		view: compatView,
		onChange: (next) => onCompatChange?.(next),
		disabled: busy || onCompatChange === void 0,
		expanded: compatExpanded === true,
		onToggleExpanded: onToggleCompatExpanded,
		availableCount: GATEWAY_COMPAT_FIELD_KEYS.filter((key) => key !== "supportsDeveloperRole" && key !== "maxTokensField" && compatView[`${key}Available`] === true).length
	}, {
		palette,
		t
	}) : null;
	const modelCompat = modelCompatControls !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
		modelCompatControls,
		!item.inOverrides ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			style: {
				color: palette.secondary,
				fontSize: "10px",
				marginBottom: "6px"
			},
			children: t("modelsArrayCompatSaveNote")
		}) : null,
		onSaveCompat ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			style: {
				display: "flex",
				gap: "6px",
				flexWrap: "wrap",
				marginBottom: "6px"
			},
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
				text: t("saveModelGatewayCompat"),
				onClick: onSaveCompat,
				disabled: busy || !anyCompatDirty,
				tone: "primary",
				palette,
				icon: "check"
			})
		}) : null
	] }) : null;
	const openCodeSessionControls = openCodeSessionAvailable && item.modelSourceConflict !== true ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		"data-scope": "opencode-session",
		style: {
			display: "grid",
			gap: "5px",
			marginBottom: "8px",
			padding: "8px",
			border: `0.5px solid ${palette.border}`,
			borderRadius: "6px",
			backgroundColor: palette.field
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: "8px"
			},
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: {
					fontSize: "13px",
					fontWeight: 650
				},
				children: t("opencodeSessionHeaderTitle")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchControl, {
				checked: openCodeSession === true,
				onChange: (enabled) => onOpenCodeSessionChange?.(enabled),
				disabled: busy || onOpenCodeSessionChange === void 0,
				label: t("opencodeSessionHeaderTitle"),
				palette
			})]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: {
				color: palette.secondary,
				fontSize: "11px",
				lineHeight: "15px"
			},
			children: t("opencodeSessionHeaderDescription")
		})]
	}) : null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			padding: "10px 12px 12px",
			borderTop: `0.5px solid ${palette.divider}`,
			backgroundColor: palette.canvas
		},
		children: [
			openCodeSessionControls,
			modelCompat,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_module_css_default.pairGrid,
				style: { marginBottom: "8px" },
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_module_css_default.contextRow,
					style: {
						padding: "8px",
						border: `0.5px solid ${palette.border}`,
						borderRadius: "6px",
						backgroundColor: palette.field
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: "6px",
								fontSize: "13px",
								fontWeight: 650
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: "context",
								size: 15
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("contextLength") })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "text",
							inputMode: "text",
							value: contextDraft.oneMillion ? String(CONTEXT_1M) : contextDraft.value,
							disabled: busy || contextDraft.oneMillion,
							placeholder: t("providerDefaultShort"),
							"aria-label": t("contextLength"),
							onChange: (event) => onContextChange(event.currentTarget.value),
							style: {
								boxSizing: "border-box",
								width: "100%",
								minWidth: 0,
								height: "30px",
								padding: "0 8px",
								border: `0.5px solid ${palette.border}`,
								borderRadius: "6px",
								fontSize: "13px",
								backgroundColor: palette.group,
								color: palette.text,
								outline: "none"
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								justifyContent: "flex-end",
								gap: "6px",
								minWidth: 0,
								fontSize: "12px",
								whiteSpace: "nowrap"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("oneMillionMode") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchControl, {
								checked: contextDraft.oneMillion,
								onChange: onOneMillionChange,
								disabled: busy,
								label: t("oneMillionMode"),
								palette
							})]
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_module_css_default.capabilityRow,
					style: {
						padding: "8px",
						border: `0.5px solid ${palette.border}`,
						borderRadius: "6px",
						backgroundColor: palette.field
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: "13px",
								fontWeight: 650
							},
							children: t("inputCapabilities")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								justifyContent: "flex-end",
								gap: "6px",
								minWidth: 0,
								fontSize: "12px",
								whiteSpace: "nowrap"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: {
									display: "inline-flex",
									alignItems: "center",
									gap: "5px"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "text",
									size: 14
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("textInput") })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchControl, {
								checked: inputDraft.text,
								onChange: (enabled) => onInputChange("text", enabled),
								disabled: busy,
								label: t("textInput"),
								palette
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								justifyContent: "flex-end",
								gap: "6px",
								minWidth: 0,
								fontSize: "12px",
								whiteSpace: "nowrap"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: {
									display: "inline-flex",
									alignItems: "center",
									gap: "5px"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "image",
									size: 14
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("imageInput") })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchControl, {
								checked: inputDraft.image,
								onChange: (enabled) => onInputChange("image", enabled),
								disabled: busy,
								label: t("imageInput"),
								palette
							})]
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					fontSize: "12px",
					fontWeight: 700,
					color: palette.secondary,
					margin: "0 0 4px 2px"
				},
				children: t("reasoningLevels")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "grid",
					gridTemplateColumns: "minmax(0, 1fr)",
					marginBottom: "2px",
					border: `0.5px solid ${palette.border}`,
					borderRadius: "6px",
					backgroundColor: palette.field,
					overflow: "hidden"
				},
				children: ALL_LEVELS.map((level, index) => {
					const cell = draft[level] ?? {
						on: false,
						wire: ""
					};
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_module_css_default.levelRow,
						style: {
							minHeight: "36px",
							padding: "4px 8px",
							borderBottom: index < ALL_LEVELS.length - 1 ? `0.5px solid ${palette.divider}` : "none",
							backgroundColor: cell.on ? palette.raised : "transparent",
							fontSize: "12px"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchControl, {
								checked: cell.on,
								onChange: (enabled) => onLevelChange(level, { on: enabled }),
								disabled: busy,
								label: `${levelLabel(level)}${t("levelSuffix")}`,
								palette
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									width: "58px",
									fontSize: "13px",
									fontWeight: 650
								},
								children: levelLabel(level)
							}),
							cell.on ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "text",
								value: cell.wire,
								disabled: busy,
								placeholder: level === "off" ? t("offPlaceholder") : t("wirePlaceholder"),
								onChange: (event) => onLevelChange(level, { wire: event.currentTarget.value }),
								style: {
									boxSizing: "border-box",
									width: "100%",
									minWidth: 0,
									height: "26px",
									padding: "0 8px",
									border: `1px solid ${palette.border}`,
									borderRadius: "8px",
									fontSize: "13px",
									backgroundColor: palette.group,
									color: palette.text,
									outline: "none"
								}
							}) : null
						]
					}, level);
				})
			}),
			compaction !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-scope": "compaction",
				style: {
					display: "grid",
					gap: "5px",
					marginTop: "8px",
					padding: "8px",
					border: `0.5px solid ${palette.border}`,
					borderRadius: "6px",
					backgroundColor: palette.field
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: "8px"
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: "6px",
								fontSize: "13px",
								fontWeight: 650
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: "sparkles",
								size: 15
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("compactionSectionTitle") })]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						"data-scope": "compaction-scope",
						style: {
							color: palette.secondary,
							fontSize: "11px",
							lineHeight: "15px"
						},
						children: t("compactionSectionHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: settings_module_css_default.labelControlRow,
						style: {
							fontSize: "12px",
							color: palette.text
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "grid",
								gap: "1px",
								minWidth: 0
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("compactionThreshold") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									color: palette.secondary,
									fontSize: "10px",
									lineHeight: "13px"
								},
								children: t("compactionThresholdHint")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: "4px",
								minWidth: 0
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "text",
								inputMode: "decimal",
								value: compaction.draft.threshold,
								disabled: busy,
								placeholder: compaction.thresholdPlaceholder,
								"aria-label": t("compactionThreshold"),
								onChange: (event) => compaction.onThresholdChange(event.currentTarget.value),
								style: {
									boxSizing: "border-box",
									width: "100%",
									minWidth: 0,
									height: "28px",
									padding: "0 8px",
									border: `1px solid ${palette.border}`,
									borderRadius: "8px",
									fontSize: "13px",
									backgroundColor: palette.group,
									color: palette.text,
									outline: "none"
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									color: palette.secondary,
									fontSize: "11px"
								},
								children: "%"
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: settings_module_css_default.labelControlRow,
						style: {
							fontSize: "12px",
							color: palette.text
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "grid",
								gap: "1px",
								minWidth: 0
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("compactionRetain") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									color: palette.secondary,
									fontSize: "10px",
									lineHeight: "13px"
								},
								children: t("compactionRetainHint")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: "4px",
								minWidth: 0
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "text",
								inputMode: "decimal",
								value: compaction.draft.retain,
								disabled: busy,
								placeholder: compaction.retainPlaceholder,
								"aria-label": t("compactionRetain"),
								onChange: (event) => compaction.onRetainChange(event.currentTarget.value),
								style: {
									boxSizing: "border-box",
									width: "100%",
									minWidth: 0,
									height: "28px",
									padding: "0 8px",
									border: `1px solid ${palette.border}`,
									borderRadius: "8px",
									fontSize: "13px",
									backgroundColor: palette.group,
									color: palette.text,
									outline: "none"
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									color: palette.secondary,
									fontSize: "11px"
								},
								children: "%"
							})]
						})]
					}),
					compaction.problem !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						"aria-live": "polite",
						"data-scope": "compaction-problem",
						style: {
							padding: "5px 8px",
							border: `1px solid ${palette.dangerBorder}`,
							borderRadius: "6px",
							color: palette.danger,
							backgroundColor: palette.dangerBg,
							fontSize: "11px",
							lineHeight: "15px"
						},
						children: compaction.problem
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						"data-scope": "compaction-autosave",
						style: {
							color: palette.secondary,
							fontSize: "10px",
							lineHeight: "14px"
						},
						children: t("compactionAutoSave")
					})
				]
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					gap: "6px",
					flexWrap: "wrap",
					marginTop: "6px",
					paddingTop: "6px",
					borderTop: `1px solid ${palette.divider}`
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
						text: dirty ? t("saveChanges") : t("saved"),
						onClick: onSave,
						disabled: busy || !dirty || blockedReason != null,
						tone: "primary",
						palette,
						icon: "check",
						label: dirty ? t("saveModelChanges") : t("noPendingChanges")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
						text: t("restoreReasoning"),
						onClick: onRestoreReasoning,
						disabled: busy,
						tone: "secondary",
						palette,
						icon: "restore"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
						text: t("restoreCapability"),
						onClick: onRestoreCapability,
						disabled: busy,
						tone: "danger",
						palette,
						icon: "restore"
					})
				]
			}),
			dirty && blockedReason != null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"aria-live": "polite",
				"data-scope": "model-save-blocked",
				style: {
					marginTop: "6px",
					padding: "6px 8px",
					border: `1px solid ${palette.dangerBorder}`,
					borderRadius: "6px",
					color: palette.danger,
					backgroundColor: palette.dangerBg,
					fontSize: "12px",
					lineHeight: "18px"
				},
				children: blockedReason
			}) : null
		]
	});
}
//#endregion
//#region packages/settings-ui/src/client/components/ModelRow.tsx
function modelSummary(item, t) {
	const input = item.input.length > 0 ? item.input : ["text"];
	const value = item.contextWindow;
	return {
		text: input.includes("text"),
		image: input.includes("image"),
		context: Number.isInteger(value) ? {
			label: value === 1e6 ? "1M" : value >= 1024 ? `${Math.round(value / 1024)}K` : String(value),
			title: t("contextTitle", { value })
		} : void 0
	};
}
function ModelRow({ item, open, draft, contextDraft, inputDraft, dirty, busy, palette, t, onToggle, onLevelChange, onContextChange, onOneMillionChange, onInputChange, onSave, blockedReason, onRestoreReasoning, onRestoreCapability, compatView, onCompatChange, onSaveCompat, compatDirty, compatExpanded, onToggleCompatExpanded, openCodeSession, openCodeSessionAvailable, onOpenCodeSessionChange, compaction }) {
	const summary = modelSummary(item, t);
	const hasCompatDirty = compatDirty !== void 0 && Object.values(compatDirty).some((value) => value === true);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			border: `1px solid ${open ? palette.accent : dirty || hasCompatDirty ? palette.accentBorder : palette.border}`,
			borderRadius: "8px",
			marginBottom: "4px",
			backgroundColor: open ? palette.raised : palette.group,
			boxShadow: palette.shadow,
			overflow: "hidden",
			transition: "background-color 160ms ease, border-color 160ms ease"
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: settings_module_css_default.entityHeader,
			style: {
				minHeight: "42px",
				padding: "4px 6px 4px 8px"
			},
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "7px",
					minWidth: 0
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						width: "22px",
						height: "22px",
						minWidth: "22px",
						borderRadius: "7px",
						color: palette.accent,
						backgroundColor: palette.field
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
						name: "model",
						size: 14
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					style: {
						display: "grid",
						gap: "1px",
						minWidth: 0
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							minWidth: 0,
							fontSize: "13px",
							lineHeight: "15px",
							fontWeight: 700,
							overflowWrap: "anywhere"
						},
						children: item.model
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: "5px",
							fontSize: "10px",
							lineHeight: "11px",
							color: palette.secondary
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("model") }), dirty || hasCompatDirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							title: t("unsaved"),
							style: {
								padding: "1px 4px",
								border: `1px solid ${palette.accentBorder}`,
								borderRadius: "5px",
								color: palette.accent,
								backgroundColor: palette.accentSoft,
								fontSize: "9px",
								lineHeight: "11px",
								fontWeight: 700
							},
							children: t("unsaved")
						}) : null]
					})]
				})]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: settings_module_css_default.headerCluster,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: settings_module_css_default.modelBadges,
					style: { color: palette.secondary },
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							title: summary.text ? t("textEnabled") : t("textDisabled"),
							"aria-label": summary.text ? t("textEnabled") : t("textDisabled"),
							style: {
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								width: "22px",
								height: "22px",
								color: summary.text ? palette.accent : palette.secondary,
								border: `1px solid ${summary.text ? palette.accentBorder : palette.border}`,
								borderRadius: "6px",
								backgroundColor: summary.text ? palette.accentSoft : palette.raised
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: "text",
								size: 14
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							title: summary.image ? t("imageEnabled") : t("imageDisabled"),
							"aria-label": summary.image ? t("imageEnabled") : t("imageDisabled"),
							style: {
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								width: "22px",
								height: "22px",
								color: summary.image ? palette.accent : palette.secondary,
								border: `1px solid ${summary.image ? palette.accentBorder : palette.border}`,
								borderRadius: "6px",
								backgroundColor: summary.image ? palette.accentSoft : palette.raised
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: "image",
								size: 14
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							title: summary.context?.title,
							"aria-label": summary.context?.title,
							style: {
								display: "inline-flex",
								alignItems: "center",
								gap: "4px",
								minHeight: "22px",
								padding: summary.context ? "0 5px" : 0,
								border: summary.context ? `1px solid ${palette.border}` : "1px solid transparent",
								borderRadius: "6px",
								backgroundColor: summary.context ? palette.raised : "transparent",
								whiteSpace: "nowrap"
							},
							children: summary.context ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: "context",
								size: 14
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: "11px",
									fontWeight: 700
								},
								children: t("contextLabel", { label: summary.context.label })
							})] }) : null
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
					text: "",
					onClick: onToggle,
					palette,
					tone: "ghost",
					icon: open ? "chevronUp" : "settings",
					label: open ? t("closeModelSettings") : t("openModelSettings")
				})]
			})]
		}), open && draft ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelEditor, {
			item,
			draft,
			contextDraft,
			inputDraft,
			dirty,
			busy,
			palette,
			t,
			onLevelChange,
			onContextChange,
			onOneMillionChange,
			onInputChange,
			onSave,
			blockedReason,
			onRestoreReasoning,
			onRestoreCapability,
			compatView,
			onCompatChange,
			onSaveCompat,
			compatDirty,
			compatExpanded,
			onToggleCompatExpanded,
			openCodeSession,
			openCodeSessionAvailable,
			onOpenCodeSessionChange,
			compaction
		}) : null]
	});
}
//#endregion
//#region packages/settings-ui/src/client/components/SubagentSettings.tsx
const INHERIT = "";
function SubagentSettings({ effort, namespaceFound, draft, custom, busy, palette, t, onDraftChange, onCustomChange, onSave, modelPicker }) {
	const picked = modelPicker?.draft;
	useAutoSave({
		text: picked === void 0 ? "" : `${picked.provider}\u0000${picked.model}`,
		writable: picked !== void 0 && (picked.provider === INHERIT || picked.model !== INHERIT),
		touched: picked?.touched === true
	}, () => {
		modelPicker?.onCommit();
	});
	const options = [
		["default", t("providerDefault")],
		...ALL_LEVELS.map((level) => [level, t(LEVEL_LABEL_KEYS[level])]),
		["custom", t("customize")]
	];
	const picker = modelPicker;
	const selectedProvider = picker === void 0 || picker.draft.provider === INHERIT ? INHERIT : picker.draft.provider;
	const knownProviders = picker?.routes.map((route) => route.provider) ?? [];
	const savedProviderMissing = picker !== void 0 && picker.savedUnavailable && selectedProvider !== INHERIT && !knownProviders.includes(selectedProvider);
	const providerOptions = picker === void 0 ? [] : [
		INHERIT,
		...knownProviders,
		...savedProviderMissing ? [selectedProvider] : []
	];
	const modelsOfSelected = picker?.routes.find((route) => route.provider === selectedProvider)?.models ?? [];
	const unavailableValue = picker !== void 0 && picker.savedUnavailable ? picker.draft.model : "";
	const unavailableOption = unavailableValue.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
		value: unavailableValue,
		children: t("subagentModelUnavailable", { route: picker.draft.provider })
	});
	const providerLabel = (provider) => {
		if (provider === INHERIT) return t("subagentModelInherit");
		if (savedProviderMissing && provider === selectedProvider) return t("subagentModelUnavailable", { route: provider });
		return provider;
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			backgroundColor: palette.group,
			border: `1px solid ${palette.border}`,
			borderRadius: "8px",
			boxShadow: palette.shadow,
			overflow: "hidden",
			marginBottom: "8px"
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "7px",
					padding: "7px 8px 1px",
					fontSize: "13px",
					fontWeight: 700,
					letterSpacing: 0
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
					name: "sparkles",
					size: 15
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("subagentCardTitle") })]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					padding: "0 8px",
					fontSize: "12px",
					color: palette.secondary,
					marginBottom: "5px"
				},
				children: namespaceFound ? t("currentDefault", { effort: effort ?? t("providerDefault") }) : t("unconfiguredSubagent")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					gap: "8px",
					flexWrap: "wrap",
					alignItems: "center",
					padding: "6px 8px 7px",
					borderTop: `1px solid ${palette.divider}`
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
						value: draft,
						disabled: busy,
						onChange: (event) => onDraftChange(event.currentTarget.value),
						className: settings_module_css_default.responsiveSelect,
						style: {
							height: "28px",
							padding: "0 10px",
							border: `1px solid ${palette.border}`,
							borderRadius: "8px",
							fontSize: "13px",
							fontWeight: 500,
							backgroundColor: palette.field,
							color: palette.text,
							colorScheme: "light dark",
							boxShadow: palette.shadow
						},
						children: options.map(([value, label]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value,
							children: label
						}, value))
					}),
					draft === "custom" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "text",
						value: custom,
						placeholder: t("customPlaceholder"),
						"aria-label": t("customPlaceholder"),
						onChange: (event) => onCustomChange(event.currentTarget.value),
						className: settings_module_css_default.responsiveCustomInput,
						style: {
							height: "28px",
							padding: "0 8px",
							border: `1px solid ${palette.border}`,
							borderRadius: "8px",
							fontSize: "13px",
							backgroundColor: palette.field,
							color: palette.text,
							outline: "none"
						}
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
						text: t("apply"),
						onClick: onSave,
						disabled: busy,
						tone: "primary",
						palette,
						icon: "check"
					})
				]
			}),
			picker !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-scope": "subagent-model",
				style: {
					display: "grid",
					gap: "5px",
					padding: "6px 8px 7px",
					borderTop: `1px solid ${palette.divider}`
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: "6px",
							fontSize: "12px",
							fontWeight: 700
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "model",
							size: 14
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("subagentModelTitle") })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_module_css_default.pairGridTight,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: settings_module_css_default.labelControlRow,
							style: {
								fontSize: "12px",
								color: palette.text
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("subagentModelProvider") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								"aria-label": t("subagentModelProvider"),
								value: selectedProvider,
								disabled: busy,
								onChange: (event) => picker.onProviderChange(event.currentTarget.value),
								style: {
									boxSizing: "border-box",
									minWidth: 0,
									height: "28px",
									padding: "0 7px",
									border: `1px solid ${palette.border}`,
									borderRadius: "8px",
									backgroundColor: palette.field,
									color: palette.text,
									fontSize: "12px",
									colorScheme: "light dark"
								},
								children: providerOptions.map((provider) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: provider,
									children: providerLabel(provider)
								}, provider))
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: settings_module_css_default.labelControlRow,
							style: {
								fontSize: "12px",
								color: palette.text
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("subagentModelModel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								"aria-label": t("subagentModelModel"),
								value: picker.draft.model,
								disabled: busy || selectedProvider === INHERIT,
								onChange: (event) => picker.onModelChange(event.currentTarget.value),
								style: {
									boxSizing: "border-box",
									minWidth: 0,
									height: "28px",
									padding: "0 7px",
									border: `1px solid ${palette.border}`,
									borderRadius: "8px",
									backgroundColor: palette.field,
									color: palette.text,
									fontSize: "12px",
									colorScheme: "light dark"
								},
								children: selectedProvider === INHERIT ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: INHERIT,
									children: t("subagentModelInherit")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [unavailableOption, modelsOfSelected.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: model,
									children: model
								}, model))] })
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: palette.secondary,
							fontSize: "10px",
							lineHeight: "14px"
						},
						children: t("subagentModelHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"data-scope": "subagent-model-autosave",
						style: {
							color: palette.secondary,
							fontSize: "10px",
							lineHeight: "14px"
						},
						children: t("subagentModelAutoSave")
					})
				]
			}) : null
		]
	});
}
//#endregion
//#region packages/settings-ui/src/client/browser-download.ts
/**
* The one browser side effect the card cannot exercise under jsdom, kept
* behind a single function so components can take it as an injectable
* dependency.
*/
function downloadJson(filename, text) {
	const blob = new Blob([text], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.rel = "noopener";
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
//#endregion
//#region packages/settings-ui/src/client/config-snapshot/types.ts
const SNAPSHOT_MAX_BYTES = 2097152;
const LLM_NAMESPACE = LLM_PI_AI_NS;
/**
* The plugin section's legacy id: what rc.7 … 0.1.6 register, and the snapshot
* key this build falls back to when the host publishes no entry section. Under
* the 0.1.7 entry-config model the section is the Loader entry
* (`PLUGIN_ENTRY_ID`); the snapshot pipeline resolves that live id from the
* `describe()` result it already holds — `pluginSectionId` — and only falls
* back to this constant when neither id is published.
*/
const PLUGIN_NAMESPACE = PLUGIN_NS;
/**
* Namespaces a snapshot carries, in write order. `dsh-thinking-effort` is
* small and structurally simple while `llm-pi-ai` carries provider topology
* the host schema can reject, so the riskier write lands last and a failure
* there leaves the user's model configuration untouched.
*/
const CONFIG_NAMESPACES = [PLUGIN_NAMESPACE, LLM_NAMESPACE];
/** Path segments a settings path op may never address. */
const RESERVED_PATH_KEYS = [
	"__proto__",
	"constructor",
	"prototype"
];
/**
* Plugin-owned keys that must never ride inside their own snapshot.
*
* `legacyMigration` is the migration feature's control object — a decision the
* Host consumes and clears. A file that carried one with `decision: 'migrate'`
* still in it would make the importing host migrate without a click, skipping
* the consent the flow promises, so it is excluded here exactly as it is from
* the Host's own rollback copy.
*/
const PLUGIN_SNAPSHOT_EXCLUDED_KEYS = [
	"profiles",
	"autoBackup",
	"legacyMigration"
];
//#endregion
//#region packages/settings-ui/src/client/config-snapshot/snapshot.ts
const isRecord = isUnknownRecord;
/**
* The namespace's RAW user layer — the override layer as the settings document
* actually stores it, with schema defaults and the composition base left out.
* Reading `value` instead would bake derived data into the snapshot and turn it
* into user config on import. (On 0.1.7 and later that document is the active
* profile's config rather than `settings.yaml`, which the entry-config model no
* longer uses; both are the same user layer through `describe()`.)
*/
function userSectionOf(namespaces, ns) {
	const found = namespaces.find((entry) => entry.ns === ns);
	const user = found === void 0 ? void 0 : found.user;
	return isRecord(user) ? { ...user } : {};
}
/**
* Which of a snapshot's sections holds this plugin's own configuration.
*
* `resolved` is the id the running host addresses that section by — the entry
* id under the 0.1.7 entry-config model, `dsh-thinking-effort` on legacy
* releases. A file exported by the other model carries the other id, so the
* section is keyed by whichever of the two the file actually holds rather than
* by a constant: reading the wrong key would silently snapshot the plugin's
* settings as `{}` and write them back nowhere.
*
* Content decides, not mere presence. An exporter writes ONE plugin key — the
* id of the model that produced the file, beside the always-present
* `llm-pi-ai` key — so a file from the other model has that key empty and the
* other one populated. Keying on presence alone would still be wrong for a
* hand-edited file that carries both: the populated one is the one that means
* something, and the final fallback only decides between two empty sections.
*/
function pluginSectionKey(sections, resolved) {
	const alternate = resolved === PLUGIN_NAMESPACE ? PLUGIN_ENTRY_ID : PLUGIN_NAMESPACE;
	const populated = (key) => {
		const section = sections[key];
		return isRecord(section) && Object.keys(section).length > 0;
	};
	if (populated(resolved)) return resolved;
	if (populated(alternate)) return alternate;
	return Object.prototype.hasOwnProperty.call(sections, resolved) ? resolved : alternate;
}
/**
* Whether a key of `ns` belongs to the snapshot library itself — the profile
* library and the rollback copy — rather than to the configuration a snapshot
* carries. Both directions of a snapshot ask this one question: the export
* leaves these keys out of a file, and an import must never write them back. A
* hand-edited file that carries them would otherwise replace the user's profile
* library, or the rollback copy written moments before the apply.
*
* This is a property of the plugin's own section, which the 0.1.7 entry-config
* model addresses by entry id, so the id is accepted rather than compared.
*/
function isSnapshotLibraryKey(ns, key) {
	return isOpenCodeSessionSectionId(ns) && PLUGIN_SNAPSHOT_EXCLUDED_KEYS.includes(key);
}
/** The plugin section minus the snapshot library itself, which cannot nest inside its own entries. */
function pluginSectionOf(user) {
	const next = {};
	for (const [key, value] of Object.entries(user)) {
		if (isSnapshotLibraryKey(PLUGIN_NAMESPACE, key)) continue;
		next[key] = value;
	}
	return next;
}
function snapshotFromNamespaces(namespaces, meta, pluginNamespace = pluginSectionId(namespaces)) {
	const sections = {};
	for (const ns of CONFIG_NAMESPACES) {
		const target = ns === PLUGIN_NAMESPACE ? pluginNamespace : ns;
		const user = userSectionOf(namespaces, target);
		sections[target] = target === pluginNamespace ? pluginSectionOf(user) : user;
	}
	return {
		kind: SNAPSHOT_KIND,
		version: 1,
		createdAt: meta.createdAt,
		pluginVersion: meta.pluginVersion,
		sourceProfile: meta.sourceProfile,
		sections
	};
}
/** `dsh-config-YYYYMMDD-HHmm.json` in local time. */
function snapshotFileName(now) {
	const pad = (value) => String(value).padStart(2, "0");
	return `dsh-config-${`${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`}.json`;
}
/**
* Structural JSON equality. Lives here rather than beside `planImport` because
* both the planner and the wiring rules compare values, and a planner that
* imports the wiring module must not import back into itself.
*/
function deepEqualJson(left, right) {
	if (left === right) return true;
	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
		return left.every((entry, index) => deepEqualJson(entry, right[index]));
	}
	if (!isRecord(left) || !isRecord(right)) return false;
	const keys = Object.keys(left);
	if (keys.length !== Object.keys(right).length) return false;
	return keys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && deepEqualJson(left[key], right[key]));
}
//#endregion
//#region packages/settings-ui/src/client/config-snapshot/wiring.ts
/**
* Provider fields that decide WHERE a request goes and WHICH credential it
* carries, rather than what the model can do. A snapshot carries capability
* configuration across machines; these fields are deployment wiring and are
* withheld unless the user explicitly opts in.
*
* MAINTENANCE RULE: any future field that names an endpoint, names a
* credential, injects a raw request header, or points configuration at
* executable local code MUST be added here, with a test. Fields that only
* shape a request the current endpoint already receives (api, transport,
* timeouts, compat, reasoningEfforts, models, modelOverrides) are deliberately
* absent — they neither redirect traffic nor carry credentials.
*/
const PROVIDER_WIRING_KEYS = [
	"baseURL",
	"apiKeyEnv",
	"headers"
];
/** The `opencodeSession.format` field that names an executable local module. */
const PLUGIN_WIRING_SCRIPT_KEY = "script";
const EMPTY_WIRING_REPORT = {
	count: 0,
	providers: [],
	endpoints: []
};
/**
* Exported because `planImport` merges one report per namespace. The report
* types live in `types.ts` so this module depends on it one way only.
*/
function mergeWiringReports(reports) {
	const kept = reports.filter((entry) => entry.count > 0);
	if (kept.length === 0) return EMPTY_WIRING_REPORT;
	const script = kept.find((entry) => entry.script !== void 0)?.script;
	return {
		count: kept.reduce((total, entry) => total + entry.count, 0),
		providers: kept.flatMap((entry) => entry.providers),
		endpoints: kept.flatMap((entry) => entry.endpoints),
		...script === void 0 ? {} : { script }
	};
}
function own$1(object, key) {
	return Object.prototype.hasOwnProperty.call(object, key);
}
const EMPTY_ADJUSTED = (value) => ({
	value,
	report: EMPTY_WIRING_REPORT
});
/**
* Compute one namespace's effective incoming section plus what was withheld.
*
* The rule is uniform: a wiring value the FILE supplies is always discarded and
* this machine's value is always kept. Dropping the file's value alone is not
* enough — `planImport` in `replace` mode treats a key the file omits as a
* deletion, so this machine's value has to be written back or stripping the
* wiring would silently delete the user's own endpoint.
*
* The report is narrower than the rule on purpose: it counts only wiring the
* file ACTIVELY supplies that differs from this machine. An omission needs no
* warning (nothing is being redirected) and would otherwise make every
* self-exported snapshot look suspicious.
*
* `ns` is the id the *host* addresses this section by, so the plugin branch
* also matches the 0.1.7 entry id; the script rule is the plugin section's own
* rule, not a property of the legacy namespace name.
*/
function adjustIncoming(ns, incoming, current, importWiring) {
	if (ns === LLM_NAMESPACE) return adjustProviders(incoming, current, importWiring);
	if (isOpenCodeSessionSectionId(ns)) return adjustScript(incoming, current, importWiring);
	return EMPTY_ADJUSTED(incoming);
}
function adjustProviders(incoming, current, importWiring) {
	const fileProviders = incoming["providers"];
	if (!isRecord(fileProviders)) return EMPTY_ADJUSTED(incoming);
	const localProviders = isRecord(current["providers"]) ? current["providers"] : {};
	const providers = {};
	const changed = [];
	const endpoints = [];
	let count = 0;
	for (const [route, rawProfile] of Object.entries(fileProviders)) {
		if (!isRecord(rawProfile)) {
			providers[route] = rawProfile;
			continue;
		}
		const localProfile = isRecord(localProviders[route]) ? localProviders[route] : void 0;
		const next = { ...rawProfile };
		for (const key of PROVIDER_WIRING_KEYS) {
			const fileProvides = own$1(rawProfile, key);
			const localProvides = localProfile !== void 0 && own$1(localProfile, key);
			if (fileProvides && (!localProvides || !deepEqualJson(rawProfile[key], localProfile[key]))) {
				count += 1;
				if (!changed.includes(route)) changed.push(route);
				if (key === "baseURL" && typeof rawProfile[key] === "string") endpoints.push({
					provider: route,
					baseURL: rawProfile[key]
				});
			}
			if (importWiring) continue;
			if (localProvides) next[key] = localProfile[key];
			else delete next[key];
		}
		if (localProfile === void 0 && Object.keys(next).length === 0) continue;
		providers[route] = next;
	}
	return {
		value: {
			...incoming,
			providers
		},
		report: count === 0 ? EMPTY_WIRING_REPORT : {
			count,
			providers: changed,
			endpoints
		}
	};
}
function adjustScript(incoming, current, importWiring) {
	const fileSession = incoming["opencodeSession"];
	if (!isRecord(fileSession)) return EMPTY_ADJUSTED(incoming);
	const fileFormat = fileSession["format"];
	if (!isRecord(fileFormat)) return EMPTY_ADJUSTED(incoming);
	const localSession = isRecord(current["opencodeSession"]) ? current["opencodeSession"] : void 0;
	const localFormat = localSession !== void 0 && isRecord(localSession["format"]) ? localSession["format"] : void 0;
	const localProvides = localFormat !== void 0 && own$1(localFormat, "script");
	const differs = own$1(fileFormat, "script") && (!localProvides || !deepEqualJson(fileFormat["script"], localFormat["script"]));
	const scriptValue = fileFormat[PLUGIN_WIRING_SCRIPT_KEY];
	const report = !differs ? EMPTY_WIRING_REPORT : typeof scriptValue === "string" && scriptValue.length > 0 ? {
		count: 1,
		providers: [],
		endpoints: [],
		script: scriptValue
	} : {
		count: 1,
		providers: [],
		endpoints: []
	};
	if (importWiring) return {
		value: incoming,
		report
	};
	const nextFormat = { ...fileFormat };
	if (localProvides) nextFormat[PLUGIN_WIRING_SCRIPT_KEY] = localFormat[PLUGIN_WIRING_SCRIPT_KEY];
	else delete nextFormat[PLUGIN_WIRING_SCRIPT_KEY];
	return {
		value: {
			...incoming,
			opencodeSession: {
				...fileSession,
				format: nextFormat
			}
		},
		report
	};
}
//#endregion
//#region packages/settings-ui/src/client/config-snapshot/plan.ts
function has(object, key) {
	return Object.prototype.hasOwnProperty.call(object, key);
}
/**
* Plugin-owned keys the releases before 0.1.7 wrote into the `llm-pi-ai`
* section and the entry-config model no longer declares there.
*
* The entry-config writer refuses a WHOLE batch when any op path is not
* volatile, and `llm-pi-ai` declares only `providers`. A snapshot the plugin
* exported before 0.1.7 — when it still wrote `subagentEffort` into
* `llm-pi-ai` — therefore plans that `set` beside the `providers` `set`, and
* the host rejects both: the user's providers do not import either. Both halves
* are the plugin's to fix, because the key and the entry that supersedes it
* belong to this plugin: the key is dropped from the plan for `llm-pi-ai` and,
* when the file states a value, migrated into the plugin's own section, which
* does declare it.
*/
const LEGACY_LLM_SECTION_KEYS = ["subagentEffort"];
/** `section` without the plugin keys the entry-config `llm-pi-ai` schema does not declare. */
function withoutLegacyLlmKeys(section) {
	if (!LEGACY_LLM_SECTION_KEYS.some((key) => has(section, key))) return section;
	const next = {};
	for (const [key, value] of Object.entries(section)) if (!LEGACY_LLM_SECTION_KEYS.includes(key)) next[key] = value;
	return next;
}
/**
* The file's sections as the entry-config host can accept them.
*
* `llm-pi-ai` loses the plugin keys that host does not declare, and the plugin
* section gains the ones the file still states — the migration that keeps a
* setting the user already chose. The plugin section wins when the file states
* the key in both places, because that section is the model that wrote it
* second. A value that is not a non-empty string is dropped rather than
* migrated: the plugin's own schema spells "unset" as an empty string, and
* there is nothing else a host could have written there.
*
* A file with no such key is returned untouched, so the only plans this
* changes are the ones the entry-config writer would otherwise refuse.
*/
function sectionsForEntryConfig(snapshot, pluginKey) {
	const sections = snapshot.sections;
	const fileLlm = sections[LLM_NAMESPACE];
	if (!isRecord(fileLlm) || !LEGACY_LLM_SECTION_KEYS.some((key) => has(fileLlm, key))) return sections;
	const rawPlugin = sections[pluginKey];
	const plugin = isRecord(rawPlugin) ? { ...rawPlugin } : {};
	const llm = { ...fileLlm };
	for (const key of LEGACY_LLM_SECTION_KEYS) {
		const value = llm[key];
		delete llm[key];
		if (!has(plugin, key) && typeof value === "string" && value.length > 0) plugin[key] = value;
	}
	return {
		...sections,
		[pluginKey]: plugin,
		[LLM_NAMESPACE]: llm
	};
}
/**
* Count one removed entry. A dict-valued entry counts its own first-level
* items — the unit the user reasons about is a provider, not a key — but never
* fewer than one: deleting a settings key is a user-visible change even when
* the value it held was an empty dict, so the summary must not read zero.
*/
function countRemoved(value) {
	return isRecord(value) ? Math.max(1, Object.keys(value).length) : 1;
}
/**
* Compute the path ops that turn `current` into `snapshot`.
*
* Both modes merge at exactly one level: the first level of a dict-valued
* entry is compared per key and each key is replaced wholesale, while
* everything below it is written as one value. Whole-provider replacement is
* deliberate — a field-level merge could never restore a field the snapshot
* deliberately omits, which is what rollback needs.
*
* `merge` keeps top-level entries the snapshot omits; `replace` unsets them.
* Deletions are emitted before writes so the op list reads the same way it is
* summarized, and the summary counts only entries that actually differ — an
* import whose file already matches reports zero across the board.
*
* The plugin namespace's own library keys are never planned, in either mode and
* on either side: `isSnapshotLibraryKey` drops them from the key set entirely,
* so no import can replace the profile library or the rollback copy, and a
* `replace` cannot unset them either. The summary counts ops, and no op exists
* for a key that never enters the loop.
*
* Provider wiring is withheld before the diff: `adjustIncoming` drops the
* endpoint and credential fields the file supplies and writes this machine's
* values back, so a snapshot cannot redirect traffic by default and `replace`
* cannot delete the user's own endpoint either. The withholding happens here,
* inside the planner, so the preview and the write share one rule —
* `applySnapshot` re-runs this same function against a fresh read.
*
* A file exported before 0.1.7 also carries `subagentEffort` inside
* `llm-pi-ai`, which the entry-config model does not declare there and refuses
* wholesale. That key is migrated into the plugin's own section before the diff
* (see `LEGACY_LLM_SECTION_KEYS`), so the providers beside it still import and
* the user's choice survives the model change.
*/
function planImport(snapshot, namespaces, mode, options = {}) {
	const summary = {
		added: 0,
		overwritten: 0,
		removed: 0
	};
	const plans = [];
	const reports = [];
	const pluginNamespace = options.pluginNamespace ?? pluginSectionId(namespaces);
	const fileKey = pluginSectionKey(snapshot.sections, pluginNamespace);
	const entryConfig = pluginNamespace === PLUGIN_ENTRY_ID;
	const sections = entryConfig ? sectionsForEntryConfig(snapshot, fileKey) : snapshot.sections;
	for (const ns of CONFIG_NAMESPACES) {
		const target = ns === PLUGIN_NAMESPACE ? pluginNamespace : ns;
		const currentSection = userSectionOf(namespaces, target);
		const current = entryConfig && ns === LLM_NAMESPACE ? withoutLegacyLlmKeys(currentSection) : currentSection;
		const adjusted = adjustIncoming(ns, (ns === PLUGIN_NAMESPACE ? sections[fileKey] : sections[ns]) ?? {}, current, options.importWiring ?? false);
		const incoming = adjusted.value;
		reports.push(adjusted.report);
		const unsets = [];
		const sets = [];
		const keys = (mode === "replace" ? [.../* @__PURE__ */ new Set([...Object.keys(incoming), ...Object.keys(current)])] : Object.keys(incoming)).filter((key) => !isSnapshotLibraryKey(ns, key));
		for (const key of keys) {
			const inFile = has(incoming, key);
			const inCurrent = has(current, key);
			const fileValue = incoming[key];
			const currentValue = current[key];
			if (!inFile) {
				summary.removed += countRemoved(currentValue);
				unsets.push({
					op: "unset",
					path: [key]
				});
				continue;
			}
			if (isRecord(fileValue) && isRecord(currentValue)) {
				let changed = false;
				if (mode === "merge") {
					const merged = { ...currentValue };
					for (const [inner, innerValue] of Object.entries(fileValue)) {
						if (has(currentValue, inner)) {
							if (!deepEqualJson(currentValue[inner], innerValue)) {
								summary.overwritten += 1;
								changed = true;
							}
						} else {
							summary.added += 1;
							changed = true;
						}
						merged[inner] = innerValue;
					}
					if (changed) sets.push({
						op: "set",
						path: [key],
						value: merged
					});
					continue;
				}
				for (const inner of Object.keys(fileValue)) if (has(currentValue, inner)) {
					if (!deepEqualJson(currentValue[inner], fileValue[inner])) {
						summary.overwritten += 1;
						changed = true;
					}
				} else {
					summary.added += 1;
					changed = true;
				}
				for (const inner of Object.keys(currentValue)) if (!has(fileValue, inner)) {
					summary.removed += countRemoved(currentValue[inner]);
					changed = true;
				}
				if (changed) sets.push({
					op: "set",
					path: [key],
					value: fileValue
				});
				continue;
			}
			if (!inCurrent) {
				summary.added += 1;
				sets.push({
					op: "set",
					path: [key],
					value: fileValue
				});
				continue;
			}
			if (!deepEqualJson(fileValue, currentValue)) {
				summary.overwritten += 1;
				sets.push({
					op: "set",
					path: [key],
					value: fileValue
				});
			}
		}
		const ops = [...unsets, ...sets];
		if (ops.length > 0) plans.push({
			ns: target,
			ops
		});
	}
	return {
		mode,
		summary,
		namespaces: plans,
		wiring: mergeWiringReports(reports),
		empty: plans.length === 0
	};
}
//#endregion
//#region packages/settings-ui/src/client/config-snapshot/library.ts
const PROFILES_PATH = ["profiles"];
const AUTO_BACKUP_PATH = ["autoBackup"];
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
/** Whether a stored value has the shape of a snapshot this build can apply. */
function isStoredSnapshot(value) {
	return isRecord(value) && value.kind === "dsh-thinking-effort/config-snapshot" && value.version === 1 && isRecord(value.sections);
}
/**
* Read the profile library defensively: the user layer is hand-editable (in
* `settings.yaml` before 0.1.7 and in the active profile's config after it), so
* a hand-written entry must be dropped rather than crash the settings page.
*
* `pluginNamespace` is the id the running host addresses the plugin section by
* — the Loader entry under the 0.1.7 entry-config model, and the legacy
* registered namespace on older releases. It is resolved from `namespaces`,
* the very read being keyed, so no caller can omit it and read the library as
* absent on 0.1.7; the parameter is only an override for a caller that already
* resolved the id.
*/
function profilesFromNamespaces(namespaces, pluginNamespace = pluginSectionId(namespaces)) {
	const raw = userSectionOf(namespaces, pluginNamespace).profiles;
	if (!isRecord(raw)) return {};
	const profiles = {};
	for (const [name, value] of Object.entries(raw)) {
		if (RESERVED_PATH_KEYS.includes(name)) continue;
		if (isStoredSnapshot(value)) profiles[name] = value;
	}
	return profiles;
}
/** The auto backup written before a destructive apply; absent until one is written. */
function autoBackupFromNamespaces(namespaces, pluginNamespace = pluginSectionId(namespaces)) {
	const value = userSectionOf(namespaces, pluginNamespace).autoBackup;
	if (!isStoredSnapshot(value) || value.createdAt === "") return void 0;
	return value;
}
function validateProfileName(name, existing) {
	const trimmed = name.trim();
	if (trimmed.length === 0) return {
		ok: false,
		error: "required"
	};
	if (trimmed.length > 40) return {
		ok: false,
		error: "tooLong"
	};
	if (RESERVED_PATH_KEYS.includes(trimmed)) return {
		ok: false,
		error: "reserved"
	};
	if (CONTROL_CHARACTERS.test(trimmed)) return {
		ok: false,
		error: "invalid"
	};
	if (existing.includes(trimmed)) return {
		ok: false,
		error: "taken"
	};
	return {
		ok: true,
		value: trimmed
	};
}
function saveProfileOps(name, snapshot) {
	return [{
		op: "set",
		path: [...PROFILES_PATH, name],
		value: snapshot
	}];
}
function deleteProfileOps(name) {
	return [{
		op: "unset",
		path: [...PROFILES_PATH, name]
	}];
}
function autoBackupOps(snapshot) {
	return [{
		op: "set",
		path: [...AUTO_BACKUP_PATH],
		value: snapshot
	}];
}
//#endregion
//#region packages/settings-ui/src/client/config-snapshot/apply.ts
/**
* Apply a snapshot to the live configuration.
*
* The caller's snapshot is the *source*, so it is read once up front, and every
* write is fenced with the revision that read reported — or, when an earlier
* write of this same apply moved that namespace, with the revision that write
* returned. That is what keeps a concurrent edit in another window from being
* silently overwritten. A namespace that fails does not roll back its siblings:
* a rollback is another write and can fail the same way, so the outcome names
* exactly which half applied instead.
*/
async function applySnapshot(request) {
	const { settings, snapshot, mode } = request;
	const fresh = await settings.describe();
	if (!fresh.ok) return {
		ok: false,
		skipped: false,
		outcomes: [],
		restartRequired: []
	};
	const namespaces = fresh.value.namespaces;
	const pluginNamespace = request.pluginNamespace ?? pluginSectionId(namespaces);
	const plan = planImport(snapshot, namespaces, mode, {
		importWiring: request.importWiring ?? false,
		pluginNamespace
	});
	if (plan.empty) return {
		ok: true,
		skipped: true,
		outcomes: [],
		restartRequired: []
	};
	let autoBackupError;
	let backedUpNamespace;
	if (request.autoBackup) {
		const backup = await writeAutoBackup(request, namespaces, pluginNamespace);
		autoBackupError = backup.error;
		backedUpNamespace = backup.namespace;
	}
	const revisionFor = (ns) => {
		if (backedUpNamespace !== void 0 && backedUpNamespace.ns === ns && typeof backedUpNamespace.revision === "number") return backedUpNamespace.revision;
		return revisionOf(namespaces, ns);
	};
	const outcomes = [];
	for (const namespacePlan of plan.namespaces) {
		const response = await settings.mutate(namespacePlan.ns, namespacePlan.ops, revisionFor(namespacePlan.ns));
		if (response.ok) {
			outcomes.push({
				ns: namespacePlan.ns,
				ok: true,
				revision: response.value.revision
			});
			continue;
		}
		outcomes.push({
			ns: namespacePlan.ns,
			ok: false,
			error: response.error.message,
			conflict: isSettingsConflict(response.error)
		});
	}
	const applied = new Set(outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.ns));
	return {
		ok: outcomes.every((outcome) => outcome.ok),
		skipped: false,
		outcomes,
		...autoBackupError === void 0 ? {} : { autoBackupError },
		restartRequired: namespaces.filter((entry) => entry.applies === "restart" && applied.has(entry.ns)).map((entry) => entry.ns)
	};
}
/**
* Back up the pre-apply configuration; a failure here must not look like an
* apply failure. The write is fenced with the plugin namespace revision from
* the read at the top of the apply: nothing has written that namespace yet, so
* that revision is still the current one, and a second `describe()` would only
* read the same value back.
*/
async function writeAutoBackup(request, preApply, pluginNamespace) {
	const { settings, now, pluginVersion } = request;
	const backup = snapshotFromNamespaces(preApply, {
		createdAt: (now ?? (() => /* @__PURE__ */ new Date()))().toISOString(),
		pluginVersion: pluginVersion ?? "",
		sourceProfile: "unknown"
	}, pluginNamespace);
	const revision = revisionOf(preApply, pluginNamespace);
	const response = await settings.mutate(pluginNamespace, autoBackupOps(backup), revision);
	return response.ok ? { namespace: response.value } : { error: response.error.message };
}
//#endregion
//#region packages/settings-ui/src/client/config-snapshot/parse.ts
function byteLength(text) {
	return typeof TextEncoder === "function" ? new TextEncoder().encode(text).length : text.length;
}
/**
* Nesting levels the reserved-key walk descends before refusing the section. A
* snapshot holds a handful of levels of settings objects, so the bound never
* rejects real configuration — it keeps the walk's recursion finite instead of
* leaving it to whatever stack the host happens to have.
*/
const MAX_SECTION_DEPTH = 100;
/** Walk result for a value nested `MAX_SECTION_DEPTH` levels or deeper. */
const DEPTH_EXCEEDED = Symbol("sectionDepthExceeded");
/**
* First reserved path segment found anywhere in the value, if any, or
* `DEPTH_EXCEEDED` when the value nests `MAX_SECTION_DEPTH` levels or deeper.
*/
function findReservedKey(value, depth = 0) {
	if (depth >= MAX_SECTION_DEPTH) return DEPTH_EXCEEDED;
	if (Array.isArray(value)) {
		for (const entry of value) {
			const found = findReservedKey(entry, depth + 1);
			if (found !== void 0) return found;
		}
		return;
	}
	if (!isRecord(value)) return void 0;
	for (const [key, entry] of Object.entries(value)) {
		if (RESERVED_PATH_KEYS.includes(key)) return key;
		const found = findReservedKey(entry, depth + 1);
		if (found !== void 0) return found;
	}
}
function text(value, fallback) {
	return typeof value === "string" && value.length > 0 ? value : fallback;
}
/**
* Validate an untrusted snapshot document. Every failure refuses the whole
* file: a partial import would persist half a configuration while reporting
* success. Unknown namespaces are the one tolerated deviation, because a
* snapshot written by a newer plugin is otherwise still usable.
*/
function parseSnapshot(input) {
	if (byteLength(input) > 2097152) return {
		ok: false,
		error: {
			code: "tooLarge",
			params: { maxBytes: SNAPSHOT_MAX_BYTES }
		}
	};
	let document;
	try {
		document = JSON.parse(input);
	} catch {
		return {
			ok: false,
			error: { code: "invalidJson" }
		};
	}
	if (!isRecord(document)) return {
		ok: false,
		error: { code: "notObject" }
	};
	if (document.kind !== "dsh-thinking-effort/config-snapshot") return {
		ok: false,
		error: {
			code: "kindMismatch",
			params: { kind: SNAPSHOT_KIND }
		}
	};
	if (document.version !== 1) return {
		ok: false,
		error: {
			code: "unsupportedVersion",
			params: {
				version: document.version,
				supported: 1
			}
		}
	};
	const rawSections = document.sections;
	if (!isRecord(rawSections)) return {
		ok: false,
		error: { code: "missingSections" }
	};
	const ignoredNamespaces = [];
	const sections = {};
	for (const [ns, section] of Object.entries(rawSections)) {
		if (!isRecord(section)) return {
			ok: false,
			error: {
				code: "invalidSection",
				params: { ns }
			}
		};
		if (ns !== LLM_NAMESPACE && !isOpenCodeSessionSectionId(ns)) {
			ignoredNamespaces.push(ns);
			continue;
		}
		const reserved = findReservedKey(section);
		if (reserved === DEPTH_EXCEEDED) return {
			ok: false,
			error: {
				code: "invalidSection",
				params: {
					ns,
					maxDepth: MAX_SECTION_DEPTH
				}
			}
		};
		if (reserved !== void 0) return {
			ok: false,
			error: {
				code: "reservedKey",
				params: {
					key: reserved,
					ns
				}
			}
		};
		sections[ns] = section;
	}
	sections[LLM_NAMESPACE] ??= {};
	if (!Object.keys(sections).some((ns) => isOpenCodeSessionSectionId(ns))) sections[PLUGIN_NAMESPACE] = {};
	return {
		ok: true,
		value: {
			snapshot: {
				kind: SNAPSHOT_KIND,
				version: 1,
				createdAt: text(document.createdAt, ""),
				pluginVersion: text(document.pluginVersion, ""),
				sourceProfile: text(document.sourceProfile, "unknown"),
				sections
			},
			ignoredNamespaces
		}
	};
}
/** Pretty-printed with a trailing newline so the file diffs cleanly in version control. */
function serializeSnapshot(snapshot) {
	return `${JSON.stringify(snapshot, null, 2)}\n`;
}
//#endregion
//#region packages/settings-ui/src/client/components/config-backup/card-state.ts
/**
* The parser failure codes the card can display, mapped to their copy.
*
* Kept as an exhaustive record rather than a `switch` so a new code added to
* `ParseFailure` fails the type check here instead of silently rendering
* nothing.
*/
const PARSE_ERROR_KEYS = {
	tooLarge: "backupParseTooLarge",
	invalidJson: "backupParseInvalidJson",
	notObject: "backupParseNotObject",
	kindMismatch: "backupParseKindMismatch",
	unsupportedVersion: "backupParseVersion",
	missingSections: "backupParseSections",
	invalidSection: "backupParseSection",
	reservedKey: "backupParseReserved"
};
/** The profile-name validation failures, mapped to their copy the same way. */
const NAME_ERROR_KEYS = {
	required: "backupNameRequired",
	tooLong: "backupNameTooLong",
	reserved: "backupNameReserved",
	invalid: "backupNameInvalid",
	taken: "backupNameTaken"
};
const initialState$1 = {
	open: false,
	namespaces: [],
	writable: true,
	profiles: {},
	profileNames: [],
	autoBackupAt: null,
	nameDraft: "",
	pendingDelete: null,
	preview: null,
	mode: "merge",
	importWiring: false,
	busy: false,
	error: null,
	notice: []
};
/**
* Fold one `describe` answer into the card state.
*
* One describe answer is the whole registry, and three consumers read it — the
* profile library, the export snapshot and the import summary — so they all take
* it through this mapping and cannot disagree about what the settings hold. The
* library readers resolve the plugin section's id from this same read, so under
* the 0.1.7 entry-config model they key on the Loader entry rather than the
* legacy registered namespace.
*/
function withNamespaces(current, value) {
	const namespaces = value.namespaces;
	const profiles = profilesFromNamespaces(namespaces);
	return {
		...current,
		namespaces,
		writable: value.writable !== false,
		profiles,
		profileNames: Object.keys(profiles).sort(),
		autoBackupAt: autoBackupFromNamespaces(namespaces)?.createdAt ?? null
	};
}
/** The snapshot metadata stamped onto every export this card produces. */
function snapshotMeta(now, profile) {
	return {
		createdAt: now().toISOString(),
		pluginVersion: PLUGIN_VERSION,
		sourceProfile: profile
	};
}
//#endregion
//#region packages/settings-ui/src/client/components/config-backup/derive.ts
/**
* The outcomes of the writes themselves, reported beside the apply result
* rather than inside it: a copy that could not be written is not a failed
* write, and a namespace that needs a restart is not a failure either. These
* are true of every apply that reached the writes, so a half-applied plan
* reports them too — a namespace that failed does not unsay a namespace that
* landed.
*/
function applyWarnings(outcome, t) {
	const warnings = [];
	if (outcome.restartRequired.length > 0) warnings.push(t("backupRestartRequired", { namespaces: outcome.restartRequired.join(", ") }));
	if (outcome.autoBackupError !== void 0) warnings.push(t("backupAutoBackupFailed", { message: outcome.autoBackupError }));
	return warnings;
}
/** The namespaces whose writes were accepted, in plan order. */
function appliedNamespaces(outcome) {
	return outcome.outcomes.filter((entry) => entry.ok).map((entry) => entry.ns);
}
//#endregion
//#region packages/settings-ui/src/client/components/config-backup/legacy-rescan.ts
/**
* Read the legacy-migration control object out of the plugin's own section.
*
* `available` is false on a host that does not publish the Loader entry section,
* because `installLegacyMigration` only subscribes to that one: the button there
* would write a `decision` nobody consumes or clears into the user's settings
* document, so the whole block is withheld rather than shown inert.
*
* The result mapping is explicit rather than a catch-all: an unrecognized value —
* a hand-edited section, or a result a later Host adds — is reported as nothing
* rather than mislabelled as "nothing pending". A completed rescan that found
* nothing is the Host's own `nothing-pending`, which is the one sentence this
* manual entry point exists to show.
*/
function legacyRescanView(ownSection, t) {
	const state = legacyMigrationOf(ownSection?.user);
	const result = typeof state?.lastResult === "string" ? state.lastResult : "";
	const failed = result.startsWith(LEGACY_FAILED_PREFIX);
	const message = (() => {
		if (result === "") return null;
		if (failed) return t("legacyMigrationFailed", { reason: result.slice(7).trim() });
		if (result === "applied") return t("legacyMigrationApplied");
		if (result === "dismissed") return t("legacyMigrationDismissed");
		if (result === "nothing-pending") return t("legacyMigrationNothingPending");
		return null;
	})();
	return {
		available: isPluginEntrySection(ownSection),
		message,
		failed,
		result
	};
}
//#endregion
//#region packages/settings-ui/src/client/components/ConfigBackupCard.tsx
function ConfigBackupCard({ migrationEnabled = true, settings, palette, t, onApplied, download = downloadJson, now }) {
	const [state, setState] = react.default.useState(initialState$1);
	const fileInput = react.default.useRef(null);
	/**
	* Ordinal of the newest file read. Two selections in quick succession can
	* resolve out of order, and the slower earlier read would otherwise install
	* its preview over the file the user chose last — and confirmation writes the
	* preview, so the token is what keeps consent attached to the last choice.
	*/
	const readToken = react.default.useRef(0);
	const clock = () => (now ?? (() => /* @__PURE__ */ new Date()))();
	/**
	* Re-read the registry into the card. The refresh writes only the fields it
	* read, and never the error slot: every caller that means to clear a failure
	* clears it on the way into its own action, while a partial apply installs its
	* report and refreshes in one step — a refresh that cleared the error there
	* would erase the only message naming the namespace that was not written.
	*/
	const load = () => {
		settings.describe().then((response) => {
			if (!response.ok) {
				setState((current) => ({
					...current,
					busy: false,
					error: response.error.message
				}));
				return;
			}
			setState((current) => ({
				...withNamespaces(current, response.value),
				busy: false
			}));
		}).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			setState((current) => ({
				...current,
				busy: false,
				error: message
			}));
		});
	};
	react.default.useEffect(() => {
		load();
	}, []);
	/**
	* The id this host addresses the plugin section by, resolved from the read
	* the caller is working with and falling back to the legacy registered
	* namespace. Every write and every snapshot key uses it.
	*/
	const pluginId = (namespaces = state.namespaces) => pluginSectionId(namespaces);
	const fail = (message) => setState((current) => ({
		...current,
		busy: false,
		notice: [],
		error: message
	}));
	const failImport = (message) => setState((current) => ({
		...current,
		busy: false,
		notice: [],
		error: message,
		preview: null
	}));
	const freshSnapshot = async () => {
		setState((current) => ({
			...current,
			busy: true,
			error: null,
			notice: []
		}));
		try {
			const response = await settings.describe();
			if (!response.ok) {
				fail(response.error.message);
				return;
			}
			const namespaces = response.value.namespaces;
			const fresh = {
				snapshot: snapshotFromNamespaces(namespaces, snapshotMeta(clock, settings.compatibilityProfile), pluginId(namespaces)),
				revision: revisionOf(namespaces, pluginId(namespaces))
			};
			setState((current) => ({
				...current,
				busy: false
			}));
			return fresh;
		} catch (error) {
			fail(error instanceof Error ? error.message : String(error));
			return;
		}
	};
	const exportCurrent = () => {
		freshSnapshot().then((fresh) => {
			if (fresh === void 0) return;
			download(snapshotFileName(clock()), serializeSnapshot(fresh.snapshot));
		});
	};
	const exportProfile = (name) => {
		const stored = state.profiles[name];
		if (stored === void 0) return;
		download(snapshotFileName(clock()), serializeSnapshot(stored));
	};
	const saveProfile = () => {
		if (state.profileNames.length >= 20) {
			fail(t("backupProfileLimit", { max: 20 }));
			return;
		}
		const validated = validateProfileName(state.nameDraft, state.profileNames);
		if (!validated.ok) {
			fail(t(NAME_ERROR_KEYS[validated.error], { max: 40 }));
			return;
		}
		const name = validated.value;
		freshSnapshot().then((fresh) => {
			if (fresh === void 0) return;
			setState((current) => ({
				...current,
				busy: true,
				error: null,
				notice: []
			}));
			settings.mutate(pluginId(), saveProfileOps(name, fresh.snapshot), fresh.revision).then((response) => {
				if (!response.ok) {
					fail(t("backupSaveProfileFailed", { message: response.error.message }));
					return;
				}
				setState((current) => ({
					...current,
					busy: false,
					nameDraft: "",
					notice: [t("backupSavedProfile", { name })]
				}));
				load();
			}).catch((error) => {
				fail(t("backupSaveProfileFailed", { message: error instanceof Error ? error.message : String(error) }));
			});
		});
	};
	const removeProfile = (name) => {
		freshSnapshot().then((fresh) => {
			if (fresh === void 0) return;
			setState((current) => ({
				...current,
				busy: true,
				error: null,
				notice: []
			}));
			settings.mutate(pluginId(), deleteProfileOps(name), fresh.revision).then((response) => {
				if (!response.ok) {
					fail(t("backupDeleteProfileFailed", { message: response.error.message }));
					return;
				}
				setState((current) => ({
					...current,
					busy: false,
					pendingDelete: null
				}));
				load();
			}).catch((error) => {
				fail(t("backupDeleteProfileFailed", { message: error instanceof Error ? error.message : String(error) }));
			});
		});
	};
	const refreshNamespaces = async () => {
		try {
			const response = await settings.describe();
			if (!response.ok) return;
			setState((current) => withNamespaces(current, response.value));
		} catch {}
	};
	const legacy = legacyRescanView(pluginSection(state.namespaces), t);
	const legacyRescanAvailable = migrationEnabled && legacy.available;
	const [legacyBusy, setLegacyBusy] = react.default.useState(false);
	const rescanLegacyData = async () => {
		if (!legacyRescanAvailable) return;
		const fresh = await freshSnapshot();
		if (fresh === void 0) return;
		setLegacyBusy(true);
		try {
			const response = await settings.mutate(pluginId(), [{
				op: "set",
				path: ["legacyMigration", "decision"],
				value: "scan"
			}], fresh.revision);
			if (!response.ok) {
				fail(t("legacyMigrationFailed", { reason: response.error.message }));
				return;
			}
		} catch (error) {
			fail(t("legacyMigrationFailed", { reason: error instanceof Error ? error.message : String(error) }));
			return;
		} finally {
			setLegacyBusy(false);
		}
		load();
	};
	const openPreview = (snapshot, label, ignored = []) => {
		setState((current) => ({
			...current,
			error: null,
			notice: [],
			mode: "merge",
			importWiring: false,
			preview: {
				snapshot,
				label,
				ignored
			}
		}));
		refreshNamespaces();
	};
	/**
	* Preview the stored rollback copy, keyed by the same resolved plugin id as
	* every other read. The copy is re-read here rather than passed down from the
	* header, which only renders the timestamp: an id that disagreed with the one
	* the library used would hand `openPreview` `undefined`, and the preview
	* dereferences the snapshot. Returning without a preview is the whole failure
	* mode — a refresh can legitimately drop a copy the mount read still saw.
	*/
	const openAutoBackupPreview = () => {
		const backup = autoBackupFromNamespaces(state.namespaces, pluginId());
		if (backup === void 0) return;
		openPreview(backup, t("backupSourceAutoBackup"));
	};
	const onFileChange = (event) => {
		const input = event.currentTarget;
		const file = input.files?.[0];
		if (file === void 0) return;
		readToken.current += 1;
		const token = readToken.current;
		const current = () => readToken.current === token;
		file.text().then((content) => {
			if (!current()) return;
			const parsed = parseSnapshot(content);
			if (!parsed.ok) {
				failImport(t(PARSE_ERROR_KEYS[parsed.error.code], parsed.error.params ?? {}));
				return;
			}
			openPreview(parsed.value.snapshot, t("backupSourceFile"), parsed.value.ignoredNamespaces);
		}).catch((error) => {
			if (!current()) return;
			failImport(t("backupReadFailed", { message: error instanceof Error ? error.message : String(error) }));
		}).finally(() => {
			input.value = "";
		});
	};
	const confirmImport = () => {
		const pending = state.preview;
		if (pending === null) return;
		setState((current) => ({
			...current,
			busy: true,
			error: null,
			notice: []
		}));
		applySnapshot({
			snapshot: pending.snapshot,
			mode: state.mode,
			importWiring: state.importWiring,
			settings,
			autoBackup: true,
			now: clock,
			pluginVersion: PLUGIN_VERSION
		}).then((outcome) => {
			if (outcome.skipped) {
				setState((current) => ({
					...current,
					busy: false,
					preview: null,
					notice: [t("backupSkipped")]
				}));
				return;
			}
			const failed = outcome.outcomes.filter((entry) => !entry.ok);
			if (failed.length > 0) {
				const partial = t("backupAppliedPartial", { detail: failed.map((entry) => `${entry.ns}: ${entry.error ?? ""}`).join("; ") });
				const conflicted = failed.some((entry) => entry.conflict === true);
				const applied = appliedNamespaces(outcome);
				const notice = [...applied.length === 0 ? [] : [t("backupAppliedPartial", { detail: applied.join(", ") })], ...applyWarnings(outcome, t)];
				setState((current) => ({
					...current,
					busy: false,
					preview: null,
					notice,
					error: conflicted ? `${t("backupConflict")} — ${partial}` : partial
				}));
				load();
				return;
			}
			const notice = [t("backupApplied"), ...applyWarnings(outcome, t)];
			setState((current) => ({
				...current,
				busy: false,
				preview: null,
				notice
			}));
			onApplied();
			load();
		}).catch((error) => {
			setState((current) => ({
				...current,
				busy: false,
				preview: null,
				error: t("backupImportFailed", { message: error instanceof Error ? error.message : String(error) })
			}));
		});
	};
	const previewPlan = state.preview === null ? null : planImport(state.preview.snapshot, state.namespaces, state.mode, { importWiring: state.importWiring });
	const previewPluginKey = state.preview === null ? pluginId() : pluginSectionKey(state.preview.snapshot.sections, pluginId());
	const previewKeys = state.preview === null ? [] : Object.keys(state.preview.snapshot.sections[previewPluginKey] ?? {});
	const previewLibraryOnly = previewKeys.length > 0 && previewKeys.every((key) => isSnapshotLibraryKey(previewPluginKey, key));
	const wiringDetail = previewPlan === null ? "" : [...previewPlan.wiring.endpoints.map((entry) => `${entry.provider} → ${entry.baseURL}`), ...previewPlan.wiring.script === void 0 ? [] : [previewPlan.wiring.script]].join(", ");
	const readOnly = !state.writable;
	const profileCount = state.profileNames.length;
	const hint = profileCount === 0 ? t("backupCollapsedHintEmpty") : t("backupCollapsedHint", { count: profileCount });
	const muted = {
		color: palette.secondary,
		fontSize: "11px",
		lineHeight: "16px"
	};
	const sectionTitle = {
		fontSize: "12px",
		fontWeight: 700,
		marginBottom: "3px"
	};
	const field = {
		height: "28px",
		padding: "0 8px",
		border: `1px solid ${palette.border}`,
		borderRadius: "8px",
		fontSize: "12px",
		backgroundColor: palette.field,
		color: palette.text,
		outline: "none"
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		"data-scope": "config-backup",
		style: {
			backgroundColor: palette.group,
			border: `1px solid ${palette.border}`,
			borderRadius: "8px",
			boxShadow: palette.shadow,
			overflow: "hidden",
			marginBottom: "8px"
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "7px",
					padding: "7px 8px",
					fontSize: "13px",
					fontWeight: 700
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
					name: "layers",
					size: 15
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					"aria-label": t("backupCardTitle"),
					"aria-expanded": state.open,
					onClick: () => setState((current) => ({
						...current,
						open: !current.open
					})),
					style: {
						display: "flex",
						alignItems: "center",
						gap: "6px",
						flex: "1 1 auto",
						minWidth: 0,
						padding: 0,
						border: "none",
						background: "transparent",
						color: palette.text,
						font: "inherit",
						letterSpacing: 0,
						cursor: "pointer",
						textAlign: "left"
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("backupCardTitle") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								marginLeft: "auto",
								color: palette.secondary,
								fontSize: "11px",
								fontWeight: 600
							},
							children: hint
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: state.open ? "chevronUp" : "chevronDown",
							size: 14
						})
					]
				})]
			}),
			state.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				role: "alert",
				"aria-live": "assertive",
				style: {
					fontSize: "12px",
					lineHeight: "18px",
					color: palette.danger,
					backgroundColor: palette.dangerBg,
					border: `1px solid ${palette.dangerBorder}`,
					borderRadius: "8px",
					padding: "6px 8px",
					margin: "0 8px 8px"
				},
				children: state.error
			}) : null,
			state.notice.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				role: "status",
				"aria-live": "polite",
				style: {
					fontSize: "12px",
					lineHeight: "18px",
					color: palette.accent,
					backgroundColor: palette.accentSoft,
					border: `1px solid ${palette.accentBorder}`,
					borderRadius: "8px",
					padding: "6px 8px",
					margin: "0 8px 8px",
					whiteSpace: "pre-line"
				},
				children: state.notice.join("\n")
			}),
			state.open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "grid",
					gap: "9px",
					padding: "8px",
					borderTop: `1px solid ${palette.divider}`
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: sectionTitle,
							children: t("backupProfilesTitle")
						}),
						profileCount === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: muted,
							children: t("backupProfilesEmpty")
						}) : state.profileNames.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: "6px",
								padding: "3px 0"
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										flex: "1 1 auto",
										minWidth: 0,
										fontSize: "12px",
										overflowWrap: "anywhere"
									},
									children: name
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: muted,
									children: (state.profiles[name]?.createdAt ?? "").slice(0, 10)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
									text: t("backupApply"),
									onClick: () => openPreview(state.profiles[name], t("backupSourceProfile", { name })),
									disabled: state.busy || readOnly,
									palette,
									icon: "check"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
									text: t("backupExportProfile"),
									onClick: () => exportProfile(name),
									disabled: state.busy,
									palette
								}),
								state.pendingDelete === name ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
									text: t("backupDeleteConfirm"),
									onClick: () => removeProfile(name),
									disabled: state.busy || readOnly,
									tone: "danger",
									palette
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
									text: t("backupCancel"),
									onClick: () => setState((current) => ({
										...current,
										pendingDelete: null
									})),
									disabled: state.busy,
									palette
								})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
									text: t("backupDeleteProfile"),
									onClick: () => setState((current) => ({
										...current,
										pendingDelete: name
									})),
									disabled: state.busy || readOnly,
									tone: "danger",
									palette
								})
							]
						}, name)),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: "6px",
								alignItems: "center",
								paddingTop: "4px"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "text",
								value: state.nameDraft,
								placeholder: t("backupProfileNamePlaceholder"),
								"aria-label": t("backupProfileNamePlaceholder"),
								onChange: (event) => {
									const value = event.currentTarget.value;
									setState((current) => ({
										...current,
										notice: [],
										nameDraft: value
									}));
								},
								style: {
									...field,
									flex: "1 1 auto",
									minWidth: 0
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
								text: t("backupSaveCurrent"),
								onClick: saveProfile,
								disabled: state.busy || readOnly,
								tone: "primary",
								palette,
								icon: "check"
							})]
						})
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: sectionTitle,
							children: t("backupExportCurrent")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
							text: t("backupExportCurrent"),
							onClick: exportCurrent,
							disabled: state.busy,
							palette
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								...muted,
								paddingTop: "3px"
							},
							children: t("backupExportHint")
						})
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: sectionTitle,
							children: t("backupImportTitle")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							ref: fileInput,
							type: "file",
							accept: "application/json,.json",
							onChange: onFileChange,
							style: { display: "none" }
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
							text: t("backupImportChoose"),
							onClick: () => fileInput.current?.click(),
							disabled: state.busy || readOnly,
							palette
						})
					] }),
					readOnly ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: muted,
						children: t("backupReadOnly")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: sectionTitle,
						children: t("backupAutoBackupTitle")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: "6px"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: muted,
							children: state.autoBackupAt === null ? t("backupAutoBackupNone") : state.autoBackupAt
						}), state.autoBackupAt === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
							text: t("backupAutoBackupRestore"),
							onClick: openAutoBackupPreview,
							disabled: state.busy || readOnly,
							palette,
							icon: "restore"
						})]
					})] }),
					state.preview === null || previewPlan === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "grid",
							gap: "6px",
							border: `1px solid ${palette.accentBorder}`,
							borderRadius: "8px",
							backgroundColor: palette.accentSoft,
							padding: "7px 8px"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									fontSize: "12px",
									fontWeight: 700
								},
								children: t("backupPreviewTitle")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: muted,
								children: [state.preview.label, state.preview.snapshot.createdAt === "" ? "" : ` · ${state.preview.snapshot.createdAt.slice(0, 10)}`]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								value: state.mode,
								"aria-label": t("backupPreviewTitle"),
								onChange: (event) => {
									const value = event.currentTarget.value;
									setState((current) => ({
										...current,
										mode: value === "replace" ? "replace" : "merge"
									}));
								},
								style: {
									...field,
									colorScheme: "light dark"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "merge",
									children: t("backupModeMerge")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "replace",
									children: t("backupModeReplace")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: { fontSize: "12px" },
								children: previewPlan.empty ? t(previewLibraryOnly ? "backupSummaryLibraryOnly" : "backupSummaryEmpty") : t("backupSummary", {
									added: previewPlan.summary.added,
									overwritten: previewPlan.summary.overwritten,
									removed: previewPlan.summary.removed
								})
							}),
							previewPlan.wiring.count === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "grid",
									gap: "4px"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											...muted,
											color: palette.secondary
										},
										children: state.importWiring ? t("backupWiringWarning") : t("backupWiringSkipped", { count: previewPlan.wiring.count })
									}),
									!state.importWiring || wiringDetail === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											...muted,
											color: palette.secondary
										},
										children: wiringDetail
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										style: {
											display: "flex",
											alignItems: "center",
											gap: "5px",
											fontSize: "12px"
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: state.importWiring,
											onChange: (event) => {
												const checked = event.currentTarget.checked;
												setState((current) => ({
													...current,
													importWiring: checked
												}));
											}
										}), t("backupWiringInclude")]
									})
								]
							}),
							state.preview.ignored.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: muted,
								children: t("backupIgnored", { count: state.preview.ignored.length })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									gap: "6px"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
									text: t("backupConfirmImport"),
									onClick: confirmImport,
									disabled: state.busy || readOnly || previewPlan.empty,
									tone: "primary",
									palette,
									icon: "check"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
									text: t("backupCancel"),
									onClick: () => setState((current) => ({
										...current,
										preview: null
									})),
									disabled: state.busy,
									palette
								})]
							})
						]
					})
				]
			}) : null,
			legacyRescanAvailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					marginTop: "12px",
					paddingTop: "12px",
					paddingLeft: "8px",
					paddingRight: "8px",
					borderTop: `1px solid ${palette.divider}`
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: sectionTitle,
						children: t("legacyMigrationRescan")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...muted,
							margin: "3px 0 8px"
						},
						children: t("legacyMigrationRescanHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
						text: t("legacyMigrationRescan"),
						onClick: () => {
							rescanLegacyData();
						},
						disabled: legacyBusy,
						palette,
						icon: "restore",
						testId: "legacy-rescan"
					}),
					legacy.message === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "status",
						style: {
							...muted,
							marginTop: "8px",
							color: legacy.failed ? palette.danger : legacy.result === "applied" ? palette.accent : palette.secondary
						},
						children: legacy.message
					})
				]
			}) : null
		]
	});
}
//#endregion
//#region packages/settings-ui/src/client/opencode-format-validation.ts
/**
* The section the generator settings live in — the legacy registered namespace.
* Under the 0.1.7 entry-config model they live in the plugin's own entry
* section instead, so the card that reads and writes them is handed the id
* `pluginSectionId` resolved from its own `describe()`.
*/
const FORMAT_NAMESPACE = OPENCODE_SESSION_NAMESPACE;
/** The path prefix every generated op addresses. */
const FORMAT_PATH = ["opencodeSession", "format"];
/** The seven editable fields, in the order the card renders them. */
const FORMAT_KEYS = [
	"mode",
	"time",
	"template",
	"expression",
	"script",
	"validate",
	"onInvalid"
];
/**
* Must equal the schema defaults in `src/host/plugin-settings.ts`. Kept as a
* literal rather than derived from the schema because the client bundle does
* not import the host schema.
*/
const DEFAULT_FORMAT_DRAFT = {
	mode: "ses-derive",
	time: "firstUse",
	template: "",
	expression: "",
	script: "",
	validate: "",
	onInvalid: "warn"
};
function record(value) {
	return isUnknownRecord(value) ? value : void 0;
}
function own(value, key) {
	const object = record(value);
	if (object === void 0 || !Object.prototype.hasOwnProperty.call(object, key)) return void 0;
	return object[key];
}
function enumValue(value, allowed, fallback) {
	return typeof value === "string" && allowed.includes(value) ? value : fallback;
}
function stringValue(value, fallback) {
	return typeof value === "string" ? value : fallback;
}
/**
* Read a draft from a namespace's raw user layer.
*
* Unsupported enum values fall back exactly the way the Host resolves them, so
* the card never shows a mode the Host would not honour. The string fields are
* taken verbatim, including values the Host would reject at runtime: showing
* the stored text is what lets the user see and repair a bad entry.
*/
function draftFromSettings(stored) {
	const format = own(own(stored, "opencodeSession"), "format");
	return {
		mode: enumValue(own(format, "mode"), FORMAT_MODES, DEFAULT_FORMAT_DRAFT.mode),
		time: enumValue(own(format, "time"), FORMAT_TIMES, DEFAULT_FORMAT_DRAFT.time),
		template: stringValue(own(format, "template"), DEFAULT_FORMAT_DRAFT.template),
		expression: stringValue(own(format, "expression"), DEFAULT_FORMAT_DRAFT.expression),
		script: stringValue(own(format, "script"), DEFAULT_FORMAT_DRAFT.script),
		validate: stringValue(own(format, "validate"), DEFAULT_FORMAT_DRAFT.validate),
		onInvalid: enumValue(own(format, "onInvalid"), FORMAT_INVALID_POLICIES, DEFAULT_FORMAT_DRAFT.onInvalid)
	};
}
/** Whether `value` is an absolute path on POSIX or Windows. */
function isAbsolutePath(value) {
	if (value.startsWith("/")) return true;
	return /^[A-Za-z]:[\\/]/.test(value);
}
/**
* Every reason this draft would not do what it appears to say.
*
* The rules mirror `resolveFormatConfig` in the Host: a source it cannot parse
* silently becomes "no validation at all", and an empty `template` /
* `expression` / `script` silently falls back to `ses-derive`. Both cases look
* configured to the user while behaving differently, which is exactly what the
* card has to refuse.
*
* An `expression` is therefore checked past its syntax: the evaluator throws on
* a name it does not know, the Host catches that together with every other
* evaluation failure, and the same silent fallback follows. A misspelled
* identifier or helper would read as configured while behaving as if the card
* had never been filled in.
*/
function formatFieldErrors(draft) {
	const problems = [];
	if (draft.validate.trim() !== "") try {
		new RegExp(draft.validate);
	} catch {
		problems.push({
			field: "validate",
			error: "validateRegex"
		});
	}
	if (draft.mode === "template" && draft.template.trim() === "") problems.push({
		field: "template",
		error: "templateRequired"
	});
	if (draft.mode === "expression") {
		if (draft.expression.trim() === "") problems.push({
			field: "expression",
			error: "expressionRequired"
		});
		else try {
			const names = collectExpressionNames(parseExpression(draft.expression));
			const unknownRef = names.refs.find((name) => !SESSION_CONTEXT_KEYS.includes(name));
			const unknownCall = names.calls.find((name) => !EXPRESSION_HELPER_NAMES.includes(name));
			if (unknownRef !== void 0 || unknownCall !== void 0) problems.push({
				field: "expression",
				error: "expressionUnknownName"
			});
		} catch {
			problems.push({
				field: "expression",
				error: "expressionSyntax"
			});
		}
	}
	if (draft.mode === "script") {
		if (draft.script.trim() === "") problems.push({
			field: "script",
			error: "scriptRequired"
		});
		else if (!isAbsolutePath(draft.script.trim())) problems.push({
			field: "script",
			error: "scriptNotAbsolute"
		});
	}
	return problems;
}
/**
* One `set` op per changed field, so saving the generator never rewrites the
* other keys this namespace holds — the profile library, the rollback copy,
* and the per-model session switches the model editor owns.
*
* A whitespace-only `validate` is written as the empty string. The Host treats
* any non-empty source as a filter, and whitespace compiles to a regex nothing
* matches, so an accidental space would otherwise be stored as "drop every
* value" — the opposite of what the field looks like it says.
*/
function formatOps(draft, saved) {
	const ops = [];
	for (const key of FORMAT_KEYS) {
		const value = key === "validate" && draft.validate.trim() === "" ? "" : draft[key];
		if (value === saved[key]) continue;
		ops.push({
			op: "set",
			path: [...FORMAT_PATH, key],
			value
		});
	}
	return ops;
}
//#endregion
//#region packages/settings-ui/src/client/components/OpenCodeFormatCard.tsx
/**
* Localization keys for the five generator modes. Typed as a complete map over
* the shared mode list, so adding a mode there without a label here is a type
* error rather than an option that renders its raw key name.
*/
const MODE_LABEL_KEYS = {
	"ses-derive": "formatModeSesDerive",
	"passthrough": "formatModePassthrough",
	"template": "formatModeTemplate",
	"expression": "formatModeExpression",
	"script": "formatModeScript"
};
/** Localization key naming each enum field in the fallback notice. */
const ENUM_LABEL_KEYS = {
	mode: "formatModeLabel",
	time: "formatTimeLabel",
	onInvalid: "formatOnInvalidLabel"
};
/** Localization keys for the three invalid policies, in `FORMAT_INVALID_POLICIES` order. */
const POLICY_LABEL_KEYS = {
	"warn": "formatOnInvalidWarn",
	"drop": "formatOnInvalidDrop",
	"send": "formatOnInvalidSend"
};
/**
* Localization key per validation problem.
*
* Every `FormatFieldError` needs an entry: the card has already refused the
* write at this point, so an unmapped problem would show its raw key name and
* leave the user without the reason the Apply button is dark.
*/
const ERROR_LABEL_KEYS = {
	validateRegex: "formatErrValidateRegex",
	templateRequired: "formatErrTemplateRequired",
	expressionRequired: "formatErrExpressionRequired",
	expressionSyntax: "formatErrExpressionSyntax",
	expressionUnknownName: "formatErrExpressionUnknownName",
	scriptRequired: "formatErrScriptRequired",
	scriptNotAbsolute: "formatErrScriptNotAbsolute"
};
/** The hint key shown under each free-text field, keyed by field. */
const HINT_LABEL_KEYS = {
	template: "formatTemplateHint",
	expression: "formatExpressionHint",
	script: "formatScriptHint",
	validate: "formatValidateHint"
};
/**
* The modes whose value consumes the timestamp source. Only `passthrough`
* never does: it hands `request.sessionId` straight to validation, while
* `ses-derive` derives from the source and `template`, `expression` and
* `script` all read `hex12` through `context(request, session, config.time)` —
* as does `derive(session, config.time)`, which each of them falls back to when
* its source is empty or fails.
*
* Derived from the shared mode list rather than listed again, so a mode added
* there is offered its timestamp source by default instead of silently losing
* the control.
*/
const TIME_MODES = FORMAT_MODES.filter((mode) => mode !== "passthrough");
const initialState = {
	open: false,
	saved: DEFAULT_FORMAT_DRAFT,
	draft: DEFAULT_FORMAT_DRAFT,
	unsupportedStored: [],
	writable: true,
	busy: false,
	error: null,
	notice: null
};
function userOf(namespaces, namespace) {
	return namespaces.find((entry) => entry.ns === namespace)?.user;
}
/**
* Stored enum values the Host would reject, with the value it resolves them to.
*
* All three enum fields are reported, not just `mode`: a hand-written document
* can put garbage in any of them, and showing the resolved default without
* saying so leaves the user unable to tell "stored as firstUse" from "stored as
* garbage, resolved to firstUse".
*/
function unsupportedStoredEnums(stored) {
	const format = ownRecord(ownRecord(stored, "opencodeSession"), "format");
	const found = [];
	const check = (field, allowed, fallback) => {
		const value = ownValue(format, field);
		if (value !== void 0 && !allowed.includes(String(value))) found.push({
			field,
			fallback
		});
	};
	check("mode", FORMAT_MODES, DEFAULT_FORMAT_DRAFT.mode);
	check("time", FORMAT_TIMES, DEFAULT_FORMAT_DRAFT.time);
	check("onInvalid", FORMAT_INVALID_POLICIES, DEFAULT_FORMAT_DRAFT.onInvalid);
	return found;
}
/** Read one own property of a possibly-absent record. */
function ownValue(object, key) {
	if (object === void 0 || !Object.prototype.hasOwnProperty.call(object, key)) return void 0;
	return object[key];
}
/** Read one own property that must itself be a record. */
function ownRecord(value, key) {
	if (typeof value !== "object" || value === null) return void 0;
	const object = value;
	if (!Object.prototype.hasOwnProperty.call(object, key)) return void 0;
	const nested = object[key];
	return isUnknownRecord(nested) ? nested : void 0;
}
function OpenCodeFormatCard({ settings, palette, t, revision, namespace = FORMAT_NAMESPACE, onApplied }) {
	const [state, setState] = react.default.useState(initialState);
	/**
	* The latest state, for the async callbacks below. `apply` re-reads the
	* registry before writing, and by the time that read lands the user may have
	* typed into a field this card did not re-render for; the draft that gets
	* written has to be the one on screen at that moment, not the one captured
	* when Apply was clicked.
	*/
	const stateRef = react.default.useRef(state);
	stateRef.current = state;
	/**
	* Fold one read into the card's state.
	*
	* A field the user has already edited (`draft` differs from `saved`) keeps
	* its draft; every other field takes the freshly read value. That keeps the
	* card from writing back the values it read before a page-mate — the backup
	* card's import, the model editor's session switch — changed this namespace:
	* with the whole draft replaced, the next Apply would present those retired
	* values as edits and silently undo the other write. `saved` always advances
	* to the fresh read, so it stays the single reference for "unchanged".
	*/
	const applyRead = (current, value) => {
		const user = userOf(value.namespaces, namespace);
		const fresh = draftFromSettings(user);
		let draft = current.draft;
		for (const key of FORMAT_KEYS) if (draft[key] === current.saved[key]) draft = {
			...draft,
			[key]: fresh[key]
		};
		return {
			...current,
			saved: fresh,
			draft,
			unsupportedStored: unsupportedStoredEnums(user),
			writable: value.writable !== false,
			busy: false,
			error: null
		};
	};
	const load = () => {
		settings.describe().then((response) => {
			if (!response.ok) {
				setState((current) => ({
					...current,
					busy: false,
					error: response.error.message
				}));
				return;
			}
			setState((current) => applyRead(current, response.value));
		}).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			setState((current) => ({
				...current,
				busy: false,
				error: message
			}));
		});
	};
	react.default.useEffect(() => {
		load();
	}, [revision]);
	const patch = (field, value) => {
		setState((current) => ({
			...current,
			notice: null,
			error: null,
			draft: {
				...current.draft,
				[field]: value
			}
		}));
	};
	/**
	* Apply the draft. The registry is described again first: the model editor's
	* session switch and the backup card both write this namespace, so the
	* revision this card mounted with can already be stale, and a stale write is
	* refused by the host.
	*/
	const apply = () => {
		setState((current) => ({
			...current,
			busy: true,
			error: null,
			notice: null
		}));
		settings.describe().then((response) => {
			if (!response.ok) {
				setState((current) => ({
					...current,
					busy: false,
					error: response.error.message
				}));
				return;
			}
			const stored = draftFromSettings(userOf(response.value.namespaces, namespace));
			const ops = formatOps(stateRef.current.draft, stored);
			if (ops.length === 0) {
				setState((current) => ({
					...current,
					busy: false,
					saved: current.draft,
					notice: t("formatSaved")
				}));
				return;
			}
			return settings.mutate(namespace, ops, revisionOf(response.value.namespaces, namespace)).then((written) => {
				if (!written.ok) {
					const message = written.error.message;
					setState((current) => ({
						...current,
						busy: false,
						error: isSettingsConflict(written.error) ? t("formatConflict") : t("formatSaveFailed", { message })
					}));
					return;
				}
				setState((current) => ({
					...current,
					busy: false,
					saved: current.draft,
					notice: t("formatSaved")
				}));
				load();
				onApplied?.();
			});
		}).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			setState((current) => ({
				...current,
				busy: false,
				error: t("formatSaveFailed", { message })
			}));
		});
	};
	/** Validation problems for the current draft; used by the disabled state and the field errors. */
	const errors = formatFieldErrors(state.draft);
	const dirty = formatOps(state.draft, state.saved).length > 0;
	const blocked = dirty && errors.length > 0;
	const readOnly = !state.writable;
	const errorFor = (field) => errors.find((problem) => problem.field === field)?.error;
	/**
	* One free-text field with its hint and, when the draft has a problem, the
	* reason the write is refused. Defined below `errors` on purpose: it closes
	* over that value, and moving it above would read it before initialization.
	*/
	const textField = (field, labelKey) => {
		const problem = errorFor(field);
		return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				display: "grid",
				gap: "3px"
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: settings_module_css_default.wideFieldRow,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: labelStyle,
						children: t(labelKey)
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "text",
						value: state.draft[field],
						"aria-label": t(labelKey),
						"aria-invalid": problem === void 0 ? void 0 : true,
						disabled: state.busy,
						onChange: (event) => patch(field, event.currentTarget.value),
						style: {
							...selectStyle(palette),
							borderColor: problem === void 0 ? palette.border : palette.danger,
							color: problem === void 0 ? palette.text : palette.danger
						}
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						fontSize: "11px",
						color: palette.secondary,
						lineHeight: "15px"
					},
					children: t(HINT_LABEL_KEYS[field])
				}),
				problem === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					role: "alert",
					style: {
						fontSize: "11px",
						color: palette.danger,
						lineHeight: "15px"
					},
					children: t(ERROR_LABEL_KEYS[problem])
				})
			]
		});
	};
	const modeSelect = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
		value: state.draft.mode,
		"aria-label": t("formatModeLabel"),
		disabled: state.busy,
		onChange: (event) => patch("mode", event.currentTarget.value),
		style: selectStyle(palette),
		children: FORMAT_MODES.map((mode) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
			value: mode,
			children: t(MODE_LABEL_KEYS[mode])
		}, mode))
	});
	const timeSelect = TIME_MODES.includes(state.draft.mode) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
		value: state.draft.time,
		"aria-label": t("formatTimeLabel"),
		disabled: state.busy,
		onChange: (event) => patch("time", event.currentTarget.value),
		style: selectStyle(palette),
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
			value: "firstUse",
			children: t("formatTimeFirstUse")
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
			value: "hash",
			children: t("formatTimeHash")
		})]
	}) : null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			backgroundColor: palette.group,
			border: `1px solid ${palette.border}`,
			borderRadius: "8px",
			boxShadow: palette.shadow,
			overflow: "hidden",
			marginBottom: "8px"
		},
		"data-scope": "opencode-format",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "7px",
					padding: "7px 8px 6px"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
					name: "sliders",
					size: 15
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					"aria-label": t("formatCardTitle"),
					"aria-expanded": state.open,
					onClick: () => setState((current) => ({
						...current,
						open: !current.open
					})),
					style: {
						display: "flex",
						alignItems: "center",
						gap: "6px",
						flex: "1 1 auto",
						minWidth: 0,
						padding: 0,
						border: "none",
						background: "transparent",
						color: palette.text,
						font: "inherit",
						fontSize: "13px",
						fontWeight: 700,
						letterSpacing: 0,
						cursor: "pointer",
						textAlign: "left"
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("formatCardTitle") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								marginLeft: "auto",
								color: palette.secondary,
								fontSize: "11px",
								fontWeight: 600
							},
							children: t("formatCardHint", { mode: t(MODE_LABEL_KEYS[state.saved.mode] ?? "formatModeSesDerive") })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: state.open ? "chevronUp" : "chevronDown",
							size: 14
						})
					]
				})]
			}),
			state.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				role: "alert",
				"aria-live": "assertive",
				style: {
					fontSize: "12px",
					lineHeight: "18px",
					color: palette.danger,
					backgroundColor: palette.dangerBg,
					border: `1px solid ${palette.dangerBorder}`,
					borderRadius: "8px",
					padding: "6px 8px",
					margin: "0 8px 8px"
				},
				children: state.error
			}) : null,
			state.notice === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				role: "status",
				"aria-live": "polite",
				style: {
					fontSize: "12px",
					lineHeight: "18px",
					color: palette.accent,
					backgroundColor: palette.accentSoft,
					border: `1px solid ${palette.accentBorder}`,
					borderRadius: "8px",
					padding: "6px 8px",
					margin: "0 8px 8px"
				},
				children: state.notice
			}),
			state.open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "grid",
					gap: "9px",
					padding: "8px",
					borderTop: `1px solid ${palette.divider}`
				},
				children: [
					state.unsupportedStored.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							fontSize: "11px",
							color: palette.secondary
						},
						children: t("formatUnsupportedStored", { detail: state.unsupportedStored.map((entry) => `${t(ENUM_LABEL_KEYS[entry.field])} → ${entry.fallback}`).join(", ") })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: settings_module_css_default.wideFieldRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: labelStyle,
							children: t("formatModeLabel")
						}), modeSelect]
					}),
					timeSelect === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: settings_module_css_default.wideFieldRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: labelStyle,
							children: t("formatTimeLabel")
						}), timeSelect]
					}),
					state.draft.mode === "template" ? textField("template", "formatTemplateLabel") : null,
					state.draft.mode === "expression" ? textField("expression", "formatExpressionLabel") : null,
					state.draft.mode === "script" ? textField("script", "formatScriptLabel") : null,
					textField("validate", "formatValidateLabel"),
					state.draft.validate.trim() === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: settings_module_css_default.wideFieldRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: labelStyle,
							children: t("formatOnInvalidLabel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							value: state.draft.onInvalid,
							"aria-label": t("formatOnInvalidLabel"),
							disabled: state.busy,
							onChange: (event) => patch("onInvalid", event.currentTarget.value),
							style: selectStyle(palette),
							children: FORMAT_INVALID_POLICIES.map((policy) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: policy,
								children: t(POLICY_LABEL_KEYS[policy])
							}, policy))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							gap: "6px",
							alignItems: "center"
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
							text: t("formatApply"),
							onClick: apply,
							disabled: state.busy || readOnly || !dirty || blocked,
							tone: "primary",
							palette,
							icon: "check"
						})
					})
				]
			}) : null
		]
	});
}
const labelStyle = {
	fontSize: "12px",
	fontWeight: 600
};
const selectStyle = (palette) => ({
	height: "28px",
	maxWidth: "100%",
	padding: "0 10px",
	border: `1px solid ${palette.border}`,
	borderRadius: "8px",
	fontSize: "13px",
	backgroundColor: palette.field,
	color: palette.text,
	colorScheme: "light dark",
	boxShadow: palette.shadow
});
//#endregion
//#region packages/settings-ui/src/client/SectionEditor.tsx
/**
* Stable fallbacks for a mount without a store.
*
* `useSyncExternalStore` resubscribes when either callback changes identity, so
* inline closures would tear down and rebuild the subscription on every render.
*/
const NO_SUBSCRIBE = () => () => void 0;
const NO_SNAPSHOT = () => void 0;
const NOTICE_DISMISS_MS = 3e3;
const noRuntimeSubscribe = () => () => void 0;
const noRuntimeSnapshot = () => emptyTakeoverRuntimeResolution;
function SectionEditor({ settings, locale, t, palette = iosPalette(), takeoverRuntime, switches, onMounted }) {
	const switchSnapshot = (0, react.useSyncExternalStore)(switches?.subscribe ?? NO_SUBSCRIBE, switches?.getSnapshot ?? NO_SNAPSHOT, switches?.getSnapshot ?? NO_SNAPSHOT);
	const settingsOn = switchSnapshot === void 0 || partEnabled(switchSnapshot, "settings");
	const opencodeOn = switchSnapshot === void 0 || partEnabled(switchSnapshot, "opencode");
	const compactionOn = switchSnapshot === void 0 || partEnabled(switchSnapshot, "compaction");
	const migrationOn = switchSnapshot === void 0 || partEnabled(switchSnapshot, "migration");
	const subagentOn = switchSnapshot === void 0 || partEnabled(switchSnapshot, "subagent");
	const [state, setState] = react.default.useState(initialState$2);
	const takeoverResolution = react.default.useSyncExternalStore(takeoverRuntime?.subscribe ?? noRuntimeSubscribe, takeoverRuntime?.getSnapshot ?? noRuntimeSnapshot, takeoverRuntime?.getSnapshot ?? noRuntimeSnapshot);
	/**
	* Refresh every view of the plugin's one section from a single descriptor.
	*
	* `subagentEffort` and the OpenCode session fields live in the same section
	* under the 0.1.7 entry-config model, so one write to either returns the
	* descriptor that supersedes what the editor holds for both — and the
	* revision in it is the `expectedRevision` the NEXT write to that section has
	* to send. Revisions are per section there, so a view left on the pre-write
	* copy made the second of any two such writes fail as a conflict. Every write
	* whose response targets this section lands here; `savedKey` names the
	* OpenCode toggle just persisted, whose draft is no longer dirty.
	*/
	/**
	* Re-read every section this editor renders through one `describe`.
	*
	* `notice` is the success message to surface once the re-read lands. The
	* default `null` is what the mount-time and card-triggered calls want (they
	* are reads, not saves); the `configForms` write branch passes its
	* `successMessage` because that transport carries no response body to project
	* and would otherwise lose the "saved" notice the legacy path shows.
	*/
	const load = (notice = null) => {
		setState((current) => ({
			...current,
			loading: current.inventory.length === 0,
			error: null
		}));
		settings.describe().then((response) => {
			if (!response.ok) {
				setState((current) => ({
					...current,
					loading: false,
					busy: false,
					error: response.error.message
				}));
				return;
			}
			const found = response.value.namespaces.find((entry) => entry.ns === NS);
			const plugin = pluginSection(response.value.namespaces) ?? null;
			if (!found) {
				setState((current) => {
					return applyPluginSectionView({
						...current,
						loading: false,
						busy: false,
						nsFound: false,
						namespace: null,
						inventory: [],
						providerViews: {},
						providerDrafts: {},
						providerDirty: {},
						providerCompatDirty: {},
						providerCompatExpanded: {},
						modelCompatViews: {},
						modelCompatDrafts: {},
						modelCompatDirty: {},
						modelCompatExpanded: {},
						subagent: null
					}, plugin, notice);
				});
				return;
			}
			setState((current) => applyPluginSectionView(applyNamespaceView(current, found, notice, plugin, settings.compatibilityProfile, takeoverResolution), plugin, notice));
		}).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			setState((current) => ({
				...current,
				loading: false,
				busy: false,
				error: t("readSettingsFailed", { message })
			}));
		});
	};
	react.default.useEffect(() => {
		load();
	}, []);
	react.default.useEffect(() => {
		onMounted?.();
	}, [onMounted]);
	react.default.useEffect(() => {
		setState((current) => reapplyCompatViews(current, settings.compatibilityProfile, takeoverResolution));
	}, [takeoverResolution]);
	react.default.useEffect(() => {
		if (state.notice === null) return void 0;
		const timer = setTimeout(() => {
			setState((current) => current.notice === null ? current : {
				...current,
				notice: null
			});
		}, NOTICE_DISMISS_MS);
		return () => clearTimeout(timer);
	}, [state.notice]);
	const runOps = useSaveQueue({
		settings,
		t,
		onAccepted: (request, value) => setState((current) => {
			if (request.ns === NS) return applyNamespaceView(current, value, request.successMessage, current.pluginSection, settings.compatibilityProfile, takeoverResolution);
			if (request.entrySectionWrite === true) return applyPluginSectionView(current, value, request.successMessage);
			return applyPluginSectionView(current, value, request.successMessage, request.openCodeSessionSavedKey);
		}),
		reload: (notice) => load(notice),
		setBusy: () => setState((current) => ({
			...current,
			busy: true,
			error: null,
			notice: null
		})),
		setError: (message) => setState((current) => ({
			...current,
			busy: false,
			error: message
		}))
	});
	const applyModel = (item) => {
		const key = keyOf(item);
		const levels = buildLevels(state.drafts[key] ?? {});
		const contextDraft = state.contextDrafts[key] ?? contextDraftFrom(item);
		const inputDraft = state.inputDrafts[key] ?? inputDraftFrom(item);
		const blocked = modelSaveBlockedReason(levels, contextDraft, inputDraft, t);
		if (blocked !== null) {
			setState((current) => ({
				...current,
				error: blocked
			}));
			return;
		}
		const context = contextDraft.touched ? validateContextWindow(contextDraft, t) : { value: void 0 };
		const input = inputDraft.touched ? buildInput(inputDraft, t) : { value: void 0 };
		const update = {
			item,
			levels,
			contextWindow: context.value,
			contextWindowTouched: contextDraft.touched,
			input: input.value,
			inputTouched: inputDraft.touched
		};
		runOps({
			ns: NS,
			revision: state.revision,
			ops: setOps(state.inventory, [update]),
			rebuildOps: (fresh) => {
				const inventory = inventoryFrom(fresh);
				return setOps(inventory, rebaseUpdates(inventory, [update]));
			},
			successMessage: t("modelSettingsSaved"),
			onSuccess: () => {
				setState((current) => {
					const base = current.contextDrafts[key] ?? contextDraftFrom(item);
					const draft = contextDraft.touched && context.value !== void 0 && contextDraft.oneMillion !== true ? {
						...base,
						value: String(context.value),
						previousValue: String(context.value)
					} : current.contextDrafts[key];
					return {
						...current,
						dirty: removeDirtyFields(current.dirty, key, [
							"levels",
							"context",
							"input"
						]),
						contextDrafts: draft === void 0 ? current.contextDrafts : {
							...current.contextDrafts,
							[key]: draft
						}
					};
				});
			}
		});
	};
	const applyModelCompat = (item) => {
		const key = keyOf(item);
		const draft = state.modelCompatDrafts[key];
		const current = state.modelCompatViews[key];
		const dirty = state.modelCompatDirty[key];
		if (!draft || !current || !dirty) return;
		const update = {};
		for (const field of GATEWAY_COMPAT_FIELD_KEYS) if (dirty[field] === true && draft[field] !== current[field]) Object.assign(update, { [field]: draft[field] });
		const editability = editableProviderCompatFields(settings.compatibilityProfile, state.namespace?.schema);
		const ops = item.inOverrides ? opsForModelCompat(item, update, editability) : opsForModelArrayCompat(state.inventory, item, update, editability);
		const rebuildOps = (fresh) => {
			if (!item.inOverrides) {
				const inventory = inventoryFrom(fresh);
				const rebased = rebaseItem(inventory, item);
				return rebased === void 0 ? [] : opsForModelArrayCompat(inventory, rebased, update, editableProviderCompatFields(settings.compatibilityProfile, fresh.schema));
			}
			return opsForModelCompat(item, update, editableProviderCompatFields(settings.compatibilityProfile, fresh.schema));
		};
		if (ops.length === 0) {
			setState((currentState) => ({
				...currentState,
				modelCompatDirty: removeDirtyFields(currentState.modelCompatDirty, key, GATEWAY_COMPAT_FIELD_KEYS)
			}));
			return;
		}
		runOps({
			ns: NS,
			revision: state.revision,
			ops,
			rebuildOps,
			successMessage: t("modelGatewayCompatSaved"),
			onSuccess: () => {
				setState((currentState) => ({
					...currentState,
					modelCompatDirty: removeDirtyFields(currentState.modelCompatDirty, key, GATEWAY_COMPAT_FIELD_KEYS)
				}));
			}
		});
	};
	const patchModelCompat = (item, next) => {
		const key = keyOf(item);
		setState((current) => {
			const draft = current.modelCompatDrafts[key] ?? current.modelCompatViews[key];
			if (!draft) return current;
			const modelCompatDrafts = {
				...current.modelCompatDrafts,
				[key]: {
					...draft,
					...next
				}
			};
			const nextDirty = { ...current.modelCompatDirty[key] };
			for (const field of GATEWAY_COMPAT_FIELD_KEYS) if (Object.prototype.hasOwnProperty.call(next, field)) Object.assign(nextDirty, { [field]: true });
			const modelCompatDirty = {
				...current.modelCompatDirty,
				[key]: nextDirty
			};
			return {
				...current,
				notice: null,
				modelCompatDrafts,
				modelCompatDirty
			};
		});
	};
	const patchOpenCodeSession = (item, enabled) => {
		const key = keyOf(item);
		const namespace = state.pluginSection;
		if (namespace === null || !isOpenCodeSessionNamespace(namespace)) return;
		const operation = openCodeSessionOp(item.route, item.model, enabled);
		if (operation === void 0) return;
		setState((current) => ({
			...current,
			notice: null,
			openCodeSessionDrafts: {
				...current.openCodeSessionDrafts,
				[key]: enabled
			}
		}));
		runOps({
			ns: namespace.ns,
			revision: namespace.revision,
			ops: [operation],
			rebuildOps: () => [operation],
			successMessage: t("opencodeSessionSaved"),
			openCodeSessionSavedKey: key
		});
	};
	const closeModelEditor = (item) => {
		const key = keyOf(item);
		setState((current) => clearModelEditorState(current, key));
	};
	const restoreReasoningDefaults = (item) => {
		const key = keyOf(item);
		runOps({
			ns: NS,
			revision: state.revision,
			ops: setOps(state.inventory, [{
				item,
				levels: DEFAULT_LEVELS
			}]),
			rebuildOps: (fresh) => {
				const inventory = inventoryFrom(fresh);
				return setOps(inventory, rebaseUpdates(inventory, [{
					item,
					levels: DEFAULT_LEVELS
				}]));
			},
			successMessage: t("restoreReasoning"),
			onSuccess: () => {
				setState((current) => ({
					...current,
					drafts: current.drafts[key] ? {
						...current.drafts,
						[key]: draftFrom(DEFAULT_LEVELS)
					} : current.drafts,
					dirty: removeDirtyFields(current.dirty, key, ["levels"])
				}));
			}
		});
	};
	const restoreProviderDefaults = (item) => {
		runOps({
			ns: NS,
			revision: state.revision,
			ops: setOps(state.inventory, [{
				item,
				contextWindow: void 0,
				contextWindowTouched: true,
				input: void 0,
				inputTouched: true
			}]),
			rebuildOps: (fresh) => {
				const inventory = inventoryFrom(fresh);
				return setOps(inventory, rebaseUpdates(inventory, [{
					item,
					contextWindow: void 0,
					contextWindowTouched: true,
					input: void 0,
					inputTouched: true
				}]));
			},
			successMessage: t("restoreCapability"),
			onSuccess: () => closeModelEditor(item)
		});
	};
	const applyPreset = (levels) => {
		runOps({
			ns: NS,
			revision: state.revision,
			ops: setOps(state.inventory, state.inventory.map((item) => ({
				item,
				levels
			}))),
			rebuildOps: (fresh) => {
				const inventory = inventoryFrom(fresh);
				return setOps(inventory, inventory.map((item) => ({
					item,
					levels
				})));
			},
			successMessage: t("settingsUpdated"),
			onSuccess: () => {
				setState((current) => {
					let dirty = current.dirty;
					const drafts = { ...current.drafts };
					current.inventory.forEach((item) => {
						const key = keyOf(item);
						if (drafts[key]) drafts[key] = draftFrom(levels);
						dirty = removeDirtyFields(dirty, key, ["levels"]);
					});
					return {
						...current,
						drafts,
						dirty
					};
				});
			}
		});
	};
	const applySubagentEffort = () => {
		const op = subagentEffortOp(state.subagentDraft, state.subagentCustom);
		if (op === void 0) {
			setState((current) => ({
				...current,
				notice: null,
				error: t("customEffortRequired")
			}));
			return;
		}
		const ops = [op];
		const target = subagentEffortTarget(isPluginEntrySection(state.pluginSection) ? state.pluginSection : null, state.revision);
		runOps({
			ns: target.ns,
			revision: target.revision,
			ops,
			rebuildOps: () => ops,
			successMessage: t("subagentSaved"),
			entrySectionWrite: target.ownSection
		});
	};
	const applyAutoFillDefaults = (enabled) => {
		const section = state.pluginSection;
		if (section === null) return;
		const ops = [{
			op: "set",
			path: ["autoFillDefaults"],
			value: enabled
		}];
		runOps({
			ns: section.ns,
			revision: revisionOf(section),
			ops,
			rebuildOps: () => ops,
			successMessage: t("settingsUpdated"),
			entrySectionWrite: true
		});
	};
	/**
	* Persist one model's compaction override.
	*
	* The policy leaf is a DIFFERENT settings path from the model array the rest
	* of this editor rewrites, so it takes its own mutation rather than riding
	* `setOps`: rebuilding `providers[route].models` from this panel's inventory
	* to change a ratio would write a stale container. A leaf write replays
	* verbatim, which is what `rebuildOps: () => ops` claims.
	*/
	const applyModelCompaction = (item, pending) => {
		const section = state.pluginSection;
		if (section === null) return;
		const key = keyOf(item);
		const policy = compactionPolicyOf(section);
		const draft = pending ?? state.compactionDrafts[key] ?? compactionDraftFrom(policy, item.route, item.model);
		const check = checkCompactionDraft(policy, item.route, item.model, draft);
		if (!check.ok) {
			setState((current) => ({
				...current,
				notice: null,
				error: compactionProblemText(check.problem, t)
			}));
			return;
		}
		const ops = compactionOps(item.route, item.model, check);
		runOps({
			ns: section.ns,
			revision: revisionOf(section),
			ops,
			rebuildOps: () => ops,
			successMessage: t("compactionSaved"),
			entrySectionWrite: true,
			onSuccess: () => {
				setState((current) => ({
					...current,
					compactionDrafts: {
						...current.compactionDrafts,
						[key]: {
							...draft,
							touched: false
						}
					}
				}));
			}
		});
	};
	const patchCompactionDraft = (item, patch) => {
		const key = keyOf(item);
		setState((current) => {
			const policy = compactionPolicyOf(current.pluginSection);
			const draft = current.compactionDrafts[key] ?? compactionDraftFrom(policy, item.route, item.model);
			return {
				...current,
				notice: null,
				compactionDrafts: {
					...current.compactionDrafts,
					[key]: {
						...draft,
						...patch,
						touched: true
					}
				}
			};
		});
	};
	/**
	* Persist the subagent default route.
	*
	* Both halves are written in ONE batch because a provider without a model
	* names no route: persisting them separately would leave a half-configured
	* pair visible to the Host in between. Clearing unsets both fields rather
	* than writing empty strings — the schema treats `''` as unset either way, but
	* an `unset` leaves no residue in the user document, which is what lets the
	* shipped inheritance default own the value.
	*/
	const applySubagentModel = () => {
		const draft = state.subagentModelDraft;
		const provider = draft.provider.trim();
		const model = draft.model.trim();
		const clearing = provider.length === 0 || model.length === 0;
		const ops = clearing ? [{
			op: "unset",
			path: ["subagentModel", "provider"]
		}, {
			op: "unset",
			path: ["subagentModel", "model"]
		}] : [{
			op: "set",
			path: ["subagentModel", "provider"],
			value: provider
		}, {
			op: "set",
			path: ["subagentModel", "model"],
			value: model
		}];
		const section = state.pluginSection;
		if (section === null) return;
		runOps({
			ns: section.ns,
			revision: revisionOf(section),
			ops,
			rebuildOps: () => ops,
			successMessage: t("subagentModelSaved"),
			entrySectionWrite: true,
			onSuccess: () => {
				setState((current) => ({
					...current,
					subagentModelDraft: clearing ? {
						provider: "",
						model: "",
						touched: false
					} : {
						provider,
						model,
						touched: false
					}
				}));
			}
		});
	};
	const applyProviderCompat = (route) => {
		const draft = state.providerDrafts[route];
		const current = state.providerViews[route];
		const dirtyFields = state.providerCompatDirty[route];
		if (!draft || !current) return;
		const update = {};
		for (const field of GATEWAY_COMPAT_FIELD_KEYS) if (dirtyFields?.[field] === true && draft[field] !== current[field]) Object.assign(update, { [field]: draft[field] });
		const ops = opsForProviderCompat(route, update, editableProviderCompatFields(settings.compatibilityProfile, state.namespace?.schema));
		const clearProviderDirty = (currentState) => {
			const providerDirty = { ...currentState.providerDirty };
			delete providerDirty[route];
			const providerCompatDirty = { ...currentState.providerCompatDirty };
			delete providerCompatDirty[route];
			return {
				...currentState,
				providerDirty,
				providerCompatDirty
			};
		};
		if (ops.length === 0) {
			setState((currentState) => clearProviderDirty(currentState));
			return;
		}
		runOps({
			ns: NS,
			revision: state.revision,
			ops,
			rebuildOps: () => ops,
			successMessage: t("gatewayCompatSaved"),
			onSuccess: () => {
				setState((currentState) => clearProviderDirty(currentState));
			}
		});
	};
	const patchProviderCompat = (route, next) => {
		setState((current) => {
			const draft = current.providerDrafts[route] ?? current.providerViews[route];
			if (!draft) return {
				...current,
				notice: null,
				providerDrafts: {
					...current.providerDrafts,
					[route]: next
				},
				providerDirty: {
					...current.providerDirty,
					[route]: true
				}
			};
			const keysChanged = GATEWAY_COMPAT_FIELD_KEYS.filter((key) => next[key] !== draft[key]);
			const nextDirtyFields = { ...current.providerCompatDirty[route] };
			for (const field of keysChanged) Object.assign(nextDirtyFields, { [field]: true });
			return {
				...current,
				notice: null,
				providerDrafts: {
					...current.providerDrafts,
					[route]: next
				},
				providerCompatDirty: {
					...current.providerCompatDirty,
					[route]: nextDirtyFields
				},
				providerDirty: {
					...current.providerDirty,
					[route]: true
				}
			};
		});
	};
	const toggleProviderCompatExpanded = (route) => setState((current) => ({
		...current,
		providerCompatExpanded: {
			...current.providerCompatExpanded,
			[route]: current.providerCompatExpanded[route] !== true
		}
	}));
	const toggleModelCompatExpanded = (key) => setState((current) => ({
		...current,
		modelCompatExpanded: {
			...current.modelCompatExpanded,
			[key]: current.modelCompatExpanded[key] !== true
		}
	}));
	const toggleProvider = (route) => setState((current) => ({
		...current,
		expandedProviders: {
			...current.expandedProviders,
			[route]: current.expandedProviders[route] !== true
		}
	}));
	const toggleExpand = (item) => {
		const key = keyOf(item);
		setState((current) => {
			if (current.expanded[key]) {
				const expanded = { ...current.expanded };
				delete expanded[key];
				return {
					...clearOpenCodeSessionState(current, key),
					expanded
				};
			}
			return {
				...current,
				expanded: {
					...current.expanded,
					[key]: true
				},
				drafts: current.drafts[key] ? current.drafts : {
					...current.drafts,
					[key]: draftFrom(item.levels)
				},
				contextDrafts: current.contextDrafts[key] ? current.contextDrafts : {
					...current.contextDrafts,
					[key]: contextDraftFrom(item)
				},
				inputDrafts: current.inputDrafts[key] ? current.inputDrafts : {
					...current.inputDrafts,
					[key]: inputDraftFrom(item)
				}
			};
		});
	};
	const patchDraft = (item, level, patch) => {
		const key = keyOf(item);
		setState((current) => {
			const cell = {
				...current.drafts[key]?.[level] ?? {
					on: false,
					wire: ""
				},
				...patch
			};
			if (level !== "off" && patch.on === true && cell.wire.trim() === "") cell.wire = level;
			return {
				...current,
				notice: null,
				dirty: {
					...current.dirty,
					[key]: {
						...current.dirty[key],
						levels: true
					}
				},
				drafts: {
					...current.drafts,
					[key]: {
						...current.drafts[key],
						[level]: cell
					}
				}
			};
		});
	};
	const patchContextValue = (item, value) => {
		const key = keyOf(item);
		setState((current) => {
			const draft = current.contextDrafts[key] ?? contextDraftFrom(item);
			return {
				...current,
				notice: null,
				dirty: {
					...current.dirty,
					[key]: {
						...current.dirty[key],
						context: true
					}
				},
				contextDrafts: {
					...current.contextDrafts,
					[key]: {
						...draft,
						value,
						previousValue: value,
						oneMillion: false,
						touched: true
					}
				}
			};
		});
	};
	const setOneMillion = (item, enabled) => {
		const key = keyOf(item);
		setState((current) => {
			const draft = current.contextDrafts[key] ?? contextDraftFrom(item);
			const previous = enabled ? draft.oneMillion ? draft.previousValue : draft.value : draft.previousValue;
			return {
				...current,
				notice: null,
				dirty: {
					...current.dirty,
					[key]: {
						...current.dirty[key],
						context: true
					}
				},
				contextDrafts: {
					...current.contextDrafts,
					[key]: {
						...draft,
						oneMillion: enabled,
						previousValue: previous || "",
						value: enabled ? String(CONTEXT_1M) : previous || "",
						touched: true
					}
				}
			};
		});
	};
	const patchInputCapability = (item, modality, enabled) => {
		const key = keyOf(item);
		setState((current) => {
			const draft = current.inputDrafts[key] ?? inputDraftFrom(item);
			if (!enabled && !draft[modality === "text" ? "image" : "text"]) return {
				...current,
				notice: null,
				error: t("inputCapabilityMinimum")
			};
			return {
				...current,
				error: null,
				notice: null,
				dirty: {
					...current.dirty,
					[key]: {
						...current.dirty[key],
						input: true
					}
				},
				inputDrafts: {
					...current.inputDrafts,
					[key]: {
						...draft,
						[modality]: enabled,
						touched: true
					}
				}
			};
		});
	};
	const query = state.query.trim().toLowerCase();
	const visible = query === "" ? state.inventory : state.inventory.filter((item) => item.model.toLowerCase().includes(query) || item.name.toLowerCase().includes(query));
	const routes = [...new Set(visible.map((item) => item.route))];
	const expandedCount = visible.filter((item) => state.expanded[keyOf(item)] && (query !== "" || state.expandedProviders[item.route])).length;
	const snapshot = locale.getSnapshot?.() ?? {};
	const available = new Set(snapshot.locales?.map((entry) => entry.id).filter((id) => typeof id === "string") ?? [
		"zh",
		"en",
		"ja",
		"ko"
	]);
	const languageOptions = [
		["zh", "languageChinese"],
		["en", "languageEnglish"],
		["ja", "languageJapanese"],
		["ko", "languageKorean"]
	];
	const compactionPolicy = compactionPolicyOf(state.pluginSection);
	const compactionPlaceholders = {
		threshold: t("compactionFollowGlobal", { percent: formatRatioPercent(compactionPolicy.thresholdRatio) }),
		retain: t("compactionFollowGlobal", { percent: formatRatioPercent(compactionPolicy.retainRatio) })
	};
	const compactionControlsFor = (item) => {
		if (!compactionOn) return void 0;
		if (state.pluginSection === null) return void 0;
		const key = keyOf(item);
		const draft = state.compactionDrafts[key] ?? compactionDraftFrom(compactionPolicy, item.route, item.model);
		const check = checkCompactionDraft(compactionPolicy, item.route, item.model, draft);
		return {
			draft,
			thresholdPlaceholder: compactionPlaceholders.threshold,
			retainPlaceholder: compactionPlaceholders.retain,
			problem: check.ok ? null : compactionProblemText(check.problem, t),
			onThresholdChange: (value) => patchCompactionDraft(item, { threshold: value }),
			onRetainChange: (value) => patchCompactionDraft(item, { retain: value }),
			onCommit: () => applyModelCompaction(item)
		};
	};
	const subagentModelRoutes = react.default.useMemo(() => {
		const byProvider = /* @__PURE__ */ new Map();
		for (const item of state.inventory) {
			const models = byProvider.get(item.route);
			if (models === void 0) byProvider.set(item.route, [item.model]);
			else if (!models.includes(item.model)) models.push(item.model);
		}
		return [...byProvider].map(([provider, models]) => ({
			provider,
			models
		})).sort((a, b) => a.provider.localeCompare(b.provider));
	}, [state.inventory]);
	const subagentModelPicker = {
		draft: state.subagentModelDraft,
		routes: subagentModelRoutes,
		savedUnavailable: state.subagentModelDraft.provider.length > 0 && state.subagentModelDraft.model.length > 0 && !subagentModelRoutes.some((route) => route.provider === state.subagentModelDraft.provider && route.models.includes(state.subagentModelDraft.model)),
		onProviderChange: (provider) => setState((current) => ({
			...current,
			notice: null,
			subagentModelDraft: {
				...current.subagentModelDraft,
				provider,
				touched: true
			}
		})),
		onModelChange: (model) => setState((current) => ({
			...current,
			notice: null,
			subagentModelDraft: {
				...current.subagentModelDraft,
				model,
				touched: true
			}
		})),
		onCommit: applySubagentModel
	};
	if (!settingsOn) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, {});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: settings_module_css_default.settingsRoot,
		style: {
			color: palette.text,
			fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
		},
		children: [
			state.notice ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					position: "sticky",
					top: "8px",
					zIndex: 20,
					height: 0,
					pointerEvents: "none"
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					role: "status",
					"aria-live": "polite",
					style: {
						position: "absolute",
						right: "8px",
						top: 0,
						pointerEvents: "auto",
						display: "inline-flex",
						alignItems: "center",
						gap: "5px",
						maxWidth: "calc(100% - 16px)",
						padding: "6px 10px",
						border: `1px solid ${palette.accentBorder}`,
						borderRadius: "8px",
						color: palette.accent,
						backgroundColor: palette.accentSoft,
						boxShadow: palette.shadow,
						fontSize: "12px",
						lineHeight: "16px",
						fontWeight: 650
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
						name: "check",
						size: 13
					}), state.notice]
				})
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: settings_module_css_default.controlRowEnd,
				style: {
					fontSize: "12px",
					marginBottom: "4px"
				},
				children: [t("languageLabel"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
					value: snapshot.active,
					onChange: (event) => locale.setLocale?.(event.currentTarget.value),
					style: {
						height: "26px",
						padding: "0 7px",
						border: `1px solid ${palette.border}`,
						borderRadius: "7px",
						backgroundColor: palette.field,
						color: palette.text,
						fontSize: "12px"
					},
					children: languageOptions.map(([id, key]) => available.has(id) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
						value: id,
						children: t(key)
					}, id) : null)
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
				style: {
					display: "flex",
					alignItems: "center",
					flexWrap: "wrap",
					columnGap: "8px",
					rowGap: "4px",
					fontSize: "18px",
					lineHeight: "24px",
					fontWeight: 700,
					letterSpacing: 0,
					margin: "0 0 7px"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
					name: "sliders",
					size: 19
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("pageTitle") })]
			}),
			state.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				role: "alert",
				"aria-live": "assertive",
				style: {
					fontSize: "12px",
					lineHeight: "18px",
					color: palette.danger,
					backgroundColor: palette.dangerBg,
					border: `1px solid ${palette.dangerBorder}`,
					borderRadius: "8px",
					padding: "6px 8px",
					margin: "0 0 8px"
				},
				children: state.error
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-scope": "auto-fill-defaults",
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "12px",
					padding: "8px",
					marginBottom: "8px",
					border: `1px solid ${palette.border}`,
					borderRadius: "8px",
					backgroundColor: palette.group,
					boxShadow: palette.shadow
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "grid",
						gap: "2px"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: "13px",
							fontWeight: 700
						},
						children: t("autoFillDefaultsTitle")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: "12px",
							color: palette.secondary
						},
						children: t("autoFillDefaultsDescription")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchControl, {
					checked: state.pluginSection?.value.autoFillDefaults !== false,
					disabled: state.busy || state.pluginSection === null,
					label: t("autoFillDefaultsTitle"),
					palette,
					onChange: applyAutoFillDefaults
				})]
			}),
			subagentOn ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SubagentSettings, {
				effort: state.subagent?.effort ?? null,
				namespaceFound: state.subagent !== null,
				draft: state.subagentDraft,
				custom: state.subagentCustom,
				busy: state.busy,
				palette,
				t,
				onDraftChange: (value) => setState((current) => ({
					...current,
					notice: null,
					subagentDraft: value
				})),
				onCustomChange: (value) => setState((current) => ({
					...current,
					notice: null,
					subagentCustom: value
				})),
				onSave: applySubagentEffort,
				modelPicker: subagentModelPicker
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigBackupCard, {
				migrationEnabled: migrationOn,
				settings,
				palette,
				t,
				onApplied: load
			}),
			opencodeOn ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenCodeFormatCard, {
				settings,
				palette,
				t,
				revision: state.openCodeSessionReads,
				namespace: state.pluginSection?.ns ?? "dsh-thinking-effort",
				onApplied: load
			}) : null,
			state.nsFound === false ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: {
					fontSize: "12px",
					opacity: .75
				},
				children: t("noNamespace")
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_module_css_default.controlRow,
					style: { marginBottom: state.quickSettingsOpen ? "4px" : "6px" },
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
						text: t("quickSettings"),
						onClick: () => setState((current) => ({
							...current,
							quickSettingsOpen: !current.quickSettingsOpen
						})),
						disabled: state.busy,
						palette,
						icon: state.quickSettingsOpen ? "chevronUp" : "sliders"
					}), state.quickSettingsOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							gap: "6px",
							flexWrap: "wrap",
							flexBasis: "100%",
							padding: "4px",
							border: `1px solid ${palette.border}`,
							borderRadius: "8px",
							backgroundColor: palette.field
						},
						children: PRESETS.map((preset) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
							text: t(preset.labelKey),
							onClick: () => {
								setState((current) => ({
									...current,
									quickSettingsOpen: false
								}));
								applyPreset(preset.levels);
							},
							disabled: state.busy,
							palette,
							icon: preset.key === "official" ? "sparkles" : "sliders"
						}, preset.key))
					}) : null]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						position: "relative",
						marginBottom: "7px"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							position: "absolute",
							left: "10px",
							top: "50%",
							transform: "translateY(-50%)",
							color: palette.secondary,
							pointerEvents: "none"
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "search",
							size: 15
						})
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "text",
						value: state.query,
						placeholder: t("searchPlaceholder"),
						onChange: (event) => {
							const value = event.currentTarget.value;
							setState((current) => ({
								...current,
								query: value
							}));
						},
						style: {
							boxSizing: "border-box",
							width: "100%",
							height: "30px",
							padding: "0 10px 0 30px",
							border: `1px solid ${palette.border}`,
							borderRadius: "8px",
							fontSize: "13px",
							backgroundColor: palette.field,
							color: palette.text,
							outline: "none",
							boxShadow: palette.shadow
						}
					})]
				}),
				state.loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: "12px",
						opacity: .7
					},
					children: t("loading")
				}) : visible.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: "12px",
						opacity: .7
					},
					children: state.inventory.length === 0 ? t("noModels") : t("noMatches")
				}) : routes.map((route) => {
					const providerModels = visible.filter((item) => item.route === route);
					const providerOpen = query !== "" || state.expandedProviders[route] === true;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: { marginBottom: "6px" },
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: settings_module_css_default.entityHeader,
								style: {
									minHeight: "32px",
									padding: "4px 6px",
									marginBottom: "4px",
									border: `1px solid ${palette.border}`,
									borderRadius: "8px",
									backgroundColor: palette.raised
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										display: "flex",
										alignItems: "center",
										gap: "7px",
										minWidth: 0
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											display: "inline-flex",
											alignItems: "center",
											justifyContent: "center",
											width: "22px",
											height: "22px",
											minWidth: "22px",
											border: `1px solid ${palette.border}`,
											borderRadius: "7px",
											color: palette.secondary,
											backgroundColor: palette.group
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "layers",
											size: 14
										})
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										style: {
											display: "grid",
											gap: "1px",
											minWidth: 0
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												color: palette.text,
												fontSize: "12px",
												fontWeight: 700,
												overflowWrap: "anywhere"
											},
											children: route
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												color: palette.accent,
												fontSize: "10px",
												lineHeight: "11px",
												fontWeight: 700
											},
											children: t("vendor")
										})]
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										display: "flex",
										alignItems: "center",
										gap: "6px",
										fontSize: "11px",
										color: palette.secondary,
										whiteSpace: "nowrap"
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("modelCount", { count: providerModels.length }) }), query !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("searchResults") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
										text: "",
										onClick: () => toggleProvider(route),
										palette,
										tone: "ghost",
										icon: providerOpen ? "chevronUp" : "chevronDown",
										label: providerOpen ? t("collapseProvider") : t("expandProvider")
									})]
								})]
							}),
							providerOpen && state.providerDrafts[route] ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [renderGatewayCompatControls({
								view: state.providerDrafts[route],
								onChange: (next) => patchProviderCompat(route, next),
								disabled: state.busy,
								expanded: state.providerCompatExpanded[route] === true,
								onToggleExpanded: () => toggleProviderCompatExpanded(route),
								availableCount: availableCompatFieldCount(state.providerDrafts[route])
							}, {
								palette,
								t
							}), state.providerDirty[route] ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
								text: t("saveGatewayCompat"),
								onClick: () => applyProviderCompat(route),
								disabled: state.busy,
								tone: "primary",
								palette,
								icon: "check"
							}) : null] }) : null,
							providerOpen ? providerModels.map((item) => {
								const key = keyOf(item);
								const dirty = state.dirty[key] ?? {};
								const compatAvailable = state.modelCompatViews[key] !== void 0;
								const openCodeSessionEditable = opencodeOn && state.openCodeSessionAvailable && item.modelSourceConflict !== true;
								return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelRow, {
									item,
									open: state.expanded[key] === true,
									draft: state.drafts[key],
									contextDraft: state.contextDrafts[key] ?? contextDraftFrom(item),
									inputDraft: state.inputDrafts[key] ?? inputDraftFrom(item),
									dirty: dirty.levels === true || dirty.context === true || dirty.input === true,
									busy: state.busy,
									palette,
									t,
									onToggle: () => toggleExpand(item),
									onLevelChange: (level, patch) => patchDraft(item, level, patch),
									onContextChange: (value) => patchContextValue(item, value),
									onOneMillionChange: (enabled) => setOneMillion(item, enabled),
									onInputChange: (modality, enabled) => patchInputCapability(item, modality, enabled),
									onSave: () => applyModel(item),
									blockedReason: modelSaveBlockedReason(buildLevels(state.drafts[key] ?? {}), state.contextDrafts[key] ?? contextDraftFrom(item), state.inputDrafts[key] ?? inputDraftFrom(item), t),
									onRestoreReasoning: () => restoreReasoningDefaults(item),
									onRestoreCapability: () => restoreProviderDefaults(item),
									compatView: compatAvailable ? state.modelCompatDrafts[key] : void 0,
									compatExpanded: state.modelCompatExpanded[key] === true,
									onToggleCompatExpanded: compatAvailable ? () => toggleModelCompatExpanded(key) : void 0,
									compatDirty: state.modelCompatDirty[key],
									onCompatChange: compatAvailable ? (next) => patchModelCompat(item, next) : void 0,
									onSaveCompat: compatAvailable ? () => applyModelCompat(item) : void 0,
									openCodeSession: state.openCodeSessionDrafts[key],
									openCodeSessionAvailable: openCodeSessionEditable,
									onOpenCodeSessionChange: (enabled) => patchOpenCodeSession(item, enabled),
									compaction: compactionControlsFor(item)
								}, `${key}-${item.inOverrides ? "override" : item.index}`);
							}) : null
						]
					}, route);
				}),
				expandedCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: "12px",
						color: palette.secondary,
						margin: "4px 2px 0"
					},
					children: t("expandedSettings", { count: expandedCount })
				}) : null
			] }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				"aria-label": t("versionLabel"),
				style: {
					position: "absolute",
					right: "12px",
					bottom: "8px",
					fontSize: "10px",
					lineHeight: "14px",
					opacity: .45,
					pointerEvents: "none",
					userSelect: "none"
				},
				children: ["v", PLUGIN_VERSION]
			})
		]
	});
}
//#endregion
//#region packages/settings-ui/src/client/legacy-migration.ts
/**
* Read the migration control object from whichever section the running host
* published. The Client cannot tell the settings model apart (its bridge only
* answers `describe`/`mutate`), so it resolves the section id the way every
* other plugin setting does, through `pluginSection`.
*
* A describe that reports an error, or a host that publishes no such section,
* both read as "nothing to ask about" — the caller has nothing to render either
* way, and the next poll retries.
*/
async function readLegacyMigration(settings) {
	const response = await settings.describe();
	if (!response.ok) return void 0;
	const section = pluginSection(response.value.namespaces);
	if (section === void 0) return void 0;
	return {
		ns: section.ns,
		revision: typeof section.revision === "number" ? section.revision : 0,
		user: section.user ?? {}
	};
}
/** Whether the host is asking, from one already-read control object. */
function pendingMigrationOf(user) {
	return isLegacyMigrationPending(user);
}
/** The `lastResult` of one already-read control object. */
function lastResultOf(user) {
	const result = legacyMigrationOf(user)?.lastResult;
	return typeof result === "string" ? result : "";
}
/** One decision write into the plugin's own section. */
function decisionOps(decision) {
	return [{
		op: "set",
		path: ["legacyMigration", "decision"],
		value: decision
	}];
}
/**
* Write one decision.
*
* The host returns a `ClientResult`, so a refusal arrives as `ok: false` rather
* than a rejection; it is rethrown as an `Error` so the component has one
* failure path to render.
*/
async function writeLegacyDecision(settings, target, decision) {
	const response = await settings.mutate(target.ns, decisionOps(decision), target.revision);
	if (!response.ok) throw new Error(response.error.message);
}
//#endregion
//#region packages/settings-ui/src/client/components/LegacyMigrationModal.tsx
/** Boot-time reads before the prompt gives up for this page load. */
const POLL_ATTEMPTS = 15;
/** Delay between those reads, in milliseconds. */
const POLL_INTERVAL_MS = 2e3;
/**
* The prompt for legacy data DSH's 0.1.7 settings rename stranded.
*
* It renders into the shell's overlay slot rather than into the plugin's
* settings page, because the point is to ask before the user has any reason to
* open Settings. It reads the control object the Host wrote into the plugin's
* own section and writes back exactly one decision; the Host performs the
* migration, so no file access happens here.
*
* The Client has no push channel for settings changes — its bridge answers
* `describe`/`mutate` only — so the two waiting phases poll, bounded by
* {@link POLL_ATTEMPTS}. `later` stops polling for this page load, which is what
* keeps the dialog from reappearing the moment the user postpones it.
*/
function LegacyMigrationModal({ settings, t, palette = iosPalette() }) {
	const [phase, setPhase] = (0, react.useState)({ kind: "idle" });
	/**
	* One read. `current` is the phase this read belongs to, passed in rather than
	* read from state so the decision below is made against the phase the caller
	* scheduled it for.
	*
	* While `idle` a read that finds nothing must NOT settle: the Host arms the
	* prompt from its own `apply()`, which races the Client's mount, so "nothing
	* yet" and "nothing ever" are indistinguishable on a single read. Only the
	* attempt budget ends that wait. While `submitting` the Host is expected to
	* finish, so an outcome settles the phase.
	*/
	const read = (0, react.useCallback)(async (current) => {
		let target;
		try {
			target = await readLegacyMigration(settings);
		} catch {
			return;
		}
		if (target === void 0) return;
		const result = lastResultOf(target.user);
		if (result.startsWith("failed:")) {
			setPhase((previous) => previous.kind === "later" ? previous : {
				kind: "failed",
				target,
				reason: result.slice(7).trim()
			});
			return;
		}
		if (pendingMigrationOf(target.user) && legacyCandidatesOf(target.user).length > 0) {
			setPhase((previous) => previous.kind === "idle" ? {
				kind: "asking",
				target
			} : previous);
			return;
		}
		if (current === "submitting") setPhase({ kind: "later" });
	}, [settings]);
	(0, react.useEffect)(() => {
		if (phase.kind !== "idle" && phase.kind !== "submitting") return void 0;
		const scheduled = phase.kind;
		let attempts = 0;
		read(scheduled);
		const timer = setInterval(() => {
			attempts += 1;
			if (attempts >= POLL_ATTEMPTS) {
				clearInterval(timer);
				if (scheduled === "submitting") setPhase((previous) => previous.kind === "submitting" ? {
					kind: "failed",
					target: previous.target,
					reason: t("legacyMigrationTimedOut")
				} : previous);
				return;
			}
			read(scheduled);
		}, POLL_INTERVAL_MS);
		return () => {
			clearInterval(timer);
		};
	}, [
		phase.kind,
		read,
		t
	]);
	const commit = (0, react.useCallback)(async (target, decision) => {
		setPhase({
			kind: "submitting",
			target
		});
		try {
			await writeLegacyDecision(settings, target, decision);
		} catch (error) {
			setPhase({
				kind: "failed",
				target,
				reason: error instanceof Error ? error.message : String(error)
			});
		}
	}, [settings]);
	if (phase.kind === "idle" || phase.kind === "later") return null;
	const { target } = phase;
	const candidates = legacyCandidatesOf(target.user);
	const busy = phase.kind === "submitting";
	const sourceLabel = (source) => {
		if (source === "llm-pi-ai") return t("legacyMigrationSourceLive");
		if (source === "settings.yaml") return t("legacyMigrationSourceDocument");
		if (source === "settings.yaml.imported") return t("legacyMigrationSourceImported");
		return source;
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		"data-testid": "legacy-migration-mask",
		style: {
			position: "fixed",
			inset: 0,
			zIndex: 1e3,
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			padding: "24px",
			background: "rgba(0,0,0,0.32)",
			backdropFilter: "blur(2px)"
		},
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			role: "dialog",
			"aria-modal": "true",
			"aria-label": t("legacyMigrationTitle"),
			style: {
				display: "flex",
				flexDirection: "column",
				gap: "16px",
				width: "min(560px, 100%)",
				maxHeight: "100%",
				overflow: "hidden",
				background: palette.raised,
				color: palette.text,
				border: `1px solid ${palette.border}`,
				borderRadius: "24px",
				padding: "22px 0 20px",
				boxShadow: "0 24px 60px rgba(0,0,0,0.42)"
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						padding: "0 24px",
						fontSize: "16px",
						lineHeight: "24px",
						fontWeight: 500
					},
					children: t("legacyMigrationTitle")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: "10px",
						minHeight: 0,
						overflow: "auto",
						padding: "0 24px"
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: "13px",
								lineHeight: "19px",
								color: palette.secondary
							},
							children: t("legacyMigrationBody", { count: candidates.length })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							style: {
								listStyle: "none",
								margin: 0,
								padding: 0,
								display: "grid",
								gap: "4px"
							},
							children: candidates.map((candidate) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
								"data-testid": "legacy-candidate",
								style: {
									display: "flex",
									alignItems: "baseline",
									flexWrap: "wrap",
									gap: "6px",
									padding: "6px 8px",
									border: `1px solid ${palette.border}`,
									borderRadius: "8px",
									backgroundColor: palette.field,
									fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
									fontSize: "11.5px",
									lineHeight: "16px"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											color: palette.text,
											overflowWrap: "anywhere"
										},
										children: candidate.path.join(".")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: { color: palette.secondary },
										children: "="
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
										style: {
											color: palette.accent,
											fontWeight: 700
										},
										children: String(candidate.value)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											padding: "0 6px",
											border: `1px solid ${palette.border}`,
											borderRadius: "999px",
											color: palette.secondary,
											fontFamily: "inherit",
											fontSize: "10.5px",
											whiteSpace: "nowrap"
										},
										children: sourceLabel(candidate.source)
									})
								]
							}, candidate.path.join(".")))
						}),
						phase.kind === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							role: "alert",
							style: {
								padding: "6px 8px",
								border: `1px solid ${palette.dangerBorder}`,
								borderRadius: "8px",
								backgroundColor: palette.dangerBg,
								color: palette.danger,
								fontSize: "12px",
								lineHeight: "18px"
							},
							children: t("legacyMigrationFailed", { reason: phase.reason })
						}) : null
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						gap: "8px",
						justifyContent: "flex-end",
						padding: "0 24px"
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
							text: t("legacyMigrationLater"),
							onClick: () => {
								setPhase({ kind: "later" });
							},
							disabled: busy,
							tone: "ghost",
							palette,
							testId: "legacy-later"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
							text: t("legacyMigrationDismiss"),
							onClick: () => {
								commit(target, "dismiss");
							},
							disabled: busy,
							palette,
							testId: "legacy-dismiss"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionButton, {
							text: t("legacyMigrationApply"),
							onClick: () => {
								commit(target, "migrate");
							},
							disabled: busy,
							tone: "primary",
							palette,
							icon: "check",
							testId: "legacy-apply"
						})
					]
				})
			]
		})
	});
}
//#endregion
//#region packages/settings-ui/src/client/index.ts
/**
* The legacy-migration dialog, rendered only while its Loader row is on.
*
* The slot stays registered so the dialog can appear when its row is enabled.
*/
function MigrationOverlayGate({ settings, t, switches }) {
	const snapshot = (0, react.useSyncExternalStore)(switches?.subscribe ?? (() => () => void 0), switches?.getSnapshot ?? (() => void 0), switches?.getSnapshot ?? (() => void 0));
	if (switches !== void 0 && snapshot !== void 0 && !partEnabled(snapshot, "migration")) return null;
	return (0, react.createElement)(LegacyMigrationModal, {
		settings,
		t
	});
}
const SLOT_NAME = "settings.section";
const SLOT_ID = "thinking-effort";
const SLOT_ORDER = 12;
const OVERLAY_NAME = "shell.overlay";
const OVERLAY_ID = "thinking-effort-legacy-migration";
const OVERLAY_ORDER = 40;
function hasLanguage(locale, id) {
	const snapshot = locale.getSnapshot?.();
	return Array.isArray(snapshot?.locales) && snapshot.locales.some((entry) => entry?.id === id);
}
/**
* A live view of the optional `ctx.configForms` service (DSH 0.1.7+).
*
* The service belongs to `@deepseek-ai/dsh-client-ui-settings`, whose fiber can
* activate AFTER this plugin's `apply` (client entries are created
* concurrently), and `mount()` registers its slots exactly once. Re-reading on
* every `get` therefore lets a late arrival reach an editor that is already
* mounted, and keeps `configForms` out of the static `inject` array — a
* declared-but-missing service parks the whole fiber.
*
* @param context - The client context whose service table is re-read per call.
* @returns A `ConfigFormsService` face that is never itself `undefined`; `get`
*   answers `undefined` while the real service has not been provided yet.
*/
function configFormsView(context) {
	const resolve = () => {
		const value = context.get("configForms");
		return value !== null && typeof value === "object" && typeof value.get === "function" ? value : void 0;
	};
	return { get: (entryId) => resolve()?.get(entryId) };
}
function apply$2(context, options = {}) {
	const { switches, reread } = options;
	const onMounted = reread === void 0 ? void 0 : () => {
		reread();
	};
	const slots = context.get("slots");
	if (slots === void 0) return;
	const connection = context.get("connection");
	const locale = context.get("locale");
	let mounted = false;
	const mount = (settings) => {
		if (mounted || settings === void 0) return;
		mounted = true;
		const runtime = createTakeoverRuntimeStore();
		const observedSettings = observeTakeoverSettings(settings, runtime.update);
		const translate = locale.bind(LOCALE_NS);
		context.effect(() => {
			const languageDisposers = [];
			const disposeDictionaries = locale.register(LOCALE_NS, LOCALE_DATA);
			const canRegisterExternalLanguages = settings.externalLanguages && typeof locale.addLanguage === "function";
			try {
				if (canRegisterExternalLanguages && !hasLanguage(locale, "ja")) languageDisposers.push(locale.addLanguage({
					id: "ja",
					label: translate("languageJapanese"),
					fallback: "en"
				}));
				if (canRegisterExternalLanguages && !hasLanguage(locale, "ko")) languageDisposers.push(locale.addLanguage({
					id: "ko",
					label: translate("languageKorean"),
					fallback: "en"
				}));
			} catch (error) {
				for (const dispose of languageDisposers.reverse()) dispose();
				disposeDictionaries();
				runtime.dispose();
				observedSettings.dispose();
				throw error;
			}
			return () => {
				observedSettings.dispose();
				runtime.dispose();
				for (const dispose of languageDisposers.reverse()) dispose();
				disposeDictionaries();
			};
		}, "dsh-thinking-effort: language pack dictionaries");
		slots.inject(SLOT_NAME, () => registerComponentSlot(switches, "settings", () => slots.register({
			name: SLOT_NAME,
			id: SLOT_ID,
			order: SLOT_ORDER,
			locale: LOCALE_NS,
			label: () => translate("pageTitle")
		}, () => (0, react.createElement)(SectionEditor, {
			settings: observedSettings,
			locale,
			t: translate,
			takeoverRuntime: runtime,
			switches,
			onMounted
		}))));
		slots.inject(OVERLAY_NAME, () => slots.register({
			name: OVERLAY_NAME,
			id: OVERLAY_ID,
			order: OVERLAY_ORDER
		}, () => (0, react.createElement)(MigrationOverlayGate, {
			settings: observedSettings,
			t: translate,
			switches
		})));
	};
	const mountFromRemote = () => {
		mount(settingsBridge(connection, context.get("remote.settings"), locale.addLanguage, configFormsView(context)));
	};
	mountFromRemote();
	context.on("internal/service", (serviceName) => {
		if (serviceName === "remote.settings" || serviceName === "remote" || serviceName === "configForms") mountFromRemote();
	});
}
//#endregion
//#region \0dsh-css:/home/runner/work/dsh-thinking-effort/dsh-thinking-effort/packages/composer/src/thinking-slider/slider.module.css.mjs
const css = "._S8UJW_root{min-width:0;color:var(--dsw-alias-label-primary);--te-panel-surface:var(--dsw-alias-bg-layer-1);--te-thumb-inset:9px;--te-pip-half:7px;--te-menu-pad:4px;--te-panel-pad:12px;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:flex;position:relative}._S8UJW_panel{z-index:20;box-sizing:border-box;width:min(336px,100vw - 32px);max-width:calc(100vw - 32px);padding:var(--te-panel-pad);border-radius:var(--dsw-radius-lg);background:var(--te-panel-surface);color:var(--dsw-alias-label-primary);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);border:0;flex-direction:column;gap:10px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0}._S8UJW_reasoning{justify-content:space-between;align-items:baseline;gap:12px;min-width:0;display:flex}._S8UJW_reasoningLabel{color:var(--dsw-alias-label-primary);font-weight:600}._S8UJW_currentEffort{color:var(--dsw-alias-brand-primary);text-overflow:ellipsis;white-space:nowrap;font-weight:600;overflow:hidden}._S8UJW_rangeWrap{min-width:0;height:30px;position:relative}._S8UJW_rangeTrack{top:13px;right:var(--te-thumb-inset);left:var(--te-thumb-inset);background:var(--dsw-alias-border-l2);border-radius:999px;height:4px;position:absolute;overflow:visible}._S8UJW_rangeFill{width:var(--range-progress,0%);border-radius:inherit;background:var(--dsw-alias-brand-primary-new-colorprimary-new-color);height:100%;position:absolute;top:0;left:0;overflow:hidden}._S8UJW_rangeFill:after{background:linear-gradient(90deg, transparent, var(--dsw-alias-label-primary-foreground), transparent);content:\"\";opacity:.5;border-radius:999px;width:42px;height:20px;animation:1.8s ease-in-out infinite _S8UJW_rangeShimmer;position:absolute;top:-8px;left:-48px}._S8UJW_rangePips{position:absolute;inset:-3px 0}._S8UJW_rangePip{border:3px solid var(--dsw-alias-border-l2);corner-shape:round;background:var(--te-panel-surface);box-sizing:border-box;border-radius:50%;width:14px;height:14px;position:absolute;top:50%;transform:translate(-50%,-50%)}._S8UJW_activePip{width:14px;height:14px;box-shadow:none;opacity:0;border-color:#0000}._S8UJW_range{z-index:1;appearance:none;cursor:pointer;background:0 0;width:100%;min-width:0;height:30px;margin:0;position:absolute;inset:0}._S8UJW_range::-webkit-slider-runnable-track{background:0 0;height:4px}._S8UJW_range::-moz-range-track{background:0 0;height:4px}._S8UJW_range::-webkit-slider-thumb{appearance:none;border:3px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color);background:var(--te-panel-surface);width:18px;height:18px;box-shadow:0 0 0 0 var(--dsw-alias-interactive-bg-hover-accent);border-radius:50%;margin-top:-7px;transition:box-shadow .16s,transform .16s}._S8UJW_range::-moz-range-thumb{border:3px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color);background:var(--te-panel-surface);width:12px;height:12px;box-shadow:0 0 0 0 var(--dsw-alias-interactive-bg-hover-accent);border-radius:50%}._S8UJW_range:hover::-webkit-slider-thumb,._S8UJW_range:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 5px var(--dsw-alias-interactive-bg-hover-accent);transform:scale(1.05)}._S8UJW_range:focus-visible{outline:2px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color);outline-offset:2px}._S8UJW_range:disabled{cursor:default;opacity:.65}._S8UJW_range[data-seat-unset=true]::-webkit-slider-thumb{opacity:0;box-shadow:none}._S8UJW_range[data-seat-unset=true]::-moz-range-thumb{opacity:0;box-shadow:none}@keyframes _S8UJW_rangeShimmer{0%{transform:translate(0)}to{transform:translate(360px)}}._S8UJW_scale{height:calc(20px + var(--dsh-content-font-delta-secondary,0px));min-width:0;margin:0 var(--te-thumb-inset);position:relative}._S8UJW_tick{min-width:0;max-width:50%;color:var(--dsw-alias-label-secondary);text-align:center;text-overflow:ellipsis;white-space:nowrap;position:absolute;top:0;overflow:hidden;transform:translate(-50%)}._S8UJW_tick:first-child:not(:last-child){text-align:left;transform:translateX(calc(-1 * var(--te-pip-half)))}._S8UJW_tick:last-child:not(:first-child){text-align:right;transform:translateX(calc(-100% + var(--te-pip-half)))}._S8UJW_activeTick{color:var(--dsw-alias-brand-primary);font-weight:600}._S8UJW_followDefault{min-height:32px;color:var(--dsw-alias-label-secondary);font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:4px;align-self:stretch;align-items:center;gap:8px;margin:0;padding:4px 8px;display:flex}._S8UJW_followDefault:before{border:2px solid var(--dsw-alias-border-l1);background:var(--te-panel-surface);box-sizing:border-box;content:\"\";border-radius:50%;flex:0 0 14px;width:14px;height:14px}._S8UJW_followDefault:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}._S8UJW_followDefaultActive{color:var(--dsw-alias-brand-primary-new-colorprimary-new-color);font-weight:600}._S8UJW_followDefaultActive:before{border-color:var(--dsw-alias-brand-primary-new-colorprimary-new-color);box-shadow:inset 0 0 0 3px var(--te-panel-surface);background:var(--dsw-alias-brand-primary-new-colorprimary-new-color)}._S8UJW_empty{color:var(--dsw-alias-label-tertiary)}._S8UJW_error{color:var(--dsw-alias-state-error-primary)}._S8UJW_modelRow,._S8UJW_chip{min-width:0;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;border:0;align-items:center;display:flex}._S8UJW_modelRow{border-top:.5px solid var(--dsw-alias-border-l1);box-sizing:border-box;background:0 0;border-radius:4px;align-items:center;gap:12px;height:44px;margin:2px -8px -4px;padding:0 8px;display:flex;position:relative}._S8UJW_modelRow:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}._S8UJW_modelLabel{color:var(--dsw-alias-label-secondary);flex:none}._S8UJW_modelName,._S8UJW_chipModel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}._S8UJW_modelName{text-align:right;flex:auto;min-width:0}._S8UJW_modelRowButton{width:100%;min-width:0;height:100%;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:12px;padding:0;display:flex}._S8UJW_modelRowButton:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}._S8UJW_modelSelect{z-index:-1;opacity:0;pointer-events:none;width:1px;height:1px;position:absolute;inset:0}._S8UJW_modelGroup+._S8UJW_modelGroup{margin-top:4px}._S8UJW_modelGroupLabel{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}._S8UJW_modelMenu{right:var(--te-panel-pad);bottom:58px;left:var(--te-panel-pad);z-index:2;scrollbar-gutter:stable;max-height:min(220px,100vh - 96px);padding:var(--te-menu-pad);border-radius:var(--dsw-radius-lg);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);--te-panel-surface:var(--dsw-alias-bg-layer-2);background:var(--te-panel-surface);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);border:0;position:absolute;overflow:auto}._S8UJW_modelSearch{border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);width:100%;height:32px;color:var(--dsw-alias-label-primary);font:inherit;outline:none;margin-bottom:4px;padding:0 8px}._S8UJW_modelSearch:focus{border-color:var(--dsw-alias-state-business-primary)}._S8UJW_modelGroupToggle{width:100%;padding:calc(4px + var(--te-menu-pad)) 7px 2px;border-radius:var(--dsw-radius-md);background:var(--te-panel-surface);color:var(--dsw-alias-label-tertiary);text-align:left;cursor:pointer;top:calc(-1 * var(--te-menu-pad));z-index:1;border:0;justify-content:space-between;align-items:center;font-family:inherit;font-size:11px;font-weight:500;line-height:16px;display:flex;position:sticky}._S8UJW_modelGroupToggle:hover,._S8UJW_modelGroupToggle:focus-visible{background-color:var(--te-panel-surface);background-image:linear-gradient(var(--dsw-alias-interactive-bg-hover), var(--dsw-alias-interactive-bg-hover));outline:0}._S8UJW_modelGroupChevron{border-bottom:1.5px solid;border-right:1.5px solid;flex:none;width:7px;height:7px;margin-left:8px;transition:transform .14s;transform:rotate(45deg)translateY(-2px)}._S8UJW_modelGroupChevronOpen{transform:rotate(225deg)translateY(2px)}._S8UJW_modelNoResults{color:var(--dsw-alias-label-tertiary);text-align:center;padding:16px 8px}._S8UJW_modelOption{border-radius:var(--dsw-radius-md);width:100%;min-height:34px;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;padding:0 8px;font-family:inherit;font-size:13px;line-height:20px;display:flex}._S8UJW_modelOption:hover,._S8UJW_modelOption:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:0}._S8UJW_modelOptionSelected{color:var(--dsw-alias-brand-primary-new-colorprimary-new-color);font-weight:600}._S8UJW_chevron{height:14px;color:var(--dsw-alias-label-secondary);flex:0 0 14px;place-items:center;margin-left:8px;display:grid}._S8UJW_chevron:before{content:\"\";border-bottom:1px solid;border-right:1px solid;width:6px;height:6px;transition:transform .14s;display:block;transform:rotate(45deg)translateY(-2px)}._S8UJW_chevronOpen:before{transform:rotate(225deg)translateY(-2px)}._S8UJW_chip{background:var(--dsw-alias-interactive-bg-hover);corner-shape:round;border-radius:14px;width:fit-content;max-width:min(360px,100vw - 80px);height:28px;padding:0 8px}._S8UJW_chip:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-accent)}._S8UJW_chipModel{flex:auto}._S8UJW_chipEffort{border-left:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:none;margin-left:6px;padding-left:6px}._S8UJW_modelRow:has(._S8UJW_modelRowButton:focus-visible),._S8UJW_chip:focus-visible,._S8UJW_followDefault:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}._S8UJW_modelRow:disabled,._S8UJW_chip:disabled,._S8UJW_followDefault:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}";
const tagId = "spig-dsh-thinking-provider/slider.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
	const tag = document.createElement("style");
	tag.dataset.plugin = "spig-dsh-thinking-provider";
	tag.dataset.pluginCss = tagId;
	tag.textContent = css;
	document.head.appendChild(tag);
}
var slider_module_css_default = {
	"activePip": "_S8UJW_activePip",
	"activeTick": "_S8UJW_activeTick",
	"chevron": "_S8UJW_chevron",
	"chevronOpen": "_S8UJW_chevronOpen",
	"chip": "_S8UJW_chip",
	"chipEffort": "_S8UJW_chipEffort",
	"chipModel": "_S8UJW_chipModel",
	"currentEffort": "_S8UJW_currentEffort",
	"empty": "_S8UJW_empty",
	"error": "_S8UJW_error",
	"followDefault": "_S8UJW_followDefault",
	"followDefaultActive": "_S8UJW_followDefaultActive",
	"modelGroup": "_S8UJW_modelGroup",
	"modelGroupChevron": "_S8UJW_modelGroupChevron",
	"modelGroupChevronOpen": "_S8UJW_modelGroupChevronOpen",
	"modelGroupLabel": "_S8UJW_modelGroupLabel",
	"modelGroupToggle": "_S8UJW_modelGroupToggle",
	"modelLabel": "_S8UJW_modelLabel",
	"modelMenu": "_S8UJW_modelMenu",
	"modelName": "_S8UJW_modelName",
	"modelNoResults": "_S8UJW_modelNoResults",
	"modelOption": "_S8UJW_modelOption",
	"modelOptionSelected": "_S8UJW_modelOptionSelected",
	"modelRow": "_S8UJW_modelRow",
	"modelRowButton": "_S8UJW_modelRowButton",
	"modelSearch": "_S8UJW_modelSearch",
	"modelSelect": "_S8UJW_modelSelect",
	"panel": "_S8UJW_panel",
	"range": "_S8UJW_range",
	"rangeFill": "_S8UJW_rangeFill",
	"rangePip": "_S8UJW_rangePip",
	"rangePips": "_S8UJW_rangePips",
	"rangeShimmer": "_S8UJW_rangeShimmer",
	"rangeTrack": "_S8UJW_rangeTrack",
	"rangeWrap": "_S8UJW_rangeWrap",
	"reasoning": "_S8UJW_reasoning",
	"reasoningLabel": "_S8UJW_reasoningLabel",
	"root": "_S8UJW_root",
	"scale": "_S8UJW_scale",
	"tick": "_S8UJW_tick"
};
//#endregion
//#region packages/composer/src/thinking-slider/slider.tsx
/**
* Composer model seat (`conversation.input.model`) renders the host-provided
* model directory and submits discrete reasoning-effort changes through the
* injected session-selection callback.
*/
const EMPTY_EFFORTS = [];
/**
* The label to show for one provider group.
*
* The catalog's `name` is the provider's registered `displayName`, which is
* English for every built-in route (`DeepSeek Account`), so rendering it
* verbatim leaves a Chinese UI showing an English heading. DSH's own model menu
* localizes the signed-in account route by id, and this mirrors that rule so
* both menus read the same. Every other route keeps its registered name, which
* is the user's own text for a hand-declared gateway and must not be replaced.
*/
function providerGroupLabel(group, t) {
	return group.id === "deepseek-account" ? t("providerAccount") : group.name;
}
/** Resolve the current selection back to its catalog model entry. */
function currentModelOf(state) {
	if (state.current === null) return void 0;
	for (const group of state.groups) for (const model of group.models) if (group.id === state.current.provider && model.id === state.current.model) return model;
}
/** Build opaque option keys without treating provider/model ids as a wire format. */
function modelChoicesOf(state) {
	const choices = [];
	state.groups.forEach((group, groupIndex) => {
		group.models.forEach((model, modelIndex) => {
			choices.push({
				key: `choice:${groupIndex}:${modelIndex}`,
				provider: group.id,
				model
			});
		});
	});
	return choices;
}
/**
* Render the composer model seat. The expanded panel presents reasoning before
* the model row; the compact trigger preserves both model and effort labels.
*/
function Slider({ directory, load, select, locked = false, t }) {
	const state = (0, react.useSyncExternalStore)((fn) => directory.subscribe(fn), () => directory.getSnapshot());
	const [open, setOpen] = (0, react.useState)(false);
	const [panelLeft, setPanelLeft] = (0, react.useState)(0);
	const [modelOpen, setModelOpen] = (0, react.useState)(false);
	const [modelQuery, setModelQuery] = (0, react.useState)("");
	const [expandedModelGroup, setExpandedModelGroup] = (0, react.useState)(null);
	const rootRef = (0, react.useRef)(null);
	const triggerRef = (0, react.useRef)(null);
	const current = state.current;
	const model = currentModelOf(state);
	/** Provider group of the current selection, for the "provider: model" seat label. */
	const currentGroup = current === null ? void 0 : state.groups.find((group) => group.id === current.provider);
	const providerLabel = currentGroup === void 0 ? "" : providerGroupLabel(currentGroup, t);
	const modelLabel = current === null ? state.status === "loading" ? t("seatModelLoading") : t("seatNoModel") : model?.name ?? `${current.provider}/${current.model}`;
	/** Fork: the compact trigger qualifies the model with its provider. */
	const seatLabel = current === null || providerLabel === "" ? modelLabel : `${providerLabel}: ${modelLabel}`;
	/** Fork: the tooltip keeps the raw route ids, which never collide. */
	const seatHint = current === null ? modelLabel : `${current.provider}: ${current.model}`;
	const reasoning = model?.reasoning;
	const efforts = reasoning?.efforts ?? EMPTY_EFFORTS;
	const choices = modelChoicesOf(state);
	const selectedChoice = choices.find((choice) => choice.provider === current?.provider && choice.model.id === current?.model);
	const selectedProvider = selectedChoice?.provider;
	const normalizedModelQuery = modelQuery.trim().toLocaleLowerCase();
	const visibleModelGroups = state.groups.map((group) => ({
		group,
		models: group.models.filter((option) => normalizedModelQuery.length === 0 || `${option.name} ${option.id}`.toLocaleLowerCase().includes(normalizedModelQuery))
	})).filter(({ models }) => models.length > 0);
	const effectiveEffort = (state.pending ?? current)?.reasoningEffort ?? reasoning?.defaultEffort;
	const effortIndex = efforts.findIndex(({ id }) => id === effectiveEffort);
	const rangeValue = effortIndex < 0 ? 0 : effortIndex;
	const rangeEffort = efforts[rangeValue];
	const followingModelDefault = current !== null && current.reasoningEffort === void 0 && reasoning?.defaultEffort === void 0;
	const currentEffortLabel = followingModelDefault ? t("seatFollowDefault") : rangeEffort?.name ?? t("seatNoEfforts");
	const hasDirectoryError = state.status === "error" && state.error !== null;
	const busy = locked || state.status === "selecting" || select === void 0;
	/**
	* The range is a continuous control, so an in-flight selection must not
	* disable it. The official directory sets `selecting` synchronously at the
	* top of its async `select()`, before the first await, so `busy` would cut
	* every drag after its first step. The directory is built for this: each
	* `select()` takes a generation and only the newest answer is applied.
	*/
	const rangeBusy = locked || select === void 0;
	const rangeProgress = !followingModelDefault && efforts.length > 1 && effortIndex >= 0 ? `${effortIndex / (efforts.length - 1) * 100}%` : "0%";
	(0, react.useEffect)(() => {
		if (!open) return;
		const closeOutside = (event) => {
			if (rootRef.current?.contains(event.target)) return;
			setModelOpen(false);
			setModelQuery("");
			setOpen(false);
		};
		document.addEventListener("mousedown", closeOutside);
		return () => {
			document.removeEventListener("mousedown", closeOutside);
		};
	}, [open]);
	(0, react.useLayoutEffect)(() => {
		if (!open) return;
		const compute = () => {
			const root = rootRef.current;
			if (root === null) return;
			const rect = root.getBoundingClientRect();
			const panelWidth = Math.min(336, window.innerWidth - 32);
			const margin = 16;
			const originalLeft = rect.width - panelWidth;
			const viewportLeft = rect.left + originalLeft;
			const clamped = Math.min(Math.max(viewportLeft, margin), window.innerWidth - panelWidth - margin);
			setPanelLeft(clamped - rect.left);
		};
		compute();
		window.addEventListener("resize", compute);
		window.addEventListener("scroll", compute, true);
		return () => {
			window.removeEventListener("resize", compute);
			window.removeEventListener("scroll", compute, true);
		};
	}, [open]);
	(0, react.useEffect)(() => {
		if (modelOpen) setExpandedModelGroup(selectedProvider ?? state.groups[0]?.id ?? null);
	}, [
		modelOpen,
		selectedProvider,
		state.groups
	]);
	const closeWithFocus = () => {
		setModelOpen(false);
		setModelQuery("");
		setOpen(false);
		queueMicrotask(() => {
			triggerRef.current?.focus();
		});
	};
	const onKeyDown = (event) => {
		if (event.key !== "Escape" || !open) return;
		event.preventDefault();
		closeWithFocus();
	};
	const submit = (selection) => {
		if (locked || select === void 0) return;
		select(selection).then(() => {}, () => {});
	};
	const onRangeChange = (event) => {
		if (current === null) return;
		const effort = efforts[Number(event.currentTarget.value)];
		if (effort === void 0) return;
		submit({
			provider: current.provider,
			model: current.model,
			reasoningEffort: effort.id
		});
	};
	const submitModel = (choice) => {
		const reasoningEffort = choice.provider === current?.provider && choice.model.id === current?.model ? current?.reasoningEffort ?? choice.model.reasoning?.defaultEffort : choice.model.reasoning?.defaultEffort;
		submit({
			provider: choice.provider,
			model: choice.model.id,
			...reasoningEffort === void 0 ? {} : { reasoningEffort }
		});
		setModelOpen(false);
		setModelQuery("");
	};
	const onModelChange = (event) => {
		const choice = choices.find((item) => item.key === event.currentTarget.value);
		if (choice !== void 0) submitModel(choice);
	};
	const modelTrigger = () => (0, react.createElement)("button", {
		className: slider_module_css_default.chip,
		"data-seat-trigger": "true",
		ref: triggerRef,
		type: "button",
		disabled: locked,
		"aria-expanded": open,
		"aria-label": followingModelDefault ? seatLabel : `${seatLabel}: ${currentEffortLabel}`,
		onClick: () => {
			setOpen(true);
			load?.();
		}
	}, [
		(0, react.createElement)("span", {
			className: slider_module_css_default.chipModel,
			key: "model",
			title: seatHint
		}, current === null || providerLabel === "" ? modelLabel : [
			(0, react.createElement)("span", {
				key: "provider",
				style: { color: "var(--dsw-alias-label-caption)" }
			}, providerLabel),
			(0, react.createElement)("span", {
				key: "separator",
				style: { color: "var(--dsw-alias-label-caption)" }
			}, ": "),
			(0, react.createElement)("span", { key: "model-name" }, modelLabel)
		]),
		/** Fork: with no explicit level chosen, the chip shows only provider+model. */
		followingModelDefault ? null : (0, react.createElement)("span", {
			className: slider_module_css_default.chipEffort,
			key: "effort"
		}, currentEffortLabel),
		(0, react.createElement)("span", {
			className: slider_module_css_default.chevron,
			key: "chevron",
			"aria-hidden": true
		})
	]);
	const modelSelect = (0, react.createElement)("div", {
		className: slider_module_css_default.modelRow,
		"data-seat-model-row": "true"
	}, (0, react.createElement)("button", {
		className: slider_module_css_default.modelRowButton,
		type: "button",
		disabled: busy,
		"aria-haspopup": "listbox",
		"aria-expanded": modelOpen,
		onClick: () => {
			setModelOpen((value) => {
				if (value) setModelQuery("");
				return !value;
			});
		}
	}, (0, react.createElement)("span", { className: slider_module_css_default.modelLabel }, t("seatModelLabel")), (0, react.createElement)("span", {
		className: slider_module_css_default.modelName,
		title: seatHint
	}, seatLabel), (0, react.createElement)("span", {
		className: modelOpen ? `${slider_module_css_default.chevron} ${slider_module_css_default.chevronOpen}` : slider_module_css_default.chevron,
		"data-seat-model-chevron": "true",
		"aria-hidden": true
	})), (0, react.createElement)("select", {
		className: slider_module_css_default.modelSelect,
		"data-seat-model-select": "true",
		"aria-label": t("seatModelLabel"),
		tabIndex: -1,
		"aria-hidden": true,
		value: selectedChoice?.key ?? "",
		disabled: busy,
		onChange: onModelChange
	}, (0, react.createElement)("option", {
		value: "",
		disabled: true
	}, t("seatNoModel")), ...state.groups.map((group, groupIndex) => (0, react.createElement)("optgroup", {
		label: providerGroupLabel(group, t),
		key: group.id
	}, ...group.models.map((option, modelIndex) => (0, react.createElement)("option", {
		value: `choice:${groupIndex}:${modelIndex}`,
		key: option.id
	}, option.name))))));
	const modelMenu = modelOpen ? (0, react.createElement)("div", {
		className: slider_module_css_default.modelMenu,
		role: "listbox",
		"data-seat-model-menu": "true",
		"aria-label": t("seatModelLabel")
	}, (0, react.createElement)("input", {
		className: slider_module_css_default.modelSearch,
		"data-seat-model-search": "true",
		type: "search",
		value: modelQuery,
		placeholder: t("seatSearchModels"),
		"aria-label": t("seatSearchModels"),
		onChange: (event) => {
			setModelQuery(event.currentTarget.value);
		}
	}), visibleModelGroups.length === 0 ? (0, react.createElement)("div", { className: slider_module_css_default.modelNoResults }, t("seatNoModelResults")) : visibleModelGroups.map(({ group, models }) => {
		const expanded = modelQuery.trim().length > 0 || group.id === expandedModelGroup;
		return (0, react.createElement)("div", {
			className: slider_module_css_default.modelGroup,
			key: group.id
		}, (0, react.createElement)("button", {
			className: slider_module_css_default.modelGroupToggle,
			type: "button",
			"aria-expanded": expanded,
			onClick: () => {
				setExpandedModelGroup((value) => value === group.id ? null : group.id);
			}
		}, (0, react.createElement)("span", { className: slider_module_css_default.modelGroupLabel }, providerGroupLabel(group, t)), (0, react.createElement)("span", {
			className: expanded ? `${slider_module_css_default.modelGroupChevron} ${slider_module_css_default.modelGroupChevronOpen}` : slider_module_css_default.modelGroupChevron,
			"aria-hidden": true
		})), expanded ? models.map((option) => {
			const choice = choices.find((item) => item.provider === group.id && item.model.id === option.id);
			if (choice === void 0) return null;
			const selected = choice.key === selectedChoice?.key;
			return (0, react.createElement)("button", {
				className: selected ? `${slider_module_css_default.modelOption} ${slider_module_css_default.modelOptionSelected}` : slider_module_css_default.modelOption,
				type: "button",
				role: "option",
				"aria-selected": selected,
				disabled: busy,
				onClick: () => {
					submitModel(choice);
				},
				key: choice.key
			}, option.name);
		}) : null);
	})) : null;
	const content = efforts.length === 0 ? hasDirectoryError ? (0, react.createElement)("div", { className: slider_module_css_default.error }, t("seatError", { message: state.error })) : (0, react.createElement)("div", { className: slider_module_css_default.empty }, t("seatNoEfforts")) : [
		(0, react.createElement)("div", {
			className: slider_module_css_default.rangeWrap,
			"data-seat-range": "true",
			key: "range"
		}, (0, react.createElement)("div", {
			className: slider_module_css_default.rangeTrack,
			style: { "--range-progress": rangeProgress },
			"aria-hidden": true
		}, (0, react.createElement)("span", { className: slider_module_css_default.rangeFill }), (0, react.createElement)("span", { className: slider_module_css_default.rangePips }, ...efforts.map((effort, index) => (0, react.createElement)("span", {
			className: !followingModelDefault && index === effortIndex ? `${slider_module_css_default.rangePip} ${slider_module_css_default.activePip}` : slider_module_css_default.rangePip,
			key: effort.id,
			style: { left: `${index / Math.max(efforts.length - 1, 1) * 100}%` }
		})))), (0, react.createElement)("input", {
			className: slider_module_css_default.range,
			"data-seat-input": "true",
			...followingModelDefault ? { "data-seat-unset": "true" } : {},
			type: "range",
			min: 0,
			max: efforts.length - 1,
			step: 1,
			value: rangeValue,
			disabled: rangeBusy,
			"aria-label": t("seatSliderLabel"),
			"aria-valuetext": currentEffortLabel,
			onChange: onRangeChange
		})),
		(0, react.createElement)("div", {
			className: slider_module_css_default.scale,
			"data-seat-scale": "true",
			key: "scale"
		}, ...efforts.map((effort, index) => (0, react.createElement)("span", {
			className: !followingModelDefault && index === effortIndex ? `${slider_module_css_default.tick} ${slider_module_css_default.activeTick}` : slider_module_css_default.tick,
			...!followingModelDefault && index === effortIndex ? { "data-seat-active": "true" } : {},
			key: effort.id,
			style: { left: `${index / Math.max(efforts.length - 1, 1) * 100}%` }
		}, effort.name))),
		/** Fork: the "Follow model default" toggle is intentionally not rendered. */
		hasDirectoryError ? (0, react.createElement)("div", {
			className: slider_module_css_default.error,
			"data-seat-select-error": "true",
			key: "error"
		}, t("seatErrorAction", { message: state.error })) : null
	];
	const panel = open ? (0, react.createElement)("div", {
		className: slider_module_css_default.panel,
		"data-seat-panel": "true",
		style: { left: `${panelLeft}px` }
	}, (0, react.createElement)("div", {
		className: slider_module_css_default.reasoning,
		"data-seat-reasoning": "true"
	}, (0, react.createElement)("span", { className: slider_module_css_default.reasoningLabel }, t("seatReasoningLabel")), followingModelDefault ? null : (0, react.createElement)("span", { className: slider_module_css_default.currentEffort }, currentEffortLabel)), content, modelSelect, modelMenu) : modelTrigger();
	return (0, react.createElement)("div", {
		className: slider_module_css_default.root,
		ref: rootRef,
		onKeyDown,
		"data-seat-root": "true"
	}, panel);
}
//#endregion
//#region packages/composer/src/thinking-slider/index.ts
/**
* Thinking-effort composer model seat (`conversation.input.model`): registers
* the seat over the optional shared model directory. The directory service is
* read from the application context at apply time — when the official
* ui-model-selection plugin is absent the seat is skipped so the Settings page
* keeps working. The injected face is exactly the JSON-safe directory
* store/verbs (`{ directory, load, select }`); the seat renders only through
* those props.
*
* DSH version adaptation (see version-research.md): the seat's closure calls
* `directoryFor()`, whose controller internally reaches the session remote
* face. That face is `remote.session` from DSH `0.1.2-alpha.1+` (npm
* `0.1.2-alpha.2`+) but `connection.api.sessions` on `0.1.0-rc.7` and
* `0.1.0-rc.8` — a version where `remote.session` does not exist as a service.
* Because Cordis silently parks a fiber whose `inject` lists a missing service
* (never calling `apply`), the seat must declare `remote.session` only when the
* runtime exposes it, decided here by a shape probe via `context.get` (the
* inject-free read face).
*/
/** Target slot key of the composer model seat. */
const SEAT_NAME = "conversation.input.model";
/**
* Register the composer model seat over a Cordis-style client context. The
* optional `modelDirectories` service is a declared `inject` dependency, so the
* seat registers only when the official ui-model-selection service is live; it
* is skipped when that service is absent. The `inject` list includes
* `remote.session` only on runtimes that expose it (modern DSH); older
* runtimes register with the base list, which is enough because the directory
* controller owns its own `connection` face there.
* @param context - client root context (slots + locale + optional model service).
*/
function apply$1(context, switches) {
	const translate = context.get("locale") ? context.get("locale").bind(LOCALE_NS) : (key) => key;
	let registered = false;
	const registerWhenReady = () => {
		if (registered) return;
		if (!asModelDirectories(context.get("modelDirectories"))) return;
		const compatibility = modelDirectoryCompatibility(context);
		registered = true;
		context.plugin({
			name: "dsh-thinking-effort:composer-seat",
			inject: compatibility.inject,
			apply: (scope) => {
				const scopedSlots = scope.slots;
				if (scopedSlots === void 0) return;
				const directories = asModelDirectories(scope.get("modelDirectories"));
				if (directories === void 0) return;
				const resolveFace = createModelDirectoryFaceResolver(scope, directories);
				scopedSlots.inject(SEAT_NAME, () => registerComponentSlot(switches, "composer", () => scopedSlots.register({
					name: SEAT_NAME,
					priority: -10,
					locale: LOCALE_NS,
					inject: (sessionId) => resolveFace(sessionId)
				}, (props) => (0, react.createElement)(Slider, {
					directory: props.directory,
					load: props.load,
					select: props.select,
					locked: props.locked,
					t: props.t ?? translate
				}))));
			}
		});
	};
	registerWhenReady();
	context.on("internal/service", (serviceName) => {
		if (serviceName === "modelDirectories" || serviceName === "remote.session") registerWhenReady();
	});
}
//#endregion
//#region lib/types/src/client/index.js
/**
* The client bundle's single entry.
*
* `dsh.client` is declared per package, so the browser artifact is one file no
* matter how many Cordis entries the profile enables: the Loader fetches and
* runs this module ONCE. That is why the switches have to be read here rather
* than inferred from what mounted — a disabled `thinking-effort-opencode` row
* stops the host from injecting headers, but it does not stop this file from
* loading, so the settings panel would otherwise keep rendering an OpenCode card
* for a feature that is not running.
*
* Each client package exposes parts rather than one `apply` for exactly this
* reason: the panel and the Composer seat are separate Loader rows, so turning
* one off must not take the other with it.
*
* Keeping the entry at this path is deliberate — the emitted
* `window.__ModuleLoader__.load({ id: 'spig-dsh-thinking-provider' })` banner and
* the `dsh.client` declaration both assume it.
*/
const name = "spig-dsh-thinking-provider";
const inject = [
	"slots",
	"connection",
	"locale"
];
const SWITCHES_TIMEOUT_MS = 3e3;
function apply(context) {
	const { store, update } = createComponentSwitchStore();
	let mounted = false;
	let timer;
	const mount = () => {
		if (mounted) return;
		mounted = true;
		if (timer !== void 0) clearTimeout(timer);
		apply$2(context, {
			switches: store,
			reread
		});
		apply$1(context, store);
	};
	const reread = readComponentSwitches(context, (switches) => {
		update(switches);
		mount();
	});
	if (!mounted && typeof setTimeout === "function") timer = setTimeout(mount, SWITCHES_TIMEOUT_MS);
}
//#endregion
exports.apply = apply;
exports.inject = inject;
exports.name = name;

module.exports = exports; return module.exports; } });