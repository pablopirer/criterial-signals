/**
 * Edge Function: stripe-webhook
 *
 * Receives Stripe webhook events, verifies signature, and upserts
 * subscribers on checkout.session.completed.
 *
 * Required secrets:
 *   STRIPE_WEBHOOK_SECRET  — whsec_... from Stripe dashboard
 *   SUPABASE_URL           — injected automatically
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically
 */

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

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

  console.log(`Subscriber upserted: ${email}`);
  return jsonResponse({ ok: true }, 200);
});
