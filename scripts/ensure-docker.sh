#!/usr/bin/env bash
# Guide the user to a working local Docker. Needed for image build / save.
# Does not collect passwords. Does not `docker login`.
set -euo pipefail

DOCKER_DOCS="https://docs.docker.com/desktop/setup/install/mac-install/"
case "$(uname -s)" in
  Darwin) DOCKER_DOCS="https://docs.docker.com/desktop/setup/install/mac-install/" ;;
  Linux) DOCKER_DOCS="https://docs.docker.com/engine/install/" ;;
  MINGW* | MSYS* | CYGWIN*) DOCKER_DOCS="https://docs.docker.com/desktop/setup/install/windows-install/" ;;
esac

have_docker() {
  command -v docker >/dev/null 2>&1
}

docker_ready() {
  have_docker && docker info >/dev/null 2>&1
}

print_ready() {
  echo "docker: $(command -v docker)"
  docker version --format 'client {{.Client.Version}}' 2>/dev/null || docker version | head -2
  docker info --format 'engine {{.ServerVersion}}' 2>/dev/null || true
}

if docker_ready; then
  print_ready
  exit 0
fi

if [[ "$(uname -s)" == "Darwin" && -d /Applications/Docker.app ]]; then
  echo "Docker Desktop is installed but the engine is not running. Opening it…"
  open -a Docker
  for _ in $(seq 1 30); do
    if docker_ready; then
      print_ready
      exit 0
    fi
    sleep 2
  done
  echo "error: Docker Desktop is opening. Wait until the whale icon is idle, then rerun npm run preflight" >&2
  echo "error: Docker Desktop 已打开。等菜单栏图标就绪后再跑 npm run preflight" >&2
  exit 1
fi

echo "error: Docker is required to build and save the app image (docker build / docker save)" >&2
echo "error: 打包镜像需要 Docker，请先安装 Docker Desktop" >&2
echo "Install: ${DOCKER_DOCS}" >&2
if [[ "$(uname -s)" == "Darwin" ]]; then
  open "${DOCKER_DOCS}" >/dev/null 2>&1 || true
fi
exit 1
