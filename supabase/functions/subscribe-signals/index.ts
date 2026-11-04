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
 *   4. Create/update the matching lead in `leads` (source='signals_open')
 *      — Checkpoint 2 · Fase 1, item 3.
 *   5. Send a branded confirmation email carrying the unsubscribe link
 *      (skipped under the qa_mode test guard — decision 2c).
 *
 * Since 2026-11-04 (LinkedIn campaign) the request may also carry `origen`
 * (utm_* parameters, referrer, landing URL, language), stored on the first
 * subscribe only, and a second call `{ email, action: "perfil", perfil }`
 * records the reader's profile without sending another email.
 *
 * Security: signals_subscribers stays the source of truth for the newsletter
 * lifecycle (active/unsubscribed, unsubscribe_token); RLS is on and access is
 * service-role only. `leads` is a secondary, best-effort commercial record of
 * the same contact — see _shared/leads.ts. The confirmation email is the
 * single opt-in signal (no double opt-in during validation).
 */

import { createServiceRoleClient } from "../_shared/supabase.ts";
import { sendSignalsConfirmation } from "../_shared/resend.ts";
import { upsertLeadByEmail } from "../_shared/leads.ts";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-criterial-signal, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
};

/** Same list as the check constraint in 20261104120000_signals_subscribers_perfil.sql. */
const PERFILES = [
  "pe_vc", "asesor", "empresa", "family_office", "banca_deuda",
  "inversor_internacional", "otro",
];
const ORIGEN_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "referrer", "landing", "lang",
];

/** Keep only the known keys, as short strings: this comes from a public page. */
function cleanOrigen(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, string> = {};
  for (const k of ORIGEN_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 300);
  }
  return Object.keys(out).length ? out : null;
}

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
  // Checkpoint 2 · Fase 1, decision 2c. Only honoured because the shared
  // secret was already validated above — never trusted on its own.
  const qaMode = (payload as { qa_mode?: unknown })?.qa_mode === true;

  const supabase = createServiceRoleClient();

  // Profile answer, sent after a successful subscribe. Only an active
  // subscriber's row changes, and no email goes out.
  if ((payload as { action?: unknown })?.action === "perfil") {
    const perfil = String((payload as { perfil?: unknown })?.perfil ?? "");
    if (!PERFILES.includes(perfil)) {
      return jsonResponse({ ok: false, error: "Perfil no válido" }, 400);
    }
    const { error: perfilErr } = await supabase
      .from("signals_subscribers")
      .update({ perfil })
      .eq("email", email)
      .eq("status", "active");
    if (perfilErr) {
      console.error("Failed to save perfil", perfilErr);
      return jsonResponse({ ok: false, error: "No se pudo guardar el perfil" }, 500);
    }
    return jsonResponse({ ok: true }, 200);
  }

  // Whether this is a new reader, read before the upsert: since 2026-11-04 a
  // new subscription from the public form is real data (is_test = false),
  // unless it came in qa_mode. Existing rows keep the flag they already had.
  const { data: prev } = await supabase
    .from("signals_subscribers")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  const markReal = !prev && !qaMode;

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

  if (markReal) {
    const { error: realErr } = await supabase
      .from("signals_subscribers")
      .update({ is_test: false })
      .eq("email", email);
    if (realErr) console.error("Failed to mark subscriber as real", realErr);
  }

  // Where the reader came from, kept from the FIRST subscribe only: a later
  // re-subscribe from another link must not rewrite the original source.
  const origen = cleanOrigen((payload as { origen?: unknown })?.origen);
  if (origen) {
    const { error: origenErr } = await supabase
      .from("signals_subscribers")
      .update({ origen })
      .eq("email", email)
      .is("origen", null);
    if (origenErr) console.error("Failed to save origen", origenErr);
  }

  // 4. Create/update the matching commercial lead (source='signals_open' —
  // Checkpoint 2, item 3). Non-fatal: the subscription above is the source
  // of truth for the newsletter and already succeeded, so a failure here
  // must not turn a successful opt-in into a user-facing error.
  try {
    const lead = await upsertLeadByEmail(supabase, { email, source: "signals_open" });
    // A lead created by a real subscription is real too; an existing lead
    // keeps its flag.
    if (markReal && lead.isNew) {
      await supabase.from("leads").update({ is_test: false }).eq("id", lead.id);
    }
  } catch (err) {
    console.error("Failed to upsert lead for signals subscriber", err);
  }

  const token = rows[0].unsubscribe_token as string;
  // Opt-out link targets the public unsubscribe-signals Edge Function (Supabase
  // project host), not the Pages custom domain.
  const functionsBase = Deno.env.get("SUPABASE_URL");
  const unsubscribeUrl =
    `${functionsBase}/functions/v1/unsubscribe-signals?token=${token}`;

  // 5. Test-mode guard (Checkpoint 2, decision 2c) — skips the real
  // confirmation email; the subscriber and lead rows above are written
  // regardless, same as the real flow.
  if (!qaMode) {
    // 5b. Confirmation email. Awaited: this is a short-lived request (no
    // EdgeRuntime.waitUntil), so the send must finish before we respond.
    try {
      await sendSignalsConfirmation({ to: email, unsubscribeUrl });
    } catch (err) {
      // The subscription is already recorded; a failed confirmation shouldn't
      // 500 the user. Log and still return success.
      console.error("Confirmation email failed", err);
    }
  }

  return jsonResponse({ ok: true, test_mode: qaMode || undefined }, 200);
});
