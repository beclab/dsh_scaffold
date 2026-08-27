#!/usr/bin/env bash
# Write the olares-* skill suite this CLI pin carries into packages/skills.
# Same command the app image runs. Those directories stay gitignored.
#
#   scripts/sync-olares-skills.sh
#   OLARES_CLI_VERSION=1.12.7-cli.4 scripts/sync-olares-skills.sh
#
# Pin comes from Dockerfile.base (@olares/cli@…) unless OLARES_CLI_VERSION is set.
# Do not hand-copy ~/.agents/skills/olares-* here — that snapshot can disagree
# with the binary the image actually ships.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$ROOT/packages/skills}"
BASE="$ROOT/Dockerfile.base"

if [[ ! -f "$BASE" ]]; then
  echo "error: $BASE not found" >&2
  exit 1
fi

if [[ -z "${OLARES_CLI_VERSION-}" ]]; then
  OLARES_CLI_VERSION="$(
    sed -n 's/.*@olares\/cli@\([^[:space:]\\]*\).*/\1/p' "$BASE" | head -n 1
  )"
fi

if [[ -z "$OLARES_CLI_VERSION" ]]; then
  echo "error: could not read @olares/cli pin from $BASE" >&2
  echo "set OLARES_CLI_VERSION and retry" >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "error: npx is required to run @olares/cli@${OLARES_CLI_VERSION}" >&2
  exit 1
fi

mkdir -p "$DEST"
echo "exporting @olares/cli@${OLARES_CLI_VERSION} skills → ${DEST}"
npx --yes "@olares/cli@${OLARES_CLI_VERSION}" skills export "$DEST"

if [[ -f "$DEST/.olares-cli-suite" ]]; then
  echo "suite marker: $(tr '\n' ' ' <"$DEST/.olares-cli-suite")"
fi
echo "skills:"
npx --yes "@olares/cli@${OLARES_CLI_VERSION}" skills list
