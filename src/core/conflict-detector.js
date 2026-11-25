/**
 * Detects whether a legacy standalone plugin corresponding to a toolkit
 * component is currently active in the same DSH host process.
 *
 * Defensive by design: inspects Cordis registry / loader if available without
 * requiring private APIs or failing in minimal/headless test contexts.
 */
export function detectLegacyConflict(ctx, component) {
  const legacyNames = component.legacyPluginNames ?? [];
  if (legacyNames.length === 0) {
    return { hasConflict: false, conflictingPlugins: [] };
  }

  const activeNames = new Set();

  // 1. Inspect Cordis root registry (Map<Plugin, Fork>)
  try {
    const registry = ctx?.root?.registry;
    if (registry && typeof registry.entries === "function") {
      for (const [plugin, fork] of registry.entries()) {
        if (!fork || fork.disposed) continue;
        const pluginName = plugin?.name ?? fork?.runtime?.name;
        if (typeof pluginName === "string" && pluginName.length > 0) {
          activeNames.add(pluginName);
        }
      }
    }
  } catch {}

  // 2. Inspect pluginManager service if exposed
  try {
    const pm = ctx?.get?.("pluginManager");
    if (pm && typeof pm.listBundles === "function") {
      const result = pm.listBundles();
      const entries = Array.isArray(result?.entries) ? result.entries : Array.isArray(result) ? result : [];
      for (const entry of entries) {
        if (entry?.enabled === true && typeof entry?.name === "string") {
          activeNames.add(entry.name);
        }
      }
    }
  } catch {}

  const conflictingPlugins = legacyNames.filter((name) => activeNames.has(name));
  if (conflictingPlugins.length === 0) {
    return { hasConflict: false, conflictingPlugins: [] };
  }

  return {
    hasConflict: true,
    conflictingPlugins,
    message: `Plugin legado ativo em paralelo (${conflictingPlugins.join(", ")}). Desative o plugin legado no Plugin Manager para evitar conflitos e ativar este componente no Spig Toolkit.`,
  };
}
