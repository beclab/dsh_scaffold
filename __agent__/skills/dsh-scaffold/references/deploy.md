# Deploy this chart to the user's Olares

Chart dir: `deploy/<app>` from `.dsh/config.json` `appName` (default `dshscaffold`). App code is in the image (or the `devsrc` overlay), not the `.tgz`.

Deploy identity is **`.dsh/config.json`** (written by `npm run configure`). Export it with `node scripts/lib/dsh-config.mjs exports`. If the file is missing or incomplete, open the panel — do not ask in chat. Never print secrets.

## Chart invariants

Keep these three versions equal in git (no `-test`):

- `deploy/<name>/Chart.yaml` `version`
- `OlaresManifest.yaml` `metadata.version` / `spec.versionName`
- `values.yaml` image **tag**

Required for this chat package (already set; do not drop them):

- `metadata.appid` = `metadata.name` (`lint` does not require `appid`; **`market upload` does**)
- `spec.supportArch` intersects the target node (`olares-cli cluster node list`)
- `permission.appData` / `appCache` / `appCommon` / `userData: [Home]`
- `ENABLE_DIND` default on; `options.apiTimeout: 0`
- `options.dependencies`: `olares` (system) + optional `router` / `llmgatewayv3`
- `spec.runAsUser: true`, process uid 1000
- Deployment strategy `Recreate`

```bash
olares-cli chart lint "deploy/${OLARES_APP_ID:-dshscaffold}"
```

## Image — local test (default for “在机器上试试”)

Olares **pulls** images; it never builds from source. For this template the image is built on the **laptop**, then made pullable on the node. Skip-Hub: `docker build` tags `docker.io/local/<app>:<ver>` (a local name, not a Hub repo), `docker save`, scp, `ctr -n k8s.io images import`. After import the kubelet finds it on the node and does not hit the internet. Laptop proof is **save + import + upload**, not `docker push` to `beclab/`, and not GitHub Actions.

1. Require a complete `.dsh/config.json` (and the `machines.json` the panel wrote). Save mode must have passed SSH BatchMode to `sshUser@sshHost`.
2. `image.platform` is written by the panel from `cluster node list`. Do not infer from the laptop.
3. Local upload version is **max(git Chart.yaml + 1 patch, upload-source version + 1)**. Helm cannot resolve `-test`. Never commit that local number.

```bash
scripts/local-test.sh "${OLARES_MACHINE_ID:-1}"
```

Then install from upload (next section). If `olares-image` is missing, run `ensure-olares-cli.sh --with-skills` and stop asking the user to invent a push flow.

Skip-Hub tags `docker.io/local/<app>:<ver>`. Do not `docker push` to `beclab/`.

## Package + upload + install

`lint` green and the profile clears the auth-readiness gate → proceed without asking. Within an authorised deploy/debug task, install / upgrade / restart / uninstall / clean reinstall are normal loop steps.

Chart only (image already pullable or imported):

```bash
scripts/package-chart.sh                  # release .tgz, then lint
# or
scripts/package-chart.sh --dev            # hotReload=true, next patch version

APP="${OLARES_APP_ID:-$(node -e "console.log(JSON.parse(require('fs').readFileSync('.dsh/config.json','utf8')).appName)")}"
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

If the same **git** version is already installed from another source, uninstall first, then `install -s upload` at the next patch. Local upload is newer than git, so an upload-source install can `upgrade` to that next patch.

`running` is not the same as serving. Confirm:

```text
GET /api/health     kernel=dsh-web
entrance            olares-cli settings apps list  → URL column
Router              installed and reachable from the pod
```

Inspect pods as soon as the namespace appears. Do not wait on the market row alone. Runtime diagnosis is `olares-doctor`; a chart-owned fix comes back here (edit → lint → re-upload).

## Hot reload (code-only)

Needs an install packaged with `scripts/package-chart.sh --dev` (`dev.hotReload: true`). Then, if the skill exists:

```bash
GLOBAL=$(node __agent__/install.mjs --print-global)
SYNC="$GLOBAL/olares-hot-reload/scripts/sync.sh"
"$SYNC" "${OLARES_MACHINE_ID:-1}"
```

Changing `dev.*` or the image tag needs a **fresh install** (`upgrade` keeps first-install values). Release packages keep `hotReload: false`.
