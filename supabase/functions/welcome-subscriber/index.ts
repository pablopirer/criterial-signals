/**
 * Edge Function: welcome-subscriber
 *
 * Triggered by a Supabase Database Webhook on INSERT to `subscribers`.
 * Sends a welcome email to the new Pro subscriber via Resend with
 * instructions to access the archive.
 *
 * Auth: Supabase Database Webhooks automatically send the service role key
 * as `Authorization: Bearer <key>`. We validate against SUPABASE_SERVICE_ROLE_KEY.
 *
 * Payload shape (Supabase Database Webhook format):
 *   { type: "INSERT", table: "subscribers", record: { email, full_name, ... } }
 */

import { sendWelcomeEmail } from "../_shared/resend.ts";

interface SubscriberRecord {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  plan: string;
  status: string;
}

interface WebhookPayload {
  type: string;
  table: string;
  record: SubscriberRecord;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  // Validate that the request comes from Supabase (service role key).
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    return jsonResponse({ ok: false, error: "Server misconfigured" }, 500);
  }
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
  }

  if (payload.type !== "INSERT" || payload.table !== "subscribers") {
    return jsonResponse({ ok: false, error: "Unexpected event" }, 400);
  }

  const { email, full_name, plan } = payload.record;

  if (!email) {
    return jsonResponse({ ok: false, error: "Missing email in record" }, 400);
  }

  // Only send welcome email for active Pro subscribers.
  if (plan !== "pro") {
    console.log(`Skipping welcome email for non-pro plan: ${plan}`);
    return jsonResponse({ ok: true, skipped: true }, 200);
  }

  try {
    await sendWelcomeEmail({ to: email, recipientName: full_name ?? "" });
    console.log(`Welcome email sent to ${email}`);
  } catch (err) {
    console.error("Failed to send welcome email", err);
    return jsonResponse({ ok: false, error: "Email delivery failed" }, 500);
  }

  return jsonResponse({ ok: true }, 200);
});
