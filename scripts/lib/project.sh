# shellcheck shell=bash
# Load product name + image from .env (IMAGE_REPO auto from GitHub origin).
# Exports: APP_NAME APP_TITLE IMAGE_REPO IMAGE_BASE_REPO IMAGE_BASE_TAG NPM_SCOPE CHART_DIR PROJECT_ROOT

_this="${BASH_SOURCE[0]-}"
if [[ -z "${_this}" && -n "${ZSH_VERSION-}" ]]; then
  # shellcheck disable=SC2296
  _this="${(%):-%x}"
fi
if [[ -z "${_this}" ]]; then
  echo "error: cannot resolve scripts/lib/project.sh path" >&2
  return 1 2>/dev/null || exit 1
fi

_project_sh_dir="$(cd "$(dirname "${_this}")" && pwd)"
PROJECT_ROOT="$(cd "${_project_sh_dir}/../.." && pwd)"
unset _this _project_sh_dir

eval "$(node "$PROJECT_ROOT/scripts/lib/runtime-config.mjs" exports)"
CHART_DIR="${CHART_DIR:-$PROJECT_ROOT/deploy/${APP_NAME}}"
