/**
 * Edge Function: generate-linkedin
 *
 * Generates LinkedIn post drafts from an EXISTING publication (a weekly/monthly
 * edition). One draft per angle (señal, recap, temático, opinión) for the
 * Criterial company page. Restricted to the admin email. Does NOT write to the
 * database — the drafts are returned for the admin to copy/paste and publish
 * manually on LinkedIn (no LinkedIn API in this phase).
 *
 * Why derive from an existing edition instead of generating fresh:
 *   - Consistency with what's already on signals.html.
 *   - Fast and cheap: no web search, small max_tokens. Unlike generate-content
 *     (which runs synchronously near the wall-clock ceiling), this stays well
 *     within limits.
 *
 * Flow:
 *   1. Verify admin JWT (same pattern as generate-content).
 *   2. Parse { publication_id } from body.
 *   3. Read the publication (title, type, body_markdown, period).
 *   4. Strip the HTML body to plain text (drops the base64 map placeholder).
 *   5. Call Anthropic with the linkedin prompt (no tools).
 *   6. Parse JSON via extractJsonObject.
 *   7. Return { posts, publication_title }.
 */

import { generateBrief } from "../_shared/anthropic.ts";
import { createServiceRoleClient } from "../_shared/supabase.ts";
import { linkedinPrompt } from "../_shared/prompts.ts";
import { extractJsonObject } from "../_shared/json.ts";

const ADMIN_EMAIL = "pablopirer@gmail.com";
const SIGNALS_URL = "https://criterialsignals.com/signals.html";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
};

interface LinkedinPost {
  angulo: string;
  titulo_interno: string;
  cuerpo: string;
  primer_comentario: string;
}

/**
 * Reduce the stored HTML body to plain text for the model. Block-level closing
 * tags become newlines to preserve some structure. The `<div class="pub-map"
 * data-mapa="<base64>">` placeholder is removed by the generic tag strip — the
 * base64 lives inside the tag and contains no '>', so `<[^>]*>` consumes it
 * whole (its content is useless as prose anyway).
 */
function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|div|h1|h2|h3|h4|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
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

  let body: { publication_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const publicationId = body.publication_id;
  if (!publicationId) {
    return jsonResponse({ error: "publication_id es obligatorio" }, 400);
  }

  const { data: pub, error: pubErr } = await supabase
    .from("publications")
    .select("title, type, body_markdown, period_start, period_end")
    .eq("id", publicationId)
    .single();

  if (pubErr || !pub) {
    return jsonResponse({ error: "Publicación no encontrada" }, 404);
  }
  if (pub.type !== "weekly" && pub.type !== "monthly") {
    return jsonResponse(
      { error: "Solo se pueden generar posts de una edición Weekly o Brief Mensual." },
      400,
    );
  }

  const editionText = stripHtml(pub.body_markdown || "");
  if (editionText.length < 50) {
    return jsonResponse(
      { error: "La publicación no tiene contenido suficiente para generar posts." },
      400,
    );
  }

  const periodLabel = pub.period_start === pub.period_end
    ? (pub.period_start ?? "")
    : `${pub.period_start ?? ""} – ${pub.period_end ?? ""}`;

  const userPrompt = linkedinPrompt.user
    .replace(/\{\{title\}\}/g, pub.title ?? "")
    .replace(/\{\{period\}\}/g, periodLabel)
    .replace(/\{\{edition\}\}/g, editionText)
    .replace(/\{\{url\}\}/g, SIGNALS_URL);

  try {
    const result = await generateBrief({
      interestType: "",
      prompt: { system: linkedinPrompt.system, user: userPrompt },
      maxTokens: 3000,
    });

    let parsed: { posts?: LinkedinPost[] };
    try {
      parsed = JSON.parse(extractJsonObject(result.text)) as { posts?: LinkedinPost[] };
    } catch (parseErr) {
      console.error("LinkedIn JSON parse failed:", parseErr);
      console.error("Raw model output (first 800 chars):", result.text.slice(0, 800));
      return jsonResponse(
        { error: "El modelo devolvió contenido no parseable como JSON. Vuelve a generar." },
        502,
      );
    }

    const posts = Array.isArray(parsed.posts) ? parsed.posts : [];
    if (posts.length === 0) {
      return jsonResponse(
        { error: "El modelo no devolvió posts. Vuelve a generar." },
        502,
      );
    }

    return jsonResponse({ posts, publication_title: pub.title }, 200);
  } catch (err) {
    console.error("Anthropic generation failed:", err);
    return jsonResponse({ error: "Error al generar los posts. Inténtalo de nuevo." }, 500);
  }
});
