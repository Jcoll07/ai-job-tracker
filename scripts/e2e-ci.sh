#!/bin/sh
set -eu

BASE_URL="${JOBTRACKR_URL:-http://127.0.0.1:3001}"
LOG_FILE="${TMPDIR:-/tmp}/jobtrackr-ci-server.log"

: > "$LOG_FILE"
npm run start --workspace=apps/web >"$LOG_FILE" 2>&1 &
PID=$!
cleanup() { kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

ready=0
i=0
while [ "$i" -lt 60 ]; do
  if curl -fsS "$BASE_URL/api/settings" >/dev/null 2>&1; then ready=1; break; fi
  if ! kill -0 "$PID" 2>/dev/null; then break; fi
  sleep 1
  i=$((i+1))
done

if [ "$ready" != "1" ]; then
  cat "$LOG_FILE" >&2
  exit 1
fi

JOBTRACKR_URL="$BASE_URL" npm run test:e2e
