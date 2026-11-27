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
import { GeneralConfigsStore } from "../src/components/general-configs/store.js";
import { dispatchGeneralRpc } from "../src/components/general-configs/rpc.js";
import { DEFAULT_COMPONENTS } from "../src/components/index.js";

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

test("GeneralConfigsStore persists sidebarBottom sub-toggles atomically and defaults to false", async () => {
  const dir = makeTempDir();
  const filePath = join(dir, "general-configs.json");
  try {
    const store1 = new GeneralConfigsStore({ filePath });
    assert.deepEqual(store1.snapshot(), {
      sidebarBottom: { sessionSearch: false, restartButton: false, settingsGear: false },
    });

    await store1.update({ sidebarBottom: { sessionSearch: true, settingsGear: true } });
    const store2 = new GeneralConfigsStore({ filePath });
    assert.deepEqual(store2.snapshot(), {
      sidebarBottom: { sessionSearch: true, restartButton: false, settingsGear: true },
    });

    const deps = {
      store: store2,
      startup: {
        getStatus: async () => ({ installed: false }),
        setEnabled: async (e) => ({ installed: e }),
        requestRestart: async () => ({ mode: "supervisor" }),
      },
      compaction: { getView: async () => ({ current: null, providers: [] }), set: async () => ({ current: null, providers: [] }) },
    };
    const res = await dispatchGeneralRpc(deps, "get", {});
    assert.equal(res.ok, true);
    assert.equal(res.value.settings.sidebarBottom.sessionSearch, true);

    const upd = await dispatchGeneralRpc(deps, "update", { sidebarBottom: { restartButton: true } });
    assert.equal(upd.ok, true);
    assert.equal(upd.value.settings.sidebarBottom.restartButton, true);

    const rst = await dispatchGeneralRpc(deps, "restart", {});
    assert.equal(rst.ok, true);
    assert.equal(rst.value.mode, "supervisor");

    const bad = await dispatchGeneralRpc(deps, "nope", {});
    assert.equal(bad.ok, false);

    const sessionQuery = {
      calls: [],
      async searchSessions(request) {
        this.calls.push(request);
        return {
          items: [
            { header: { id: "s1", cwd: "C:\\a" }, bestMatch: { snippet: "hit one" } },
            { header: { id: "s2" }, bestMatch: { snippet: "hit two" } },
          ],
          nextCursor: "cursor-1",
        };
      },
    };
    const fts = await dispatchGeneralRpc({ ...deps, sessionQuery: () => sessionQuery }, "ftsSearch", { query: "pequena" });
    assert.equal(fts.ok, true);
    assert.deepEqual(fts.value.items, [
      { sessionId: "s1", snippet: "hit one", cwd: "C:\\a" },
      { sessionId: "s2", snippet: "hit two", cwd: null },
    ]);
    assert.equal(fts.value.nextCursor, "cursor-1");
    assert.equal(sessionQuery.calls.length, 1);
    assert.equal(sessionQuery.calls[0].query, "pequena");
    assert.equal(sessionQuery.calls[0].limit, 10);
    assert.deepEqual(sessionQuery.calls[0].eventFilters, [
      { kind: "type", values: ["user/message", "assistant/message"] },
      { kind: "surface", values: ["current"] },
    ]);

    const ftsPaged = await dispatchGeneralRpc({ ...deps, sessionQuery: () => sessionQuery }, "ftsSearch", { query: "pequena", limit: 5, cursor: "cursor-1" });
    assert.equal(ftsPaged.ok, true);
    assert.equal(sessionQuery.calls[1].limit, 5);
    assert.equal(sessionQuery.calls[1].cursor, "cursor-1");

    const ftsEmpty = await dispatchGeneralRpc({ ...deps, sessionQuery: () => sessionQuery }, "ftsSearch", { query: "   " });
    assert.equal(ftsEmpty.ok, false);

    const ftsBadLimit = await dispatchGeneralRpc({ ...deps, sessionQuery: () => sessionQuery }, "ftsSearch", { query: "x", limit: 101 });
    assert.equal(ftsBadLimit.ok, false);

    const ftsNoService = await dispatchGeneralRpc(deps, "ftsSearch", { query: "x" });
    assert.equal(ftsNoService.ok, false);
    assert.equal(ftsNoService.error.code, "general/unavailable");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { DEFAULT_AUTOSTART_DIR, createStartupController } from "../src/components/general-configs/startup.js";
import { existsSync } from "node:fs";
import {
  DEFAULT_RATE_LIMIT_MAX_WAIT_MS,
  DEFAULT_RATE_LIMIT_WAIT,
  DEFAULT_RETRY,
  resolveRateLimitWait,
  subscriptionRetryPolicy,
} from "../components/subscriptions/lib/providers/rate-limit.js";

test("DEFAULT_COMPONENTS lists only toggleable components and autostart scripts are bundled", () => {
  assert.deepEqual(DEFAULT_COMPONENTS.map((c) => c.id), ["subscriptions", "thinking-provider"]);
  assert.equal(existsSync(join(DEFAULT_AUTOSTART_DIR, "setup.cmd")), true);
  assert.equal(existsSync(join(DEFAULT_AUTOSTART_DIR, "..", "dsh-navegador.mjs")), true);
  assert.equal(existsSync(join(DEFAULT_AUTOSTART_DIR, "..", "local-web-proxy.mjs")), true);
});

test("quota waits fail fast by default: disclosed resets past 2 min end the turn", () => {
  // TOOLKIT DIVERGENCE: default ceiling is 2 min, not the upstream 6 h, so a
  // quota reset hours out (e.g. pool exhausted, recovers in ~4 h) fails the
  // turn immediately with the recovery time instead of parking the session
  // on `Retrying model request (1/10)` for hours.
  assert.equal(DEFAULT_RATE_LIMIT_MAX_WAIT_MS, 120_000);
  const wait = resolveRateLimitWait(undefined, "test: rateLimit");
  assert.deepEqual({ ...wait }, { wait: true, maxWaitMs: 120_000 });
  const policy = subscriptionRetryPolicy(DEFAULT_RETRY, DEFAULT_RATE_LIMIT_WAIT, "test");
  // The retry plugin only waits out disclosed resets within maxDelayMs; a
  // 4-hour quota reset is far past the 2-minute ceiling.
  assert.equal(policy.maxDelayMs, 120_000);
  assert.ok(14_521_000 > policy.maxDelayMs);
  // Explicit opt-in still waits out a full session window.
  const patient = subscriptionRetryPolicy(
    DEFAULT_RETRY,
    resolveRateLimitWait({ wait: true, maxWaitMs: 21_600_000 }, "test: rateLimit"),
    "test",
  );
  assert.equal(patient.maxDelayMs, 21_600_000);
});

test("querySupervisor never throws with an isolated empty state directory", async () => {
  const dir = makeTempDir();
  try {
    const ctl = createStartupController({ stateDir: dir, includeLegacy: false, includeBundledFallback: false });
    const status = await ctl.querySupervisor();
    assert.equal(status.supported, process.platform === "win32");
    assert.equal(typeof status.managed, "boolean");
    assert.equal(typeof status.dir, "string");
    assert.equal(typeof status.inManagedTree, "boolean");
    assert.equal(status.managed, false);
    assert.equal(status.dir, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
