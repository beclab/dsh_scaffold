---
name: dsh-scaffold
description: >-
  Secondary-develop a DeepSeek Harness chat app in this repo and deploy it
  to the user's own Olares. Use when the user mentions 二次开发, dsh, harness,
  plugin, overlay, 部署, 上传, market upload, install on my Olares, 装到机器上,
  GitHub Actions, GHCR, or working in packages/service, packages/plugins,
  or deploy/dshscaffold.
---

# DSH Scaffold (this repo)

Turn overlays in `packages/` into an Olares chat package and install it from the **upload** source on the user's machine. This is not a public Market listing.

This repo is a **template**. Users **fork** it and clone **their** fork. If `origin` is still `beclab/dsh_scaffold`, they must fork first. GitHub Actions publishes `ghcr.io/<owner>/<app>`. Deploy: `scripts/deploy.sh --install`. First GHCR package for that name: user sets **Public** in GitHub.

## First move

1. Run `npm run preflight`. Required: Node.js 22+, `olares-cli` logged in by the user, **their** GitHub fork as `origin`, `gh` logged in.
2. If Node is missing or older than 22, stop; they install Node.js 22+. If `olares-cli` is missing, follow [olares-cli-setup](../olares-cli-setup/SKILL.md). If they are not logged in, they run `olares-cli profile login` and `gh auth login` **in their own terminal**. If origin is the template or not GitHub, they fork and clone that fork.
3. Then:
   - Overlay / plugin / local run → [references/develop.md](references/develop.md)
   - Chart / GHCR image / upload / install → [references/deploy.md](references/deploy.md)

## Typical requests

| User says | You do |
| --- | --- |
| 装 cli / 登录 | Install the binary if missing; they run `olares-cli profile login` / `gh auth login` |
| 做一个自己的 chat / 改名 | `node scripts/lib/apply-app-name.mjs <name>`, before the first upload |
| 改标题 / 颜色 / 自称 | `packages/plugins/bundle-web/host/brand/identity.js` (+ `mark.js`) |
| 加能力 / 插件 | Module under `packages/plugins/`, listed in `cordis.patch.yml` |
| 这个 chat 自带 skill | `packages/skills/`; `olares-*` via `npm run skills:sync` |
| 先本地跑 | `.env` from example, `npm install`, `npm run skills:sync`, `npm run build`, `npm run start` |
| 装到我的 Olares | `scripts/deploy.sh --install` |

Ask only for choices they must make (app name, which machine).

## Hard rules

- Product code stays in `packages/`. Depend on `@deepseek-ai/*`; do not copy harness source into `packages/`.
- `packages/skills/` is the **in-app** skill tree. Do not vendor a hand-copied `olares-*` snapshot. Sync with `scripts/sync-olares-skills.sh` (same export the image runs).
- Four names stay identical: `project.json` `name`, `deploy/<name>/`, `Chart.yaml` `name`, `OlaresManifest.yaml` `metadata.name` / `metadata.appid`. Pattern: `^[a-z][a-z0-9]{3,29}$`. Do not use reserved names (`test`, `app`, `web`, `dsh`, …).
- Image: GitHub Actions → GHCR, then `olares-cli` `market upload` / install. Start CI with `v<chart-version>`. If wait-ghcr says not public, they set Public in GitHub. If the workflow cannot start: enable Actions, put `image.yml` on the default branch, or `gh auth refresh -s workflow`. Never `docker push` to `beclab/`.
- Upload target is **the user's** Olares (`-s upload`). Do not open a `beclab/apps` PR unless they asked to publish.

## After CLI + login

Prefer these global skills when they exist; this repo only specialises them:

| Task | Skill |
| --- | --- |
| Auth / profile | `olares-shared` |
| Chart lint / package / deploy loop | `olares-chart` |
| Install / upgrade / status | `olares-market` |
| Runtime failure | `olares-doctor` |
| rsync overlay (`dev.hotReload`) | `olares-hot-reload` under the agent global skills dir |

Global skills root: `node __agent__/install.mjs --print-global`.
