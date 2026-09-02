---
name: olares-cli-setup
description: >-
  Download and install olares-cli. The user logs in themselves
  (olares-cli profile login / gh auth login). Use when olares-cli is
  missing, PATH is empty, the user says 下载olares-cli, 安装olares-cli,
  装cli, or an auth error (never / invalidated / 401 / 459) blocks deploy
  because they are not logged in yet.
---

# olares-cli setup (this repo)

Bootstrap for a laptop talking to a **remote** Olares. Does not install Olares OS.

Install the binary if it is missing. The user runs `olares-cli profile login` in their own terminal. Never run login yourself.

Run this skill when `npm run preflight` reports `olares-cli` missing or broken.

If `olares-shared/SKILL.md` exists under `node __agent__/install.mjs --print-global` or `~/.agents/skills/`, follow that skill for profile **status** only — do not run login.

## 1. Ensure the binary

```bash
__agent__/skills/olares-cli-setup/scripts/ensure-olares-cli.sh
# also install published olares-* skills for this agent:
__agent__/skills/olares-cli-setup/scripts/ensure-olares-cli.sh --with-skills
```

The script is non-interactive. Prefer it over `npx @olares/cli@latest install` (that wizard is for humans).

| Situation | Action |
| --- | --- |
| `olares-cli` already on `PATH` | Print version; do not reinstall unless the user asked to upgrade. If `olares-image` is missing, the script still runs `--with-skills`. |
| macOS / Windows / Linux **dev box** | `npm install -g @olares/cli@latest` |
| Linux **Olares host** (`/usr/local/bin/olares-cli` or `/usr/bin/olares-cli` exists) | Side-by-side only: `npm install -g @olares/cli@latest --prefix ~/.olares-cli-npm` and put `~/.olares-cli-npm/bin` first on `PATH`. Never `--force` over the OS bundle |
| One-off, no global install | `npx @olares/cli@latest <verb>` |

`npm` / `npx` installs are **remote-only**. They can `profile` / `market` / `chart` / `cluster` against a running Olares. They cannot `upgrade` / `node` / `os` / `gpu` the host. That stays on the OS-bundled binary.

This command does **not** install Olares OS. Host bootstrap is out of scope.

## 2. Install the global skill suite

```bash
npx skills add beclab/Olares -y -g -a "$SKILLS_AGENT"
```

`SKILLS_AGENT` is the id from `__agent__/.installed.json` (set by `node __agent__/install.mjs --agent <id>`). Pass `-a` explicitly when the agent runs this — without it the skills CLI may pick an unsupported agent. Never `sudo` this command.

After this, load global skills for their own domains: `olares-shared` (auth), `olares-chart`, `olares-market`, `olares-doctor`, plus `olares-hot-reload` under `node __agent__/install.mjs --print-global` when those folders exist.

## 3. Login — user only

The agent **does not** run `olares-cli profile login` or `profile import`. Check status, then stop if they are not logged in:

```bash
olares-cli profile list
```

| Status | Action |
| --- | --- |
| `logged-in` or `expired` | Proceed. Call market/chart/cluster as usual. An expired access token refreshes on the next request |
| `never`, `invalidated`, or no profile | Stop. They run `olares-cli profile login` in their terminal |
| `unknown` / unparseable | Run the business command; if it asks them to log in, stop and point them at `profile login` |

Same rule for GitHub: the agent never runs `gh auth login`. If `gh` is missing, tell them to install [GitHub CLI](https://cli.github.com/). If `gh auth status` fails, tell them to log in themselves, then only call `gh`. Image publish prefers a pushed `v*` tag; `gh workflow run` needs the `workflow` scope (`gh auth refresh -s workflow`) and the workflow file on the default branch.

After they say they have logged in, re-run `olares-cli profile list` / `gh auth status` and continue.

## 4. Auth-readiness gate (every later command)

- Do not preflight every command. The CLI refreshes and retries an authentication rejection once.
- Stop for **user** login when the CLI says the credential is absent/invalidated, or after a persistent 401/459 with a login action.
- A 403, network error, or 5xx is **not** a login signal. Do not build a retry loop around auth errors.
- Never print access or refresh tokens.

Then continue the product workflow in [`dsh-scaffold`](../dsh-scaffold/SKILL.md).
