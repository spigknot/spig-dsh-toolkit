import * as subscriptionsModule from "../../components/subscriptions/lib/index.js";
import { mountWithLifecycleJournal } from "../../components/subscriptions/lib/lifecycle-journal.js";

/**
 * Subscriptions component definition.
 * Wraps the complete `spig-dsh-subscriptions` host plugin as an isolated
 * Cordis sub-plugin while preserving 100% of its runtime behavior and
 * `$DSH_HOME/plugins/subscriptions/` persistence paths.
 */
export const subscriptionsComponent = {
  id: "subscriptions",
  title: "Subscriptions",
  description: "Provedores por assinatura (Codex, Claude, Grok, Copilot e Google Antigravity via agy), pools de contas, proxy e ferramentas de mídia/busca.",
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
      return mountWithLifecycleJournal(ctx, {
        component: "subscriptions",
        apply: subscriptionsModule.apply,
        config: config ?? {},
      });
    },
  },
};
