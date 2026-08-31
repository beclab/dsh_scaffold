#!/usr/bin/env node
/**
 * Headless walkthrough of the local configure panel.
 * Uses machine-1 inventory for Desktop URL / Olares ID.
 * SSH password: DSH_SSH_PASSWORD, else default node password (not printed).
 * Never prints secrets.
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { emptyConfig, saveConfig, loadConfig, CONFIG_PATH } from "./lib/dsh-config.mjs";

const chromeCdpPath = join(homedir(), ".cursor/skills/olares-browser-login/scripts/lib/chrome-cdp.mjs");
const { withBrowser } = await import(pathToFileURL(chromeCdpPath).href);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PANEL = "http://127.0.0.1:8788/";
const OUT = join(ROOT, ".cache/e2e-configure");
const REPORT = join(OUT, "report.json");

function sshPassword() {
  return process.env.DSH_SSH_PASSWORD || "olares";
}

function loadMachine1() {
  const path = join(ROOT, "machines.json");
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, "utf8"));
  return (data.machines || []).find((m) => String(m.id) === "1") || data.machines?.[0] || null;
}

function backupConfig() {
  mkdirSync(OUT, { recursive: true });
  if (existsSync(CONFIG_PATH)) {
    copyFileSync(CONFIG_PATH, join(OUT, "config.backup.json"));
  }
  if (existsSync(join(ROOT, "machines.json"))) {
    copyFileSync(join(ROOT, "machines.json"), join(OUT, "machines.backup.json"));
  }
}

function seedIncompleteConfig(machine) {
  const cfg = emptyConfig();
  cfg.appName = "dshscaffold";
  cfg.imageMode = "save";
  cfg.dockerHub.skip = true;
  if (machine?.olares_id || machine?.profile) {
    cfg.olares.olaresId = machine.olares_id || machine.profile;
  }
  const desktop =
    process.env.DSH_DESKTOP_URL ||
    loadConfig().olares?.desktopUrl ||
    (cfg.olares.olaresId ? `https://desktop.${String(cfg.olares.olaresId).replace("@", ".")}` : "");
  cfg.olares.desktopUrl = desktop;
  cfg.olares.sshUser = "olares";
  cfg.complete = false;
  cfg.olares.sshOk = false;
  cfg.olares.lanIp = "";
  cfg.olares.sshHost = "";
  saveConfig(cfg);
  return cfg;
}

async function ensurePanel() {
  try {
    const res = await fetch(PANEL);
    if (res.ok) return;
  } catch {
    /* start */
  }
  const child = spawn("npm", ["run", "configure"], {
    cwd: ROOT,
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(PANEL);
      if (res.ok) return;
    } catch {
      /* retry */
    }
  }
  throw new Error("configure panel did not come up on :8788");
}

async function stepSnapshot(page, id) {
  const shot = join(OUT, `${id}.png`);
  await page.screenshot(shot, { fullPage: true });
  const info = await page.evaluate(() => {
    const visible = [...document.querySelectorAll(".card")].find((c) => !c.classList.contains("hidden"));
    const lede = visible?.querySelector(".lede")?.textContent?.trim() || "";
    const title = visible?.querySelector("h2")?.textContent?.trim() || "";
    const error = visible?.querySelector(".error")?.textContent?.trim() || "";
    const ok = visible?.querySelector(".ok")?.textContent?.trim() || "";
    const host = document.getElementById("ssh-host")?.textContent?.trim() || "";
    const labels = [...(visible?.querySelectorAll("label span") || [])].map((el) => el.textContent.trim());
    const steps = [...document.querySelectorAll("#steps li")].map((el) => ({
      text: el.textContent.trim(),
      cls: el.className,
    }));
    const hint = document.querySelector(".hint")?.textContent?.trim() || "";
    return { title, lede, error, ok, host, labels, steps, hint, viewId: visible?.id || "" };
  });
  return { id, shot, ...info };
}

