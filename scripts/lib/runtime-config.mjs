#!/usr/bin/env node
/**
 * Product name + image from .env, with GHCR filled in from git origin
 * after the user has logged in to gh. Does not rewrite git files.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ghcrRepos, originGithub } from "./github.mjs";
import { repoRoot } from "./dsh-config.mjs";

function parseEnvFile(text) {
  const out = {};
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadDotEnv(root = repoRoot()) {
  const merged = {};
  for (const name of [".env.example", ".env"]) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    Object.assign(merged, parseEnvFile(readFileSync(path, "utf8")));
  }
  return merged;
}

function pick(fileEnv, key) {
  const fromProc = process.env[key];
  if (fromProc !== undefined && String(fromProc).trim() !== "") return String(fromProc).trim();
  const fromFile = fileEnv[key];
  if (fromFile !== undefined && String(fromFile).trim() !== "") return String(fromFile).trim();
  return "";
}

function chartVersion(root, chartDir) {
  const path = join(root, chartDir);
  if (!existsSync(path)) return "";
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (line.startsWith("version:")) return line.slice("version:".length).trim().replace(/['"]/g, "");
  }
  return "";
}

export function resolveRuntime(root = repoRoot()) {
  const fileEnv = loadDotEnv(root);
  const project = JSON.parse(readFileSync(join(root, "project.json"), "utf8"));
  const appName = pick(fileEnv, "OLARES_APP_ID") || String(project.name || "dshscaffold").trim();
  const title = pick(fileEnv, "PRODUCT_NAME") || String(project.title || appName).trim();
  const info = originGithub(root);
  const auto = info ? ghcrRepos(info.owner, appName) : { image_repo: "", image_base_repo: "" };
  const imageRepo = pick(fileEnv, "IMAGE_REPO") || auto.image_repo;
  const imageBaseRepo = pick(fileEnv, "IMAGE_BASE_REPO") || auto.image_base_repo;
  const imageBaseTag = pick(fileEnv, "IMAGE_BASE_TAG") || String(project.image_base_tag || "1");
  const chartDir = project.chart_dir || `deploy/${appName}`;
  const version = chartVersion(root, join(chartDir, "Chart.yaml"));
  if (!imageRepo) {
    throw new Error("IMAGE_REPO is empty and origin is not GitHub — set IMAGE_REPO in .env or fork + gh auth login");
  }
  return {
    owner: info?.owner || "",
    repo: info?.repo || "",
    appName,
    title,
    version,
    image_repo: imageRepo,
    image_base_repo: imageBaseRepo || `${imageRepo}-base`,
    image_base_tag: imageBaseTag,
    chartDir,
    npm_scope: String(project.npm_scope || ""),
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function bashExports(cfg = resolveRuntime()) {
  return [
    `APP_NAME=${shellQuote(cfg.appName)}`,
    `APP_TITLE=${shellQuote(cfg.title)}`,
    `IMAGE_REPO=${shellQuote(cfg.image_repo)}`,
    `IMAGE_BASE_REPO=${shellQuote(cfg.image_base_repo)}`,
    `IMAGE_BASE_TAG=${shellQuote(cfg.image_base_tag)}`,
    `NPM_SCOPE=${shellQuote(cfg.npm_scope)}`,
    `CHART_DIR=${shellQuote(join(repoRoot(), cfg.chartDir))}`,
  ].join("\n");
}

const invoked =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  const cmd = process.argv[2] || "json";
  if (cmd === "exports") {
    process.stdout.write(`${bashExports()}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(resolveRuntime(), null, 2)}\n`);
  }
}
