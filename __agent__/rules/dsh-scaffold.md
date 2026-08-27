# DSH Scaffold

This repo is a DeepSeek Harness overlay that becomes an Olares chat package.

On first-user init, and before `npm run configure`, run `npm run preflight`. Node.js 22+, `olares-cli`, a running Docker engine, and `olares-image/scripts/local-test.sh` must be ready. If Docker is missing, run `scripts/ensure-docker.sh`. If `olares-image` is missing, run `ensure-olares-cli.sh --with-skills` (the script also does this when the CLI is already on PATH). `npm run configure` repeats that check and will not open the panel if any is missing.

When the user asks to deploy, run `npm run configure` if `.dsh/config.json` is missing or incomplete. That panel writes names and endpoints only. Hub auth stays in local `docker login`; Olares auth stays in the CLI profile. Do not collect passwords in chat.

- `__agent__/skills/olares-cli-setup/SKILL.md` — install `olares-cli`
- `__agent__/skills/dsh-scaffold/SKILL.md` — overlay work + upload/install

Do not vendor `olares-*` into `packages/skills/`. Local cluster proof is save + import + `market upload` at `max(git+1, already-uploaded+1)` via `scripts/local-test.sh`. Never `docker push` to `beclab/`.
