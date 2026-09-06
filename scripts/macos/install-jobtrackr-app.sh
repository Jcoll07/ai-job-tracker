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

# Finder does not load the user's interactive shell, so command -v node can
# resolve to a different installation than Terminal. Prefer the project's
# supported Node 22 installation through nvm and reject incompatible Node
# versions instead of compiling native modules with the wrong ABI.
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm use 22.23.2 >/dev/null 2>&1 || true
fi

command -v node >/dev/null 2>&1 || { echo "Error: Node.js no está disponible."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm no está disponible."; exit 1; }

NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"
NODE_MAJOR="$($NODE_BIN -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" != "22" ]; then
  echo "Error: JobTrackr requiere Node.js 22.x para su módulo nativo better-sqlite3; se encontró $($NODE_BIN -p 'process.version')."
  echo "Instala/activa Node 22.23.2 con nvm y vuelve a ejecutar este instalador."
  exit 1
fi

# npm and node must always be the exact same installation so native modules
# and Next use the same Node ABI.
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
