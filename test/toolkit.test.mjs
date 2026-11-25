import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import vm from "node:vm";

import { ComponentStateStore } from "../src/core/state-store.js";
import { createComponentRegistry } from "../src/core/registry.js";
import { ToolkitComponentManager } from "../src/core/lifecycle.js";
import { detectLegacyConflict } from "../src/core/conflict-detector.js";
import { dispatchToolkitRpc } from "../src/core/rpc.js";

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "spig-dsh-toolkit-test-"));
}

function createMockCordisContext({ activeLegacyPlugins = [] } = {}) {
  const mounted = new Map();
  const registry = new Map();
  for (const name of activeLegacyPlugins) {
    registry.set({ name }, { disposed: false, runtime: { name } });
  }

  const ctx = {
    root: { registry },
    logger: { info() {}, warn() {}, error() {} },
    plugin(pluginDef, config) {
      let disposed = false;
      const effects = [];
      const subCtx = {
        effect(fn) {
          const cleanup = fn();
          if (typeof cleanup === "function") effects.push(cleanup);
        },
      };
      pluginDef.apply(subCtx, config);
      const fork = {
        get disposed() { return disposed; },
        dispose() {
          if (disposed) return;
          disposed = true;
          for (const cleanup of effects.splice(0)) cleanup();
          mounted.delete(pluginDef.name);
        },
      };
      mounted.set(pluginDef.name, { pluginDef, config, fork });
      return fork;
    },
  };
  return { ctx, mounted };
}

function createFakeComponents() {
  const log = [];
  const makeComp = (id, title, legacyPluginNames) => ({
    id,
    title,
    description: `${title} description`,
    defaultEnabled: true,
    settingsSectionId: id,
    legacyPluginNames,
    hostPlugin: {
      name: `spig-dsh-toolkit:${id}`,
      inject: [],
      apply(ctx) {
        log.push(`mount:${id}`);
        ctx.effect(() => () => {
          log.push(`unmount:${id}`);
        });
      },
    },
  });
  return {
    log,
    components: [
      makeComp("subscriptions", "Subscriptions", ["spig-dsh-subscriptions"]),
      makeComp("thinking-provider", "Thinking Provider", ["spig-dsh-thinking-provider"]),
    ],
  };
}

