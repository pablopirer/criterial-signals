/**
 * Supabase client factory for Edge Functions.
 *
 * Uses the service role key, which bypasses Row-Level Security. This is the
 * correct choice for a server-side webhook handler — the function is not
 * acting on behalf of any authenticated end user, it is acting as the
 * backend that writes to `leads`, `sample_requests`, and `publications`.
 *
 * NEVER call this from the browser. NEVER ship the service role key to the
 * frontend. The only callers should be other Edge Functions or trusted
 * server-side code.
 */

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Build a Supabase client using the URL and service role key from the
 * function environment. Throws if either var is missing — we want loud
 * failures during boot, not silent 401s on every request.
 *
 * Supabase injects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY into every
 * Edge Function automatically; you do not need to set these as secrets.
 *
 * @returns A Supabase client authenticated with the service role key.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url) {
    throw new Error("SUPABASE_URL is not set in the function environment");
  }
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set in the function environment",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      // We never want this client to read/write auth state from cookies
      // or local storage. It's a stateless server client.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
