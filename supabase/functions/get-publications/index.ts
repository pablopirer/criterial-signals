/**
 * Edge Function: get-publications
 *
 * Returns published publications for authenticated pro subscribers.
 * Bypasses PostgREST/RLS — auth and access control handled in code.
 *
 * Flow:
 *   1. Verify the user JWT from the Authorization header.
 *   2. Look up the user's email in subscribers (plan=pro, status=active).
 *   3. If subscriber: return published weekly/monthly publications.
 *   4. If not subscriber: return 403.
 */

import { createServiceRoleClient } from "../_shared/supabase.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET, OPTIONS",
    },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-max-age": "86400",
      },
    });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // 1. Extract and verify the user JWT.
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

  // 2. Check subscriber access.
  const { data: subscriber } = await supabase
    .from("subscribers")
    .select("plan, status")
    .filter("email", "ilike", user.email ?? "")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!subscriber) {
    return jsonResponse({ error: "No active subscription found" }, 403);
  }

  // Determine which publication types the plan grants.
  const planTypes: Record<string, string[]> = {
    pro: ["weekly", "monthly", "sample"],
  };
  const allowedTypes = planTypes[subscriber.plan] ?? [];

  if (allowedTypes.length === 0) {
    return jsonResponse({ error: "Plan does not include archive access" }, 403);
  }

  // 3. Fetch publications.
  const { data: publications, error: pubError } = await supabase
    .from("publications")
    .select("id, title, type, period_start, period_end, body_markdown, created_at")
    .eq("status", "published")
    .in("type", allowedTypes)
    .order("created_at", { ascending: false });

  if (pubError) {
    console.error("Failed to fetch publications", pubError);
    return jsonResponse({ error: "Failed to fetch publications" }, 500);
  }

  return jsonResponse({ publications: publications ?? [] }, 200);
});
