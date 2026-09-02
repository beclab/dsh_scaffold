#!/usr/bin/env node
/**
 * Laptop env gate: Node.js 22+, olares-cli logged in, GitHub fork as origin, gh auth.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inspectGh, inspectGithubFork } from "./github.mjs";

export const NODE_MIN_MAJOR = 22;

export function inspectEnv() {
  const checks = [inspectNode(), inspectCli(), inspectOlaresProfile(), inspectGithubFork(), inspectGh()];
  return { ok: checks.every((c) => c.ok), checks };
}

export function inspectNode() {
  const version = String(process.versions.node || "");
  const major = Number(version.split(".")[0]);
  if (!version || Number.isNaN(major)) {
    return { id: "node", ok: false, version: "", errorKey: "node_missing" };
  }
  if (major < NODE_MIN_MAJOR) {
    return { id: "node", ok: false, version, errorKey: "node_too_old" };
  }
  return { id: "node", ok: true, version, errorKey: "" };
}

export function inspectCli() {
  const probe = spawnSync("olares-cli", ["--version"], {
    encoding: "utf8",
    timeout: 15_000,
  });
  if (probe.error?.code === "ENOENT") {
    return { id: "olares-cli", ok: false, version: "", bin: "", errorKey: "cli_missing" };
  }
  const text = `${probe.stdout || ""}\n${probe.stderr || ""}`;
  const version = parseCliVersion(text);
  if ((probe.status === 0 || version) && !probe.error) {
    return {
      id: "olares-cli",
      ok: true,
      version: version || "ok",
      bin: "",
      errorKey: "",
    };
  }
  return { id: "olares-cli", ok: false, version: "", bin: "", errorKey: "cli_broken" };
}

export function inspectOlaresProfile() {
  const probe = spawnSync("olares-cli", ["profile", "list"], {
    encoding: "utf8",
    timeout: 15_000,
  });
  if (probe.error?.code === "ENOENT") {
    return { id: "olares", ok: false, version: "", errorKey: "cli_missing" };
  }
  const text = `${probe.stdout || ""}\n${probe.stderr || ""}`;
  if (/logged-in|expired/i.test(text)) {
    return { id: "olares", ok: true, version: "ok", errorKey: "" };
  }
  return { id: "olares", ok: false, version: "", errorKey: "olares_login_required" };
}

export function parseCliVersion(text) {
  const match = String(text || "").match(/olares-cli version\s+(\d+\.\d+\.\d+)/i);
  if (match) return match[1];
  const loose = String(text || "").match(/\b(\d+\.\d+\.\d+)\b/);
  return loose ? loose[1] : "";
}

export function printReport(env = inspectEnv(), stream = process.stderr) {
  const zh = isZh();
  const title = env.ok
    ? zh
      ? "环境检查通过"
      : "Environment check passed"
    : zh
      ? "环境检查未通过。需要 Node.js 22+、已登录的 olares-cli、你自己的 GitHub fork（origin）和已登录的 gh。"
      : "Environment check failed. Need Node.js 22+, a logged-in olares-cli, your GitHub fork as origin, and a logged-in gh.";
  stream.write(`${title}\n`);
  for (const check of env.checks) {
    const mark = check.ok ? "ok" : "fail";
    const ver = check.version || (zh ? "未安装" : "missing");
    stream.write(`  ${pad(check.id, 12)} ${pad(ver, 24)} ${mark}`);
    if (!check.ok) stream.write(`  ${hint(check.errorKey, zh)}`);
    stream.write("\n");
  }
  return env;
}

export function assertEnvOrExit() {
  const env = inspectEnv();
  printReport(env);
  if (!env.ok) process.exit(1);
  return env;
}

function hint(errorKey, zh) {
  const table = zh
    ? {
        node_missing: "请安装 Node.js 22+ 并保证 node 在 PATH 里",
        node_too_old: "需要 Node.js 22+",
        cli_missing: "请先运行 __agent__/skills/olares-cli-setup/scripts/ensure-olares-cli.sh",
        cli_broken: "olares-cli 无法运行，请重装",
        github_origin_missing: "这个目录没有 git origin。请 fork 模板并 clone 你的 fork",
        github_not_github: "origin 必须是 github.com 上的仓库",
        github_fork_required: "请先 fork 到你自己的 GitHub，不要在 beclab/dsh_scaffold 上推送 overlay",
        gh_missing: "请安装 GitHub CLI（gh），并在本机终端执行 gh auth login",
        gh_auth: "请在本机终端执行 gh auth login",
        olares_login_required: "请在本机终端执行 olares-cli profile login",
      }
    : {
        node_missing: "Install Node.js 22+ and put node on PATH",
        node_too_old: "Node.js 22+ is required",
        cli_missing: "Run __agent__/skills/olares-cli-setup/scripts/ensure-olares-cli.sh first",
        cli_broken: "olares-cli did not run; reinstall it",
        github_origin_missing: "No git origin. Fork the template and clone your fork",
        github_not_github: "origin must be a github.com repository",
        github_fork_required: "Fork to your own GitHub; do not push overlay work to beclab/dsh_scaffold",
        gh_missing: "Install GitHub CLI (gh) and run gh auth login in your terminal",
        gh_auth: "Run gh auth login in your terminal",
        olares_login_required: "Run olares-cli profile login in your terminal",
      };
  return table[errorKey] || errorKey;
}

function isZh() {
  return /^zh/i.test(process.env.LC_ALL || process.env.LANG || "");
}

function pad(value, width) {
  const s = String(value || "");
  return s.length >= width ? s : `${s}${" ".repeat(width - s.length)}`;
}

const invoked =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  const env = inspectEnv();
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(env, null, 2)}\n`);
  } else {
    printReport(env, process.stdout);
  }
  process.exit(env.ok ? 0 : 1);
}
