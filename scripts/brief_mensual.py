#!/usr/bin/env python3
"""Brief Mensual v7 — one question per month, answered with Criterial's own evidence.

Reads the month's deals from public.deals and the Weeklies published that month,
computes the figures in code, asks the model to answer one question with that
evidence (web search only for the European context), renders the mb-* report
HTML and saves it as a draft. The model never computes a figure.

Usage (from the repo root, after `source .env.local`):
    python3 scripts/brief_mensual.py 2026-10
    python3 scripts/brief_mensual.py 2026-10 "¿Se está enfriando la deuda privada?"

Offline testing (no database, no API, nothing saved):
    python3 scripts/brief_mensual.py 2026-09 --datos fixtures/brief-datos-fixture.json \\
        --modelo fixtures/brief-modelo-fixture.json --html out.html

Options:
    --incluir-prueba  also use deals and Weeklies marked is_test (default: real data only)
    --datos FILE      inputs from a JSON file ({deals, prev_deals, weeklies}) instead of the database
    --modelo FILE     model output from a JSON file instead of calling the API
    --html FILE       write the HTML there and stop (nothing is saved)

Called by `scripts/generate-content.sh monthly [YYYY-MM] ["pregunta"]`.
"""

import argparse
import base64
import calendar
import html
import io
import json
import os
import re
import statistics
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

MODEL = "claude-sonnet-5-5"
EFFORT = "medium"
MAX_TOKENS = 16000
WEB_SEARCH_USES = 3  # only the European context is searched; the deals come from the base
MIN_IMPORTES = 3     # below this, no volume or median is shown: it would not represent the month

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
ESTADOS = {"anunciada": "Anunciada", "en_proceso": "En proceso",
           "cerrada": "Cerrada", "cancelada": "Cancelada"}
VIG_ESTADOS = {"paso": "Pasó", "no_paso": "No pasó", "abierto": "Sigue abierto"}
PERFILES = [("boutique", "Boutiques de M&A y asesores"),
            ("fondo", "Fondos e inversores"),
            ("empresa", "Empresas y family offices")]

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ── Small helpers ──────────────────────────────────────────────────────────────

def esc(s):
    """HTML-escape model text but keep <strong> tags (same rule as the Weekly).
    Web search leaves <cite index="..."> wrappers around quoted passages: they
    are dropped, their text kept."""
    if s is None:
        return ""
    s = re.sub(r"</?cite\b[^>]*>", "", str(s))
    parts = re.split(r"(</?strong>)", s)
    return "".join(p if p in ("<strong>", "</strong>") else html.escape(p) for p in parts)


def plain(s):
    return html.escape(str(s or ""))


def safe_url(u):
    return u.strip() if isinstance(u, str) and re.match(r"(?i)^https?://", u.strip()) else None


def fmt_num(n, decimals=0):
    """12345.6 -> '12.346'; 3.25 with decimals=1 -> '3,3' (es-ES)."""
    s = f"{n:,.{decimals}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def fmt_meur(n):
    return f"{fmt_num(n, 0 if n >= 10 else 1)} M€"


def fecha_corta(f):
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", f or "")
    return f"{int(m.group(3))} {MESES_CORTOS[int(m.group(2)) - 1]}" if m else "—"


def fecha_larga(f):
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", f or "")
    return f"{int(m.group(3))} de {MESES[int(m.group(2)) - 1]} de {m.group(1)}" if m else ""


