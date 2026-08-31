#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const WIRED = "192.168.88.1";
export const DSH_SSH_KEY = join(homedir(), ".ssh/dsh_olares");

export function normalizeSshHost(value) {
  let host = String(value || "").trim();
  if (!host) return "";
  host = host.replace(/^ssh:\/\//i, "");
  if (host.includes("@")) host = host.slice(host.lastIndexOf("@") + 1);
  if (/^\[[\da-fA-F:]+\]:\d+$/.test(host)) host = host.slice(1, host.indexOf("]"));
  else if (/:\d+$/.test(host) && !host.includes("::")) host = host.replace(/:\d+$/, "");
  return host;
}

export function isSshHost(value) {
  const host = normalizeSshHost(value);
  if (!host || host.length > 253) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return host.split(".").every((part) => Number(part) <= 255);
  }
  return /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(
    host,
  );
}

/**
 * Parse host forms used by the panel / config / machines.json:
 *   host | host:port | user@host | user@host:port
 *   ssh://user@host:port | [ipv6]:port | user@[ipv6]:port
 */
export function parseSshEndpoint(raw, defaults = {}) {
  const fallbackUser = String(defaults.user || "").trim();
  let text = String(raw || "").trim();
  if (!text) {
    return { user: fallbackUser || "root", host: "", port: 0 };
  }

  if (/^ssh:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      const user = decodeURIComponent(url.username || fallbackUser || "root") || "root";
      const host = url.hostname || "";
      const port = url.port ? Number(url.port) : 0;
      return { user, host, port: Number.isFinite(port) ? port : 0 };
    } catch {
      text = text.replace(/^ssh:\/\//i, "");
    }
  }

  let user = fallbackUser;
  let rest = text;
  const at = text.lastIndexOf("@");
  if (at > 0) {
    user = text.slice(0, at).trim() || fallbackUser;
    rest = text.slice(at + 1).trim();
  }

  if (rest.startsWith("[")) {
    const close = rest.indexOf("]");
    if (close > 0) {
      const host = rest.slice(1, close);
      let port = 0;
      const after = rest.slice(close + 1);
      if (after.startsWith(":")) {
        const n = Number(after.slice(1));
        if (Number.isFinite(n) && n > 0) port = n;
      }
      return { user: user || "root", host, port };
    }
  }

  // host:port — not bare IPv6 (those need brackets)
  if (rest.includes(":") && !rest.includes("::")) {
    const parts = rest.split(":");
    if (parts.length === 2 && /^\d+$/.test(parts[1])) {
      const port = Number(parts[1]);
      return {
        user: user || "root",
        host: parts[0],
        port: Number.isFinite(port) && port > 0 ? port : 0,
      };
    }
  }

  return { user: user || "root", host: rest, port: 0 };
}

export function formatSshEndpoint({ user, host, port } = {}) {
  if (!host) return user || "root";
  const h = host.includes(":") ? `[${host}]` : host;
  const who = `${user || "root"}@${h}`;
  const n = Number(port) || 0;
  return n > 0 && n !== 22 ? `${who}:${n}` : who;
}

function sshTarget(user, host) {
  const h = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `${user}@${h}`;
}

function portArgs(port) {
  const n = Number(port) || 0;
  return n > 0 ? ["-p", String(n)] : [];
}

function sshOnce(user, host, port, identity) {
  const args = [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    "-o",
    "StrictHostKeyChecking=accept-new",
    ...portArgs(port),
  ];
  if (identity) args.push("-i", identity, "-o", "IdentitiesOnly=yes");
  args.push(sshTarget(user, host), "true");
  const probe = spawnSync("ssh", args, { encoding: "utf8", timeout: 12_000 });
  if (probe.status === 0) return { ok: true, errorKey: "" };
  return { ok: false, errorKey: sshErrorKind(probe.stderr) };
}

function candidateKeys() {
  return ["", DSH_SSH_KEY, join(homedir(), ".ssh/olares_flowstudio"), join(homedir(), ".ssh/id_ed25519"), join(homedir(), ".ssh/id_rsa")].filter(
    (p, i) => i === 0 || existsSync(p),
  );
}

function pingOk(host) {
  const wait = process.platform === "darwin" ? ["-W", "500"] : ["-W", "1"];
  const probe = spawnSync("ping", ["-c", "1", ...wait, host], { encoding: "utf8", timeout: 3000 });
  return probe.status === 0;
}

function reachable(host) {
  return Boolean(host) && pingOk(host);
}

function hostsFor(lanIp) {
  const preferred = parseSshEndpoint(lanIp).host;
  const hosts = [];
  // Always try the configured / Desktop address first (ICMP may be blocked).
  if (preferred) hosts.push(preferred);
  // Wired USB Ethernet is only a fallback when that interface answers ping.
  if (WIRED !== preferred && reachable(WIRED)) hosts.push(WIRED);
  return hosts;
}

