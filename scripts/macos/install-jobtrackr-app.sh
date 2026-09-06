#!/bin/bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
APP_NAME="JobTrackr.app"
INSTALL_DIR="${HOME}/Applications"
APP_DIR="${INSTALL_DIR}/${APP_NAME}"
TMP_SCRIPT="${TMPDIR:-/tmp}/jobtrackr-launcher-$$.applescript"
APP_PORT="3001"

if ! command -v osacompile >/dev/null 2>&1; then echo "Error: osacompile no está disponible. Ejecuta este instalador en macOS."; exit 1; fi
cd "$ROOT_DIR"

echo "Actualizando JobTrackr desde Git..."
git pull --ff-only
CURRENT_COMMIT="$(git rev-parse HEAD)"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh"; nvm use 22.23.2 >/dev/null 2>&1 || true; fi
command -v node >/dev/null 2>&1 || { echo "Error: Node.js no está disponible."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm no está disponible."; exit 1; }
NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"
NODE_MAJOR="$($NODE_BIN -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" != "22" ]; then echo "Error: JobTrackr requiere Node.js 22.x; se encontró $($NODE_BIN -p 'process.version')."; exit 1; fi
run_npm(){ "$NODE_BIN" "$NPM_BIN" "$@"; }
NODE_ABI="$($NODE_BIN -p 'process.versions.modules')"
NODE_VERSION="$($NODE_BIN -p 'process.version')"
echo "Using Node $NODE_VERSION (ABI $NODE_ABI)"

# Keep dependencies in sync with the commit pulled above. npm install is used
# instead of assuming node_modules matches package-lock.json.
run_npm install
if ! "$NODE_BIN" -e "require('better-sqlite3');" >/dev/null 2>&1; then run_npm rebuild better-sqlite3 --build-from-source; fi
"$NODE_BIN" -e "require('better-sqlite3');"

# Never leave an older Next.js process serving an older build on port 3001.
# This is deliberately port-based as well as PID-file-based: an old launcher,
# manual `next start`, or a crashed/stale PID file must not mask a new build.
if command -v lsof >/dev/null 2>&1; then
  OLD_PIDS="$(lsof -tiTCP:${APP_PORT} -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$OLD_PIDS" ]; then
    echo "Stopping existing JobTrackr server(s) on port ${APP_PORT}..."
    kill $OLD_PIDS 2>/dev/null || true
    for _ in $(seq 1 20); do
      sleep 0.25
      REMAINING="$(lsof -tiTCP:${APP_PORT} -sTCP:LISTEN 2>/dev/null || true)"
      [ -z "$REMAINING" ] && break
      kill $REMAINING 2>/dev/null || true
    done
    REMAINING="$(lsof -tiTCP:${APP_PORT} -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "$REMAINING" ]; then
      echo "Error: no se pudo liberar el puerto ${APP_PORT}."; exit 1
    fi
  fi
fi
rm -f "${ROOT_DIR}/.jobtrackr-server.pid"

BUILT_COMMIT="$(cat "${ROOT_DIR}/.jobtrackr-build-commit" 2>/dev/null || true)"
if [ ! -f "${ROOT_DIR}/apps/web/.next/BUILD_ID" ] || [ "$CURRENT_COMMIT" != "$BUILT_COMMIT" ]; then
  echo "Building JobTrackr for commit $CURRENT_COMMIT..."
  run_npm run build
fi

# Always regenerate and build the Safari containing app from the current
# extension sources. The resulting app is installed and launched by the
# packaging script, so no Xcode interaction is required after an update.
if [ "$(uname -s)" = "Darwin" ] && command -v xcrun >/dev/null 2>&1; then
  run_npm run package:safari
fi

mkdir -p "$INSTALL_DIR"
rm -rf "$APP_DIR"
sed "s|__PROJECT_DIR__|${ROOT_DIR//|/\\|}|g" "${ROOT_DIR}/scripts/macos/JobTrackr.applescript.template" > "$TMP_SCRIPT"
osacompile -o "$APP_DIR" "$TMP_SCRIPT" >/dev/null
rm -f "$TMP_SCRIPT"
/usr/bin/touch "$APP_DIR/Contents/Resources/.jobtrackr-local"
printf '%s' "$CURRENT_COMMIT" > "${ROOT_DIR}/.jobtrackr-build-commit"
open "$APP_DIR"
# The containing app's launcher starts the freshly built server and opens Safari.
echo "JobTrackr actualizado e instalado en: $APP_DIR"
echo "Build activo: $CURRENT_COMMIT"
echo "La extensión Safari se ha regenerado, instalado y lanzado automáticamente."
