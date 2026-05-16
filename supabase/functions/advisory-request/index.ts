import { sendAdvisoryEmails } from "../_shared/resend.ts";

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
  const { full_name, email, tipo_encargo, descripcion } = data;
  if (!full_name || !email || !tipo_encargo) {
    return new Response(
      JSON.stringify({
        error: "Missing required fields: full_name, email, tipo_encargo",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const tipoDisplay = TIPO_LABEL[tipo_encargo] ?? tipo_encargo;

  // 4. Send both emails (confirmation to user + internal notification)
  await sendAdvisoryEmails({
    toUser: email,
    toInternal: "pablopirer@gmail.com",
    recipientName: full_name,
    tipoEncargo: tipoDisplay,
    descripcion: descripcion?.trim() || "(sin descripción)",
  });

  // 5. Return success
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
