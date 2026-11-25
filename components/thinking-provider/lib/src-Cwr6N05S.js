import { z } from "./vendor-deps.js";
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
* The policy in effect for one exact route, after applying its override.
*
* @param policy - the resolved plugin policy.
* @param provider - registered provider id, the first half of the override key.
* @param model - exact model id, the second half.
* @returns the effective ratios for that route.
*/
function policyForModel(policy, provider, model) {
	const override = policy.models[provider]?.[model];
	return {
		thresholdRatio: override?.thresholdRatio ?? policy.thresholdRatio,
		retainRatio: override?.retainRatio ?? policy.retainRatio
	};
}
/**
* The token count at which this route compacts.
*
* Mirrors the official formula's shape but not its headroom term: the plugin has
* no output reservation to subtract, so it prices against the window directly.
* The official backend still applies its own `headroomTokens` — which is exactly
* why this ratio must stay lower.
*
* @param contextWindow - the routed adapter's declared combined capacity.
* @param thresholdRatio - the effective window fraction for this route.
* @returns the inclusive token pressure that triggers a pass.
*/
function thresholdTokens(contextWindow, thresholdRatio) {
	return Math.floor(contextWindow * thresholdRatio);
}
/**
* The verbatim recent-tail budget for one route.
*
* Measured against the same window the threshold uses, so the two cannot drift
* apart when a model declares an unusual capacity.
*
* @param contextWindow - the routed adapter's declared combined capacity.
* @param retainRatio - the effective retention fraction for this route.
* @returns the token budget the newest history keeps verbatim.
*/
function retainTokens(contextWindow, retainRatio) {
	return Math.floor(contextWindow * retainRatio);
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
Object.keys(GATEWAY_COMPAT_FIELDS);
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
const LOG_PREFIX = "[spig-dsh-thinking-provider]";
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
const DEFAULT_LEVELS = {
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
//#endregion
//#region packages/kit/src/compat/settings-model.ts
function method(value, name) {
	if (typeof value !== "object" && typeof value !== "function" || value === null) return void 0;
	const candidate = Reflect.get(value, name);
	return typeof candidate === "function" ? candidate : void 0;
}
function record(value) {
	return isUnknownRecord(value) ? value : void 0;
}
/**
* Detect the settings model from the live service rather than from a version
* string, because the same version can be reached through a compatibility
* provider. `undefined` means the service exposes no recognizable shape.
*/
function settingsModelOf(settings) {
	if (settings === void 0 || settings === null) return void 0;
	return method(settings, "describe") === void 0 ? void 0 : "entry-config";
}
/**
* The event that reports a change to a settings section.
*
* `settings/document-updated` is the only one the entry-config model emits. The
* legacy `settings/updated` event belonged to the namespace model, which no
* supported host exposes.
*/
function settingsChangeEvents(model) {
	return model === "entry-config" ? ["settings/document-updated"] : [];
}
/** The `describe()` descriptor of one section, or `undefined` when it is absent or unreadable. */
function descriptorOf(settings, namespace) {
	const describe = method(settings, "describe");
	if (describe === void 0) return void 0;
	try {
		const descriptors = describe.call(settings);
		if (!Array.isArray(descriptors)) return void 0;
		return record(descriptors.find((candidate) => String(record(candidate)?.ns) === namespace));
	} catch {
		return;
	}
}
/**
* Read one section's resolved value. The entry-config model has no `get`, so
* the value is projected out of `describe()` — the same resolved shape the
* configuration UI reads. A missing section and a throwing service both read as
* `undefined`.
*/
function readSettingsSection(settings, namespace) {
	return descriptorOf(settings, namespace)?.value;
}
/**
* Read one section's user-override layer. A descriptor's `user` layer holds only
* what the user explicitly wrote, which is the layer that can express "unset"
* for a field a schema supplies a default for; the resolved `value` cannot. A
* missing section, a section without a user layer, and a throwing service all
* read as `undefined`.
*/
function readSettingsSectionUser(settings, namespace) {
	return descriptorOf(settings, namespace)?.user;
}
/**
* The id a plugin's own configuration section carries. A section is addressed
* by its Loader entry id rather than by a registered namespace name.
*/
function settingsEntryId(ctx, fallback) {
	const id = record(ctx)?.fiber;
	const entryId = record(record(id)?.entry)?.options;
	const value = record(entryId)?.id;
	return typeof value === "string" && value.length > 0 ? value : fallback;
}
/**
* The id of the section that holds THIS PLUGIN's configuration.
*
* The bundle splits into seven Loader entries, but only the ROOT row publishes a
* schema — `Config` is exported from the package entry, so the entry-config model
* derives exactly one section, addressed by `thinking-effort`. The other six rows
* are behaviour only: they carry no schema and publish no section.
*
* So a feature must NOT address itself by {@link settingsEntryId}: that answers
* the row the feature happens to run in (`thinking-effort-opencode`, `-migration`,
* …), and a read or write there finds a section nothing publishes. Before this
* existed, the subagent route silently fell back to the legacy namespace and the
* migration watcher wrote offers into a section no surface renders.
*
* @returns the root row's entry id.
*/
function pluginSectionId() {
	return PLUGIN_ENTRY_ID;
}
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
function settingsModelForVersion(version) {
	return capabilitiesForVersion(version)?.settingsModel;
}
/**
* The settings model the plugin must code against. The live service decides,
* because the same version can be reached through a compatibility provider;
* the version map only answers when the service exposes neither shape. An
* unknown version with an unknown service yields `undefined`, and callers keep
* their most conservative behaviour.
*/
function settingsModelForRuntime(input) {
	const detected = settingsModelOf(input.settings);
	if (detected !== void 0) return detected;
	return typeof input.version === "string" ? settingsModelForVersion(input.version) : void 0;
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
function hostCapabilities(input) {
	return capabilities(hasMethods(input.settings, ["update", "describe"]) ? "legacy" : "none", false);
}
//#endregion
//#region packages/kit/src/plugin-settings.ts
/**
* One stored configuration snapshot. Fields carry defaults so a section
* hand-written without them still resolves; `createdAt` is the sentinel for
* "never written", because the defaults materialize this object either way.
*/
const configSnapshot = z.object({
	kind: z.string().default(SNAPSHOT_KIND),
	version: z.number().default(1),
	createdAt: z.string().default(""),
	pluginVersion: z.string().default(""),
	sourceProfile: z.string().default("unknown"),
	sections: z.dict(z.any()).default({})
});
const openCodeSessionModels = z.dict(z.boolean()).default({});
const openCodeSessionProvider = z.object({ models: openCodeSessionModels }).default({ models: {} });
const openCodeSessionProviders = z.dict(openCodeSessionProvider).default({});
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
const openCodeSessionFormat = z.object({
	mode: z.string().default("ses-derive"),
	time: z.string().default("firstUse"),
	template: z.string().default(""),
	expression: z.string().default(""),
	script: z.string().default(""),
	validate: z.string().default(""),
	onInvalid: z.string().default("warn")
}).default({ ...OPENCODE_SESSION_FORMAT_DEFAULTS });
/**
* Defaults shared by the `userAgent` section schema and the stored namespace
* shape (mirrors the `format` section above).
*/
const OPENCODE_SESSION_USER_AGENT_DEFAULTS = {
	value: "",
	providers: {}
};
const openCodeSessionUserAgent = z.object({
	value: z.string().default(""),
	providers: z.dict(z.object({
		enabled: z.boolean().default(false),
		value: z.string().default(""),
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
const openCodeSession = z.object({
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
const compactionModelPolicy = z.object({
	thresholdRatio: z.number(),
	retainRatio: z.number()
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
const compactionPolicy = z.object({
	thresholdRatio: z.number().default(DEFAULT_THRESHOLD_RATIO),
	retainRatio: z.number().default(DEFAULT_RETAIN_RATIO),
	models: z.dict(z.dict(compactionModelPolicy)).default({})
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
const subagentModel = z.object({
	provider: z.string().default(""),
	model: z.string().default("")
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
const legacyCandidate = z.object({
	path: z.array(z.string()).default([]),
	value: z.union([
		z.string(),
		z.boolean(),
		z.number()
	]).default(""),
	source: z.string().default("")
});
/**
* The migration control object. The Host owns every field; the Client writes
* only `decision`.
*/
const legacyMigration = z.object({
	pending: z.boolean().default(false),
	candidates: z.array(legacyCandidate).default([]),
	signature: z.string().default(""),
	dismissedSignature: z.string().default(""),
	/** `''` | `'migrate'` | `'dismiss'` | `'scan'`. */
	decision: z.string().default(""),
	/** `''` | `'applied'` | `'dismissed'` | `'failed:<reason>'`. */
	lastResult: z.string().default(""),
	scannedAt: z.string().default(""),
	decidedAt: z.string().default("")
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
	subagentEffort: z.string().default(""),
	autoFillDefaults: z.boolean().default(true),
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
	profiles: z.dict(configSnapshot).default({}),
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
/**
* The `dsh-thinking-effort` namespace schema. Keeping it in one module makes
* the stored shape knowable without reading the settings UI.
*
* The explicit `z<PluginSettings>` annotation is load-bearing, not decoration:
* without it the inferred type names a transitive dependency by its installed
* path, so `tsc` refuses to emit a portable declaration (`TS2742`) under a
* pnpm-style layout.
*/
const PLUGIN_SETTINGS_SCHEMA = z.object(PLUGIN_SETTINGS_FIELDS).default({ ...PLUGIN_SETTINGS_DEFAULTS });
/**
* The Loader entry's own config schema, from which DSH 0.1.7 derives this
* plugin's settings form; a plugin that exports no `Config` gets no form at
* all. It sits beside the namespace schema rather than replacing it, because
* `register`/`installSection` still serve the releases that predate entry
* configs.
*
* The root is volatile because the configuration snapshot writes `profiles`
* and `autoBackup` as whole sections, and entry-config rejects a write to a
* path that is not volatile.
*/
const Config = z.object(PLUGIN_SETTINGS_FIELDS).default({ ...PLUGIN_SETTINGS_DEFAULTS }).volatile();
//#endregion
export { thresholdTokens as C, retainTokens as S, PLUGIN_ENTRY_ID as _, pluginSectionId as a, compactionPolicyFrom as b, settingsChangeEvents as c, DEFAULT_LEVELS as d, FORMAT_INVALID_POLICIES as f, LOG_PREFIX as g, LLM_PI_AI_NS as h, settingsModelForRuntime as i, settingsEntryId as l, FORMAT_TIMES as m, PLUGIN_SETTINGS_SCHEMA as n, readSettingsSection as o, FORMAT_MODES as p, hostCapabilities as r, readSettingsSectionUser as s, Config as t, ALL_LEVELS as u, PLUGIN_NS as v, isUnknownRecord as w, policyForModel as x, SNAPSHOT_KIND as y };
