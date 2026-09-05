#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"
PORT=${JOBTRACKR_PORT:-3001}
BASE_URL=${JOBTRACKR_URL:-http://127.0.0.1:$PORT}
LOG_FILE="${TMPDIR:-/tmp}/jobtrackr-server.log"
SERVER_PID=""
STARTED_BY_SCRIPT=0

say() { printf '\n==> %s\n' "$1"; }
fail() { printf '\nERROR: %s\n' "$1" >&2; exit 1; }

cleanup() {
  if [ "$STARTED_BY_SCRIPT" = "1" ] && [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

say "Checking prerequisites"
command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install Node.js 22 LTS and run this script again."
command -v npm >/dev/null 2>&1 || fail "npm is not available."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
NODE_VERSION=$(node -p 'process.versions.node')
[ "$NODE_MAJOR" -ge 22 ] || fail "Node.js $NODE_VERSION detected; JobTrackr requires Node.js 22+."
printf 'Node.js %s\nnpm %s\n' "$NODE_VERSION" "$(npm --version)"

say "Preparing environment"
if [ ! -f apps/web/.env.local ]; then
  cp apps/web/.env.example apps/web/.env.local
  printf '%s\n' "Created apps/web/.env.local from .env.example (existing files are never overwritten)."
else
  printf '%s\n' "apps/web/.env.local already exists; leaving it untouched."
fi

say "Installing dependencies"
npm install

say "Typechecking and building"
npm run typecheck
npm run build
npm run build:extension
npm run build:safari --workspace=apps/extension

say "Checking for an existing local server"
if curl -fsS "$BASE_URL/api/settings" >/dev/null 2>&1; then
  printf '%s\n' "A JobTrackr server is already responding at $BASE_URL; reusing it."
else
  say "Starting JobTrackr production server"
  : > "$LOG_FILE"
  (npm run start --workspace=apps/web >"$LOG_FILE" 2>&1) &
  SERVER_PID=$!
  STARTED_BY_SCRIPT=1
  READY=0
  i=0
  while [ "$i" -lt 60 ]; do
    if curl -fsS "$BASE_URL/api/settings" >/dev/null 2>&1; then READY=1; break; fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
    sleep 1
    i=$((i+1))
  done
  [ "$READY" = "1" ] || { cat "$LOG_FILE" >&2; fail "JobTrackr did not start at $BASE_URL."; }
fi

say "Running full local E2E smoke test"
JOBTRACKR_URL="$BASE_URL" npm run test:e2e

say "Checking local AI provider"
AI_BASE_URL_VALUE=$(grep '^AI_BASE_URL=' apps/web/.env.local 2>/dev/null | tail -n1 | cut -d= -f2- || true)
AI_API_KEY_VALUE=$(grep '^AI_API_KEY=' apps/web/.env.local 2>/dev/null | tail -n1 | cut -d= -f2- || true)
OMLX_API_KEY_VALUE=$(grep '^OMLX_API_KEY=' apps/web/.env.local 2>/dev/null | tail -n1 | cut -d= -f2- || true)
AI_BASE_URL_VALUE=${AI_BASE_URL_VALUE:-http://127.0.0.1:8000/v1}
AI_API_KEY_VALUE=${AI_API_KEY_VALUE:-$OMLX_API_KEY_VALUE}
AI_BASE_URL_VALUE=$(printf '%s' "$AI_BASE_URL_VALUE" | sed 's:/$::')
if [ -n "$AI_API_KEY_VALUE" ]; then
  if curl -fsS --max-time 10 -H "Authorization: Bearer $AI_API_KEY_VALUE" "$AI_BASE_URL_VALUE/models" >/dev/null 2>&1; then
    printf '%s\n' "Local AI endpoint is reachable and authenticated."
  else
    printf '%s\n' "WARNING: AI key is configured, but $AI_BASE_URL_VALUE/models did not respond successfully." >&2
  fi
else
  printf '%s\n' "Local AI key is not configured; manual tracking still works, but AI analysis/drafting is disabled."
fi

say "Verification complete"
printf '%s\n' "JobTrackr is built, the server starts, and the automated API smoke test passed."
printf '%s\n' "Open: $BASE_URL"
printf '%s\n' "Log (only if needed): $LOG_FILE"
