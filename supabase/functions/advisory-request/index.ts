import { sendAdvisoryEmails } from "../_shared/resend.ts";
import { createServiceRoleClient } from "../_shared/supabase.ts";
import { upsertLeadByEmail } from "../_shared/leads.ts";

const TIPO_LABEL: Record<string, string> = {
  valoracion: "Valoración de empresa",
  sectorial: "Análisis sectorial",
  pitch_deck: "Pitch deck",
  otro: "Otro",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, x-criterial-signal",
      },
    });
  }

  // 1. Verify shared secret
  const secret = Deno.env.get("SAMPLE_REQUEST_SECRET");
  const incoming = req.headers.get("x-criterial-signal");
  if (!secret || incoming !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Parse body
  let data: {
    full_name?: string;
    email?: string;
    tipo_encargo?: string;
    descripcion?: string;
    /**
     * Checkpoint 2 · Fase 1, decision 2c. Only honoured because the shared
     * secret above already passed — never trusted on its own.
     */
    qa_mode?: boolean;
  };
  try {
    data = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Validate required fields
  const { full_name, email, tipo_encargo, descripcion, qa_mode } = data;
  if (!full_name || !email || !tipo_encargo) {
    return new Response(
      JSON.stringify({
        error: "Missing required fields: full_name, email, tipo_encargo",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const tipoDisplay = TIPO_LABEL[tipo_encargo] ?? tipo_encargo;

  // 4. Create/update the lead (source='advisory_form') and persist the
  // request detail in advisory_requests. Checkpoint 2 · Fase 1, decision
  // 2b — advisory-request used to have zero trace in the database, only
  // sending email. upsertLeadByEmail keeps the original source and only
  // fills blank fields on a repeat submission (decision 2a).
  const supabase = createServiceRoleClient();

  let leadId: string;
  try {
    const lead = await upsertLeadByEmail(supabase, {
      email,
      full_name,
      source: "advisory_form",
    });
    leadId = lead.id;
  } catch (err) {
    console.error("Failed to upsert lead", err);
    return new Response(
      JSON.stringify({ error: "No se pudo registrar la solicitud" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const { error: reqError } = await supabase
    .from("advisory_requests")
    .insert({
      lead_id: leadId,
      tipo_encargo,
      descripcion: descripcion?.trim() || null,
    });
  if (reqError) {
    console.error("Failed to insert advisory_request", reqError);
    return new Response(
      JSON.stringify({ error: "No se pudo registrar la solicitud" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // 5. Test-mode guard (Checkpoint 2, decision 2c) — only honoured because
  // x-criterial-signal already passed in step 1. Skips both real emails;
  // the lead and advisory_requests rows above are written regardless, same
  // as the real flow.
  const qaMode = qa_mode === true;
  if (!qaMode) {
    // 5b. Send both emails (confirmation to user + internal notification)
    await sendAdvisoryEmails({
      toUser: email,
      toInternal: "criterialam@gmail.com",
      recipientName: full_name,
      tipoEncargo: tipoDisplay,
      descripcion: descripcion?.trim() || "(sin descripción)",
    });
  }

  // 6. Return success
  return new Response(
    JSON.stringify({ ok: true, test_mode: qaMode || undefined }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
});
