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
command -v xcrun >/dev/null 2>&1 || { printf '%s\n' "Xcode command-line tools are required (xcrun not found)." >&2; exit 1; }
[ -x "$(command -v xcodebuild 2>/dev/null || true)" ] || { printf '%s\n' "Xcode is required (xcodebuild not found). Install/open Xcode once and accept its license." >&2; exit 1; }
cd "$ROOT_DIR"
npm run build:safari --workspace=apps/extension
[ -d "$OUTPUT_DIR" ] || { printf '%s\n' "Safari build output not found: $OUTPUT_DIR" >&2; exit 1; }
rm -rf "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR"
xcrun safari-web-extension-packager "$OUTPUT_DIR" --project-location "$PROJECT_DIR" --macos-only --copy-resources --no-open --force
PROJECT=$(find "$PROJECT_DIR" -maxdepth 1 -name '*.xcodeproj' -print -quit)
[ -n "$PROJECT" ] || { printf '%s\n' "Safari Xcode project was not generated." >&2; exit 1; }
xcodebuild -list -project "$PROJECT" >/dev/null
printf '\nSafari Xcode project generated and validated:\n%s\n' "$PROJECT"
printf '%s\n' "Build/run the macOS target from Xcode, then enable JobTrackr in Safari → Settings → Extensions."
