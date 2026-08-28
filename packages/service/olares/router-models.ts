import { lookup } from "node:dns/promises";
import type { ScaffoldEnv } from "../config/env.js";
import { candidateConsoleTargets, type ConsoleCandidate } from "./console-discover.js";

export interface RouterModelEntry {
  id: string;
  name: string;
  mode: string | null;
  supportsVision: boolean;
  reasoningEfforts: Record<string, string> | null;
  contextWindow: number | null;
  maxTokens: number | null;
}

const SAFE_MODEL_ID = /^[^\u0000-\u001f\u007f]{1,512}$/;
const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const NON_CHAT_HINTS = /embed|whisper|tts|speech|ocr|clip|stt|asr|transcri/i;

function capabilities(item: Record<string, unknown>): Set<string> {
  const declared = Array.isArray(item.supports)
    ? item.supports
    : item.supports && typeof item.supports === "object"
      ? Object.keys(item.supports as object).filter(
          (key) => (item.supports as Record<string, unknown>)[key] === true,
        )
      : [];
  const flags = new Set<string>();
  for (const entry of declared) {
    const flag = String(entry ?? "")
      .trim()
      .toLowerCase()
      .replace(/^supports_/, "");
    if (flag) flags.add(flag);
  }
  if (item.supports_vision === true) flags.add("vision");
  return flags;
}

function reasoningEfforts(item: Record<string, unknown>, flags: Set<string>): Record<string, string> | null {
  if (!flags.has("reasoning_effort")) return null;
  const raw = item.reasoning_effort;
  const options =
    raw && typeof raw === "object" && Array.isArray((raw as { options?: unknown }).options)
      ? (raw as { options: unknown[] }).options
      : [];
  const efforts: Record<string, string> = {};
  for (const option of options) {
    const level = String(option ?? "").trim().toLowerCase();
    if (THINKING_LEVELS.has(level)) efforts[level] = level;
  }
  return Object.keys(efforts).some((level) => level !== "off") ? efforts : null;
}

function tokenCount(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : null;
}

/** OpenAI-compatible GET /models payload from Router (1.12.6 llmgatewayv3 or 1.12.7 router). */
export function routerCatalogRows(payload: unknown): RouterModelEntry[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    return [];
  }
  const rows: RouterModelEntry[] = [];
  const seen = new Set<string>();
  for (const item of (payload as { data: unknown[] }).data) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = String(rec.id ?? "").trim();
    if (!SAFE_MODEL_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    const flags = capabilities(rec);
    rows.push({
      id,
      name: id,
      mode: String(rec.mode ?? "").trim().toLowerCase() || null,
      supportsVision: flags.has("vision"),
      reasoningEfforts: reasoningEfforts(rec, flags),
      contextWindow: tokenCount(rec.context_size),
      maxTokens: tokenCount(rec.max_output_tokens),
    });
  }
  return rows;
}

export function isChatModelId(id: string): boolean {
  return !NON_CHAT_HINTS.test(id);
}

export function isChatModel(model: RouterModelEntry): boolean {
  return model.mode ? model.mode === "chat" : isChatModelId(model.id);
}

function isMtpModelId(id: string): boolean {
  return /\bmtp\b/i.test(id);
}

/** Prefer an MTP chat row when Router/Model Console offers both. */
export function pickChatModelId(catalog: RouterModelEntry[]): string | null {
  const chat = catalog.filter(isChatModel);
  return chat.find((m) => isMtpModelId(m.id))?.id ?? chat[0]?.id ?? null;
}

export function isPlaceholderModelId(id: string | null | undefined): boolean {
  if (!id) return true;
  const trimmed = id.trim();
  if (!trimmed || trimmed === "default") return true;
  return /^deepseek-v4-(flash|pro)$/i.test(trimmed);
}

function routerAuthHeaders(apiKey: string | null, olaresAppId: string): Record<string, string> {
  if (apiKey) return { authorization: `Bearer ${apiKey}` };
  return { "x-caller-appid": olaresAppId };
}

