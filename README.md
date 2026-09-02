# DSH Scaffold

[English](README.md) · [中文](README.zh-CN.md)

Turn a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) overlay into a chat and install it on your Olares. You state the goal; the agent runs it.

This is a template: fork it, clone **your fork**, and work there.

## Flow

1. Fork this repo, clone your fork, open it in a skill-aware agent. Enable Actions on the fork.
2. In your own terminal:
   - `gh auth login`
   - `olares-cli profile login`
3. You need Node.js 22+, [GitHub CLI](https://cli.github.com/), `olares-cli`, and Olares ≥ 1.12.6. Ask the agent to install `olares-cli` if it is missing.
4. Say what you want, for example “Install this on my Olares”.

The agent commits and pushes. [`.github/workflows/image.yml`](.github/workflows/image.yml) builds `ghcr.io/<you>/<app>:<chart-version>` on GitHub (push to `main`/`master`, a `v*` tag, or `gh workflow run image`). Then `olares-cli market upload` / install. The image name comes from git `origin`.

The **first** time a given image name is built, set that container (default `dshscaffold`) to **Public** under [GitHub → Packages](https://github.com/settings/packages). Later tags on the same name stay public.

## What to ask the agent

| You want | Say something like |
| --- | --- |
| A different app id | “Call this chat `mychat`” (before the first install) |
| Title, color, how it refers to itself | “Change the brand” |
| New behavior | “Add a plugin that …” |
| Skills inside the chat | “Add a skill for …” |
| Laptop preview | “Run it locally” |
| On Olares | “Install this on my machine” |

Local run: copy `.env.example` to `.env`, set `LLM_GATEWAY_URL`, then `npm install`, `npm run skills:sync`, `npm run build`, `npm run start`.

Agent steps: **[`__agent__/`](__agent__/)**. Do not commit generated agent directories (`.cursor/`, `.claude/`, …).
