import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import { installAgyOverflowRecovery } from "../../components/subscriptions/lib/antigravity-cli-recovery.js";
import {
  COMPACTION_EFFORTS,
  CompactionModelStore,
  installCompactionRouting,
  summaryChunkBudget,
} from "./general-configs/compaction-model.js";
import { GeneralConfigsStore, defaultGeneralConfigsPath } from "./general-configs/store.js";
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

/** Legacy Subscriptions-owned store, imported once on first run. */
const LEGACY_COMPACTION_PATH = () => dshHomePath("plugins", "subscriptions", "compaction-model.json");

function createCompactionBridge(ctx, { onWarn }) {
  // Single source of truth, owned by General Configs (not Subscriptions).
  const filePath = dshHomePath("plugins", "spig-dsh-toolkit", "compaction-model.json");
  const store = new CompactionModelStore(filePath);
  // One-time import from the legacy file; afterwards the Toolkit path wins.
  try {
    if (store.get() === undefined) {
      const legacy = new CompactionModelStore(LEGACY_COMPACTION_PATH()).get();
      if (legacy !== undefined) {
        store.set(legacy).catch((error) => onWarn(`compaction model migration failed: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  } catch (error) {
    onWarn(`compaction model migration failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // The compaction-model choice lives here: re-route only summarization calls
  // (`purpose: 'compaction'`) to the chosen route, on every provider route.
  // General Configs is always mounted, so this is installed unconditionally.
  ctx.effect(() => installCompactionRouting(ctx, { store, onWarn }), "spig-dsh-toolkit:general-configs compaction routing");
  // Size the Antigravity CLI overflow recovery for the chosen summarizer, so a
  // non-CLI compaction model still summarizes the whole history in few spans.
  ctx.effect(() => installAgyOverflowRecovery(ctx, {
    onWarn,
    chunkBudgetFor: (_agent, signal) => summaryChunkBudget({ store, llm: ctx.get?.("llm") ?? ctx.llm, signal }),
  }), "spig-dsh-toolkit:general-configs antigravity overflow recovery");

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
    // Reload latest file state (single owner; no other component writes it).
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
 * and Context Compaction model). Supervised Windows startup and the sidebar
 * restart button live in spig-dsh-supervisor (>= 1.0.0).
 */
export const generalConfigsComponent = {
  id: "general-configs",
  title: "General Configs",
  description:
    "Layout and general PC behavior: Sidebar Bottom (session search, settings gear) and Context Compaction model.",
  defaultEnabled: false,
  settingsSectionId: "spig-general-configs",
  legacyPluginNames: [],
  resolveConfig(toolkitConfig) {
    return toolkitConfig?.generalConfigs ?? {};
  },
  hostPlugin: {
    name: "spig-dsh-toolkit:general-configs",
    // Generation marker consumed by spig-dsh-supervisor's conflict detector:
    // only a toolkit that exposes generalApiVersion 2 is known to be free of
    // the autostart/restart surface (moved to the supervisor plugin).
    generalApiVersion: 2,
    inject: [],
    apply(ctx, config = {}) {
      const onWarn = (msg) => ctx.logger?.warn?.(msg);
      const store = new GeneralConfigsStore({
        filePath: config.statePath ?? defaultGeneralConfigsPath(dshHomePath),
        onWarn,
      });
      const compaction = createCompactionBridge(ctx, { onWarn });
      const sessionQuery = () => {
        try {
          return ctx.get?.("sessionQuery") ?? ctx.root?.get?.("sessionQuery");
        } catch {
          return undefined;
        }
      };
      registerGeneralRpc(ctx, { store, compaction, sessionQuery });
    },
  },
};
