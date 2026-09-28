/**
 * Edge Function: admin-subscribers
 *
 * Read-only view of both subscriber lists for the Admin (Checkpoint 3 ·
 * Fase 1). Same admin gate as every other admin-* function.
 *
 *   GET /admin-subscribers → { pro: [...], signals: [...] }
 *
 * Two different things that the Admin shows side by side:
 *   - `subscribers`        — paying Pro subscribers, written by stripe-webhook.
 *   - `signals_subscribers` — the free open-edition newsletter list.
 *
 * READ-ONLY on purpose. The prototype showed "Activar / Desactivar"
 * buttons, but a Pro subscription's real state lives in Stripe: flipping
 * `subscribers.status` here would desynchronise the database from the
 * payment processor and silently grant or revoke archive access. Same for
 * the newsletter: unsubscribing is the reader's own action, through the
 * signed token link in every email (unsubscribe-signals). Neither belongs
 * in this checkpoint. No PATCH, no DELETE.
 *
 * `unsubscribe_token` is deliberately NOT selected: it is the credential
 * that lets anyone unsubscribe that reader, and the Admin has no use for it.
 */

import { jsonResponse, preflight, requireAdmin } from "../_shared/admin-auth.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflight();

  const gate = await requireAdmin(req);
  if (gate instanceof Response) return gate;
  const { supabase } = gate;

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const [proRes, signalsRes] = await Promise.all([
      supabase
        .from("subscribers")
        .select(
          "id, email, full_name, company_name, plan, status, is_test, created_at, subscription_start, renewal_date, stripe_customer_id",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("signals_subscribers")
        .select("id, email, status, source, is_test, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (proRes.error || signalsRes.error) {
      console.error(
        "Failed to fetch subscribers",
        proRes.error ?? signalsRes.error,
      );
      return jsonResponse(
        { error: "No se pudieron obtener los suscriptores" },
        500,
      );
    }

    return jsonResponse({
      pro: proRes.data ?? [],
      signals: signalsRes.data ?? [],
    }, 200);
  } catch (err) {
    console.error("admin-subscribers error", err);
    return jsonResponse({ error: "Error interno" }, 500);
  }
});
