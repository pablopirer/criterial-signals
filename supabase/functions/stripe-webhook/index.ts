/**
 * Edge Function: stripe-webhook
 *
 * Receives Stripe webhook events, verifies signature, and upserts
 * subscribers on checkout.session.completed. Also creates/updates the
 * matching commercial lead (source='stripe_pro') so a Pro purchase shows up
 * in `leads` like every other acquisition channel — Checkpoint 2 · Fase 1,
 * item 4.
 *
 * Required secrets:
 *   STRIPE_WEBHOOK_SECRET  — whsec_... from Stripe dashboard
 *   SUPABASE_URL           — injected automatically
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically
 */

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&no-check";
import { createServiceRoleClient } from "../_shared/supabase.ts";
import { upsertLeadByEmail } from "../_shared/leads.ts";

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

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return jsonResponse({ ok: false, error: "Server misconfigured" }, 500);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return jsonResponse({ ok: false, error: "Missing stripe-signature header" }, 400);
  }

  const body = await req.text();

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2024-04-10",
    httpClient: Stripe.createFetchHttpClient(),
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed", err);
    return jsonResponse({ ok: false, error: "Invalid signature" }, 400);
  }

  if (event.type !== "checkout.session.completed") {
    console.log(`Ignoring event type: ${event.type}`);
    return jsonResponse({ ok: true, skipped: true }, 200);
  }

  const session = event.data.object as Stripe.Checkout.Session;

  const email = session.customer_details?.email;
  if (!email) {
    console.error("No email in checkout session");
    return jsonResponse({ ok: false, error: "Missing email" }, 400);
  }

  // Uses the same shared client/factory as every other function (was its
  // own inline createClient() call before; switched so it can share
  // upsertLeadByEmail below without any type mismatch). Same URL and
  // service role key, injected the same way — no behavior change.
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("subscribers")
    .upsert({
      email,
      full_name: session.customer_details?.name ?? null,
      company_name: session.customer_details?.business_name ?? null,
      plan: "pro",
      status: "active",
      stripe_customer_id: session.customer as string ?? null,
      stripe_subscription_id: session.subscription as string ?? null,
    }, { onConflict: "email" });

  if (error) {
    console.error("Supabase upsert error", error);
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  // Create/update the matching commercial lead (Checkpoint 2, item 4).
  // Never fatal: `subscribers` above is the source of truth for Pro access
  // — a failure here must not make a real payment look like it didn't go
  // through. `leads.email` is UNIQUE, so this also merges cleanly with any
  // lead that reached us earlier via sample_form/advisory_form/signals_open,
  // keeping that original source (upsertLeadByEmail never overwrites it).
  try {
    await upsertLeadByEmail(supabase, {
      email,
      full_name: session.customer_details?.name ?? null,
      source: "stripe_pro",
    });
  } catch (err) {
    console.error("Failed to upsert lead for stripe subscriber", err);
  }

  console.log(`Subscriber upserted: ${email}`);
  return jsonResponse({ ok: true }, 200);
});
