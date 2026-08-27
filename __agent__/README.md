# __agent__/

Agent skills and standing rules for this repo, stored in an agent-neutral tree.

Do not assume Cursor. The committed copy lives here. On the first conversation the agent detects which product it is and runs:

```bash
node __agent__/install.mjs --agent <id>
```

That **copies** (does not delete) these files into the agent’s project directory (`.cursor/skills/`, `.claude/skills/`, `.agents/skills/`, …). `__agent__/` stays the source of truth. Generated agent directories are gitignored.

| Path | What |
| --- | --- |
| `skills/` | Project skills (`SKILL.md` trees) |
| `rules/` | Standing rules (Cursor gets a generated `.mdc`) |
| `agents.json` | Agent id → project / global skill directories |
| `install.mjs` | Copy skills into the detected agent |

Known `--agent` ids: `cursor`, `claude-code`, `github-copilot`, `windsurf`, `trae`, `codex`, `gemini-cli`, `opencode`, `cline`, `universal`.
