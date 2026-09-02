import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BUNDLED = path.join(APP_ROOT, "packages", "skills");

/** Copy image-exported skill bundles (olares-*) into the runtime skills dir. */
export function seedOlaresSkills(targetDir: string): string {
  mkdirSync(targetDir, { recursive: true });
  if (!existsSync(BUNDLED)) return targetDir;

  for (const name of readdirSync(BUNDLED)) {
    const from = path.join(BUNDLED, name);
    if (!statSync(from).isDirectory()) continue;
    const to = path.join(targetDir, name);
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
  }
  return targetDir;
}
