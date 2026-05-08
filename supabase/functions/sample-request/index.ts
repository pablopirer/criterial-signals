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
    "Eres un analista senior de Criterial Signals, un servicio de inteligencia " +
    "de mercado centrado en Iberia (España y Portugal). Escribes para " +
    "profesionales de M&A, search funds, asesoramiento financiero y gestión de " +
    "activos. Tu tono es sobrio, claro y analítico. No usas marketing ni " +
    "hipérbole. No usas markdown complejo ni títulos excesivamente largos.",
  user:
    "Redacta un sample brief breve en español profesional para Criterial " +
    "Signals.\n\n" +
    "El tema principal es: {{interest_type}}.\n\n" +
    "Estructura obligatoria:\n\n" +
    "1) Executive Snapshot — 2 a 3 frases que resuman el estado actual del tema.\n" +
    "2) Three Relevant Signals — 3 puntos breves, cada uno una observación accionable.\n" +
    "3) What to Watch — 2 puntos breves sobre qué seguir en las próximas semanas.\n\n" +
    "No inventes cifras ni nombres concretos de operaciones. Si no tienes " +
    "evidencia para una afirmación cuantitativa, redacta de forma cualitativa.",
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

  // 6. Persist the publication if we got a brief.
  if (briefText) {
    const { error: pubError } = await supabase
      .from("publications")
      .insert({
        type: "sample",
        title: `Auto-generated sample brief — ${data.interest_type ?? "Iberia"}`,
        body_markdown: briefText,
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
        interestType: data.interest_type ?? "Iberia",
        briefText,
      });
      console.log(`Brief emailed to ${email}`);
    } catch (err) {
      console.error("Resend delivery failed", err);
    }
  }

  // 8. Public response.
  return jsonResponse({ ok: true, request_id: requestId }, 200);
});
