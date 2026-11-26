/**
 * Fork-local dependency shim.
 *
 * The host loads this package through the profile's symlink
 * (`profiles/<profile>/node_modules/<package>`), and Node resolves bare
 * specifiers against *that* path — the profile's node_modules — where these two
 * packages are not installed, because pnpm never installs the dependencies of a
 * `link:` target.
 *
 * `createRequire` anchored on an absolute path keeps resolution inside this
 * package's own `node_modules`, whatever path the host used to import it.
 * Updating the checkout: keep this file and the two imports that use it.
 */
import { createRequire } from "node:module";

/**
 * Resolution anchors, tried in order. The toolkit carries its own
 * `node_modules` (`@deepseek-ai/schemastery`, `yaml`), so resolving from this
 * file's own URL keeps resolution inside the toolkit whatever path the host
 * used to import it. The legacy standalone checkout anchors are best-effort
 * fallbacks (that directory may not exist on this machine).
 */
const anchors = [
	import.meta.url,
	new URL("../../../package.json", import.meta.url).href,
	"D:/Projetos/spig-dsh-thinking-provider/package.json",
];

let schemaModule, yamlModule, lastError;
for (const anchor of anchors) {
	try {
		const requireFromPackage = createRequire(anchor);
		schemaModule ??= requireFromPackage("@deepseek-ai/schemastery");
		yamlModule ??= requireFromPackage("yaml");
		if (schemaModule && yamlModule) break;
	} catch (error) {
		lastError = error;
	}
}
if (!schemaModule || !yamlModule) throw lastError;

/** `schemastery` default export (CJS `module.exports = Schema`). */
export const z = schemaModule.default ?? schemaModule;
/** `yaml` parser used by the legacy-migration entry. */
export const parse = yamlModule.parse;
