---
name: dsh-scaffold
description: >-
  Secondary-develop a DeepSeek Harness chat app in this repo and deploy it
  to the user's own Olares. Use when the user mentions 二次开发, dsh, harness,
  plugin, overlay, 部署, 上传, market upload, install on my Olares, 装到机器上,
  热更新, hot reload, or working in packages/service, packages/plugins, or
  deploy/dshscaffold.
---

# DSH Scaffold (this repo)

Turn overlays in `packages/` into an Olares chat package and install it from the **upload** source on the user's machine. This is not a public Market listing.

This repo is a **template**. Users **fork** it and clone **their** fork. If they cloned `beclab/dsh_scaffold` as `origin`, they cannot push overlay work there — fork first. Image build is laptop Docker (`scripts/local-test.sh`), not GitHub CI and not a Hub pull of `docker.io/local/…`.

## First move

1. Run `npm run preflight` (or `scripts/preflight.sh`). This is the first init step: Node.js 22+, `olares-cli`, a running Docker engine, and `olares-image/scripts/local-test.sh`.
2. If Node is missing or older than 22, stop and tell the user to install Node.js 22+. If `olares-cli` is missing, follow [olares-cli-setup](../olares-cli-setup/SKILL.md). If Docker is missing or the engine is down, run `scripts/ensure-docker.sh`. If `olares-image` is missing, run `ensure-olares-cli.sh --with-skills`. If save-mode SSH fails later, do not scp — reopen the panel so they can enter SSH username and password, or use Hub push.
3. Only after preflight passes: if the user wants to deploy and `.dsh/config.json` is missing or incomplete, run `npm run configure`. That command repeats the same check and will not open the panel if Node / CLI / Docker / olares-image is missing. Do not collect Desktop / Hub / passwords in chat.
4. Then follow [docs/agent.md](../../../docs/agent.md):
   - Overlay / plugin / local run → [references/develop.md](references/develop.md)
   - Chart / image / upload / install → [references/deploy.md](references/deploy.md)

## Hard rules

- Product code stays in `packages/`. Official harness is `_reference/deepseek-harness` (gitignored). Do not copy harness source into `packages/`.
- `packages/skills/` is the **in-app** skill tree. Do not vendor a hand-copied `olares-*` snapshot. Sync with `scripts/sync-olares-skills.sh` (same export the image runs).
- Four names stay identical: `project.json` `name`, `deploy/<name>/`, `Chart.yaml` `name`, `OlaresManifest.yaml` `metadata.name` / `metadata.appid`. Pattern: `^[a-z][a-z0-9]{3,29}$`. Do not use reserved names (`test`, `app`, `web`, `dsh`, …).
- Local cluster proof is **save + import + `market upload`**. Version is `max(git+1, already-uploaded+1)` via `scripts/local-test.sh`. Helm cannot resolve `-test` prereleases. Never `docker push` to `beclab/`. Never commit the local number.
- Skip-Hub image repo is `docker.io/local/<name>`, not `docker.io/beclab/*`.
- Upload target is **the user's** Olares (`-s upload`). Do not open a `beclab/apps` PR unless they asked to publish.

## After CLI + login

Prefer these global skills when they exist; this repo only specialises them:

| Task | Skill |
| --- | --- |
| Auth / profile | `olares-shared` |
| Chart lint / package / deploy loop | `olares-chart` |
| Install / upgrade / status | `olares-market` |
| Runtime failure | `olares-doctor` |
| Local image save + `scripts/local-test.sh` | `olares-image` under the agent global skills dir |
| rsync overlay (`dev.hotReload`) | `olares-hot-reload` under the agent global skills dir |

Global skills root: `node __agent__/install.mjs --print-global` (from `__agent__/.installed.json`, with fallbacks). Example: `$GLOBAL/olares-image/scripts`.

If those folders are missing, run `olares-cli-setup` with `--with-skills`, then continue from [references/deploy.md](references/deploy.md).
