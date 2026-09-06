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

# Node 26 uses ABI 147. better-sqlite3 11.x does not support Node 26;
# use the 12.x line which ships Node 26 prebuilds.
nodeMajor=$(node -p 'Number(process.versions.node.split(".")[0])')
if [ ! -d node_modules ] || [ ! -x node_modules/.bin/next ]; then
  echo "Instalando dependencias..."
  npm install --package-lock=false --save=false --ignore-scripts
fi

sqliteVersion=$(node -p 'try { require("better-sqlite3/package.json").version } catch { "missing" }')
if [ "$nodeMajor" -ge 24 ] && [[ "$sqliteVersion" != 12.* ]]; then
  echo "Node.js 24+ detectado: instalando better-sqlite3 12.11.1 compatible..."
  npm install --package-lock=false --save=false better-sqlite3@12.11.1
fi

if ! node -e 'require("better-sqlite3")' >/dev/null 2>&1; then
  echo "Reinstalando better-sqlite3 12.11.1 para corregir el binario nativo..."
  npm install --package-lock=false --save=false better-sqlite3@12.11.1
fi
node -e 'require("better-sqlite3")'

if [ ! -f "${ROOT_DIR}/apps/web/.next/BUILD_ID" ]; then
  echo "Preparando la aplicación (build de producción)..."
  npm run build
fi

open -R "$APP_DIR"
echo "JobTrackr instalado en: $APP_DIR"
echo "Puedes arrastrarlo al Dock y abrirlo con doble clic."
