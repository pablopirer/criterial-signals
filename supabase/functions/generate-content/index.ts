/**
 * Edge Function: generate-content
 *
 * Generates 1 content variation (weekly or monthly) via Anthropic with web search.
 * Restricted to the admin email. Returns the variation for selection in the
 * admin panel — does NOT write to the database (admin.html calls admin-publications
 * to save after the user selects).
 *
 * Flow:
 *   1. Verify user JWT.
 *   2. Check email is the admin email.
 *   3. Parse type (weekly | monthly) from request body.
 *   4. Compute current period dates and label.
 *   5. Call Anthropic with web search and the matching prompt.
 *   6. For weekly: convert JSON output to pub-* HTML.
 *      For monthly: use HTML output directly.
 *   7. Return { variations: [html], type, title, period_start, period_end }.
 */

import { generateBrief } from "../_shared/anthropic.ts";
import { createServiceRoleClient } from "../_shared/supabase.ts";
import { weeklyPrompt, monthlyPrompt } from "../_shared/prompts.ts";
import { extractJsonObject } from "../_shared/json.ts";

const ADMIN_EMAIL = "pablopirer@gmail.com";
// max_uses reduced 5->3: the Weekly+map generation runs synchronously (the admin
// waits), so it's exposed to the Edge Function wall-clock limit. Fewer web
// searches keep generation under that ceiling (a 5-search run timed out at the
// gateway → "Error desconocido"). 3 searches still cite real, verifiable sources.
const WEB_SEARCH_TOOLS = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function computePeriod(type: "weekly" | "monthly"): {
  periodLabel: string;
  title: string;
  period_start: string;
  period_end: string;
  /** "Julio 2026" — fills {{mes_actual}} in the prompt, so the temporal-tag
      example tracks the real clock instead of a month frozen in the prompt text. */
  mesActual: string;
} {
  const now = new Date();
  const month = MONTHS_ES[now.getMonth()];
  const year = now.getFullYear();
  const mesActual = `${month.charAt(0).toUpperCase()}${month.slice(1)} ${year}`;

  if (type === "weekly") {
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - daysToMonday);

    const mondayLabel = `${monday.getDate()} de ${MONTHS_ES[monday.getMonth()]}`;
    const todayLabel = `${now.getDate()} de ${month} de ${year}`;

    return {
      periodLabel: `${mondayLabel} al ${todayLabel}`,
      title: `Weekly Signals — ${now.getDate()} de ${month} de ${year}`,
      period_start: fmtDate(monday),
      period_end: fmtDate(now),
      mesActual,
    };
  } else {
    return {
      periodLabel: `${month} de ${year}`,
      title: `Brief Mensual — ${month} ${year}`,
      period_start: `${year}-${pad(now.getMonth() + 1)}-01`,
      period_end: fmtDate(now),
      mesActual,
    };
  }
}

// ── Weekly JSON → HTML conversion ─────────────────────────────────────────────

interface WeeklySenal {
  tipo: string;
  badge_class: string;
  titulo: string;
  temporalidad: string;
  hecho: string;
  patron: string;
  implicacion: string;
}

interface WeeklyJson {
  titulo: string;
  period: string;
  apertura: string;
  senales: WeeklySenal[];
  operaciones: Array<{ nombre: string; tipo: string; sector: string; tesis: string }>;
  vigilar: Array<{ titulo: string; contexto: string }>;
  readthrough: { origination: string; financiacion: string; salidas: string };
  dato: { cifra: string; texto: string };
  mapa?: Record<string, unknown>;
  fuentes: Array<{ medio: string; titulo: string }>;
}

/**
 * UTF-8-safe base64 encode. The mapa JSON contains € and accented chars, which
 * plain btoa (Latin1-only) cannot handle. The encoded blob rides inside a
 * data-mapa attribute in the stored HTML and is decoded + rendered client-side
 * by hydratePubWidgets (criterial-shared.js). Base64 has no quotes/apostrophes,
 * so it survives archive.html's attribute-escaping round-trip untouched.
 */
function toBase64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function esc(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .split(/(<\/?strong>)/)
    .map((part) =>
      part.startsWith("<")
        ? part
        : part
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
    )
    .join("");
}

