import { _ as PLUGIN_ENTRY_ID, a as pluginSectionId, g as LOG_PREFIX, h as LLM_PI_AI_NS, o as readSettingsSection, s as readSettingsSectionUser, t as Config, u as ALL_LEVELS, w as isUnknownRecord } from "../src-Cwr6N05S.js";
import { n as OPENCODE_SESSION_NAMESPACE } from "../opencode-session-KAA2P7O4.js";
import { t as isAgentRequestConfig } from "../types-B5KklnpI.js";
//#region packages/kit/src/compat/model-source.ts
function isPlainObject(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
function hasModelSourceConflict(profile) {
	if (!isPlainObject(profile) || !Array.isArray(profile.models) || profile.models.length === 0) return false;
	const overrides = profile.modelOverrides;
	return isPlainObject(overrides) && Object.getOwnPropertyNames(overrides).length > 0;
}
//#endregion
//#region packages/subagent/src/index.ts
/** The `llm-pi-ai` section id, the alias `levels` exports for it. */
const SETTINGS_NAMESPACE = LLM_PI_AI_NS;
const STANDARD_LEVELS = ALL_LEVELS;
function log(...args) {
	console.log(LOG_PREFIX, ...args);
}
/**
* The effort one section's user layer declares, or `undefined` when that
* section does not override it. Only the user layer can express "unset": the
* resolved value always carries the schema's empty-string default.
*/
function effortFromUserLayer(settings, namespace) {
	const user = readSettingsSectionUser(settings, namespace);
	if (!isUnknownRecord(user)) return void 0;
	return typeof user.subagentEffort === "string" && user.subagentEffort.length > 0 ? user.subagentEffort : void 0;
}
/**
* Read the configured subagent effort from the section that stores it.
*
* The plugin's own section comes first, because that is where the 0.1.7
* entry-config model lets the plugin own the field. A miss there is not an
* error: the releases up to 0.1.6 wrote the value into the `llm-pi-ai` section,
* so that location stays readable and existing settings keep working. A value
* present in both places resolves to the plugin's own section.
*
* `ownSectionId` is the id the plugin's section carries on the running host:
* the Loader entry id under `entry-config`, the registered namespace under
* `namespace`. Callers holding a live context resolve it with
* `settingsEntryId`; the compile-time default answers for the rest.
*
* The logger sits in the signature because callers pass it positionally beside
* that id; this read has nothing to log, since a missing or unreadable section
* is `undefined` rather than an error.
*/
function readSubagentEffort(settings, _logger = log, ownSectionId = PLUGIN_ENTRY_ID) {
	if (settings === void 0) return void 0;
	const own = effortFromUserLayer(settings, ownSectionId);
	if (own !== void 0) return own;
	return effortFromUserLayer(settings, SETTINGS_NAMESPACE);
}
/**
* One namespace's user layer read as a route, or `undefined` when it names no
* complete route. Both halves are required: a provider without a model names no
* route, and the panel clears both when the user picks "inherit", so a partial
* pair is stale data rather than a choice.
*/
function routeFromUserLayer(settings, namespace) {
	const user = readSettingsSectionUser(settings, namespace);
	if (!isUnknownRecord(user)) return void 0;
	const route = user.subagentModel;
	if (!isUnknownRecord(route)) return void 0;
	const provider = route.provider;
	const model = route.model;
	if (typeof provider !== "string" || provider.length === 0) return void 0;
	if (typeof model !== "string" || model.length === 0) return void 0;
	return {
		provider,
		model
	};
}
/**
* Read the configured subagent default route.
*
* Only the user layer can express "unset": the resolved section always carries
* the schema's empty-string defaults, which would otherwise pin a route the
* user never chose and silently stop inheritance.
*
* The plugin's own section is read first, under both settings models. Under
* `entry-config` that section is addressed by the Loader entry id, which
* `settingsEntryId` supplies; under `namespace` it is addressed by the
* namespace the plugin registers. `llm-pi-ai` is deliberately NOT a fallback:
* the releases up to 0.1.6 wrote `subagentEffort` there, but `subagentModel`
* never existed then, so nothing can be stored for it at that location.
*/
function readSubagentModel(settings, ownSectionId = PLUGIN_ENTRY_ID) {
	if (settings === void 0) return void 0;
	const own = routeFromUserLayer(settings, ownSectionId);
	if (own !== void 0) return own;
	if (ownSectionId === OPENCODE_SESSION_NAMESPACE) return void 0;
	return routeFromUserLayer(settings, OPENCODE_SESSION_NAMESPACE);
}
function findModel(settings, config) {
	const section = readSettingsSection(settings, SETTINGS_NAMESPACE);
	if (!isUnknownRecord(section) || !isUnknownRecord(section.providers)) return void 0;
	if (typeof config.provider !== "string" || typeof config.model !== "string") return void 0;
	if (!Object.prototype.hasOwnProperty.call(section.providers, config.provider)) return void 0;
	const profile = section.providers[config.provider];
	if (!isUnknownRecord(profile)) return void 0;
	if (hasModelSourceConflict(profile)) return void 0;
	if (Array.isArray(profile.models)) {
		const model = profile.models.find((entry) => isUnknownRecord(entry) && entry.id === config.model);
		if (model !== void 0) return model;
	}
	if (isUnknownRecord(profile.modelOverrides) && Object.prototype.hasOwnProperty.call(profile.modelOverrides, config.model)) return profile.modelOverrides[config.model];
}
function resolveSubagentEffort(settings, config, logger = log, ownSectionId = PLUGIN_ENTRY_ID) {
	const subagentEffort = readSubagentEffort(settings, logger, ownSectionId);
	if (subagentEffort === void 0) return void 0;
	if (STANDARD_LEVELS.includes(subagentEffort)) return subagentEffort;
	if (settings === void 0 || !isAgentRequestConfig(config)) return void 0;
	try {
		const model = findModel(settings, config);
		if (!isUnknownRecord(model) || !isUnknownRecord(model.reasoningEfforts)) return void 0;
		for (const [level, wire] of Object.entries(model.reasoningEfforts)) if (typeof wire === "string" && wire === subagentEffort) return level;
		logger("subagent custom effort is not mapped for", `${String(config.provider)}/${String(config.model)}`);
	} catch (error) {
		logger("resolve subagent effort error:", error instanceof Error ? error.message : String(error));
	}
}
function subagentAgentOf(payload) {
	if (!isUnknownRecord(payload) || !isUnknownRecord(payload.agent)) return void 0;
	const agent = payload.agent;
	const session = agent.session;
	if (!isUnknownRecord(session) || !isUnknownRecord(session.header)) return void 0;
	return session.header.origin === "subagent" ? agent : void 0;
}
function hasAgentModelSelection(agent) {
	const model = agent?.model;
	return isUnknownRecord(model) && typeof model.current === "function" && typeof model.select === "function";
}
/**
* Record the agents already told that their configured route was not applied.
*
* `agent/request` fires once per step, so an unguarded log would repeat for the
* whole life of a child on an older host. A WeakSet keys that "already logged"
* fact on the agent itself, so it neither outlives the agent nor leaks.
*/
const unappliedRouteWarned = /* @__PURE__ */ new WeakSet();
/**
* Select the configured default route, if any, before the child's first step.
*
* This must run before the effort selection: the effort is resolved against
* the model actually in use, and a custom wire value is only meaningful for the
* provider/model pair that declares it. Selecting the route first makes the
* subsequent `current()` read report the new route.
*
* No `reasoningEffort` is passed on purpose. Choosing a default model is not a
* choice of thinking effort: the model's own default applies unless the user
* configured a separate subagent effort, which the caller applies afterwards.
*/
function applySubagentRoute(ctx, model) {
	const select = model.select;
	if (typeof select !== "function") return;
	const route = readSubagentModel(ctx.settings, pluginSectionId());
	if (route === void 0) return;
	Reflect.apply(select, model, [{
		provider: route.provider,
		model: route.model
	}]);
}
/** Select the configured effort against the model selection now in force. */
function applySubagentEffort(ctx, model) {
	const current = model.current;
	const select = model.select;
	if (typeof current !== "function" || typeof select !== "function") return;
	const selection = Reflect.apply(current, model, []);
	if (!isAgentRequestConfig(selection) || typeof selection.provider !== "string" || typeof selection.model !== "string") return;
	const effort = resolveSubagentEffort(ctx.settings, selection, log, pluginSectionId());
	if (effort === void 0 || effort === selection.reasoningEffort) return;
	Reflect.apply(select, model, [{
		provider: selection.provider,
		model: selection.model,
		reasoningEffort: effort
	}]);
}
/** Select a new-host subagent's configured route and effort before its first model step. */
function handleAgentCreated(ctx, payload) {
	const agent = subagentAgentOf(payload);
	if (agent === void 0) return;
	const model = isUnknownRecord(agent.model) ? agent.model : void 0;
	if (model === void 0) return;
	try {
		applySubagentRoute(ctx, model);
		applySubagentEffort(ctx, model);
	} catch (error) {
		log("subagent model selection error:", error instanceof Error ? error.message : String(error));
	}
}
/**
* Report, once per agent, that a configured default route never reached the
* request.
*
* `agent/request` cannot fix this: the agent loop rejects a waterfall result
* whose provider/model differ from the selection fixed during step preparation,
* and directs callers to `agent.model.select()` before that point instead. All
* this hook may do is name the misconfiguration; silently ignoring it would
* leave the user believing the panel setting works.
*/
function noteUnappliedRoute(ctx, agent, config) {
	if (unappliedRouteWarned.has(agent)) return;
	const route = readSubagentModel(ctx.settings, pluginSectionId());
	if (route === void 0) return;
	if (config.provider === route.provider && config.model === route.model) return;
	unappliedRouteWarned.add(agent);
	log("configured subagent model was not applied:", `${route.provider}/${route.model}`, "request uses", `${String(config.provider)}/${String(config.model)}`);
}
async function handleAgentRequest(ctx, payload, next) {
	const config = await next();
	try {
		const agent = subagentAgentOf(payload);
		if (agent === void 0 || !isAgentRequestConfig(config)) return config;
		noteUnappliedRoute(ctx, agent, config);
		if (hasAgentModelSelection(agent)) return config;
		const effort = resolveSubagentEffort(ctx.settings, config, log, pluginSectionId());
		return effort === void 0 ? config : {
			...config,
			reasoningEffort: effort
		};
	} catch (error) {
		log("agent/request override error:", error instanceof Error ? error.message : String(error));
		return config;
	}
}
//#endregion
//#region lib/types/src/entries/subagent.js
/** The subagent entry: default thinking effort and default model route. */
const name = "spig-dsh-thinking-provider/subagent";
const inject = ["settings", "llm"];
function apply(ctx) {
	ctx.on("agent/created", (...args) => {
		handleAgentCreated(ctx, args[0]);
	}, { global: true });
	ctx.on("agent/request", (...args) => {
		const next = args[1];
		return handleAgentRequest(ctx, args[0], next);
	}, { global: true });
}
//#endregion
export { Config, apply, inject, name };
