/**
 * Edge Function: sample-request
 *
 * Replaces the Make scenario `sample-request-mvp`. Receives a POST from the
 * public sample form, upserts the lead, registers a sample_request, calls
 * Anthropic to generate the brief, and stores the result in publications.
 *
 * Flow (mirrors the original Make scenario, with idempotency added):
 *   1. Verify the shared-secret header (replaces "public webhook URL").
 *   2. Validate the payload.
 *   3. Upsert the lead by lower(email). New rows get source=sample_form,
 *      status=new. Existing rows get their non-empty fields refreshed.
 *   4. Insert a sample_request row with lead_id and topic=interest_type.
 *   5. Call Anthropic to generate the brief.
 *   6. Insert the brief into publications.
 *   7. Return { ok: true, request_id }.
 *
 * Note on the prompt: it lives inline in this file rather than in
 * `/prompts/sample-brief.es.md`. The reason is that Supabase only ships the
 * `supabase/functions/<name>/` directory at deploy time, so files outside
 * that tree (like `/prompts/`) are not available at runtime. We keep the
 * canonical copy of the prompt in `/prompts/sample-brief.es.md` for
 * readability and future tooling, but the source of truth at runtime is
 * the SAMPLE_BRIEF_PROMPT constant below. KEEP THEM IN SYNC.
 */

import { createServiceRoleClient } from "../_shared/supabase.ts";
import { generateBrief } from "../_shared/anthropic.ts";
import { sendBriefEmail } from "../_shared/resend.ts";
import type {
  SampleRequestErrorResponse,
  SampleRequestPayload,
  SampleRequestResponse,
} from "./types.ts";

/**
 * Inline copy of /prompts/sample-brief.es.md.
 * Keep in sync with the canonical .md file in the repo root.
 */
const SAMPLE_BRIEF_PROMPT = {
  system:
    "Eres el redactor analítico de Criterial Signals, un servicio de inteligencia " +
    "de mercado especializado en el mercado español. Tu misión es producir briefs " +
    "de alta calidad para profesionales: inversores, analistas, asesores M&A y directivos.\n\n" +
    "Estilo editorial obligatorio:\n" +
    "- Tono sobrio, analítico y directo. Sin entusiasmo comercial ni lenguaje de marketing.\n" +
    "- Frases completas con densidad informativa real. Nada de bullets vacíos.\n" +
    "- Cada señal debe tener una tesis clara y un argumento que la sostenga.\n" +
    "- Usa cifras, referencias temporales y actores concretos cuando los conozcas.\n" +
    "- Foco exclusivo en el mercado español. No incluir Portugal ni referencias a mercado ibérico.\n\n" +
    "Devuelve SOLO JSON válido, sin markdown, sin texto adicional:\n" +
    "{\n" +
    "  \"titulo\": \"título directo del brief\",\n" +
    "  \"subtitulo\": \"una frase que resume la tesis principal\",\n" +
    "  \"tags\": [\"tag1\", \"tag2\", \"tag3\"],\n" +
    "  \"snapshot\": \"párrafo de 3-4 frases analíticas con dato cuantitativo si es posible\",\n" +
    "  \"signals\": [\n" +
    "    { \"titulo\": \"título de la señal\", \"cuerpo\": \"2-3 frases. Tesis + argumento + implicación.\" },\n" +
    "    { \"titulo\": \"título de la señal\", \"cuerpo\": \"2-3 frases.\" },\n" +
    "    { \"titulo\": \"título de la señal\", \"cuerpo\": \"2-3 frases.\" }\n" +
    "  ],\n" +
    "  \"watch\": [\n" +
    "    { \"titulo\": \"actor o evento a vigilar\", \"cuerpo\": \"1-2 frases sobre por qué importa.\" },\n" +
    "    { \"titulo\": \"actor o evento a vigilar\", \"cuerpo\": \"1-2 frases sobre por qué importa.\" }\n" +
    "  ]\n" +
    "}",
  user:
    "Genera un sample brief sobre: {{interest_type}}.\n\n" +
    "Fecha de referencia: Mayo 2026. Razona desde ese punto temporal. " +
    "Si usas cifras o referencias a períodos concretos, asegúrate de que " +
    "son coherentes con mayo de 2026 como presente. Cuando una estimación " +
    "sea orientativa, indícalo con 'aproximadamente' o 'en torno a'.",
};

/**
 * Build a JSON Response with the right CORS headers.
 */
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