function weeklyJsonToHtml(d: WeeklyJson, numero: number): string {
  const badgeMap: Record<string, string> = {
    ma: "pub-badge-ma",
    buyout: "pub-badge-buyout",
    growth: "pub-badge-growth",
    salida: "pub-badge-salida",
    fund: "pub-badge-fund",
    deuda: "pub-badge-deuda",
    lmm: "pub-badge-lmm",
    opa: "pub-badge-opa",
    deeptech: "pub-badge-deeptech",
  };

  const parts: string[] = [];

  parts.push('<div class="pub-content">');

  // Header
  parts.push('<div class="pub-header-new">');
  parts.push('<div class="pub-brand-row">');
  parts.push('<span class="pub-brand-label">Criterial · Weekly Signals</span>');
  parts.push(`<span class="pub-brand-num">Nº ${numero} · ${esc(d.period)}</span>`);
  parts.push("</div>");
  parts.push(`<h1 class="pub-title-new">${esc(d.titulo)}</h1>`);
  parts.push(`<p class="pub-period-new">Semana del ${esc(d.period)}</p>`);
  parts.push("</div>");

  // Apertura
  parts.push('<div class="pub-section-new">');
  parts.push('<p class="pub-sec-label">Apertura</p>');
  parts.push(`<div class="pub-apertura-new"><p>${esc(d.apertura)}</p></div>`);
  parts.push("</div>");

  // Señales
  parts.push('<div class="pub-section-new">');
  parts.push('<p class="pub-sec-label">Señales de la semana</p>');
  for (const s of (d.senales ?? [])) {
    const bc = badgeMap[s.badge_class ?? "ma"] ?? "pub-badge-ma";
    parts.push('<div class="pub-signal-new">');
    parts.push('<div class="pub-signal-head">');
    parts.push(`<span class="pub-badge-new ${bc}">${esc(s.tipo)}</span>`);
    parts.push(`<span class="pub-signal-title">${esc(s.titulo)}</span>`);
    parts.push(`<span class="pub-time-tag">[${esc(s.temporalidad)}]</span>`);
    parts.push("</div>");
    parts.push('<div class="pub-signal-body">');
    parts.push(`<p class="pub-signal-fact">${esc(s.hecho)}</p>`);
    parts.push('<div class="pub-signal-rows">');
    parts.push('<div class="pub-signal-row">');
    parts.push('<span class="pub-signal-row-label">Patrón</span>');
    parts.push(`<span class="pub-signal-row-text">${esc(s.patron)}</span>`);
    parts.push("</div>");
    parts.push('<div class="pub-signal-row">');
    parts.push('<span class="pub-signal-row-label">Implicación</span>');
    parts.push(`<span class="pub-signal-row-text">${esc(s.implicacion)}</span>`);
    parts.push("</div>");
    parts.push("</div></div></div>");
  }
  parts.push("</div>");

  // Tabla de operaciones
  parts.push('<div class="pub-section-new">');
  parts.push('<p class="pub-sec-label">Operaciones de la semana</p>');
  parts.push(
    '<table class="pub-ops-table"><colgroup>' +
      '<col style="width:26%"><col style="width:18%"><col style="width:22%"><col style="width:34%">' +
      "</colgroup>",
  );
  parts.push(
    "<thead><tr><th>Operación</th><th>Tipo</th><th>Sector</th><th>Tesis</th></tr></thead><tbody>",
  );
  for (const op of (d.operaciones ?? [])) {
    parts.push(
      `<tr><td>${esc(op.nombre)}</td><td>${esc(op.tipo)}</td><td>${esc(op.sector)}</td><td>${esc(op.tesis)}</td></tr>`,
    );
  }
  parts.push("</tbody></table></div>");

  // Qué vigilar
  parts.push('<div class="pub-section-new">');
  parts.push('<p class="pub-sec-label">Qué vigilar</p>');
  parts.push('<div class="pub-vigilar-grid">');
  (d.vigilar ?? []).forEach((v, i) => {
    parts.push('<div class="pub-vigilar-card">');
    parts.push(`<p class="pub-vigilar-num">${String(i + 1).padStart(2, "0")}</p>`);
    parts.push(`<p class="pub-vigilar-title-new">${esc(v.titulo)}</p>`);
    parts.push(`<p class="pub-vigilar-sub-new">${esc(v.contexto)}</p>`);
    parts.push("</div>");
  });
  parts.push("</div></div>");

  // Investment read-through
  const rt = (d.readthrough ?? {}) as Record<string, string>;
  parts.push('<div class="pub-section-new">');
  parts.push('<p class="pub-sec-label">Investment read-through</p>');
  parts.push('<div class="pub-readthrough">');
  parts.push(
    '<div class="pub-readthrough-header"><span class="pub-readthrough-label">3 conclusiones accionables de la semana</span></div>',
  );
  parts.push('<div class="pub-readthrough-body">');
  for (const [cat, key] of [
    ["Origination", "origination"],
    ["Financiación", "financiacion"],
    ["Salidas", "salidas"],
  ]) {
    parts.push('<div class="pub-rt-item">');
    parts.push(`<p class="pub-rt-cat">${cat}</p>`);
    parts.push(`<p class="pub-rt-text">${esc(rt[key])}</p>`);
    parts.push("</div>");
  }
  parts.push("</div></div></div>");

  // Dato de contexto
  const dato = (d.dato ?? {}) as Record<string, string>;
  parts.push('<div class="pub-section-new">');
  parts.push('<p class="pub-sec-label">Dato de contexto</p>');
  parts.push('<div class="pub-dato-new">');
  parts.push(`<span class="pub-dato-num">${esc(dato.cifra)}</span>`);
  parts.push(`<p class="pub-dato-text">${esc(dato.texto)}</p>`);
  parts.push("</div></div>");

  // Mapa de posicionamiento (interactive — hydrated client-side from base64 data).
  // Defensive: only emit the placeholder when there are enough valid nodes; a bad
  // map must never break the brief (it simply won't render the section).
  const mapaNodos = (d.mapa as { nodos?: unknown[] } | undefined)?.nodos;
  if (d.mapa && Array.isArray(mapaNodos) && mapaNodos.length >= 3) {
    const encoded = toBase64Utf8(JSON.stringify(d.mapa));
    parts.push('<div class="pub-section-new">');
    parts.push('<p class="pub-sec-label">Mapa de posicionamiento</p>');
    parts.push(`<div class="pub-map" data-mapa="${encoded}"></div>`);
    parts.push("</div>");
  }

  // Fuentes
  parts.push('<div class="pub-sources-new">');
  parts.push('<p class="pub-sec-label">Fuentes</p>');
  for (const f of (d.fuentes ?? [])) {
    parts.push('<div class="pub-source-row">');
    parts.push(`<span class="pub-source-medio">${esc(f.medio)}</span>`);
    parts.push(`<span class="pub-source-titulo">${esc(f.titulo)}</span>`);
    parts.push("</div>");
  }
  parts.push("</div>");

  // Footer
  parts.push('<div class="pub-footer-new">');
  parts.push('<span class="pub-footer-text">Criterial Signals · Pro</span>');
  parts.push('<span class="pub-footer-text">criterialsignals.com</span>');
  parts.push("</div>");

  parts.push("</div>");
  return parts.join("");
}

