#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const WIRED = "192.168.88.1";

function sshOnce(host, identity) {
  const args = [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    "-o",
    "StrictHostKeyChecking=accept-new",
  ];
  if (identity) args.push("-i", identity, "-o", "IdentitiesOnly=yes");
  args.push(`root@${host}`, "true");
  const probe = spawnSync("ssh", args, { encoding: "utf8", timeout: 12_000 });
  return probe.status === 0;
}

function candidateKeys() {
  return ["", join(homedir(), ".ssh/olares_flowstudio"), join(homedir(), ".ssh/id_ed25519"), join(homedir(), ".ssh/id_rsa")].filter(
    (p, i) => i === 0 || existsSync(p),
  );
}

function pingOk(host) {
  const wait = process.platform === "darwin" ? ["-W", "500"] : ["-W", "1"];
  const probe = spawnSync("ping", ["-c", "1", ...wait, host], { encoding: "utf8", timeout: 3000 });
  return probe.status === 0;
}

export function probeSsh(lanIp) {
  const hosts = [];
  if (lanIp && lanIp !== WIRED) {
    if (pingOk(WIRED)) hosts.push(WIRED);
    hosts.push(lanIp);
  } else if (lanIp) {
    hosts.push(lanIp);
  } else if (pingOk(WIRED)) {
    hosts.push(WIRED);
  }
  for (const host of hosts) {
    for (const identity of candidateKeys()) {
      if (sshOnce(host, identity)) {
        return { ok: true, host, identity, errorKey: "" };
      }
    }
  }
  return { ok: false, host: lanIp || "", identity: "", errorKey: "ssh_required" };
}
