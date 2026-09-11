/**
 * Edge Function: sample-request
 *
 * Receives a POST from the public sample form, upserts the lead, registers a
 * sample_request, calls Anthropic to generate a structured brief, stores it in
 * publications (as JSON in body_data, plus body_markdown for archive
 * back-compat), and emails the lead an "envelope" linking to the interactive
 * muestra web (muestra.html?token=<public_token>).
 *
 * Flow:
 *   1. Verify the shared-secret header.
 *   2. Validate the payload.
 *   3. Upsert the lead by lower(email).
 *   4. Insert a sample_request row.
 *   5. Call Anthropic to generate the brief JSON.
 *   6. Parse JSON, persist publication (body_data + body_markdown), capture
 *      its public_token, link sample_requests.sample_publication_id.
 *   7. Email the envelope with the muestra URL.
 *
 * Note on the prompt: it lives inline (Supabase only ships the function's own
 * directory at deploy time). The canonical copy is /prompts/sample-brief.es.md
 * — KEEP THEM IN SYNC.
 */

import { createServiceRoleClient } from "../_shared/supabase.ts";
import { generateBrief } from "../_shared/anthropic.ts";
import { sendSampleEnvelope, sendEmail } from "../_shared/resend.ts";
import { extractJsonObject } from "../_shared/json.ts";
import { upsertLeadByEmail } from "../_shared/leads.ts";
import type {
  SampleRequestErrorResponse,
  SampleRequestPayload,
  SampleRequestResponse,
} from "./types.ts";

// Supabase Edge runtime global: keeps a background task alive after the HTTP
// response is returned (and after the client disconnects). Essential here —
// the form is fire-and-forget and the web-searched generation takes much
// longer than the request itself.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const SITE_URL = "https://criterialsignals.com";
const ALERT_EMAIL = "criterialam@gmail.com";

// Server-side web search so the brief, the positioning map and the sources are
// grounded in real, recent data. Same tool the Weekly/Monthly generation uses.
const WEB_SEARCH_TOOLS = [
  { type: "web_search_20250305", name: "web_search", max_uses: 5 },
];

/** interest_type code → human label, aligned with the Sample redesign topics. */
const TEMATICA_LABELS: Record<string, string> = {
  m_and_a: "M&A",
  pe_vc: "Private equity y venture capital",
  deuda_privada: "Deuda privada",
  liquidez: "Eventos de liquidez",
  general: "Mercado privado español",
};

/** sector code → human label. Optional dimension. */
const SECTOR_LABELS: Record<string, string> = {
  infra_digital: "Infraestructura digital",
  sanidad: "Sanidad privada",
  industrial: "Industrial y servicios B2B",
  consumo: "Consumo y marca",
  energia: "Energía y transición",
  transversal: "Transversal",
};

function tematicaLabel(code: string | null | undefined): string {
  if (!code) return TEMATICA_LABELS.general;
  return TEMATICA_LABELS[code] ?? code;
}

function sectorLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return SECTOR_LABELS[code] ?? code;
}

/**
 * Inline copy of /prompts/sample-brief.es.md.
 * Returns ONLY valid JSON for the structured web brief (no map yet — Phase 2).
 */
