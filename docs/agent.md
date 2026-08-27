# Agent playbook

This document is for the **laptop agent**, not the end user. Users talk to you; you run the steps. Do not paste this playbook into chat as a checklist for them to execute.

User-facing entry: [README.md](../README.md) / [README.zh-CN.md](../README.zh-CN.md).

## First move

Follow [AGENTS.md](../AGENTS.md): detect which product you are, `node __agent__/install.mjs --agent <id>` if needed, then read:

- [dsh-scaffold](../__agent__/skills/dsh-scaffold/SKILL.md)
- [olares-cli-setup](../__agent__/skills/olares-cli-setup/SKILL.md) when the CLI is missing
- Overlay / local run → [references/develop.md](../__agent__/skills/dsh-scaffold/references/develop.md)
- Chart / image / upload / install → [references/deploy.md](../__agent__/skills/dsh-scaffold/references/deploy.md)

After install, continue the user’s request. Do not stop at the copy step.

## What the user is allowed to do

This scaffold installs a chat on **the user’s own Olares** (`market upload` / `-s upload`). That is the whole product path.

Do **not** open a public Market listing, a `beclab/apps` PR, or `docker push` to `beclab/` unless the user explicitly asked to publish. If they did not ask, never mention 上架 / public listing as a next step.

## Talk, don’t quiz

Drive the work. Ask only when you are blocked on a choice only they can make (name of the chat, which machine). Never collect Desktop URL, Hub password, Olares password, or TOTP in chat.

## Environment preflight (before configure)

Do this on first-user init, and again whenever `.dsh/config.json` is missing or you are about to open the panel. Do **not** run `npm run configure` until Node, CLI, Docker, and olares-image pass.

```bash
npm run preflight
# or: scripts/preflight.sh
```

| Result | Action |
| --- | --- |
| `node` missing or older than 22 | Stop. The user must install Node.js 22+ and put `node` on `PATH`. Do not try to collect an installer password in chat. |
| `olares-cli` missing or broken | Follow [olares-cli-setup](../__agent__/skills/olares-cli-setup/SKILL.md) (`ensure-olares-cli.sh`), then run preflight again. |
| `docker` missing / daemon down / broken | Run `scripts/ensure-docker.sh`. That opens Docker Desktop if it is already installed, otherwise opens the Docker Desktop install page. Stop until `docker info` works. |
| `olares-image` missing | `ensure-olares-cli.sh --with-skills`, then preflight again. |
| `ssh` fail (save mode, after LAN IP is known) | Shown in the list; does not block opening the panel. Do **not** scp. User adds a root SSH key, or uses Hub push. Save-mode Finish still requires SSH. |
| all `ok` | `npm run configure` |

`npm run configure` repeats Node / CLI / Docker / olares-image and **exits without opening the panel** if any of those is missing. Save-mode SSH is checked after Desktop login, and again on Finish. The panel writes `project.json` `image.platform` from the node architecture. Skip-Hub sets `image_repo` to `docker.io/local/<name>`, never `docker.io/beclab/*`.

```bash
npm run configure
```

The panel writes gitignored `.dsh/config.json` (names, Desktop, detected LAN IP, Hub repo + username). It never stores passwords or TOTP.

Later deploys reuse sessions already on the laptop:

| Secret | Where it lives after the panel |
| --- | --- |
| Docker Hub password | `docker login` → Docker credential store (`~/.docker/config.json`, often the OS keychain). `docker push` uses that. |
| Olares password / TOTP | `olares-cli profile login` → CLI profile / keychain. Market and cluster commands use the active profile. |

If Hub `loggedIn` is true but `docker push` later gets 401, open the panel and probe again — do not ask for the password in chat. If the Olares profile is `never` / `invalidated`, open the panel (or interactive `profile login`). An `expired` access token normally refreshes on the next request.

## Typical requests → what you do

