import { PRODUCT_NAME, THEME_COLOR, identityPrompt, surfacePrompt } from "./identity.js";
import { MANIFEST, MANIFEST_PATH, MARK_PATH, MARK_SVG } from "./mark.js";

export const name = "scaffold-brand";
export const inject = ["webServer"];

function serve(body, contentType) {
  return (_req, res) => {
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "public, max-age=3600",
    });
    res.end(body);
  };
}

function localWebUrl(ctx) {
  const port = ctx.get("webServer")?.port;
  if (port === undefined) return "http://127.0.0.1:8080";
  return `http://127.0.0.1:${String(port)}`;
}

export function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({ kind: "exact", path: MARK_PATH, handler: serve(MARK_SVG, "image/svg+xml") }),
    "scaffold-brand-mark",
  );
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "exact",
        path: MANIFEST_PATH,
        handler: serve(JSON.stringify(MANIFEST), "application/manifest+json"),
      }),
    "scaffold-brand-manifest",
  );

  ctx.webServer.tapIndex((html) =>
    html
      .replace(/<title>[^<]*<\/title>/i, `<title>${PRODUCT_NAME}</title>`)
      .replace(/<link rel="icon"[^>]*>/i, `<link rel="icon" type="image/svg+xml" href="${MARK_PATH}" />`)
      .replace(/<link rel="manifest"[^>]*>/i, `<link rel="manifest" href="${MANIFEST_PATH}" />`)
      .replace(/<\/head>/i, `<meta name="theme-color" content="${THEME_COLOR}" /></head>`),
  );

  ctx.inject(["systemPrompt"], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: "harness:identity",
      order: -100,
      text: identityPrompt(),
    });
    promptCtx.systemPrompt.section({
      name: "app:web-surface",
      order: -98,
      text: () => surfacePrompt(localWebUrl(promptCtx)),
    });
  });
}
