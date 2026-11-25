import { v as PLUGIN_NS, w as isUnknownRecord } from "./src-Cwr6N05S.js";
//#region packages/kit/src/compat/opencode-session.ts
/**
* The section id under the registered-namespace settings model (rc.7 … 0.1.6).
* The 0.1.7 entry-config model addresses the section by Loader entry id
* instead, which `settingsEntryId` reads from the live fiber.
*/
const OPENCODE_SESSION_NAMESPACE = PLUGIN_NS;
const OPENCODE_SESSION_HEADER = "x-opencode-session";
function record(value) {
	return isUnknownRecord(value) ? value : void 0;
}
function ownRecord(value, key) {
	const object = record(value);
	if (object === void 0 || !Object.prototype.hasOwnProperty.call(object, key)) return void 0;
	return record(object[key]);
}
function isOpenCodeSessionEnabled(settings, provider, model) {
	if (provider.length === 0 || model.length === 0) return false;
	const models = ownRecord(ownRecord(ownRecord(ownRecord(settings, "opencodeSession"), "providers"), provider), "models");
	return Object.prototype.hasOwnProperty.call(models ?? {}, model) && models?.[model] === true;
}
//#endregion
export { OPENCODE_SESSION_NAMESPACE as n, isOpenCodeSessionEnabled as r, OPENCODE_SESSION_HEADER as t };