/**
 * Reduced "open" projection of the same Weekly JSON, for the free public
 * edition (signals.html). It intentionally shows only the "what happened"
 * layer — apertura + señales (fact only) + the positioning map — and OMITS the
 * Pro depth (patrón, implicación, operations table, investment read-through,
 * dato, fuentes). That omission IS the Free↔Pro value gap. Derived from the
 * same parsed object as the full version, so the two never diverge.
 */
function weeklyJsonToPublicHtml(d: WeeklyJson, numero: number): string {
  const badgeMap: Record<string, string> = {
    ma: "pub-badge-ma",
    buyout: "pub-badge-buyout",
    growth: "pub-badge-growth",
    salida: "pub-badge-salida",
    fund: "pub-badge-fund",
    deuda: "pub-badge-deuda",
    lmm: "pub-badge-lmm",
    opa: "pub-badge-opa",
    deeptech: "pub-badge-deeptech",
  };

  const parts: string[] = [];
  parts.push('<div class="pub-content">');

  // Header
  parts.push('<div class="pub-header-new">');
  parts.push('<div class="pub-brand-row">');
  parts.push('<span class="pub-brand-label">Criterial · Signals</span>');
  parts.push(`<span class="pub-brand-num">Nº ${numero} · ${esc(d.period)}</span>`);
  parts.push("</div>");
  parts.push(`<h1 class="pub-title-new">${esc(d.titulo)}</h1>`);
  parts.push(`<p class="pub-period-new">Semana del ${esc(d.period)}</p>`);
  parts.push("</div>");

  // Apertura
  parts.push('<div class="pub-section-new">');
  parts.push('<p class="pub-sec-label">Apertura</p>');
  parts.push(`<div class="pub-apertura-new"><p>${esc(d.apertura)}</p></div>`);
  parts.push("</div>");

  // Señales — fact only (no patrón/implicación: that depth is Pro-only)
  parts.push('<div class="pub-section-new">');
  parts.push('<p class="pub-sec-label">Señales de la semana</p>');
  for (const s of (d.senales ?? [])) {
    const bc = badgeMap[s.badge_class ?? "ma"] ?? "pub-badge-ma";
    parts.push('<div class="pub-signal-new">');
    parts.push('<div class="pub-signal-head">');
    parts.push(`<span class="pub-badge-new ${bc}">${esc(s.tipo)}</span>`);
    parts.push(`<span class="pub-signal-title">${esc(s.titulo)}</span>`);
    parts.push(`<span class="pub-time-tag">[${esc(s.temporalidad)}]</span>`);
    parts.push("</div>");
    parts.push('<div class="pub-signal-body">');
    parts.push(`<p class="pub-signal-fact">${esc(s.hecho)}</p>`);
    parts.push("</div></div>");
  }
  parts.push("</div>");

  // Mapa de posicionamiento (interactive — same base64 placeholder as the full
  // version; the map is part of the free "what happened" layer).
  const mapaNodos = (d.mapa as { nodos?: unknown[] } | undefined)?.nodos;
  if (d.mapa && Array.isArray(mapaNodos) && mapaNodos.length >= 3) {
    const encoded = toBase64Utf8(JSON.stringify(d.mapa));
    parts.push('<div class="pub-section-new">');
    parts.push('<p class="pub-sec-label">Mapa de posicionamiento</p>');
    parts.push(`<div class="pub-map" data-mapa="${encoded}"></div>`);
    parts.push("</div>");
  }

  // Footer
  parts.push('<div class="pub-footer-new">');
  parts.push('<span class="pub-footer-text">Criterial Signals · Edición abierta</span>');
  parts.push('<span class="pub-footer-text">criterialsignals.com</span>');
  parts.push("</div>");

  parts.push("</div>");
  return parts.join("");
}

