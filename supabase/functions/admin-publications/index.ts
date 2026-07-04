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
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

/**
 * Auto-notify Pro subscribers when a weekly/monthly becomes published.
 * Reuses the existing send-weekly Edge Function (forwarding the admin JWT) so
 * the email logic lives in exactly one place — this is never a second copy of
 * the template. Idempotent: only sends when notified_at is null, then stamps it,
 * so re-publishing never re-emails. Failures are logged, not fatal (publishing
 * already succeeded); notified_at stays null so a later publish can retry. The
 * manual "Enviar →" button (send-weekly) still works as a re-send.
 */
async function notifyOnPublish(
  supabase: ReturnType<typeof createServiceRoleClient>,
  publicationId: string,
  authHeader: string,
): Promise<void> {
  try {
    const { data: pub } = await supabase
      .from("publications")
      .select("id, type, status, notified_at")
      .eq("id", publicationId)
      .single();
    if (!pub || pub.status !== "published") return;
    if (pub.type !== "weekly" && pub.type !== "monthly") return;
    if (pub.notified_at) return; // already notified — idempotent

    const base = Deno.env.get("SUPABASE_URL");
    const res = await fetch(`${base}/functions/v1/send-weekly`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: authHeader },
      body: JSON.stringify({ publication_id: publicationId }),
    });
    if (!res.ok) {
      console.error(
        "auto-notify: send-weekly failed",
        res.status,
        (await res.text()).slice(0, 300),
      );
      return;
    }
    await supabase
      .from("publications")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", publicationId);
  } catch (err) {
    console.error("auto-notify error:", err);
  }
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
      body_public?: string | null;
      period_start?: string;
      period_end?: string;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { type, title, body_markdown, body_public, period_start, period_end } = body;
    if (!type || !title || !body_markdown || !period_start || !period_end) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    // body_public is the reduced free/public projection (weekly only); nullable.
    const { data, error } = await supabase
      .from("publications")
      .insert({
        type,
        title,
        body_markdown,
        body_public: body_public ?? null,
        status: "draft",
        period_start,
        period_end,
      })
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

    // On publish, notify Pro subscribers automatically (idempotent). Runs in the
    // background so the admin's "Publicar" click returns immediately; falls back
    // to inline await if the background runtime isn't available.
    if (status === "published") {
      const p = notifyOnPublish(supabase, id!, authHeader);
      const rt = (globalThis as {
        EdgeRuntime?: { waitUntil(pr: Promise<unknown>): void };
      }).EdgeRuntime;
      if (rt) rt.waitUntil(p);
      else await p;
    }

    return jsonResponse({ ok: true }, 200);
  }

  // ── DELETE: delete publication ─────────────────────────────────────────────
  if (req.method === "DELETE") {
    let body: { id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { id } = body;
    if (!id) {
      return jsonResponse({ error: "id is required" }, 400);
    }

    const { error } = await supabase
      .from("publications")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Failed to delete publication:", error);
      return jsonResponse({ error: "Failed to delete publication" }, 500);
    }

    return jsonResponse({ ok: true }, 200);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});