export async function fetchRouterModels(
  env: Pick<ScaffoldEnv, "routerUrl" | "routerApiKey" | "olaresAppId">,
  timeoutMs = 8_000,
): Promise<RouterModelEntry[]> {
  const res = await fetch(`${env.routerUrl}/models`, {
    method: "GET",
    headers: {
      ...routerAuthHeaders(env.routerApiKey, env.olaresAppId),
      accept: "application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`Router /models returned ${res.status}`);
  }
  return routerCatalogRows(await res.json());
}

function preferLegacyGateway(sysVersion: string | null): boolean {
  return Boolean(sysVersion && /^1\.12\.6(\b|-)/.test(sysVersion));
}

/** 1.12.7 uses `router`; 1.12.6 Market still ships `llmgatewayv3`. */
export function gatewayCandidates(env: ScaffoldEnv): string[] {
  const primary = env.routerUrl;
  const fallback = env.routerFallbackUrl;
  const ordered = preferLegacyGateway(env.sysVersion)
    ? [fallback, primary]
    : [primary, fallback];
  return [...new Set(ordered.filter((url): url is string => Boolean(url)))];
}

export type UpstreamKind = "router" | "model-console";

export interface ModelRoute {
  url: string;
  id: string;
}

export interface ResolvedGateway {
  url: string;
  catalog: RouterModelEntry[];
  kind: UpstreamKind;
  upstreams: string[];
  routes: Record<string, ModelRoute>;
}

export function shouldDiscoverConsoles(
  env: ScaffoldEnv,
  gateway: { catalog: RouterModelEntry[] } | null,
): boolean {
  if (explicitConsoleUrlsPresent(env)) return true;
  if (!gateway) return true;
  if (preferLegacyGateway(env.sysVersion) && gateway.catalog.length === 0) return true;
  return false;
}

function explicitConsoleUrlsPresent(env: ScaffoldEnv): boolean {
  return Boolean(env.modelConsoleUrl || env.modelConsoleUrls);
}

async function hostResolves(url: string): Promise<boolean> {
  try {
    const { hostname } = new URL(url);
    if (!hostname) return false;
    if (hostname === "127.0.0.1" || hostname === "localhost") return true;
    await lookup(hostname);
    return true;
  } catch {
    return false;
  }
}

async function probeUrl(
  env: ScaffoldEnv,
  url: string,
): Promise<{ url: string; catalog: RouterModelEntry[] } | null> {
  try {
    const catalog = await fetchRouterModels({ ...env, routerUrl: url });
    return { url, catalog };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[test003] catalog miss at ${url}: ${message}`);
    return null;
  }
}

async function probeGateway(env: ScaffoldEnv): Promise<ResolvedGateway | null> {
  const candidates = gatewayCandidates(env);
  const hits = await Promise.all(candidates.map((url) => probeUrl(env, url)));
  for (const hit of hits) {
    if (!hit) continue;
    return {
      ...hit,
      kind: "router",
      upstreams: [hit.url],
      routes: routesForCatalog(hit.url, hit.catalog),
    };
  }
  return null;
}

function routesForCatalog(url: string, catalog: RouterModelEntry[]): Record<string, ModelRoute> {
  const routes: Record<string, ModelRoute> = {};
  for (const row of catalog) {
    routes[row.id] = { url, id: row.id };
  }
  return routes;
}

function mergeConsoleHits(
  hits: Array<{ url: string; catalog: RouterModelEntry[]; appId: string | null }>,
): ResolvedGateway {
  const idCounts = new Map<string, number>();
  for (const hit of hits) {
    for (const row of hit.catalog) {
      idCounts.set(row.id, (idCounts.get(row.id) ?? 0) + 1);
    }
  }

  const catalog: RouterModelEntry[] = [];
  const routes: Record<string, ModelRoute> = {};
  const seen = new Set<string>();
  for (const hit of hits) {
    for (const row of hit.catalog) {
      const collide = (idCounts.get(row.id) ?? 0) > 1;
      const pickerId = collide && hit.appId ? `${hit.appId}/${row.id}` : row.id;
      if (seen.has(pickerId)) continue;
      seen.add(pickerId);
      catalog.push({ ...row, id: pickerId, name: pickerId });
      routes[pickerId] = { url: hit.url, id: row.id };
    }
  }

  return {
    url: hits[0].url,
    catalog,
    kind: "model-console",
    upstreams: hits.map((hit) => hit.url),
    routes,
  };
}

async function discoverConsoles(env: ScaffoldEnv): Promise<ResolvedGateway | null> {
  const targets = candidateConsoleTargets(env);
  const hits: Array<{ url: string; catalog: RouterModelEntry[]; appId: string | null }> = [];
  const pending = (
    await Promise.all(
      targets.map(async (target) => {
        if (target.appId && !(await hostResolves(target.url))) return null;
        return target;
      }),
    )
  ).filter((target): target is ConsoleCandidate => target !== null);

  const concurrency = 8;
  for (let i = 0; i < pending.length; i += concurrency) {
    const batch = pending.slice(i, i + concurrency);
    const resolved = await Promise.all(
      batch.map(async (target) => {
        const hit = await probeUrl(env, target.url);
        return hit ? { ...hit, appId: target.appId } : null;
      }),
    );
    for (const hit of resolved) {
      if (hit) hits.push(hit);
    }
  }

  if (hits.length === 0) return null;
  const merged = mergeConsoleHits(hits);
  console.log(
    `[test003] Model Console: ${hits.length} endpoint(s), ${merged.catalog.length} model(s)`,
  );
  return merged;
}

/**
 * 1.12.7: Router (or llmgatewayv3). 1.12.6 has no Router — talk to each
 * Model Console at `sharedentrances-api.<app>-shared/v1` when the gateway misses.
 */
export async function resolveRouterGateway(env: ScaffoldEnv): Promise<ResolvedGateway> {
  const gateway = await probeGateway(env);
  if (gateway && !shouldDiscoverConsoles(env, gateway)) {
    return gateway;
  }

  const consoles = await discoverConsoles(env);
  if (consoles && (consoles.catalog.length > 0 || !gateway)) {
    return consoles;
  }
  if (gateway) return gateway;

  const fallback = gatewayCandidates(env)[0] ?? env.routerUrl;
  console.warn(`[test003] no Router or Model Console catalog; using ${fallback}`);
  return {
    url: fallback,
    catalog: [],
    kind: "router",
    upstreams: [fallback],
    routes: {},
  };
}
