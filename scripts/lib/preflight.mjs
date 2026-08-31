#!/usr/bin/env node
/**
 * Laptop env gate: Node.js 22+, olares-cli, Docker (engine running), olares-image.
 * Used by `npm run preflight` and `npm run configure`.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, repoRoot } from "./dsh-config.mjs";
import { formatSshEndpoint, probeSsh } from "./ssh-check.mjs";

export const NODE_MIN_MAJOR = 22;

export function inspectEnv() {
  const checks = [inspectNode(), inspectCli(), inspectDocker(), inspectImageSkill()];
  const cfg = loadConfig();
  if (cfg.imageMode !== "push" && cfg.olares?.lanIp) {
    checks.push(
      inspectSsh(cfg.olares.sshHost || cfg.olares.lanIp, cfg.olares.sshUser || "olares", cfg.olares.sshPort),
    );
  }
  const required = checks.filter((c) => c.id !== "ssh");
  return { ok: required.every((c) => c.ok), checks };
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

export function inspectDocker() {
  const client = spawnSync("docker", ["version", "--format", "{{.Client.Version}}"], {
    encoding: "utf8",
    timeout: 15_000,
  });
  if (client.error?.code === "ENOENT") {
    return { id: "docker", ok: false, version: "", errorKey: "docker_missing" };
  }
  const version = String(client.stdout || "").trim();
  if (client.status !== 0 && !version) {
    return { id: "docker", ok: false, version: "", errorKey: "docker_broken" };
  }
  const info = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
    encoding: "utf8",
    timeout: 20_000,
  });
  if (info.error || info.status !== 0) {
    return { id: "docker", ok: false, version, errorKey: "docker_daemon" };
  }
  return { id: "docker", ok: true, version: version || String(info.stdout || "").trim(), errorKey: "" };
}

export function inspectImageSkill() {
  const printed = spawnSync("node", [join(repoRoot(), "__agent__/install.mjs"), "--print-global"], {
    encoding: "utf8",
    timeout: 10_000,
  });
  const globalDir = printed.status === 0 ? printed.stdout.trim() : "";
  const candidates = [
    globalDir && join(globalDir, "olares-image/scripts/local-test.sh"),
    join(homedir(), ".cursor/skills/olares-image/scripts/local-test.sh"),
    join(homedir(), ".agents/skills/olares-image/scripts/local-test.sh"),
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (found) {
    return { id: "olares-image", ok: true, version: "ok", errorKey: "" };
  }
  return { id: "olares-image", ok: false, version: "", errorKey: "image_skill_missing" };
}

export function inspectSsh(host, user, port) {
  const probe = probeSsh(host, { user, port });
  const who = formatSshEndpoint({
    user: probe.user || user || "olares",
    host: probe.host || host || "",
    port: probe.port || port || 0,
  });
  if (probe.ok) {
    return { id: "ssh", ok: true, version: who, errorKey: "" };
  }
  return { id: "ssh", ok: false, version: who.replace(/@$/, "") || host || "", errorKey: probe.errorKey || "ssh_required" };
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
      ? "环境检查未通过，装好后再运行 npm run configure"
      : "Environment check failed. Install the missing tools, then run npm run configure";
  stream.write(`${title}\n`);
  for (const check of env.checks) {
    const mark = check.ok ? "ok" : "fail";
    const ver = check.version || (zh ? "未安装" : "missing");
    stream.write(`  ${pad(check.id, 12)} ${pad(ver, 10)} ${mark}`);
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
        docker_missing: "打包镜像需要 Docker，请先运行 scripts/ensure-docker.sh",
        docker_daemon: "Docker 已安装但引擎未就绪，请打开 Docker Desktop 后再试",
        docker_broken: "docker 无法运行，请重装 Docker Desktop",
        image_skill_missing: "缺少 olares-image。请运行 __agent__/skills/olares-cli-setup/scripts/ensure-olares-cli.sh --with-skills",
        ssh_required: "本机无法 SSH 到节点。回到配置面板填写 SSH 用户名和密码，或改用 Hub 推送",
        ssh_login_failed: "SSH 用户名或密码不对（默认密码 olares；改过则用 Vault）",
        ssh_unreachable: "连不上节点 SSH。确认机器在线后再试",
        ssh_keygen_failed: "无法在本机生成 SSH 公钥",
        ssh_key_install_failed: "SSH 密码可用，但没能写入公钥（authorized_keys 可能是 root 属主）",
      }
    : {
        node_missing: "Install Node.js 22+ and put node on PATH",
        node_too_old: "Node.js 22+ is required",
        cli_missing: "Run __agent__/skills/olares-cli-setup/scripts/ensure-olares-cli.sh first",
        cli_broken: "olares-cli did not run; reinstall it",
        docker_missing: "Docker is required to build/save images. Run scripts/ensure-docker.sh",
        docker_daemon: "Docker is installed but the engine is down. Start Docker Desktop",
        docker_broken: "docker did not run; reinstall Docker Desktop",
        image_skill_missing: "olares-image is missing. Run __agent__/skills/olares-cli-setup/scripts/ensure-olares-cli.sh --with-skills",
        ssh_required: "Cannot SSH to the node. Reopen the panel and enter SSH username and password, or push via Hub",
        ssh_login_failed: "SSH username or password was rejected (default password olares; Vault if changed)",
        ssh_unreachable: "Could not reach SSH on the node. Confirm it is online and retry",
        ssh_keygen_failed: "Could not generate a local SSH key",
        ssh_key_install_failed: "SSH password worked, but the public key could not be written (authorized_keys may be root-owned)",
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
