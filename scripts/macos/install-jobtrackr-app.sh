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

# Keep the launcher local-only and make it easy to find from Finder/Dock.
/usr/bin/touch "$APP_DIR/Contents/Resources/.jobtrackr-local"

cd "$ROOT_DIR"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

command -v node >/dev/null 2>&1 || { echo "Error: Node.js no está disponible."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm no está disponible."; exit 1; }

# Native modules must match the Node.js ABI used to launch the local server.
if [ ! -d node_modules ] || [ ! -x node_modules/.bin/next ]; then
  echo "Instalando dependencias..."
  npm ci
fi
if ! node -e "require('better-sqlite3');" >/dev/null 2>&1; then
  echo "Recompilando better-sqlite3 desde código fuente para el Node.js activo..."
  npm rebuild better-sqlite3 --build-from-source
fi
node -e "require('better-sqlite3');"

# Ensure the production build exists before the first launch.
if [ ! -f "${ROOT_DIR}/apps/web/.next/BUILD_ID" ]; then
  echo "Preparando la aplicación (build de producción)..."
  npm run build
fi

# Record the exact source revision represented by this local build.
CURRENT_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
printf '%s' "$CURRENT_COMMIT" > "${ROOT_DIR}/.jobtrackr-build-commit"

open -R "$APP_DIR"
echo "JobTrackr instalado en: $APP_DIR"
echo "Puedes arrastrarlo al Dock y abrirlo con doble clic."
