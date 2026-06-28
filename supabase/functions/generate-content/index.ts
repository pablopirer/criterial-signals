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

const ADMIN_EMAIL = "pablopirer@gmail.com";
const WEB_SEARCH_TOOLS = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];

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
} {
  const now = new Date();
  const month = MONTHS_ES[now.getMonth()];
  const year = now.getFullYear();

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
    };
  } else {
    return {
      periodLabel: `${month} de ${year}`,
      title: `Monthly Brief — ${month} ${year}`,
      period_start: `${year}-${pad(now.getMonth() + 1)}-01`,
      period_end: fmtDate(now),
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
  numero: number | string;
  titulo: string;
  period: string;
  apertura: string;
  senales: WeeklySenal[];
  operaciones: Array<{ nombre: string; tipo: string; sector: string; tesis: string }>;
  vigilar: Array<{ titulo: string; contexto: string }>;
  readthrough: { origination: string; financiacion: string; salidas: string };
  dato: { cifra: string; texto: string };
  fuentes: Array<{ medio: string; titulo: string }>;
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

/**
 * Extract a JSON object from model output. With web search enabled the model
 * frequently wraps the JSON in conversational prose and/or a ```json fence
 * (e.g. "Con los datos recopilados, genero ahora el brief...") despite the
 * prompt asking for JSON only. Naively stripping the fences leaves the prose
 * and breaks JSON.parse. Prefer a fenced block if present, then bound to the
 * outermost { ... }.
 */
function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new SyntaxError("No JSON object found in model output");
  }
  return body.slice(start, end + 1);
}

function weeklyJsonToHtml(rawText: string): string {
  // Throws if the model output is not valid JSON. The caller catches this and
  // returns a clean error so the admin can regenerate — never persisting or
  // displaying raw JSON, which the model occasionally emits with invalid tokens
  // (e.g. `"contexto">` instead of `"contexto":`).
  const d = JSON.parse(extractJsonObject(rawText)) as WeeklyJson;

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
  parts.push(`<span class="pub-brand-num">Nº ${esc(d.numero)} · ${esc(d.period)}</span>`);
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

  const { periodLabel, title, period_start, period_end } = computePeriod(type);
  const prompt = type === "weekly" ? weeklyPrompt : monthlyPrompt;
  const userWithPeriod = prompt.user.replace(/\{\{period\}\}/g, periodLabel);

  try {
    const result = await generateBrief({
      interestType: "",
      prompt: { system: prompt.system, user: userWithPeriod },
      maxTokens: 8000,
      tools: WEB_SEARCH_TOOLS,
    });

    let html: string;
    if (type === "weekly") {
      try {
        html = weeklyJsonToHtml(result.text);
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
    } else {
      html = result.text;
    }

    return jsonResponse(
      { variations: [html], type, title, period_start, period_end },
      200,
    );
  } catch (err) {
    console.error("Anthropic generation failed:", err);
    return jsonResponse({ error: "Content generation failed" }, 500);
  }
});
