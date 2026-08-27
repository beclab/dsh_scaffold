#!/usr/bin/env node
/**
 * Local deploy config (.dsh/config.json, gitignored).
 * Passwords and TOTP are never stored here.
 * Hub credentials stay in the machine Docker store after `docker login`
 * (~/.docker/config.json, often the OS keychain). Olares credentials stay
 * in the olares-cli profile / keychain. Later deploys reuse those sessions.
 */
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const CONFIG_DIR = join(REPO_ROOT, ".dsh");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");
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

export function localImageRepo(appName) {
  return `docker.io/local/${appName}`;
}

export function validateAppName(name) {
  const appName = String(name || "").trim();
  if (!APP_NAME_RE.test(appName)) return "name_invalid";
  if (RESERVED_APP_NAMES.has(appName)) return "name_reserved";
  return "";
}

export function repoRoot() {
  return REPO_ROOT;
}

export function emptyConfig() {
  return {
    version: 1,
    complete: false,
    appName: "",
    imageMode: "save",
    dockerHub: {
      skip: true,
      repository: "",
      username: "",
      loggedIn: false,
    },
    olares: {
      desktopUrl: "",
      olaresId: "",
      lanIp: "",
      sshHost: "",
      sshOk: false,
      sshIdentity: "",
      loggedIn: false,
      twoFactor: false,
    },
    platform: "",
    completedAt: "",
  };
}

export function loadProject() {
  const data = JSON.parse(readFileSync(join(REPO_ROOT, "project.json"), "utf8"));
  return {
    name: String(data.name || ""),
    title: String(data.title || ""),
    imageRepo: String(data.image_repo || ""),
    chartDir: String(data.chart_dir || `deploy/${data.name || ""}`),
  };
}

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return emptyConfig();
  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const base = emptyConfig();
  return {
    ...base,
    ...raw,
    dockerHub: { ...base.dockerHub, ...(raw.dockerHub || {}) },
    olares: { ...base.olares, ...(raw.olares || {}) },
  };
}

export function publicConfig(cfg = loadConfig()) {
  return {
    complete: Boolean(cfg.complete),
    appName: cfg.appName || "",
    imageMode: cfg.imageMode || "save",
    dockerHub: {
      skip: Boolean(cfg.dockerHub?.skip),
      repository: cfg.dockerHub?.repository || "",
      username: cfg.dockerHub?.username || "",
      loggedIn: Boolean(cfg.dockerHub?.loggedIn),
    },
    olares: {
      desktopUrl: cfg.olares?.desktopUrl || "",
      olaresId: cfg.olares?.olaresId || "",
      lanIp: cfg.olares?.lanIp || "",
      sshHost: cfg.olares?.sshHost || "",
      sshOk: Boolean(cfg.olares?.sshOk),
      sshIdentity: cfg.olares?.sshIdentity || "",
      loggedIn: Boolean(cfg.olares?.loggedIn),
      twoFactor: Boolean(cfg.olares?.twoFactor),
    },
    platform: cfg.platform || "",
    completedAt: cfg.completedAt || "",
  };
}

export function saveConfig(cfg) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const cleaned = publicConfig(cfg);
  cleaned.version = 1;
  cleaned.complete = Boolean(cfg.complete);
  writeFileSync(CONFIG_PATH, `${JSON.stringify(cleaned, null, 2)}\n`, { encoding: "utf8" });
  chmodSync(CONFIG_PATH, 0o600);
  return cleaned;
}

export function isComplete(cfg = loadConfig()) {
  if (validateAppName(cfg.appName || "")) return false;
  if (!cfg.olares?.olaresId || !cfg.olares?.desktopUrl) return false;
  if (cfg.imageMode === "save" && (!cfg.olares?.lanIp || !cfg.olares?.sshOk)) return false;
  if (cfg.imageMode === "push") {
    if (!cfg.dockerHub?.repository || !cfg.dockerHub?.username) return false;
  }
  return Boolean(cfg.complete);
}

export function parseOlaresIdFromDesktop(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  let host = raw;
  try {
    host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    return "";
  }
  const parts = host.split(".").filter(Boolean);
  if (parts.length >= 3 && parts[0] === "desktop") {
    return `${parts[1]}@${parts.slice(2).join(".")}`;
  }
  return "";
}

export function normalizeHubRepository(input, appName) {
  let s = String(input || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  s = s.replace(/^https?:\/\/hub\.docker\.com\/repository\/docker\//, "");
  s = s.replace(/^https?:\/\/hub\.docker\.com\/r\//, "");
  s = s.replace(/^https?:\/\/(www\.)?docker\.io\/r\//, "");
  if (s.startsWith("https://") || s.startsWith("http://")) {
    s = s.split("://", 1)[1] ? s.slice(s.indexOf("://") + 3) : s;
  }
  if (!s.includes("/")) s = `${s}/${appName || "app"}`;
  if (!s.startsWith("docker.io/") && !s.includes(".")) s = `docker.io/${s}`;
  return s;
}

export function hubRegistry(repository) {
  const repo = String(repository || "");
  const first = repo.split("/")[0] || "docker.io";
  if (first.includes(".") || first === "localhost") return first;
  return "docker.io";
}

export function bashExports(cfg = loadConfig()) {
  const pairs = {
    OLARES_APP_ID: cfg.appName || "",
    OLARES_ID: cfg.olares?.olaresId || "",
    OLARES_DESKTOP_URL: cfg.olares?.desktopUrl || "",
    OLARES_LAN_IP: cfg.olares?.lanIp || "",
    OLARES_SSH: cfg.olares?.sshHost || cfg.olares?.lanIp || "",
    DOCKERHUB_REPOSITORY: cfg.dockerHub?.repository || "",
    DOCKERHUB_USERNAME: cfg.dockerHub?.username || "",
    IMAGE_MODE: cfg.imageMode || "save",
  };
  return Object.entries(pairs)
    .map(([k, v]) => `${k}=${shellQuote(v)}`)
    .join("\n");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const cmd = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}` && cmd) {
  if (cmd === "exports") {
    process.stdout.write(`${bashExports()}\n`);
  } else if (cmd === "path") {
    process.stdout.write(`${CONFIG_PATH}\n`);
  } else if (cmd === "complete") {
    process.exit(isComplete() ? 0 : 1);
  } else {
    console.error("usage: dsh-config.mjs exports|path|complete");
    process.exit(2);
  }
}