// ── Monthly JSON → HTML conversion (v5 — "El Informe": editorial report) ───────

interface MonthlyOp {
  nombre: string;
  sector: string;
  tipo?: string;
  importe?: string;
  n_importe?: number;
  fuente?: string;
}

interface MonthlyJson {
  titulo: string;
  dek?: string;
  period: string;
  resumen?: string[] | string;
  /** One punchy line for the design pull-quote. */
  pullquote?: string;
  /** Developed thesis as an array of paragraphs (string accepted as fallback). */
  tesis: string[] | string;
  /** Macro backdrop of the month, 1-2 paragraphs. */
  contexto?: string[] | string;
  /** Cited deal table — the spine the data panel is derived from. */
  operaciones?: MonthlyOp[];
  /** Optional, sourced macro aggregates (extra stat callouts). */
  macro?: Array<{ label: string; valor: string; n?: number; fuente?: string }>;
  sectores?: Array<{ nombre: string; cuerpo: string[] | string }>;
  mapa?: Record<string, unknown>;
  operacion?: {
    nombre: string;
    sector?: string;
    datos?: Array<{ label: string; valor: string }>;
    analisis: string[] | string;
  };
  perspectiva?: Array<{ titulo: string; contexto: string }>;
  fuentes?: Array<{ medio: string; titulo: string }>;
}

