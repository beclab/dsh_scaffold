#!/usr/bin/env node
/**
 * Password pages must stay open: Enter in Olares/SSH password fields
 * must not finish or blank the panel.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const chromeCdpPath = join(homedir(), ".cursor/skills/olares-browser-login/scripts/lib/chrome-cdp.mjs");
const { withBrowser } = await import(pathToFileURL(chromeCdpPath).href);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PANEL = "http://127.0.0.1:8788/";

async function ensurePanel() {
  try {
    const res = await fetch(PANEL);
    if (res.ok) return;
  } catch {
    /* start */
  }
  if (!existsSync(join(ROOT, "scripts/setup-panel/server.mjs"))) {
    throw new Error("setup panel missing");
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

async function showView(page, viewId) {
  await page.evaluate((id) => {
    document.querySelectorAll(".card").forEach((el) => {
      const on = el.id === id;
      el.classList.toggle("hidden", !on);
      if (on) el.removeAttribute("inert");
      else el.setAttribute("inert", "");
    });
  }, [viewId]);
}

async function stayCheck(page, field, viewId, label) {
  await page.type(field, "x", { clear: true });
  await page.press("Enter");
  await page.sleep(500);
  const after = await page.evaluate(() => ({
    href: location.href,
    view: [...document.querySelectorAll(".card")].find((c) => !c.classList.contains("hidden"))?.id || "",
    blank: document.body?.childElementCount === 0,
  }));
  if (!after.href.includes("127.0.0.1:8788") || after.view !== viewId || after.blank) {
    throw new Error(`${label} Enter closed panel: ${JSON.stringify(after)}`);
  }
}

await ensurePanel();
await withBrowser({ url: PANEL, width: 1280, height: 900, waitMs: 800 }, async (page) => {
  await page.waitFor(() => document.querySelector(".card"));
  await showView(page, "view-olares");
  await stayCheck(page, "#olaresPass", "view-olares", "olares");
  await showView(page, "view-ssh");
  await stayCheck(page, "#sshPass", "view-ssh", "ssh");
});

process.stdout.write("password-stay: ok\n");
