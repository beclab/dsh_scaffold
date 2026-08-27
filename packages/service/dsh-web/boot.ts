import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../config/env.js";
import { pickChatModelId, resolveRouterGateway } from "../olares/router-models.js";
import { seedOlaresSkills } from "../olares/skills-seed.js";
import { bootstrapScaffoldSettings, ROUTER_CREDENTIAL_REF } from "./bootstrap-settings.js";
import {
  DSH_WEB_PROFILE,
  ensureDshWebProfile,
  installProfileDeps,
  patchConnectionTrustFences,
  resolveDshBin,
} from "./profile.js";
// Plugin Host halves stay source under packages/; specifier climbs out of dist/.
import { identityPrompt } from "../../../packages/plugins/bundle-web/host/brand/identity.js";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Non-empty bearer for routes the /llm/v1 shim authenticates on our behalf. */
const SHIM_BEARER = "olares-router-shim";

/** Boot official dsh web with this repo's overlay. */
export async function bootDshWeb(): Promise<void> {
  const env = loadEnv();
  mkdirSync(env.dataDir, { recursive: true });
  mkdirSync(env.workspace, { recursive: true });
  mkdirSync(env.cliRoot, { recursive: true });
  mkdirSync(env.homeDir, { recursive: true });
  const skillsDir = seedOlaresSkills(path.join(env.dataDir, "skills"));

  const { dshHome, profileDir } = ensureDshWebProfile(env.dataDir);

  await installProfileDeps(profileDir);
  patchConnectionTrustFences();

  const resolved = await resolveRouterGateway(env);
  if (resolved.catalog.length > 0) {
    const label = resolved.kind === "model-console" ? "Model Console" : "Router";
    console.log(`[dshscaffold] ${label} catalog: ${resolved.catalog.length} model(s) at ${resolved.url}`);
  }
  const chatFallback = pickChatModelId(resolved.catalog) ?? process.env.DSH_MODEL?.trim() ?? null;

  const llmBase = `http://127.0.0.1:${env.port}/llm/v1`;
  const bootstrapped = bootstrapScaffoldSettings(dshHome, {
    catalog: resolved.catalog,
    baseURL: llmBase,
    chatFallback,
    kind: resolved.kind,
  });
  if (bootstrapped.changed) {
    const route = bootstrapped.routeSeeded ? "seeded" : "updated";
    console.log(
      `[dshscaffold] ${route} llm-pi-ai provider olares-router (${bootstrapped.routeModels} model(s))`,
    );
    console.log(`[dshscaffold] agent-default-model → ${bootstrapped.model ?? "(unset)"}`);
  }

  // dsh CLI rejects --host 0.0.0.0; bind is forced in @dsh/bundle-web.
  const cliHost = "127.0.0.1";
  const bindHost = "0.0.0.0";
  const dshBin = resolveDshBin();
  const trustedHosts = (process.env.DSH_TRUSTED_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DSH_HOME: dshHome,
    PORT: String(env.port),
    HOSTNAME: bindHost,
    DSH_HOST: bindHost,
    DSH_PORT: String(env.port),
    HOME: env.homeDir,
    DSH_CWD: env.workspace,
    DSH_WORKSPACE: env.workspace,
    DSH_DATA_DIR: env.dataDir,
    DSH_CLI_ROOT: env.cliRoot,
    DSH_BUNDLED_SKILL_DIR: skillsDir,
    OLARES_CLI_HOME: process.env.OLARES_CLI_HOME?.trim() || path.join(env.cliRoot, ".olares-cli"),
    OLARES_CLI_DATA_DIR: process.env.OLARES_CLI_DATA_DIR?.trim() || path.join(env.cliRoot, "keychain"),
    OLARES_CLI_REMOTE_ONLY: process.env.OLARES_CLI_REMOTE_ONLY?.trim() || "1",
    LLM_GATEWAY_URL: resolved.url,
    LLM_UPSTREAM_KIND: resolved.kind,
    LLM_UPSTREAMS: resolved.upstreams.join(","),
    LLM_MODEL_ROUTES: JSON.stringify(resolved.routes),
    OLARES_APP_ID: env.olaresAppId,
    DSH_ROUTER_API_KEY: env.routerApiKey ?? "",
    [ROUTER_CREDENTIAL_REF]: SHIM_BEARER,
    DSH_MODEL: bootstrapped.model ?? chatFallback ?? "default",
    DSH_PERMISSION_MODE: process.env.DSH_PERMISSION_MODE ?? "workspace-write",
    DSH_SYSTEM_PROMPT: process.env.DSH_SYSTEM_PROMPT?.trim() || identityPrompt(),
  };

  console.log(
    `[dshscaffold] starting dsh web profile=${DSH_WEB_PROFILE} bind=http://${bindHost}:${env.port} (cli --host ${cliHost})`,
  );
  console.log(
    `[dshscaffold] DSH_HOME=${dshHome} workspace=${env.workspace} model=${bootstrapped.model ?? "(unset)"}`,
  );

  const dshArgs = [
    dshBin,
    "--profile",
    DSH_WEB_PROFILE,
    "--host",
    cliHost,
    "--port",
    String(env.port),
    "--no-open",
  ];
  for (const authority of trustedHosts) {
    dshArgs.push("--trusted-host", authority);
  }

  const child = spawn(process.execPath, dshArgs, {
    cwd: APP_ROOT,
    env: childEnv,
    stdio: "inherit",
  });

  const shutdown = () => {
    child.kill("SIGTERM");
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        resolve();
        return;
      }
      if (code === 0) resolve();
      else reject(new Error(`dsh exited with code ${code}`));
    });
  });
}
