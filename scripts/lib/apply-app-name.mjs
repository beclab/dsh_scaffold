#!/usr/bin/env node
/**
 * Rewrite product identifiers from one app name to another.
 * Uses explicit path/key patterns. Never a global substring replace
 * (that would turn String.prototype.test into .dshscaffold when the
 * old name is "test").
 */
import { readFileSync, writeFileSync, renameSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  CONFIG_PATH,
  loadConfig,
  loadProject,
  localImageRepo,
  repoRoot,
  saveConfig,
  validateAppName,
} from "./dsh-config.mjs";

function lit(name) {
  return String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function rewriteAppStrings(text, oldName, newName) {
  let s = String(text);
  const pairs = [
    [`/appdata/data/${oldName}`, `/appdata/data/${newName}`],
    [`/data/${oldName}`, `/data/${newName}`],
    [`[${oldName}]`, `[${newName}]`],
    [`/${oldName}/`, `/${newName}/`],
    [`workloads.${oldName}`, `workloads.${newName}`],
    [`.Values.domain.${oldName}`, `.Values.domain.${newName}`],
    [`10-${oldName}-user-bin`, `10-${newName}-user-bin`],
    [`docker.io/beclab/${oldName}`, localImageRepo(newName)],
    [`docker.io/local/${oldName}`, localImageRepo(newName)],
    [`OLARES_APP_ID=${oldName}`, `OLARES_APP_ID=${newName}`],
    [`?? "${oldName}"`, `?? "${newName}"`],
    [`?? '${oldName}'`, `?? '${newName}'`],
    [`|| "${oldName}"`, `|| "${newName}"`],
    [`|| '${oldName}'`, `|| '${newName}'`],
  ];
  for (const [from, to] of pairs) {
    if (from !== to) s = s.split(from).join(to);
  }
  const o = lit(oldName);
  s = s.replace(new RegExp(`^(name:\\s*)${o}$`, "m"), `$1${newName}`);
  s = s.replace(new RegExp(`^( {2}name:\\s*)${o}$`, "m"), `$1${newName}`);
  s = s.replace(new RegExp(`^( {2}appid:\\s*)${o}$`, "m"), `$1${newName}`);
  s = s.replace(new RegExp(`^( {4}name:\\s*)${o}$`, "m"), `$1${newName}`);
  s = s.replace(new RegExp(`(- name:\\s*)${o}$`, "gm"), `$1${newName}`);
  s = s.replace(new RegExp(`host:\\s*${o}-svc`, "g"), `host: ${newName}-svc`);
  s = s.replace(new RegExp(`entranceName:\\s*${o}\\b`, "g"), `entranceName: ${newName}`);
  s = s.replace(new RegExp(`uriRegex:\\s*\\^/${o}/`, "g"), `uriRegex: ^/${newName}/`);
  s = s.replace(new RegExp(`^(  )${o}:\\s*$`, "m"), `$1${newName}:`);
  s = s.replace(new RegExp(`^(  )${o}:(\\s+\\S+)`, "m"), `$1${newName}:$2`);
  s = s.replace(new RegExp(`value:\\s*"${o}"`, "g"), `value: "${newName}"`);
  s = s.replace(new RegExp(`(ARG BASE_IMAGE=docker\\.io/)[\\w.-]+/${o}-base`, "g"), `$1local/${newName}-base`);
  s = s.replace(new RegExp(`(BASE_IMAGE=docker\\.io/)[\\w.-]+/${o}-base`, "g"), `$1local/${newName}-base`);
  s = s.replace(
    /ARG BASE_IMAGE=docker\.io\/\S+-base(:\S+)?/g,
    `ARG BASE_IMAGE=docker.io/local/${newName}-base$1`,
  );
  return s;
}

function retargetRepo(repo, oldName, newName) {
  const raw = String(repo || "");
  if (!raw || raw.includes("docker.io/beclab/") || raw.startsWith("beclab/")) {
    return localImageRepo(newName);
  }
  if (raw.endsWith(`/${oldName}`)) return `${raw.slice(0, -oldName.length)}${newName}`;
  return localImageRepo(newName);
}

function readProductName(root) {
  const path = join(root, "packages/plugins/bundle-web/host/brand/identity.js");
  if (!existsSync(path)) return "";
  const match = readFileSync(path, "utf8").match(/^export const PRODUCT_NAME = ("(?:\\.|[^"\\])*")/m);
  if (!match) return "";
  try {
    return JSON.parse(match[1]);
  } catch {
    return "";
  }
}

function applyBrandTitle(root, title, chartDir, oldTitle) {
  const identityPath = join(root, "packages/plugins/bundle-web/host/brand/identity.js");
  if (existsSync(identityPath)) {
    const next = readFileSync(identityPath, "utf8").replace(
      /^export const PRODUCT_NAME = ("(?:\\.|[^"\\])*")/m,
      `export const PRODUCT_NAME = ${JSON.stringify(title)}`,
    );
    writeFileSync(identityPath, next);
  }
  const markPath = join(root, "packages/plugins/bundle-web/host/brand/mark.js");
  if (existsSync(markPath)) {
    const letter = Array.from(title)[0]?.toUpperCase() || "D";
    const next = readFileSync(markPath, "utf8").replace(
      /(font-family="[^"]*">)[^<]+(<\/text>)/,
      `$1${letter}$2`,
    );
    writeFileSync(markPath, next);
  }
  const previous = oldTitle && oldTitle !== title ? oldTitle : "";
  for (const rel of [
    "OlaresManifest.yaml",
    "i18n/en-US/OlaresManifest.yaml",
    "i18n/zh-CN/OlaresManifest.yaml",
  ]) {
    const path = join(chartDir, rel);
    if (!existsSync(path)) continue;
    let text = readFileSync(path, "utf8");
    if (previous) text = text.split(`title: ${previous}`).join(`title: ${title}`);
    writeFileSync(path, text);
  }
}

