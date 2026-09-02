#!/usr/bin/env node
/**
 * GitHub origin + GHCR names. Image publish is GitHub Actions → ghcr.io/<owner>/<app>.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "./dsh-config.mjs";

export const UPSTREAM = { owner: "beclab", repo: "dsh_scaffold" };

export function parseGithubRemote(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  const ssh = raw.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (ssh) return { owner: ssh[1], repo: ssh[2].replace(/\.git$/i, "") };
  const https = raw.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (https) return { owner: https[1], repo: https[2].replace(/\.git$/i, "") };
  const git = raw.match(/^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (git) return { owner: git[1], repo: git[2].replace(/\.git$/i, "") };
  return null;
}

export function originUrl(root = repoRoot()) {
  const probe = spawnSync("git", ["-C", root, "remote", "get-url", "origin"], {
    encoding: "utf8",
    timeout: 10_000,
  });
  if (probe.status !== 0) return "";
  return String(probe.stdout || "").trim();
}

export function originGithub(root = repoRoot()) {
  return parseGithubRemote(originUrl(root));
}

export function isUpstreamOrigin(info) {
  if (!info) return false;
  return (
    info.owner.toLowerCase() === UPSTREAM.owner &&
    info.repo.replace(/\.git$/i, "").toLowerCase() === UPSTREAM.repo
  );
}

export function ghcrRepo(owner, appName) {
  const o = String(owner || "").toLowerCase();
  const n = String(appName || "").toLowerCase();
  return `ghcr.io/${o}/${n}`;
}

function inspectGithub() {
  const url = originUrl();
  if (!url) {
    return { id: "github", ok: false, version: "", errorKey: "github_origin_missing" };
  }
  const info = parseGithubRemote(url);
  if (!info) {
    return { id: "github", ok: false, version: url, errorKey: "github_not_github" };
  }
  const label = `${info.owner}/${info.repo}`;
  return { id: "github", ok: true, version: label, errorKey: "" };
}

export function inspectGithubFork() {
  const base = inspectGithub();
  if (!base.ok) return { ...base, id: "github-fork" };
  const info = originGithub();
  if (isUpstreamOrigin(info)) {
    return { id: "github-fork", ok: false, version: base.version, errorKey: "github_fork_required" };
  }
  return { id: "github-fork", ok: true, version: base.version, errorKey: "" };
}

export function inspectGh() {
  const probe = spawnSync("gh", ["auth", "status"], { encoding: "utf8", timeout: 15_000 });
  if (probe.error?.code === "ENOENT") {
    return { id: "gh", ok: false, version: "", errorKey: "gh_missing" };
  }
  if (probe.status !== 0) {
    return { id: "gh", ok: false, version: "", errorKey: "gh_auth" };
  }
  return { id: "gh", ok: true, version: "ok", errorKey: "" };
}

const invoked =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  process.stdout.write(`${JSON.stringify(originGithub() || {}, null, 2)}\n`);
}
