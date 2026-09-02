# Secondary-develop in this repo

## Layout

| Path | What goes here |
| --- | --- |
| `packages/service/` | Process entry: dsh web boot, profile, Router settings seed |
| `packages/plugins/` | Cordis `apply` modules, client overlays, brand. Start from an `apply` hook — do not patch harness internals unless there is no package-level hook |
| `packages/skills/` | Skills this chat app ships. Product skills are committed. `olares-*` comes from `scripts/sync-olares-skills.sh` (or the image build). Not laptop agent skills (`__agent__/skills/`) |

Harness comes from `@deepseek-ai/*` in root `package.json`. Overlay lives in `packages/plugins/bundle-web`.

## Run this repo locally

```bash
cp .env.example .env    # local LLM only
npm install
npm run skills:sync     # olares-* into packages/skills (gitignored)
npm run build
npm run start          # http://127.0.0.1:8080
```

`GET /api/health` must stay on that path (`kernel: "dsh-web"`) — the chart probes it.

Local without Router: set `LLM_GATEWAY_URL` (or `MODEL_CONSOLE_URL`) in `.env` to any OpenAI-compatible `/v1`. Cluster chart ignores `.env`. On 1.12.7 it uses `https://router.<zone>/v1`; on 1.12.6 it discovers Model Console at `http://sharedentrances-api.<app>-shared/v1`. App identity is `OLARES_APP_ID` / `x-caller-appid`. Do not bake a `sk-` key into the chart.

## Rename

Rename **before** the first upload:

```bash
node scripts/lib/apply-app-name.mjs mychat
```

That keeps the four names identical (see the parent skill) and rewrites `hot_reload.deploy` / `container`, chart templates, env defaults, and the on-screen brand (`packages/plugins/bundle-web/host/brand/identity.js`). Image **owner** stays whoever is in the string (CI still publishes to the fork owner). Theme color stays in that file.

Pattern: `^[a-z][a-z0-9]{3,29}$`. Rejected: `test`, `app`, `web`, `dsh`, and other reserved words. Short generic names poison paths like `/data/<name>` and Helm keys.

## Plugin (`apply` module)

Add a Cordis module under `packages/plugins/`, then list it in `bundle-web/cordis.patch.yml`. Do not copy harness source.

```js
// packages/plugins/hello/index.js
export const name = "scaffold-hello";
export const inject = ["webServer"];

export async function apply(ctx) {
  ctx.webServer.addRoute("get", "/hello", (_req, res) => {
    res.end("ok");
  });
}
```

```yaml
# in cordis.patch.yml, under the existing insert:
    - id: scaffold-hello
      name: '@dsh/hello/index.js'
      inject: [webServer]
```

Wire the package the same way as `bundle-web` (`package.json` name + profile overlay). Brand-only changes stay in `host/brand/`.

## Iterate on the cluster

| Change | Command |
| --- | --- |
| Overlay / plugin / service code only | Install once with `scripts/package-chart.sh --dev`, then `$GLOBAL/olares-hot-reload/scripts/sync.sh 1` |
| Image, Dockerfile, or chart values that first-install locks | bump Chart/Manifest/values tag together, `scripts/deploy.sh --install` |

`running` + `GET /api/health` `kernel=dsh-web` is not the same as chat working. Router is optional in the chart. Confirm Router (1.12.7) or a Model Console (1.12.6) before calling the install done.
