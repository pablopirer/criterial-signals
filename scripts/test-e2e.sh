#!/usr/bin/env bash
# End-to-end test for the sample request funnel.
# Usage: bash scripts/test-e2e.sh
#
# Requires: curl, supabase CLI (authenticated and linked to the project).

set -uo pipefail

FUNCTION_URL="https://epmltqhtxkmfboaxdois.supabase.co/functions/v1/sample-request"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwbWx0cWh0eGttZmJvYXhkb2lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTM2NTksImV4cCI6MjA5MjUyOTY1OX0.uBaMbfr_efiatUSuQnRKH_q85Wm_8fih_fGmb674nBI"
SHARED_SECRET="596394206a475b401e93639148407dd7b4c8ce7fffd36ccaa204aca73b527dcb"
TEST_EMAIL="test-e2e-$(date +%s)@criterial.test"

GREEN='\033[0;32m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'

pass() { echo -e "  ${GREEN}PASS${NC}  $1"; }
fail() { echo -e "  ${RED}FAIL${NC}  $1"; exit 1; }

echo ""
echo -e "${BOLD}=== Criterial Signals — E2E Test ===${NC}"
echo "  Email:  $TEST_EMAIL"
echo "  Time:   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

# ── Step 1: Call the Edge Function ────────────────────────────────────────────
echo "1. Edge Function (POST /sample-request)"
RESPONSE=$(curl -s -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "x-criterial-signal: $SHARED_SECRET" \
  -d "{
    \"full_name\": \"E2E Test\",
    \"email\": \"$TEST_EMAIL\",
    \"company_name\": \"Test Corp\",
    \"website\": \"https://test.example.com\",
    \"interest_type\": \"m_and_a\",
    \"notes\": \"Automated E2E test — $(date -u)\"
  }")

if echo "$RESPONSE" | grep -q '"ok":true'; then
  REQUEST_ID=$(echo "$RESPONSE" | grep -o '"request_id":"[^"]*"' | cut -d'"' -f4)
  pass "ok:true  |  request_id: $REQUEST_ID"
else
  fail "Unexpected response: $RESPONSE"
fi

# Brief pause so async DB writes complete before we query
sleep 4

# ── Step 2: Lead row ──────────────────────────────────────────────────────────
echo "2. Lead row in 'leads'"
LEAD=$(supabase db query --linked \
  "SELECT id, status FROM leads WHERE lower(email) = lower('$TEST_EMAIL');" 2>/dev/null) || true
if echo "$LEAD" | grep -q '"id"'; then
  LEAD_ID=$(echo "$LEAD" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  pass "Found  |  id: $LEAD_ID"
else
  fail "Lead row not found"
fi

# ── Step 3: sample_request row ────────────────────────────────────────────────
echo "3. sample_request row with status=generated"
SR=$(supabase db query --linked \
  "SELECT status FROM sample_requests WHERE id = '$REQUEST_ID';" 2>/dev/null) || true
if echo "$SR" | grep -q '"generated"'; then
  pass "status = generated"
elif echo "$SR" | grep -q '"status"'; then
  STATUS=$(echo "$SR" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  fail "status = $STATUS (expected generated)"
else
  fail "sample_request row not found for id: $REQUEST_ID"
fi

# ── Step 4: publication row ───────────────────────────────────────────────────
echo "4. Publication row in 'publications'"
PUB=$(supabase db query --linked \
  "SELECT id, status FROM publications
   WHERE title LIKE '%m_and_a%'
   ORDER BY created_at DESC LIMIT 1;" 2>/dev/null) || true
if echo "$PUB" | grep -q '"id"'; then
  PUB_ID=$(echo "$PUB" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  pass "Found  |  id: $PUB_ID"
else
  fail "Publication row not found"
fi

echo ""
echo -e "${BOLD}=== All checks passed ===${NC}"
echo ""
