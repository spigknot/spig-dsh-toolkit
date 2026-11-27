/**
 * Spig DSH Toolkit — General Configs Client Component.
 * Bundled into `lib/client.js` by `scripts/build.mjs`.
 */
function createGeneralConfigsClient(require) {
  const React = require("react");
  const h = React.createElement;
  const { useState, useEffect, useCallback } = React;

  const NS = "settings.spigGeneralConfigs";
  const GEAR_ICON = "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z";

  const LOCALES = {
    en: {
      nav: "Spig Toolkit",
      title: "Spig Toolkit",
      subtitle: "Expandable PC layout and general behavior settings. All toggles are persisted atomically and preserved if disabled.",
      refresh: "Refresh",
      sidebarBottomTitle: "Sidebar Bottom",
      sidebarBottomHint: "Customize the left sidebar footer and session search behavior.",
      sessionSearchLabel: "Session search (FTS5 content + in-session find)",
      sessionSearchHint: "Searches session titles and full-text content snippets. Adds a draggable in-session find loupe.",
      settingsGearLabel: "Settings gear button",
      settingsGearHint: "Replaces the '... More' account menu with a direct Settings gear icon on the right.",
      compactionTitle: "Context / Compaction",
      compactionHint: "Model that summarizes history when a conversation is compacted. Shares the same store as Subscriptions (compaction-model.json).",
      compactionStatusDefault: "Same model as the conversation (DSH default).",
      compactionStatusChosen: "{provider} · {model} · {scope}",
      compactionConfigure: "Configure…",
      compactionProvider: "Provider",
      compactionModel: "Model",
      compactionEffort: "Reasoning effort",
      compactionEffortDefault: "Default (the model's own)",
      compactionScope: "Use it for",
      compactionScopeAll: "all conversations",
      compactionScopeAntigravity: "Antigravity conversations only",
      compactionChoose: "Choose…",
      compactionSave: "Save",
      compactionSaving: "Saving…",
      compactionDefault: "Use the conversation model",
      compactionCancel: "Cancel",
      compactionLoading: "Loading compaction settings…",
      settingsLabel: "Settings",
      ftsSearching: "Searching session content…",
      ftsNoResults: "No content matches found.",
      ftsShowing: "Showing {n}",
      ftsShowMore: "Show 10 more",      ftsDisabled: "Content search is disabled (SESSION_QUERY_SEARCH_DISABLED). Restart the harness once to activate the FTS5 index, then press Enter again.",
      ftsError: "Content search failed",
      ftsUntitled: "Untitled session",
      ftsHasMore: "Showing the first {n} results",
    },
    "pt-BR": {
      nav: "Spig Toolkit",
      title: "Spig Toolkit",
      subtitle: "Layout e funcionamento geral do DSH no PC. Todas as opções são salvas atomicamente e preservadas ao desativar.",
      refresh: "Atualizar",
      sidebarBottomTitle: "Sidebar Bottom",
      sidebarBottomHint: "Personalize o rodapé da barra lateral esquerda e a busca em sessões.",
      sessionSearchLabel: "Busca em sessões (conteúdo FTS5 + lupa interna)",
      sessionSearchHint: "Busca títulos e conteúdo completo das sessões com snippets. Adiciona lupa flutuante dentro da sessão.",
      settingsGearLabel: "Botão engrenagem configurações",
      settingsGearHint: "Substitui o menu '... More' por um ícone de engrenagem à direita que abre Configurações direto.",
      compactionTitle: "Contexto / Compactação",
      compactionHint: "Modelo usado para resumir o histórico ao compactar uma conversa. Compartilha a mesma fonte de verdade do Subscriptions (compaction-model.json).",
      compactionStatusDefault: "Mesmo modelo da conversa (padrão DSH).",
      compactionStatusChosen: "{provider} · {model} · {scope}",
      compactionConfigure: "Configurar…",
      compactionProvider: "Provedor",
      compactionModel: "Modelo",
      compactionEffort: "Esforço de raciocínio",
      compactionEffortDefault: "Padrão (do próprio modelo)",
      compactionScope: "Aplicar em",
      compactionScopeAll: "todas as conversas",
      compactionScopeAntigravity: "apenas conversas Antigravity",
      compactionChoose: "Escolher…",
      compactionSave: "Salvar",
      compactionSaving: "Salvando…",
      compactionDefault: "Usar o modelo da conversa",
      compactionCancel: "Cancelar",
      compactionLoading: "Carregando compactação…",
      settingsLabel: "Configurações",
      ftsSearching: "Buscando no conteúdo das sessões…",
      ftsNoResults: "Nenhuma correspondência encontrada no conteúdo.",
      ftsShowing: "Mostrando {n}",
      ftsShowMore: "Mostrar mais 10",
      ftsDisabled: "A busca no conteúdo está desabilitada (SESSION_QUERY_SEARCH_DISABLED). Reinicie o harness uma vez para ativar o índice FTS5 e tecle Enter de novo.",
      ftsError: "Falha na busca de conteúdo",
      ftsUntitled: "Sessão sem título",
      ftsHasMore: "Mostrando os primeiros {n} resultados",
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

  /* -------------------------------------------------------------------------- */
  /* In-session floating find loupe (DOM-only, replicated from dsh-web-sig-find) */
  /* -------------------------------------------------------------------------- */
  function installInSessionFind() {
    const MARK = "data-sig-find";
    const UI_ATTR = "data-sig-find-ui";
    const STORE_KEY = "sig-find-position";
    let hits = [];
    let current = -1;
    let input = null;
    let counter = null;
    let box = null;
    let launcher = null;
    let expanded = false;
    let drag = null;
    let disposed = false;

    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

    const savedPosition = () => {
      try {
        const raw = window.localStorage.getItem(STORE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed.top !== "number" || typeof parsed.left !== "number") return null;
        return parsed;
      } catch {
        return null;
      }
    };

    const savePosition = (top, left) => {
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify({ top, left })); } catch {}
    };

    const scope = () => {
      const tabs = document.querySelector("[data-conversation-tabs]");
      let el = tabs;
      while (el && el !== document.body) {
        const cls = typeof el.className === "string" ? el.className : "";
        if (cls.includes("_root")) return el;
        el = el.parentElement;
      }
      return document.body;
    };

    const clearMarks = () => {
      const marks = document.querySelectorAll(`mark[${MARK}]`);
      for (const mark of marks) {
        const parent = mark.parentNode;
        if (!parent) continue;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
      }
      hits = [];
      current = -1;
    };

    const collect = (node, out) => {
      if (node.nodeType === 3) {
        if (node.nodeValue && node.nodeValue.trim() !== "") out.push(node);
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "MARK" || tag === "INPUT" || tag === "TEXTAREA") return;
      if (node.hasAttribute(UI_ATTR)) return;
      const cls = typeof node.className === "string" ? node.className : "";
      if (cls.includes("_header")) return;
      for (const child of node.childNodes) collect(child, out);
    };

    const highlight = (root, needle) => {
      const lower = needle.toLowerCase();
      const nodes = [];
      collect(root, nodes);
      for (const node of nodes) {
        const text = node.nodeValue;
        const hay = text.toLowerCase();
        let at = hay.indexOf(lower);
        if (at === -1) continue;
        const frag = document.createDocumentFragment();
        let cursor = 0;
        while (at !== -1) {
          if (at > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, at)));
          const mark = document.createElement("mark");
          mark.setAttribute(MARK, "1");
          mark.style.background = "#f5c45155";
          mark.style.color = "inherit";
          mark.style.borderRadius = "2px";
          mark.textContent = text.slice(at, at + lower.length);
          frag.appendChild(mark);
          hits.push(mark);
          cursor = at + lower.length;
          at = hay.indexOf(lower, cursor);
        }
        if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
        node.parentNode.replaceChild(frag, node);
      }
    };

    const show = (index) => {
      if (hits.length === 0) return;
      if (current >= 0 && current < hits.length) {
        hits[current].style.background = "#f5c45155";
        hits[current].style.color = "inherit";
      }
      current = ((index % hits.length) + hits.length) % hits.length;
      const mark = hits[current];
      mark.style.background = "#f5c451aa";
      mark.style.color = "#111";
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
      if (counter) counter.textContent = `${current + 1}/${hits.length}`;
    };

    const run = (query, jump, attempts) => {
      if (disposed) return;
      const needle = (query || "").trim();
      clearMarks();
      if (counter) counter.textContent = needle === "" ? "" : "0";
      if (needle === "") return;
      highlight(scope(), needle);
      if (counter) counter.textContent = hits.length === 0 ? "0" : `1/${hits.length}`;
      if (hits.length === 0) {
        if (attempts > 0) window.setTimeout(() => run(needle, jump, attempts - 1), 300);
        return;
      }
      show(jump === "last" ? hits.length - 1 : 0);
    };

    const hideWidgets = () => {
      if (box) box.style.display = "none";
      if (launcher) launcher.style.display = "none";
    };

    const applyFrame = (top, left, useSaved) => {
      if (launcher) {
        launcher.style.top = `${top}px`;
        launcher.style.left = `${left}px`;
        launcher.style.right = "auto";
        launcher.style.display = expanded ? "none" : "flex";
      }
      if (box) {
        box.style.top = `${top}px`;
        box.style.right = useSaved ? `${Math.max(12, window.innerWidth - left - 26)}px` : "12px";
        box.style.left = "auto";
        box.style.display = expanded ? "flex" : "none";
      }
    };

    const place = () => {
      if (disposed) return;
      const tabs = document.querySelector("[data-conversation-tabs]");
      if (!tabs) { hideWidgets(); return; }
      const rect = tabs.getBoundingClientRect();
      if (rect.width === 0) { hideWidgets(); return; }
      const saved = savedPosition();
      if (saved) {
        applyFrame(clamp(saved.top, 4, window.innerHeight - 32), clamp(saved.left, 4, window.innerWidth - 32), true);
        return;
      }
      const top = rect.bottom + 14;
      const corner = document.querySelector("[data-conversation-header-corner]");
      let left = Math.max(8, window.innerWidth - 38);
      if (corner) {
        const cRect = corner.getBoundingClientRect();
        if (cRect.width > 0) left = clamp(Math.round(cRect.left + cRect.width / 2 - 13), 4, window.innerWidth - 32);
      }
      applyFrame(top, left, false);
    };

    const expand = () => {
      expanded = true;
      place();
      if (input) { input.focus(); input.select(); }
    };

    const collapse = () => {
      expanded = false;
      if (input) input.value = "";
      if (counter) counter.textContent = "";
      clearMarks();
      place();
    };

    const makeButton = (label, title, onClick) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.title = title;
      btn.setAttribute(UI_ATTR, "1");
      btn.style.cssText = "border:1px solid #2c2e33;background:transparent;color:#f2f2f2;border-radius:6px;width:22px;height:22px;font-size:11px;padding:0;cursor:pointer";
      btn.addEventListener("click", onClick);
      return btn;
    };

    launcher = document.createElement("button");
    launcher.id = "spig-find-launcher";
    launcher.type = "button";
    launcher.title = "Find in session (drag to reposition)";
    launcher.setAttribute(UI_ATTR, "1");
    launcher.setAttribute("aria-label", "Find in session");
    launcher.style.cssText = "position:fixed;display:none;z-index:2147483000;width:26px;height:26px;align-items:center;justify-content:center;padding:0;cursor:pointer;border-radius:50%;background:#1b1c1f;border:1px solid #2c2e33;color:#b9bcc4;box-shadow:0 2px 8px rgba(0,0,0,.4);touch-action:none;user-select:none";
    launcher.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="7" cy="7" r="4.2"/><path d="M10.3 10.3L14 14"/></svg>';

    box = document.createElement("div");
    box.id = "spig-find-root";
    box.setAttribute(UI_ATTR, "1");
    box.style.cssText = "position:fixed;display:none;align-items:center;gap:6px;z-index:2147483000;padding:4px 8px;border-radius:8px;background:#1b1c1f;border:1px solid #2c2e33;box-shadow:0 2px 10px rgba(0,0,0,.45)";

    input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Find in session";
    input.setAttribute(UI_ATTR, "1");
    input.style.cssText = "width:140px;height:22px;font-size:12px;color:#f2f2f2;background:#151517;border:1px solid #2c2e33;border-radius:6px;padding:0 8px";
    input.addEventListener("input", () => run(input.value, "first", 0));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); run(input.value, "last", 0); }
      if (event.key === "Escape") { event.preventDefault(); collapse(); }
    });

    counter = document.createElement("span");
    counter.setAttribute(UI_ATTR, "1");
    counter.style.cssText = "font-size:11px;color:#8b8f98;min-width:34px;text-align:center";

    box.appendChild(input);
    box.appendChild(counter);
    box.appendChild(makeButton("↑", "Previous match", () => show(current - 1)));
    box.appendChild(makeButton("↓", "Next match", () => show(current + 1)));
    box.appendChild(makeButton("×", "Close find", collapse));

    launcher.addEventListener("pointerdown", (event) => {
      const rect = launcher.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
      try { launcher.setPointerCapture(event.pointerId); } catch {}
    });
    launcher.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 8) return;
      drag.moved = true;
      applyFrame(clamp(drag.top + dy, 4, window.innerHeight - 32), clamp(drag.left + dx, 4, window.innerWidth - 32), true);
    });
    launcher.addEventListener("pointerup", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      if (moved) {
        const rect = launcher.getBoundingClientRect();
        savePosition(Math.round(rect.top), Math.round(rect.left));
        place();
      } else {
        expand();
      }
    });
    launcher.addEventListener("pointercancel", () => { drag = null; });

    document.body.appendChild(box);
    document.body.appendChild(launcher);

    const onSidebarClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("[class*='searchTree'], [data-spig-fts-results]")) return;
      const field = document.querySelector("[class*='searchInput'], aside input[type='search']");
      const query = field && typeof field.value === "string" ? field.value.trim() : "";
      if (!query) return;
      window.setTimeout(() => {
        if (disposed) return;
        if (input) input.value = query;
        expand();
        run(query, "last", 12);
      }, 250);
    };

    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    document.addEventListener("click", onSidebarClick, true);
    const timer = window.setInterval(place, 800);
    place();

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
      document.removeEventListener("click", onSidebarClick, true);
      clearMarks();
      if (box && box.parentNode) box.parentNode.removeChild(box);
      if (launcher && launcher.parentNode) launcher.parentNode.removeChild(launcher);
    };
  }

  /* -------------------------------------------------------------------------- */
  /* Sidebar Enter-triggered FTS5 content search                                */
  /* -------------------------------------------------------------------------- */
  function installSidebarEnterSearch(ctx, t, getServices) {
    let panel = null;
    let pill = null;
    let debounceTimer = null;
    let abortCtrl = null;
    let disposed = false;
    // Active paged search: { query, items, seen, cursor, exhausted, via, shown, staleRestarts }
    let active = null;
    const PAGE = 10;
    const MAX_REFILL_FETCHES = 6;

    const isSearchField = (el) => {
      if (!(el instanceof HTMLInputElement)) return false;
      if (el.hasAttribute("data-sig-find-ui")) return false;
      const cls = typeof el.className === "string" ? el.className : "";
      if (cls.includes("searchInput")) return true;
      const ph = String(el.placeholder || "").toLowerCase();
      const inSidebar = Boolean(el.closest("aside, nav, [class*='sidebar'], [class*='workspace']"));
      if (!inSidebar) return false;
      return el.type === "search" || ph.includes("search") || ph.includes("buscar") || Boolean(el.closest("[class*='search']"));
    };

    const removeLoadingPill = () => {
      if (pill && pill.parentNode) pill.parentNode.removeChild(pill);
      pill = null;
    };

    const removePanel = () => {
      if (debounceTimer) { window.clearTimeout(debounceTimer); debounceTimer = null; }
      if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; }
      removeLoadingPill();
      active = null;
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      panel = null;
    };

    const ensurePanel = (field) => {
      if (panel && panel.isConnected) return panel;
      panel = document.createElement("div");
      panel.setAttribute("data-spig-fts-results", "1");
      panel.style.cssText = "position:fixed;z-index:2147482900;max-height:320px;overflow-y:auto;padding:6px;border-radius:10px;background:var(--dsh-surface-elevated, #1e2025);border:1px solid var(--dsh-border, rgba(148,163,184,0.28));box-shadow:0 8px 24px rgba(0,0,0,0.45);color:var(--dsh-text, #e6e7ea);font-size:12px;display:flex;flex-direction:column;gap:4px";
      const rect = field.getBoundingClientRect();
      panel.style.top = `${Math.round(rect.bottom + 6)}px`;
      panel.style.left = `${Math.max(8, Math.round(rect.left))}px`;
      panel.style.width = `${Math.max(240, Math.round(rect.width))}px`;
      document.body.appendChild(panel);
      return panel;
    };

    // Loading pill floats ABOVE the search field so it never covers the first result.
    const ensureLoadingPill = (field) => {
      removeLoadingPill();
      pill = document.createElement("div");
      pill.setAttribute("data-spig-fts-loading", "1");
      pill.style.cssText = "position:fixed;z-index:2147482901;padding:4px 10px;border-radius:8px;background:var(--dsh-surface-elevated, #1e2025);border:1px solid var(--dsh-border, rgba(148,163,184,0.28));box-shadow:0 4px 14px rgba(0,0,0,0.4);color:var(--dsh-text, #e6e7ea);font-size:11.5px;opacity:0.94;pointer-events:none;white-space:nowrap";
      pill.textContent = t("ftsSearching");
      const rect = field.getBoundingClientRect();
      pill.style.left = `${Math.max(8, Math.round(rect.left))}px`;
      pill.style.top = `${Math.max(8, Math.round(rect.top) - 34)}px`;
      document.body.appendChild(pill);
    };

    // Shell view filter (default/show/only), persisted by the shell's own view store.
    const readArchivedFilter = () => {
      try {
        if (typeof window === "undefined" || !window.localStorage) return "default";
        const raw = window.localStorage.getItem("dsh.workspace.view.v5");
        if (!raw) return "default";
        const parsed = JSON.parse(raw);
        const cand = parsed && typeof parsed === "object"
          ? (parsed.archivedFilter ?? parsed.state?.archivedFilter)
          : undefined;
        return cand === "show" || cand === "only" ? cand : "default";
      } catch {
        return "default";
      }
    };

    const getArchiveInfo = () => {
      const { sessions, workspaces } = getServices();
      let archivedIds = [];
      try {
        const snap = workspaces?.list?.getSnapshot?.();
        if (Array.isArray(snap?.archivedSessionIds)) archivedIds = snap.archivedSessionIds;
      } catch {}
      let byId = null;
      try {
        byId = sessions?.list?.getSnapshot?.()?.byId ?? null;
      } catch {}
      let currentId = null;
      try {
        if (byId) {
          for (const row of Object.values(byId)) {
            if ((row?.retainedBy?.mainView ?? 0) > 0) { currentId = row.id ?? null; break; }
          }
        }
      } catch {}
      return { archivedSet: new Set(archivedIds), filter: readArchivedFilter(), byId, currentId };
    };

    // Mirrors the shell's sessionVisible() plus the remote-search cwd rule
    // (content search only covers sessions that have a cwd).
    const isVisibleHit = (info, sid, cwd) => {
      if (!sid) return false;
      const summary = info.byId ? info.byId[sid] : null;
      if (summary) {
        if (summary.origin === "subagent") return false;
        if (summary.blank && summary.id !== info.currentId) return false;
      }
      if (cwd !== undefined && (cwd === null || cwd === "")) return false;
      if (info.filter === "only") return info.archivedSet.has(sid);
      if (info.filter === "show") return true;
      return !info.archivedSet.has(sid);
    };

    const fetchRpcPage = async (connection, query, cursor) => {
      const payload = { query, limit: PAGE, ...(cursor ? { cursor } : {}) };
      const res = await connection.rpc.call("/api", "spig-general.ftsSearch", payload);
      const data = res && typeof res === "object" && "ok" in res ? (res.ok ? res.value : null) : res;
      if (!data) {
        const code = res?.error?.code;
        const message = res?.error?.message || code || "search failed";
        const err = new Error(code ? `${code}: ${message}` : message);
        err.ftsCode = code || "";
        throw err;
      }
      return { items: Array.isArray(data.items) ? data.items : [], nextCursor: data.nextCursor ?? null };
    };

    const fetchLegacyPage = async (sessions, query, signal) => {
      if (!sessions || typeof sessions.search !== "function") {
        throw new Error("sessions.search is unavailable");
      }
      const res = await sessions.search(query, signal);
      const data = res && typeof res === "object" && "ok" in res ? (res.ok ? res.value : null) : res;
      if (!data) {
        const code = res?.error?.code;
        const message = res?.error?.message || code || "search failed";
        const err = new Error(code ? `${code}: ${message}` : message);
        err.ftsCode = code || "";
        throw err;
      }
      return {
        items: Array.isArray(data.items) ? data.items : [],
        nextCursor: null,
        legacyHasMore: Boolean(data.hasMore ?? data.nextCursor),
      };
    };
    // { header: { id, createdAt, cwd, ... }, live, persisted,
    //   bestMatch: { sessionId, seq, type, time, surface, snippet } }
    const hitSessionId = (item) => item?.bestMatch?.sessionId || item?.header?.id || item?.sessionId || item?.id || null;
    const hitSnippet = (item) => {
      const raw = String(item?.bestMatch?.snippet || item?.snippet || "");
      return Array.from(raw).slice(0, 240).join("");
    };

    const resolveSessionTitle = (sessions, sid, item) => {
      try {
        const byId = sessions?.list?.getSnapshot?.()?.byId;
        const row = byId && sid ? byId[sid] : null;
        const candidate = row?.title || row?.sessionTitle || row?.name || row?.header?.title;
        if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
        const proj = row?.projection?.title || row?.projection?.sessionTitle;
        if (typeof proj === "string" && proj.trim()) return proj.trim();
      } catch {}
      const cwd = item?.header?.cwd || "";
      const base = String(cwd).split(/[/\\]/).filter(Boolean).pop();
      if (base) return `${base} · ${String(sid || "").slice(0, 8)}`;
      return sid ? `Session ${String(sid).slice(0, 8)}` : t("ftsUntitled");
    };

    const renderActive = (hostPanel) => {
      const { sessions } = getServices();
      const items = active ? active.items : [];
      const shown = active ? Math.min(active.shown, items.length) : 0;
      hostPanel.innerHTML = "";
      if (shown === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "padding:8px;opacity:0.7";
        empty.textContent = t("ftsNoResults");
        hostPanel.appendChild(empty);
        return;
      }
      for (const item of items.slice(0, shown)) {
        const sid = hitSessionId(item);
        const row = document.createElement("button");
        row.type = "button";
        row.style.cssText = "text-align:left;padding:6px 8px;border-radius:6px;border:none;background:transparent;color:inherit;cursor:pointer;display:flex;flex-direction:column;gap:2px";
        row.addEventListener("mouseenter", () => { row.style.background = "rgba(148,163,184,0.14)"; });
        row.addEventListener("mouseleave", () => { row.style.background = "transparent"; });
        const title = document.createElement("div");
        title.style.cssText = "font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
        title.textContent = resolveSessionTitle(sessions, sid, item);
        const snippet = document.createElement("div");
        snippet.style.cssText = "font-size:11px;opacity:0.78;line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden";
        snippet.textContent = hitSnippet(item);
        row.appendChild(title);
        if (snippet.textContent) row.appendChild(snippet);
        row.addEventListener("click", () => {
          removePanel();
          const { uiWorkspace } = getServices();
          if (uiWorkspace && typeof uiWorkspace.openSession === "function" && sid) {
            uiWorkspace.openSession({ sessionId: sid });
          }
        });
        hostPanel.appendChild(row);
      }
      const footer = document.createElement("div");
      footer.style.cssText = "display:flex;align-items:center;gap:8px;padding:4px 8px;font-size:11px;opacity:0.9";
      const counter = document.createElement("span");
      counter.style.cssText = "opacity:0.65";
      counter.textContent = t("ftsShowing").replace("{n}", String(shown));
      footer.appendChild(counter);
      if (active && !active.exhausted) {
        const moreBtn = document.createElement("button");
        moreBtn.type = "button";
        moreBtn.style.cssText = "margin-left:auto;padding:3px 10px;border-radius:6px;border:1px solid var(--dsh-border, rgba(148,163,184,0.3));background:transparent;color:inherit;font-size:11px;cursor:pointer";
        moreBtn.textContent = active.loadingMore ? "…" : t("ftsShowMore");
        moreBtn.disabled = active.loadingMore;
        moreBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          void showMore(active.query);
        });
        footer.appendChild(moreBtn);
      } else if (active && active.via === "legacy" && active.legacyHasMore) {
        const more = document.createElement("span");
        more.style.cssText = "opacity:0.65;text-align:center";
        more.textContent = t("ftsHasMore").replace("{n}", String(items.length));
        footer.appendChild(more);
      }
      if (active && active.moreError) {
        const errLine = document.createElement("span");
        errLine.style.cssText = "color:#f87171;opacity:1";
        errLine.textContent = active.moreError;
        footer.appendChild(errLine);
      }
      hostPanel.appendChild(footer);
    };

    const renderSearchError = (hostPanel, message) => {
      hostPanel.innerHTML = "";
      const err = document.createElement("div");
      err.style.cssText = "padding:8px;color:#f87171;line-height:1.4";
      const disabled = /SEARCH_DISABLED|search is disabled/i.test(String(message || ""));
      err.textContent = disabled ? t("ftsDisabled") : `${t("ftsError")}: ${message || "?"}`;
      hostPanel.appendChild(err);
    };

    const appendPageItems = (pageItems, info) => {
      let added = 0;
      for (const item of pageItems) {
        const sid = item?.sessionId ?? hitSessionId(item);
        if (!sid || active.seen.has(sid)) continue;
        active.seen.add(sid);
        if (!isVisibleHit(info, sid, item?.cwd)) continue;
        active.items.push(item);
        added += 1;
      }
      return added;
    };

    const loadNextRpcPage = async (query, info) => {
      const { connection } = getServices();
      try {
        const page = await fetchRpcPage(connection, query, active.cursor);
        active.cursor = page.nextCursor;
        if (!page.nextCursor) active.exhausted = true;
        appendPageItems(page.items, info);
      } catch (err) {
        // The index generation moved under our cursor (live sessions keep
        // writing); restart once from the first page instead of erroring.
        if (/STALE_CURSOR/i.test(err?.message || "") && active.staleRestarts < 1) {
          active.staleRestarts += 1;
          active.cursor = null;
          active.items = [];
          active.seen = new Set();
          const page = await fetchRpcPage(getServices().connection, query, null);
          active.cursor = page.nextCursor;
          if (!page.nextCursor) active.exhausted = true;
          appendPageItems(page.items, info);
          return;
        }
        throw err;
      }
    };

    // Keep fetching (rpc path only) until `minVisible` visible hits or exhaustion.
    const fillToVisible = async (query, info, minVisible) => {
      let fetches = 0;
      while (active && !active.exhausted && active.items.length < minVisible && fetches < MAX_REFILL_FETCHES) {
        fetches += 1;
        await loadNextRpcPage(query, info);
      }
    };

    const showMore = async (query) => {
      if (!active || active.loadingMore || active.exhausted || !panel || !panel.isConnected) return;
      const hostPanel = panel;
      active.loadingMore = true;
      active.moreError = null;
      renderActive(hostPanel);
      try {
        if (disposed || !active) return;
        const token = active.token;
        const isLive = () => !disposed && active && active.token === token;
        const info = getArchiveInfo();
        const target = active.shown + PAGE;
        let fetches = 0;
        while (isLive() && !active.exhausted && active.items.length < target && fetches < MAX_REFILL_FETCHES) {
          fetches += 1;
          await loadNextRpcPage(query, info);
        }
        if (!isLive()) return;
        active.shown = active.exhausted ? active.items.length : Math.min(target, active.items.length);
        active.loadingMore = false;
        renderActive(hostPanel);
      } catch (err) {
        if (disposed || !active) return;
        if (err && err.name === "AbortError") {
          active.loadingMore = false;
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        active.moreError = message;
        active.loadingMore = false;
        renderActive(hostPanel);
      }
    };

    const runSearch = async (field, query, token) => {
      const isLive = () => !disposed && active && active.token === token;
      const info = getArchiveInfo();
      active = {
        query, items: [], seen: new Set(), cursor: null,
        exhausted: false, via: "rpc", shown: 0,
        staleRestarts: 0, loadingMore: false, legacyHasMore: false, token,
      };
      ensureLoadingPill(field);
      try {
        const { sessions } = getServices();
        let useLegacy = false;
        try {
          await loadNextRpcPage(query, info);
        } catch (err) {
          if (/SEARCH_DISABLED|search is disabled/i.test(err?.message || "")) throw err;
          if (err?.ftsCode === "general/unavailable" || /unavailable|not found|no route|404/i.test(err?.message || "")) {
            useLegacy = true;
          } else {
            throw err;
          }
        }
        if (!isLive()) return;
        if (useLegacy) {
          active.via = "legacy";
          abortCtrl = new AbortController();
          const page = await fetchLegacyPage(sessions, query, abortCtrl.signal);
          if (!isLive()) return;
          active.exhausted = true;
          active.legacyHasMore = page.legacyHasMore;
          appendPageItems(page.items, info);
          active.shown = active.items.length;
        } else {
          await fillToVisible(query, info, PAGE);
          if (!isLive()) return;
          active.shown = active.exhausted ? active.items.length : Math.min(PAGE, active.items.length);
        }
        if (!isLive()) return;
        removeLoadingPill();
        const hostPanel = ensurePanel(field);
        renderActive(hostPanel);
      } catch (err) {
        if (!isLive()) return;
        removeLoadingPill();
        if (err && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : String(err);
        const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
        const hostPanel = ensurePanel(field);
        renderSearchError(hostPanel, code ? `${code}: ${message}` : message);
      }
    };

    const onKeyDown = (event) => {
      if (!isSearchField(event.target)) return;
      if (event.key === "Escape") {
        removePanel();
        return;
      }
      if (event.key !== "Enter") return;
      const field = event.target;
      const query = field.value.trim();
      if (!query) { removePanel(); return; }
      event.preventDefault();
      if (debounceTimer) window.clearTimeout(debounceTimer);
      if (abortCtrl) abortCtrl.abort();
      removeLoadingPill();
      ensureLoadingPill(field);
      // Fire immediately: no debounce on Enter. The host index may still be
      // cold on the very first search; warmupFts() pre-opens it at page load.
      void runSearch(field, query, {});
    };

    const onInput = (event) => {
      if (!isSearchField(event.target)) return;
      // Typing returns to local title filtering only.
      removePanel();
    };

    const onOutsideClick = (event) => {
      if (!panel) return;
      if (event.target instanceof Node && (panel.contains(event.target) || isSearchField(event.target))) return;
      removePanel();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("pointerdown", onOutsideClick, true);

    return () => {
      disposed = true;
      removePanel();
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("pointerdown", onOutsideClick, true);
    };
  }

  /* -------------------------------------------------------------------------- */
  /* Settings Gear (single settings.launcher slot contribution)               */
  /* -------------------------------------------------------------------------- */
  // Rendered only while the gear toggle is on, inside a dedicated Cordis fork
  // on the single `settings.launcher` slot. `wide` and `openSettings` come
  // from the slot host; disposing the fork restores the native launcher.
  function GearLauncher({ openSettings, wide, t }) {
    return h(
      "div",
      {
        "data-spig-gear-launcher": "1",
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: wide === false ? "center" : "space-between",
          width: "100%",
          minHeight: "36px",
          padding: wide === false ? "0" : "0 4px",
          boxSizing: "border-box",
          gap: "8px",
        },
      },
      wide !== false && h("span", { style: { flex: 1 } }),
      h(
        "button",
        {
          type: "button",
          "data-spig-gear-btn": "1",
          title: t("settingsLabel"),
          "aria-label": t("settingsLabel"),
          onClick: () => typeof openSettings === "function" && openSettings(),
          style: {
            flex: "0 0 auto",
            width: "36px",
            height: "36px",
            padding: 0,
            borderRadius: "8px",
            border: "none",
            background: "transparent",
            color: "var(--dsh-text, #e6e7ea)",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            marginLeft: wide === false ? "0" : "auto",
          },
        },
        h(
          "svg",
          { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
          h("path", { d: GEAR_ICON }),
        ),
      ),
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Compaction Model Picker (reuses subscriptions RPC + general fallback)      */
  /* -------------------------------------------------------------------------- */
  function CompactionSection({ connection, t }) {
    const [view, setView] = useState(undefined);
    const [error, setError] = useState(undefined);
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [provider, setProvider] = useState("");
    const [model, setModel] = useState("");
    const [scope, setScope] = useState("all");
    const [effort, setEffort] = useState("default");

    const callCompaction = useCallback(async (action, payload) => {
      // Prefer subscriptions.auth when active so both share the exact same in-memory store.
      const subMethod = action === "get" ? "compactionModel" : "setCompactionModel";
      try {
        const subRes = await connection.rpc.call("/api", `subscriptions.${subMethod}`, payload ?? {});
        if (subRes && subRes.ok) return subRes.value;
      } catch {}
      const genMethod = action === "get" ? "spig-general.compactionGet" : "spig-general.compactionSet";
      const genRes = await connection.rpc.call("/api", genMethod, payload ?? {});
      if (genRes && genRes.ok) return genRes.value;
      throw new Error(genRes?.error?.message ?? "Failed to access compaction model");
    }, [connection]);

    useEffect(() => {
      let alive = true;
      callCompaction("get", {}).then((next) => {
        if (!alive) return;
        setView(next);
        setError(undefined);
      }).catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      });
      return () => { alive = false; };
    }, [callCompaction]);

    const providers = view?.providers ?? [];
    const current = view?.current ?? null;
    const providerName = (id) => providers.find((p) => p.id === id)?.name ?? id;
    const modelName = (pid, mid) => providers.find((p) => p.id === pid)?.models?.find((m) => m.id === mid)?.name ?? mid;
    const scopeLabel = (val) => t(val === "antigravity" ? "compactionScopeAntigravity" : "compactionScopeAll");
    const models = providers.find((p) => p.id === provider)?.models ?? [];
    const efforts = (view?.efforts ?? ["default"]).filter((id) => id !== "default");

    const openEditor = () => {
      setProvider(current?.provider ?? "");
      setModel(current?.model ?? "");
      setScope(current?.scope ?? "all");
      setEffort(current?.effort ?? "default");
      setError(undefined);
      setEditing(true);
    };

    const save = async (value) => {
      setBusy(true);
      try {
        const next = await callCompaction("set", { value });
        setView(next);
        setError(undefined);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    };

    const statusText = view === undefined
      ? t("compactionLoading")
      : current === null
        ? t("compactionStatusDefault")
        : t("compactionStatusChosen")
          .replace("{provider}", providerName(current.provider))
          .replace("{model}", modelName(current.provider, current.model))
          .replace("{scope}", scopeLabel(current.scope));

    const selectStyle = {
      padding: "6px 8px",
      borderRadius: "6px",
      border: "1px solid var(--dsh-border, rgba(148,163,184,0.3))",
      background: "var(--dsh-surface, rgba(15,23,42,0.06))",
      color: "inherit",
      fontSize: "13px",
    };

    return h(
      "div",
      {
        "data-spig-general-compaction": "1",
        style: {
          padding: "14px 16px",
          borderRadius: "10px",
          border: "1px solid var(--dsh-border, rgba(148,163,184,0.22))",
          background: "var(--dsh-surface, rgba(15,23,42,0.04))",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        },
      },
      h(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" } },
        h(
          "div",
          null,
          h("strong", { style: { fontSize: "14px" } }, t("compactionTitle")),
          h("div", { style: { fontSize: "12px", opacity: 0.78, marginTop: "2px" } }, statusText),
        ),
        !editing && h(
          "button",
          {
            type: "button",
            onClick: openEditor,
            style: {
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid var(--dsh-border, rgba(148,163,184,0.3))",
              background: "transparent",
              color: "inherit",
              fontSize: "12px",
              cursor: "pointer",
            },
          },
          t("compactionConfigure"),
        ),
      ),
      h("p", { style: { margin: 0, fontSize: "12px", opacity: 0.75, lineHeight: 1.45 } }, t("compactionHint")),
      error && h("div", { style: { fontSize: "12px", color: "#ef4444" } }, error),
      editing && h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" } },
        h(
          "div",
          { style: { display: "flex", flexWrap: "wrap", gap: "10px" } },
          h(
            "label",
            { style: { display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 180px" } },
            h("span", { style: { fontSize: "12px", opacity: 0.8 } }, t("compactionProvider")),
            h(
              "select",
              {
                value: provider,
                onChange: (e) => { setProvider(e.target.value); setModel(""); },
                style: selectStyle,
              },
              h("option", { value: "" }, t("compactionChoose")),
              providers.map((p) => h("option", { key: p.id, value: p.id }, p.name || p.id)),
            ),
          ),
          h(
            "label",
            { style: { display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 180px" } },
            h("span", { style: { fontSize: "12px", opacity: 0.8 } }, t("compactionModel")),
            h(
              "select",
              {
                value: model,
                onChange: (e) => setModel(e.target.value),
                style: selectStyle,
              },
              h("option", { value: "" }, t("compactionChoose")),
              models.map((m) => h("option", { key: m.id, value: m.id }, m.name || m.id)),
            ),
          ),
          h(
            "label",
            { style: { display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 160px" } },
            h("span", { style: { fontSize: "12px", opacity: 0.8 } }, t("compactionEffort")),
            h(
              "select",
              {
                value: effort,
                onChange: (e) => setEffort(e.target.value),
                style: selectStyle,
              },
              h("option", { value: "default" }, t("compactionEffortDefault")),
              efforts.map((ef) => h("option", { key: ef, value: ef }, ef)),
            ),
          ),
          h(
            "label",
            { style: { display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 180px" } },
            h("span", { style: { fontSize: "12px", opacity: 0.8 } }, t("compactionScope")),
            h(
              "select",
              {
                value: scope,
                onChange: (e) => setScope(e.target.value),
                style: selectStyle,
              },
              h("option", { value: "all" }, t("compactionScopeAll")),
              h("option", { value: "antigravity" }, t("compactionScopeAntigravity")),
            ),
          ),
        ),
        h(
          "div",
          { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
          h(
            "button",
            {
              type: "button",
              disabled: busy || !provider || !model,
              onClick: () => save({ provider, model, scope, effort }),
              style: {
                padding: "6px 12px",
                borderRadius: "8px",
                border: "none",
                background: "var(--dsh-accent, #38bdf8)",
                color: "#0f172a",
                fontWeight: 600,
                fontSize: "12px",
                cursor: busy || !provider || !model ? "not-allowed" : "pointer",
                opacity: busy || !provider || !model ? 0.6 : 1,
              },
            },
            busy ? t("compactionSaving") : t("compactionSave"),
          ),
          h(
            "button",
            {
              type: "button",
              disabled: busy,
              onClick: () => save(null),
              style: {
                padding: "6px 12px",
                borderRadius: "8px",
                border: "1px solid var(--dsh-border, rgba(148,163,184,0.3))",
                background: "transparent",
                color: "inherit",
                fontSize: "12px",
                cursor: "pointer",
              },
            },
            t("compactionDefault"),
          ),
          h(
            "button",
            {
              type: "button",
              disabled: busy,
              onClick: () => setEditing(false),
              style: {
                padding: "6px 12px",
                borderRadius: "8px",
                border: "1px solid var(--dsh-border, rgba(148,163,184,0.3))",
                background: "transparent",
                color: "inherit",
                fontSize: "12px",
                cursor: "pointer",
              },
            },
            t("compactionCancel"),
          ),
        ),
      ),
    );
  }

  /* -------------------------------------------------------------------------- */
  /* General Configs Settings Page                                              */
  /* -------------------------------------------------------------------------- */
  function GeneralConfigsPage({ controller, connection, t }) {
    const [settings, setSettings] = useState(controller.getSettings());
    const [busyKey, setBusyKey] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
      const unsub = controller.subscribe((next) => setSettings(next));
      controller.refresh().catch((err) => setError(err instanceof Error ? err.message : String(err)));
      return unsub;
    }, [controller]);

    const toggleSidebarBottom = async (key, nextVal) => {
      setBusyKey(key);
      setError(null);
      try {
        await controller.update({ sidebarBottom: { [key]: nextVal } });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyKey(null);
      }
    };

    const cardStyle = {
      padding: "14px 16px",
      borderRadius: "10px",
      border: "1px solid var(--dsh-border, rgba(148,163,184,0.22))",
      background: "var(--dsh-surface, rgba(15,23,42,0.04))",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
    };

    const rowStyle = {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "12px",
    };

    const sb = settings.sidebarBottom || {};

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
            onClick: () => { controller.refresh().catch(() => {}); },
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
      // Section 1: Sidebar Bottom
      h(
        "div",
        { style: cardStyle },
        h(
          "div",
          null,
          h("strong", { style: { fontSize: "14px" } }, t("sidebarBottomTitle")),
          h("p", { style: { margin: "2px 0 0 0", fontSize: "12px", opacity: 0.75 } }, t("sidebarBottomHint")),
        ),
        h(
          "div",
          { style: rowStyle },
          h(
            "div",
            null,
            h("div", { style: { fontSize: "13px", fontWeight: 500 } }, t("sessionSearchLabel")),
            h("div", { style: { fontSize: "12px", opacity: 0.72 } }, t("sessionSearchHint")),
          ),
          h(ToggleSwitch, {
            checked: Boolean(sb.sessionSearch),
            disabled: busyKey === "sessionSearch",
            label: t("sessionSearchLabel"),
            onChange: (next) => toggleSidebarBottom("sessionSearch", next),
          }),
        ),
        h(
          "div",
          { style: rowStyle },
          h(
            "div",
            null,
            h("div", { style: { fontSize: "13px", fontWeight: 500 } }, t("settingsGearLabel")),
            h("div", { style: { fontSize: "12px", opacity: 0.72 } }, t("settingsGearHint")),
          ),
          h(ToggleSwitch, {
            checked: Boolean(sb.settingsGear),
            disabled: busyKey === "settingsGear",
            label: t("settingsGearLabel"),
            onChange: (next) => toggleSidebarBottom("settingsGear", next),
          }),
        ),
      ),
      // Section 2: Context / Compaction
      h(CompactionSection, { connection, t }),
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Controller & dynamic feature effects                                       */
  /* -------------------------------------------------------------------------- */
  function createGeneralConfigsController(ctx, connection, t) {
    let settings = { sidebarBottom: { sessionSearch: false, settingsGear: false } };
    const listeners = new Set();
    let disposeSearch = null;
    let gearFork = null;
    let sessionsSvc = null;
    let uiWorkspaceSvc = null;
    let workspacesSvc = null;

    // Capture optional client services via Cordis inject without blocking apply()
    ctx.inject(["sessions"], (sCtx) => {
      sessionsSvc = sCtx.get("sessions");
      sCtx.effect(() => () => { sessionsSvc = null; });
    });
    ctx.inject(["uiWorkspace"], (wCtx) => {
      uiWorkspaceSvc = wCtx.get("uiWorkspace");
      wCtx.effect(() => () => { uiWorkspaceSvc = null; });
    });
    ctx.inject(["workspaces"], (wsCtx) => {
      workspacesSvc = wsCtx.get("workspaces");
      wsCtx.effect(() => () => { workspacesSvc = null; });
    });

    const getServices = () => ({
      sessions: sessionsSvc ?? ctx.get?.("sessions") ?? ctx.root?.get?.("sessions"),
      uiWorkspace: uiWorkspaceSvc ?? ctx.get?.("uiWorkspace") ?? ctx.root?.get?.("uiWorkspace"),
      workspaces: workspacesSvc ?? ctx.get?.("workspaces") ?? ctx.root?.get?.("workspaces"),
      connection,
    });

    const notify = () => {
      for (const fn of listeners) fn(settings);
    };

    // Settings gear: single `settings.launcher` slot contribution in its own
    // Cordis fork. Registered only while the toggle is on; disposing the fork
    // restores the native launcher. Never mount null: an empty registration
    // would occupy the single slot.
    const syncGearFork = (enabled) => {
      if (enabled && !gearFork) {
        try {
          gearFork = ctx.plugin({
            name: "spig-dsh-toolkit:client:settings-gear",
            inject: ["slots"],
            apply: (slotCtx) => {
              slotCtx.slots.inject("settings.launcher", () => slotCtx.slots.register({
                name: "settings.launcher",
                id: "spig-toolkit-gear",
                order: -100,
                inject: () => ({ t }),
              }, GearLauncher));
            },
          });
        } catch (err) {
          console.warn("[spig-dsh-toolkit:general-configs] failed to mount settings gear", err);
          gearFork = null;
        }
      } else if (!enabled && gearFork) {
        const fork = gearFork;
        gearFork = null;
        try { fork.dispose?.(); } catch {}
      }
    };

    const syncEffects = (next) => {
      const sb = next.sidebarBottom || {};

      // 1. Session Search (in-session loupe + Enter FTS5)
      if (sb.sessionSearch && !disposeSearch) {
        const stopFind = installInSessionFind();
        const stopEnter = installSidebarEnterSearch(ctx, t, getServices);
        disposeSearch = () => {
          try { stopFind(); } catch {}
          try { stopEnter(); } catch {}
        };
      } else if (!sb.sessionSearch && disposeSearch) {
        const fn = disposeSearch;
        disposeSearch = null;
        fn();
      }

      // 2. Settings gear — single-slot fork, on/off with the toggle
      syncGearFork(sb.settingsGear === true);
    };

    // Pre-open the FTS index in the background once per page load, so the
    // first Enter already searches all sessions instead of racing index build.
    let warmedUp = false;
    const warmupFts = () => {
      if (warmedUp) return;
      if (!settings.sidebarBottom || settings.sidebarBottom.sessionSearch !== true) return;
      warmedUp = true;
      const q = `__spig_fts_warmup_${Date.now().toString(36)}__`;
      void (async () => {
        try {
          const res = await connection.rpc.call("/api", "spig-general.ftsSearch", { query: q, limit: 1 });
          if (res && res.ok) return;
        } catch {}
        try {
          const { sessions } = getServices();
          if (sessions && typeof sessions.search === "function") {
            const ctrl = new AbortController();
            const timer = window.setTimeout(() => ctrl.abort(), 20000);
            try {
              await sessions.search(q, ctrl.signal);
            } catch {} finally {
              window.clearTimeout(timer);
            }
          }
        } catch {}
      })();
    };

    const refresh = async () => {
      const res = await connection.rpc.call("/api", "spig-general.get", {});
      if (res && res.ok && res.value?.settings) {
        settings = res.value.settings;
        syncEffects(settings);
        notify();
        warmupFts();
      }
      return settings;
    };

    const update = async (patch) => {
      const res = await connection.rpc.call("/api", "spig-general.update", patch);
      if (!res || !res.ok) throw new Error(res?.error?.message ?? "Failed to update general configs");
      if (res.value?.settings) {
        settings = res.value.settings;
        syncEffects(settings);
        notify();
        warmupFts();
      }
      return settings;
    };

    const dispose = () => {
      if (disposeSearch) { disposeSearch(); disposeSearch = null; }
      if (gearFork) { const fork = gearFork; gearFork = null; try { fork.dispose?.(); } catch {} }
    };

    return {
      getSettings: () => settings,
      subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
      refresh,
      update,
      dispose,
    };
  }

  function mountInToolkit(ctx, connection) {
    ctx.effect(() => ctx.locale.register(NS, LOCALES), "spig-dsh-toolkit:general-configs locales");
    const t = ctx.locale.bind(NS);
    const controller = createGeneralConfigsController(ctx, connection, t);

    ctx.effect(() => () => controller.dispose(), "spig-dsh-toolkit:general-configs effects");

    ctx.slots.inject("settings.section", () => ctx.slots.register({
      name: "settings.section",
      id: "spig-toolkit",
      order: 85,
      label: () => t("nav"),
      inject: () => ({ controller, connection, t }),
    }, GeneralConfigsPage));

    controller.refresh().catch((err) => {
      console.warn("[spig-dsh-toolkit:general-configs] initial load failed:", err);
    });
    return controller;
  }

  return {
    name: "spig-dsh-toolkit:client:general-configs",
    inject: ["slots", "connection", "locale"],
    mountInToolkit,
    apply(ctx) {
      mountInToolkit(ctx, ctx.get("connection"));
    },
  };
}