function clarityIssues(snap) {
  const issues = [];
  if (!snap.title) issues.push("missing step title");
  if (!snap.lede || snap.lede.length < 12) issues.push("lede too short or missing");
  if (/TODO|FIXME|xxx/i.test(snap.lede)) issues.push("placeholder text in lede");
  if (snap.error) issues.push(`visible error: ${snap.error}`);
  // Guidance should mention olares-cli / password defaults on SSH step
  if (snap.viewId === "view-ssh") {
    if (!/olares-cli|自动探测|detected/i.test(snap.lede)) issues.push("SSH lede should say address is auto-detected");
    if (!/olares|Vault|vault/i.test(snap.lede + snap.labels.join(" "))) {
      issues.push("SSH step should mention default password olares / Vault");
    }
  }
  if (snap.viewId === "view-olares") {
    if (!/Desktop/i.test(snap.lede + snap.labels.join(" "))) issues.push("Olares step should mention Desktop");
  }
  return issues;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  backupConfig();
  const machine = loadMachine1();
  if (!machine) throw new Error("machines.json missing machine id=1");
  const seeded = seedIncompleteConfig(machine);
  await ensurePanel();

  const report = {
    machine: { id: machine.id, olares_id: machine.olares_id || machine.profile, lan_ip: machine.lan_ip },
    desktopUrl: seeded.olares.desktopUrl,
    steps: [],
    issues: [],
    ok: false,
  };

  await withBrowser({ url: PANEL, width: 1280, height: 900, waitMs: 800 }, async (page) => {
    // Prefer Chinese copy for the review the user cares about
    try {
      await page.click("#lang-zh");
      await page.sleep(300);
    } catch {
      /* already zh */
    }

    // ENV
    await page.waitFor(() => document.getElementById("view-env") && !document.getElementById("view-env").classList.contains("hidden"));
    let snap = await stepSnapshot(page, "01-env");
    report.steps.push(snap);
    report.issues.push(...clarityIssues(snap).map((m) => `env: ${m}`));
    const envNextDisabled = await page.evaluate(() => document.getElementById("env-next")?.disabled);
    if (envNextDisabled) throw new Error("env next disabled — preflight failed");
    await page.click('[data-next="env"]');
    await page.sleep(400);

    // NAME
    await page.waitFor(() => !document.getElementById("view-name").classList.contains("hidden"));
    snap = await stepSnapshot(page, "02-name");
    report.steps.push(snap);
    report.issues.push(...clarityIssues(snap).map((m) => `name: ${m}`));
    await page.type("#appName", "dshscaffold", { clear: true });
    await page.click('[data-next="name"]');
    await page.waitFor(() => !document.getElementById("view-docker").classList.contains("hidden"), { timeout: 20_000 });

    // DOCKER skip
    snap = await stepSnapshot(page, "03-docker");
    report.steps.push(snap);
    report.issues.push(...clarityIssues(snap).map((m) => `docker: ${m}`));
    await page.click('[data-next="docker-skip"]');
    await page.waitFor(() => !document.getElementById("view-olares").classList.contains("hidden"), { timeout: 20_000 });

    // OLARES — profile already logged-in; password blank
    snap = await stepSnapshot(page, "04-olares");
    report.steps.push(snap);
    report.issues.push(...clarityIssues(snap).map((m) => `olares: ${m}`));
    await page.type("#desktopUrl", seeded.olares.desktopUrl, { clear: true });
    await page.type("#olaresPass", "", { clear: true });
    await page.click('[data-next="olares"]');
    await page.waitFor(
      () =>
        !document.getElementById("view-ssh").classList.contains("hidden") ||
        (document.getElementById("olares-error")?.textContent || "").trim().length > 0,
      { timeout: 90_000 },
    );
    const olaresErr = await page.evaluate(() => document.getElementById("olares-error")?.textContent?.trim() || "");
    if (olaresErr) {
      snap = await stepSnapshot(page, "04-olares-error");
      report.steps.push(snap);
      throw new Error(`olares step failed: ${olaresErr}`);
    }

    // SSH
    await page.waitFor(() => !document.getElementById("view-ssh").classList.contains("hidden"));
    await page.sleep(400);
    snap = await stepSnapshot(page, "05-ssh");
    report.steps.push(snap);
    report.issues.push(...clarityIssues(snap).map((m) => `ssh: ${m}`));
    await page.type("#sshUser", "olares", { clear: true });
    await page.type("#sshPort", "", { clear: true });
    await page.type("#sshPass", sshPassword(), { clear: true });
    await page.click('[data-next="ssh-probe"]');
    await page.waitFor(
      () =>
        document.getElementById("ssh-next") &&
        (!document.getElementById("ssh-next").disabled ||
          (document.getElementById("ssh-error")?.textContent || "").trim().length > 0),
      { timeout: 90_000 },
    );
    const sshErr = await page.evaluate(() => document.getElementById("ssh-error")?.textContent?.trim() || "");
    const sshOk = await page.evaluate(() => document.getElementById("ssh-ok")?.textContent?.trim() || "");
    snap = await stepSnapshot(page, "05-ssh-after-probe");
    report.steps.push(snap);
    if (sshErr) throw new Error(`ssh probe failed: ${sshErr}`);
    if (!sshOk) report.issues.push("ssh: probe succeeded but ok message empty");
    await page.click('[data-next="ssh"]');
    await page.waitFor(() => !document.getElementById("view-done").classList.contains("hidden"), { timeout: 20_000 });

    // DONE
    snap = await stepSnapshot(page, "06-done");
    report.steps.push(snap);
    report.issues.push(...clarityIssues(snap).map((m) => `done: ${m}`));
    const summary = await page.evaluate(() =>
      [...document.querySelectorAll("#summary dt, #summary dd")].map((el) => el.textContent.trim()),
    );
    report.summary = summary;
    await page.click("#finish-btn");
    await page.sleep(1500);
  });

  // Wait for panel to persist config
  for (let i = 0; i < 40; i++) {
    try {
      const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
      if (cfg.complete && cfg.olares?.sshOk) {
        report.finalConfig = {
          complete: cfg.complete,
          appName: cfg.appName,
          imageMode: cfg.imageMode,
          lanIp: cfg.olares.lanIp,
          sshHost: cfg.olares.sshHost,
          sshUser: cfg.olares.sshUser,
          sshPort: cfg.olares.sshPort,
          sshOk: cfg.olares.sshOk,
          platform: cfg.platform,
        };
        break;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!report.finalConfig?.sshOk) throw new Error("config not complete after finish");

  report.ok = report.issues.length === 0;
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: report.ok, issues: report.issues, finalConfig: report.finalConfig, report: REPORT }, null, 2)}\n`);
  if (!report.ok) process.exitCode = 2;
}

main().catch((err) => {
  console.error(String(err?.stack || err));
  process.exit(1);
});
