#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TEMPLATE="$ROOT_DIR/scripts/macos/JobTrackr.applescript.template"
TMP_SCRIPT="${TMPDIR:-/tmp}/jobtrackr-launcher-test-$$.applescript"
trap 'rm -f "$TMP_SCRIPT"' EXIT

# Validate the template directly. Do not rewrite it with sed: the template contains
# shell pipes and quoting that make delimiter-based substitutions unnecessarily fragile.
cp "$TEMPLATE" "$TMP_SCRIPT"

grep -Fq 'cd apps/web || exit 1' "$TMP_SCRIPT"
grep -Fq 'apps/web/.next/BUILD_ID' "$TMP_SCRIPT"
grep -Fq 'Using Node' "$TMP_SCRIPT"
grep -Fq 'Node.js 22.x' "$TMP_SCRIPT"
grep -Fq 'next/dist/bin/next start' "$TMP_SCRIPT"

grep -Fq 'if [ ! -f apps/web/.next/BUILD_ID ]' "$TMP_SCRIPT"

grep -Fq 'cd apps/web || exit 1; nohup' "$TMP_SCRIPT"

echo "macOS launcher template checks passed."