test("ComponentStateStore persists toggles across restarts and handles corrupt files", async () => {
  const dir = makeTempDir();
  const filePath = join(dir, "components.json");
  try {
    const store1 = new ComponentStateStore({
      filePath,
      defaults: { subscriptions: true, "thinking-provider": true },
    });
    assert.equal(store1.isEnabled("subscriptions"), true);
    assert.equal(store1.isEnabled("thinking-provider"), true);

    await store1.setEnabled("subscriptions", false);

    // Simulate restart with fresh store instance
    const store2 = new ComponentStateStore({
      filePath,
      defaults: { subscriptions: true, "thinking-provider": true },
    });
    assert.equal(store2.isEnabled("subscriptions"), false);
    assert.equal(store2.isEnabled("thinking-provider"), true);

    // Corrupt file falls back gracefully to defaults
    writeFileSync(filePath, "{not valid json", "utf8");
    const warnings = [];
    const store3 = new ComponentStateStore({
      filePath,
      defaults: { subscriptions: true, "thinking-provider": false },
      onWarn: (msg) => warnings.push(msg),
    });
    assert.equal(store3.isEnabled("subscriptions"), true);
    assert.equal(store3.isEnabled("thinking-provider"), false);
    assert.equal(warnings.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ToolkitComponentManager supports both active, single active, all disabled, and dynamic toggles", async () => {
  const dir = makeTempDir();
  const filePath = join(dir, "components.json");
  try {
    const { log, components } = createFakeComponents();
    const registry = createComponentRegistry(components);
    const store = new ComponentStateStore({ filePath, defaults: registry.defaults() });
    const { ctx, mounted } = createMockCordisContext();
    const manager = new ToolkitComponentManager(ctx, {}, { registry, store });

    // 1. Both enabled
    manager.mountEnabled();
    assert.equal(mounted.size, 2);
    assert.deepEqual(log, ["mount:subscriptions", "mount:thinking-provider"]);

    // 2. Disable subscriptions only -> unmounts immediately, thinking-provider stays active
    const s1 = await manager.setEnabled("subscriptions", false);
    assert.equal(s1.enabled, false);
    assert.equal(s1.active, false);
    assert.equal(mounted.size, 1);
    assert.equal(mounted.has("spig-dsh-toolkit:thinking-provider"), true);
    assert.deepEqual(log, ["mount:subscriptions", "mount:thinking-provider", "unmount:subscriptions"]);

    // 3. Disable thinking-provider -> both disabled, zero active forks
    const s2 = await manager.setEnabled("thinking-provider", false);
    assert.equal(s2.enabled, false);
    assert.equal(s2.active, false);
    assert.equal(mounted.size, 0);

    // 4. Re-enable only subscriptions
    const s3 = await manager.setEnabled("subscriptions", true);
    assert.equal(s3.enabled, true);
    assert.equal(s3.active, true);
    assert.equal(mounted.size, 1);
    assert.equal(mounted.has("spig-dsh-toolkit:subscriptions"), true);

    // 5. Dispose all on plugin shutdown
    manager.disposeAll();
    assert.equal(mounted.size, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ToolkitComponentManager detects legacy plugin conflict and skips duplicate mount", async () => {
  const dir = makeTempDir();
  const filePath = join(dir, "components.json");
  try {
    const { log, components } = createFakeComponents();
    const registry = createComponentRegistry(components);
    const store = new ComponentStateStore({ filePath, defaults: registry.defaults() });
    const { ctx, mounted } = createMockCordisContext({
      activeLegacyPlugins: ["spig-dsh-subscriptions"],
    });
    const manager = new ToolkitComponentManager(ctx, {}, { registry, store });

    manager.mountEnabled();

    // subscriptions skipped due to conflict; thinking-provider mounted normally
    assert.equal(mounted.size, 1);
    assert.equal(mounted.has("spig-dsh-toolkit:subscriptions"), false);
    assert.equal(mounted.has("spig-dsh-toolkit:thinking-provider"), true);
    assert.deepEqual(log, ["mount:thinking-provider"]);

    const status = manager.status();
    const subStatus = status.components.find((c) => c.id === "subscriptions");
    const tpStatus = status.components.find((c) => c.id === "thinking-provider");
    assert.equal(subStatus.active, false);
    assert.ok(subStatus.conflict?.hasConflict);
    assert.deepEqual(subStatus.conflict.conflictingPlugins, ["spig-dsh-subscriptions"]);
    assert.equal(tpStatus.active, true);
    assert.equal(tpStatus.conflict, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dispatchToolkitRpc handles status, setComponent, and invalid requests", async () => {
  const dir = makeTempDir();
  const filePath = join(dir, "components.json");
  try {
    const { components } = createFakeComponents();
    const registry = createComponentRegistry(components);
    const store = new ComponentStateStore({ filePath, defaults: registry.defaults() });
    const { ctx } = createMockCordisContext();
    const manager = new ToolkitComponentManager(ctx, {}, { registry, store });
    manager.mountEnabled();

    const statusRes = await dispatchToolkitRpc(manager, "status", {});
    assert.equal(statusRes.ok, true);
    assert.equal(statusRes.value.components.length, 2);

    const toggleRes = await dispatchToolkitRpc(manager, "setComponent", { id: "thinking-provider", enabled: false });
    assert.equal(toggleRes.ok, true);
    assert.equal(toggleRes.value.component.enabled, false);
    assert.equal(toggleRes.value.component.active, false);

    const badRes = await dispatchToolkitRpc(manager, "setComponent", { id: "subscriptions", enabled: "yes" });
    assert.equal(badRes.ok, false);
    assert.equal(badRes.error.code, "toolkit/bad-request");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("built lib/client.js loads via window.__ModuleLoader__ and exports apply/inject/name", () => {
  const clientPath = join(process.cwd(), "lib", "client.js");
  const code = readFileSync(clientPath, "utf8");
  let loaded = null;
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(entry) {
          loaded = entry;
        },
      },
    },
    console,
  };
  vm.runInNewContext(code, sandbox, { filename: "lib/client.js" });
  assert.ok(loaded, "window.__ModuleLoader__.load should be called");
  assert.equal(loaded.id, "spig-dsh-toolkit");
  assert.equal(typeof loaded.factory, "function");

  const fakeReact = {
    createElement: () => null,
    useState: (v) => [v, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
  };
  const exportsObj = loaded.factory((id) => {
    if (id === "react") return fakeReact;
    return {};
  });
  assert.equal(exportsObj.name, "spig-dsh-toolkit");
  assert.deepEqual([...exportsObj.inject], ["slots", "connection", "locale"]);
  assert.equal(typeof exportsObj.apply, "function");
});
