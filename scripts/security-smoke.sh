#!/bin/sh
set -eu

BASE_URL="${JOBTRACKR_URL:-http://127.0.0.1:3001}"
PASS=0
FAIL=0

pass(){ PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; }
fail(){ FAIL=$((FAIL+1)); printf '  FAIL  %s\n' "$1"; }

request(){ curl -sS -D - -o /tmp/jobtrackr-security-body.$$ -w '\n%{http_code}' "$@"; }
cleanup(){ rm -f "/tmp/jobtrackr-security-body.$$"; }
trap cleanup EXIT INT TERM

printf '\nJobTrackr security smoke — %s\n\n' "$BASE_URL"

headers=$(request "$BASE_URL/api/settings") || { fail "settings request"; headers=""; }
code=$(printf '%s\n' "$headers" | tail -n1)
case "$code" in 200) pass "settings -> 200";; *) fail "settings -> $code";; esac
printf '%s\n' "$headers" | grep -qi '^cache-control: no-store' && pass "API responses are not cacheable" || fail "API cache-control missing"
printf '%s\n' "$headers" | grep -qi '^x-content-type-options: nosniff' && pass "nosniff header present" || fail "nosniff header missing"
printf '%s\n' "$headers" | grep -qi '^x-frame-options: sameorigin' && pass "frame protection header present" || fail "frame protection header missing"

body=$(cat "/tmp/jobtrackr-security-body.$$")
if printf '%s' "$body" | grep -q 'extensionToken'; then
  pass "local settings exposes extension token only on local Host"
else
  fail "local settings did not expose extension token"
fi

remote=$(curl -sS -H 'Host: attacker.example' "$BASE_URL/api/settings")
if printf '%s' "$remote" | grep -q 'extensionToken'; then
  fail "non-local Host received extension token"
else
  pass "non-local Host does not receive extension token"
fi

code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/api/extension/ping")
[ "$code" = "401" ] && pass "extension endpoint rejects missing token" || fail "extension endpoint missing-token response -> $code"

code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/api/gmail/sync")
[ "$code" = "401" ] && pass "scheduled Gmail sync rejects missing cron secret" || fail "Gmail sync missing-secret response -> $code"

code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/api/gmail/callback")
[ "$code" = "302" ] && pass "Gmail OAuth callback rejects missing code/state via denial redirect" || fail "Gmail callback missing params -> $code"

code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/import" -H 'Content-Type: application/json' --data '{}')
[ "$code" = "400" ] && pass "import rejects malformed backup" || fail "malformed import -> $code"

printf '\nRESULT: PASS=%s FAIL=%s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