const SAMPLE_BRIEF_PROMPT = {
  system:
    "Eres el redactor analítico de Criterial., una firma independiente de " +
    "inteligencia del mercado español de capital privado. Produces piezas " +
    "para profesionales: inversores, analistas, asesores M&A, family offices y directivos.\n\n" +
    "Estilo editorial obligatorio:\n" +
    "- Tono sobrio, analítico y directo. Sin entusiasmo comercial ni lenguaje de marketing.\n" +
    "- Frases completas con densidad informativa real. Nada de bullets vacíos.\n" +
    "- Cada señal tiene una tesis clara, un argumento que la sostiene y una implicación.\n" +
    "- Usa cifras, referencias temporales y actores concretos cuando los conozcas.\n" +
    "- Foco exclusivo en el mercado español. No incluir Portugal ni mercado ibérico. No incluir real estate.\n\n" +
    "Devuelve SOLO JSON válido, sin markdown, sin texto adicional, con esta forma:\n" +
    "{\n" +
    "  \"titulo\": \"título directo y específico del brief\",\n" +
    "  \"tesis\": \"una frase que resume la tesis principal\",\n" +
    "  \"tags\": [\"tag1\", \"tag2\", \"tag3\"],\n" +
    "  \"snapshot\": \"párrafo de 3-4 frases analíticas con dato cuantitativo si es posible\",\n" +
    "  \"stats\": [\n" +
    "    { \"label\": \"etiqueta corta\", \"valor\": \"cifra o estado breve\" }\n" +
    "  ],\n" +
    "  \"signals\": [\n" +
    "    { \"titulo\": \"título de la señal\", \"cuerpo\": \"2-3 frases: tesis + argumento + implicación.\", \"momentum\": \"creciente|estable|enfriandose\" }\n" +
    "  ],\n" +
    "  \"watch\": [\n" +
    "    { \"titulo\": \"actor o evento a vigilar\", \"cuerpo\": \"1-2 frases sobre por qué importa.\" }\n" +
    "  ],\n" +
    "  \"mapa\": {\n" +
    "    \"tipo\": \"posicionamiento\",\n" +
    "    \"eje_x\": \"etiqueta del eje horizontal (p.ej. 'Actividad')\",\n" +
    "    \"eje_y\": \"etiqueta del eje vertical (p.ej. 'Valoración' o 'Atractivo')\",\n" +
    "    \"cuadrantes\": { \"tr\": \"sup-dcha (2-3 palabras)\", \"br\": \"inf-dcha\", \"tl\": \"sup-izq\", \"bl\": \"inf-izq\" },\n" +
    "    \"nodos\": [\n" +
    "      { \"id\": \"abrev_unica\", \"label\": \"1-2 palabras\", \"x\": 0.8, \"y\": 0.7, \"x2\": 0.85, \"y2\": 0.75, \"size\": 2, \"momentum\": \"creciente|estable|enfriandose\", \"cuerpo\": \"1-2 frases con cifras o actores concretos.\", \"chips\": [\"actor o tipo\"], \"fuente\": \"Medio · fecha\" }\n" +
    "    ]\n" +
    "  },\n" +
    "  \"fuentes\": [\n" +
    "    { \"titulo\": \"titular de la fuente\", \"medio\": \"medio o publicación\", \"fecha\": \"mes año\", \"url\": \"https://...\" }\n" +
    "  ]\n" +
    "}\n\n" +
    "Reglas de cantidad: 3-4 en stats, 3-4 en signals, 2-3 en watch, 4-6 nodos en mapa, 3-5 fuentes. " +
    "El campo momentum solo admite: creciente, estable, enfriandose.\n\n" +
    "El 'mapa' es un mapa de POSICIONAMIENTO: cada nodo es un sector o segmento situado en dos ejes. " +
    "'x' e 'y' van de 0 a 1 (0 = bajo/poco; 1 = alto/mucho) y deben reflejar la posición real con criterio analítico. " +
    "Elige ejes con significado para la temática (p.ej. actividad vs valoración, actividad vs coste, madurez vs retorno) " +
    "y nombra los cuatro cuadrantes de forma intuitiva. 'x2' e 'y2' (0-1) son la posición ESPERADA en los próximos meses " +
    "(trayectoria). 'size' es 1-3 (volumen relativo). 'cuerpo' explica la posición; 'chips' son 1-3 actores reales; " +
    "'fuente' es una etiqueta breve. Usa nombres reales (gestoras, fondos, compañías).\n\n" +
    "Tienes acceso a búsqueda web: BUSCA noticias y datos recientes y reales del mercado español de capital privado " +
    "antes de redactar, y apóyate en ellos. Las 'fuentes' deben ser reales y verificables (medios económicos, notas de " +
    "operaciones), con su URL real cuando exista. NO inventes URLs ni fuentes.",
  user:
    "Genera un sample brief sobre: {{interest_type}}.\n\n" +
    "Fecha de referencia: {{fecha_referencia}}. Razona desde ese punto temporal. " +
    "Si usas cifras o referencias a períodos concretos, asegúrate de que son " +
    "coherentes con {{fecha_referencia}} como presente. Cuando una estimación sea " +
    "orientativa, indícalo con 'aproximadamente' o 'en torno a'.",
};

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * "julio de 2026" — fills {{fecha_referencia}} at call time. This used to be a
 * literal month written into the prompt, which meant every brief generated after
 * that month reasoned from a stale present.
 */
function fechaReferencia(): string {
  const now = new Date();
  return `${MONTHS_ES[now.getMonth()]} de ${now.getFullYear()}`;
}

interface BriefContent {
  titulo: string;
  tesis: string;
  tags: string[];
  snapshot: string;
  stats: Array<{ label: string; valor: string }>;
  signals: Array<{ titulo: string; cuerpo: string; momentum?: string }>;
  watch: Array<{ titulo: string; cuerpo: string }>;
  /** Positioning map (Phase 3). Stored as-is; muestra.html validates it. */
  mapa?: Record<string, unknown>;
  /** Real, web-searched sources. Stored as-is; muestra.html renders them. */
  fuentes?: unknown[];
}

