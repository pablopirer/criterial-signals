/**
 * Edge Function: admin-samples
 *
 * Read-only view of the sample pipeline for the Admin (Checkpoint 3 ·
 * Fase 1). Same admin gate as every other admin-* function.
 *
 *   GET /admin-samples → every sample_request + its lead + the publication
 *                        it produced (title + public_token, so the Admin can
 *                        open the delivered muestra).
 *
 * READ-ONLY on purpose: retrying or re-sending a sample means calling
 * Anthropic and Resend for real money, so those actions stay out of this
 * checkpoint (the approved prototype showed "Reintentar" / "Reenviar email"
 * buttons — they are deliberately not wired). There is no PATCH and no
 * DELETE here.
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
    const { data: samples, error } = await supabase
      .from("sample_requests")
      .select(
        "id, lead_id, topic, status, is_test, created_at, sent_at, sample_publication_id",
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch sample_requests", error);
      return jsonResponse({ error: "No se pudieron obtener las muestras" }, 500);
    }

    const rows = samples ?? [];

    const leadIds = [
      ...new Set(rows.map((s: { lead_id: string }) => s.lead_id)),
    ];
    let leadsById = new Map<string, unknown>();
    if (leadIds.length) {
      const { data: leads } = await supabase
        .from("leads")
        .select("id, email, full_name, company_name, source, is_test")
        .in("id", leadIds);
      leadsById = new Map((leads ?? []).map((l: { id: string }) => [l.id, l]));
    }

    const pubIds = rows
      .map((s: { sample_publication_id: string | null }) =>
        s.sample_publication_id
      )
      .filter(Boolean);
    let pubsById = new Map<string, unknown>();
    if (pubIds.length) {
      const { data: pubs } = await supabase
        .from("publications")
        .select("id, title, public_token, status, is_test")
        .in("id", pubIds);
      pubsById = new Map((pubs ?? []).map((p: { id: string }) => [p.id, p]));
    }

    return jsonResponse({
      samples: rows.map((s: Record<string, unknown>) => ({
        ...s,
        lead: leadsById.get(s.lead_id as string) ?? null,
        publication: s.sample_publication_id
          ? pubsById.get(s.sample_publication_id as string) ?? null
          : null,
      })),
    }, 200);
  } catch (err) {
    console.error("admin-samples error", err);
    return jsonResponse({ error: "Error interno" }, 500);
  }
});
