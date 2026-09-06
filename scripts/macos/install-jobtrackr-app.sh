#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
APP_NAME="JobTrackr.app"
INSTALL_DIR="${HOME}/Applications"
APP_DIR="${INSTALL_DIR}/${APP_NAME}"
TMP_SCRIPT="${TMPDIR:-/tmp}/jobtrackr-launcher-$$.applescript"

if ! command -v osacompile >/dev/null 2>&1; then
  echo "Error: osacompile no está disponible. Ejecuta este instalador en macOS."
  exit 1
fi

mkdir -p "$INSTALL_DIR"
rm -rf "$APP_DIR"
sed "s|__PROJECT_DIR__|${ROOT_DIR//|/\\|}|g" "${ROOT_DIR}/scripts/macos/JobTrackr.applescript.template" > "$TMP_SCRIPT"
osacompile -o "$APP_DIR" "$TMP_SCRIPT" >/dev/null
rm -f "$TMP_SCRIPT"

/usr/bin/touch "$APP_DIR/Contents/Resources/.jobtrackr-local"

cd "$ROOT_DIR"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

command -v node >/dev/null 2>&1 || { echo "Error: Node.js no está disponible."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm no está disponible."; exit 1; }

# npm and node can point to different installations under Finder. Always run
# npm through the exact node selected above so native modules and Next use the
# same Node ABI.
NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"
run_npm() { "$NODE_BIN" "$NPM_BIN" "$@"; }

NODE_ABI="$($NODE_BIN -p 'process.versions.modules')"
NODE_VERSION="$($NODE_BIN -p 'process.version')"
echo "Using Node $NODE_VERSION (ABI $NODE_ABI)"

if [ ! -d node_modules ] || [ ! -x node_modules/.bin/next ]; then
  echo "Instalando dependencias..."
  run_npm ci
fi
if ! "$NODE_BIN" -e "require('better-sqlite3');" >/dev/null 2>&1; then
  echo "Recompilando better-sqlite3 para Node $NODE_VERSION (ABI $NODE_ABI)..."
  run_npm rebuild better-sqlite3 --build-from-source
fi
"$NODE_BIN" -e "require('better-sqlite3');"

if [ ! -f "${ROOT_DIR}/apps/web/.next/BUILD_ID" ]; then
  echo "Preparando la aplicación (build de producción)..."
  run_npm run build
fi

CURRENT_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
printf '%s' "$CURRENT_COMMIT" > "${ROOT_DIR}/.jobtrackr-build-commit"

open -R "$APP_DIR"
echo "JobTrackr instalado en: $APP_DIR"
echo "Puedes arrastrarlo al Dock y abrirlo con doble clic."
