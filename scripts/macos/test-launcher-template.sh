#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TEMPLATE="$ROOT_DIR/scripts/macos/JobTrackr.applescript.template"
TMP_SCRIPT="${TMPDIR:-/tmp}/jobtrackr-launcher-test-$$.applescript"
trap 'rm -f "$TMP_SCRIPT"' EXIT

sed "s|__PROJECT_DIR__|${ROOT_DIR//|/\\|}|g" "$TEMPLATE" > "$TMP_SCRIPT"

grep -q 'cd apps/web || exit 1' "$TMP_SCRIPT"
grep -q 'apps/web/.next/BUILD_ID' "$TMP_SCRIPT"
grep -q 'Using Node' "$TMP_SCRIPT"
grep -q 'Node.js 22.x' "$TMP_SCRIPT"

if command -v osacompile >/dev/null 2>&1; then
  osacompile -o "${TMPDIR:-/tmp}/jobtrackr-launcher-test-$$.app" "$TMP_SCRIPT" >/dev/null
  rm -rf "${TMPDIR:-/tmp}/jobtrackr-launcher-test-$$.app"
fi

echo "macOS launcher template checks passed."
