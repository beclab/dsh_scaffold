#!/usr/bin/env bash
# Ensure olares-cli is on PATH. Does not log in or print tokens.
#
#   ensure-olares-cli.sh              install the binary if missing
#   ensure-olares-cli.sh --with-skills  also install published olares-* skills
set -euo pipefail

WITH_SKILLS=0
case "${1-}" in
  "") ;;
  --with-skills) WITH_SKILLS=1 ;;
  -h | --help)
    sed -n '2,6p' "$0"
    exit 0
    ;;
  *)
    echo "unknown option: $1 (use --with-skills)" >&2
    exit 2
    ;;
esac

find_root() {
  local d
  d="$(cd "$(dirname "$0")" && pwd)"
  while [[ "$d" != "/" ]]; do
    if [[ -f "$d/project.json" && -d "$d/__agent__/skills" ]]; then
      echo "$d"
      return 0
    fi
    d="$(dirname "$d")"
  done
  return 1
}

ROOT="$(find_root || true)"
CLI_VERSION="${OLARES_CLI_VERSION:-latest}"
NPM_PREFIX="${OLARES_CLI_NPM_PREFIX-}"
SKILLS_AGENT="${OLARES_SKILLS_AGENT-}"

if [[ -z "$SKILLS_AGENT" && -n "$ROOT" && -f "$ROOT/__agent__/.installed.json" ]]; then
  SKILLS_AGENT="$(sed -n 's/^  "agent": "\([^"]*\)".*/\1/p' "$ROOT/__agent__/.installed.json" | head -n 1)"
fi

if [[ -n "${OLARES_CLI_DOWNLOAD_MIRROR-}" ]]; then
  export OLARES_CLI_DOWNLOAD_MIRROR
fi

have_cli() {
  command -v olares-cli >/dev/null 2>&1
}

os_bundle_present() {
  [[ -e /usr/local/bin/olares-cli || -e /usr/bin/olares-cli ]]
}

print_cli() {
  local bin
  bin="$(command -v olares-cli)"
  echo "olares-cli: ${bin}"
  olares-cli --version 2>/dev/null || olares-cli -v 2>/dev/null || true
}

if have_cli; then
  print_cli
else
  if ! command -v npm >/dev/null 2>&1; then
    echo "error: npm is required to install @olares/cli (Node.js 22+)" >&2
    exit 1
  fi

  if [[ -n "$NPM_PREFIX" ]]; then
    npm install -g "@olares/cli@${CLI_VERSION}" --prefix "$NPM_PREFIX"
    export PATH="${NPM_PREFIX}/bin:${PATH}"
    echo "Add to your shell profile: export PATH=\"${NPM_PREFIX}/bin:\$PATH\""
  elif [[ "$(uname -s)" == "Linux" ]] && os_bundle_present; then
    echo "OS-bundled olares-cli present; installing npm copy side-by-side (do not overwrite the OS binary)."
    NPM_PREFIX="${HOME}/.olares-cli-npm"
    npm install -g "@olares/cli@${CLI_VERSION}" --prefix "$NPM_PREFIX"
    export PATH="${NPM_PREFIX}/bin:${PATH}"
    echo "Add to your shell profile: export PATH=\"\$HOME/.olares-cli-npm/bin:\$PATH\""
  else
    npm install -g "@olares/cli@${CLI_VERSION}"
  fi

  hash -r 2>/dev/null || true
  if ! have_cli; then
    echo "error: olares-cli still not on PATH after npm install" >&2
    echo "npm prefix: $(npm prefix -g 2>/dev/null || true)" >&2
    echo "npm bin: $(npm bin -g 2>/dev/null || true)" >&2
    exit 1
  fi
  print_cli
fi

image_skill_present() {
  [[ -f "${HOME}/.cursor/skills/olares-image/scripts/local-test.sh" ]] && return 0
  [[ -f "${HOME}/.agents/skills/olares-image/scripts/local-test.sh" ]] && return 0
  if [[ -n "$ROOT" ]]; then
    local printed
    printed="$(node "$ROOT/__agent__/install.mjs" --print-global 2>/dev/null || true)"
    [[ -n "$printed" && -f "${printed}/olares-image/scripts/local-test.sh" ]] && return 0
  fi
  return 1
}

if [[ "${WITH_SKILLS}" -eq 0 ]] && ! image_skill_present; then
  echo "olares-image missing; installing published olares-* skills"
  WITH_SKILLS=1
fi

if [[ "${WITH_SKILLS}" -eq 1 ]]; then
  if ! command -v npx >/dev/null 2>&1; then
    echo "error: npx is required to install olares-* skills" >&2
    exit 1
  fi
  if [[ -z "$SKILLS_AGENT" ]]; then
    echo "error: no agent id. Run: node __agent__/install.mjs --agent <id>" >&2
    echo "or set OLARES_SKILLS_AGENT (cursor, claude-code, github-copilot, universal, …)" >&2
    exit 1
  fi
  npx --yes skills add beclab/Olares -y -g -a "$SKILLS_AGENT"
fi

echo
echo "Next: npm run configure"
