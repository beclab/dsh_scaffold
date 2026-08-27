#!/usr/bin/env bash
# Repo wrapper: local-test at max(git+1, upload+1), never docker push.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ $# -lt 1 ]]; then
  echo "usage: scripts/local-test.sh <machine-id> [--no-build] [--no-upload]" >&2
  exit 2
fi

eval "$(node "$ROOT/scripts/lib/next-local-version.mjs" --exports)"
export OLARES_LOCAL_VERSION

GLOBAL="$(node "$ROOT/__agent__/install.mjs" --print-global)"
SCRIPT="${GLOBAL}/olares-image/scripts/local-test.sh"
if [[ ! -x "$SCRIPT" && ! -f "$SCRIPT" ]]; then
  echo "error: missing $SCRIPT" >&2
  echo "error: run __agent__/skills/olares-cli-setup/scripts/ensure-olares-cli.sh --with-skills" >&2
  exit 1
fi

echo "OLARES_LOCAL_VERSION=${OLARES_LOCAL_VERSION}"
exec bash "$SCRIPT" "$@"
