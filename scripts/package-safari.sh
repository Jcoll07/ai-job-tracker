#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
EXT_DIR="$ROOT_DIR/apps/extension"
OUTPUT_DIR="$EXT_DIR/.output/safari-mv2"
PROJECT_DIR="$EXT_DIR/safari"

if [ "$(uname -s)" != "Darwin" ]; then
  printf '%s\n' "Safari packaging is only available on macOS." >&2
  exit 1
fi

command -v xcrun >/dev/null 2>&1 || {
  printf '%s\n' "Xcode command-line tools are required (xcrun not found)." >&2
  exit 1
}

cd "$ROOT_DIR"
npm run build:safari --workspace=apps/extension

if [ ! -d "$OUTPUT_DIR" ]; then
  printf '%s\n' "Safari build output not found: $OUTPUT_DIR" >&2
  exit 1
fi

mkdir -p "$PROJECT_DIR"
xcrun safari-web-extension-packager "$OUTPUT_DIR" \
  --project-location "$PROJECT_DIR" \
  --macos-only \
  --copy-resources \
  --no-open \
  --force

printf '\nSafari Xcode project generated at:\n%s\n' "$PROJECT_DIR"
printf '%s\n' "Open the generated .xcodeproj, build/run the macOS target, then enable JobTrackr in Safari → Settings → Extensions."