| User says | You do |
| --- | --- |
| 装 cli / 登录 | `npm run preflight`；缺 CLI 则 `olares-cli-setup`，缺 Docker 则 `scripts/ensure-docker.sh`，通过后再开面板 |
| 做一个自己的 chat / 改名 | panel first screen, or `node scripts/lib/apply-app-name.mjs <name>` — four names stay identical |
| 改标题 / 颜色 / 自称 | `packages/plugins/bundle-web/host/brand/identity.js` (+ `mark.js` for the icon) |
| 加能力 / 插件 | new module under `packages/plugins/`, list it in `cordis.patch.yml` |
| 这个 chat 自带 skill | write under `packages/skills/`; `olares-*` only via `npm run skills:sync` |
| 先本地跑 | `.env` from example, `npm install`, `npm run skills:sync`, `npm run build`, `npm run start` |
| 装到我的 Olares | complete configure → `scripts/local-test.sh 1` (max git+1 / upload+1) → `market install -s upload` |

## Layout (do not fork harness)

| Path | What goes here |
| --- | --- |
| `packages/service/` | boot, model gateway, profile |
| `packages/plugins/` | Cordis `apply` overlays. Do not patch harness internals unless there is no package hook |
| `packages/skills/` | in-app skills the chat ships. Not `__agent__/` |
| `deploy/<name>/` | Olares chart |
| `__agent__/` | laptop pack (source of truth) |
| `_reference/` | official harness checkout (`scripts/fetch-reference.sh`) |

Depend on published `@deepseek-ai/*`. Do not copy harness source into `packages/`.

## Local run

```bash
cp .env.example .env          # LLM_GATEWAY_URL only; cluster ignores .env
npm install
npm run skills:sync
npm run build
npm run start                 # http://127.0.0.1:8080
```

`GET /api/health` must stay on that path (`kernel: "dsh-web"`). Optional official UI: `scripts/fetch-reference.sh` then `pnpm dsh web` in `_reference/deepseek-harness` (`http://127.0.0.1:3080`).

## Deploy (own machine only)

Olares **pulls** images. Laptop proof is save + import + `market upload`. Local version is `max(git Chart + 1 patch, already-uploaded + 1)` from `scripts/local-test.sh`. Helm cannot resolve `-test`. Never commit the local number.

1. `.dsh/config.json` complete (`npm run configure`). Panel already wrote `image.platform` and probed SSH for save mode.
2. Build + transfer + upload:

```bash
scripts/local-test.sh "${OLARES_MACHINE_ID:-1}"
```

3. Install from **upload**:

```bash
APP="$(node -e "console.log(JSON.parse(require('fs').readFileSync('.dsh/config.json','utf8')).appName)")"
VER="$(node scripts/lib/next-local-version.mjs)"
# after local-test.sh, install the version it printed (OLARES_LOCAL_VERSION)
olares-cli market install "$APP" -s upload --version "$VER" --watch --watch-timeout 1m
```

If Router is not installed, the UI can still be `running` while chat fails. Confirm Router (or a Model Console on 1.12.6) before calling the install done.

Same name already installed from another source → uninstall, then install from upload. Same upload version again → `upgrade`. Details and hydration 404: [deploy.md](../__agent__/skills/dsh-scaffold/references/deploy.md).

Done when `GET /api/health` is `kernel=dsh-web` and Settings → Apps shows the entrance URL. Chat uses `/llm/v1` (Router on 1.12.7; Model Console `/v1` on 1.12.6). No `sk-` in the chart.

## Chart invariants (already set)

Keep git versions equal: Chart `version`, Manifest `metadata.version` / `versionName`, values image **tag**. `appid` = `name`. Do not drop `appData` / `appCache` / `appCommon` / `userData: [Home]`, `ENABLE_DIND`, `apiTimeout: 0`, `runAsUser`, `Recreate`. Lint: `olares-cli chart lint deploy/<name>`.

## Hard rules

- Four names identical: `project.json` `name`, `deploy/<name>/`, Chart `name`, Manifest `name` / `appid`. Pattern `^[a-z][a-z0-9]{3,29}$`. Reserved names (`test`, `app`, `web`, …) are rejected.
- Do not vendor a hand-copied `olares-*` snapshot; `scripts/sync-olares-skills.sh`.
- Do not commit generated agent dirs (`.cursor/`, `.claude/`, …) or the local next-patch number.
- Never print passwords or tokens.
