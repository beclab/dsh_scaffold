import { mkdirSync } from "node:fs";

export const name = "scaffold-default-workspace";
export const inject = ["workspaceRegistry"];

export async function apply(ctx) {
  const root = (process.env.DSH_CWD ?? process.env.DSH_WORKSPACE ?? "").trim();
  if (!root) {
    console.warn("[dshscaffold] default workspace skipped: DSH_CWD / DSH_WORKSPACE unset");
    return;
  }
  try {
    mkdirSync(root, { recursive: true });
    const workspace = await ctx.workspaceRegistry.create(root, "Default");
    console.log(`[dshscaffold] default workspace id=${workspace.id} path=${workspace.path}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[dshscaffold] default workspace seed failed: ${message}`);
  }
}
