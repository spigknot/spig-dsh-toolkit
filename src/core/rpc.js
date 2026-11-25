/**
 * Host RPC routes for `spig-dsh-toolkit` under `/api/spig-toolkit.<endpoint>`.
 * Uses the exact same Fetch route envelope as DSH's `/api` channel so the
 * browser client can call `rpc.call('/api', 'spig-toolkit.status', {})` and
 * `rpc.call('/api', 'spig-toolkit.setComponent', { id, enabled })`.
 */
export const TOOLKIT_RPC_PREFIX = "spig-toolkit.";
export const TOOLKIT_RPC_ENDPOINTS = ["status", "setComponent"];

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

export async function dispatchToolkitRpc(manager, endpoint, payload) {
  try {
    switch (endpoint) {
      case "status":
        return { ok: true, value: manager.status() };
      case "setComponent": {
        if (!payload || typeof payload !== "object" || typeof payload.id !== "string" || typeof payload.enabled !== "boolean") {
          return {
            ok: false,
            error: { code: "toolkit/bad-request", message: "setComponent requires { id: string, enabled: boolean }" },
          };
        }
        const updated = await manager.setEnabled(payload.id, payload.enabled);
        return { ok: true, value: { component: updated, status: manager.status() } };
      }
      default:
        return {
          ok: false,
          error: { code: "toolkit/not-found", message: `unknown endpoint "${endpoint}"` },
        };
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "toolkit/error",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function fetchRouteFor(endpoint, manager) {
  const method = `${TOOLKIT_RPC_PREFIX}${endpoint}`;
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
      const result = await dispatchToolkitRpc(manager, endpoint, envelope.payload);
      return serverResponse(envelope.rpcId, result);
    },
  };
}

export function registerToolkitRpc(ctx, manager) {
  ctx.inject(["connection"], (connCtx) => {
    const connection = connCtx.get("connection");
    const register = connection?.fetch?.register;
    if (typeof register !== "function") return;
    for (const endpoint of TOOLKIT_RPC_ENDPOINTS) {
      connCtx.effect(
        () => register(fetchRouteFor(endpoint, manager)),
        `spig-dsh-toolkit: /api/${TOOLKIT_RPC_PREFIX}${endpoint} route`,
      );
    }
  });
}
