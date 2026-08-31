#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bashExports,
  hubRegistry,
  isComplete,
  loadConfig,
  loadProject,
  localImageRepo,
  normalizeHubRepository,
  parseOlaresIdFromDesktop,
  publicConfig,
  repoRoot,
  saveConfig,
  validateAppName,
} from "../lib/dsh-config.mjs";
import { applyAppName } from "../lib/apply-app-name.mjs";
import { inspectEnv, printReport } from "../lib/preflight.mjs";
import { formatSshEndpoint, parseSshEndpoint, probeSsh } from "../lib/ssh-check.mjs";

const ROOT = repoRoot();
const PUBLIC = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const PORT = Number(process.env.SETUP_PANEL_PORT || 8788);
const WAIT = process.argv.includes("--wait");
const secrets = { sshPassword: "" };

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function fail(res, errorKey, extra = {}) {
  send(res, 400, { ok: false, errorKey, ...extra });
}

function cliHint(result) {
  const text = `${result?.stderr || ""}\n${result?.stdout || ""}`
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !/^password/i.test(l));
  if (!text) return "";
  return text.slice(0, 240);
}

function alreadyAuthed(result) {
  return /already-authenticated|already authenticated|remove the profile first|remove <id>/i.test(
    `${result?.stdout || ""}\n${result?.stderr || ""}`,
  );
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...headers,
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function run(cmd, args, { input, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: err.message });
    });
    if (input != null) child.stdin.end(input);
    else child.stdin.end();
  });
}

function profileStatus(olaresId) {
  const listed = spawnSync("olares-cli", ["profile", "list"], { encoding: "utf8" });
  if (listed.status !== 0) return "unknown";
  const id = String(olaresId || "").trim();
  if (!id) return "never";
  for (const line of listed.stdout.split(/\r?\n/)) {
    if (!line.includes(id)) continue;
    if (/\blogged-in\b/.test(line)) return "logged-in";
    if (/\bexpired\b/.test(line)) return "expired";
    if (/\binvalidated\b/.test(line)) return "invalidated";
    if (/\bnever\b/.test(line)) return "never";
  }
  return "never";
}

function isIpv4(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(value || ""));
}

function nodeRows(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.nodes)) return data.nodes;
  if (data.data) return nodeRows(data.data);
  if (data.result) return nodeRows(data.result);
  return [];
}

function archFromValue(value) {
  const raw = String(value || "").toLowerCase();
  if (/arm64|aarch64/.test(raw)) return "arm64";
  if (/amd64|x86_64/.test(raw)) return "amd64";
  return "";
}

function archFromNode(row) {
  if (!row || typeof row !== "object") return "";
  return (
    archFromValue(row.architecture) ||
    archFromValue(row.arch) ||
    archFromValue(row["ARCHITECTURE"]) ||
    archFromValue(row.status?.nodeInfo?.architecture)
  );
}

function archFromNodeTable(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  const header = lines[0].split(/\s+/);
  const archCol = header.findIndex((h) => /ARCH/i.test(h));
  for (const line of lines.slice(1)) {
    const parts = line.split(/\s+/);
    const candidate = archCol >= 0 ? parts[archCol] : parts[parts.length - 1];
    const arch = archFromValue(candidate);
    if (arch) return arch;
  }
  return "";
}

function ipFromNode(row) {
  if (!row || typeof row !== "object") return "";
  const direct = row.internalIP || row.internalIp || row["INTERNAL-IP"];
  if (isIpv4(direct)) return String(direct);
  const addrs = row.status?.addresses || row.addresses || [];
  if (Array.isArray(addrs)) {
    const internal = addrs.find((a) => a?.type === "InternalIP" && isIpv4(a.address));
    if (internal) return String(internal.address);
    const any = addrs.find((a) => isIpv4(a?.address));
    if (any) return String(any.address);
  }
  return "";
}

function ipFromNodeTable(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  const header = lines[0].split(/\s+/);
  const ipCol = header.findIndex((h) => /INTERNAL-?IP/i.test(h));
  for (const line of lines.slice(1)) {
    const parts = line.split(/\s+/);
    const candidate = ipCol >= 0 ? parts[ipCol] : parts.find((p) => isIpv4(p));
    if (isIpv4(candidate)) return candidate;
  }
  return "";
}

