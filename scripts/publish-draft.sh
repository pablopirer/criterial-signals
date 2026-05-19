#!/usr/bin/env bash
# Publish a draft publication by ID.
#
# Usage:
#   bash scripts/publish-draft.sh <publication_id>

set -uo pipefail

PUB_ID="${1:-}"
if [[ -z "$PUB_ID" ]]; then
  echo "Usage: bash scripts/publish-draft.sh <publication_id>"
  exit 1
fi

GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -n "Publishing $PUB_ID... "

RESULT=$(supabase db query --linked \
  "UPDATE publications SET status = 'published' WHERE id = '$PUB_ID' RETURNING id, title, status;")
QUERY_EXIT=$?

if [[ $QUERY_EXIT -ne 0 ]]; then
  echo -e "${RED}FAILED${NC}"
  echo "Supabase query failed (exit $QUERY_EXIT). Check that the project is linked and credentials are valid."
  exit 1
fi

ROWS=$(echo "$RESULT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data.get('rows', [])))
" 2>/dev/null || echo "0")

if [[ "$ROWS" == "0" ]]; then
  echo -e "${RED}FAILED${NC}"
  echo "No publication updated. Verify the ID exists and its status is currently 'draft'."
  exit 1
fi

TITLE=$(echo "$RESULT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
rows = data.get('rows', [])
print(rows[0].get('title', '') if rows else '')
" 2>/dev/null)

STATUS=$(echo "$RESULT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
rows = data.get('rows', [])
print(rows[0].get('status', '') if rows else '')
" 2>/dev/null)

echo -e "${GREEN}done${NC}"
echo -e "  id:     ${CYAN}$PUB_ID${NC}"
echo -e "  title:  $TITLE"
echo -e "  status: ${GREEN}$STATUS${NC}"
echo "Subscribers can now see it at archive.html"
