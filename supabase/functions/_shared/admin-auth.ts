/**
 * Shared admin gate for the Admin Edge Functions (Checkpoint 3 · Fase 1).
 *
 * Replicates verbatim the pattern already proven in admin-publications:
 * a user JWT in the Authorization header is verified server-side with the
 * service role client, and the resulting email must match ADMIN_EMAIL.
 * The browser-side check in the Admin page is only cosmetic — THIS is the
 * real gate, and it runs before any query touches the database.
 *
 * TODO (checkpoint posterior): mover ADMIN_EMAIL a variable de entorno.
 * Hoy está hardcodeado aquí igual que en admin-publications, send-weekly,
 * send-open-edition y generate-linkedin; moverlo es una mejora transversal
 * que merece su propio checkpoint (hay que fijar el secreto en el entorno
 * de las 8 funciones a la vez para no dejar ninguna sin gate).
 */

import { createServiceRoleClient } from "./supabase.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const ADMIN_EMAIL = "pablopirer@gmail.com";

export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, PATCH, OPTIONS",
};

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

export function preflight(): Response {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "access-control-max-age": "86400" },
  });
}

export interface AdminContext {
  supabase: SupabaseClient;
  email: string;
}

/**
 * Returns an AdminContext when the caller is the admin, or a ready-to-return
 * Response (401/403) when they are not. Callers do:
 *
 *   const gate = await requireAdmin(req);
 *   if (gate instanceof Response) return gate;
 *   const { supabase } = gate;
 */
export async function requireAdmin(
  req: Request,
): Promise<AdminContext | Response> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing authorization header" }, 401);
  }
  const jwt = authHeader.slice(7);

  const supabase = createServiceRoleClient();
  const { data: { user }, error } = await supabase.auth.getUser(jwt);

  if (error || !user) {
    return jsonResponse({ error: "Invalid or expired token" }, 401);
  }
  if (user.email !== ADMIN_EMAIL) {
    return jsonResponse({ error: "Acceso restringido" }, 403);
  }

  return { supabase, email: user.email };
}

/**
 * Canonical pipeline vocabularies (Checkpoint 3, decision D5). Free text in
 * the database (no CHECK constraints, deliberately — the pipeline is still
 * settling), so the Edge Functions are the ones that enforce them: an
 * arbitrary value sent by a client is rejected, not written.
 */
export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "customer",
  "discarded",
] as const;

export const ADVISORY_STATUSES = [
  "new",
  "in_progress",
  "quoted",
  "won",
  "lost",
] as const;
