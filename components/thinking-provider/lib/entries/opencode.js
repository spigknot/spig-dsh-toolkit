import { a as pluginSectionId, c as settingsChangeEvents, f as FORMAT_INVALID_POLICIES, g as LOG_PREFIX, i as settingsModelForRuntime, l as settingsEntryId, m as FORMAT_TIMES, n as PLUGIN_SETTINGS_SCHEMA, o as readSettingsSection, p as FORMAT_MODES, t as Config, w as isUnknownRecord } from "../src-Cwr6N05S.js";
import { n as OPENCODE_SESSION_NAMESPACE, r as isOpenCodeSessionEnabled, t as OPENCODE_SESSION_HEADER } from "../opencode-session-KAA2P7O4.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
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
function evaluateNode(node, scope, funcs) {
	switch (node.kind) {
		case "literal": return node.value;
		case "ref": {
			const lookup = scope;
			if (!Object.prototype.hasOwnProperty.call(lookup, node.name)) throw new Error(`unknown identifier '${node.name}'`);
			return lookup[node.name];
		}
		case "call": {
			if (!Object.prototype.hasOwnProperty.call(funcs, node.name)) throw new Error(`unknown function '${node.name}'`);
			const fn = funcs[node.name];
			return fn(...node.args.map((arg) => evaluateNode(arg, scope, funcs)));
		}
		case "binary": {
			const left = evaluateNode(node.left, scope, funcs);
			const right = evaluateNode(node.right, scope, funcs);
			if (typeof left === "number" && typeof right === "number") return left + right;
			return String(left) + String(right);
		}
	}
}
//#endregion
//#region packages/opencode/src/format.ts
const SHA256_SEED = "dsh-thinking-effort/opencode-session";
const BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const DSH_SESSION_PREFIX = "session-";
const CACHE_MAX_ENTRIES = 4096;
const SCRIPT_STAT_MIN_INTERVAL_MS = 1e3;
function record(value) {
	return isUnknownRecord(value) ? value : void 0;
}
function ownRecord$1(value, key) {
	const object = record(value);
	if (object === void 0 || !Object.prototype.hasOwnProperty.call(object, key)) return void 0;
	return record(object[key]);
}
function stringValue(value, key) {
	const object = record(value);
	if (object === void 0 || !Object.prototype.hasOwnProperty.call(object, key)) return void 0;
	const entry = object[key];
	return typeof entry === "string" ? entry : void 0;
}
/**
* Resolve the `opencodeSession.format` config from a raw settings value
* (the whole `dsh-thinking-effort` namespace). Unknown or malformed fields
* fall back to the mode defaults documented for each field, so a hand-written
* settings document never breaks header injection.
*/
function resolveFormatConfig(settings) {
	const raw = ownRecord$1(ownRecord$1(settings, "opencodeSession"), "format");
	const mode = FORMAT_MODES.includes(stringValue(raw, "mode")) ? stringValue(raw, "mode") : "ses-derive";
	const time = FORMAT_TIMES.includes(stringValue(raw, "time")) ? stringValue(raw, "time") : "firstUse";
	const onInvalid = FORMAT_INVALID_POLICIES.includes(stringValue(raw, "onInvalid")) ? stringValue(raw, "onInvalid") : "warn";
	const template = stringValue(raw, "template") ?? "";
	const expression = stringValue(raw, "expression") ?? "";
	const script = stringValue(raw, "script") ?? "";
	const validateSource = stringValue(raw, "validate") ?? "";
	let validate;
	if (validateSource.length > 0) try {
		validate = new RegExp(validateSource);
	} catch {
		validate = void 0;
	}
	return {
		mode,
		time,
		template,
		expression,
		script,
		validateSource,
		validate,
		onInvalid
	};
}
function configFingerprint(config) {
	return JSON.stringify([
		config.mode,
		config.time,
		config.template,
		config.expression,
		config.script,
		config.validateSource,
		config.onInvalid
	]);
}
/**
* Strip the `session-` prefix, hyphens and case so the same DSH session always
* derives the same id. Note this intentionally also folds ids that only differ
* in internal hyphen placement (`session-ab-cd` vs `session-a-bcd`); harmless
* for the UUID-shaped ids DSH actually produces.
*/
function normalizeSessionId(raw) {
	let value = raw.trim();
	if (value.startsWith(DSH_SESSION_PREFIX)) value = value.slice(8);
	value = value.replaceAll("-", "").toLowerCase();
	return value.length > 0 ? value : raw.trim();
}
function sha256Hex(input) {
	return createHash("sha256").update(input).digest("hex");
}
/** 48-bit millisecond timestamp as exactly 12 lowercase hex characters. */
function hexTime12(ms) {
	return (BigInt(Math.max(0, Math.floor(ms))) & 281474976710655n).toString(16).padStart(12, "0");
}
/** Deterministic 12-hex block derived from the session digest (`time: hash`). */
function hexTime12FromDigest(session) {
	return sha256Hex(`${SHA256_SEED}/${session}`).slice(0, 12);
}
/** Deterministic 14-character Base62 block: 80 bits of the session digest. */
function digestTail62(session) {
	const hex = sha256Hex(`${SHA256_SEED}/${session}`);
	return encodeBase62(BigInt(`0x${hex.slice(0, 20)}`), 14);
}
function encodeBase62(value, length) {
	let remaining = value;
	const chars = new Array(length);
	for (let index = length - 1; index >= 0; index -= 1) {
		chars[index] = BASE62_ALPHABET[Number(remaining % 62n)];
		remaining /= 62n;
	}
	return chars.join("");
}
/**
* Built on a null-prototype object so the inherited Object.prototype members
* are not even present, and the evaluator additionally checks own-property
* ownership.
*/
const EXPRESSION_FUNCS = Object.assign(Object.create(null), {
	sha256(value) {
		return sha256Hex(String(value));
	},
	slice(value, start, end) {
		return String(value).slice(Number(start), end === void 0 ? void 0 : Number(end));
	},
	lower(value) {
		return String(value).toLowerCase();
	},
	upper(value) {
		return String(value).toUpperCase();
	}
});
function evaluateExpression(source, scope, funcs) {
	return evaluateNode(new ExpressionParser(tokenize(source)).parse(), scope, funcs);
}
function renderTemplate(template, context) {
	const entries = [
		["{rawSessionId}", context.rawSessionId],
		["{sessionId}", context.sessionId],
		["{hex12}", context.hex12],
		["{tail62}", context.tail62],
		["{sha256}", context.sha256],
		["{now}", String(context.now)],
		["{provider}", context.provider],
		["{model}", context.model]
	];
	let value = template;
	for (const [placeholder, replacement] of entries) value = value.replaceAll(placeholder, replacement);
	return value;
}
/**
* Per-session generator; one instance per Host effect. The value cache is
* bounded (LRU), while `minted` timestamps are intentionally retained for the
* process lifetime so a session's value never changes once published.
*/
var OpenCodeSessionFormatter = class {
	cache = /* @__PURE__ */ new Map();
	/**
	* First-use minted hex blocks. Eviction removes only the value-cache entry,
	* never the mint: dropping it would re-mint on the next request and change
	* the header value for the same DSH session, breaking per-session stability.
	* Entries are a dozen bytes per distinct session, so retention is bounded in
	* practice and preferred over a second eviction policy.
	*/
	minted = /* @__PURE__ */ new Map();
	warned = /* @__PURE__ */ new Set();
	scripts = /* @__PURE__ */ new Map();
	now;
	log;
	constructor(deps = {}) {
		this.now = deps.now ?? (() => Date.now());
		this.log = deps.log ?? ((...args) => console.log("[spig-dsh-thinking-provider]", ...args));
	}
	/**
	* Produce the header value for one session. The result is cached per
	* normalized session id and config fingerprint, so the same DSH session
	* always yields the same value while the config is unchanged. The `script`
	* mode resolves asynchronously; all other modes are synchronous.
	*/
	format(request, config) {
		const session = normalizeSessionId(request.sessionId);
		const fingerprint = configFingerprint(config);
		const cached = this.cache.get(session);
		if (cached !== void 0 && cached.fingerprint === fingerprint) {
			this.cache.delete(session);
			this.cache.set(session, cached);
			return cached.value;
		}
		if (config.mode === "script") return this.computeScriptValue(request, session, config, fingerprint);
		return this.storeAndReturn(session, fingerprint, this.computeValue(request, session, config));
	}
	/** Forget cached values and minted timestamps. Mainly for tests. */
	reset() {
		this.cache.clear();
		this.minted.clear();
		this.scripts.clear();
	}
	computeValue(request, session, config) {
		switch (config.mode) {
			case "passthrough": return this.applyValidation(request.sessionId, config);
			case "ses-derive": return this.applyValidation(this.derive(session, config.time), config);
			case "template":
				if (config.template.length === 0) {
					this.warnOnce("template mode requires a non-empty template; using ses-derive for this session");
					return this.applyValidation(this.derive(session, config.time), config);
				}
				return this.applyValidation(renderTemplate(config.template, this.context(request, session, config.time)), config);
			case "expression": {
				if (config.expression.length === 0) {
					this.warnOnce("expression mode requires a non-empty expression; using ses-derive for this session");
					return this.applyValidation(this.derive(session, config.time), config);
				}
				let value;
				try {
					value = String(evaluateExpression(config.expression, this.context(request, session, config.time), EXPRESSION_FUNCS));
				} catch (error) {
					this.warnOnce(`expression error (${config.expression}); using ses-derive for this session: ${error instanceof Error ? error.message : String(error)}`);
					value = this.derive(session, config.time);
				}
				return this.applyValidation(value, config);
			}
			case "script": return;
		}
	}
	async computeScriptValue(request, session, config, fingerprint) {
		let value;
		if (config.script.length === 0) {
			this.warnOnce("script mode requires a non-empty script path; using ses-derive for this session");
			value = this.derive(session, config.time);
		} else {
			const module = await this.loadScript(config.script);
			if (module === void 0) {
				this.warnOnce(`script failed to load (${config.script}); using ses-derive for this session`);
				value = this.derive(session, config.time);
			} else try {
				const result = module.format(this.context(request, session, config.time));
				value = typeof result === "string" ? result : String(result);
			} catch (error) {
				this.warnOnce(`script format error (${config.script}); using ses-derive: ${error instanceof Error ? error.message : String(error)}`);
				value = this.derive(session, config.time);
			}
		}
		return this.storeAndReturn(session, fingerprint, this.applyValidation(value, config));
	}
	derive(session, time) {
		return `ses_${this.contextHex12(session, time)}${digestTail62(session)}`;
	}
	context(request, session, time) {
		return {
			provider: request.provider,
			model: request.model,
			rawSessionId: request.sessionId,
			sessionId: session,
			now: this.now(),
			hex12: this.contextHex12(session, time),
			tail62: digestTail62(session),
			sha256: sha256Hex(`${SHA256_SEED}/${session}`)
		};
	}
	contextHex12(session, time) {
		return time === "hash" ? hexTime12FromDigest(session) : this.mintHex12(session);
	}
	mintHex12(session) {
		let hex = this.minted.get(session);
		if (hex === void 0) {
			hex = hexTime12(this.now());
			this.minted.set(session, hex);
		}
		return hex;
	}
	applyValidation(value, config) {
		if (config.validate === void 0 || config.validate.test(value)) return value;
		if (config.onInvalid === "drop") {
			this.warnOnce(`x-opencode-session value failed validation and was dropped: ${value}`);
			return;
		}
		if (config.onInvalid === "send") return value;
		this.warnOnce(`x-opencode-session value failed validation but is still sent: ${value}`);
		return value;
	}
	storeAndReturn(session, fingerprint, value) {
		this.cache.delete(session);
		if (this.cache.size >= CACHE_MAX_ENTRIES) {
			const oldest = this.cache.keys().next().value;
			if (oldest !== void 0) this.cache.delete(oldest);
		}
		this.cache.set(session, {
			fingerprint,
			value
		});
		return value;
	}
	warnOnce(message) {
		if (this.warned.has(message)) return;
		this.warned.add(message);
		this.log(message);
	}
	async loadScript(path) {
		const now = this.now();
		let slot = this.scripts.get(path);
		if (slot !== void 0 && now - slot.stamp < SCRIPT_STAT_MIN_INTERVAL_MS) return slot.module;
		if (slot === void 0) {
			slot = {
				mtimeMs: -1,
				stamp: now,
				module: void 0,
				loading: void 0
			};
			this.scripts.set(path, slot);
		}
		if (slot.loading !== void 0) {
			const result = await slot.loading;
			slot.stamp = now;
			return result;
		}
		const info = await stat(path).catch((error) => {
			this.warnOnce(`script stat failed (${path}): ${error instanceof Error ? error.message : String(error)}`);
		});
		if (info === void 0) return slot.module;
		if (slot.module !== void 0 && info.mtimeMs === slot.mtimeMs) {
			slot.stamp = now;
			return slot.module;
		}
		const loading = this.importScript(path, info.mtimeMs).then((module) => {
			slot.mtimeMs = info.mtimeMs;
			slot.module = module;
			slot.loading = void 0;
			slot.stamp = now;
			return module;
		}, (error) => {
			this.warnOnce(`script load failed (${path}): ${error instanceof Error ? error.message : String(error)}`);
			slot.loading = void 0;
			return slot.module;
		});
		slot.loading = loading;
		return loading;
	}
	async importScript(path, mtimeMs) {
		const module = await import(`${pathToFileURL(path).href}?mtime=${mtimeMs}`);
		const format = module.format ?? module.default;
		if (typeof format !== "function") throw new Error("script must export a function named format (or a default function)");
		return { format: (context) => format(context) };
	}
};
//#endregion
//#region packages/opencode/src/session.ts
function isRecord(value) {
	return isUnknownRecord(value);
}
function ownRecord(value, key) {
	const object = isRecord(value) ? value : void 0;
	if (object === void 0 || !Object.prototype.hasOwnProperty.call(object, key)) return void 0;
	return isRecord(object[key]) ? object[key] : void 0;
}
function nonEmptyString(value) {
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
/**
* Resolve the `user-agent` override for one `provider/model` request. The
* master `value` under `opencodeSession.userAgent` is the enable switch:
* when it is empty the override is fully off. A route matches when its
* `enabled` flag is true (all models) or the exact model is toggled on; the
* route's own `value` wins over the master value when both exist.
*/
function resolveUserAgentValue(settings, provider, model) {
	if (provider.length === 0 || model.length === 0) return void 0;
	const userAgent = ownRecord(ownRecord(settings, "opencodeSession"), "userAgent");
	const masterValue = nonEmptyString(userAgent?.value);
	if (masterValue === void 0) return void 0;
	const providerEntry = ownRecord(ownRecord(userAgent, "providers"), provider);
	if (providerEntry === void 0) return void 0;
	const routeEnabled = providerEntry.enabled === true;
	const models = ownRecord(providerEntry, "models");
	const modelEnabled = models !== void 0 && models[model] === true;
	if (!routeEnabled && !modelEnabled) return void 0;
	return nonEmptyString(providerEntry.value) ?? masterValue;
}
function requestContext(options, settings) {
	if (!isRecord(options)) return void 0;
	const provider = nonEmptyString(options.provider);
	const model = nonEmptyString(options.model);
	const sessionId = nonEmptyString(options.sessionId);
	if (provider === void 0 || model === void 0) return void 0;
	const sessionEnabled = isOpenCodeSessionEnabled(settings, provider, model);
	const userAgentValue = resolveUserAgentValue(settings, provider, model);
	if (!sessionEnabled && userAgentValue === void 0) return void 0;
	return {
		provider,
		model,
		sessionId,
		sessionEnabled,
		userAgentValue,
		active: true
	};
}
function wrapStream(source, storage, request) {
	return { [Symbol.asyncIterator]() {
		const iterator = source[Symbol.asyncIterator]();
		const iteratorRequest = {
			...request,
			active: true
		};
		const deactivate = () => {
			iteratorRequest.active = false;
		};
		const run = (operation) => storage.run(iteratorRequest, operation);
		return {
			next(value) {
				return run(async () => {
					try {
						const result = await iterator.next(value);
						if (result.done) deactivate();
						return result;
					} catch (error) {
						deactivate();
						throw error;
					}
				});
			},
			return(value) {
				if (iterator.return === void 0) {
					deactivate();
					return Promise.resolve({
						done: true,
						value
					});
				}
				return run(async () => {
					try {
						const result = await iterator.return(value);
						deactivate();
						return result;
					} catch (error) {
						deactivate();
						throw error;
					}
				});
			},
			throw(error) {
				if (iterator.throw === void 0) {
					deactivate();
					return Promise.reject(error);
				}
				return run(async () => {
					try {
						const result = await iterator.throw(error);
						if (result.done) deactivate();
						return result;
					} catch (caught) {
						deactivate();
						throw caught;
					}
				});
			},
			[Symbol.asyncIterator]() {
				return this;
			}
		};
	} };
}
function headersForFetch(input, init) {
	const inputHeaders = typeof Request !== "undefined" && input instanceof Request ? input.headers : void 0;
	const headers = new Headers(inputHeaders);
	if (init?.headers !== void 0) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
	return headers;
}
async function fetchWithSession(formatter, storage, settingsSnapshot, originalFetch, input, init) {
	const request = storage.getStore();
	if (request === void 0 || request.active !== true) return originalFetch(input, init);
	const headers = headersForFetch(input, init);
	if (request.userAgentValue !== void 0) headers.set("user-agent", request.userAgentValue);
	const sessionId = request.sessionId;
	if (sessionId !== void 0 && request.sessionEnabled && !headers.has("x-opencode-session")) {
		let value;
		try {
			value = await formatter.format({
				provider: request.provider,
				model: request.model,
				sessionId
			}, resolveFormatConfig(settingsSnapshot));
		} catch (error) {
			console.warn(LOG_PREFIX, "session format error:", error instanceof Error ? error.message : String(error));
			value = request.sessionId;
		}
		if (value !== void 0) headers.set(OPENCODE_SESSION_HEADER, value);
	}
	return originalFetch(input, {
		...init,
		headers: new Headers(headers)
	});
}
/**
* Install the section under the `entry-config` model, where the plugin owns no
* registered namespace: its value is the `Config` of its own Loader entry, read
* back through `describe()` and addressed by the entry id.
*/
function installEntryConfigSettingsSection(ctx, fallbackNamespace, hooks) {
	const settings = ctx.settings;
	const entryId = settingsModelForRuntime({ settings }) === "entry-config" ? pluginSectionId() : settingsEntryId(ctx, fallbackNamespace);
	hooks.setSource(() => readSettingsSection(settings, entryId) ?? {});
	hooks.onChange();
	ctx.effect(() => () => {
		hooks.setSource(() => ({}));
		hooks.onChange();
	}, `${LOG_PREFIX}: OpenCode session settings`);
	for (const event of settingsChangeEvents("entry-config")) {
		const disposer = ctx.on(event, (...args) => {
			if (args[0] === entryId) hooks.onChange();
		});
		if (typeof disposer === "function") ctx.effect(() => () => {
			disposer();
		}, `${LOG_PREFIX}: OpenCode session watcher`);
	}
}
function installLegacySettingsSection(ctx, namespace, hooks) {
	if (typeof ctx.inject !== "function") {
		installEntryConfigSettingsSection(ctx, namespace, hooks);
		return;
	}
	ctx.inject(["settings"], (settingsContext) => {
		const register = settingsContext.settings.register;
		if (typeof register !== "function") return;
		const scope = register.call(settingsContext.settings, namespace, PLUGIN_SETTINGS_SCHEMA, { base: {} });
		hooks.setSource(() => scope.get());
		settingsContext.effect(() => () => {
			hooks.setSource(() => ({}));
			hooks.onChange();
		}, `${LOG_PREFIX}: legacy OpenCode session settings`);
		hooks.onChange();
		const unwatch = scope.watch(() => {
			hooks.onChange();
		});
		ctx.effect(() => () => {
			unwatch();
		}, `${LOG_PREFIX}: legacy OpenCode session watcher`);
	});
}
/**
* Install the session settings section on whichever settings architecture the
* runtime exposes. The 0.1.7 line took `register`/`installSection` away, so a
* missing registration API selects the entry-config path instead of failing
* the plugin entry.
*/
function installSettingsSectionCompat(ctx, hooks) {
	const settings = ctx.settings;
	const installSection = settings?.installSection;
	if (typeof installSection === "function") {
		installSection.call(settings, ctx, OPENCODE_SESSION_NAMESPACE, PLUGIN_SETTINGS_SCHEMA, {}, hooks);
		return;
	}
	if (typeof settings?.register === "function") {
		installLegacySettingsSection(ctx, OPENCODE_SESSION_NAMESPACE, hooks);
		return;
	}
	installEntryConfigSettingsSection(ctx, OPENCODE_SESSION_NAMESPACE, hooks);
}
/** Install the optional OpenCode session namespace and request Header bridge. */
function installOpenCodeSession(ctx) {
	let settingsSource = () => ({});
	let settingsSnapshot = {};
	installSettingsSectionCompat(ctx, {
		setSource(source) {
			settingsSource = source;
		},
		onChange() {
			settingsSnapshot = settingsSource();
		}
	});
	ctx.effect(() => {
		const storage = new AsyncLocalStorage();
		const formatter = new OpenCodeSessionFormatter();
		const listenerDisposer = ctx.on("llm/stream", (...args) => {
			const next = args[1];
			if (typeof next !== "function") return void 0;
			const source = next;
			const request = requestContext(args[0], settingsSnapshot);
			const stream = source();
			return request === void 0 ? stream : wrapStream(stream, storage, request);
		});
		const originalFetch = globalThis.fetch;
		if (typeof originalFetch !== "function") {
			console.warn(LOG_PREFIX, "global fetch unavailable; OpenCode session Header disabled");
			return () => {
				if (typeof listenerDisposer === "function") listenerDisposer();
				storage.disable();
			};
		}
		const patchedFetch = (input, init) => fetchWithSession(formatter, storage, settingsSnapshot, originalFetch, input, init);
		globalThis.fetch = patchedFetch;
		return () => {
			if (typeof listenerDisposer === "function") listenerDisposer();
			storage.disable();
			if (globalThis.fetch === patchedFetch) globalThis.fetch = originalFetch;
		};
	}, "dsh-thinking-effort: OpenCode session Header");
}
//#endregion
//#region lib/types/src/entries/opencode.js
/** The OpenCode session-header entry: per-model `x-opencode-session` injection. */
const name = "spig-dsh-thinking-provider/opencode";
const inject = ["settings", "llm"];
function apply(ctx) {
	installOpenCodeSession(ctx);
}
//#endregion
export { Config, apply, inject, name };
