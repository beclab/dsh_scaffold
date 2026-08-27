#!/usr/bin/env node
/**
 * Copy __agent__/skills (and Cursor rules) into this agent's project directory.
 * Source of truth stays in __agent__/. Do not commit the generated agent dirs.
 *
 *   node __agent__/install.mjs --agent cursor
 *   node __agent__/install.mjs --print-global
 *   node __agent__/install.mjs --status
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pack = join(root, "__agent__");
const catalog = JSON.parse(readFileSync(join(pack, "agents.json"), "utf8"));
const installedPath = join(pack, ".installed.json");

function expandHome(p) {
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

function parseArgs(argv) {
  const out = { agent: "", printGlobal: false, printProject: false, status: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--agent" || a === "-a") out.agent = argv[++i] || "";
    else if (a === "--print-global") out.printGlobal = true;
    else if (a === "--print-project") out.printProject = true;
    else if (a === "--status") out.status = true;
    else if (a === "-h" || a === "--help") out.help = true;
    else {
      console.error(`unknown option: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

function usage() {
  const ids = Object.keys(catalog).join(", ");
  console.log(`Usage: node __agent__/install.mjs --agent <id>
  --agent, -a       ${ids}
  --print-global    print the global skills directory
  --print-project   print the project skills directory
  --status          print __agent__/.installed.json
`);
}

function resolveAgent(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (catalog[key]) return { id: key, spec: catalog[key] };
  for (const [id, spec] of Object.entries(catalog)) {
    const aliases = (spec.aliases || []).map((s) => String(s).toLowerCase());
    if (aliases.includes(key) || String(spec.label).toLowerCase() === key) {
      return { id, spec };
    }
  }
  return { id: "universal", spec: catalog.universal };
}

function readInstalled() {
  if (!existsSync(installedPath)) return null;
  try {
    return JSON.parse(readFileSync(installedPath, "utf8"));
  } catch {
    return null;
  }
}

function writeInstalled(record) {
  writeFileSync(installedPath, JSON.stringify(record, null, 2) + "\n", "utf8");
}

function copySkills(skillsDir) {
  const srcRoot = join(pack, "skills");
  const destRoot = join(root, skillsDir);
  mkdirSync(destRoot, { recursive: true });
  for (const name of readdirSync(srcRoot)) {
    const src = join(srcRoot, name);
    const dest = join(destRoot, name);
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
  }
}

function writeCursorRule() {
  const body = readFileSync(join(pack, "rules", "dsh-scaffold.md"), "utf8");
  const dir = join(root, ".cursor", "rules");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "dsh-scaffold.mdc"),
    `---
description: DSH Scaffold agent front door — CLI setup, overlay work, deploy to the user's Olares
alwaysApply: true
---

${body.trim()}\n`,
    "utf8",
  );
}

function install(agentId) {
  const { id, spec } = resolveAgent(agentId);
  copySkills(spec.skillsDir);
  if (spec.rules === "cursor-mdc") writeCursorRule();
  const record = {
    agent: id,
    label: spec.label,
    skillsDir: spec.skillsDir,
    globalSkillsDir: spec.globalSkillsDir,
    installedAt: new Date().toISOString(),
  };
  writeInstalled(record);
  console.log(`Installed ${spec.label} (${id})`);
  console.log(`  project skills: ${spec.skillsDir}`);
  console.log(`  global skills:  ${spec.globalSkillsDir}`);
}

function fallbackGlobal() {
  const candidates = [
    catalog.cursor.globalSkillsDir,
    catalog["claude-code"].globalSkillsDir,
    catalog.universal.globalSkillsDir,
    catalog["github-copilot"].globalSkillsDir,
    catalog.windsurf.globalSkillsDir,
  ];
  for (const p of candidates) {
    const abs = expandHome(p);
    if (existsSync(abs)) return abs;
  }
  return expandHome(catalog.universal.globalSkillsDir);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  usage();
  process.exit(0);
}

if (args.status) {
  const rec = readInstalled();
  if (!rec) {
    console.error("not installed; run: node __agent__/install.mjs --agent <id>");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(rec, null, 2) + "\n");
  process.exit(0);
}

if (args.printGlobal || args.printProject) {
  const rec = readInstalled();
  if (args.printProject) {
    const dir = rec?.skillsDir || catalog.universal.skillsDir;
    process.stdout.write(join(root, dir) + "\n");
    process.exit(0);
  }
  const dir = rec?.globalSkillsDir ? expandHome(rec.globalSkillsDir) : fallbackGlobal();
  process.stdout.write(dir + "\n");
  process.exit(0);
}

if (!args.agent) {
  usage();
  process.exit(2);
}

install(args.agent);
