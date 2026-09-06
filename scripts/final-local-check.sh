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
STATUS_JSON=$(curl -fsS "$BASE_URL/api/gmail/status")
printf '%s\n' "$STATUS_JSON"
printf '\n=== Gmail label sync ===\n'
SYNC_JSON=$(curl -fsS -X POST "$BASE_URL/api/gmail/sync")
printf '%s\n' "$SYNC_JSON"

# Product-level gate: Gmail must be connected, the configured label must be
# readable, messages must be scanned, and no per-message errors may occur.
# The check is intentionally idempotent: after a successful first sync, a
# later run may scan the same labeled messages but classify/link zero because
# gmailLastSyncAt has advanced. In that case the previous successful sync is
# accepted as the functional proof.
node -e '
const status=JSON.parse(process.argv[1]);
const x=JSON.parse(process.argv[2]);
if(x.error) throw new Error(x.error);
const r=x.result;
if(!r || typeof r.scanned!=="number") throw new Error("Gmail sync returned no result");
if(r.scanned < 1) throw new Error(`Gmail sync scanned 0 messages (label/query did not find mail)`);
if(Array.isArray(r.errors) && r.errors.length) throw new Error(`Gmail sync returned ${r.errors.length} error(s): ${r.errors.join(" | ")}`);
const previous=status.lastSync;
const currentProcessed=typeof r.classified==="number" && r.classified > 0 && typeof r.linked==="number" && r.linked > 0;
const previousProcessed=previous && typeof previous.classified==="number" && previous.classified > 0 && typeof previous.linked==="number" && previous.linked > 0 && (!Array.isArray(previous.errors) || previous.errors.length===0);
if(!currentProcessed && !previousProcessed) throw new Error("Gmail sync has not yet classified and linked any message successfully");
console.log(`Gmail functional gate: PASS (${r.scanned} scanned, ${r.classified} classified, ${r.created} created, ${r.linked} linked, ${r.personalized??0} personalized, ${r.statusUpdates.length} status updates, mode=${r.queryMode||"unknown"}${currentProcessed?"":", previous successful sync reused"})`);
' "$STATUS_JSON" "$SYNC_JSON"

printf '\n=== Jobs after sync ===\n'
curl -sS "$BASE_URL/api/jobs?sort=dateAdded&dir=desc"
printf '\n\n=== Final check complete ===\n'
printf 'Server log: %s\n' "$LOG_FILE"
