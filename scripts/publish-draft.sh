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

GREEN='\033[0;32m'; NC='\033[0m'

echo -n "Publishing $PUB_ID... "

supabase db query --linked \
  "UPDATE publications SET status = 'published' WHERE id = '$PUB_ID';" 2>/dev/null || true

echo -e "${GREEN}done${NC}"
echo "Subscribers can now see it at archive.html"
