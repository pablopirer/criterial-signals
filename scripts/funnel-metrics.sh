#!/usr/bin/env bash
# Funnel metrics report for Criterial Signals.
# Usage: bash scripts/funnel-metrics.sh
#
# Requires: supabase CLI (authenticated and linked to the project).

set -euo pipefail

BOLD='\033[1m'; CYAN='\033[0;36m'; NC='\033[0m'

header() { echo ""; echo -e "${BOLD}${CYAN}── $1 ──${NC}"; }

q() { supabase db query --linked "$1" 2>/dev/null; }

echo ""
echo -e "${BOLD}=== Criterial Signals — Funnel Metrics ===${NC}"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# ── Leads ─────────────────────────────────────────────────────────────────────
header "Leads"
q "SELECT
     count(*)                                        AS total,
     count(*) FILTER (WHERE status = 'new')          AS new,
     count(*) FILTER (WHERE status = 'contacted')    AS contacted,
     count(*) FILTER (WHERE status = 'converted')    AS converted
   FROM leads
   WHERE email NOT LIKE '%@criterial.test';"

header "Leads por interest_type"
q "SELECT
     coalesce(interest_type, '(sin especificar)') AS interest_type,
     count(*) AS total
   FROM leads
   WHERE email NOT LIKE '%@criterial.test'
   GROUP BY interest_type
   ORDER BY total DESC;"

# ── Sample Requests ───────────────────────────────────────────────────────────
header "Sample Requests"
q "SELECT
     count(*)                                                  AS total,
     count(*) FILTER (WHERE status = 'queued')                AS queued,
     count(*) FILTER (WHERE status = 'generated')             AS generated,
     count(*) FILTER (WHERE status = 'generation_failed')     AS generation_failed
   FROM sample_requests
   WHERE lead_id IN (
     SELECT id FROM leads WHERE email NOT LIKE '%@criterial.test'
   );"

# ── Publications ──────────────────────────────────────────────────────────────
header "Publications"
q "SELECT
     type,
     status,
     count(*) AS total
   FROM publications
   GROUP BY type, status
   ORDER BY type, status;"

# ── Subscribers ───────────────────────────────────────────────────────────────
header "Subscribers"
q "SELECT
     count(*)                                          AS total,
     count(*) FILTER (WHERE status = 'active')        AS active,
     count(*) FILTER (WHERE status = 'cancelled')     AS cancelled,
     count(*) FILTER (WHERE plan = 'pro')             AS plan_pro
   FROM subscribers;"

echo ""
