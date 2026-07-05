/**
 * Edge Function: unsubscribe-signals
 *
 * Public opt-out for the free Signals newsletter. Deployed with --no-verify-jwt.
 * It is the target of the unsubscribe link in every newsletter email.
 *
 * Flow:
 *   GET ?token=<uuid> → set status='unsubscribed' where unsubscribe_token=token
 *   → return a branded HTML confirmation page.
 *
 * The token is the authorization: it's unguessable and per-subscriber. Always
 * returns a friendly page (even for an unknown/spent token) so the reader never
 * sees a raw error.
 */

import { createServiceRoleClient } from "../_shared/supabase.ts";

function page(heading: string, message: string): Response {
  const sans =
    "-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif";
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Criterial Signals</title>
</head>
<body style="margin:0;padding:0;background:#F4F0EA;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:80px 16px;"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border:0.5px solid #E2DED8;">
  <tr><td style="padding:44px 48px;">
    <div style="font-family:${sans};font-size:9px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:#BBB;margin-bottom:20px;">Criterial. · Signals</div>
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:400;color:#0D1F3C;line-height:1.25;margin:0 0 14px;">${heading}</div>
    <p style="font-family:${sans};font-size:14px;line-height:1.7;color:#555;margin:0 0 28px;">${message}</p>
    <a href="https://criterialsignals.com/signals.html" style="display:inline-block;background:#0D1F3C;color:#ffffff;font-family:${sans};font-size:12px;font-weight:500;letter-spacing:.04em;padding:12px 26px;text-decoration:none;">Volver a Signals</a>
  </td></tr>
</table>
</td></tr></table>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return page("Enlace no válido", "Falta el identificador de baja en el enlace.");
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("signals_subscribers")
    .update({ status: "unsubscribed" })
    .eq("unsubscribe_token", token);

  if (error) {
    console.error("Failed to unsubscribe", error);
    return page(
      "No hemos podido procesarlo",
      "Ha ocurrido un problema al dar de baja tu correo. Inténtalo de nuevo más tarde.",
    );
  }

  return page(
    "Te has dado de baja",
    "Ya no recibirás la edición abierta de Criterial Signals. Puedes volver a suscribirte cuando quieras desde la web.",
  );
});