/** Format an integer number of € millions with es-ES thousands separators. */
function fmtMEur(n: number): string {
  const s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${s} M€`;
}

function asParagraphs(v: string[] | string | undefined): string[] {
  if (Array.isArray(v)) return v.filter((p) => typeof p === "string" && p.trim());
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

function monthlyJsonToHtml(d: MonthlyJson, numero: number): string {
  const parts: string[] = [];
  let sec = 0;
  const num = () => String(++sec).padStart(2, "0");
  const head = (t: string) =>
    parts.push(
      `<div class="mb-sec-head"><span class="mb-sec-num">${num()}</span><h2 class="mb-sec-title">${t}</h2></div>`,
    );
  const proseP = (v: string[] | string | undefined) =>
    asParagraphs(v).map((p) => `<p>${esc(p)}</p>`).join("");

  parts.push('<div class="pub-content mb-report">');

  // Masthead
  parts.push('<div class="mb-masthead">');
  parts.push('<div class="mb-brand-row">');
  parts.push('<span class="mb-kicker">Criterial · Brief Mensual</span>');
  parts.push(`<span class="mb-num">Nº ${numero} · ${esc(d.period)}</span>`);
  parts.push("</div>");
  parts.push(`<h1 class="mb-title">${esc(d.titulo)}</h1>`);
  if (d.dek) parts.push(`<p class="mb-dek">${esc(d.dek)}</p>`);
  parts.push('<p class="mb-byline">Un informe de Criterial · Solo Pro</p>');
  parts.push("</div>");

  // Resumen ejecutivo
  const resumen = asParagraphs(d.resumen);
  if (resumen.length) {
    parts.push('<div class="mb-summary">');
    parts.push('<p class="mb-summary-label">Resumen ejecutivo</p>');
    parts.push('<ul class="mb-summary-list">');
    for (const r of resumen) parts.push(`<li>${esc(r)}</li>`);
    parts.push("</ul></div>");
  }

  // 01 · Tesis del mes — lead prose (drop cap) + pull-quote after the first para
  parts.push('<section class="mb-section">');
  head("Tesis del mes");
  parts.push('<div class="mb-col">');
  const tp = asParagraphs(d.tesis);
  if (tp.length) {
    parts.push(`<div class="mb-prose mb-prose--lead"><p>${esc(tp[0])}</p></div>`);
  }
  if (d.pullquote) parts.push(`<div class="mb-quote">${esc(d.pullquote)}</div>`);
  if (tp.length > 1) {
    parts.push(`<div class="mb-prose">${tp.slice(1).map((p) => `<p>${esc(p)}</p>`).join("")}</div>`);
  }
  parts.push("</div></section>");

  // Contexto de mercado — macro backdrop (prose)
  const ctx = asParagraphs(d.contexto);
  if (ctx.length) {
    parts.push('<section class="mb-section">');
    head("Contexto de mercado");
    parts.push(`<div class="mb-col"><div class="mb-prose">${proseP(ctx)}</div></div>`);
    parts.push("</section>");
  }

  // El mes en datos — framed panel, DERIVED from the cited deal table
  const ops = (d.operaciones ?? []).filter((o) => o && o.nombre && o.sector);
  if (ops.length) {
    const bySector = new Map<string, number>();
    for (const o of ops) bySector.set(o.sector, (bySector.get(o.sector) ?? 0) + 1);
    const sectorBars = [...bySector.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([sector, count]) => ({ label: sector, valor: String(count), n: count }));
    const withAmt = ops.filter((o) => isFinite(Number(o.n_importe)) && Number(o.n_importe) > 0);
    const volume = withAmt.reduce((s, o) => s + Number(o.n_importe), 0);
    const avgTicket = withAmt.length ? volume / withAmt.length : null;
    const macro = (d.macro ?? []).filter((m) => m && m.label && m.valor && m.fuente);

    parts.push('<section class="mb-section">');
    head("El mes en datos");
    parts.push('<div class="mb-data">');

    // Stat callouts (computed — always present)
    parts.push('<div class="mb-stats">');
    const stat = (val: string, label: string, src?: string) => {
      parts.push('<div class="mb-stat">');
      parts.push(`<span class="mb-stat-val">${esc(val)}</span>`);
      parts.push(`<span class="mb-stat-label">${esc(label)}</span>`);
      if (src) parts.push(`<span class="mb-stat-src">${esc(src)}</span>`);
      parts.push("</div>");
    };
    stat(String(ops.length), "Operaciones seguidas");
    if (volume > 0) stat(fmtMEur(volume), "Volumen divulgado");
    if (avgTicket !== null) stat(fmtMEur(avgTicket), "Ticket medio");
    if (sectorBars.length) stat(sectorBars[0].label, "Sector más activo");
    for (const m of macro) stat(m.valor, m.label, m.fuente);
    parts.push("</div>");

    // Sector split bars (derived; hydrated by buildMetrics — collective provenance)
    if (sectorBars.length >= 2) {
      const encoded = toBase64Utf8(JSON.stringify(sectorBars));
      parts.push('<p class="mb-data-caption">Operaciones por sector</p>');
      parts.push(`<div class="pub-metrics" data-metrics="${encoded}"></div>`);
    }
    parts.push(`<p class="mb-data-note">Cálculo de Criterial sobre las ${ops.length} operaciones del mes recogidas abajo. Cada operación, con su fuente.</p>`);
    parts.push("</div></section>");

    // Operaciones del mes — the cited table (full-width exhibit)
    parts.push('<section class="mb-section">');
    head("Operaciones del mes");
    parts.push('<table class="mb-ops"><thead><tr><th>Operación</th><th>Sector</th><th>Tipo</th><th>Importe</th><th>Fuente</th></tr></thead><tbody>');
    for (const o of ops) {
      parts.push(
        `<tr><td>${esc(o.nombre)}</td><td>${esc(o.sector)}</td><td>${esc(o.tipo ?? "")}</td><td>${esc(o.importe ?? "n.d.")}</td><td>${esc(o.fuente ?? "")}</td></tr>`,
      );
    }
    parts.push("</tbody></table></section>");
  }

  // Rotación de capital — sector prose (2-3 paragraphs each)
  const sectores = (d.sectores ?? []).filter((s) => s && s.nombre && asParagraphs(s.cuerpo).length);
  if (sectores.length) {
    parts.push('<section class="mb-section">');
    head("Rotación de capital");
    parts.push('<div class="mb-col">');
    for (const s of sectores) {
      parts.push('<div class="mb-sector">');
      parts.push(`<h3 class="mb-sector-name">${esc(s.nombre)}</h3>`);
      parts.push(`<div class="mb-prose">${proseP(s.cuerpo)}</div>`);
      parts.push("</div>");
    }
    parts.push("</div></section>");
  }

  // Mapa del mes — temporal tracker (full-width exhibit)
  const mapaNodos = (d.mapa as { nodos?: unknown[] } | undefined)?.nodos;
  if (d.mapa && Array.isArray(mapaNodos) && mapaNodos.length >= 3) {
    const encoded = toBase64Utf8(JSON.stringify(d.mapa));
    parts.push('<section class="mb-section mb-section-map">');
    head("Mapa del mes");
    parts.push('<p class="mb-sec-lede">Posición de cada sector y su movimiento respecto al mes anterior. Usa el interruptor para ver dónde estaba hace un mes.</p>');
    parts.push(`<div class="pub-map" data-mapa="${encoded}"></div>`);
    parts.push("</section>");
  }

  // Operación del mes — deep-dive (mini data-table + multi-paragraph analysis)
  const op = d.operacion;
  if (op && op.nombre) {
    parts.push('<section class="mb-section">');
    head("Operación del mes");
    parts.push('<div class="mb-op">');
    parts.push('<div class="mb-op-head">');
    parts.push(`<span class="mb-op-name">${esc(op.nombre)}</span>`);
    if (op.sector) parts.push(`<span class="mb-op-sector">${esc(op.sector)}</span>`);
    parts.push("</div>");
    const datos = (op.datos ?? []).filter((x) => x && x.label && x.valor);
    if (datos.length) {
      parts.push('<div class="mb-op-data">');
      for (const x of datos) {
        parts.push('<div class="mb-op-cell">');
        parts.push(`<span class="mb-op-cell-label">${esc(x.label)}</span>`);
        parts.push(`<span class="mb-op-cell-val">${esc(x.valor)}</span>`);
        parts.push("</div>");
      }
      parts.push("</div>");
    }
    parts.push(`<div class="mb-prose">${proseP(op.analisis)}</div>`);
    parts.push("</div></section>");
  }

  // Perspectiva — house view / forward
  const persp = (d.perspectiva ?? []).filter((p) => p && p.titulo);
  if (persp.length) {
    parts.push('<section class="mb-section">');
    head("Perspectiva");
    parts.push('<div class="mb-col"><div class="mb-persp">');
    for (const p of persp) {
      parts.push('<div class="mb-persp-item">');
      parts.push(`<p class="mb-persp-title">${esc(p.titulo)}</p>`);
      parts.push(`<p class="mb-persp-text">${esc(p.contexto)}</p>`);
      parts.push("</div>");
    }
    parts.push("</div></div></section>");
  }

  // Fuentes
  parts.push('<div class="mb-sources">');
  parts.push('<p class="mb-sources-label">Fuentes</p>');
  for (const f of (d.fuentes ?? [])) {
    parts.push('<div class="mb-source-row">');
    parts.push(`<span class="mb-source-medio">${esc(f.medio)}</span>`);
    parts.push(`<span class="mb-source-titulo">${esc(f.titulo)}</span>`);
    parts.push("</div>");
  }
  parts.push("</div>");

  // Footer
  parts.push('<div class="mb-footer">');
  parts.push('<span>Criterial Signals · Pro</span>');
  parts.push('<span>criterialsignals.com</span>');
  parts.push("</div>");

  parts.push("</div>");
  return parts.join("");
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing authorization header" }, 401);
  }
  const jwt = authHeader.slice(7);

  const supabase = createServiceRoleClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !user) {
    return jsonResponse({ error: "Invalid or expired token" }, 401);
  }
  if (user.email !== ADMIN_EMAIL) {
    return jsonResponse({ error: "Acceso restringido" }, 403);
  }

  let body: { type?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const type = body.type;
  if (type !== "weekly" && type !== "monthly") {
    return jsonResponse({ error: "type must be 'weekly' or 'monthly'" }, 400);
  }

  const { periodLabel, title, period_start, period_end, mesActual } = computePeriod(type);
  const prompt = type === "weekly" ? weeklyPrompt : monthlyPrompt;
  const userWithPeriod = prompt.user.replace(/\{\{period\}\}/g, periodLabel);
  // The month/period examples in the schema used to be literal months baked into
  // the prompt, so they went stale the moment the calendar moved on — and a literal
  // in a schema example is what the model copies (every Weekly once rendered "Nº 1"
  // for exactly that reason). Inject the real ones.
  const systemWithMonth = prompt.system
    .replace(/\{\{mes_actual\}\}/g, mesActual)
    .replace(/\{\{period\}\}/g, periodLabel);

  // Edition number is assigned server-side — the model can't know the sequence
  // (it used to echo the "1" from the prompt schema, so every edition rendered
  // "Nº 1"). It is the count of already-published rows of THIS type + 1, i.e.
  // the next edition. Falls back to Nº 1 only if the count query fails.
  let editionNumber = 1;
  {
    const { count, error: countErr } = await supabase
      .from("publications")
      .select("*", { count: "exact", head: true })
      .eq("type", type)
      .eq("status", "published");
    if (countErr) {
      console.error(`${type} count failed, defaulting to Nº 1:`, countErr);
    } else {
      editionNumber = (count ?? 0) + 1;
    }
  }

  try {
    const result = await generateBrief({
      interestType: "",
      prompt: { system: systemWithMonth, user: userWithPeriod },
      // 8000 was tuned for the pre-map Weekly, which already ran close to the
      // limit; adding the mapa block pushed output past 8000 and truncated the
      // JSON mid-object (→ "no parseable" 502). 12000 gives the map headroom.
      maxTokens: 16000,
      tools: WEB_SEARCH_TOOLS,
    });

    let html: string;
    let publicHtml: string | null = null;
    if (type === "weekly") {
      let parsed: WeeklyJson;
      try {
        parsed = JSON.parse(extractJsonObject(result.text)) as WeeklyJson;
      } catch (parseErr) {
        console.error("Weekly JSON parse failed:", parseErr);
        console.error("Raw model output (first 800 chars):", result.text.slice(0, 800));
        return jsonResponse(
          {
            error:
              "El modelo devolvió contenido no parseable como JSON. Vuelve a generar el Weekly.",
          },
          502,
        );
      }
      // Two projections of the same generation: full (Pro) + reduced (Free).
      html = weeklyJsonToHtml(parsed, editionNumber);
      publicHtml = weeklyJsonToPublicHtml(parsed, editionNumber);
    } else {
      // Monthly is now JSON too (since v4) — parse safely like the Weekly and
      // convert to pub-* HTML. publicHtml stays null: the Brief is Pro-only.
      let parsed: MonthlyJson;
      try {
        parsed = JSON.parse(extractJsonObject(result.text)) as MonthlyJson;
      } catch (parseErr) {
        console.error("Monthly JSON parse failed:", parseErr);
        console.error("Raw model output (first 800 chars):", result.text.slice(0, 800));
        return jsonResponse(
          {
            error:
              "El modelo devolvió contenido no parseable como JSON. Vuelve a generar el Brief Mensual.",
          },
          502,
        );
      }
      html = monthlyJsonToHtml(parsed, editionNumber);
    }

    return jsonResponse(
      { variations: [html], public_html: publicHtml, type, title, period_start, period_end },
      200,
    );
  } catch (err) {
    console.error("Anthropic generation failed:", err);
    return jsonResponse({ error: "Content generation failed" }, 500);
  }
});
