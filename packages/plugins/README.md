# plugins

Product overlay on DeepSeek Harness. The first-party bundle is `bundle-web`:

- `GET /api/health` — chart probe
- `/llm/v1` — proxy to Router (1.12.7) or Model Console `/v1` (1.12.6)
- Brand title + default workspace

Add more Cordis `apply` modules here, then insert them from `bundle-web/cordis.patch.yml`. Do not copy harness source into this folder.

```js
export const name = "scaffold-hello";
export const inject = ["webServer"];

export async function apply(ctx) {
  ctx.webServer.addRoute("get", "/hello", (_req, res) => {
    res.end("ok");
  });
}
```

Then add an `- insert` entry next to the existing `scaffold-*` modules in `cordis.patch.yml`.
