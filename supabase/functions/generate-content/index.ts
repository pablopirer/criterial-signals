/**
 * Edge Function: generate-content
 *
 * Generates 3 content variations (weekly or monthly) via Anthropic.
 * Restricted to the admin email. Returns variations for selection in the
 * admin panel — does NOT write to the database.
 *
 * Flow:
 *   1. Verify user JWT.
 *   2. Check email is the admin email.
 *   3. Parse type (weekly | monthly) from request body.
 *   4. Compute current period dates and label.
 *   5. Call Anthropic 3× in parallel with the matching prompt.
 *   6. Return { variations, type, title, period_start, period_end }.
 */

import { generateBrief } from "../_shared/anthropic.ts";
import { createServiceRoleClient } from "../_shared/supabase.ts";
import { weeklyPrompt, monthlyPrompt } from "../_shared/prompts.ts";

const ADMIN_EMAIL = "pablopirer@gmail.com";

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function computePeriod(type: "weekly" | "monthly"): {
  periodLabel: string;
  title: string;
  period_start: string;
  period_end: string;
} {
  const now = new Date();
  const month = MONTHS_ES[now.getMonth()];
  const year = now.getFullYear();

  if (type === "weekly") {
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - daysToMonday);

    const mondayLabel = `${monday.getDate()} de ${MONTHS_ES[monday.getMonth()]}`;
    const todayLabel = `${now.getDate()} de ${month} de ${year}`;

    return {
      periodLabel: `${mondayLabel} al ${todayLabel}`,
      title: `Weekly Signals — ${now.getDate()} de ${month} de ${year}`,
      period_start: fmtDate(monday),
      period_end: fmtDate(now),
    };
  } else {
    return {
      periodLabel: `${month} de ${year}`,
      title: `Monthly Brief — ${month} ${year}`,
      period_start: `${year}-${pad(now.getMonth() + 1)}-01`,
      period_end: fmtDate(now),
    };
  }
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
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

  let body: { type?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const type = body.type;
  if (type !== "weekly" && type !== "monthly") {
    return jsonResponse({ error: "type must be 'weekly' or 'monthly'" }, 400);
  }

  const { periodLabel, title, period_start, period_end } = computePeriod(type);
  const prompt = type === "weekly" ? weeklyPrompt : monthlyPrompt;
  const userWithPeriod = prompt.user.replace("{{period}}", periodLabel);

  try {
    const [v1, v2, v3] = await Promise.all([
      generateBrief({ interestType: "", prompt: { system: prompt.system, user: userWithPeriod }, maxTokens: 6000 }),
      generateBrief({ interestType: "", prompt: { system: prompt.system, user: userWithPeriod }, maxTokens: 6000 }),
      generateBrief({ interestType: "", prompt: { system: prompt.system, user: userWithPeriod }, maxTokens: 6000 }),
    ]);

    return jsonResponse({
      variations: [v1.text, v2.text, v3.text],
      type,
      title,
      period_start,
      period_end,
    }, 200);
  } catch (err) {
    console.error("Anthropic generation failed:", err);
    return jsonResponse({ error: "Content generation failed" }, 500);
  }
});
