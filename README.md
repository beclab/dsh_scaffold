# DSH Scaffold

[English](README.md) · [中文](README.zh-CN.md)

Turn a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) overlay into **your own chat**, then install it on **your Olares**. You talk to the agent; the agent does the work.

The repo already ships a working chat (dsh web, models, DinD, `olares-cli`). You name it, brand it if you want, and ask the agent to put it on your machine.

This is a **template**. Fork it to your GitHub, then clone **your fork**. Do not treat `beclab/dsh_scaffold` as the repo you develop in.

The chat image is **not** downloaded from Docker Hub. The agent builds it on your laptop with Docker, then copies it onto your Olares (`docker save` → import). `docker.io/local/…` in the chart is only a local tag name, not a registry to pull from. If you fill in your own Hub repo in the setup panel, the agent pushes there instead and Olares pulls from Hub.

## Start here

1. Fork this repository, clone your fork, and open that folder in Cursor, Claude Code, or another skill-aware agent.
2. Say what you want, for example:
   - “Install olares-cli and log me in”
   - “I want my own chat on my Olares”
   - “Change the name / title / color”
   - “Run it locally first”
3. When the agent opens the setup panel, finish it there. **Do not type passwords, Desktop URLs, or TOTP in chat.**

```bash
npm run configure
```

The panel writes gitignored `.dsh/config.json`. After that, the agent reads that file and does not ask again.

You need Node.js 22+, Docker, and an Olares (≥ 1.12.6). The agent checks Node, `olares-cli`, Docker, and the image pack scripts first (`npm run preflight`). It can install the CLI and those scripts; if Docker is missing it opens the Docker Desktop install page. `npm run configure` runs that check again and will not start until they are present.

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

How to carry this out — install the laptop pack, configure, overlay, save + upload, install on the user’s Olares — is in **[docs/agent.md](docs/agent.md)**. That document is for the agent, not a user checklist.

Do not commit generated agent directories (`.cursor/`, `.claude/`, …).
