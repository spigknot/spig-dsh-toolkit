import z from "@deepseek-ai/schemastery";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import { createComponentRegistry } from "../src/core/registry.js";
import { DEFAULT_COMPONENTS } from "../src/components/index.js";
import { generalConfigsComponent } from "../src/components/general-configs.js";
import { ComponentStateStore, defaultStatePath } from "../src/core/state-store.js";
import { ToolkitComponentManager } from "../src/core/lifecycle.js";
import { registerToolkitRpc } from "../src/core/rpc.js";

export const name = "spig-dsh-toolkit";
export const inject = [];

export const Config = z.object({
  subscriptions: z.any(),
  thinkingProvider: z.any(),
  generalConfigs: z.any(),
}).description("Spig DSH Toolkit configuration");

export function apply(ctx, config = {}) {
  const registry = createComponentRegistry(DEFAULT_COMPONENTS);
  const store = new ComponentStateStore({
    filePath: defaultStatePath(dshHomePath),
    defaults: registry.defaults(),
    onWarn: (msg) => ctx.logger?.warn?.(msg),
  });

  const manager = new ToolkitComponentManager(ctx, config, {
    registry,
    store,
    logger: ctx.logger ?? console,
  });

  registerToolkitRpc(ctx, manager);
  manager.mountEnabled();

  // Always mount General Configs host services (Sidebar Bottom utilities + Compaction).
  // Supervised Windows startup and the restart button live in spig-dsh-supervisor.
  const generalFork = ctx.plugin(
    generalConfigsComponent.hostPlugin,
    generalConfigsComponent.resolveConfig(config),
  );

  ctx.effect(() => () => {
    try { generalFork?.dispose?.(); } catch {}
    manager.disposeAll();
  }, "spig-dsh-toolkit: component lifecycle");

  return manager;
}
