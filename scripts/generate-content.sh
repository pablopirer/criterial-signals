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

export PYTHONUTF8=1

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
echo -e "  Model:   $MODEL (web_search, max_tokens=8000)"
echo ""

# ── Generate 3 variations ─────────────────────────────────────────────────────
VARIATIONS=()
echo -e "${BOLD}Generating 3 variations...${NC}"
echo ""

for i in 1; do
  echo -n "  Variation $i/1... "

  PAYLOAD=$(printf '%s' "$USER_PROMPT" | python3 -c "
import json, sys
user = sys.stdin.read()
system = '''$SYSTEM_PROMPT'''
body = {
  'model': '$MODEL',
  'max_tokens': 8000,
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

  # ── Convert JSON to HTML ───────────────────────────────────────────────────────
  TEXT=$(echo "$TEXT" | python3 -c "
import json, sys, html, re as _re

raw = sys.stdin.read().strip()
if raw.startswith('\`\`\`'):
    lines = raw.split('\n')
    lines = [l for l in lines if not l.strip().startswith('\`\`\`')]
    raw = '\n'.join(lines).strip()

try:
    d = json.loads(raw)
except Exception as e:
    print(raw)
    sys.exit(0)

def esc(s):
    if not s: return ''
    parts = _re.split(r'(</?strong>)', str(s))
    return ''.join(html.escape(p) if not p.startswith('<') else p for p in parts)

badge_map = {
    'ma': 'pub-badge-ma', 'buyout': 'pub-badge-buyout',
    'growth': 'pub-badge-growth', 'salida': 'pub-badge-salida',
    'fund': 'pub-badge-fund', 'deuda': 'pub-badge-deuda',
    'lmm': 'pub-badge-lmm', 'opa': 'pub-badge-opa',
    'deeptech': 'pub-badge-deeptech'
}

out = []
out.append('<div class=\"pub-content\">')

# Header
out.append('<div class=\"pub-header-new\">')
out.append('<div class=\"pub-brand-row\">')
out.append('<span class=\"pub-brand-label\">Criterial · Weekly Signals</span>')
out.append(f'<span class=\"pub-brand-num\">Nº {esc(d.get(\"numero\",\"\"))} · {esc(d.get(\"period\",\"\"))}</span>')
out.append('</div>')
out.append(f'<h1 class=\"pub-title-new\">{esc(d.get(\"titulo\",\"\"))}</h1>')
out.append(f'<p class=\"pub-period-new\">Semana del {esc(d.get(\"period\",\"\"))}</p>')
out.append('</div>')

# Apertura
out.append('<div class=\"pub-section-new\">')
out.append('<p class=\"pub-sec-label\">Apertura</p>')
out.append(f'<div class=\"pub-apertura-new\"><p>{esc(d.get(\"apertura\",\"\"))}</p></div>')
out.append('</div>')

# Señales
out.append('<div class=\"pub-section-new\">')
out.append('<p class=\"pub-sec-label\">Señales de la semana</p>')
for s in d.get('senales', []):
    bc = badge_map.get(s.get('badge_class','ma'), 'pub-badge-ma')
    out.append('<div class=\"pub-signal-new\">')
    out.append('<div class=\"pub-signal-head\">')
    out.append(f'<span class=\"pub-badge-new {bc}\">{esc(s.get(\"tipo\",\"\"))}</span>')
    out.append(f'<span class=\"pub-signal-title\">{esc(s.get(\"titulo\",\"\"))}</span>')
    out.append(f'<span class=\"pub-time-tag\">[{esc(s.get(\"temporalidad\",\"\"))}]</span>')
    out.append('</div>')
    out.append('<div class=\"pub-signal-body\">')
    out.append(f'<p class=\"pub-signal-fact\">{esc(s.get(\"hecho\",\"\"))}</p>')
    out.append('<div class=\"pub-signal-rows\">')
    out.append('<div class=\"pub-signal-row\">')
    out.append('<span class=\"pub-signal-row-label\">Patrón</span>')
    out.append(f'<span class=\"pub-signal-row-text\">{esc(s.get(\"patron\",\"\"))}</span>')
    out.append('</div>')
    out.append('<div class=\"pub-signal-row\">')
    out.append('<span class=\"pub-signal-row-label\">Implicación</span>')
    out.append(f'<span class=\"pub-signal-row-text\">{esc(s.get(\"implicacion\",\"\"))}</span>')
    out.append('</div>')
    out.append('</div></div></div>')
out.append('</div>')

# Tabla operaciones
out.append('<div class=\"pub-section-new\">')
out.append('<p class=\"pub-sec-label\">Operaciones de la semana</p>')
out.append('<table class=\"pub-ops-table\"><colgroup><col style=\"width:26%\"><col style=\"width:18%\"><col style=\"width:22%\"><col style=\"width:34%\"></colgroup>')
out.append('<thead><tr><th>Operación</th><th>Tipo</th><th>Sector</th><th>Tesis</th></tr></thead><tbody>')
for op in d.get('operaciones', []):
    out.append(f'<tr><td>{esc(op.get(\"nombre\",\"\"))}</td><td>{esc(op.get(\"tipo\",\"\"))}</td><td>{esc(op.get(\"sector\",\"\"))}</td><td>{esc(op.get(\"tesis\",\"\"))}</td></tr>')
out.append('</tbody></table></div>')

# Qué vigilar
out.append('<div class=\"pub-section-new\">')
out.append('<p class=\"pub-sec-label\">Qué vigilar</p>')
out.append('<div class=\"pub-vigilar-grid\">')
for i, v in enumerate(d.get('vigilar', []), 1):
    out.append('<div class=\"pub-vigilar-card\">')
    out.append(f'<p class=\"pub-vigilar-num\">{i:02d}</p>')
    out.append(f'<p class=\"pub-vigilar-title-new\">{esc(v.get(\"titulo\",\"\"))}</p>')
    out.append(f'<p class=\"pub-vigilar-sub-new\">{esc(v.get(\"contexto\",\"\"))}</p>')
    out.append('</div>')
out.append('</div></div>')

# Read-through
rt = d.get('readthrough', {})
out.append('<div class=\"pub-section-new\">')
out.append('<p class=\"pub-sec-label\">Investment read-through</p>')
out.append('<div class=\"pub-readthrough\">')
out.append('<div class=\"pub-readthrough-header\"><span class=\"pub-readthrough-label\">3 conclusiones accionables de la semana</span></div>')
out.append('<div class=\"pub-readthrough-body\">')
for cat, key in [('Origination','origination'),('Financiación','financiacion'),('Salidas','salidas')]:
    out.append('<div class=\"pub-rt-item\">')
    out.append(f'<p class=\"pub-rt-cat\">{cat}</p>')
    out.append(f'<p class=\"pub-rt-text\">{esc(rt.get(key,\"\"))}</p>')
    out.append('</div>')
out.append('</div></div></div>')

# Dato de contexto
dato = d.get('dato', {})
out.append('<div class=\"pub-section-new\">')
out.append('<p class=\"pub-sec-label\">Dato de contexto</p>')
out.append('<div class=\"pub-dato-new\">')
out.append(f'<span class=\"pub-dato-num\">{esc(dato.get(\"cifra\",\"\"))}</span>')
out.append(f'<p class=\"pub-dato-text\">{esc(dato.get(\"texto\",\"\"))}</p>')
out.append('</div></div>')

# Fuentes
out.append('<div class=\"pub-sources-new\">')
out.append('<p class=\"pub-sec-label\">Fuentes</p>')
for f in d.get('fuentes', []):
    out.append('<div class=\"pub-source-row\">')
    out.append(f'<span class=\"pub-source-medio\">{esc(f.get(\"medio\",\"\"))}</span>')
    out.append(f'<span class=\"pub-source-titulo\">{esc(f.get(\"titulo\",\"\"))}</span>')
    out.append('</div>')
out.append('</div>')

# Footer
out.append('<div class=\"pub-footer-new\">')
out.append('<span class=\"pub-footer-text\">Criterial Signals · Pro</span>')
out.append('<span class=\"pub-footer-text\">criterialsignals.com</span>')
out.append('</div>')

out.append('</div>')
print(''.join(out))
" 2>/dev/null || echo "$TEXT")

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
for i in "${!VARIATIONS[@]}"; do
  echo -e "${BOLD}${CYAN}─────────────────── Variación $((i+1)) ───────────────────${NC}"
  echo ""
  echo "${VARIATIONS[$i]}"
  echo ""
done

# ── Selection ─────────────────────────────────────────────────────────────────
echo -e "${YELLOW}¿Guardar como borrador? (y/N):${NC} "
read -r SELECTION

if [[ "$SELECTION" != "y" && "$SELECTION" != "Y" ]]; then
  echo "Cancelado. No se ha guardado nada."
  exit 0
fi

SELECTION="1"

SELECTED_TEXT="${VARIATIONS[$((SELECTION-1))]}"

# ── Save to Supabase as draft (via REST API) ──────────────────────────────────
echo ""
echo -n "Guardando borrador en Supabase... "

TMPBODY=$(mktemp)
printf '%s' "$SELECTED_TEXT" > "$TMPBODY"

PUB_ID=$(python3 - "$TMPBODY" "$TYPE" "$TITLE" "$PERIOD_START" "$PERIOD_END" "$SUPABASE_URL" "$SUPABASE_SERVICE_ROLE_KEY" <<'PYEOF'
import json, sys, urllib.request, urllib.error

body_file, pub_type, title, period_start, period_end, supabase_url, service_key = sys.argv[1:]

with open(body_file, encoding='utf-8') as f:
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
    f'{supabase_url}publications',
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
