/**
 * Spig DSH Toolkit — Client orchestrator & Settings UI.
 * Bundled into `lib/client.js` by `scripts/build.mjs` alongside the isolated
 * client factories of each registered component.
 */
function createToolkitClient(require, componentFactories) {
  const React = require("react");
  const h = React.createElement;
  const { useState, useEffect, useCallback } = React;

  const NS = "settings.spigToolkit";

  const LOCALES = {
    en: {
      nav: "Spig Toolkit",
      title: "Spig DSH Toolkit",
      subtitle: "Enable or disable individual toolkit components independently. Disabling a component unmounts its hooks and UI while preserving all saved settings.",
      active: "Active",
      disabled: "Disabled",
      conflict: "Conflict",
      error: "Error",
      loading: "Loading components...",
      refresh: "Refresh",
      preservedNote: "Component settings are preserved when disabled.",
      allDisabledNote: "All components are currently disabled. The toolkit remains idle with no active hooks or providers.",
    },
    "pt-BR": {
      nav: "Spig Toolkit",
      title: "Spig DSH Toolkit",
      subtitle: "Ative ou desative cada componente independentemente. Ao desativar, os hooks, provedores e interfaces do componente são desmontados, preservando todas as configurações salvas.",
      active: "Ativo",
      disabled: "Desativado",
      conflict: "Conflito",
      error: "Erro",
      loading: "Carregando componentes...",
      refresh: "Atualizar",
      preservedNote: "As configurações individuais são preservadas mesmo com o componente desativado.",
      allDisabledNote: "Todos os componentes estão desativados. O toolkit permanece ocioso sem hooks ou provedores ativos.",
    },
  };

  function ToggleSwitch({ checked, disabled, onChange, label }) {
    return h(
      "button",
      {
        type: "button",
        role: "switch",
        "aria-checked": checked,
        "aria-label": label,
        disabled,
        onClick: () => !disabled && onChange(!checked),
        style: {
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          width: "44px",
          height: "24px",
          borderRadius: "999px",
          border: "1px solid var(--dsh-border, rgba(148,163,184,0.35))",
          background: checked ? "var(--dsh-accent, #38bdf8)" : "var(--dsh-surface-muted, rgba(148,163,184,0.22))",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          transition: "background 150ms ease",
          padding: "2px",
          flexShrink: 0,
        },
      },
      h("span", {
        style: {
          display: "block",
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          background: "#ffffff",
          transform: checked ? "translateX(20px)" : "translateX(0px)",
          transition: "transform 150ms ease",
          boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
        },
      }),
    );
  }

  function StatusBadge({ component, t }) {
    let text = t("disabled");
    let bg = "rgba(148,163,184,0.16)";
    let color = "var(--dsh-text-muted, #94a3b8)";
    if (component.conflict) {
      text = t("conflict");
      bg = "rgba(245,158,11,0.18)";
      color = "#f59e0b";
    } else if (component.error) {
      text = t("error");
      bg = "rgba(239,68,68,0.18)";
      color = "#ef4444";
    } else if (component.active) {
      text = t("active");
      bg = "rgba(34,197,94,0.18)";
      color = "#22c55e";
    }
    return h(
      "span",
      {
        style: {
          display: "inline-block",
          fontSize: "11px",
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: "999px",
          background: bg,
          color,
        },
      },
      text,
    );
  }

  function SpigToolkitSection({ controller, t }) {
    const [components, setComponents] = useState(controller.getComponents());
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
      const unsub = controller.subscribe((next) => setComponents(next));
      controller.refresh().catch((err) => setError(err instanceof Error ? err.message : String(err)));
      return unsub;
    }, [controller]);

    const handleToggle = useCallback(async (id, nextEnabled) => {
      setBusyId(id);
      setError(null);
      try {
        await controller.setEnabled(id, nextEnabled);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    }, [controller]);

    const allDisabled = components.length > 0 && components.every((c) => !c.enabled);

    return h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "16px", maxWidth: "760px" } },
      h(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" } },
        h(
          "div",
          null,
          h("h2", { style: { margin: "0 0 6px 0", fontSize: "18px", fontWeight: 600 } }, t("title")),
          h("p", { style: { margin: 0, fontSize: "13px", opacity: 0.78, lineHeight: 1.5 } }, t("subtitle")),
        ),
        h(
          "button",
          {
            type: "button",
            onClick: () => controller.refresh().catch(() => {}),
            style: {
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid var(--dsh-border, rgba(148,163,184,0.3))",
              background: "transparent",
              color: "inherit",
              fontSize: "12px",
              cursor: "pointer",
              flexShrink: 0,
            },
          },
          t("refresh"),
        ),
      ),
      error && h(
        "div",
        {
          style: {
            padding: "10px 12px",
            borderRadius: "8px",
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.35)",
            color: "#ef4444",
            fontSize: "13px",
          },
        },
        error,
      ),
      components.length === 0
        ? h("div", { style: { fontSize: "13px", opacity: 0.7 } }, t("loading"))
        : h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "12px" } },
          components.map((component) =>
            h(
              "div",
              {
                key: component.id,
                style: {
                  padding: "14px 16px",
                  borderRadius: "10px",
                  border: "1px solid var(--dsh-border, rgba(148,163,184,0.22))",
                  background: "var(--dsh-surface, rgba(15,23,42,0.04))",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                },
              },
              h(
                "div",
                { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" } },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
                  h("strong", { style: { fontSize: "14px" } }, component.title),
                  h(StatusBadge, { component, t }),
                ),
                h(ToggleSwitch, {
                  checked: component.enabled,
                  disabled: busyId === component.id,
                  label: component.title,
                  onChange: (next) => handleToggle(component.id, next),
                }),
              ),
              h("p", { style: { margin: 0, fontSize: "13px", opacity: 0.8, lineHeight: 1.45 } }, component.description),
              component.conflict && h(
                "div",
                {
                  style: {
                    fontSize: "12px",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    background: "rgba(245,158,11,0.12)",
                    border: "1px solid rgba(245,158,11,0.3)",
                    color: "#f59e0b",
                  },
                },
                component.conflict.message,
              ),
              component.error && h(
                "div",
                {
                  style: {
                    fontSize: "12px",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    background: "rgba(239,68,68,0.12)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    color: "#ef4444",
                  },
                },
                component.error,
              ),
            ),
          ),
        ),
      allDisabled && h(
        "div",
        {
          style: {
            fontSize: "12px",
            opacity: 0.75,
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px dashed var(--dsh-border, rgba(148,163,184,0.3))",
          },
        },
        t("allDisabledNote"),
      ),
      h("div", { style: { fontSize: "12px", opacity: 0.65 } }, t("preservedNote")),
    );
  }

  function createToolkitClientController(ctx, connection) {
    let components = [];
    const listeners = new Set();
    const clientForks = new Map();
    const loadedModules = new Map();

    const notify = () => {
      for (const listener of listeners) listener(components);
    };

    const syncClientForks = (list) => {
      for (const comp of list) {
        const shouldMount = comp.enabled === true && comp.active === true && !comp.conflict;
        const existing = clientForks.get(comp.id);
        if (shouldMount && !existing) {
          const factory = componentFactories[comp.id];
          if (typeof factory !== "function") continue;
          try {
            let mod = loadedModules.get(comp.id);
            if (!mod) {
              mod = factory(require);
              loadedModules.set(comp.id, mod);
            }
            if (mod && typeof mod.apply === "function") {
              const fork = ctx.plugin({
                name: `spig-dsh-toolkit:client:${comp.id}`,
                inject: mod.inject ?? [],
                apply: (subCtx) => mod.apply(subCtx),
              });
              clientForks.set(comp.id, fork);
            }
          } catch (error) {
            console.warn("[spig-dsh-toolkit] failed to mount client component", comp.id, error);
          }
        } else if (!shouldMount && existing) {
          clientForks.delete(comp.id);
          try {
            existing.dispose?.();
          } catch {}
        }
      }
    };

    const refresh = async () => {
      const res = await connection.rpc.call("/api", "spig-toolkit.status", {});
      if (res && res.ok && Array.isArray(res.value?.components)) {
        components = res.value.components;
        syncClientForks(components);
        notify();
      } else if (res && !res.ok) {
        throw new Error(res.error?.message ?? "Failed to load toolkit status");
      }
      return components;
    };

    const setEnabled = async (id, enabled) => {
      const res = await connection.rpc.call("/api", "spig-toolkit.setComponent", { id, enabled });
      if (!res || !res.ok) {
        throw new Error(res?.error?.message ?? "Failed to update component");
      }
      if (Array.isArray(res.value?.status?.components)) {
        components = res.value.status.components;
        syncClientForks(components);
        notify();
      }
      return res.value;
    };

    const disposeAll = () => {
      for (const fork of clientForks.values()) {
        try { fork.dispose?.(); } catch {}
      }
      clientForks.clear();
    };

    return {
      getComponents: () => components,
      subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
      refresh,
      setEnabled,
      disposeAll,
    };
  }

  const name = "spig-dsh-toolkit";
  const inject = ["slots", "connection", "locale"];

  function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, LOCALES), "spig-dsh-toolkit: locales");
    const connection = ctx.get("connection");
    const t = ctx.locale.bind(NS);
    const controller = createToolkitClientController(ctx, connection);

    ctx.effect(() => () => controller.disposeAll(), "spig-dsh-toolkit: client component forks");

    ctx.slots.inject("settings.section", () => ctx.slots.register({
      name: "settings.section",
      id: "spig-toolkit",
      order: 85,
      label: () => t("nav"),
      inject: () => ({ controller, t }),
    }, SpigToolkitSection));

    // Kick off initial component sync immediately so enabled components mount on load
    controller.refresh().catch((err) => {
      console.warn("[spig-dsh-toolkit] initial status sync failed:", err);
    });
  }

  return { name, inject, apply };
}
