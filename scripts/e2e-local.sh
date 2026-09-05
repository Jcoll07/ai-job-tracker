#!/bin/sh
set -eu

BASE_URL="${JOBTRACKR_URL:-http://localhost:3001}"
PASS=0
FAIL=0
SKIP=0
JOB_ID=""

pass(){ PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; }
fail(){ FAIL=$((FAIL+1)); printf '  FAIL  %s\n' "$1"; }
skip(){ SKIP=$((SKIP+1)); printf '  SKIP  %s\n' "$1"; }

cleanup(){
  if [ -n "$JOB_ID" ]; then
    curl -sS -o /dev/null -X DELETE "$BASE_URL/api/jobs/$JOB_ID" || true
  fi
}
trap cleanup EXIT INT TERM

json_field(){
  python3 -c 'import json,sys; d=json.load(sys.stdin); v=d
for k in sys.argv[1].split("."):
 v=v.get(k) if isinstance(v,dict) else None
print("" if v is None else v)' "$1"
}

request(){
  # Usage: request METHOD PATH [BODY] [AUTH]
  method="$1"; path="$2"; body="${3:-}"; auth="${4:-0}"
  if [ "$auth" = "1" ]; then
    curl -sS -w '\n%{http_code}' -X "$method" "$BASE_URL$path" \
      -H "Authorization: Bearer $TOKEN" \
      ${body:+-H 'Content-Type: application/json' --data "$body"}
  else
    curl -sS -w '\n%{http_code}' -X "$method" "$BASE_URL$path" \
      ${body:+-H 'Content-Type: application/json' --data "$body"}
  fi
}

printf '\nJobTrackr local E2E — %s\n\n' "$BASE_URL"

# Basic server/PWA checks
for path in / /api/jobs /api/emails /api/cv /api/profile /api/profile/resume /api/settings /manifest.webmanifest; do
  out=$(request GET "$path") || { fail "GET $path"; continue; }
  code=$(printf '%s\n' "$out" | tail -n1)
  if [ "$code" = "200" ]; then pass "GET $path -> 200"; else fail "GET $path -> $code"; fi
done

settings=$(request GET /api/settings) || { fail "GET /api/settings for extension token"; settings='{}\n500'; }
settings_body=$(printf '%s\n' "$settings" | sed '$d')
TOKEN=$(printf '%s' "$settings_body" | json_field extensionToken)
if [ -n "$TOKEN" ]; then pass "extension token available (not printed)"; else fail "extension token available"; TOKEN="invalid"; fi

# Extension security and CORS
out=$(request GET /api/extension/ping); code=$(printf '%s\n' "$out" | tail -n1)
[ "$code" = "401" ] && pass "extension ping rejects missing auth (401)" || fail "extension ping missing auth -> $code"

cors=$(curl -sS -o /dev/null -w '%{http_code}' -X OPTIONS "$BASE_URL/api/extension/ping" \
  -H 'Origin: https://example.com' -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization')
[ "$cors" = "204" ] && pass "extension CORS preflight -> 204" || fail "extension CORS preflight -> $cors"

out=$(request GET /api/extension/ping '' 1); code=$(printf '%s\n' "$out" | tail -n1)
[ "$code" = "200" ] && pass "extension ping authenticated -> 200" || fail "extension ping authenticated -> $code"

out=$(request GET /api/extension/profile '' 1); code=$(printf '%s\n' "$out" | tail -n1)
[ "$code" = "200" ] && pass "extension profile authenticated -> 200" || fail "extension profile authenticated -> $code"

resume=$(request GET /api/extension/resume '' 1); code=$(printf '%s\n' "$resume" | tail -n1)
case "$code" in
  200|404) pass "extension resume authenticated -> $code (both valid: file/no file)" ;;
  *) fail "extension resume authenticated -> $code" ;;
esac