/**
 * Validate the incoming payload. Returns the email and a normalised payload
 * if valid, or an error string if invalid.
 */
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

  return {
    email,
    data: {
      ...p,
      email,
    },
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight.
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
    return jsonResponse(
      { ok: false, error: "Method not allowed" },
      405,
    );
  }

  // 1. Shared-secret check.
  const expectedSecret = Deno.env.get("SAMPLE_REQUEST_SECRET");
  if (!expectedSecret) {
    console.error("SAMPLE_REQUEST_SECRET is not configured");
    return jsonResponse(
      { ok: false, error: "Server misconfigured" },
      500,
    );
  }
  const providedSecret = req.headers.get("x-criterial-signal");
  if (providedSecret !== expectedSecret) {
    return jsonResponse(
      { ok: false, error: "Unauthorized" },
      401,
    );
  }

  // 2. Parse and validate.
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(
      { ok: false, error: "Body is not valid JSON" },
      400,
    );
  }

  const validation = validatePayload(payload);
  if ("error" in validation) {
    return jsonResponse({ ok: false, error: validation.error }, 400);
  }
  const { email, data } = validation;

  const supabase = createServiceRoleClient();

  // 3. Upsert the lead.
  const { data: leadRows, error: leadError } = await supabase
    .from("leads")
    .upsert(
      {
        email,
        full_name: data.full_name ?? null,
        company_name: data.company_name ?? null,
        website: data.website ?? null,
        interest_type: data.interest_type ?? null,
        notes: data.notes ?? null,
        source: "sample_form",
        status: "new",
      },
      {
        onConflict: "email",
        ignoreDuplicates: false,
      },
    )
    .select("id, email")
    .limit(1);

  if (leadError || !leadRows || leadRows.length === 0) {
    console.error("Failed to upsert lead", leadError);
    return jsonResponse(
      { ok: false, error: "Failed to register lead" },
      500,
    );
  }
  const leadId = leadRows[0].id as string;

  // 4. Insert the sample_request.
  const { data: requestRows, error: requestError } = await supabase
    .from("sample_requests")
    .insert({
      lead_id: leadId,
      topic: data.interest_type ?? null,
      status: "queued",
    })
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

  // 5. Generate the brief.
  let briefText: string | null = null;
  try {
    const result = await generateBrief({
      interestType: data.interest_type ?? "Iberian market overview",
      prompt: SAMPLE_BRIEF_PROMPT,
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
  }

  // 6. Parse the JSON brief and persist the publication.
  if (briefText) {
    let briefData: {
      titulo: string;
      subtitulo: string;
      tags: string[];
      snapshot: string;
      signals: Array<{ titulo: string; cuerpo: string }>;
      watch: Array<{ titulo: string; cuerpo: string }>;
    } | null = null;

    try {
      const clean = briefText.replace(/```json|```/g, "").trim();
      briefData = JSON.parse(clean);
    } catch (err) {
      console.error("Failed to parse brief JSON", err);
      console.error("Raw briefText was:", briefText);
      await supabase
        .from("sample_requests")
        .update({ status: "generation_failed" })
        .eq("id", requestId);
    }

    if (briefData) {
      const body_markdown =
        `## Executive Snapshot\n\n${briefData.snapshot}\n\n` +
        `## Three Relevant Signals\n\n` +
        briefData.signals
          .map((s, i) => `**${String(i + 1).padStart(2, "0")}. ${s.titulo}**\n\n${s.cuerpo}`)
          .join("\n\n") +
        `\n\n## What to Watch\n\n` +
        briefData.watch
          .map((w) => `**${w.titulo}**\n\n${w.cuerpo}`)
          .join("\n\n");

      const title = briefData.titulo;

      const { error: pubError } = await supabase
        .from("publications")
        .insert({
          type: "sample",
          title,
          body_markdown,
          status: "draft",
        });

      if (pubError) {
        console.error("Failed to insert publication", pubError);
      } else {
        await supabase
          .from("sample_requests")
          .update({ status: "generated" })
          .eq("id", requestId);
      }

      // 7. Send the brief by email.
      try {
        await sendBriefEmail({
          to: email,
          recipientName: data.full_name ?? "",
          interestType: data.interest_type ?? "España",
          briefText: body_markdown,
        });
        console.log(`Brief emailed to ${email}`);
      } catch (err) {
        console.error("Resend delivery failed", err);
      }
    }
  }

  // 8. Public response.
  return jsonResponse({ ok: true, request_id: requestId }, 200);
});
