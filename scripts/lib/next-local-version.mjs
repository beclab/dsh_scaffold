#!/usr/bin/env node
/**
 * Next Helm-resolvable local upload version:
 * max(git Chart.yaml + 1 patch, upload-source version + 1 patch).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, loadProject, repoRoot } from "./dsh-config.mjs";

export function coreSemver(version) {
  const core = String(version || "").split("+", 1)[0].split("-", 1)[0];
  const parts = core.split(".");
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  return { major: Number(parts[0]), minor: Number(parts[1]), patch: Number(parts[2]) };
}

export function bumpPatch(version) {
  const sem = coreSemver(version);
  if (!sem) return "0.1.1";
  return `${sem.major}.${sem.minor}.${sem.patch + 1}`;
}

function cmpSemver(a, b) {
  const left = coreSemver(a);
  const right = coreSemver(b);
  if (!left) return -1;
  if (!right) return 1;
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function maxVersion(versions) {
  return versions.filter(Boolean).sort(cmpSemver).at(-1) || "0.1.1";
}

function readGitChartVersion(appName) {
  const path = join(repoRoot(), "deploy", appName, "Chart.yaml");
  if (!existsSync(path)) return "0.1.0";
  const line = readFileSync(path, "utf8").split(/\r?\n/).find((l) => l.startsWith("version:"));
  if (!line) return "0.1.0";
  return line.slice(line.indexOf(":") + 1).trim() || "0.1.0";
}

function jsonVersion(raw) {
  try {
    const data = JSON.parse(raw);
    return (
      data?.app_info?.app_entry?.version ||
      data?.app_simple_info?.app_version ||
      data?.version ||
      data?.state?.version ||
      ""
    );
  } catch {
    return "";
  }
}

function marketVersion(appName) {
  const get = spawnSync("olares-cli", ["market", "get", appName, "-s", "upload", "-o", "json"], {
    encoding: "utf8",
    timeout: 20_000,
  });
  if (get.status === 0) {
    const ver = jsonVersion(get.stdout);
    if (coreSemver(ver)) return ver;
  }
  const status = spawnSync("olares-cli", ["market", "status", appName, "-a", "-o", "json"], {
    encoding: "utf8",
    timeout: 20_000,
  });
  if (status.status === 0) return jsonVersion(status.stdout);
  return "";
}

export function nextLocalVersion(appName = loadProject().name) {
  const git = readGitChartVersion(appName);
  const fromGit = bumpPatch(git);
  const installed = marketVersion(appName);
  const fromInstalled = installed ? bumpPatch(installed) : "";
  return maxVersion([fromGit, fromInstalled]);
}

export function nextLocalExports() {
  const projectName = loadProject().name;
  const appName = loadConfig().appName || projectName;
  const version = nextLocalVersion(projectName);
  return { OLARES_LOCAL_VERSION: version, OLARES_APP_ID: appName };
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  const out = nextLocalExports();
  if (process.argv.includes("--exports")) {
    process.stdout.write(`export OLARES_LOCAL_VERSION=${out.OLARES_LOCAL_VERSION}\nexport OLARES_APP_ID=${out.OLARES_APP_ID}\n`);
  } else {
    process.stdout.write(`${out.OLARES_LOCAL_VERSION}\n`);
  }
}