# Create a deterministic structured-data job; avoids depending on AI for capture.
capture_body='{"url":"https://example.com/jobs/jobtrackr-e2e","title":"E2E Product Engineer","jsonLd":{"@type":"JobPosting","title":"E2E Product Engineer","hiringOrganization":{"name":"JobTrackr E2E"},"jobLocation":{"address":{"addressLocality":"Sandefjord","addressRegion":"Vestfold"}},"employmentType":"FULL_TIME"},"pageText":"","allowDuplicate":false}'
out=$(request POST /api/extension/capture "$capture_body" 1); code=$(printf '%s\n' "$out" | tail -n1); body=$(printf '%s\n' "$out" | sed '$d')
if [ "$code" = "201" ]; then
  JOB_ID=$(printf '%s' "$body" | json_field 'job.id')
  pass "extension capture -> 201 (job $JOB_ID)"
else
  fail "extension capture -> $code"
fi

# Duplicate protection should fire on the second capture.
out=$(request POST /api/extension/capture "$capture_body" 1); code=$(printf '%s\n' "$out" | tail -n1)
[ "$code" = "409" ] && pass "extension capture duplicate protection -> 409" || fail "extension duplicate protection -> $code"

# Core CRUD
core_body='{"company":"JobTrackr E2E Core","jobTitle":"Product Engineer","location":"Norway","sourceUrl":"https://example.com/e2e-core","status":"Saved"}'
out=$(request POST /api/jobs "$core_body"); code=$(printf '%s\n' "$out" | tail -n1); body=$(printf '%s\n' "$out" | sed '$d')
if [ "$code" = "201" ]; then
  CORE_ID=$(printf '%s' "$body" | json_field 'job.id')
  pass "core job create -> 201"
  out=$(request GET "/api/jobs/$CORE_ID"); code=$(printf '%s\n' "$out" | tail -n1)
  [ "$code" = "200" ] && pass "core job detail -> 200" || fail "core job detail -> $code"
  out=$(request GET "/api/jobs/$CORE_ID/fit"); code=$(printf '%s\n' "$out" | tail -n1)
  [ "$code" = "200" ] && pass "fit calculation -> 200" || fail "fit calculation -> $code"
  out=$(request PATCH "/api/jobs/$CORE_ID" '{"notes":"E2E updated"}'); code=$(printf '%s\n' "$out" | tail -n1)
  [ "$code" = "200" ] && pass "job patch -> 200" || fail "job patch -> $code"
  out=$(request DELETE "/api/jobs/$CORE_ID"); code=$(printf '%s\n' "$out" | tail -n1)
  [ "$code" = "200" ] && pass "job delete -> 200" || fail "job delete -> $code"
else
  fail "core job create -> $code"
fi

# AI pipeline. This requires the configured local oMLX provider.
analyze_body='{"text":"Product Engineer at Acme. Build industrial products, coordinate engineering teams, and improve manufacturing processes. 3+ years experience."}'
out=$(request POST /api/analyze "$analyze_body"); code=$(printf '%s\n' "$out" | tail -n1)
case "$code" in
  200) pass "AI analyze -> 200" ;;
  503) skip "AI analyze unavailable (local provider not configured)" ;;
  *) fail "AI analyze -> $code" ;;
esac

draft_body='{"question":"Why are you interested in this role?"}'
out=$(request POST /api/draft "$draft_body"); code=$(printf '%s\n' "$out" | tail -n1)
case "$code" in
  200) pass "AI draft -> 200" ;;
  503) skip "AI draft unavailable (local provider not configured)" ;;
  *) fail "AI draft -> $code" ;;
esac

# Export endpoint
out=$(request GET /api/export); code=$(printf '%s\n' "$out" | tail -n1)
[ "$code" = "200" ] && pass "export -> 200" || fail "export -> $code"

printf '\nRESULT: PASS=%s FAIL=%s SKIP=%s\n' "$PASS" "$FAIL" "$SKIP"
[ "$FAIL" -eq 0 ]
