# DSH Scaffold

[English](README.md) · [中文](README.zh-CN.md)

Turn a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) overlay into **your own chat**, then install it on **your Olares**. You talk to the agent; the agent does the work.

The repo already ships a working chat (dsh web, models, DinD, `olares-cli`). You name it, brand it if you want, and ask the agent to put it on your machine.

This is a **template**. Fork it to your GitHub, then clone **your fork**. Do not treat `beclab/dsh_scaffold` as the repo you develop in.

The chat image is built by **GitHub Actions** on your fork and published to GHCR (`ghcr.io/<you>/<app>`). Your laptop does **not** need Docker. The agent then uses `olares-cli` to upload the chart and install it on your Olares.

The build is orchestrated by [`.github/workflows/image.yml`](.github/workflows/image.yml). It runs on your fork, so your work has to be **committed and pushed** — a push to `main` builds the image, and tags `v*` or a manual run of the `image` workflow do the same.

## Start here

1. Fork this repository, clone your fork, and open that folder in Cursor, Claude Code, or another skill-aware agent. Enable Actions on the fork.
2. In your own terminal, log in (the agent will not do this for you):
   - `gh auth login`
   - `olares-cli profile login`
3. Copy `.env.example` to `.env` if you want a custom name. Leave `IMAGE_REPO` empty.
4. Say what you want, for example:
   - “Install olares-cli”
   - “I want my own chat on my Olares”
   - “Change the name / title / color”
   - “Run it locally first”

You need Node.js 22+, `olares-cli`, GitHub, and an Olares (≥ 1.12.6). Docker is optional. The agent checks Node, `olares-cli`, the git remote, and `gh` (`npm run preflight`). **Do not type passwords, Desktop URLs, or TOTP in chat.**

## What to ask the agent

| You want | Say something like |
| --- | --- |
| A name other than `dshscaffold` | “Call this chat `mychat`” (before the first install) |
| Title, color, how it refers to itself | “Change the brand” |
| New behavior | “Add a plugin that …” |
| Skills inside the chat | “Add a skill for …” |
| Laptop preview | “Run it locally” |
| On your Olares | “Install this on my machine” |

The agent knows where those files live and which commands to run. You do not need the command list.

## For the agent

How to carry this out — install the laptop pack, overlay, GitHub Actions image, upload, install on the user’s Olares — is in **[docs/agent.md](docs/agent.md)**. That document is for the agent, not a user checklist.

Do not commit generated agent directories (`.cursor/`, `.claude/`, …).
