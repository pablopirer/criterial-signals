/**
 * Edge Function: send-open-edition
 *
 * Emails the free ("open") newsletter list (signals_subscribers) when a new
 * open edition is published. Mirrors send-weekly (the Pro path) but for the
 * free audience: different table, different template, and a per-recipient
 * unsubscribe link.
 *
 * Called from admin-publications on publish (background), forwarding the admin
 * JWT — same reuse pattern as the Pro auto-notify. Also callable manually.
 *
 * Flow:
 *   1. Verify admin JWT.
 *   2. Fetch publication — must be published, type=weekly, body_public not null
 *      (i.e. it IS an open edition).
 *   3. Fetch active signals_subscribers.
 *   4. Email each the open-edition notification (deep-links to the edition).
 *   5. Return { sent, errors? }.
 */

import { createServiceRoleClient } from "../_shared/supabase.ts";
import { sendOpenEditionEmail } from "../_shared/resend.ts";

const ADMIN_EMAIL = "pablopirer@gmail.com";
const SITE_URL = "https://criterialsignals.com";

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

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

function formatPeriod(start: string, end: string): string {
  if (!start) return "";
  const fmt = (d: string) => {
    const date = new Date(d + "T12:00:00Z");
    return `${date.getDate()} de ${MONTHS_ES[date.getMonth()]} de ${date.getFullYear()}`;
  };
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

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

  let body: { publication_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const publicationId = body.publication_id;
  if (!publicationId) {
    return jsonResponse({ error: "publication_id is required" }, 400);
  }

  const { data: pub, error: pubError } = await supabase
    .from("publications")
    .select("id, title, type, status, period_start, period_end, body_public")
    .eq("id", publicationId)
    .single();

  if (pubError || !pub) {
    return jsonResponse({ error: "Publication not found" }, 404);
  }
  if (pub.status !== "published") {
    return jsonResponse({ error: "La publicación debe estar publicada" }, 400);
  }
  if (pub.type !== "weekly" || !pub.body_public) {
    return jsonResponse({ error: "Solo ediciones abiertas (weekly con body_public)" }, 400);
  }

  const { data: subscribers, error: subError } = await supabase
    .from("signals_subscribers")
    .select("email, unsubscribe_token")
    .eq("status", "active");

  if (subError) {
    console.error("Failed to fetch signals subscribers:", subError);
    return jsonResponse({ error: "Error al obtener suscriptores" }, 500);
  }
  if (!subscribers || subscribers.length === 0) {
    return jsonResponse({ message: "Sin suscriptores activos", sent: 0 }, 200);
  }

  const periodLabel = formatPeriod(pub.period_start, pub.period_end);
  const editionUrl = `${SITE_URL}/signals.html?edition=${pub.id}`;
  const functionsBase = Deno.env.get("SUPABASE_URL");

  const sentEmails: string[] = [];
  const failedEmails: string[] = [];

  for (const sub of subscribers) {
    try {
      await sendOpenEditionEmail({
        to: sub.email,
        title: pub.title,
        period: periodLabel,
        editionUrl,
        unsubscribeUrl:
          `${functionsBase}/functions/v1/unsubscribe-signals?token=${sub.unsubscribe_token}`,
      });
      sentEmails.push(sub.email);
    } catch (err) {
      console.error(`Failed to send to ${sub.email}:`, err);
      failedEmails.push(sub.email);
    }
  }

  const responseBody: Record<string, unknown> = { sent: sentEmails.length };
  if (failedEmails.length > 0) responseBody.errors = failedEmails;
  return jsonResponse(responseBody, 200);
});
