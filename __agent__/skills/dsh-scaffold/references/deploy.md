# Deploy this chart to the user's Olares

Chart dir: `deploy/<app>` from `project.json` `name` (default `dshscaffold`). App code is in the image, not the `.tgz`.

Deploy identity is **git origin + `project.json` + olares-cli profile**.

`node scripts/lib/runtime-config.mjs` prints `image_repo` as `ghcr.io/<origin-owner>/<app>`.

A new GHCR container is private. `wait-ghcr.mjs` checks anonymous pull. If CI succeeded and the check fails, give:

`https://github.com/users/<owner>/packages/container/<app>/settings`

Change visibility → Public (type the package name). Same name later stays public.

## Chart invariants

Keep these three versions equal in git (no leftover `-test`):

- `deploy/<name>/Chart.yaml` `version`
- `OlaresManifest.yaml` `metadata.version` / `spec.versionName`
- `values.yaml` image **tag** (registry owner is rewritten at package time from origin)

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

Workflow `.github/workflows/image.yml` publishes `ghcr.io/<GITHUB_REPOSITORY_OWNER>/<project.json name>:<chart-version>`. Never `docker push` to `beclab/`. CI does not read `.env`.

1. `origin` is the user’s GitHub **fork**. Actions enabled. They already ran `gh auth login` and `olares-cli profile login` themselves.
2. `node scripts/lib/runtime-config.mjs`

```bash
node scripts/lib/runtime-config.mjs
```

3. Commit if git is dirty and they asked to deploy (deploy implies push). Push the branch. `.github/workflows/image.yml` **must be on the remote ref**.
4. Publish: prefer `git tag v<version> && git push origin v<version>` then `scripts/deploy.sh --install --no-trigger` after the image exists, or `scripts/deploy.sh --install` which tries `gh workflow run image --ref <branch>` if the tag is missing. Dispatch needs `image.yml` on the **default** branch and `gh auth refresh -s workflow`. A push to `main`/`master` (matching `paths`) also publishes.
5. If wait-ghcr reports “built but is not public”, stop for the Packages UI. If it reports it could not start the workflow, enable Actions / push the tag / refresh `workflow` scope — do not wait for a build that never started.

`scripts/deploy.sh` runs preflight, wait, `package-chart.sh` (stamps `values.yaml` `image:` to the fork GHCR name), and `olares-cli market upload`. `--install` then `install` or `upgrade` from `-s upload` using `market status` (not `market get`) to choose the verb.

## Package + upload + install

`lint` green and the profile clears the auth-readiness gate → proceed without asking. Within an authorised deploy/debug task, install / upgrade / restart / uninstall / clean reinstall are normal loop steps.

Chart only (image already on GHCR and anonymously pullable):

```bash
scripts/package-chart.sh
APP="$(node -e "console.log(JSON.parse(require('fs').readFileSync('project.json','utf8')).name)")"
olares-cli market upload "artifacts/${APP}-<ver>.tgz"
```

If `OLARES_PROFILE` is set, `olares-cli profile use "$OLARES_PROFILE"` before market commands.

Hydration race: `HTTP 404: App not found` right after upload is transient. Poll `olares-cli market get "${OLARES_APP_ID:-dshscaffold}" -s upload` until it resolves, then install. Do not bump or re-upload for that 404.

```bash
APP="${OLARES_APP_ID:-dshscaffold}"
olares-cli market status "$APP" -o json    # read .state
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
