import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Document, isSeq, parseDocument } from "yaml";
import {
  isChatModel,
  isPlaceholderModelId,
  type RouterModelEntry,
  type UpstreamKind,
} from "../olares/router-models.js";

const PROVIDER = "olares-router";
const SETTINGS_NS = "llm-pi-ai";
const PROTOCOL = "openai-completions";
const ROUTE_COMPAT = { supportsReasoningEffort: true };
const CREDENTIAL_REF = "DSH_ROUTER_SHIM_KEY";

export const ROUTER_CREDENTIAL_REF = CREDENTIAL_REF;
export const ROUTER_PROVIDER = PROVIDER;

export interface ScaffoldSettingsSeed {
  catalog: RouterModelEntry[];
  baseURL: string;
  chatFallback: string | null;
  kind?: UpstreamKind;
}

export interface ScaffoldSettingsResult {
  model: string | null;
  routeSeeded: boolean;
  routeModels: number;
  changed: boolean;
}

/**
 * Seed the Router shim route once, then keep the picker in sync with
 * GET /v1/models (cloud vendors + Model Console local apps).
 */
export function bootstrapScaffoldSettings(
  dshHome: string,
  seed: ScaffoldSettingsSeed,
): ScaffoldSettingsResult {
  mkdirSync(dshHome, { recursive: true });
  const settingsPath = join(dshHome, "settings.yaml");
  const raw = readSettings(settingsPath);
  const doc = parseDocument(raw);

  const routeSeeded = seedRouterRoute(doc, seed);
  if (!routeSeeded) refreshRouterRoute(doc, seed);
  const model = pinDefaultModel(doc, seed);
  const routeModels = declaredModelCount(doc);

  const next = doc.toString();
  if (next === raw) return { model, routeSeeded: false, routeModels, changed: false };
  const tmp = `${settingsPath}.${process.pid}.tmp`;
  writeFileSync(tmp, next, { mode: 0o600 });
  renameSync(tmp, settingsPath);
  return { model, routeSeeded, routeModels, changed: true };
}

function readSettings(settingsPath: string): string {
  if (!existsSync(settingsPath)) return "";
  try {
    return readFileSync(settingsPath, "utf8");
  } catch {
    return "";
  }
}

function seedRouterRoute(doc: Document, seed: ScaffoldSettingsSeed): boolean {
  const path = [SETTINGS_NS, "providers", PROVIDER];
  if (doc.getIn(path) !== undefined) return false;

  const chat = declarableModels(seed);
  const fallbackId = desiredModel(seed) ?? "default";
  const models = chat.length > 0 ? chat : [{ id: fallbackId, name: fallbackId }];

  doc.setIn(path, {
    displayName: seed.kind === "model-console" ? "Model Console" : "Olares Router",
    api: PROTOCOL,
    baseURL: seed.baseURL,
    apiKeyEnv: CREDENTIAL_REF,
    compat: ROUTE_COMPAT,
    models,
  });
  return true;
}

function refreshRouterRoute(doc: Document, seed: ScaffoldSettingsSeed): void {
  const path = [SETTINGS_NS, "providers", PROVIDER];
  doc.setIn(
    [...path, "displayName"],
    seed.kind === "model-console" ? "Model Console" : "Olares Router",
  );
  doc.setIn([...path, "compat"], ROUTE_COMPAT);
  const chat = declarableModels(seed);
  if (chat.length === 0) return;
  doc.setIn([...path, "models"], chat);
}

interface RouteModel {
  id: string;
  name: string;
  input?: ["text", "image"];
  reasoningEfforts?: Record<string, string>;
  contextWindow?: number;
  maxTokens?: number;
}

function declarableModels(seed: ScaffoldSettingsSeed): RouteModel[] {
  return seed.catalog.filter(isChatModel).map((entry) => ({
    id: entry.id,
    name: entry.name,
    ...(entry.supportsVision ? { input: ["text", "image"] as ["text", "image"] } : {}),
    ...(entry.reasoningEfforts ? { reasoningEfforts: entry.reasoningEfforts } : {}),
    ...(entry.contextWindow === null ? {} : { contextWindow: entry.contextWindow }),
    ...(entry.maxTokens === null ? {} : { maxTokens: entry.maxTokens }),
  }));
}

function declaredModelCount(doc: Document): number {
  const models: unknown = doc.getIn([SETTINGS_NS, "providers", PROVIDER, "models"]);
  if (isSeq(models)) return models.items.length;
  return Array.isArray(models) ? models.length : 0;
}

function pinDefaultModel(doc: Document, seed: ScaffoldSettingsSeed): string | null {
  const current = readString(doc, ["agent-default-model", "model"]);
  const desired = desiredModel(seed);
  const catalogIds = new Set(seed.catalog.filter(isChatModel).map((entry) => entry.id));
  const stale =
    isPlaceholderModelId(current) ||
    (catalogIds.size > 0 && current !== null && !catalogIds.has(current));
  const model = current && !stale ? current : desired;
  if (model === null) return current;

  doc.setIn(["agent-default-model", "provider"], PROVIDER);
  doc.setIn(["agent-default-model", "model"], model);
  doc.deleteIn(["agent-default-model", "reasoningEffort"]);
  return model;
}

function desiredModel(seed: ScaffoldSettingsSeed): string | null {
  return seed.chatFallback;
}

function readString(doc: Document, path: string[]): string | null {
  const value = doc.getIn(path);
  return typeof value === "string" && value.trim() ? value : null;
}