function jsonResponse(
  body: SampleRequestResponse | SampleRequestErrorResponse,
  status: number,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers":
        "content-type, x-criterial-signal, authorization",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

function validatePayload(
  payload: unknown,
): { email: string; data: SampleRequestPayload } | { error: string } {
  if (!payload || typeof payload !== "object") {
    return { error: "Body must be a JSON object" };
  }

  const p = payload as SampleRequestPayload;
  const email = (p.email ?? "").trim().toLowerCase();

  if (!email) {
    return { error: "Field 'email' is required" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Field 'email' is not a valid email address" };
  }

  return { email, data: { ...p, email } };
}

/** Build the markdown-ish body kept for archive (back-compat) rendering. */
function buildBodyMarkdown(b: BriefContent): string {
  return (
    `## Resumen ejecutivo\n\n${b.snapshot}\n\n` +
    `## Señales\n\n` +
    b.signals
      .map((s, i) =>
        `**${String(i + 1).padStart(2, "0")}. ${s.titulo}**\n\n${s.cuerpo}`
      )
      .join("\n\n") +
    `\n\n## Qué vigilar\n\n` +
    b.watch.map((w) => `**${w.titulo}**\n\n${w.cuerpo}`).join("\n\n")
  );
}

/**
 * Heavy work: generate the brief (with web search), persist the publication,
 * and email the envelope. Runs in the background via EdgeRuntime.waitUntil so
 * it completes even after the client has disconnected. All failures are caught
 * and (where relevant) alerted; this never throws.
 */
async function generateAndDeliver(opts: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  requestId: string;
  email: string;
  fullName: string;
  tematica: string;
  sector: string | null;
}): Promise<void> {
  const { supabase, requestId, email, fullName, tematica, sector } = opts;
  const interestForPrompt = sector ? `${tematica} · sector: ${sector}` : tematica;

  let briefText: string;
  try {
    const result = await generateBrief({
      interestType: interestForPrompt,
      prompt: {
        system: SAMPLE_BRIEF_PROMPT.system,
        // generateBrief only substitutes {{interest_type}}, so the reference date
        // is injected here.
        user: SAMPLE_BRIEF_PROMPT.user.replace(/\{\{fecha_referencia\}\}/g, fechaReferencia()),
      },
      maxTokens: 8000,
      tools: WEB_SEARCH_TOOLS,
    });
    briefText = result.text;
    console.log(
      `Generated brief for request ${requestId}: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens (${result.model})`,
    );
  } catch (err) {
    console.error("Anthropic generation failed", err);
    await supabase
      .from("sample_requests")
      .update({ status: "generation_failed" })
      .eq("id", requestId);
    // Must be awaited: this runs inside EdgeRuntime.waitUntil, and an
    // un-awaited send is killed when the isolate tears down (the reason the
    // 14-jun generation_failed alerts never arrived).
    await sendEmail({
      to: ALERT_EMAIL,
      subject: `[Criterial] generation_failed — Anthropic error`,
      text: `generation_failed\nLead: ${email}\nTemática: ${tematica}\nSector: ${sector ?? "—"}\nRequest ID: ${requestId}\nError: ${String(err)}`,
    }).catch((e) => console.error("Alert email failed", e));
    return;
  }

  let brief: BriefContent;
  try {
    brief = JSON.parse(extractJsonObject(briefText)) as BriefContent;
  } catch (err) {
    console.error("Failed to parse brief JSON", err);
    console.error("Raw briefText was:", briefText);
    await supabase
      .from("sample_requests")
      .update({ status: "generation_failed" })
      .eq("id", requestId);
    // Awaited for the same reason as the Anthropic-error alert above.
    await sendEmail({
      to: ALERT_EMAIL,
      subject: `[Criterial] generation_failed — JSON parse error`,
      text: `generation_failed (JSON parse)\nLead: ${email}\nTemática: ${tematica}\nRequest ID: ${requestId}\nError: ${String(err)}`,
      html: `<p>Anthropic respondió pero el JSON no era válido.</p>
<ul><li><strong>Lead:</strong> ${email}</li><li><strong>Temática:</strong> ${tematica}</li><li><strong>Request ID:</strong> ${requestId}</li><li><strong>Error:</strong> ${String(err)}</li></ul>
<pre style="font-size:12px;background:#f4f4f4;padding:8px">${briefText.slice(0, 2000)}</pre>`,
    }).catch((e) => console.error("Alert email failed", e));
    return;
  }

  const bodyData = { version: 1, tematica, sector, ...brief };

  const { data: pubRows, error: pubError } = await supabase
    .from("publications")
    .insert({
      type: "sample",
      title: brief.titulo,
      body_markdown: buildBodyMarkdown(brief),
      body_data: bodyData,
      status: "draft",
    })
    .select("id, public_token")
    .limit(1);

  if (pubError || !pubRows || pubRows.length === 0) {
    console.error("Failed to insert publication", pubError);
    return;
  }
  const publicationId = pubRows[0].id as string;
  const publicToken = pubRows[0].public_token as string;

  await supabase
    .from("sample_requests")
    .update({
      status: "generated",
      sample_publication_id: publicationId,
      sent_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  const url = `${SITE_URL}/muestra.html?token=${publicToken}`;
  try {
    await sendSampleEnvelope({
      to: email,
      recipientName: fullName,
      titulo: brief.titulo,
      tesis: brief.tesis,
      tematica,
      sector: sector ?? undefined,
      url,
    });
    console.log(`Envelope emailed to ${email} → ${url}`);
  } catch (err) {
    console.error("Resend delivery failed", err);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers":
          "content-type, x-criterial-signal, authorization",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-max-age": "86400",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  // 1. Shared-secret check.
  const expectedSecret = Deno.env.get("SAMPLE_REQUEST_SECRET");
  if (!expectedSecret) {
    console.error("SAMPLE_REQUEST_SECRET is not configured");
    return jsonResponse({ ok: false, error: "Server misconfigured" }, 500);
  }
  if (req.headers.get("x-criterial-signal") !== expectedSecret) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  // 2. Parse and validate.
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "Body is not valid JSON" }, 400);
  }

  const validation = validatePayload(payload);
  if ("error" in validation) {
    return jsonResponse({ ok: false, error: validation.error }, 400);
  }
  const { email, data } = validation;

  const tematica = tematicaLabel(data.interest_type);
  const sector = sectorLabel(data.sector);

  const supabase = createServiceRoleClient();

  // 3. Upsert the lead. Keeps the original source and only fills blank
  // fields on a repeat submission (Checkpoint 2, decision 2a) — this also
  // means a lead Pablo already moved past "new" no longer gets silently
  // reset by someone re-submitting the form, since the helper never touches
  // `status` on an existing row.
  let leadId: string;
  try {
    const lead = await upsertLeadByEmail(supabase, {
      email,
      full_name: data.full_name ?? null,
      company_name: data.company_name ?? null,
      website: data.website ?? null,
      interest_type: data.interest_type ?? null,
      notes: data.notes ?? null,
      source: "sample_form",
    });
    leadId = lead.id;
  } catch (err) {
    console.error("Failed to upsert lead", err);
    return jsonResponse({ ok: false, error: "Failed to register lead" }, 500);
  }

  // 4. Insert the sample_request.
  const { data: requestRows, error: requestError } = await supabase
    .from("sample_requests")
    .insert({ lead_id: leadId, topic: data.interest_type ?? null, status: "queued" })
    .select("id")
    .limit(1);

  if (requestError || !requestRows || requestRows.length === 0) {
    console.error("Failed to insert sample_request", requestError);
    return jsonResponse(
      { ok: false, error: "Failed to register sample request" },
      500,
    );
  }
  const requestId = requestRows[0].id as string;

  // 5. Test-mode guard (Checkpoint 2, decision 2c). Only honoured here
  // because we already passed the x-criterial-signal check in step 1 —
  // qa_mode is never trusted on its own to skip real Anthropic/Resend
  // calls. The lead and sample_requests rows above are written exactly as
  // in the real flow; only the costly/external part is skipped.
  if (data.qa_mode === true) {
    await supabase
      .from("sample_requests")
      .update({ status: "skipped_test" })
      .eq("id", requestId);
    return jsonResponse(
      { ok: true, request_id: requestId, test_mode: true },
      200,
    );
  }

  // 6-8. Generate, persist and email in the background. The web-searched
  // generation takes much longer than the request, and the form is
  // fire-and-forget (the browser redirects ~800ms after submit), so we MUST
  // detach this work from the request lifecycle or it gets killed on disconnect.
  const work = generateAndDeliver({
    supabase,
    requestId,
    email,
    fullName: data.full_name ?? "",
    tematica,
    sector,
  });
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    EdgeRuntime.waitUntil(work);
  } else {
    work.catch((e) => console.error("background work failed", e));
  }

  // 9. Respond immediately; generation + email happen in the background.
  return jsonResponse({ ok: true, request_id: requestId }, 200);
});
