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

# Ensure the production build exists before the first launch.
if [ ! -d "${ROOT_DIR}/apps/web/.next" ]; then
  echo "Preparando la aplicación (build de producción)..."
  cd "$ROOT_DIR"
  npm run build
fi

open -R "$APP_DIR"
echo "JobTrackr instalado en: $APP_DIR"
echo "Puedes arrastrarlo al Dock y abrirlo con doble clic."
