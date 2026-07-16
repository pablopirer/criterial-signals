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

# ── Spanish month names ────────────────────────────────────────────────────────
# date's %B is locale-dependent, and Git Bash on Windows ships no es_ES locale:
# `LC_TIME=es_ES.UTF-8 date` does not fail there, it silently falls back to C and
# emits English — so a `2>/dev/null ||` guard never fires. That is how the title
# "Brief Mensual — July 2026" reached the database. Map the month explicitly
# instead of trusting the locale. Mirrors MONTHS_ES in the generate-content EF.
MONTHS_ES=(enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre)
mes_es() { echo "${MONTHS_ES[$((10#$1 - 1))]}"; }   # "07" -> "julio"

# ── Period label ───────────────────────────────────────────────────────────────
if [[ "$TYPE" == "weekly" ]]; then
  MONDAY=$(date -d 'last monday' '+%Y-%m-%d' 2>/dev/null || date '+%Y-%m-%d')
  MON_D=$(date -d "$MONDAY" '+%-d' 2>/dev/null || date '+%-d')
  MON_M=$(date -d "$MONDAY" '+%m' 2>/dev/null || date '+%m')
  PERIOD="semana del ${MON_D} de $(mes_es "$MON_M") al $(date '+%-d') de $(mes_es "$(date '+%m')") de $(date '+%Y')"
  PERIOD_START="$MONDAY"
  PERIOD_END=$(date '+%Y-%m-%d')
  TITLE="Weekly Signals — $(date '+%-d') de $(mes_es "$(date '+%m')") de $(date '+%Y')"
  PROMPT_FILE="prompts/weekly-digest.es.md"
else
  PERIOD="$(mes_es "$(date '+%m')") de $(date '+%Y')"
  PERIOD_START="$(date '+%Y-%m-01')"
  PERIOD_END="$(date '+%Y-%m-%d')"
  TITLE="Brief Mensual — $(mes_es "$(date '+%m')") $(date '+%Y')"
  PROMPT_FILE="prompts/monthly-brief.es.md"
fi

# ── Edition number ─────────────────────────────────────────────────────────────
# Assigned here, not by the model — the model can't know the sequence (it used to
# echo the "1" from the prompt schema, so every edition said "Nº 1"). = count of
# already-published rows of THIS type + 1. Falls back to 1 if the query fails.
# Kept in sync with the generate-content Edge Function.
EDITION_NUMBER=$(python3 - "$TYPE" "$SUPABASE_URL" "$SUPABASE_SERVICE_ROLE_KEY" <<'PYEOF'
import sys, json, urllib.request
pub_type, supabase_url, service_key = sys.argv[1:]
req = urllib.request.Request(
    f'{supabase_url}publications?type=eq.{pub_type}&status=eq.published&select=id',
    headers={'apikey': service_key, 'Authorization': f'Bearer {service_key}'}
)
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        print(len(data) + 1 if isinstance(data, list) else 1)
except Exception:
    print(1)
PYEOF
)

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
echo -e "  Nº:      $EDITION_NUMBER"
echo -e "  Model:   $MODEL (web_search, max_tokens=16000)"
echo ""

