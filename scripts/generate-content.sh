#!/usr/bin/env bash
# Interactive content generation for Criterial Signals.
#
# Usage:
#   source .env.local && bash scripts/generate-content.sh weekly
#   source .env.local && bash scripts/generate-content.sh monthly
#
# Requires: curl, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

set -uo pipefail

TYPE="${1:-}"
if [[ "$TYPE" != "weekly" && "$TYPE" != "monthly" ]]; then
  echo "Usage: bash scripts/generate-content.sh [weekly|monthly]"
  exit 1
fi

: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY is not set. Run: source .env.local}"
: "${SUPABASE_URL:?SUPABASE_URL is not set. Run: source .env.local}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is not set. Run: source .env.local}"

ANTHROPIC_API="https://api.anthropic.com/v1/messages"
MODEL="claude-sonnet-4-6"
BOLD='\033[1m'; CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

# ── Period label ───────────────────────────────────────────────────────────────
if [[ "$TYPE" == "weekly" ]]; then
  PERIOD="semana del $(date -d 'last monday' '+%-d de %B' 2>/dev/null || date '+%-d de %B') al $(date '+%-d de %B de %Y')"
  PERIOD_START=$(date -d 'last monday' '+%Y-%m-%d' 2>/dev/null || date '+%Y-%m-%d')
  PERIOD_END=$(date '+%Y-%m-%d')
  TITLE="Weekly Signals — $(date '+%-d de %B de %Y')"
  PROMPT_FILE="prompts/weekly-digest.es.md"
else
  PERIOD="$(LC_TIME=es_ES.UTF-8 date '+%B de %Y' 2>/dev/null || date '+%B %Y')"
  PERIOD_START="$(date '+%Y-%m-01')"
  PERIOD_END="$(date '+%Y-%m-%d')"
  TITLE="Monthly Brief — $(date '+%B %Y')"
  PROMPT_FILE="prompts/monthly-brief.es.md"
fi

# ── Load prompt ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PROMPT_PATH="$REPO_ROOT/$PROMPT_FILE"

if [[ ! -f "$PROMPT_PATH" ]]; then
  echo "Prompt file not found: $PROMPT_PATH"
  exit 1
fi

SYSTEM_PROMPT=$(awk '/^## System/{found=1; next} found && /^## /{found=0} found{print}' "$PROMPT_PATH" | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//')
USER_PROMPT=$(awk '/^## User/{found=1; next} found && /^## /{found=0} found{print}' "$PROMPT_PATH" | sed "s/{{period}}/$PERIOD/g")

# ── Header ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}=== Criterial Signals — Content Generator ===${NC}"
echo -e "  Type:    ${CYAN}$TYPE${NC}"
echo -e "  Period:  $PERIOD"
echo -e "  Model:   $MODEL (web_search, max_tokens=4000)"
echo ""

# ── Generate 3 variations ─────────────────────────────────────────────────────
VARIATIONS=()
echo -e "${BOLD}Generating 3 variations...${NC}"
echo ""

for i in 1 2 3; do
  echo -n "  Variation $i/3... "

  PAYLOAD=$(printf '%s' "$USER_PROMPT" | python3 -c "
import json, sys
user = sys.stdin.read()
system = '''$SYSTEM_PROMPT'''
body = {
  'model': '$MODEL',
  'max_tokens': 4000,
  'system': system,
  'tools': [{'type': 'web_search_20250305', 'name': 'web_search', 'max_uses': 5}],
  'messages': [{'role': 'user', 'content': user}]
}
print(json.dumps(body))
")

  RESPONSE=$(curl -s -X POST "$ANTHROPIC_API" \
    -H "content-type: application/json" \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -d "$PAYLOAD")

  TEXT=$(echo "$RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
blocks = data.get('content', [])
print(''.join(b.get('text','') for b in blocks if b.get('type')=='text').strip())
" 2>/dev/null)

  if [[ -z "$TEXT" ]]; then
    echo "FAILED"
    echo "  Response: $RESPONSE"
    exit 1
  fi

  VARIATIONS+=("$TEXT")
  echo "done"
done

# ── Display variations ─────────────────────────────────────────────────────────
echo ""
for i in 1 2 3; do
  echo -e "${BOLD}${CYAN}─────────────────── Variación $i ───────────────────${NC}"
  echo ""
  echo "${VARIATIONS[$((i-1))]}"
  echo ""
done

# ── Selection ─────────────────────────────────────────────────────────────────
echo -e "${YELLOW}¿Cuál guardas como borrador? (1/2/3 o Enter para cancelar):${NC} "
read -r SELECTION

if [[ -z "$SELECTION" || "$SELECTION" == "0" ]]; then
  echo "Cancelado. No se ha guardado nada."
  exit 0
fi

if [[ "$SELECTION" != "1" && "$SELECTION" != "2" && "$SELECTION" != "3" ]]; then
  echo "Opción inválida. Cancelado."
  exit 1
fi

SELECTED_TEXT="${VARIATIONS[$((SELECTION-1))]}"

# ── Save to Supabase as draft (via REST API) ──────────────────────────────────
echo ""
echo -n "Guardando borrador en Supabase... "

TMPBODY=$(mktemp)
printf '%s' "$SELECTED_TEXT" > "$TMPBODY"

PUB_ID=$(python3 - "$TMPBODY" "$TYPE" "$TITLE" "$PERIOD_START" "$PERIOD_END" "$SUPABASE_URL" "$SUPABASE_SERVICE_ROLE_KEY" <<'PYEOF'
import json, sys, urllib.request, urllib.error

body_file, pub_type, title, period_start, period_end, supabase_url, service_key = sys.argv[1:]

with open(body_file) as f:
    body_markdown = f.read()

payload = json.dumps({
    'type': pub_type,
    'title': title,
    'body_markdown': body_markdown,
    'status': 'draft',
    'period_start': period_start,
    'period_end': period_end
}).encode()

req = urllib.request.Request(
    f'{supabase_url}/rest/v1/publications',
    data=payload,
    headers={
        'apikey': service_key,
        'Authorization': f'Bearer {service_key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }
)
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        if isinstance(data, list) and data:
            print(data[0]['id'])
except urllib.error.HTTPError as e:
    sys.stderr.write(e.read().decode() + '\n')
    sys.exit(1)
PYEOF
) || true

rm -f "$TMPBODY"

if [[ -z "$PUB_ID" ]]; then
  echo "FAILED"
  exit 1
fi

echo "ok"
echo -e "  Publication ID: ${CYAN}$PUB_ID${NC}"
echo ""

# ── Publish now? ───────────────────────────────────────────────────────────────
echo -e "${YELLOW}¿Publicar ahora? Los suscriptores Pro podrán verlo en el archivo. (y/N):${NC} "
read -r PUBLISH

if [[ "$PUBLISH" == "y" || "$PUBLISH" == "Y" ]]; then
  supabase db query --linked \
    "UPDATE publications SET status = 'published' WHERE id = '$PUB_ID';" 2>/dev/null || true
  echo -e "${GREEN}Publicado.${NC} Los suscriptores ya pueden verlo en archive.html."
else
  echo "Guardado como borrador. Publica cuando estés listo con:"
  echo "  bash scripts/publish-draft.sh $PUB_ID"
fi

echo ""
