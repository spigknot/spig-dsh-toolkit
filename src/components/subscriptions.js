import * as subscriptionsModule from "../../components/subscriptions/lib/index.js";
import { debugLog } from "../../components/subscriptions/lib/antigravity-cli-local.js";

/**
 * Subscriptions component definition.
 * Wraps the complete `spig-dsh-subscriptions` host plugin as an isolated
 * Cordis sub-plugin while preserving 100% of its runtime behavior and
 * `$DSH_HOME/plugins/subscriptions/` persistence paths.
 */
export const subscriptionsComponent = {
  id: "subscriptions",
  title: "Subscriptions",
  description: "Provedores por assinatura (Codex, Claude, Grok, Copilot e Google Antigravity via agy), pools de contas, proxy, compaction model e ferramentas de mídia/busca.",
  defaultEnabled: true,
  settingsSectionId: "subscriptions",
  legacyPluginNames: ["spig-dsh-subscriptions", "dsh-plugin-subscriptions"],
  resolveConfig(toolkitConfig) {
    return toolkitConfig?.subscriptions ?? {};
  },
  hostPlugin: {
    name: "spig-dsh-toolkit:subscriptions",
    inject: subscriptionsModule.inject ?? ["llm"],
    apply(ctx, config) {
      // Lifecycle journal (only with agy-debug.flag / DSH_AGY_DEBUG=1).
      void debugLog({ lifecycle: "subscriptions-mount:begin", pid: process.pid });
      ctx.effect(() => () => { void debugLog({ lifecycle: "subscriptions-unmount" }); });
      try {
        const result = subscriptionsModule.apply(ctx, config ?? {});
        void debugLog({ lifecycle: "subscriptions-mount:returned" });
        return result;
      } catch (error) {
        void debugLog({ lifecycle: "subscriptions-mount:failed", error: String(error?.stack ?? error).slice(0, 2000) });
        throw error;
      }
    },
  },
};
