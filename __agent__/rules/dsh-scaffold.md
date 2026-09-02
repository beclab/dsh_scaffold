# DSH Scaffold

This repo is a DeepSeek Harness overlay that becomes an Olares chat package.

On first-user init run `npm run preflight`. Required: Node.js 22+, `olares-cli` logged in by the user, **their** GitHub fork as `origin`, `gh` logged in. Images: GitHub Actions → GHCR from origin. If `olares-cli` is missing, follow olares-cli-setup.

When they ask to deploy: origin is **their** fork (not `beclab/dsh_scaffold`). Push tag `v<chart-version>`, then `scripts/deploy.sh --install`. If GHCR is private after a successful `image` run, they set the package Public in GitHub. Never run `olares-cli profile login` or `gh auth login`.

- `__agent__/skills/olares-cli-setup/SKILL.md` — install `olares-cli`
- `__agent__/skills/dsh-scaffold/SKILL.md` — overlay + CI image + upload/install

Do not vendor `olares-*` into `packages/skills/`. Never `docker push` to `beclab/`.
