#!/usr/bin/env node
/** Shared repository path and Olares app-name validation. */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const APP_NAME_RE = /^[a-z][a-z0-9]{3,29}$/;
export const RESERVED_APP_NAMES = new Set([
  "test",
  "app",
  "web",
  "dsh",
  "api",
  "www",
  "node",
  "docker",
  "chart",
  "olares",
  "admin",
  "root",
  "default",
  "latest",
  "chat",
  "demo",
  "user",
  "data",
]);

export function validateAppName(name) {
  const appName = String(name || "").trim();
  if (!APP_NAME_RE.test(appName)) return "name_invalid";
  if (RESERVED_APP_NAMES.has(appName)) return "name_reserved";
  return "";
}

export function repoRoot() {
  return REPO_ROOT;
}
