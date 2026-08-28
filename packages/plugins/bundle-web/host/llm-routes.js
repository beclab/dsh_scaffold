import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import { readBody, sendError, sendJson } from "./http.js";

export const name = "scaffold-llm-routes";
export const inject = ["webServer"];

const DROPPED_REQ = new Set([
  "authorization",
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "x-olares-app-id",
  "x-caller-appid",
]);

const DROPPED_RES = new Set(["connection", "content-encoding", "content-length", "transfer-encoding"]);

function routerAuthHeaders(apiKey, olaresAppId) {
  if (apiKey) return { authorization: `Bearer ${apiKey}` };
  return { "x-caller-appid": olaresAppId };
}

function defaultGatewayUrl() {
  return (process.env.LLM_GATEWAY_URL ?? "http://router-svc.router-shared/v1").replace(/\/+$/, "");
}

function loadRoutes() {
  const raw = process.env.LLM_MODEL_ROUTES?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function upstreamList() {
  const seen = new Set();
  const out = [];
  const raw = process.env.LLM_UPSTREAMS ?? defaultGatewayUrl();
  for (const part of raw.split(",")) {
    const url = part.trim().replace(/\/+$/, "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out.length > 0 ? out : [defaultGatewayUrl()];
}

function pickUpstream(model) {
  const routes = loadRoutes();
  if (model && routes && routes[model]) {
    const row = routes[model];
    if (typeof row === "string") return { url: row.replace(/\/+$/, ""), rewriteModel: null };
    if (row && typeof row === "object" && row.url) {
      const rewrite = typeof row.id === "string" && row.id !== model ? row.id : null;
      return { url: String(row.url).replace(/\/+$/, ""), rewriteModel: rewrite };
    }
  }
  return { url: defaultGatewayUrl(), rewriteModel: null };
}

function applyModelRewrite(body, rewriteModel) {
  if (!rewriteModel || !body || body.length === 0) return body;
  try {
    const payload = JSON.parse(body.toString("utf8"));
    if (!payload || typeof payload !== "object" || payload.model === rewriteModel) return body;
    payload.model = rewriteModel;
    return Buffer.from(JSON.stringify(payload));
  } catch {
    return body;
  }
}

function proxyRequest(req, res, targetUrl, body) {
  const apiKey = process.env.DSH_ROUTER_API_KEY?.trim() || null;
  const olaresAppId = process.env.OLARES_APP_ID?.trim() || "test003";

  const rawUrl = req.url ?? "/";
  const u = new URL(rawUrl, "http://x");
  const suffix = u.pathname.replace(/^\/llm\/v1\/?/, "").replace(/^\/+/, "");
  const target = new URL(`${targetUrl}/${suffix}${u.search}`);

  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null || DROPPED_REQ.has(key.toLowerCase())) continue;
    headers[key] = Array.isArray(value) ? value.join(",") : value;
  }
  Object.assign(headers, routerAuthHeaders(apiKey, olaresAppId));
  if (body) headers["content-length"] = String(body.length);

  const transport = target.protocol === "https:" ? httpsRequest : httpRequest;
  const method = (req.method ?? "GET").toUpperCase();

  const upstream = transport(target, { method, headers, timeout: 120_000 }, (up) => {
    const outHeaders = {};
    for (const [key, value] of Object.entries(up.headers)) {
      if (value == null || DROPPED_RES.has(key.toLowerCase())) continue;
      outHeaders[key] = value;
    }
    res.writeHead(up.statusCode ?? 502, outHeaders);
    up.pipe(res);
  });
  upstream.on("error", (err) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          type: "upstream_unreachable",
          message: `Cannot reach model upstream at ${targetUrl}: ${err.message}`,
        },
      }),
    );
  });
  if (body) upstream.end(body);
  else upstream.end();
}

function fetchJson(url, headers) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === "https:" ? httpsRequest : httpRequest;
    const req = transport(target, { method: "GET", headers, timeout: 15_000 }, (up) => {
      const chunks = [];
      up.on("data", (chunk) => chunks.push(chunk));
      up.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if ((up.statusCode ?? 500) >= 400) {
          reject(new Error(`${url} returned ${up.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`timeout ${url}`));
    });
    req.end();
  });
}

async function mergeModels(res) {
  const apiKey = process.env.DSH_ROUTER_API_KEY?.trim() || null;
  const olaresAppId = process.env.OLARES_APP_ID?.trim() || "test003";
  const headers = {
    ...routerAuthHeaders(apiKey, olaresAppId),
    accept: "application/json",
  };
  const routes = loadRoutes() ?? {};
  const upstreams = upstreamList();
  const data = [];
  const seen = new Set();
  for (const [pickerId, row] of Object.entries(routes)) {
    if (seen.has(pickerId)) continue;
    seen.add(pickerId);
    data.push({ id: pickerId, object: "model" });
  }
  if (data.length === 0) {
    for (const url of upstreams) {
      try {
        const payload = await fetchJson(`${url}/models`, headers);
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        for (const row of rows) {
          const id = String(row?.id ?? "").trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          data.push(row);
        }
      } catch (err) {
        console.warn(`[test003] merge /models miss at ${url}: ${err.message}`);
      }
    }
  }
  sendJson(res, 200, { object: "list", data });
}

function proxyToUpstream(req, res) {
  const method = (req.method ?? "GET").toUpperCase();
  const rawUrl = req.url ?? "/";
  const pathname = new URL(rawUrl, "http://x").pathname.replace(/\/+$/, "");
  const isModels = pathname === "/llm/v1/models" || pathname === "/llm/v1";

  const run = async () => {
    if (method === "GET" && isModels && upstreamList().length > 1) {
      await mergeModels(res);
      return;
    }

    let body;
    if (method !== "GET" && method !== "HEAD") {
      body = await readBody(req);
    }
    let model;
    if (body) {
      try {
        model = JSON.parse(body.toString("utf8")).model;
      } catch {
        model = undefined;
      }
    }
    const picked = pickUpstream(typeof model === "string" ? model : undefined);
    body = applyModelRewrite(body, picked.rewriteModel);
    proxyRequest(req, res, picked.url, body);
  };

  void run().catch((err) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    sendError(res, err, "llm_proxy_failed");
  });
}

export function apply(ctx) {
  const routerUrl = defaultGatewayUrl();

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "exact",
        path: "/api/health",
        handler: (_req, res) => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              ok: true,
              app: process.env.OLARES_APP_ID ?? "test003",
              kernel: "dsh-web",
              routerUrl,
              upstreamKind: process.env.LLM_UPSTREAM_KIND ?? "router",
              olaresAppId: process.env.OLARES_APP_ID ?? "test003",
              hasRouterKey: Boolean(process.env.DSH_ROUTER_API_KEY?.trim()),
            }),
          );
        },
      }),
    "scaffold-health",
  );

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "prefix",
        path: "/llm/v1",
        handler: proxyToUpstream,
      }),
    "scaffold-llm-proxy",
  );
}
