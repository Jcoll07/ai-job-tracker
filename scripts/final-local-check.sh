#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
PORT=${JOBTRACKR_PORT:-3001}
BASE_URL=${JOBTRACKR_URL:-http://127.0.0.1:$PORT}
LOG_FILE="${TMPDIR:-/tmp}/jobtrackr-final.log"

printf '\n=== JobTrackr final local check ===\n'
printf 'Repository: %s\n' "$ROOT"

git pull --ff-only
npm install

# Ensure the production server is running the newly pulled code.
PIDS=$(lsof -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  printf '%s\n' "$PIDS" | xargs kill 2>/dev/null || true
  sleep 2
fi

npm run verify:local

# verify:local stops a server it started. Start one for the live Gmail checks.
: > "$LOG_FILE"
(npm run start --workspace=apps/web >"$LOG_FILE" 2>&1) &
SERVER_PID=$!
cleanup(){ kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

READY=0
i=0
while [ "$i" -lt 60 ]; do
  if curl -fsS "$BASE_URL/api/gmail/status" >/dev/null 2>&1; then READY=1; break; fi
  sleep 1; i=$((i+1))
done
[ "$READY" = "1" ] || { cat "$LOG_FILE"; exit 1; }

printf '\n=== Gmail status ===\n'
curl -sS "$BASE_URL/api/gmail/status"
printf '\n\n=== Gmail label sync ===\n'
curl -sS -X POST "$BASE_URL/api/gmail/sync"
printf '\n\n=== Jobs after sync ===\n'
curl -sS "$BASE_URL/api/jobs?sort=dateAdded&dir=desc"
printf '\n\n=== Final check complete ===\n'
printf 'Server log: %s\n' "$LOG_FILE"
