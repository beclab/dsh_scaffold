# Agent playbook

This document is for the **laptop agent**, not the end user. Users talk to you; you run the steps. Do not paste this playbook into chat as a checklist for them to execute.

User-facing entry: [README.md](../README.md) / [README.zh-CN.md](../README.zh-CN.md).

## First move

Follow [AGENTS.md](../AGENTS.md): detect which product you are, `node __agent__/install.mjs --agent <id>` if needed, then read:

- [dsh-scaffold](../__agent__/skills/dsh-scaffold/SKILL.md)
- [olares-cli-setup](../__agent__/skills/olares-cli-setup/SKILL.md) when the CLI is missing
- Overlay / local run → [references/develop.md](../__agent__/skills/dsh-scaffold/references/develop.md)
- Chart / GHCR / upload / install → [references/deploy.md](../__agent__/skills/dsh-scaffold/references/deploy.md)

After install, continue the user’s request. Do not stop at the copy step.

## What the user is allowed to do

This scaffold is a **template**. The git path is **fork → clone your fork**. `beclab/dsh_scaffold` is the upstream, not the repo they develop in. If `origin` is still `beclab/dsh_scaffold`, have them fork (or add their own remote) before they need to `git push`. Image build **does** wait on that: GitHub Actions publishes to `ghcr.io/<owner>/<app>`.

This scaffold installs a chat on **the user’s own Olares** (`market upload` / `-s upload`). That is the whole product path.

Do **not** open a public Market listing, a `beclab/apps` PR, or `docker push` to `beclab/` unless the user explicitly asked to publish. If they did not ask, never mention 上架 / public listing as a next step.

**Image = GitHub.** Workflow `.github/workflows/image.yml` builds on GitHub-hosted runners and pushes to GHCR. The laptop does not need Docker. Olares pulls `ghcr.io/<fork-owner>/<app>:<chart-version>`.

That workflow only exists for GitHub once it is **committed and pushed to the fork**. Triggers: push to `main`/`master`, tag `v*`, or `gh workflow run image` (dispatch needs the file on the default branch). Before waiting on a build, make sure HEAD is pushed — `wait-ghcr.mjs` errors out instead of polling a build that will never start.

## Talk, don’t quiz

Drive the work. Ask only when you are blocked on a choice only they can make (name of the chat, which machine). Never collect Desktop URL, Hub password, Olares password, TOTP, or SSH password in chat.

## Environment preflight

Do this on first-user init, and again before deploy.

```bash
npm run preflight
```

| Result | Action |
| --- | --- |
| `node` missing or older than 22 | Stop. The user must install Node.js 22+ and put `node` on `PATH`. |
| `olares-cli` missing or broken | Follow [olares-cli-setup](../__agent__/skills/olares-cli-setup/SKILL.md), then run preflight again. |
| `github` fail | `origin` is missing or not github.com. They must fork this template and clone **that** fork. |
| `gh` missing / not logged in | They install [GitHub CLI](https://cli.github.com/) and run `gh auth login` **themselves**. Never run that command. |
| `olares` not logged in | They run `olares-cli profile login` **themselves**. Never run that command or collect a password. |
| `docker` | Not required. Do not block deploy on Docker Desktop. |
| all `ok` | Continue. Deploy still requires origin to be **their** fork (`inspectGithubFork`), not `beclab/dsh_scaffold`. |

There is no configure panel. App name is `project.json` / `node scripts/lib/apply-app-name.mjs`. After they are logged in, only **call** `olares-cli` and `gh` (market, workflow, api).

## Typical requests → what you do

| User says | You do |
| --- | --- |
| 装 cli / 登录 | 缺 CLI 则只装二进制；登录让用户在本机终端自己跑 `olares-cli profile login` / `gh auth login`，agent 不代登 |
| 做一个自己的 chat / 改名 | origin 若是 `beclab/dsh_scaffold`，先让用户 fork；然后 `node scripts/lib/apply-app-name.mjs <name>` — four names stay identical |
| 改标题 / 颜色 / 自称 | `packages/plugins/bundle-web/host/brand/identity.js` (+ `mark.js` for the icon) |
| 加能力 / 插件 | new module under `packages/plugins/`, list it in `cordis.patch.yml` |
| 这个 chat 自带 skill | write under `packages/skills/`; `olares-*` only via `npm run skills:sync` |
| 先本地跑 | `.env` from example, `npm install`, `npm run skills:sync`, `npm run build`, `npm run start` |
| 装到我的 Olares | fork + `gh` + CLI profile → `scripts/deploy.sh --install` |

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

Olares **pulls** images from GHCR. Laptop proof is GitHub Actions + `market upload`. Chart version, Manifest version, and values image tag stay equal in git.

1. Origin is the user’s fork. Actions enabled. The user has already logged in with `gh` and `olares-cli` in their own terminal.
2. Copy `.env.example` to `.env` if needed. `IMAGE_REPO` can stay empty. Then `scripts/deploy.sh --install`.
3. Build + upload + install:

```bash
scripts/deploy.sh --install
```

That waits for workflow `image`, packages `deploy/<name>`, `market upload`, then `install` or `upgrade` from `-s upload`.

If Router is not installed, the UI can still be `running` while chat fails. Confirm Router (or a Model Console on 1.12.6) before calling the install done.

Same name already installed from another source → uninstall, then install from upload. Details: [deploy.md](../__agent__/skills/dsh-scaffold/references/deploy.md).

Done when `GET /api/health` is `kernel=dsh-web` and Settings → Apps shows the entrance URL. Chat uses `/llm/v1` (Router on 1.12.7; Model Console `/v1` on 1.12.6). No `sk-` in the chart.

## Chart invariants (already set)

Keep git versions equal: Chart `version`, Manifest `metadata.version` / `versionName`, values image **tag**. `appid` = `name`. Do not drop `appData` / `appCache` / `appCommon` / `userData: [Home]`, `ENABLE_DIND`, `apiTimeout: 0`, `runAsUser`, `Recreate`. Lint: `olares-cli chart lint deploy/<name>`.

## Hard rules

- Four names identical: `project.json` `name`, `deploy/<name>/`, Chart `name`, Manifest `name` / `appid`. Pattern `^[a-z][a-z0-9]{3,29}$`. Reserved names (`test`, `app`, `web`, …) are rejected.
- Do not vendor a hand-copied `olares-*` snapshot; `scripts/sync-olares-skills.sh`.
- Do not commit generated agent dirs (`.cursor/`, `.claude/`, …).
- Never print passwords or tokens.
- Never `docker push` to `beclab/`.
