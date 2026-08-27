#!/usr/bin/env bash
# Clone or update the official DeepSeek Harness into _reference/.
# Override with DSH_HARNESS_REPO / DSH_HARNESS_REF if you need a fork or pin.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/_reference/deepseek-harness"
REPO="${DSH_HARNESS_REPO:-https://github.com/deepseek-ai/deepseek-harness.git}"
REF="${DSH_HARNESS_REF:-}"

mkdir -p "$ROOT/_reference"

if [[ -d "$DEST/.git" ]]; then
  echo "updating $DEST"
  if [[ -n "$REF" ]]; then
    git -C "$DEST" fetch --depth 1 origin "$REF"
  else
    git -C "$DEST" fetch --depth 1 origin
  fi
  git -C "$DEST" checkout --force FETCH_HEAD
else
  rm -rf "$DEST"
  if [[ -n "$REF" ]]; then
    git clone --depth 1 --branch "$REF" "$REPO" "$DEST"
  else
    git clone --depth 1 "$REPO" "$DEST"
  fi
fi

git -C "$DEST" log -1 --format='pinned %h %ci %s'
