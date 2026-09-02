import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface ScaffoldEnv {
  port: number;
  routerUrl: string;
  routerFallbackUrl: string | null;
  routerApiKey: string | null;
  modelConsoleUrl: string | null;
  modelConsoleUrls: string | null;
  modelConsoleApps: string | null;
  olaresAppId: string;
  sysVersion: string | null;
  workspace: string;
  dataDir: string;
  cliRoot: string;
  homeDir: string;
}

function applyDotEnv() {
  for (const name of [".env.example", ".env"]) {
    let text = "";
    try {
      text = readFileSync(join(process.cwd(), name), "utf8");
    } catch {
      continue;
    }
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined || process.env[key] === "") process.env[key] = value;
    }
  }
}

applyDotEnv();

function readString(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function loadEnv(): ScaffoldEnv {
  const portRaw = readString("PORT") ?? "8080";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${portRaw}`);
  }

  return {
    port,
    routerUrl: (readString("LLM_GATEWAY_URL") ?? "http://router-svc.router-shared/v1").replace(
      /\/+$/,
      "",
    ),
    routerFallbackUrl: readString("LLM_GATEWAY_FALLBACK_URL")?.replace(/\/+$/, "") ?? null,
    routerApiKey: readString("DSH_ROUTER_API_KEY"),
    modelConsoleUrl: readString("MODEL_CONSOLE_URL")?.replace(/\/+$/, "") ?? null,
    modelConsoleUrls: readString("MODEL_CONSOLE_URLS"),
    modelConsoleApps: readString("MODEL_CONSOLE_APPS"),
    olaresAppId: readString("OLARES_APP_ID") ?? "dshscaffold",
    sysVersion: readString("OLARES_SYS_VERSION"),
    workspace: readString("DSH_WORKSPACE") ?? ".dsh/workspace",
    dataDir: readString("DSH_DATA_DIR") ?? ".dsh/data",
    cliRoot: readString("DSH_CLI_ROOT") ?? ".dsh/cli",
    homeDir: readString("HOME") ?? ".dsh/home",
  };
}
