---
name: olares-cli-setup
description: >-
  Download and install olares-cli, then log in with an Olares ID so later
  market/chart/cluster commands hit the user's machine. Use when olares-cli
  is missing, PATH is empty, the user says 下载olares-cli, 安装olares-cli,
  登录olares-cli, profile login, profile list, 装cli, or an auth error
  (never / invalidated / 401 / 459) blocks deploy.
---

# olares-cli setup (this repo)

Bootstrap for a laptop talking to a **remote** Olares. Does not install Olares OS.

Identity and machine settings are collected by `npm run configure` and stored in **`.dsh/config.json`**. Do not ask for Desktop URL, passwords, or TOTP in chat.

Run this skill when `npm run preflight` (or `scripts/preflight.sh`) reports `olares-cli` missing or broken. Do not open the setup panel until preflight passes. `npm run configure` repeats the same check.

If `olares-shared/SKILL.md` exists under `node __agent__/install.mjs --print-global` or `~/.agents/skills/`, follow that skill for profile recovery.

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

After this, load global skills for their own domains: `olares-shared` (auth), `olares-chart`, `olares-market`, `olares-doctor`, plus `olares-image` and `olares-hot-reload` under `node __agent__/install.mjs --print-global` when those folders exist.

## 3. Login (ask first)

Never log in on the user's behalf unless they asked. Never put a password, TOTP, or refresh token in command arguments, chat, logs, or files.

```bash
olares-cli profile list
```

| Status | Action |
| --- | --- |
| `logged-in` or `expired` | Proceed. An expired access token refreshes on the next request |
| `never` or `invalidated` | Stop. Require `OLARES_ID` in `.env`, then drive interactive login |
| `unknown` / unparseable | Run the business command; re-login only if a typed auth failure persists |

Interactive login (password is prompted, not echoed):

```bash
olares-cli profile login --olares-id "$OLARES_ID"
```

Start the process so it waits at the password prompt. Forward that prompt to the user. If 2FA is on, the CLI then asks for TOTP — do not persist the code. After the process exits:

```bash
olares-cli profile list
olares-cli profile current
# if OLARES_PROFILE is set:
olares-cli profile use "$OLARES_PROFILE"
```

Import (only when the user already has a refresh token in a secret env var):

```bash
olares-cli profile import --olares-id "$OLARES_ID" --refresh-token "$OLARES_REFRESH_TOKEN"
```

There is no `auth login` / `auth logout`. “Logout” is `olares-cli profile remove <name>`. One profile is one instance + one identity; there is no per-command `--profile`. Switch with `olares-cli profile use <name>`.

Ask before login, credential replacement, or switching the selected profile.

## 4. Auth-readiness gate (every later command)

- Do not preflight every command. The CLI refreshes and retries an authentication rejection once.
- Stop for login when the CLI says the credential is absent/invalidated, or after a persistent 401/459 with a login action.
- A 403, network error, or 5xx is **not** a login signal. Do not build a retry loop around auth errors.
- Never print access or refresh tokens.

Then continue the product workflow in [`dsh-scaffold`](../dsh-scaffold/SKILL.md).
