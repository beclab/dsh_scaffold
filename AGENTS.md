# DSH Scaffold

Laptop agent pack lives in [`__agent__/`](__agent__/). This repo does not assume Cursor (or any other product).

## First move (every new conversation)

1. Identify which coding agent you are from your own system prompt. Do not ask the user which IDE they use if you can tell.
2. Map yourself to an id in [`__agent__/agents.json`](__agent__/agents.json) (`cursor`, `claude-code`, `github-copilot`, `windsurf`, `trae`, `codex`, `gemini-cli`, `opencode`, `cline`, …). If you cannot tell, use `universal`.
3. If `__agent__/.installed.json` is missing or its `agent` is not you, run:

```bash
node __agent__/install.mjs --agent <id>
```

Then read [`docs/agent.md`](docs/agent.md) and [`__agent__/skills/dsh-scaffold/SKILL.md`](__agent__/skills/dsh-scaffold/SKILL.md) (and [`__agent__/skills/olares-cli-setup/SKILL.md`](__agent__/skills/olares-cli-setup/SKILL.md) when the CLI is missing). Follow [`__agent__/rules/dsh-scaffold.md`](__agent__/rules/dsh-scaffold.md) every turn. After install, continue the user’s request — do not stop at the copy step. First-user init: `npm run preflight` (Node 22+, `olares-cli`, Docker, `olares-image`) before `npm run configure`.

Do not commit the generated agent directories (`.cursor/`, `.claude/`, `.agents/`, …).
