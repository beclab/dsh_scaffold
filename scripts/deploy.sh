#!/usr/bin/env bash
# Wait for Actions, package the chart with the fork GHCR name, upload.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

INSTALL=0
NO_TRIGGER=0
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=1 ;;
    --no-trigger) NO_TRIGGER=1 ;;
    -h|--help)
      echo "usage: scripts/deploy.sh [--install] [--no-trigger]" >&2
      exit 0
      ;;
    *)
      echo "unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

node "$ROOT/scripts/lib/preflight.mjs"

echo "$(node "$ROOT/scripts/lib/runtime-config.mjs")"

WAIT_ARGS=()
if [[ "$NO_TRIGGER" -eq 1 ]]; then
  WAIT_ARGS+=(--no-trigger)
fi
node "$ROOT/scripts/lib/wait-ghcr.mjs" "${WAIT_ARGS[@]+"${WAIT_ARGS[@]}"}"

# shellcheck source=scripts/lib/project.sh
source "$ROOT/scripts/lib/project.sh"
VERSION="$(awk '/^version:/{print $2; exit}' "$CHART_DIR/Chart.yaml")"
"$ROOT/scripts/package-chart.sh"
PACKAGE="$ROOT/artifacts/${APP_NAME}-${VERSION}.tgz"

olares-cli market upload "$PACKAGE"
echo "Uploaded ${APP_NAME} ${VERSION} (image ${IMAGE_REPO}:${VERSION})"

if [[ "$INSTALL" -eq 1 ]]; then
  STATE="$(
    olares-cli market status "$APP_NAME" -o json 2>/dev/null |
      node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(JSON.parse(s).state||'')}catch{}})" ||
      true
  )"
  if [[ -n "$STATE" && "$STATE" != "installFailed" ]]; then
    olares-cli market upgrade "$APP_NAME" -s upload --version "$VERSION" --watch --watch-timeout 1m
  else
    olares-cli market install "$APP_NAME" -s upload --version "$VERSION" --watch --watch-timeout 1m
  fi
else
  echo "Install: olares-cli market install ${APP_NAME} -s upload --version ${VERSION} --watch --watch-timeout 1m"
fi
