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

const requireFromPackage = createRequire(
	"D:/Projetos/spig-dsh-thinking-provider/package.json",
);

const schemaModule = requireFromPackage("@deepseek-ai/schemastery");
const yamlModule = requireFromPackage("yaml");

/** `schemastery` default export (CJS `module.exports = Schema`). */
export const z = schemaModule.default ?? schemaModule;
/** `yaml` parser used by the legacy-migration entry. */
export const parse = yamlModule.parse;
