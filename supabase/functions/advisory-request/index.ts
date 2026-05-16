import { sendEmail } from "../_shared/resend.ts";

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

  // 4. Send internal notification
  const internalText = [
    "Nueva consulta Advisory recibida.",
    "",
    `Nombre: ${full_name}`,
    `Email: ${email}`,
    `Tipo: ${tipoDisplay}`,
    "",
    "Descripción:",
    descripcion?.trim() || "(sin descripción)",
  ].join("\n");

  await sendEmail({
    to: "pablopirer@gmail.com",
    subject: `Nueva consulta Advisory — ${tipoDisplay}`,
    text: internalText,
  });

  // 5. Send confirmation to user
  const firstName = full_name.split(" ")[0];
  const greeting = firstName ? `Hola ${firstName},` : "Hola,";

  const confirmationText = [
    greeting,
    "",
    "Hemos recibido tu consulta de Advisory en Criterial.",
    "",
    `Tipo de encargo: ${tipoDisplay}`,
    "",
    "Te responderemos con una propuesta de alcance y coste en menos de 24 horas.",
    "",
    "Si tienes alguna pregunta adicional, puedes responder directamente a este email.",
    "",
    "Criterial",
  ].join("\n");

  await sendEmail({
    to: email,
    subject: "Hemos recibido tu consulta — Criterial",
    text: confirmationText,
  });

  // 6. Return success
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
