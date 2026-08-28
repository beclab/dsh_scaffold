/**
 * Ensure $DSH_HOME/profiles/dsh-web exists with official shells + this overlay.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
/** Repo root / container `/app` (sibling of `packages/` or `dist/`). */
const APP_ROOT = join(HERE, "../../..");
const BUNDLE_WEB = join(APP_ROOT, "packages", "plugins", "bundle-web");
const LOCAL_PROFILE_PACKAGES = [["@dsh/bundle-web", BUNDLE_WEB]] as const;

const SHELL_BUNDLES = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] as const;
const OVERLAY_BUNDLE = "@dsh/bundle-web";
const OWNED_BUNDLES: readonly string[] = [...SHELL_BUNDLES, OVERLAY_BUNDLE];

export const DSH_WEB_PROFILE = "dsh-web";

function resolveDshHome(dataDir: string): string {
  return process.env.DSH_HOME?.trim() || join(dataDir, "dsh-home");
}

/**
 * @param dataDir - sessions + dsh-home
 * @returns dsh home and profile directory
 */
export function ensureDshWebProfile(dataDir: string): { dshHome: string; profileDir: string } {
  const dshHome = resolveDshHome(dataDir);
  const profileDir = join(dshHome, "profiles", DSH_WEB_PROFILE);
  mkdirSync(profileDir, { recursive: true });

  const manifestPath = join(profileDir, "package.json");
  let previous: {
    dependencies?: Record<string, string>;
    dsh?: { profile?: { bundles?: string[] } };
    pnpm?: Record<string, unknown>;
  } = {};
  if (existsSync(manifestPath)) {
    try {
      previous = JSON.parse(readFileSync(manifestPath, "utf8")) as typeof previous;
    } catch {
      previous = {};
    }
  }

  const extraBundles = (previous.dsh?.profile?.bundles ?? []).filter((name) => !OWNED_BUNDLES.includes(name));
  const bundles = [...SHELL_BUNDLES, ...extraBundles, OVERLAY_BUNDLE];

  const manifest = {
    name: "dsh-web-profile",
    private: true,
    type: "module",
    dependencies: {
      ...(previous.dependencies ?? {}),
      "@dsh/bundle-web": `file:${BUNDLE_WEB}`,
    },
    ...(previous.pnpm ? { pnpm: previous.pnpm } : {}),
    dsh: {
      profile: {
        bundles,
      },
    },
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const patchPath = join(profileDir, "cordis.patch.yml");
  if (!existsSync(patchPath)) {
    writeFileSync(
      patchPath,
      `# dsh-web user layer (hot-reloaded). Keep as a YAML list.
# Add user overrides here.
[]
`,
    );
  }

  return { dshHome, profileDir };
}

/**
 * Install the profile's declared bundles.
 *
 * `--legacy-peer-deps` is load-bearing: without it npm installs a second dsh
 * copy into the profile, and sessions fail with "unscoped context".
 */
export function installProfileDeps(profileDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["install", "--no-audit", "--no-fund", "--legacy-peer-deps"], {
      cwd: profileDir,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`npm install in profile failed: ${code}`));
        return;
      }
      try {
        linkOwnedProfileDeps(profileDir);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Keep overlay packages linked to source so a hot-reload does not leave a
 * stale npm copy of `file:` packages.
 */
export function linkOwnedProfileDeps(
  profileDir: string,
  packages: ReadonlyArray<readonly [name: string, source: string]> = LOCAL_PROFILE_PACKAGES,
): void {
  for (const [name, source] of packages) {
    const target = join(profileDir, "node_modules", ...name.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    rmSync(target, { recursive: true, force: true });
    symlinkSync(source, target, "dir");
  }
}

const CLIENT_LOOPBACK_ANCHOR = "isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname),";

const CLIENT_LOOPBACK_REPLACEMENT = "isLoopback: true,";

const HOST_INTERCEPTOR_ANCHOR =
  'if (interceptor.options.authority === "loopback" && !isTrustedApiRequest(request, []))';

const HOST_INTERCEPTOR_REPLACEMENT =
  'if (interceptor.options.authority === "loopback" && !isTrustedApiRequest(request, this.trustedHosts))';

const HOST_PRIVILEGED_ANCHOR =
  "if (method !== void 0 && PRIVILEGED_METHODS.has(method) && !isTrustedApiRequest(request, []))";

const HOST_PRIVILEGED_REPLACEMENT =
  "if (method !== void 0 && PRIVILEGED_METHODS.has(method) && !isTrustedApiRequest(request, trustedHosts))";

function replaceRequired(source: string, anchor: string, replacement: string): string {
  if (source.includes(replacement)) return source;
  if (!source.includes(anchor)) {
    throw new Error(`dsh-client-connection trust patch anchor not found: ${anchor}`);
  }
  return source.replace(anchor, replacement);
}

export function trustOlaresConnectionHost(source: string): string {
  return replaceRequired(
    replaceRequired(source, HOST_INTERCEPTOR_ANCHOR, HOST_INTERCEPTOR_REPLACEMENT),
    HOST_PRIVILEGED_ANCHOR,
    HOST_PRIVILEGED_REPLACEMENT,
  );
}

/**
 * dsh pins settings to loopback-same-origin. The Olares private entrance is
 * the authentication layer, so treat it as trusted. Remove once dsh accepts
 * an authenticated remote origin.
 */
export function patchConnectionTrustFences(): void {
  const clientLib = require.resolve("@deepseek-ai/dsh-client-connection/client");
  const clientSource = readFileSync(clientLib, "utf8");
  if (!clientSource.includes(CLIENT_LOOPBACK_REPLACEMENT)) {
    if (!clientSource.includes(CLIENT_LOOPBACK_ANCHOR)) {
      throw new Error("dsh-client-connection client trust patch anchor not found");
    }
    writeFileSync(clientLib, clientSource.replace(CLIENT_LOOPBACK_ANCHOR, CLIENT_LOOPBACK_REPLACEMENT));
  }

  const hostLib = require.resolve("@deepseek-ai/dsh-client-connection");
  const hostSource = readFileSync(hostLib, "utf8");
  const trustedHostSource = trustOlaresConnectionHost(hostSource);
  if (trustedHostSource !== hostSource) writeFileSync(hostLib, trustedHostSource);

  console.log("[dshscaffold] dsh-client-connection trust fences → Olares trusted hosts");
}

/** Absolute path to the published dsh CLI entry. */
export function resolveDshBin(): string {
  const pkgJson = require.resolve("@deepseek-ai/dsh/package.json");
  const pkg = JSON.parse(readFileSync(pkgJson, "utf8")) as { bin?: string | Record<string, string> };
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.dsh;
  if (!bin) throw new Error("@deepseek-ai/dsh has no bin");
  return join(dirname(pkgJson), bin);
}
