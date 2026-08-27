# `_reference`

Official [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) source. This tree is **not** product code — study it, then implement overlays in `packages/`.

The checkout is gitignored. After cloning this repo:

```bash
scripts/fetch-reference.sh
```

| Pin | Value |
| --- | --- |
| Repo | `https://github.com/deepseek-ai/deepseek-harness` |
| Version | `0.1.1-rc.2` |
| Commit | `b150a55` (2026-08-21) — `release/dsh-0.1.1-rc.2` |

This is newer than the Lares (`dina`) reference checkout (`47f9438`, 2026-08-13, `0.1.0-rc.5`).

## Run the official web UI

```bash
cd _reference/deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

Default URL: `http://127.0.0.1:3080`. Start from `docs/development.md` and `docs/architecture.md` before writing plugins.

To pin a fork or tag:

```bash
DSH_HARNESS_REPO=https://github.com/<org>/deepseek-harness.git \
DSH_HARNESS_REF=v0.1.1-rc.2 \
  scripts/fetch-reference.sh
```
