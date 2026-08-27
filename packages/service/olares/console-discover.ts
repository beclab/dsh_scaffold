import type { ScaffoldEnv } from "../config/env.js";

/** Official Market model / engine app ids (1.12.6 Model Console + later). */
export const OFFICIAL_MODEL_CONSOLE_APPS = [
  "llamacppllmbasev3",
  "llamacppqwen35a3b",
  "llamacppqwen3627bggufv3",
  "llamacppqwen3627bmtpq4kxlv3",
  "llamacppqwen3635ba3bggufv3",
  "llamacppqwen3827bggufv3",
  "llamacppqwopus3627v2mtpq4kmv3",
  "llamacppv3",
  "ollamagemma426bv3",
  "ollamallmbasev3",
  "ollamamuseglimmer30bdflashv3",
  "ollamaornith35bv3",
  "ollamav3",
  "sglangllmbasev3",
  "sglangqwen359bawq4bitv3",
  "sglangv3",
  "vllmgemma412bitawqint4v3",
  "vllmllmbasev3",
  "vllmv3",
  "embeddinggemmav3",
  "audiofwsystransttv3",
  "fishspeechv3",
  "openedaispeechv3",
  "speachesv3",
  "whisperservicev3",
] as const;

const APP_ID = /^[a-z][a-z0-9]{0,29}$/;

export function parseCsvTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\s]+/)) {
    const token = part.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

export function parseAppIds(raw: string | null | undefined): string[] {
  return parseCsvTokens(raw).filter((id) => APP_ID.test(id));
}

/** In-cluster OpenAI `/v1` for a shared Model Console (Router uses this host too). */
export function consoleUrlForApp(appId: string): string {
  if (!APP_ID.test(appId)) {
    throw new Error(`invalid Model Console app id: ${appId}`);
  }
  return `http://sharedentrances-api.${appId}-shared/v1`;
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function explicitConsoleUrls(env: Pick<ScaffoldEnv, "modelConsoleUrl" | "modelConsoleUrls">): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [env.modelConsoleUrl, ...parseCsvTokens(env.modelConsoleUrls)]) {
    if (!raw) continue;
    const url = normalizeBaseUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function candidateConsoleApps(
  env: Pick<ScaffoldEnv, "modelConsoleApps">,
  extra: readonly string[] = OFFICIAL_MODEL_CONSOLE_APPS,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...parseAppIds(env.modelConsoleApps), ...extra]) {
    if (!APP_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export interface ConsoleCandidate {
  url: string;
  appId: string | null;
}

export function candidateConsoleTargets(env: ScaffoldEnv): ConsoleCandidate[] {
  const seen = new Set<string>();
  const out: ConsoleCandidate[] = [];
  const push = (url: string, appId: string | null) => {
    const normalized = normalizeBaseUrl(url);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push({ url: normalized, appId });
  };
  const explicit = explicitConsoleUrls(env);
  for (const url of explicit) push(url, null);
  const apps = explicit.length > 0 ? parseAppIds(env.modelConsoleApps) : candidateConsoleApps(env);
  for (const appId of apps) push(consoleUrlForApp(appId), appId);
  return out;
}