# ── Generate 3 variations ─────────────────────────────────────────────────────
VARIATIONS=()
PUBLIC_VARIATIONS=()   # reduced free/public projection per variation (weekly only)
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
  'max_tokens': 16000,
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

  # Keep the raw model output (JSON): the full conversion below overwrites TEXT,
  # but the reduced public projection needs to re-read the same JSON.
  RAW_MODEL="$TEXT"

  # ── Convert JSON to HTML (full / Pro) ──────────────────────────────────────────
  if [[ "$TYPE" == "weekly" ]]; then
  TEXT=$(echo "$TEXT" | EDITION_NUMBER="$EDITION_NUMBER" python3 -c "
import json, sys, html, re as _re, base64, os

NUM = os.environ.get('EDITION_NUMBER', '').strip()
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
out.append(f'<span class=\"pub-brand-num\">Nº {esc(NUM)} · {esc(d.get(\"period\",\"\"))}</span>')
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

# Mapa de posicionamiento (interactive — hydrated client-side from base64 data)
mapa = d.get('mapa')
if isinstance(mapa, dict) and isinstance(mapa.get('nodos'), list) and len(mapa.get('nodos')) >= 3:
    encoded = base64.b64encode(json.dumps(mapa, ensure_ascii=False).encode('utf-8')).decode('ascii')
    out.append('<div class=\"pub-section-new\">')
    out.append('<p class=\"pub-sec-label\">Mapa de posicionamiento</p>')
    out.append(f'<div class=\"pub-map\" data-mapa=\"{encoded}\"></div>')
    out.append('</div>')

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
  else
  # ── Monthly JSON → HTML (mirrors monthlyJsonToHtml in generate-content) ─────────
  TEXT=$(RAW_MODEL="$RAW_MODEL" EDITION_NUMBER="$EDITION_NUMBER" python3 <<'PYEOF'
import os, json, html, re as _re, base64
NUM = os.environ.get('EDITION_NUMBER', '').strip()
raw = os.environ.get('RAW_MODEL', '').strip()
if raw.startswith('```'):
    raw = '\n'.join(l for l in raw.split('\n') if not l.strip().startswith('```')).strip()
s2 = raw.find('{'); e2 = raw.rfind('}')
if s2 != -1 and e2 != -1 and e2 > s2:
    raw = raw[s2:e2+1]
try:
    d = json.loads(raw)
except Exception:
    print(os.environ.get('RAW_MODEL', ''))
    raise SystemExit(0)

def esc(s):
    if not s: return ''
    parts = _re.split(r'(</?strong>)', str(s))
    return ''.join(html.escape(p) if not p.startswith('<') else p for p in parts)

def b64(o):
    return base64.b64encode(json.dumps(o, ensure_ascii=False).encode('utf-8')).decode('ascii')

def paras(v):
    if isinstance(v, list): return [p for p in v if isinstance(p, str) and p.strip()]
    if isinstance(v, str) and v.strip(): return [v]
    return []

def isnum(x):
    try: float(x); return True
    except Exception: return False

def fmt_meur(n):
    return format(int(round(n)), ',').replace(',', '.') + ' M€'

_sec = [0]
def num():
    _sec[0] += 1
    return str(_sec[0]).zfill(2)

def head(t):
    out.append(f'<div class="mb-sec-head"><span class="mb-sec-num">{num()}</span><h2 class="mb-sec-title">{t}</h2></div>')

def prose_p(v):
    return ''.join(f'<p>{esc(p)}</p>' for p in paras(v))

out = ['<div class="pub-content mb-report">']

# Masthead
out.append('<div class="mb-masthead">')
out.append('<div class="mb-brand-row">')
out.append('<span class="mb-kicker">Criterial · Brief Mensual</span>')
out.append(f'<span class="mb-num">Nº {esc(NUM)} · {esc(d.get("period",""))}</span>')
out.append('</div>')
out.append(f'<h1 class="mb-title">{esc(d.get("titulo",""))}</h1>')
if d.get('dek'):
    out.append(f'<p class="mb-dek">{esc(d.get("dek",""))}</p>')
out.append('<p class="mb-byline">Un informe de Criterial · Solo Pro</p>')
out.append('</div>')

# Resumen ejecutivo
resumen = paras(d.get('resumen'))
if resumen:
    out.append('<div class="mb-summary">')
    out.append('<p class="mb-summary-label">Resumen ejecutivo</p>')
    out.append('<ul class="mb-summary-list">')
    for r in resumen:
        out.append(f'<li>{esc(r)}</li>')
    out.append('</ul></div>')

# Tesis del mes — lead prose (drop cap) + pull-quote after the first paragraph
out.append('<section class="mb-section">')
head('Tesis del mes')
out.append('<div class="mb-col">')
tp = paras(d.get('tesis'))
if tp:
    out.append(f'<div class="mb-prose mb-prose--lead"><p>{esc(tp[0])}</p></div>')
if d.get('pullquote'):
    out.append(f'<div class="mb-quote">{esc(d.get("pullquote",""))}</div>')
if len(tp) > 1:
    out.append('<div class="mb-prose">' + ''.join(f'<p>{esc(p)}</p>' for p in tp[1:]) + '</div>')
out.append('</div></section>')

# Contexto de mercado — macro backdrop
ctx = paras(d.get('contexto'))
if ctx:
    out.append('<section class="mb-section">')
    head('Contexto de mercado')
    out.append('<div class="mb-col"><div class="mb-prose">' + prose_p(ctx) + '</div></div>')
    out.append('</section>')

# El mes en datos — framed panel DERIVED from the cited deal table
ops = [o for o in d.get('operaciones', []) if isinstance(o, dict) and o.get('nombre') and o.get('sector')]
if ops:
    by = {}
    for o in ops:
        by[o['sector']] = by.get(o['sector'], 0) + 1
    sector_bars = [{'label': k, 'valor': str(v), 'n': v} for k, v in sorted(by.items(), key=lambda kv: -kv[1])]
    with_amt = [o for o in ops if isnum(o.get('n_importe')) and float(o.get('n_importe')) > 0]
    volume = sum(float(o['n_importe']) for o in with_amt)
    avg = (volume / len(with_amt)) if with_amt else None
    macro = [m for m in d.get('macro', []) if isinstance(m, dict) and m.get('label') and m.get('valor') and m.get('fuente')]

    out.append('<section class="mb-section">')
    head('El mes en datos')
    out.append('<div class="mb-data">')
    out.append('<div class="mb-stats">')
    def stat(val, label, src=None):
        out.append('<div class="mb-stat">')
        out.append(f'<span class="mb-stat-val">{esc(val)}</span>')
        out.append(f'<span class="mb-stat-label">{esc(label)}</span>')
        if src:
            out.append(f'<span class="mb-stat-src">{esc(src)}</span>')
        out.append('</div>')
    stat(str(len(ops)), 'Operaciones seguidas')
    if volume > 0:
        stat(fmt_meur(volume), 'Volumen divulgado')
    if avg is not None:
        stat(fmt_meur(avg), 'Ticket medio')
    if sector_bars:
        stat(sector_bars[0]['label'], 'Sector más activo')
    for m in macro:
        stat(m['valor'], m['label'], m['fuente'])
    out.append('</div>')
    if len(sector_bars) >= 2:
        out.append('<p class="mb-data-caption">Operaciones por sector</p>')
        out.append(f'<div class="pub-metrics" data-metrics="{b64(sector_bars)}"></div>')
    out.append(f'<p class="mb-data-note">Cálculo de Criterial sobre las {len(ops)} operaciones del mes recogidas abajo. Cada operación, con su fuente.</p>')
    out.append('</div></section>')

    # Operaciones del mes — cited table
    out.append('<section class="mb-section">')
    head('Operaciones del mes')
    out.append('<table class="mb-ops"><thead><tr><th>Operación</th><th>Sector</th><th>Tipo</th><th>Importe</th><th>Fuente</th></tr></thead><tbody>')
    for o in ops:
        out.append(f'<tr><td>{esc(o.get("nombre",""))}</td><td>{esc(o.get("sector",""))}</td><td>{esc(o.get("tipo",""))}</td><td>{esc(o.get("importe","n.d."))}</td><td>{esc(o.get("fuente",""))}</td></tr>')
    out.append('</tbody></table></section>')

# Rotación de capital — sector prose (2-3 paragraphs each)
sectores = [s for s in d.get('sectores', []) if isinstance(s, dict) and s.get('nombre') and paras(s.get('cuerpo'))]
if sectores:
    out.append('<section class="mb-section">')
    head('Rotación de capital')
    out.append('<div class="mb-col">')
    for s in sectores:
        out.append('<div class="mb-sector">')
        out.append(f'<h3 class="mb-sector-name">{esc(s.get("nombre",""))}</h3>')
        out.append('<div class="mb-prose">' + prose_p(s.get('cuerpo')) + '</div>')
        out.append('</div>')
    out.append('</div></section>')

# Mapa del mes — temporal tracker
mapa = d.get('mapa')
if isinstance(mapa, dict) and isinstance(mapa.get('nodos'), list) and len(mapa.get('nodos')) >= 3:
    out.append('<section class="mb-section mb-section-map">')
    head('Mapa del mes')
    out.append('<p class="mb-sec-lede">Posición de cada sector y su movimiento respecto al mes anterior. Usa el interruptor para ver dónde estaba hace un mes.</p>')
    out.append(f'<div class="pub-map" data-mapa="{b64(mapa)}"></div>')
    out.append('</section>')

# Operación del mes — deep-dive (multi-paragraph analysis)
op = d.get('operacion')
if isinstance(op, dict) and op.get('nombre'):
    out.append('<section class="mb-section">')
    head('Operación del mes')
    out.append('<div class="mb-op">')
    out.append('<div class="mb-op-head">')
    out.append(f'<span class="mb-op-name">{esc(op.get("nombre",""))}</span>')
    if op.get('sector'):
        out.append(f'<span class="mb-op-sector">{esc(op.get("sector",""))}</span>')
    out.append('</div>')
    datos = [x for x in op.get('datos', []) if isinstance(x, dict) and x.get('label') and x.get('valor')]
    if datos:
        out.append('<div class="mb-op-data">')
        for x in datos:
            out.append('<div class="mb-op-cell">')
            out.append(f'<span class="mb-op-cell-label">{esc(x.get("label",""))}</span>')
            out.append(f'<span class="mb-op-cell-val">{esc(x.get("valor",""))}</span>')
            out.append('</div>')
        out.append('</div>')
    out.append('<div class="mb-prose">' + prose_p(op.get('analisis')) + '</div>')
    out.append('</div></section>')

# Perspectiva — house view
persp = [p for p in d.get('perspectiva', []) if isinstance(p, dict) and p.get('titulo')]
if persp:
    out.append('<section class="mb-section">')
    head('Perspectiva')
    out.append('<div class="mb-col"><div class="mb-persp">')
    for p in persp:
        out.append('<div class="mb-persp-item">')
        out.append(f'<p class="mb-persp-title">{esc(p.get("titulo",""))}</p>')
        out.append(f'<p class="mb-persp-text">{esc(p.get("contexto",""))}</p>')
        out.append('</div>')
    out.append('</div></div></section>')

# Fuentes
out.append('<div class="mb-sources">')
out.append('<p class="mb-sources-label">Fuentes</p>')
for f in d.get('fuentes', []):
    out.append('<div class="mb-source-row">')
    out.append(f'<span class="mb-source-medio">{esc(f.get("medio",""))}</span>')
    out.append(f'<span class="mb-source-titulo">{esc(f.get("titulo",""))}</span>')
    out.append('</div>')
out.append('</div>')

# Footer
out.append('<div class="mb-footer">')
out.append('<span>Criterial Signals · Pro</span>')
out.append('<span>criterialsignals.com</span>')
out.append('</div>')

out.append('</div>')
print(''.join(out))
PYEOF
)
  fi

  if [[ -z "$TEXT" ]]; then
    echo "FAILED"
    echo "  Response: $RESPONSE"
    exit 1
  fi

  # ── Reduced public projection (weekly only) → body_public ─────────────────────
  # Same JSON as the full version; keeps only apertura + señales(hecho) + mapa.
  # Omits patrón/implicación, operaciones, read-through, dato, fuentes (Pro depth).
  # Mirrors weeklyJsonToPublicHtml in generate-content/index.ts. Degrades safely:
  # any failure leaves PUBLIC_HTML empty → body_public null → the save still works.
  PUBLIC_HTML=""
  if [[ "$TYPE" == "weekly" ]]; then
    PUBLIC_HTML=$(RAW_MODEL="$RAW_MODEL" EDITION_NUMBER="$EDITION_NUMBER" python3 <<'PYEOF'
import os, json, html, re as _re, base64
NUM = os.environ.get('EDITION_NUMBER', '').strip()
raw = os.environ.get('RAW_MODEL', '').strip()
s2 = raw.find('{'); e2 = raw.rfind('}')
if s2 != -1 and e2 != -1 and e2 > s2:
    raw = raw[s2:e2+1]
try:
    d = json.loads(raw)
except Exception:
    raise SystemExit(0)
def esc(s):
    if not s: return ''
    parts = _re.split(r'(</?strong>)', str(s))
    return ''.join(html.escape(p) if not p.startswith('<') else p for p in parts)
badge_map = {'ma':'pub-badge-ma','buyout':'pub-badge-buyout','growth':'pub-badge-growth','salida':'pub-badge-salida','fund':'pub-badge-fund','deuda':'pub-badge-deuda','lmm':'pub-badge-lmm','opa':'pub-badge-opa','deeptech':'pub-badge-deeptech'}
out = ['<div class="pub-content">']
out.append('<div class="pub-header-new">')
out.append('<div class="pub-brand-row">')
out.append('<span class="pub-brand-label">Criterial · Signals</span>')
out.append(f'<span class="pub-brand-num">Nº {esc(NUM)} · {esc(d.get("period",""))}</span>')
out.append('</div>')
out.append(f'<h1 class="pub-title-new">{esc(d.get("titulo",""))}</h1>')
out.append(f'<p class="pub-period-new">Semana del {esc(d.get("period",""))}</p>')
out.append('</div>')
out.append('<div class="pub-section-new">')
out.append('<p class="pub-sec-label">Apertura</p>')
out.append(f'<div class="pub-apertura-new"><p>{esc(d.get("apertura",""))}</p></div>')
out.append('</div>')
out.append('<div class="pub-section-new">')
out.append('<p class="pub-sec-label">Señales de la semana</p>')
for s in d.get('senales', []):
    bc = badge_map.get(s.get('badge_class','ma'), 'pub-badge-ma')
    out.append('<div class="pub-signal-new">')
    out.append('<div class="pub-signal-head">')
    out.append(f'<span class="pub-badge-new {bc}">{esc(s.get("tipo",""))}</span>')
    out.append(f'<span class="pub-signal-title">{esc(s.get("titulo",""))}</span>')
    out.append(f'<span class="pub-time-tag">[{esc(s.get("temporalidad",""))}]</span>')
    out.append('</div>')
    out.append('<div class="pub-signal-body">')
    out.append(f'<p class="pub-signal-fact">{esc(s.get("hecho",""))}</p>')
    out.append('</div></div>')
out.append('</div>')
mapa = d.get('mapa')
if isinstance(mapa, dict) and isinstance(mapa.get('nodos'), list) and len(mapa.get('nodos')) >= 3:
    encoded = base64.b64encode(json.dumps(mapa, ensure_ascii=False).encode('utf-8')).decode('ascii')
    out.append('<div class="pub-section-new">')
    out.append('<p class="pub-sec-label">Mapa de posicionamiento</p>')
    out.append(f'<div class="pub-map" data-mapa="{encoded}"></div>')
    out.append('</div>')
out.append('<div class="pub-footer-new">')
out.append('<span class="pub-footer-text">Criterial Signals · Edición abierta</span>')
out.append('<span class="pub-footer-text">criterialsignals.com</span>')
out.append('</div>')
out.append('</div>')
print(''.join(out))
PYEOF
)
  fi

  VARIATIONS+=("$TEXT")
  PUBLIC_VARIATIONS+=("$PUBLIC_HTML")
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
SELECTED_PUBLIC="${PUBLIC_VARIATIONS[$((SELECTION-1))]}"

# ── Save to Supabase as draft (via REST API) ──────────────────────────────────
echo ""
echo -n "Guardando borrador en Supabase... "

TMPBODY=$(mktemp)
printf '%s' "$SELECTED_TEXT" > "$TMPBODY"
TMPPUBLIC=$(mktemp)
printf '%s' "$SELECTED_PUBLIC" > "$TMPPUBLIC"

PUB_ID=$(python3 - "$TMPBODY" "$TMPPUBLIC" "$TYPE" "$TITLE" "$PERIOD_START" "$PERIOD_END" "$SUPABASE_URL" "$SUPABASE_SERVICE_ROLE_KEY" <<'PYEOF'
import json, sys, urllib.request, urllib.error

body_file, public_file, pub_type, title, period_start, period_end, supabase_url, service_key = sys.argv[1:]

with open(body_file, encoding='utf-8') as f:
    body_markdown = f.read()
with open(public_file, encoding='utf-8') as f:
    body_public = f.read()

payload = json.dumps({
    'type': pub_type,
    'title': title,
    'body_markdown': body_markdown,
    'body_public': body_public if body_public.strip() else None,
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

rm -f "$TMPBODY" "$TMPPUBLIC"

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
