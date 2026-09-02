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

This repo is a **template**. Users **fork** it and clone **their** fork. If `origin` is still `beclab/dsh_scaffold`, they cannot push overlay work or publish images — fork first. The image is built in **GitHub Actions** and published to `ghcr.io/<owner>/<app>`. The laptop does **not** need Docker.

## First move

1. Run `npm run preflight`. Required: Node.js 22+, `olares-cli`, `origin` on github.com, and `gh` logged in. Docker is not required.
2. If Node is missing or older than 22, stop and tell the user to install Node.js 22+. If `olares-cli` is missing, follow [olares-cli-setup](../olares-cli-setup/SKILL.md). If they are not logged in to Olares or GitHub, tell them to run `olares-cli profile login` and `gh auth login` **in their own terminal** — never run those commands, never collect credentials. If origin is not GitHub, they must fork and clone that fork.
3. Then follow [docs/agent.md](../../../docs/agent.md):
   - Overlay / plugin / local run → [references/develop.md](references/develop.md)
   - Chart / GHCR image / upload / install → [references/deploy.md](references/deploy.md)

## Hard rules

- Product code stays in `packages/`. Official harness is `_reference/deepseek-harness` (gitignored). Do not copy harness source into `packages/`.
- `packages/skills/` is the **in-app** skill tree. Do not vendor a hand-copied `olares-*` snapshot. Sync with `scripts/sync-olares-skills.sh` (same export the image runs).
- Four names stay identical: `project.json` `name`, `deploy/<name>/`, `Chart.yaml` `name`, `OlaresManifest.yaml` `metadata.name` / `metadata.appid`. Pattern: `^[a-z][a-z0-9]{3,29}$`. Do not use reserved names (`test`, `app`, `web`, `dsh`, …).
- Image proof is **GitHub Actions → GHCR** (`ghcr.io/<fork-owner>/<app>:<chart-version>`), then `olares-cli` `market upload` / install. Never laptop `docker push` to `beclab/`. Never require Docker Desktop for deploy.
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