async function detectNode() {
  let lanIp = "";
  let arch = "";
  const json = await run("olares-cli", ["cluster", "node", "list", "-o", "json", "--all"]);
  if (json.code === 0) {
    try {
      for (const row of nodeRows(JSON.parse(json.stdout))) {
        if (!lanIp) lanIp = ipFromNode(row);
        if (!arch) arch = archFromNode(row);
        if (lanIp && arch) break;
      }
    } catch {
      /* fall through to table */
    }
  }
  if (!lanIp || !arch) {
    const table = await run("olares-cli", ["cluster", "node", "list", "--all"]);
    if (table.code === 0) {
      if (!lanIp) {
        lanIp = ipFromNodeTable(`INTERNAL-IP ARCHITECTURE\n${table.stdout}`) || ipFromNodeTable(table.stdout);
      }
      if (!arch) arch = archFromNodeTable(table.stdout);
    }
  }
  return { lanIp, arch };
}

function writeImagePlatform(arch) {
  if (!arch) return "";
  const platform = arch === "arm64" ? "linux/arm64" : "linux/amd64";
  const projectPath = join(ROOT, "project.json");
  const project = JSON.parse(readFileSync(projectPath, "utf8"));
  project.image = typeof project.image === "object" && project.image ? project.image : {};
  project.image.platform = platform;
  writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`);
  return platform;
}

function writeValuesImage(appName, repository) {
  const valuesPath = join(ROOT, "deploy", appName, "values.yaml");
  if (!existsSync(valuesPath)) return;
  const version = readChartVersion(appName);
  const text = readFileSync(valuesPath, "utf8").replace(/^image:\s*.+$/m, `image: ${repository}:${version}`);
  writeFileSync(valuesPath, text);
}

function writeLocalRepo(appName) {
  const projectPath = join(ROOT, "project.json");
  const project = JSON.parse(readFileSync(projectPath, "utf8"));
  project.image_repo = localImageRepo(appName);
  project.image_base_repo = `docker.io/local/${appName}-base`;
  writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`);
  writeValuesImage(appName, project.image_repo);
  return project.image_repo;
}

function writeMachines(cfg) {
  const user = String(cfg.olares.olaresId || "").split("@", 1)[0] || "user";
  const parsed = parseSshEndpoint(cfg.olares.sshHost || cfg.olares.lanIp || "", {
    user: cfg.olares.sshUser || "olares",
  });
  const sshUser = cfg.olares.sshUser || parsed.user || "olares";
  const host = parsed.host || cfg.olares.lanIp || "";
  const port = Number(cfg.olares.sshPort) > 0 ? Number(cfg.olares.sshPort) : parsed.port || 0;
  const dest = host ? `${sshUser}@${host}` : "";
  const machine = {
    id: 1,
    name: "olares",
    profile: cfg.olares.olaresId,
    olares_id: cfg.olares.olaresId,
    lan_ip: cfg.olares.lanIp || host || "",
    ssh: dest,
    dest_dir: "",
    kube_ns: `${cfg.appName}-${user}`,
  };
  if (port > 0 && port !== 22) machine.ssh_port = port;
  if (cfg.olares.sshIdentity) {
    machine.login = { root_ssh: `key ${cfg.olares.sshIdentity}` };
  }
  writeFileSync(join(ROOT, "machines.json"), `${JSON.stringify({ machines: [machine] }, null, 2)}\n`);
}

function rememberSshPassword(incoming) {
  const password = String(incoming || "");
  if (password) secrets.sshPassword = password;
  return secrets.sshPassword;
}

function applySshProbe(cfg, ssh) {
  cfg.olares.sshHost = ssh.host || cfg.olares.lanIp || "";
  cfg.olares.sshPort = Number(ssh.port) > 0 ? Number(ssh.port) : 0;
  cfg.olares.sshOk = Boolean(ssh.ok);
  cfg.olares.sshIdentity = ssh.identity || "";
  if (ssh.user) cfg.olares.sshUser = ssh.user;
  if (ssh.ok) secrets.sshPassword = "";
}

