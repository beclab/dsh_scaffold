#!/usr/bin/env bash
# First laptop check: Node.js 22+, olares-cli, Docker engine, olares-image (via preflight.mjs).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "error: Node.js 22+ is required (node is not on PATH)" >&2
  echo "error: 需要 Node.js 22+，当前 PATH 里没有 node" >&2
  exit 1
fi

exec node "$ROOT/scripts/lib/preflight.mjs" "$@"