function withAskpass(password, run) {
  const dir = mkdtempSync(join(tmpdir(), "dsh-askpass-"));
  const script = join(dir, "askpass.sh");
  writeFileSync(script, "#!/bin/sh\nprintf '%s\\n' \"$DSH_SSH_ASKPASS_PASSWORD\"\n");
  chmodSync(script, 0o700);
  try {
    return run({
      ...process.env,
      DISPLAY: process.env.DISPLAY || ":0",
      SSH_ASKPASS: script,
      SSH_ASKPASS_REQUIRE: "force",
      DSH_SSH_ASKPASS_PASSWORD: password,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function sshErrorKind(stderr) {
  const text = String(stderr || "");
  if (/connection refused|operation timed out|network is unreachable|no route to host/i.test(text)) {
    return "ssh_unreachable";
  }
  return "ssh_login_failed";
}

function sshWithPassword(user, host, port, password, remoteCommand) {
  return withAskpass(password, (env) => {
    const probe = spawnSync(
      "ssh",
      [
        "-o",
        "ConnectTimeout=8",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "PreferredAuthentications=password,keyboard-interactive",
        "-o",
        "PubkeyAuthentication=no",
        "-o",
        "NumberOfPasswordPrompts=1",
        ...portArgs(port),
        sshTarget(user, host),
        remoteCommand,
      ],
      {
        encoding: "utf8",
        timeout: 20_000,
        stdio: ["ignore", "pipe", "pipe"],
        env,
      },
    );
    return { ok: probe.status === 0, errorKey: probe.status === 0 ? "" : sshErrorKind(probe.stderr) };
  });
}

function ensureLocalKey() {
  const dir = join(homedir(), ".ssh");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (existsSync(DSH_SSH_KEY) && existsSync(`${DSH_SSH_KEY}.pub`)) return DSH_SSH_KEY;
  const made = spawnSync("ssh-keygen", ["-t", "ed25519", "-f", DSH_SSH_KEY, "-N", "", "-C", "dsh-scaffold", "-q"], {
    encoding: "utf8",
    timeout: 10_000,
  });
  if (made.status !== 0 || !existsSync(`${DSH_SSH_KEY}.pub`)) return "";
  return DSH_SSH_KEY;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function installAuthorizedKey(user, host, port, password, identity) {
  const pubPath = `${identity}.pub`;
  if (!existsSync(pubPath)) return false;
  const pub = readFileSync(pubPath, "utf8").trim();
  if (!pub) return false;
  const quoted = shellQuote(pub);
  const remote = [
    "umask 077",
    "mkdir -p ~/.ssh",
    `grep -Fqx ${quoted} ~/.ssh/authorized_keys 2>/dev/null || printf '%s\\n' ${quoted} >> ~/.ssh/authorized_keys`,
    "chmod 700 ~/.ssh",
    "chmod 600 ~/.ssh/authorized_keys",
  ].join(" && ");
  return sshWithPassword(user, host, port, password, remote).ok;
}

function tryKeys(user, host, port) {
  let lastError = "";
  for (const identity of candidateKeys()) {
    const attempt = sshOnce(user, host, port, identity);
    if (attempt.ok) {
      return { ok: true, host, port, user, identity, errorKey: "" };
    }
    lastError = attempt.errorKey || lastError;
  }
  return { ok: false, host, port, user, identity: "", errorKey: lastError || "ssh_required" };
}

/**
 * Probe SSH. Password is used only to log in and install the laptop public key;
 * it is never written to disk by this module.
 *
 * `lanIp` may be a bare IP/hostname or include a port (`host:port` / `ssh://…`).
 */
export function probeSsh(lanIp, options = {}) {
  const parsed = parseSshEndpoint(lanIp, { user: options.user });
  const user = String(options.user || parsed.user || "root").trim() || "root";
  const port = Number(options.port || parsed.port || 0) || 0;
  const hosts = hostsFor(parsed.host || lanIp);
  let passwordOk = false;
  let lastError = hosts.length ? "ssh_required" : "ssh_unreachable";
  const password = String(options.password || "");

  for (const host of hosts) {
    const keyed = tryKeys(user, host, port);
    if (keyed.ok) return keyed;
    if (keyed.errorKey) lastError = keyed.errorKey;
  }

  if (!password) {
    return {
      ok: false,
      host: parsed.host || lanIp || hosts[0] || "",
      port,
      user,
      identity: "",
      errorKey: lastError,
    };
  }

  for (const host of hosts) {
    const attempt = sshWithPassword(user, host, port, password, "true");
    if (!attempt.ok) {
      lastError = attempt.errorKey || lastError;
      continue;
    }
    passwordOk = true;
    const identity = ensureLocalKey();
    if (!identity) {
      return { ok: false, host, port, user, identity: "", errorKey: "ssh_keygen_failed" };
    }
    if (
      installAuthorizedKey(user, host, port, password, identity) &&
      sshOnce(user, host, port, identity).ok
    ) {
      return { ok: true, host, port, user, identity, errorKey: "" };
    }
    lastError = "ssh_key_install_failed";
  }

  return {
    ok: false,
    host: parsed.host || lanIp || hosts[0] || "",
    port,
    user,
    identity: "",
    errorKey: passwordOk ? "ssh_key_install_failed" : lastError || "ssh_login_failed",
  };
}
