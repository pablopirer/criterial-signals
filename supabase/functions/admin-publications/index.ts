/**
 * Edge Function: admin-publications
 *
 * CRUD for the publications table, restricted to the admin email.
 * Bypasses RLS via service role key.
 *
 * Methods:
 *   GET    — list all publications (draft + published), newest first
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

  // ── GET: list all publications ─────────────────────────────────────────────
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("publications")
      .select("id, type, title, period_start, period_end, status, created_at")
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
