import { C as thresholdTokens, S as retainTokens, a as pluginSectionId, b as compactionPolicyFrom, g as LOG_PREFIX, o as readSettingsSection, t as Config, w as isUnknownRecord, x as policyForModel } from "../src-Cwr6N05S.js";
//#region packages/compaction/src/index.ts
/**
* Host-side execution of the plugin's own context-compaction percentages.
*
* The plugin owns only the POLICY (when to compact, how much tail to keep); the
* summarization itself stays with the official backend. In the shipped Web
* profile that backend is `@deepseek-ai/dsh-compaction-basic`, mounted inside
* each agent preset's `isolate` realm, so `ctx.get('compaction')` is `undefined`
* on the host plane. The live instance is reachable only through
* `ctx.get('agentPresets').serviceFor(agent, 'compaction')` — hence every
* service here is read dynamically and `undefined` means "this deployment does
* not compose that capability", never an error.
*
* Why nothing here imports the official packages, not even for types:
*
* - `@deepseek-ai/dsh-compaction`, `dsh-token-meter`, `dsh-tools` and
*   `dsh-agent` are NOT dependencies of this plugin, so `tsc` cannot resolve
*   them while building this workspace (a type-only import still needs the
*   module to resolve). A static import would break `pnpm run build`.
* - The installed profile CAN resolve them at runtime, but a build-time import
*   of a package that is not in `dependencies` is a packaging bug regardless of
*   whether it happens to resolve on one machine.
*
* So the shapes crossing this seam are declared locally, minimally, and validated
* with `isUnknownRecord` before any member is read. `toolPairingBalancedBefore`
* is likewise re-implemented here (see {@link balanceCuts}) instead of imported.
*
* A model-facing `compact_context` tool is deliberately NOT part of this
* release. `defineTool` lives in `@deepseek-ai/dsh-tools`, which is not a
* dependency, so the tool would have to hand-write the raw `ToolDefinition`
* shape `tools.register()` validates (`name`, `parameters`, mandatory
* `output { schema, render }`, `execute`) — surface area with no way to verify
* it against the real validator from this workspace. `compactRegion` itself
* would work from a tool (a tool runs inside a step, so a turn is open, exactly
* as in the pre-step path), so a later release can add the tool here without
* changing {@link compactSessionRegion}.
*/
/** Cordis service names read through `ctx.get()`. */
const AGENT_PRESETS_SERVICE = "agentPresets";
const COMPACTION_SERVICE = "compaction";
const TOKEN_METER_SERVICE = "tokenMeter";
const LLM_SERVICE = "llm";
function log(...args) {
	console.log(LOG_PREFIX, ...args);
}
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
/** A non-empty string, or `undefined` so an empty route half cannot win a fallback. */
function nonEmptyString(value) {
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
/**
* The pre-step payload's cancellation signal.
*
* The payload is untrusted by contract, so the signal is identified structurally:
* `aborted` is the one member every `AbortSignal` exposes and no ordinary
* payload value does.
*/
function signalOf(value) {
	if (!isUnknownRecord(value)) return void 0;
	const candidate = value.signal;
	return typeof candidate?.aborted === "boolean" ? candidate : void 0;
}
/**
* The plugin's own compaction policy, read from the section that stores it.
*
* A missing section or a legacy host without `describe()` resolves to the schema
* defaults. The pass has no on/off switch of its own: the percentages ARE the
* configuration, and leaving them at their defaults is what keeps the plugin
* from firing early — the shipped 60% sits below the official backend's
* threshold, so an unconfigured install compacts first, and a user who wants a
* later trigger raises the number.
*/
function policyOf(ctx) {
	const section = readSettingsSection(ctx.settings, pluginSectionId());
	return compactionPolicyFrom(isUnknownRecord(section) ? section.compaction : void 0);
}
/** The token meter, when this deployment composes one on the host plane. */
function meterOf(ctx) {
	const meter = ctx.get?.(TOKEN_METER_SERVICE);
	if (!isUnknownRecord(meter) || typeof meter.measure !== "function") return void 0;
	return meter;
}
/** The LLM seam used to price the routed model's window. */
function llmOf(ctx) {
	const llm = ctx.get?.(LLM_SERVICE);
	if (!isUnknownRecord(llm) || typeof llm.resolveModelInfo !== "function") return void 0;
	return llm;
}
/**
* The compaction backend serving one agent.
*
* The preset registry is consulted first because the official backend lives in
* the agent's isolated preset realm; `ctx.get('compaction')` is only the
* fallback for a deployment that mounts one backend on the host plane. A
* registry that answers nothing for this agent — no preset binding, or a bound
* preset that does not mount a compaction row — falls through to that fallback
* rather than failing the turn.
*/
function backendOf(ctx, agent) {
	const presets = ctx.get?.(AGENT_PRESETS_SERVICE);
	if (isUnknownRecord(presets) && typeof presets.serviceFor === "function") try {
		const scoped = Reflect.apply(presets.serviceFor, presets, [agent, COMPACTION_SERVICE]);
		if (isUnknownRecord(scoped) && typeof scoped.compactRegion === "function") return scoped;
	} catch {}
	const host = ctx.get?.(COMPACTION_SERVICE);
	if (isUnknownRecord(host) && typeof host.compactRegion === "function") return host;
}
/** The `config` of the session's latest routed request, when one was logged. */
function requestConfigOf(session) {
	const requestHeader = session.requestHeader;
	if (typeof requestHeader !== "function") return void 0;
	const header = Reflect.apply(requestHeader, session, []);
	if (!isUnknownRecord(header)) return void 0;
	return isUnknownRecord(header.config) ? header.config : void 0;
}
/**
* The route the policy is priced against.
*
* The logged request header wins because it is what the provider actually
* charges; `agent.options` only supplies the fallback for a session that has not
* made its first request yet. Empty strings count as absent, matching the
* official backend's "unrouted" spelling.
*/
function routeOf(session, options) {
	const config = requestConfigOf(session);
	const optionRecord = isUnknownRecord(options) ? options : void 0;
	const provider = nonEmptyString(config?.provider) ?? nonEmptyString(optionRecord?.provider);
	const model = nonEmptyString(config?.model) ?? nonEmptyString(optionRecord?.model);
	return provider === void 0 || model === void 0 ? void 0 : {
		provider,
		model
	};
}
/** The routed adapter's declared combined capacity, or `undefined` when it declares none. */
async function contextWindowOf(llm, route, signal) {
	const info = await llm.resolveModelInfo(route.provider, route.model, signal);
	if (!isUnknownRecord(info) || !isUnknownRecord(info.context)) return void 0;
	const contextWindow = info.context.contextWindow;
	return typeof contextWindow === "number" && Number.isInteger(contextWindow) && contextWindow > 0 ? contextWindow : void 0;
}
/** One measurement, narrowed to the shape {@link selectCompactableRange} relies on. */
function measurementOf(meter, session) {
	const measured = meter.measure(session);
	if (!isUnknownRecord(measured) || !Array.isArray(measured.nodes)) return void 0;
	const nodes = [];
	for (const node of measured.nodes) {
		if (!isUnknownRecord(node) || typeof node.tokens !== "number") return void 0;
		nodes.push({
			seq: node.seq,
			tokens: node.tokens
		});
	}
	return {
		totalTokens: typeof measured.totalTokens === "number" ? measured.totalTokens : 0,
		nodes
	};
}
/**
* Price one agent's next compaction from the policy, or `undefined` when this
* deployment cannot answer every question the pass needs (no backend, no meter,
* no LLM seam, no declared window, unrouted session).
*/
async function targetOf(ctx, agent, signal, policy) {
	const session = isUnknownRecord(agent.session) ? agent.session : void 0;
	if (session === void 0) return void 0;
	const backend = backendOf(ctx, agent);
	if (backend === void 0) return void 0;
	const meter = meterOf(ctx);
	if (meter === void 0) return void 0;
	const route = routeOf(session, agent.options);
	if (route === void 0) return void 0;
	const llm = llmOf(ctx);
	if (llm === void 0) return void 0;
	const contextWindow = await contextWindowOf(llm, route, signal);
	if (contextWindow === void 0) return void 0;
	const ratios = policyForModel(policy, route.provider, route.model);
	return {
		session,
		backend,
		meter,
		threshold: thresholdTokens(contextWindow, ratios.thresholdRatio),
		retainBudget: retainTokens(contextWindow, ratios.retainRatio)
	};
}
/** The `system/message` event holding surface node 0, when the surface starts with one. */
function hasSystemHead(session, seq) {
	const eventAt = session.eventAt;
	if (typeof eventAt !== "function") return false;
	const head = Reflect.apply(eventAt, session, [seq]);
	return isUnknownRecord(head) && head.type === "system/message";
}
/** How one surface event moves the in-progress tool-call count. */
function toolCallDelta(event) {
	if (!isUnknownRecord(event)) return 0;
	if (event.type === "tool/result") return -1;
	if (event.type !== "assistant/message" || !isUnknownRecord(event.data)) return 0;
	const message = event.data.message;
	if (!isUnknownRecord(message) || !Array.isArray(message.content)) return 0;
	let calls = 0;
	for (const block of message.content) if (isUnknownRecord(block) && block.type === "tool-call") calls += 1;
	return calls;
}
/**
* Tool-pairing balance of every cut in the current surface.
*
* Entry `i` is the cut immediately BEFORE surface node `i`, and the last entry is
* the cut after the tail. This mirrors `toolPairingBalancedBefore` from
* `@deepseek-ai/dsh-compaction`, which this module cannot import (see the file
* header). It is computed once per selection rather than cached per session: the
* module makes exactly one call per turn, so a cache would add invalidation state
* (surface replacements change every position) without saving measurable work.
*
* A negative in-progress count means a `tool/result` had no preceding call, i.e.
* the surface is corrupt; the caller treats that as a failed selection instead of
* cutting an unsafe range.
*
* @param session - session supplying the log behind the current surface.
* @param seqs - surface node seqs in positional order.
* @returns one balance flag per cut, length `seqs.length + 1`.
*/
function balanceCuts(session, seqs) {
	const eventAt = session.eventAt;
	if (typeof eventAt !== "function") throw new Error("compaction: session.eventAt is unavailable, cannot verify tool-pairing balance");
	const cuts = [true];
	let inProgress = 0;
	for (const seq of seqs) {
		inProgress += toolCallDelta(Reflect.apply(eventAt, session, [seq]));
		if (inProgress < 0) throw new Error("compaction: tool/result without an open tool call; the session surface is corrupt");
		cuts.push(inProgress === 0);
	}
	return cuts;
}
/**
* Select the inclusive surface span one compaction may replace.
*
* The algorithm is `selectCompactableRange` from `dsh-compaction-basic`, copied
* rather than imported because that package's export map exposes only its root
* and this function is not re-exported. It keeps the newest surface tail whose
* price reaches `retainBudget` verbatim, then walks the cut backwards until it no
* longer splits an assistant tool call from its result. `system/message` at node 0
* is never compacted, matching the official backend.
*
* @param session - session supplying the authoritative surface and its events.
* @param measurement - priced surface from the conversation meter.
* @param retainBudget - minimum recent-tail tokens kept verbatim.
* @returns the inclusive positional seq range, or `null` when nothing is safe.
*/
function selectCompactableRange(session, measurement, retainBudget) {
	const nodes = measurement.nodes;
	if (nodes.length === 0) return null;
	const surface = session.surface;
	const seqs = isUnknownRecord(surface) && Array.isArray(surface.nodes) ? surface.nodes : void 0;
	if (seqs === void 0) return null;
	if (seqs.length !== nodes.length || nodes.some((node, index) => node.seq !== seqs[index])) throw new Error("compaction: token-meter surface does not match the current session surface");
	const firstIdx = hasSystemHead(session, seqs[0]) ? 1 : 0;
	const cuts = balanceCuts(session, seqs);
	let accumulated = 0;
	let keepFromIdx = nodes.length;
	for (let index = nodes.length - 1; index >= 0; index -= 1) {
		accumulated += nodes[index].tokens;
		keepFromIdx = index;
		if (accumulated >= retainBudget) break;
	}
	if (keepFromIdx <= firstIdx) return null;
	while (keepFromIdx > firstIdx && cuts[keepFromIdx] !== true) keepFromIdx -= 1;
	if (keepFromIdx <= firstIdx) return null;
	return {
		start: seqs[firstIdx],
		end: seqs[keepFromIdx - 1]
	};
}
/**
* {@link compactSessionRegion} over an already-taken measurement.
*
* The pressure path measures once to decide `totalTokens >= threshold` and then
* needs the same snapshot for selection; taking it again would double the only
* O(surface) cost in the pass and could in principle select against a newer
* generation than the one that triggered.
*/
async function compactMeasuredRegion(deps, agent, session, measurement, retainBudget, signal) {
	const range = selectCompactableRange(session, measurement, retainBudget);
	if (range === null) return null;
	const result = await deps.compaction.compactRegion(range.start, range.end, agent, signal);
	return isUnknownRecord(result) ? result : {};
}
/** One log line for a completed compaction, tolerant of a backend result that omits fields. */
function describeResult(result) {
	return `shadowed ${Array.isArray(result.shadowedSeqs) ? result.shadowedSeqs.length : 0} surface node(s) (~${typeof result.shadowedTokenCount === "number" ? result.shadowedTokenCount : 0} tokens)`;
}
/**
* Compact when the current surface is above the policy's threshold.
*
* Every failure here is absorbed: a compaction problem must never break the
* conversation turn it happens in, and the official backend runs its own
* pressure pass immediately after this one with a surface that is either already
* under its higher threshold or still a valid target for it.
*/
async function compactOnPressure(ctx, payload) {
	const policy = policyOf(ctx);
	if (!isUnknownRecord(payload) || !isUnknownRecord(payload.agent)) return;
	const agent = payload.agent;
	const target = await targetOf(ctx, agent, signalOf(payload), policy);
	if (target === void 0) return;
	const measurement = measurementOf(target.meter, target.session);
	if (measurement === void 0) return;
	if (measurement.totalTokens < target.threshold) return;
	const result = await compactMeasuredRegion({
		meter: target.meter,
		compaction: target.backend
	}, agent, target.session, measurement, target.retainBudget, signalOf(payload));
	if (result === null) {
		log("compaction policy: above threshold but no safe range to compact");
		return;
	}
	log(`compaction policy: ${describeResult(result)}`);
}
/**
* The `agent/pre-step` waterfall listener.
*
* The decision is always forwarded to `next()`, whether or not this pass did any
* work, so a later listener (including the official backend's) still runs.
*/
async function handlePreStep(ctx, payload, next) {
	try {
		await compactOnPressure(ctx, payload);
	} catch (error) {
		log("compaction policy error:", messageOf(error));
	}
	return typeof next === "function" ? Reflect.apply(next, void 0, []) : void 0;
}
/**
* Install the plugin's own pressure-based compaction policy.
*
* The listener is a plain host-plane `agent/pre-step` handler: an unscoped
* listener receives every agent's pre-step (scope filtering only admits a tag-less
* listener), so no per-agent installation is needed. `global: true` matches the
* plugin's other host listeners and keeps it independent of the calling fiber's
* scope.
*/
function installCompactionPolicy(ctx) {
	ctx.effect(() => {
		const disposer = ctx.on("agent/pre-step", (...args) => handlePreStep(ctx, args[0], args[1]), { global: true });
		return typeof disposer === "function" ? disposer : void 0;
	}, `${LOG_PREFIX}: compaction policy`);
}
//#endregion
//#region lib/types/src/entries/compaction.js
/** The compaction-policy entry: the plugin's own threshold-based compaction. */
const name = "spig-dsh-thinking-provider/compaction";
const inject = [
	"settings",
	"llm",
	"timer"
];
function apply(ctx) {
	installCompactionPolicy(ctx);
}
//#endregion
export { Config, apply, inject, name };
