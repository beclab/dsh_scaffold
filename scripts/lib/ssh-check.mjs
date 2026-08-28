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

function sshTarget(user, host) {
  return `${user}@${host}`;
}

function sshOnce(user, host, identity) {
  const args = [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    "-o",
    "StrictHostKeyChecking=accept-new",
  ];
  if (identity) args.push("-i", identity, "-o", "IdentitiesOnly=yes");
  args.push(sshTarget(user, host), "true");
  const probe = spawnSync("ssh", args, { encoding: "utf8", timeout: 12_000 });
  return probe.status === 0;
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
  const hosts = [];
  const add = (host) => {
    if (host && !hosts.includes(host) && reachable(host)) hosts.push(host);
  };
  add(WIRED);
  add(lanIp);
  if (!hosts.length && lanIp) hosts.push(lanIp);
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

function sshWithPassword(user, host, password, remoteCommand) {
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

function installAuthorizedKey(user, host, password, identity) {
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
  return sshWithPassword(user, host, password, remote).ok;
}

function tryKeys(user, host) {
  for (const identity of candidateKeys()) {
    if (sshOnce(user, host, identity)) {
      return { ok: true, host, user, identity, errorKey: "" };
    }
  }
  return null;
}

/**
 * Probe SSH. Password is used only to log in and install the laptop public key;
 * it is never written to disk by this module.
 */
export function probeSsh(lanIp, options = {}) {
  const user = String(options.user || "root").trim() || "root";
  const password = String(options.password || "");
  const hosts = hostsFor(lanIp);
  let passwordOk = false;
  let lastError = hosts.length ? "ssh_required" : "ssh_unreachable";

  for (const host of hosts) {
    const keyed = tryKeys(user, host);
    if (keyed) return keyed;
  }

  if (!password) {
    return { ok: false, host: lanIp || hosts[0] || "", user, identity: "", errorKey: lastError };
  }

  for (const host of hosts) {
    const attempt = sshWithPassword(user, host, password, "true");
    if (!attempt.ok) {
      lastError = attempt.errorKey || lastError;
      continue;
    }
    passwordOk = true;
    const identity = ensureLocalKey();
    if (!identity) {
      return { ok: false, host, user, identity: "", errorKey: "ssh_keygen_failed" };
    }
    if (installAuthorizedKey(user, host, password, identity) && sshOnce(user, host, identity)) {
      return { ok: true, host, user, identity, errorKey: "" };
    }
    lastError = "ssh_key_install_failed";
  }

  return {
    ok: false,
    host: lanIp || hosts[0] || "",
    user,
    identity: "",
    errorKey: passwordOk ? "ssh_key_install_failed" : lastError || "ssh_login_failed",
  };
}
