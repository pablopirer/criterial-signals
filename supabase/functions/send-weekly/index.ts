/**
 * Edge Function: send-weekly
 *
 * Sends an email notification to all active Pro subscribers when a weekly
 * or monthly publication is ready. Called manually from admin.html after
 * publishing. Does not trigger automatically — the admin decides when to send.
 *
 * Flow:
 *   1. Verify admin JWT.
 *   2. Fetch publication by ID — must be published and type weekly|monthly.
 *   3. Fetch all subscribers where plan=pro and status=active.
 *   4. Send notification email to each via Resend.
 *   5. Return { sent, emails, errors? }.
 */

import { createServiceRoleClient } from "../_shared/supabase.ts";
import { sendPublicationNotification } from "../_shared/resend.ts";

const ADMIN_EMAIL = "pablopirer@gmail.com";

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

  // Fetch publication
  const { data: pub, error: pubError } = await supabase
    .from("publications")
    .select("id, title, type, status, period_start, period_end")
    .eq("id", publicationId)
    .single();

  if (pubError || !pub) {
    return jsonResponse({ error: "Publication not found" }, 404);
  }
  if (pub.status !== "published") {
    return jsonResponse({ error: "La publicación debe estar publicada antes de enviar" }, 400);
  }
  if (pub.type !== "weekly" && pub.type !== "monthly") {
    return jsonResponse({ error: "Solo se pueden enviar publicaciones de tipo weekly o monthly" }, 400);
  }

  // Fetch active Pro subscribers
  const { data: subscribers, error: subError } = await supabase
    .from("subscribers")
    .select("email")
    .eq("plan", "pro")
    .eq("status", "active");

  if (subError) {
    console.error("Failed to fetch subscribers:", subError);
    return jsonResponse({ error: "Error al obtener suscriptores" }, 500);
  }
  if (!subscribers || subscribers.length === 0) {
    return jsonResponse({ message: "Sin suscriptores Pro activos", sent: 0 }, 200);
  }

  const periodLabel = formatPeriod(pub.period_start, pub.period_end);
  const sentEmails: string[] = [];
  const failedEmails: string[] = [];

  for (const sub of subscribers) {
    try {
      await sendPublicationNotification({
        to: sub.email,
        publicationTitle: pub.title,
        publicationPeriod: periodLabel,
        publicationType: pub.type as "weekly" | "monthly",
      });
      sentEmails.push(sub.email);
    } catch (err) {
      console.error(`Failed to send to ${sub.email}:`, err);
      failedEmails.push(sub.email);
    }
  }

  const responseBody: Record<string, unknown> = {
    sent: sentEmails.length,
    emails: sentEmails,
  };
  if (failedEmails.length > 0) {
    responseBody.errors = failedEmails;
  }

  return jsonResponse(responseBody, 200);
});
