export interface ScaffoldEnv {
  port: number;
  host: string;
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
    host: readString("HOSTNAME") ?? "0.0.0.0",
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
    sysVersion: readString("OLARES_SYS_VERSION") ?? readString("OLARES_SYSTEM_VERSION"),
    workspace: readString("DSH_WORKSPACE") ?? "/data/workspace",
    dataDir: readString("DSH_DATA_DIR") ?? "/data/dshscaffold",
    cliRoot: readString("DSH_CLI_ROOT") ?? "/data/cli",
    homeDir: readString("HOME") ?? "/data/home",
  };
}