def b64(o):
    # separators match JavaScript's JSON.stringify, like the other converters
    return base64.b64encode(json.dumps(o, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).decode("ascii")


def month_bounds(year, month):
    last = calendar.monthrange(year, month)[1]
    return f"{year:04d}-{month:02d}-01", f"{year:04d}-{month:02d}-{last:02d}"


def prev_month(year, month):
    return (year - 1, 12) if month == 1 else (year, month - 1)


# ── Inputs ─────────────────────────────────────────────────────────────────────

def rest_get(path):
    base = os.environ["SUPABASE_URL"]  # ends in /rest/v1/
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(base + path, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def deals_in(start, end, include_test):
    # A deal belongs to the month of the fact; without a fact date, to the month
    # its source was published.
    q = ("deals?select=*&order=fecha.asc.nullslast"
         f"&or=(and(fecha.gte.{start},fecha.lte.{end}),and(fecha.is.null,fecha_publicacion.gte.{start},fecha_publicacion.lte.{end}))")
    if not include_test:
        q += "&is_test=eq.false"
    return rest_get(q)


def fetch_inputs(year, month, include_test):
    start, end = month_bounds(year, month)
    py, pm = prev_month(year, month)
    pstart, pend = month_bounds(py, pm)
    q = ("publications?select=id,title,period_start,period_end,body_data,is_test"
         f"&type=eq.weekly&status=eq.published&period_end=gte.{start}&period_start=lte.{end}"
         "&order=period_start.asc")
    if not include_test:
        q += "&is_test=eq.false"
    return {
        "deals": deals_in(start, end, include_test),
        "prev_deals": deals_in(pstart, pend, include_test),
        "weeklies": rest_get(q),
    }


# ── Figures (computed here, never by the model) ────────────────────────────────

def compute(deals, prev_deals):
    es = [d for d in deals if d.get("ambito", "espana") != "exterior"]
    ext = [d for d in deals if d.get("ambito") == "exterior"]
    prev_es = [d for d in prev_deals if d.get("ambito", "espana") != "exterior"]
    # A fund close is capital raised, not a transaction: it counts as an operation
    # but never adds to volume or median.
    amounts = [float(d["importe_eur"]) for d in es
               if d.get("importe_eur") not in (None, "") and d.get("tipo") != "Fundraising"]
    tx = [d for d in es if d.get("tipo") != "Fundraising"]

    def count(key, rows):
        out = {}
        for d in rows:
            k = d.get(key) or "Sin clasificar"
            out[k] = out.get(k, 0) + 1
        return sorted(out.items(), key=lambda kv: (-kv[1], kv[0]))

    enough = len(amounts) >= MIN_IMPORTES
    return {
        "operaciones_espana": len(es),
        "capital_espanol_fuera": len(ext),
        "transacciones": len(tx),
        "con_importe_publico": len(amounts),
        "pct_con_importe": round(100 * len(amounts) / len(tx)) if tx else 0,
        "volumen_divulgado_meur": round(sum(amounts), 1) if enough else None,
        "importe_mediano_meur": round(statistics.median(amounts), 1) if enough else None,
        "por_sector": count("sector", es),
        "por_tipo": count("tipo", es),
        "por_estado": count("estado", es),
        "operaciones_mes_anterior": len(prev_es),
        "nota_cobertura": (
            f"Operaciones registradas por Criterial en sus Weekly. {len(amounts)} de las {len(tx)} transacciones"
            " tienen importe público; los cierres de fondos cuentan como operación pero no suman al volumen."
            + ("" if enough else f" Con menos de {MIN_IMPORTES} importes no se calculan volumen ni mediana.")
        ),
    }


def build_model_data(inputs, cifras, pregunta):
    """What the model sees: figures, coded deals (D1..), coded watch items (V1..)."""
    deals = inputs["deals"]
    ops = []
    for i, d in enumerate(deals, 1):
        d["_code"] = f"D{i}"
        ops.append({k: v for k, v in {
            "codigo": d["_code"], "nombre": d.get("nombre"), "comprador": d.get("comprador"),
            "objetivo": d.get("objetivo"), "tipo": d.get("tipo"), "sector": d.get("sector"),
            "importe": d.get("importe"), "importe_eur_m": d.get("importe_eur"),
            "estado": d.get("estado"), "fecha": d.get("fecha"), "ambito": d.get("ambito"),
            "tesis": d.get("tesis"), "fuente": d.get("fuente_medio"),
        }.items() if v not in (None, "")})
    weeklies, vig = [], []
    for w in inputs["weeklies"]:
        bd = w.get("body_data") or {}
        items = []
        for v in bd.get("vigilar") or []:
            code = f"V{len(vig) + 1}"
            vig.append({"codigo": code, "titulo": v.get("titulo"), "semana": w.get("period_end")})
            items.append({"codigo": code, "titulo": v.get("titulo"), "contexto": v.get("contexto")})
        weeklies.append({
            "titulo": bd.get("titulo") or w.get("title"),
            "semana": f"{w.get('period_start')} a {w.get('period_end')}",
            "apertura": bd.get("apertura"),
            "senales": [{"titulo": s.get("titulo"), "hecho": s.get("hecho")} for s in bd.get("senales") or []],
            "vigilar": items,
            "fuera": [{"titulo": f.get("titulo"), "texto": f.get("texto")} for f in bd.get("fuera") or []],
        })
    data = {"cifras": {k: v for k, v in cifras.items() if k != "nota_cobertura"},
            "operaciones": ops, "weeklies": weeklies}
    if pregunta:
        data["pregunta"] = pregunta
    return data, vig


# ── Model ──────────────────────────────────────────────────────────────────────

def load_prompt():
    text = io.open(os.path.join(REPO, "prompts", "monthly-brief.es.md"), encoding="utf-8").read()
    system = text.split("## System", 1)[1].split("\n## User", 1)[0].strip()
    user = text.split("## User", 1)[1].strip()
    return system, user


def call_model(system, user):
    body = {
        "model": MODEL, "max_tokens": MAX_TOKENS, "system": system,
        "tools": [{"type": "web_search_20250305", "name": "web_search", "max_uses": WEB_SEARCH_USES}],
        "output_config": {"effort": EFFORT}, "fallbacks": "default",
        "messages": [{"role": "user", "content": user}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=json.dumps(body).encode("utf-8"),
        headers={"content-type": "application/json", "x-api-key": os.environ["ANTHROPIC_API_KEY"],
                 "anthropic-version": "2023-06-01", "anthropic-beta": "server-side-fallback-2026-07-01"})
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            out = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"Anthropic API {e.code}: {e.read().decode()[:500]}")
    if out.get("stop_reason") in ("refusal", "max_tokens"):
        sys.exit(f"The model stopped early (stop_reason: {out['stop_reason']}).")
    return "".join(b.get("text", "") for b in out.get("content", []) if b.get("type") == "text").strip()


def extract_json(text):
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    body = m.group(1) if m else text
    s, e = body.find("{"), body.rfind("}")
    if s == -1 or e < s:
        raise ValueError("No JSON object in the model output")
    return json.loads(body[s:e + 1])


# ── HTML ───────────────────────────────────────────────────────────────────────

def as_list(v):
    if isinstance(v, list):
        return [p for p in v if isinstance(p, str) and p.strip()]
    return [v] if isinstance(v, str) and v.strip() else []


def deal_label(d):
    return d.get("objetivo") or d.get("nombre") or d["_code"]


def importe_cell(d):
    imp = d.get("importe") or "n.d."
    eur, mon = d.get("importe_eur"), (d.get("moneda") or "EUR")
    if eur not in (None, "") and mon != "EUR":
        return f"{plain(imp)} <span class=\"mb-ops-eur\">≈ {fmt_meur(float(eur))}</span>"
    return plain(imp)


def render(model, inputs, cifras, vig, numero, period_label, prev_label):
    deals = inputs["deals"]
    by_code = {d["_code"]: d for d in deals}
    parts = []
    sec = [0]

    def head(title):
        sec[0] += 1
        parts.append(f'<div class="mb-sec-head"><span class="mb-sec-num">{sec[0]:02d}</span>'
                     f'<h2 class="mb-sec-title">{title}</h2></div>')

    def rich(text):
        """Model prose: escaped, and each deal code it cites (D3) linked to its annex row."""
        return re.sub(r"\bD(\d{1,3})\b",
                      lambda m: (f'<a class="mb-ref" href="#op-d{m.group(1)}">D{m.group(1)}</a>'
                                 if f"D{m.group(1)}" in by_code else m.group(0)),
                      esc(text))

    def op_links(codes):
        links = []
        for c in codes or []:
            d = by_code.get(str(c).strip().upper())
            if d:
                links.append(f'<a href="#op-{d["_code"].lower()}">{plain(deal_label(d))}</a>')
        return f'<span class="mb-evid-ops">{" · ".join(links)}</span>' if links else ""

    parts.append('<div class="pub-content mb-report">')

    # Masthead: the headline is the answer, the dek is the question
    parts.append('<div class="mb-masthead">')
    parts.append('<div class="mb-brand-row"><span class="mb-kicker">Criterial · Brief Mensual</span>'
                 f'<span class="mb-num">Nº {numero} · {plain(period_label)}</span></div>')
    parts.append(f'<h1 class="mb-title">{rich(model.get("titulo"))}</h1>')
    if model.get("pregunta"):
        parts.append('<p class="mb-question-label">La pregunta del mes</p>')
        parts.append(f'<p class="mb-dek">{rich(model.get("pregunta"))}</p>')
    parts.append('<p class="mb-byline">Un informe de Criterial · Solo Pro</p>')
    parts.append("</div>")

    resumen = as_list(model.get("resumen"))
    if resumen:
        parts.append('<div class="mb-summary"><p class="mb-summary-label">La respuesta</p><ul class="mb-summary-list">')
        parts.extend(f"<li>{rich(r)}</li>" for r in resumen)
        parts.append("</ul></div>")

    # Tesis
    tp = as_list(model.get("tesis"))
    if tp:
        parts.append('<section class="mb-section">')
        head("Tesis")
        parts.append(f'<div class="mb-col"><div class="mb-prose mb-prose--lead"><p>{rich(tp[0])}</p></div>')
        if model.get("pullquote"):
            parts.append(f'<div class="mb-quote">{rich(model.get("pullquote"))}</div>')
        if len(tp) > 1:
            parts.append('<div class="mb-prose">' + "".join(f"<p>{rich(p)}</p>" for p in tp[1:]) + "</div>")
        parts.append("</div></section>")

    # Evidencia a favor y en contra
    favor = [e for e in model.get("evidencia_favor") or [] if isinstance(e, dict) and e.get("texto")]
    contra = [e for e in model.get("evidencia_contra") or [] if isinstance(e, dict) and e.get("texto")]
    if favor or contra:
        parts.append('<section class="mb-section">')
        head("La evidencia")
        parts.append('<div class="mb-evid">')
        for label, items, mod in (("A favor", favor, "favor"), ("En contra", contra, "contra")):
            parts.append(f'<div class="mb-evid-col mb-evid-col--{mod}"><p class="mb-evid-label">{label}</p><ul class="mb-evid-list">')
            parts.extend(f"<li>{rich(e['texto'])}{op_links(e.get('ops'))}</li>" for e in items)
            parts.append("</ul></div>")
        parts.append("</div></section>")

    # El mes en datos — every figure computed in compute()
    parts.append('<section class="mb-section">')
    head("El mes en datos")
    parts.append('<div class="mb-data">')
    if model.get("lectura_datos"):
        parts.append(f'<p class="mb-data-lede">{rich(model.get("lectura_datos"))}</p>')
    parts.append('<div class="mb-stats">')

    def stat(val, label, src=None):
        parts.append(f'<div class="mb-stat"><span class="mb-stat-val">{plain(val)}</span>'
                     f'<span class="mb-stat-label">{plain(label)}</span>'
                     + (f'<span class="mb-stat-src">{plain(src)}</span>' if src else "") + "</div>")

    stat(str(cifras["operaciones_espana"]), "Operaciones en España",
         f"{prev_label.capitalize()}: {cifras['operaciones_mes_anterior']}")
    stat(f"{cifras['con_importe_publico']} de {cifras['transacciones']}", "Transacciones con importe público")
    if cifras["volumen_divulgado_meur"] is not None:
        stat(fmt_meur(cifras["volumen_divulgado_meur"]), "Volumen divulgado")
        stat(fmt_meur(cifras["importe_mediano_meur"]), "Importe mediano")
    estados = dict(cifras["por_estado"])
    if any(k in estados for k in ESTADOS):
        stat(f"{estados.get('anunciada', 0) + estados.get('en_proceso', 0)} / {estados.get('cerrada', 0)}",
             "Anunciadas o en proceso / cerradas")
    if cifras["capital_espanol_fuera"]:
        stat(str(cifras["capital_espanol_fuera"]), "Capital español fuera", "No cuentan en las cifras de España")
    parts.append("</div>")
    sectores = [{"label": k, "valor": str(v), "n": v} for k, v in cifras["por_sector"]]
    if len(sectores) >= 2:
        parts.append('<p class="mb-data-caption">Operaciones por sector</p>')
        parts.append(f'<div class="pub-metrics" data-metrics="{b64(sectores)}"></div>')
    if cifras["por_tipo"]:
        tipos = " · ".join(f"{plain(k)} {v}" for k, v in cifras["por_tipo"])
        parts.append(f'<p class="mb-data-note">Por tipo: {tipos}.</p>')
    parts.append(f'<p class="mb-data-note">{plain(cifras["nota_cobertura"])} Detalle en el anexo.</p>')
    parts.append("</div></section>")

    # España frente a Europa
    europa = as_list(model.get("europa"))
    if europa:
        parts.append('<section class="mb-section">')
        head("España frente a Europa")
        parts.append('<div class="mb-col"><div class="mb-prose">' + "".join(f"<p>{rich(p)}</p>" for p in europa) + "</div></div>")
        parts.append("</section>")

    # Lo que vigilábamos
    vig_titles = {v["codigo"]: v for v in vig}
    revis = [v for v in model.get("vigilabamos") or [] if isinstance(v, dict) and v.get("id") in vig_titles]
    if revis:
        parts.append('<section class="mb-section">')
        head("Lo que vigilábamos")
        parts.append('<div class="mb-col"><div class="mb-vig">')
        for v in revis:
            st = v.get("estado") if v.get("estado") in VIG_ESTADOS else "abierto"
            orig = vig_titles[v["id"]]
            parts.append('<div class="mb-vig-item">'
                         f'<span class="mb-vig-badge mb-vig-badge--{st}">{VIG_ESTADOS[st]}</span>'
                         f'<p class="mb-vig-title">{plain(orig["titulo"])}</p>'
                         f'<p class="mb-vig-text">{rich(v.get("texto"))}</p></div>')
        parts.append("</div></div></section>")

    # Lo que todavía no sabemos
    nos = as_list(model.get("no_sabemos"))
    if nos:
        parts.append('<section class="mb-section">')
        head("Lo que todavía no sabemos")
        parts.append('<div class="mb-col"><ul class="mb-list">' + "".join(f"<li>{rich(n)}</li>" for n in nos) + "</ul></div>")
        parts.append("</section>")

    # Qué implica según tu perfil
    perf = model.get("perfiles") or {}
    if any(perf.get(k) for k, _ in PERFILES):
        parts.append('<section class="mb-section">')
        head("Qué implica según tu perfil")
        parts.append('<div class="mb-profiles">')
        for k, label in PERFILES:
            if perf.get(k):
                parts.append(f'<div class="mb-profile"><p class="mb-profile-label">{label}</p>'
                             f'<p class="mb-profile-text">{rich(perf[k])}</p></div>')
        parts.append("</div></section>")

    # Qué vigilar el mes que viene
    prox = [p for p in model.get("proximo_mes") or [] if isinstance(p, dict) and p.get("titulo")]
    if prox:
        parts.append('<section class="mb-section">')
        head("Qué vigilar el mes que viene")
        parts.append('<div class="mb-col"><div class="mb-persp">')
        for p in prox:
            parts.append(f'<div class="mb-persp-item"><p class="mb-persp-title">{rich(p["titulo"])}</p>'
                         f'<p class="mb-persp-text">{rich(p.get("contexto"))}</p></div>')
        parts.append("</div></div></section>")

    # Anexo — the register the whole report is built on
    if deals:
        parts.append('<section class="mb-section mb-annex">')
        head("Anexo · Registro de operaciones del mes")
        for label, rows in (("Mercado español", [d for d in deals if d.get("ambito") != "exterior"]),
                            ("Capital español fuera", [d for d in deals if d.get("ambito") == "exterior"])):
            if not rows:
                continue
            parts.append(f'<p class="mb-data-caption">{label}</p>')
            parts.append('<table class="mb-ops mb-ops--annex"><thead><tr><th>Operación</th><th>Sector</th>'
                         '<th>Tipo</th><th>Estado</th><th>Importe</th><th>Fecha</th></tr></thead><tbody>')
            for d in rows:
                url = safe_url(d.get("fuente_url"))
                name = plain(d.get("nombre"))
                cell = f'<a href="{plain(url)}" target="_blank" rel="noopener">{name}</a>' if url else name
                parts.append(f'<tr id="op-{d["_code"].lower()}"><td><span class="mb-ops-code">{d["_code"]}</span>{cell}</td><td>{plain(d.get("sector") or "—")}</td>'
                             f'<td>{plain(d.get("tipo") or "—")}</td><td>{ESTADOS.get(d.get("estado"), "—")}</td>'
                             f'<td>{importe_cell(d)}</td><td>{fecha_corta(d.get("fecha") or d.get("fecha_publicacion"))}</td></tr>')
            parts.append("</tbody></table>")
        parts.append("</section>")

    # Fuentes del contexto internacional (the deals' sources are linked in the annex)
    ef = [f for f in model.get("europa_fuentes") or [] if isinstance(f, dict) and f.get("titulo")]
    if ef:
        parts.append('<div class="mb-sources"><p class="mb-sources-label">Fuentes del contexto internacional</p>')
        for f in ef:
            url, fe = safe_url(f.get("url")), fecha_larga(f.get("fecha"))
            tit = plain(f["titulo"])
            if url:
                tit = f'<a href="{plain(url)}" target="_blank" rel="noopener">{tit}</a>'
            parts.append(f'<div class="mb-source-row"><span class="mb-source-medio">{plain(f.get("medio"))}</span>'
                         f'<span class="mb-source-titulo">{tit}{", " + fe if fe else ""}</span></div>')
        parts.append("</div>")

    parts.append('<div class="mb-footer"><span>Criterial Signals · Pro</span><span>criterialsignals.com</span></div>')
    parts.append("</div>")
    return "".join(parts)


# ── Save ───────────────────────────────────────────────────────────────────────

def edition_number():
    try:
        return len(rest_get("publications?type=eq.monthly&status=eq.published&select=id")) + 1
    except Exception:
        return 1


def save_draft(title, body_html, body_data, start, end):
    base, key = os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    payload = json.dumps({"type": "monthly", "title": title, "body_markdown": body_html,
                          "body_data": body_data, "status": "draft",
                          "period_start": start, "period_end": end}).encode("utf-8")
    req = urllib.request.Request(base + "publications", data=payload, headers={
        "apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
        "Prefer": "return=representation"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())[0]["id"]


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Brief Mensual v7")
    ap.add_argument("mes", nargs="?", help="YYYY-MM (default: the month before today)")
    ap.add_argument("pregunta", nargs="?", help="optional question of the month")
    ap.add_argument("--incluir-prueba", action="store_true")
    ap.add_argument("--datos")
    ap.add_argument("--modelo")
    ap.add_argument("--html")
    a = ap.parse_args()

    if a.mes:
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", a.mes):
            sys.exit(f"Invalid month '{a.mes}'. Expected YYYY-MM.")
        year, month = int(a.mes[:4]), int(a.mes[5:])
    else:
        t = date.today()
        year, month = prev_month(t.year, t.month)  # the Brief covers a closed month
    start, end = month_bounds(year, month)
    period_label = f"{MESES[month - 1]} de {year}"
    prev_label = MESES[prev_month(year, month)[1] - 1]

    if a.datos:
        inputs = json.load(io.open(a.datos, encoding="utf-8"))
    else:
        inputs = fetch_inputs(year, month, a.incluir_prueba)
    cifras = compute(inputs["deals"], inputs.get("prev_deals") or [])
    data, vig = build_model_data(inputs, cifras, a.pregunta)

    print(f"\nBrief Mensual · {period_label}")
    print(f"  Operaciones en España: {cifras['operaciones_espana']} "
          f"({cifras['con_importe_publico']} con importe) · fuera: {cifras['capital_espanol_fuera']}")
    print(f"  Weeklies del mes: {len(inputs['weeklies'])} · avisos a revisar: {len(vig)}")
    if not inputs["deals"]:
        sys.exit("  No hay operaciones en la base para ese mes. No se genera el Brief."
                 + ("" if a.incluir_prueba else " (¿datos de prueba? usa --incluir-prueba)"))

    if a.modelo:
        model = json.load(io.open(a.modelo, encoding="utf-8"))
    else:
        system, user = load_prompt()
        user = user.replace("{{period}}", period_label)
        user += ("\n\nIMPORTANTE: el mes está cerrado. Cubre " + period_label
                 + " y no incluyas hechos de meses posteriores.\n\n<DATOS>\n"
                 + json.dumps(data, ensure_ascii=False, indent=1) + "\n</DATOS>")
        print(f"  Generando con {MODEL} (effort {EFFORT}, {WEB_SEARCH_USES} búsquedas)...", flush=True)
        model = extract_json(call_model(system, user))

    numero = 1 if (a.datos or a.html) and not os.environ.get("SUPABASE_URL") else edition_number()
    body_html = render(model, inputs, cifras, vig, numero, period_label, prev_label)
    body_data = {"version": 7, "pregunta": model.get("pregunta"), "modelo": model,
                 "cifras": cifras, "operaciones": [{"codigo": d["_code"], "id": d.get("id")} for d in inputs["deals"]]}

    if a.html:
        io.open(a.html, "w", encoding="utf-8").write(body_html)
        print(f"  HTML escrito en {a.html} (no se ha guardado nada).")
        return

    title = f"Brief Mensual — {MESES[month - 1]} {year}"
    print(f"\n  Pregunta: {model.get('pregunta')}\n  Titular:  {model.get('titulo')}")
    if input("\n¿Guardar como borrador? (y/N): ").strip().lower() != "y":
        print("Cancelado. No se ha guardado nada.")
        return
    pub_id = save_draft(title, body_html, body_data, start, end)
    print(f"Guardado como borrador: {pub_id}\nRevísalo en el admin (Previsualizar) antes de publicar.")


if __name__ == "__main__":
    main()
