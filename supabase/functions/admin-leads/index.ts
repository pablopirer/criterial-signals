/**
 * Edge Function: admin-leads
 *
 * Reads and narrowly updates the `leads` table for the Admin (Checkpoint 3 ·
 * Fase 1). Auth is the shared admin gate (JWT + ADMIN_EMAIL) — see
 * _shared/admin-auth.ts.
 *
 *   GET  /admin-leads            → list, every lead + its aggregates
 *   GET  /admin-leads?id=<uuid>  → detail: lead + full trail across tables
 *   PATCH /admin-leads           → { id, status?, notes?, is_test? }
 *
 * The PATCH is deliberately narrow: those three fields and nothing else.
 * `source`, `email`, `created_at` and every other column are not writable
 * from the Admin — the source in particular is the acquisition record and
 * must keep the first-touch value (Checkpoint 2, decision 2a).
 *
 * There is NO delete endpoint, by design.
 *
 * `is_test` is returned on every row so the Admin can badge test data and
 * filter by it; it is writable one row at a time (decision D3) because
 * promoting a lead to "real" is the one judgement call the operator has to
 * make by hand while the DEFAULT stays true.
 */

import {
  jsonResponse,
  LEAD_STATUSES,
  preflight,
  requireAdmin,
} from "../_shared/admin-auth.ts";

/** Aggregates are computed in memory: at this volume (tens of leads) it is
 * one round-trip per table instead of N+1 per lead. Revisit if leads grow
 * into the thousands. */
async function buildList(supabase: ReturnType<typeof Object>) {
  // deno-lint-ignore no-explicit-any
  const sb = supabase as any;

  const [leadsRes, samplesRes, advisoryRes, signalsRes, subsRes] = await Promise
    .all([
      sb.from("leads").select(
        "id, email, full_name, company_name, website, interest_type, source, status, notes, is_test, created_at, last_contact_at",
      ).order("created_at", { ascending: false }),
      sb.from("sample_requests").select("id, lead_id, status, created_at"),
      sb.from("advisory_requests").select("id, lead_id, status, created_at"),
      sb.from("signals_subscribers").select("email, status"),
      sb.from("subscribers").select("email, plan, status"),
    ]);

  if (leadsRes.error) throw leadsRes.error;

  const samples = samplesRes.data ?? [];
  const advisory = advisoryRes.data ?? [];
  const signalsByEmail = new Map(
    (signalsRes.data ?? []).map((r: { email: string; status: string }) => [
      r.email,
      r.status,
    ]),
  );
  const subsByEmail = new Map(
    (subsRes.data ?? []).map((
      r: { email: string; plan: string; status: string },
    ) => [r.email, r]),
  );

  return (leadsRes.data ?? []).map((l: Record<string, unknown>) => {
    const id = l.id as string;
    const email = l.email as string;
    const sub = subsByEmail.get(email);
    return {
      ...l,
      n_samples: samples.filter((s: { lead_id: string }) => s.lead_id === id)
        .length,
      n_advisory: advisory.filter((a: { lead_id: string }) => a.lead_id === id)
        .length,
      signals_status: signalsByEmail.get(email) ?? null,
      pro_plan: sub ? `${sub.plan}/${sub.status}` : null,
    };
  });
}

async function buildDetail(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  id: string,
) {
  const { data: lead, error } = await supabase
    .from("leads")
    .select(
      "id, email, full_name, company_name, website, interest_type, source, status, notes, is_test, created_at, last_contact_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!lead) return null;

  const [samplesRes, advisoryRes, signalsRes, subsRes] = await Promise.all([
    supabase
      .from("sample_requests")
      .select(
        "id, topic, status, is_test, created_at, sent_at, sample_publication_id",
      )
      .eq("lead_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("advisory_requests")
      .select("id, tipo_encargo, descripcion, status, is_test, created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("signals_subscribers")
      .select("id, status, source, is_test, created_at")
      .eq("email", lead.email)
      .maybeSingle(),
    supabase
      .from("subscribers")
      .select("id, plan, status, is_test, created_at, subscription_start")
      .eq("email", lead.email)
      .maybeSingle(),
  ]);

  const samples = samplesRes.data ?? [];

  // Resolve the publication title/token for the samples that produced one,
  // so the Admin can link straight to the delivered muestra.
  const pubIds = samples
    .map((s: { sample_publication_id: string | null }) =>
      s.sample_publication_id
    )
    .filter(Boolean);
  let pubsById = new Map<string, { title: string; public_token: string }>();
  if (pubIds.length) {
    const { data: pubs } = await supabase
      .from("publications")
      .select("id, title, public_token")
      .in("id", pubIds);
    pubsById = new Map(
      (pubs ?? []).map((
        p: { id: string; title: string; public_token: string },
      ) => [p.id, { title: p.title, public_token: p.public_token }]),
    );
  }

  return {
    lead,
    samples: samples.map((s: Record<string, unknown>) => ({
      ...s,
      publication: s.sample_publication_id
        ? pubsById.get(s.sample_publication_id as string) ?? null
        : null,
    })),
    advisory: advisoryRes.data ?? [],
    signals_subscription: signalsRes.data ?? null,
    pro_subscription: subsRes.data ?? null,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflight();

  const gate = await requireAdmin(req);
  if (gate instanceof Response) return gate;
  const { supabase } = gate;

  try {
    if (req.method === "GET") {
      const id = new URL(req.url).searchParams.get("id");
      if (id) {
        const detail = await buildDetail(supabase, id);
        if (!detail) return jsonResponse({ error: "Lead no encontrado" }, 404);
        return jsonResponse(detail, 200);
      }
      return jsonResponse({ leads: await buildList(supabase) }, 200);
    }

    if (req.method === "PATCH") {
      let body: {
        id?: string;
        status?: string;
        notes?: string;
        is_test?: boolean;
      };
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const { id, status, notes, is_test } = body;
      if (!id) return jsonResponse({ error: "id es obligatorio" }, 400);

      // Build the patch from ONLY the three allowed fields. Anything else in
      // the body is ignored rather than written.
      const patch: Record<string, unknown> = {};

      if (status !== undefined) {
        if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
          return jsonResponse(
            {
              error: `status no válido. Valores admitidos: ${
                LEAD_STATUSES.join(", ")
              }`,
            },
            400,
          );
        }
        patch.status = status;
      }
      if (notes !== undefined) {
        if (typeof notes !== "string") {
          return jsonResponse({ error: "notes debe ser texto" }, 400);
        }
        patch.notes = notes.trim() === "" ? null : notes;
      }
      if (is_test !== undefined) {
        if (typeof is_test !== "boolean") {
          return jsonResponse({ error: "is_test debe ser booleano" }, 400);
        }
        patch.is_test = is_test;
      }

      if (Object.keys(patch).length === 0) {
        return jsonResponse(
          { error: "Nada que actualizar (status, notes o is_test)" },
          400,
        );
      }

      const { data, error } = await supabase
        .from("leads")
        .update(patch)
        .eq("id", id)
        .select(
          "id, email, source, status, notes, is_test, created_at, last_contact_at",
        )
        .maybeSingle();

      if (error) {
        console.error("Failed to update lead", error);
        return jsonResponse({ error: "No se pudo actualizar el lead" }, 500);
      }
      if (!data) return jsonResponse({ error: "Lead no encontrado" }, 404);

      return jsonResponse({ ok: true, lead: data, updated: Object.keys(patch) }, 200);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("admin-leads error", err);
    return jsonResponse({ error: "Error interno" }, 500);
  }
});
