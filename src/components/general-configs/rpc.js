/**
 * Host RPC routes for `spig-dsh-toolkit:general-configs` under `/api/spig-general.<endpoint>`.
 */
export const GENERAL_RPC_PREFIX = "spig-general.";
export const GENERAL_RPC_ENDPOINTS = [
  "get",
  "update",
  "compactionGet",
  "compactionSet",
  "ftsSearch",
];

// Same event scope the shell's own session search uses
// (ClientSessions.search: only message content on the current surface).
const FTS_EVENT_FILTERS = [
  { kind: "type", values: ["user/message", "assistant/message"] },
  { kind: "surface", values: ["current"] },
];
const FTS_DEFAULT_LIMIT = 10;
const FTS_MAX_LIMIT = 100;

function readEnvelope(body) {
  if (typeof body !== "object" || body === null) return undefined;
  if (body.type !== "client-request" || typeof body.rpcId !== "string" || typeof body.method !== "string") {
    return undefined;
  }
  return { type: "client-request", rpcId: body.rpcId, method: body.method, payload: body.payload };
}

function serverResponse(rpcId, result) {
  return Response.json({ type: "server-response", rpcId, result });
}

export async function dispatchGeneralRpc(deps, endpoint, payload) {
  try {
    switch (endpoint) {
      case "get": {
        return {
          ok: true,
          value: {
            settings: deps.store.snapshot(),
          },
        };
      }
      case "update": {
        const settings = await deps.store.update(payload);
        return { ok: true, value: { settings } };
      }
      case "compactionGet": {
        const view = await deps.compaction.getView();
        return { ok: true, value: view };
      }
      case "compactionSet": {
        const value = payload && typeof payload === "object" && "value" in payload ? payload.value : null;
        const view = await deps.compaction.set(value);
        return { ok: true, value: view };
      }
      case "ftsSearch": {
        const q = payload && typeof payload === "object" ? payload : {};
        const query = typeof q.query === "string" ? q.query : "";
        if (!query.trim()) {
          return {
            ok: false,
            error: { code: "general/bad-request", message: "ftsSearch requires { query: string }" },
          };
        }
        let limit = q.limit === undefined ? FTS_DEFAULT_LIMIT : q.limit;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > FTS_MAX_LIMIT) {
          return {
            ok: false,
            error: { code: "general/bad-request", message: `ftsSearch limit must be an integer between 1 and ${FTS_MAX_LIMIT}` },
          };
        }
        const cursor = typeof q.cursor === "string" && q.cursor ? q.cursor : undefined;
        let sessionQuery;
        try {
          sessionQuery = deps.sessionQuery?.();
        } catch {
          sessionQuery = undefined;
        }
        if (!sessionQuery || typeof sessionQuery.searchSessions !== "function") {
          return {
            ok: false,
            error: { code: "general/unavailable", message: "session full-text search is unavailable in this host" },
          };
        }
        const page = await sessionQuery.searchSessions({
          query,
          limit,
          ...(cursor === undefined ? {} : { cursor }),
          eventFilters: FTS_EVENT_FILTERS,
        });
        return {
          ok: true,
          value: {
            items: (page?.items ?? []).map((hit) => ({
              sessionId: hit?.header?.id ?? hit?.bestMatch?.sessionId ?? null,
              snippet: String(hit?.bestMatch?.snippet ?? ""),
              cwd: hit?.header?.cwd ?? null,
            })),
            nextCursor: page?.nextCursor ?? null,
          },
        };
      }
      default:
        return {
          ok: false,
          error: { code: "general/not-found", message: `unknown endpoint "${endpoint}"` },
        };
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "general/error",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function fetchRouteFor(endpoint, deps) {
  const method = `${GENERAL_RPC_PREFIX}${endpoint}`;
  return {
    path: `/api/${method}`,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
        return new Response("content type must be application/json", { status: 415 });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("body is not JSON", { status: 400 });
      }
      const envelope = readEnvelope(body);
      if (envelope === undefined) {
        const rawId = body?.rpcId;
        return serverResponse(typeof rawId === "string" ? rawId : "invalid-request", {
          ok: false,
          error: { code: "gateway/bad-request", message: "invalid client-request message", details: { issues: [] } },
        });
      }
      if (envelope.method !== method) {
        return serverResponse(envelope.rpcId, {
          ok: false,
          error: { code: "gateway/bad-request", message: `expected method ${method}, got ${envelope.method}` },
        });
      }
      const result = await dispatchGeneralRpc(deps, endpoint, envelope.payload);
      return serverResponse(envelope.rpcId, result);
    },
  };
}

export function registerGeneralRpc(ctx, deps) {
  ctx.inject(["connection"], (connCtx) => {
    const connection = connCtx.get("connection");
    const register = connection?.fetch?.register;
    if (typeof register !== "function") return;
    for (const endpoint of GENERAL_RPC_ENDPOINTS) {
      connCtx.effect(
        () => register(fetchRouteFor(endpoint, deps)),
        `spig-dsh-toolkit: /api/${GENERAL_RPC_PREFIX}${endpoint} route`,
      );
    }
  });
}
