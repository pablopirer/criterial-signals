/**
 * Edge Function: get-public-editions
 *
 * Public, read-only feed of the free ("open") Signals editions that power the
 * public reader at signals.html. No auth — deployed with --no-verify-jwt.
 *
 * Security model:
 *   - Uses the service role (bypasses RLS) but ONLY ever returns the reduced
 *     `body_public` projection of rows where status='published' AND
 *     body_public IS NOT NULL. The full `body_markdown` (Pro depth) is never
 *     selected or returned here. Samples/monthly/legacy rows have a null
 *     body_public and therefore never surface.
 *   - Returns only the fields the public page needs.
 *
 * Flow:
 *   1. Fetch published editions that have a public projection, newest first.
 *   2. Return them (with body_public renamed to body for the renderer).
 */

import { createServiceRoleClient } from "../_shared/supabase.ts";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET, OPTIONS",
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

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("publications")
    .select("id, title, type, period_start, period_end, body_public, created_at")
    .eq("status", "published")
    .not("body_public", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Failed to fetch public editions", error);
    return jsonResponse({ error: "Failed to fetch editions" }, 500);
  }

  // Rename body_public -> body so the public renderer is agnostic to storage.
  const editions = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    period_start: row.period_start,
    period_end: row.period_end,
    created_at: row.created_at,
    body: row.body_public,
  }));

  return jsonResponse({ editions }, 200);
});
