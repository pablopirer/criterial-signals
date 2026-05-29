/**
 * Edge Function: admin-publications
 *
 * CRUD for the publications table, restricted to the admin email.
 * Bypasses RLS via service role key.
 *
 * Methods:
 *   GET    — list all publications (draft + published), newest first
 *             ?action=metrics  — returns aggregated counts across all tables
 *   POST   — create a draft. Body: { type, title, body_markdown, period_start, period_end }
 *   PATCH  — update status.  Body: { id, status: "published" | "draft" }
 */

import { createServiceRoleClient } from "../_shared/supabase.ts";

const ADMIN_EMAIL = "pablopirer@gmail.com";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

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
  if (user.email !== ADMIN_EMAIL) {
    return jsonResponse({ error: "Acceso restringido" }, 403);
  }

  // ── GET ───────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);

    // ?action=metrics — aggregated counts across all tables
    if (url.searchParams.get("action") === "metrics") {
      const [leadsRes, subsRes, samplesRes, pubsRes] = await Promise.all([
        supabase.from("leads").select("status"),
        supabase.from("subscribers").select("plan, status"),
        supabase.from("sample_requests").select("status"),
        supabase.from("publications").select("type, status"),
      ]);

      const groupBy = <T extends Record<string, string>>(
        rows: T[] | null,
        key: keyof T,
      ): Record<string, number> =>
        (rows ?? []).reduce((acc, row) => {
          const val = row[key] ?? "unknown";
          acc[val] = (acc[val] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>);

      const leads      = leadsRes.data ?? [];
      const subs       = subsRes.data ?? [];
      const samples    = samplesRes.data ?? [];
      const pubs       = pubsRes.data ?? [];

      const pubsByType   = groupBy(pubs as Record<string, string>[], "type");
      const pubsByStatus = groupBy(pubs as Record<string, string>[], "status");

      return jsonResponse({
        leads: {
          total:    leads.length,
          byStatus: groupBy(leads as Record<string, string>[], "status"),
        },
        subscribers: {
          proActive: subs.filter(s => s.plan === "pro" && s.status === "active").length,
        },
        sampleRequests: {
          total:    samples.length,
          byStatus: groupBy(samples as Record<string, string>[], "status"),
        },
        publications: {
          total:    pubs.length,
          byType:   pubsByType,
          byStatus: pubsByStatus,
        },
      }, 200);
    }

    // default — list all publications
    const { data, error } = await supabase
      .from("publications")
      .select("id, type, title, body_markdown, period_start, period_end, status, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch publications:", error);
      return jsonResponse({ error: "Failed to fetch publications" }, 500);
    }

    return jsonResponse({ publications: data ?? [] }, 200);
  }

  // ── POST: create draft ─────────────────────────────────────────────────────
  if (req.method === "POST") {
    let body: {
      type?: string;
      title?: string;
      body_markdown?: string;
      period_start?: string;
      period_end?: string;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { type, title, body_markdown, period_start, period_end } = body;
    if (!type || !title || !body_markdown || !period_start || !period_end) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const { data, error } = await supabase
      .from("publications")
      .insert({ type, title, body_markdown, status: "draft", period_start, period_end })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create draft:", error);
      return jsonResponse({ error: "Failed to create draft" }, 500);
    }

    return jsonResponse({ id: data.id }, 201);
  }

  // ── PATCH: update status ───────────────────────────────────────────────────
  if (req.method === "PATCH") {
    let body: { id?: string; status?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { id, status } = body;
    if (!id || !["published", "draft"].includes(status ?? "")) {
      return jsonResponse({ error: "id and status ('published'|'draft') are required" }, 400);
    }

    const { error } = await supabase
      .from("publications")
      .update({ status })
      .eq("id", id);

    if (error) {
      console.error("Failed to update publication:", error);
      return jsonResponse({ error: "Failed to update publication" }, 500);
    }

    return jsonResponse({ ok: true }, 200);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});
