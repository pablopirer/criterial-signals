/**
 * Edge Function: get-sample
 *
 * Public, read-only access to a single sample publication by its unguessable
 * public_token. Powers the interactive "muestra web" (muestra.html) linked
 * from the sample email. No auth — deployed with --no-verify-jwt.
 *
 * Security model:
 *   - Uses the service role (bypasses RLS) but only ever returns rows where
 *     type='sample' AND public_token matches exactly. A weekly/monthly token
 *     therefore yields nothing.
 *   - Returns only the fields the public page needs. Never returns lead data,
 *     subscriber data, or internal ids beyond the token-addressed row.
 *
 * Flow:
 *   1. Validate the `token` query param is a UUID.
 *   2. Fetch the matching sample publication.
 *   3. Return its renderable content, or 404.
 */

import { createServiceRoleClient } from "../_shared/supabase.ts";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET, OPTIONS",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  if (!UUID_RE.test(token)) {
    return jsonResponse({ error: "Invalid or missing token" }, 400);
  }

  const supabase = createServiceRoleClient();

  const { data: sample, error } = await supabase
    .from("publications")
    .select(
      "title, type, body_markdown, body_data, period_start, period_end, created_at",
    )
    .eq("public_token", token)
    .eq("type", "sample")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch sample", error);
    return jsonResponse({ error: "Failed to fetch sample" }, 500);
  }
  if (!sample) {
    return jsonResponse({ error: "Sample not found" }, 404);
  }

  return jsonResponse({ sample }, 200);
});
