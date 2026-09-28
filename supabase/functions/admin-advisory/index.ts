/**
 * Edge Function: admin-advisory
 *
 * Advisory pipeline for the Admin (Checkpoint 3 · Fase 1). Same admin gate
 * as every other admin-* function.
 *
 *   GET   /admin-advisory  → every advisory_request joined to its lead
 *   PATCH /admin-advisory  → { id, status }
 *
 * Only `status` is writable. `tipo_encargo` and `descripcion` are what the
 * client actually asked for — the Admin records progress against the
 * request, it does not rewrite the request itself.
 *
 * No delete endpoint, by design.
 *
 * Note on scope: the approved prototype showed importe / fecha de entrega /
 * entregable on each card. Those columns do NOT exist in advisory_requests
 * and D6 settled that this checkpoint adds no migration, so the Admin omits
 * them rather than faking them. They are the natural content of a later
 * migration if the Advisory pipeline earns it.
 */

import {
  ADVISORY_STATUSES,
  jsonResponse,
  preflight,
  requireAdmin,
} from "../_shared/admin-auth.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflight();

  const gate = await requireAdmin(req);
  if (gate instanceof Response) return gate;
  const { supabase } = gate;

  try {
    if (req.method === "GET") {
      const { data: requests, error } = await supabase
        .from("advisory_requests")
        .select(
          "id, lead_id, tipo_encargo, descripcion, status, is_test, created_at",
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch advisory_requests", error);
        return jsonResponse({ error: "No se pudieron obtener las solicitudes" }, 500);
      }

      const leadIds = [
        ...new Set((requests ?? []).map((r: { lead_id: string }) => r.lead_id)),
      ];
      let leadsById = new Map<string, unknown>();
      if (leadIds.length) {
        const { data: leads } = await supabase
          .from("leads")
          .select("id, email, full_name, company_name, source, status, is_test")
          .in("id", leadIds);
        leadsById = new Map(
          (leads ?? []).map((l: { id: string }) => [l.id, l]),
        );
      }

      return jsonResponse({
        requests: (requests ?? []).map((r: Record<string, unknown>) => ({
          ...r,
          lead: leadsById.get(r.lead_id as string) ?? null,
        })),
      }, 200);
    }

    if (req.method === "PATCH") {
      let body: { id?: string; status?: string };
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const { id, status } = body;
      if (!id) return jsonResponse({ error: "id es obligatorio" }, 400);
      if (status === undefined) {
        return jsonResponse({ error: "status es obligatorio" }, 400);
      }
      if (!(ADVISORY_STATUSES as readonly string[]).includes(status)) {
        return jsonResponse(
          {
            error: `status no válido. Valores admitidos: ${
              ADVISORY_STATUSES.join(", ")
            }`,
          },
          400,
        );
      }

      const { data, error } = await supabase
        .from("advisory_requests")
        .update({ status })
        .eq("id", id)
        .select("id, lead_id, tipo_encargo, status, is_test, created_at")
        .maybeSingle();

      if (error) {
        console.error("Failed to update advisory_request", error);
        return jsonResponse({ error: "No se pudo actualizar la solicitud" }, 500);
      }
      if (!data) return jsonResponse({ error: "Solicitud no encontrada" }, 404);

      return jsonResponse({ ok: true, request: data, updated: ["status"] }, 200);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("admin-advisory error", err);
    return jsonResponse({ error: "Error interno" }, 500);
  }
});