function displayTitle(appName) {
  return appName === "dshscaffold" ? "DSH Scaffold" : appName;
}

export function applyAppName(newName) {
  const errorKey = validateAppName(newName);
  if (errorKey) {
    throw new Error(errorKey === "name_reserved" ? `reserved app name: ${newName}` : `invalid app name: ${newName}`);
  }
  const root = repoRoot();
  const project = loadProject();
  const oldName = project.name;
  const title = displayTitle(newName);
  const projectPath = join(root, "project.json");
  const projectData = JSON.parse(readFileSync(projectPath, "utf8"));
  const oldTitle = String(projectData.title || "").trim() || readProductName(root) || "DSH Scaffold";
  const renamed = Boolean(oldName && oldName !== newName);

  if (renamed) {
    projectData.name = newName;
    projectData.image_repo = retargetRepo(projectData.image_repo, oldName, newName);
    projectData.chart_dir = `deploy/${newName}`;
    if (projectData.hot_reload && typeof projectData.hot_reload === "object") {
      if (projectData.hot_reload.deploy === oldName) projectData.hot_reload.deploy = newName;
      if (projectData.hot_reload.container === oldName) projectData.hot_reload.container = newName;
    }
    const oldBase = String(projectData.image_base_repo || "");
    if (!oldBase || oldBase.includes("docker.io/beclab/") || oldBase.endsWith(`/${oldName}-base`)) {
      projectData.image_base_repo = `docker.io/local/${newName}-base`;
    }
  }
  projectData.title = title;
  writeFileSync(projectPath, `${JSON.stringify(projectData, null, 2)}\n`);

  if (renamed) {
    const pkgPath = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (pkg.name === oldName) {
      pkg.name = newName;
      writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    }

    const lockPath = join(root, "package-lock.json");
    if (existsSync(lockPath)) {
      const lock = JSON.parse(readFileSync(lockPath, "utf8"));
      if (lock.name === oldName) lock.name = newName;
      if (lock.packages?.[""]?.name === oldName) lock.packages[""].name = newName;
      writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    }

    const oldChart = join(root, "deploy", oldName);
    const newChart = join(root, "deploy", newName);
    if (existsSync(oldChart) && !existsSync(newChart)) {
      renameSync(oldChart, newChart);
    }
    const chartRoot = existsSync(newChart) ? newChart : oldChart;
    for (const rel of [
      "Chart.yaml",
      "OlaresManifest.yaml",
      "values.yaml",
      "templates/deployment.yaml",
      "templates/service.yaml",
      "i18n/en-US/OlaresManifest.yaml",
      "i18n/zh-CN/OlaresManifest.yaml",
    ]) {
      const path = join(chartRoot, rel);
      if (!existsSync(path)) continue;
      writeFileSync(path, rewriteAppStrings(readFileSync(path, "utf8"), oldName, newName));
    }
    if (existsSync(newChart) && existsSync(oldChart) && oldChart !== newChart) {
      rmSync(oldChart, { recursive: true, force: true });
    }

    for (const rel of [
      "packages/service/config/env.ts",
      "packages/service/dsh-web/boot.ts",
      "packages/service/dsh-web/profile.ts",
      "packages/service/olares/router-models.ts",
      "packages/service/olares/console-discover.ts",
      "packages/service/olares/skills-seed.ts",
      "Dockerfile",
      "Dockerfile.base",
      "packages/plugins/bundle-web/host/llm-routes.js",
      "packages/plugins/bundle-web/host/default-workspace.js",
      "packages/plugins/bundle-web/host/brand/mark.js",
      ".env.example",
    ]) {
      const path = join(root, rel);
      if (!existsSync(path)) continue;
      writeFileSync(path, rewriteAppStrings(readFileSync(path, "utf8"), oldName, newName));
    }

    if (existsSync(CONFIG_PATH)) {
      const cfg = loadConfig();
      if (!cfg.appName || cfg.appName === oldName) {
        cfg.appName = newName;
        saveConfig(cfg);
      }
    }

    const machinesPath = join(root, "machines.json");
    if (existsSync(machinesPath)) {
      const data = JSON.parse(readFileSync(machinesPath, "utf8"));
      for (const machine of data.machines || []) {
        if (typeof machine.kube_ns === "string" && machine.kube_ns.startsWith(`${oldName}-`)) {
          machine.kube_ns = `${newName}${machine.kube_ns.slice(oldName.length)}`;
        }
      }
      writeFileSync(machinesPath, `${JSON.stringify(data, null, 2)}\n`);
    }
  }

  const chartDir = join(root, existsSync(join(root, "deploy", newName)) ? `deploy/${newName}` : `deploy/${oldName || newName}`);
  applyBrandTitle(root, title, chartDir, oldTitle);

  return { changed: renamed || oldTitle !== title, from: oldName, name: newName, title };
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  const name = process.argv[2];
  if (!name) {
    console.error("usage: apply-app-name.mjs <name>");
    process.exit(2);
  }
  const result = applyAppName(name);
  console.log(JSON.stringify(result));
}