async function finish(cfg) {
  applyAppName(cfg.appName);
  if (cfg.imageMode === "push" && cfg.dockerHub.repository) {
    const projectPath = join(ROOT, "project.json");
    const project = JSON.parse(readFileSync(projectPath, "utf8"));
    project.image_repo = cfg.dockerHub.repository;
    writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`);
    writeValuesImage(cfg.appName, cfg.dockerHub.repository);
  } else {
    writeLocalRepo(cfg.appName);
  }
  writeMachines(cfg);
  cfg.complete = true;
  cfg.completedAt = new Date().toISOString();
  return saveConfig(cfg);
}

function readChartVersion(appName) {
  const path = join(ROOT, "deploy", appName, "Chart.yaml");
  if (!existsSync(path)) return "0.1.0";
  const line = readFileSync(path, "utf8").split(/\r?\n/).find((l) => l.startsWith("version:"));
  if (!line) return "0.1.0";
  return line.slice(line.indexOf(":") + 1).trim() || "0.1.0";
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/state") {
      const project = loadProject();
      const cfg = publicConfig();
      return send(res, 200, {
        project,
        config: cfg,
        complete: isComplete(cfg),
        preflight: inspectEnv(),
        profileStatus: profileStatus(cfg.olares.olaresId || parseOlaresIdFromDesktop(cfg.olares.desktopUrl)),
      });
    }

    if (req.method === "POST" && url.pathname === "/api/step/name") {
      const body = await readJson(req);
      const appName = String(body.appName || "").trim();
      const nameError = validateAppName(appName);
      if (nameError) {
        return fail(res, nameError);
      }
      const cfg = loadConfig();
      cfg.appName = appName;
      saveConfig(cfg);
      try {
        applyAppName(appName);
      } catch (err) {
        const key = /reserved/.test(String(err?.message || "")) ? "name_reserved" : "name_invalid";
        return fail(res, key);
      }
      return send(res, 200, { ok: true, config: publicConfig(cfg), project: loadProject() });
    }

    if (req.method === "POST" && url.pathname === "/api/step/docker") {
      const body = await readJson(req);
      const cfg = loadConfig();
      if (!body.skip) {
        return fail(res, "hub_probe_required");
      }
      cfg.dockerHub.skip = true;
      cfg.imageMode = "save";
      cfg.dockerHub.repository = "";
      cfg.dockerHub.username = "";
      cfg.dockerHub.loggedIn = false;
      saveConfig(cfg);
      return send(res, 200, { ok: true, config: publicConfig(cfg) });
    }

    if (req.method === "POST" && url.pathname === "/api/step/docker-probe") {
      const body = await readJson(req);
      const repository = String(body.repository || "").trim();
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!repository) return fail(res, "hub_repo_required");
      if (!username || !password) return fail(res, "hub_credentials_required");
      const repo = normalizeHubRepository(repository, loadConfig().appName || loadProject().name);
      if (repo.includes("docker.io/beclab/")) {
        return fail(res, "hub_beclab");
      }
      const registry = hubRegistry(repo);
      const result = await run("docker", ["login", registry, "-u", username, "--password-stdin"], {
        input: password,
      });
      if (result.code !== 0) {
        return fail(res, "hub_login_failed");
      }
      const cfg = loadConfig();
      cfg.dockerHub.skip = false;
      cfg.imageMode = "push";
      cfg.dockerHub.repository = repo;
      cfg.dockerHub.username = username;
      cfg.dockerHub.loggedIn = true;
      saveConfig(cfg);
      return send(res, 200, { ok: true, config: publicConfig(cfg) });
    }

    if (req.method === "POST" && url.pathname === "/api/step/ssh") {
      const body = await readJson(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const cfg = loadConfig();
      if (!username) return fail(res, "ssh_user_required");
      // IP always comes from olares-cli; the panel never accepts a hand-typed host.
      const detected = await detectNode();
      const host = detected.lanIp || cfg.olares.lanIp || cfg.olares.sshHost || "";
      if (!host) return fail(res, "lan_ip_required");
      const prevHost = cfg.olares.sshHost || cfg.olares.lanIp || "";
      const prevUser = cfg.olares.sshUser || "";
      const prevPort = Number(cfg.olares.sshPort) || 0;
      if (detected.lanIp) {
        cfg.olares.lanIp = detected.lanIp;
        cfg.olares.sshHost = detected.lanIp;
      }
      if (detected.arch) cfg.platform = writeImagePlatform(detected.arch) || cfg.platform;
      let port = Number(body.port);
      // Client always sends a number; 0 / 22 / invalid means OpenSSH default.
      if (!Number.isFinite(port) || port <= 0 || port === 22) port = 0;
      if (username !== prevUser || host !== prevHost || port !== prevPort) {
        cfg.olares.sshOk = false;
        cfg.olares.sshIdentity = "";
      }
      if (!password && !cfg.olares.sshOk) {
        return fail(res, "ssh_password_required");
      }
      rememberSshPassword(password);
      const ssh = probeSsh(host, {
        user: username,
        port,
        password: secrets.sshPassword,
      });
      cfg.olares.sshUser = username;
      applySshProbe(cfg, ssh);
      // Keep sshHost locked to the detected LAN IP even if a wired fallback answered.
      if (ssh.ok) cfg.olares.sshHost = host;
      saveConfig(cfg);
      if (!ssh.ok) {
        return fail(res, ssh.errorKey || "ssh_required", {
          lanIp: host,
          endpoint: formatSshEndpoint({ user: username, host, port }),
        });
      }
      return send(res, 200, { ok: true, config: publicConfig(cfg) });
    }

    if (req.method === "POST" && url.pathname === "/api/step/olares") {
      const body = await readJson(req);
      const desktopUrl = String(body.desktopUrl || "").trim();
      const password = String(body.password || "");
      const totp = String(body.totp || "").replace(/\D/g, "").slice(0, 6);
      const olaresId = String(body.olaresId || "").trim() || parseOlaresIdFromDesktop(desktopUrl);
      if (!desktopUrl) return fail(res, "desktop_required");
      if (!olaresId) {
        return fail(res, "olares_id_parse");
      }
      const status = profileStatus(olaresId);
      const canReuse = status === "logged-in" || status === "expired";
      if (!password && !canReuse) {
        return fail(res, "olares_password_required");
      }
      if (password && !canReuse) {
        const args = ["profile", "login", "--olares-id", olaresId, "--password-stdin"];
        if (totp.length === 6) args.push("--totp", totp);
        const result = await run("olares-cli", args, { input: `${password}\n` });
        if (result.code !== 0 && !alreadyAuthed(result)) {
          const needs2fa = /totp|2fa|otp|二级/i.test(`${result.stdout}\n${result.stderr}`);
          return fail(res, needs2fa ? "olares_login_2fa" : "olares_login_failed", {
            error: cliHint(result),
          });
        }
      }
      const used = await run("olares-cli", ["profile", "use", olaresId]);
      if (used.code !== 0) {
        return fail(res, "olares_login_failed", { error: cliHint(used) });
      }
      const detected = await detectNode();
      const cfg = loadConfig();
      if (cfg.imageMode === "save" && !detected.lanIp) {
        return fail(res, "lan_ip_required", { olaresId });
      }
      if (detected.lanIp && detected.lanIp !== cfg.olares.lanIp) {
        cfg.olares.sshOk = false;
        cfg.olares.sshIdentity = "";
        cfg.olares.sshPort = 0;
      }
      cfg.olares.desktopUrl = desktopUrl.includes("://") ? desktopUrl : `https://${desktopUrl}`;
      cfg.olares.olaresId = olaresId;
      cfg.olares.lanIp = detected.lanIp;
      cfg.olares.sshHost = detected.lanIp;
      cfg.olares.loggedIn = true;
      cfg.olares.twoFactor = totp.length === 6;
      cfg.platform = writeImagePlatform(detected.arch);
      saveConfig(cfg);
      return send(res, 200, {
        ok: true,
        config: publicConfig(cfg),
        detectedLanIp: detected.lanIp,
        platform: cfg.platform,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/finish") {
      const cfg = loadConfig();
      if (cfg.imageMode === "save") {
        const detected = await detectNode();
        if (detected.lanIp) {
          cfg.olares.lanIp = detected.lanIp;
          cfg.olares.sshHost = detected.lanIp;
        }
        if (detected.arch) cfg.platform = writeImagePlatform(detected.arch);
      }
      if (cfg.imageMode === "save" && !cfg.olares.lanIp) {
        return fail(res, "lan_ip_required");
      }
      if (cfg.imageMode === "save") {
        const host = cfg.olares.lanIp || cfg.olares.sshHost;
        const ssh = probeSsh(host, {
          user: cfg.olares.sshUser || "olares",
          port: cfg.olares.sshPort,
          password: secrets.sshPassword,
        });
        applySshProbe(cfg, ssh);
        if (ssh.ok) cfg.olares.sshHost = host;
        if (!ssh.ok) {
          saveConfig(cfg);
          return fail(res, ssh.errorKey || "ssh_required");
        }
      }
      if (validateAppName(cfg.appName) || !cfg.olares.olaresId) {
        return fail(res, "config_incomplete");
      }
      const saved = await finish(cfg);
      send(res, 200, { ok: true, config: saved, complete: true });
      setTimeout(() => {
        closePanelWindows(PORT);
        if (WAIT) server.close(() => process.exit(0));
      }, 800);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/exports") {
      return send(res, 200, { exports: bashExports() }, { "content-type": "text/plain; charset=utf-8" });
    }

    if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });

    let file = url.pathname === "/" ? "/index.html" : url.pathname;
    file = join(PUBLIC, file.replace(/\.\./g, ""));
    if (!file.startsWith(PUBLIC) || !existsSync(file)) return send(res, 404, "not found");
    const type = MIME[extname(file)] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      "cache-control": "no-store",
    });
    res.end(readFileSync(file));
  } catch (err) {
    send(res, 500, { ok: false, errorKey: "panel_error" });
    console.error(err instanceof Error ? err.message : err);
  }
});

