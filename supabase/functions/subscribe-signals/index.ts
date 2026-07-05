/**
 * Edge Function: subscribe-signals
 *
 * Inline email capture for the free ("open") Signals edition (signals.html).
 * Public, no auth — deployed with --no-verify-jwt — but gated by the same
 * lightweight shared-secret header (x-criterial-signal) as sample-request, to
 * deter drive-by bots. Idempotent: a valid email always returns 200.
 *
 * Flow:
 *   1. Verify the shared-secret header.
 *   2. Validate the email.
 *   3. Upsert into signals_subscribers (on conflict email → reactivate).
 *   4. Send a branded confirmation email carrying the unsubscribe link.
 *
 * Security: subscribers live in a dedicated table (not `leads`); RLS is on and
 * access is service-role only. The confirmation email is the single opt-in
 * signal (no double opt-in during validation).
 */

import { createServiceRoleClient } from "../_shared/supabase.ts";
import { sendSignalsConfirmation } from "../_shared/resend.ts";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-criterial-signal, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...CORS_HEADERS, "access-control-max-age": "86400" },
    });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  // 1. Shared-secret check (same header/secret as sample-request).
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

  const email = String((payload as { email?: unknown })?.email ?? "")
    .trim()
    .toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ ok: false, error: "Email no válido" }, 400);
  }

  const supabase = createServiceRoleClient();

  // 3. Upsert. On conflict (existing subscriber) reactivate: re-subscribing after
  // an unsubscribe flips status back to active. unsubscribe_token stays put (its
  // default only fires on insert), so old opt-out links keep working.
  const { data: rows, error } = await supabase
    .from("signals_subscribers")
    .upsert(
      { email, status: "active", source: "signals_open" },
      { onConflict: "email", ignoreDuplicates: false },
    )
    .select("unsubscribe_token")
    .limit(1);

  if (error || !rows || rows.length === 0) {
    console.error("Failed to upsert signals subscriber", error);
    return jsonResponse({ ok: false, error: "No se pudo completar la suscripción" }, 500);
  }

  const token = rows[0].unsubscribe_token as string;
  // Opt-out link targets the public unsubscribe-signals Edge Function (Supabase
  // project host), not the Pages custom domain.
  const functionsBase = Deno.env.get("SUPABASE_URL");
  const unsubscribeUrl =
    `${functionsBase}/functions/v1/unsubscribe-signals?token=${token}`;

  // 4. Confirmation email. Awaited: this is a short-lived request (no
  // EdgeRuntime.waitUntil), so the send must finish before we respond.
  try {
    await sendSignalsConfirmation({ to: email, unsubscribeUrl });
  } catch (err) {
    // The subscription is already recorded; a failed confirmation shouldn't
    // 500 the user. Log and still return success.
    console.error("Confirmation email failed", err);
  }

  return jsonResponse({ ok: true }, 200);
});
