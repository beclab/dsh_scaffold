# DSH Scaffold

This repo is a DeepSeek Harness overlay that becomes an Olares chat package.

On first-user init run `npm run preflight`. Required: Node.js 22+, `olares-cli` already logged in by the user, a GitHub fork as `origin`, and `gh` already logged in by the user. Docker is optional — images are built in GitHub Actions and published to GHCR. If `olares-cli` is missing, follow olares-cli-setup.

When the user asks to deploy: origin must be **their** GitHub fork (not `beclab/dsh_scaffold`). Bind GHCR names, wait for workflow `image`, then `olares-cli market upload` / install. **Never** run `olares-cli profile login` or `gh auth login` for them. Never collect passwords in chat.

- `__agent__/skills/olares-cli-setup/SKILL.md` — install `olares-cli`
- `__agent__/skills/dsh-scaffold/SKILL.md` — overlay work + CI image + upload/install

Do not vendor `olares-*` into `packages/skills/`. Never `docker push` to `beclab/`.