function macAppExists(name) {
  return existsSync(`/Applications/${name}.app`) || existsSync(`${homedir()}/Applications/${name}.app`);
}

function osascript(source) {
  return spawnSync("osascript", ["-e", source], { encoding: "utf8" });
}

function openPanel(href) {
  if (process.platform === "darwin") {
    for (const name of ["Google Chrome", "Microsoft Edge", "Brave Browser", "Chromium"]) {
      if (!macAppExists(name)) continue;
      // Regular window, not --app=. App-mode puts the close button on a
      // compact title bar; password autofill / Security Agent focus return
      // can synthesize a click at (0,0) and close the panel while typing.
      const opened = spawnSync("open", ["-na", name, "--args", "--new-window", href], { encoding: "utf8" });
      if (opened.status === 0) return;
    }
    osascript(`tell application "Safari"
  activate
  make new document with properties {URL:"${href}"}
end tell`);
    return;
  }
  const opener = process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", href] : [href];
  spawn(opener, args, { stdio: "ignore", detached: true }).unref();
}

function closePanelWindows(port) {
  if (process.platform !== "darwin") return;
  const needle = `127.0.0.1:${port}`;
  const closeTabs = (app) => `tell application "${app}"
  if it is not running then return
  repeat with w in windows
    repeat with t in tabs of w
      try
        if (URL of t) contains "${needle}" then close t
      end try
    end repeat
  end repeat
end tell`;
  osascript(closeTabs("Safari"));
  for (const name of ["Google Chrome", "Microsoft Edge", "Brave Browser", "Chromium"]) {
    if (macAppExists(name)) osascript(closeTabs(name));
  }
}

async function existingPanel(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/state`);
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.project || data?.config);
  } catch {
    return false;
  }
}

const env = inspectEnv();
printReport(env);
if (!env.ok) process.exit(1);

const href = `http://127.0.0.1:${PORT}/`;
server.on("error", async (err) => {
  if (err?.code !== "EADDRINUSE") {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  if (await existingPanel(PORT)) {
    console.log(`DSH 配置面板已在运行: ${href}`);
    openPanel(href);
    process.exit(0);
    return;
  }
  console.error(`Port ${PORT} is already in use. Stop the other process or set SETUP_PANEL_PORT.`);
  process.exit(1);
});
server.listen(PORT, "127.0.0.1", () => {
  console.log(`DSH 配置面板: ${href}`);
  openPanel(href);
});
