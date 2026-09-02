# Deploy this chart to the user's Olares

Chart dir: `deploy/<app>` from `project.json` `name` (default `dshscaffold`). App code is in the image, not the `.tgz`.

Deploy identity is **git origin + `project.json` + olares-cli profile**. There is no configure panel. Never print secrets. Do not collect passwords in chat.

## Chart invariants

Keep these three versions equal in git (no leftover `-test`):

- `deploy/<name>/Chart.yaml` `version`
- `OlaresManifest.yaml` `metadata.version` / `spec.versionName`
- `values.yaml` image **tag**

Required for this chat package (already set; do not drop them):

- `metadata.appid` = `metadata.name`
- `spec.supportArch` intersects the target node (`olares-cli cluster node list`)
- `permission.appData` / `appCache` / `appCommon` / `userData: [Home]`
- `ENABLE_DIND` default on; `options.apiTimeout: 0`
- `options.dependencies`: `olares` (system) + optional `router` / `llmgatewayv3`
- `spec.runAsUser: true`, process uid 1000
- Deployment strategy `Recreate`

```bash
olares-cli chart lint "deploy/${OLARES_APP_ID:-dshscaffold}"
```

## Image — GitHub Actions → GHCR

Olares **pulls** images; it never builds from source. This template builds in **GitHub Actions** and publishes `ghcr.io/<github-owner>/<app>:<chart-version>`. The laptop does not need Docker. Never `docker push` to `beclab/`.

1. `origin` must be the user's GitHub **fork** (not `beclab/dsh_scaffold`). Actions must be enabled on that fork. The user must already have run `gh auth login` and `olares-cli profile login` themselves.
2. Bind is automatic from `.env` (`OLARES_APP_ID`, `PRODUCT_NAME`) plus GitHub origin (`IMAGE_REPO` if empty):

```bash
node scripts/lib/runtime-config.mjs
```

3. Commit if git is dirty and the user asked to deploy (deploy implies push). Push the branch. `.github/workflows/image.yml` **must be committed and pushed** — GitHub only runs workflows that exist in the remote repo, so a local-only file builds nothing. `wait-ghcr.mjs` fails fast when the file is missing on the pushed ref or when local HEAD is unpushed.
4. A push to `main` / `master` already builds. Otherwise publish with `gh workflow run image` (needs the file on the default branch) or push git tag `v<Chart.yaml version>`. Wait, then make the package public so the cluster can pull:

```bash
node scripts/lib/wait-ghcr.mjs
```

5. Package + upload + install:

```bash
scripts/deploy.sh --install
```

`scripts/deploy.sh` runs preflight, bind, wait (triggers the workflow if the tag is missing), `package-chart.sh`, and `olares-cli market upload`. `--install` then `install` or `upgrade` from `-s upload`.

If the GHCR package stays private, Olares cannot pull. `wait-ghcr.mjs` tries to set visibility public via `gh api`. If that fails, tell the user to open GitHub → Packages → the container → Change visibility → Public.

## Package + upload + install

`lint` green and the profile clears the auth-readiness gate → proceed without asking. Within an authorised deploy/debug task, install / upgrade / restart / uninstall / clean reinstall are normal loop steps.

Chart only (image already on GHCR):

```bash
scripts/package-chart.sh
APP="$(node -e "console.log(JSON.parse(require('fs').readFileSync('project.json','utf8')).name)")"
olares-cli market upload "artifacts/${APP}-<ver>.tgz"
```

If `OLARES_PROFILE` is set, `olares-cli profile use "$OLARES_PROFILE"` before market commands.

Hydration race: `HTTP 404: App not found` right after upload is transient. Poll `olares-cli market get "${OLARES_APP_ID:-dshscaffold}" -s upload` until it resolves, then install. Do not bump or re-upload for that 404.

```bash
APP="${OLARES_APP_ID:-dshscaffold}"
olares-cli market get "$APP" -s upload -o json    # read .state
# first install / after uninstall / installFailed:
olares-cli market install "$APP" -s upload --version <ver> --watch --watch-timeout 1m -o json
# already running / stopped / *Failed (not installFailed):
olares-cli market upgrade "$APP" -s upload --version <ver> --watch --watch-timeout 1m -o json
```

If the same **git** version is already installed from another source, uninstall first, then `install -s upload`. Bump Chart / Manifest / values tag together when you need a new upload.

`running` is not the same as serving. Confirm:

```text
GET /api/health     kernel=dsh-web
entrance            olares-cli settings apps list  → URL column
Router              installed and reachable from the pod
```

Inspect pods as soon as the namespace appears. Runtime diagnosis is `olares-doctor`; a chart-owned fix comes back here (edit → lint → re-upload). A new image needs another CI publish.

## Hot reload (code-only, optional)

Needs an install packaged with `scripts/package-chart.sh --dev` (`dev.hotReload: true`) and SSH to the node. Then, if the skill exists:

```bash
GLOBAL=$(node __agent__/install.mjs --print-global)
SYNC="$GLOBAL/olares-hot-reload/scripts/sync.sh"
"$SYNC" "${OLARES_MACHINE_ID:-1}"
```

Changing `dev.*` or the image tag needs a **fresh install** (`upgrade` keeps first-install values). Release packages keep `hotReload: false`.
