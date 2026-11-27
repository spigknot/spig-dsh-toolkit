import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import {
  COMPACTION_EFFORTS,
  CompactionModelStore,
  installCompactionRouting,
} from "../../components/subscriptions/lib/compaction-model.js";
import { GeneralConfigsStore, defaultGeneralConfigsPath } from "./general-configs/store.js";
import { createStartupController } from "./general-configs/startup.js";
import { registerGeneralRpc } from "./general-configs/rpc.js";

const DISCOVERY_TIMEOUT_MS = 5000;

async function withTimeout(fn, ms) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function hasActiveSubscriptionsPlugin(ctx) {
  const registry = ctx?.root?.registry;
  if (!registry || typeof registry.entries !== "function") return false;
  for (const [plugin, state] of registry.entries()) {
    if (state?.disposed) continue;
    const name = plugin?.name ?? state?.runtime?.name;
    if (name === "spig-dsh-toolkit:subscriptions" || name === "spig-dsh-subscriptions") {
      return true;
    }
  }
  return false;
}

function createCompactionBridge(ctx, { onWarn }) {
  const filePath = dshHomePath("plugins", "subscriptions", "compaction-model.json");
  const store = new CompactionModelStore(filePath);

  // Install compaction routing only when subscriptions is not already handling it.
  // When subscriptions is active, the UI routes writes through subscriptions' RPC
  // so both share the exact same file and in-memory state.
  if (!hasActiveSubscriptionsPlugin(ctx)) {
    ctx.effect(() => installCompactionRouting(ctx, { store, onWarn }), "spig-dsh-toolkit:general-configs compaction routing");
  }

  async function getView() {
    const llm = ctx.get?.("llm") ?? ctx.llm;
    const providers = [];
    if (llm && typeof llm.listProviders === "function") {
      for (const provider of llm.listProviders()) {
        const models = await withTimeout(() => llm.listModels(provider.id), DISCOVERY_TIMEOUT_MS).catch(() => []);
        providers.push({
          id: provider.id,
          name: provider.name,
          models: (models ?? []).map((model) => ({
            id: model.id,
            name: model.name,
          })),
        });
      }
    }
    // Reload latest file state in case subscriptions updated it.
    const fresh = new CompactionModelStore(filePath);
    return {
      current: fresh.get() ?? null,
      efforts: COMPACTION_EFFORTS,
      providers,
    };
  }

  async function set(value) {
    const llm = ctx.get?.("llm") ?? ctx.llm;
    if (value !== null) {
      if (typeof value !== "object" || Array.isArray(value)) {
        throw new Error("value must be an object or null");
      }
      if (llm && typeof llm.listProviders === "function") {
        if (!llm.listProviders().some((provider) => provider.id === value.provider)) {
          throw new Error(`provider ${String(value.provider)} is not registered`);
        }
        await llm.resolveModelInfo(String(value.provider), String(value.model ?? ""));
      }
    }
    await store.set(value);
    return getView();
  }

  return { getView, set };
}

/**
 * General Configs component descriptor.
 * Expandable layout & general behavior menu (Sidebar Bottom, Session Search,
 * Windows logon autostart on port 3080, and Context Compaction model).
 */
export const generalConfigsComponent = {
  id: "general-configs",
  title: "General Configs",
  description:
    "Layout and general PC behavior: Sidebar Bottom (session search, restart button, settings gear), Windows logon autostart (port 3080, no auth), and Context Compaction model.",
  defaultEnabled: false,
  settingsSectionId: "spig-general-configs",
  legacyPluginNames: [],
  resolveConfig(toolkitConfig) {
    return toolkitConfig?.generalConfigs ?? {};
  },
  hostPlugin: {
    name: "spig-dsh-toolkit:general-configs",
    inject: [],
    apply(ctx, config = {}) {
      const onWarn = (msg) => ctx.logger?.warn?.(msg);
      const store = new GeneralConfigsStore({
        filePath: config.statePath ?? defaultGeneralConfigsPath(dshHomePath),
        onWarn,
      });
      const startup = createStartupController({
        stateDir: config.autostartDir,
        dshHomePath,
        taskName: config.taskName,
        healthUrl: config.healthUrl,
        onWarn,
      });
      try { startup.syncRuntimeIfInstalled(); } catch (err) {
        onWarn("autostart runtime sync failed: " + (err instanceof Error ? err.message : String(err)));
      }
      const compaction = createCompactionBridge(ctx, { onWarn });
      const sessionQuery = () => {
        try {
          return ctx.get?.("sessionQuery") ?? ctx.root?.get?.("sessionQuery");
        } catch {
          return undefined;
        }
      };
      registerGeneralRpc(ctx, { store, startup, compaction, sessionQuery });
    },
  },
};
