import * as coreEntry from "../../components/thinking-provider/lib/index.js";
import * as opencodeEntry from "../../components/thinking-provider/lib/entries/opencode.js";
import * as compactionEntry from "../../components/thinking-provider/lib/entries/compaction.js";
import * as subagentEntry from "../../components/thinking-provider/lib/entries/subagent.js";
import * as migrationEntry from "../../components/thinking-provider/lib/entries/migration.js";

/**
 * Thinking Provider component definition.
 * Mounts all host sub-entries of `spig-dsh-thinking-provider` (default levels
 * auto-fill, OpenCode session header, compaction policy, subagent defaults,
 * and legacy migration) inside a single isolated Cordis sub-plugin.
 *
 * Disposing this component's fork cleanly unmounts every sub-entry.
 */
export const thinkingProviderComponent = {
  id: "thinking-provider",
  title: "Thinking Provider",
  description: "Níveis de raciocínio (reasoning effort) para modelos de terceiros, slider no composer, rota/esforço padrão de subagentes, política de compactação e headers OpenCode.",
  defaultEnabled: true,
  settingsSectionId: "thinking-effort",
  legacyPluginNames: ["spig-dsh-thinking-provider", "@hytime/dsh-thinking-effort"],
  resolveConfig(toolkitConfig) {
    return toolkitConfig?.thinkingProvider ?? {};
  },
  hostPlugin: {
    name: "spig-dsh-toolkit:thinking-provider",
    inject: ["settings", "timer"],
    apply(ctx) {
      ctx.plugin({
        name: "spig-dsh-toolkit:thinking-provider:core",
        inject: coreEntry.inject ?? ["settings", "timer"],
        apply: (subCtx) => coreEntry.apply(subCtx),
      });
      ctx.plugin({
        name: "spig-dsh-toolkit:thinking-provider:opencode",
        inject: opencodeEntry.inject ?? ["settings", "llm"],
        apply: (subCtx) => opencodeEntry.apply(subCtx),
      });
      ctx.plugin({
        name: "spig-dsh-toolkit:thinking-provider:compaction",
        inject: compactionEntry.inject ?? ["settings", "llm", "timer"],
        apply: (subCtx) => compactionEntry.apply(subCtx),
      });
      ctx.plugin({
        name: "spig-dsh-toolkit:thinking-provider:subagent",
        inject: subagentEntry.inject ?? ["settings", "llm"],
        apply: (subCtx) => subagentEntry.apply(subCtx),
      });
      ctx.plugin({
        name: "spig-dsh-toolkit:thinking-provider:migration",
        inject: migrationEntry.inject ?? ["settings", "timer"],
        apply: (subCtx) => migrationEntry.apply(subCtx),
      });
    },
  },
};
