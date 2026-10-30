/**
 * Thin wrapper around the Resend Emails API.
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "noreply@criterialsignals.com";
const ARCHIVE_URL = "https://criterialsignals.com/archive.html";

// ── Ledger email frame ─────────────────────────────────────────────────────
// Same identity as the site (styles.v15.css): white card on a light grey
// canvas, serif headline, one blue accent, hairline rules. Table layout and
// inline styles only, 600px max, system font fallbacks (most clients ignore
// web fonts). Every interpolated value goes through escHtml: names,
// descriptions and titles come from forms or the database.
const SITE_URL = "https://criterialsignals.com";
const L_SERIF = "Georgia,'Times New Roman',serif";
const L_SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const L_MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

function escHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function greetingFor(recipientName: string): string {
  const firstName = recipientName ? recipientName.trim().split(/\s+/)[0] : "";
  return firstName ? `Hola ${firstName},` : "Hola,";
}

interface LedgerEmailParts {
  preheader: string;
  eyebrow: string;
  title: string;
  /** Trusted HTML built by the caller from escaped values. */
  bodyHtml: string;
  cta?: { label: string; url: string };
  /** Trusted HTML appended to the footer line (e.g. unsubscribe link). */
  footExtra?: string;
}

function ledgerParagraph(html: string, last = false): string {
  return `<p style="margin:0 0 ${last ? 0 : 16}px;font:400 15px/1.65 ${L_SANS};color:#2A2E35;">${html}</p>`;
}

function ledgerRows(rows: Array<[string, string]>): string {
  const cells = rows.map(([a, b]) =>
    `<tr><td style="padding:12px 14px 12px 0;border-bottom:1px solid #E7E7E3;vertical-align:top;width:96px;font:500 10.5px/1.6 ${L_MONO};letter-spacing:.06em;text-transform:uppercase;color:#646A73;">${a}</td>` +
    `<td style="padding:12px 0;border-bottom:1px solid #E7E7E3;font:400 15px/1.5 ${L_SANS};color:#0B0D10;">${b}</td></tr>`
  ).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0;border-top:1px solid #0B0D10;">${cells}</table>`;
}

function ledgerQuote(html: string): string {
  return `<div style="margin:8px 0 0;padding:16px 18px;background:#F6F6F3;border-radius:4px;font:400 14px/1.65 ${L_SANS};color:#2A2E35;">${html}</div>`;
}

function ledgerEmail(p: LedgerEmailParts): string {
  const btn = p.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 4px;"><tr><td style="background:#0B0D10;border-radius:4px;">` +
      `<a href="${escHtml(p.cta.url)}" style="display:inline-block;padding:14px 24px;font:600 14px ${L_SANS};color:#ffffff;text-decoration:none;">${escHtml(p.cta.label)}</a></td></tr></table>`
    : "";
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escHtml(p.title)}</title></head>
<body style="margin:0;padding:0;background:#F6F6F3;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escHtml(p.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F6F3;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #E7E7E3;border-radius:6px;">
<tr><td style="padding:22px 32px;border-bottom:1px solid #E7E7E3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font:400 22px ${L_SERIF};color:#0B0D10;">Criterial<span style="color:#2F5BA8;">.</span></td>
<td align="right" style="font:500 10.5px ${L_MONO};letter-spacing:.08em;text-transform:uppercase;color:#646A73;">${escHtml(p.eyebrow)}</td>
</tr></table></td></tr>
<tr><td style="padding:32px 32px 8px;">
<h1 style="margin:0 0 16px;font:400 26px/1.25 ${L_SERIF};color:#0B0D10;letter-spacing:-.01em;">${escHtml(p.title)}</h1>
${p.bodyHtml}${btn}</td></tr>
<tr><td style="padding:28px 32px 26px;"><p style="margin:0;padding-top:18px;border-top:1px solid #E7E7E3;font:400 12px/1.6 ${L_SANS};color:#989DA5;">
Criterial. — Inteligencia de capital privado · España · <a href="${SITE_URL}" style="color:#646A73;">criterialsignals.com</a>${p.footExtra ?? ""}</p></td></tr>
</table></td></tr></table>
</body>
</html>`;
}

export interface BriefData {
  titulo: string;
  subtitulo: string;
  tags: string[];
  snapshot: string;
  signals: Array<{ titulo: string; cuerpo: string }>;
  watch: Array<{ titulo: string; cuerpo: string }>;
}

export interface SendBriefEmailInput {
  to: string;
  recipientName: string;
  interestType: string;
  briefData: BriefData;
}

function buildBriefHtml(input: SendBriefEmailInput): string {
  const { briefData, recipientName } = input;
  const firstName = recipientName ? recipientName.split(" ")[0] : "";
  const greeting = firstName ? `Hola ${firstName},` : "Hola,";
  const tagsHtml = briefData.tags
    .map((t) => `<span style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:11px;padding:3px 10px;background:#F4F0EA;color:#888;margin-right:6px;display:inline-block;">${t}</span>`)
    .join("");
  const signalsHtml = briefData.signals
    .map((s, i) => `
      <div style="padding:16px 0;border-bottom:0.5px solid #E2DED8;">
        <div style="margin-bottom:6px;">
          <span style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:500;letter-spacing:.14em;color:#BBB;margin-right:10px;">0${i + 1}</span>
          <span style="font-family:Georgia,'Times New Roman',serif;font-size:13px;font-weight:400;color:#0D1F3C;">${s.titulo}</span>
        </div>
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.65;color:#555;margin:0 0 0 26px;">${s.cuerpo}</p>
      </div>`)
    .join("");
  const watchHtml = briefData.watch
    .map((w) => `
      <div style="margin-bottom:14px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;font-weight:400;color:#0D1F3C;margin-bottom:4px;">${w.titulo}</div>
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.6;color:#666;margin:0;">${w.cuerpo}</p>
      </div>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F0EA;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 16px;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border:0.5px solid #E2DED8;">
  <tr><td style="padding:32px 44px 28px;border-bottom:0.5px solid #E2DED8;">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:#BBB;margin-bottom:18px;">CRITERIAL SIGNALS</div>
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:400;color:#0D1F3C;line-height:1.25;margin:0 0 8px;">${briefData.titulo}</div>
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#999;margin-bottom:16px;">${briefData.subtitulo}</div>
    <div>${tagsHtml}</div>
  </td></tr>
  <tr><td style="padding:32px 44px;">
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#444;margin:0 0 28px;">${greeting}</p>
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:#BBB;margin:0 0 12px;">Resumen ejecutivo</div>
    <p style="font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.75;color:#333;border-left:1.5px solid #0D1F3C;padding-left:16px;margin:0 0 32px;">${briefData.snapshot}</p>
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:#BBB;margin:0 0 4px;">Señales relevantes</div>
    <div style="margin:0 0 32px;">${signalsHtml}</div>
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:#BBB;margin:0 0 12px;">Qué vigilar</div>
    <div style="background:#F8F6F2;border:0.5px solid #E2DED8;padding:20px 22px;margin:0 0 32px;">${watchHtml}</div>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding-top:24px;border-top:0.5px solid #E2DED8;">
      <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#666;margin:0 0 16px;">El plan Pro incluye señales semanales, un brief mensual y acceso al archivo completo.</p>
      <a href="https://criterialsignals.com/pricing.html" style="display:inline-block;background:#0D1F3C;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:12px;font-weight:500;letter-spacing:.04em;padding:12px 28px;text-decoration:none;">Ver plan Pro</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:18px 44px;border-top:0.5px solid #E2DED8;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:.1em;color:#CCC;">CRITERIAL SIGNALS</td>
      <td align="right"><a href="https://criterialsignals.com" style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:10px;color:#CCC;text-decoration:none;">criterialsignals.com</a></td>
    </tr></table>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export async function sendBriefEmail(
  input: SendBriefEmailInput,
): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set in the function environment");
  }

  const subject = "Tu muestra de Criterial Signals";

  const firstName = input.recipientName ? input.recipientName.split(" ")[0] : "";
  const greeting = firstName ? `Hola ${firstName},` : "Hola,";

  const text = [
    greeting,
    "",
    "Aquí tienes tu muestra de Criterial Signals:",
    "",
    "---",
    "",
    `## Executive Snapshot\n\n${input.briefData.snapshot}`,
    "",
    "## Three Relevant Signals",
    "",
    ...input.briefData.signals.map((s, i) => `0${i + 1}. ${s.titulo}\n\n${s.cuerpo}`),
    "",
    "## What to Watch",
    "",
    ...input.briefData.watch.map((w) => `${w.titulo}\n\n${w.cuerpo}`),
    "",
    "---",
    "",
    "El plan Pro incluye señales semanales, un brief mensual y acceso al archivo completo.",
    "",
    "https://criterialsignals.com/pricing.html",
    "",
    "Criterial Signals",
  ].join("\n");

  const html = buildBriefHtml(input);

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [input.to],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Resend API returned ${response.status}: ${errorBody.slice(0, 500)}`,
    );
  }
}

/**
 * Sample "envelope" email — the new Sample deliverable lives on the web
 * (muestra.html). This email is intentionally minimal: brand, the brief's
 * title and thesis, the topic, and a single CTA to open the interactive
 * muestra. Supersedes buildBriefHtml/sendBriefEmail, which rendered the full
 * brief inline (kept above for back-compat but no longer used).
 */
export interface SendSampleEnvelopeInput {
  to: string;
  recipientName: string;
  titulo: string;
  tesis: string;
  tematica: string;
  sector?: string;
  url: string;
}

function buildSampleEnvelopeHtml(input: SendSampleEnvelopeInput): string {
  const topic = [input.tematica, input.sector].filter(Boolean).map(escHtml).join(" · ");
  return ledgerEmail({
    preheader: "Tu muestra interactiva de Criterial. ya está lista.",
    eyebrow: "Muestra",
    title: input.titulo,
    bodyHtml:
      ledgerParagraph(escHtml(greetingFor(input.recipientName))) +
      ledgerParagraph(`Hemos preparado tu muestra de Signals${topic ? ` sobre <strong style="color:#0B0D10;">${topic}</strong>` : ""}. Es una pieza interactiva: ábrela para explorar el análisis, las señales del periodo y el mapa de posicionamiento del mercado.`) +
      (input.tesis ? ledgerQuote(escHtml(input.tesis)) : ""),
    cta: { label: "Abrir tu muestra →", url: input.url },
  });
}

export async function sendSampleEnvelope(
  input: SendSampleEnvelopeInput,
): Promise<void> {
  const subject = `Tu muestra sobre ${input.tematica} · Criterial.`;
  const firstName = input.recipientName ? input.recipientName.split(" ")[0] : "";
  const greeting = firstName ? `Hola ${firstName},` : "Hola,";
  const text = [
    greeting,
    "",
    "Hemos preparado tu muestra de Signals. Es una pieza interactiva: ábrela para explorar el análisis, las señales del periodo y el mapa de capital del mercado.",
    "",
    input.titulo,
    input.tesis,
    "",
    `Abrir tu muestra: ${input.url}`,
    "",
    "Criterial.",
  ].join("\n");

  await sendEmail({ to: input.to, subject, text, html: buildSampleEnvelopeHtml(input) });
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set in the function environment");
  }

  const body: Record<string, unknown> = {
    from: FROM_ADDRESS,
    to: [input.to],
    subject: input.subject,
    text: input.text,
  };
  if (input.html) body.html = input.html;

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Resend API returned ${response.status}: ${errorBody.slice(0, 500)}`,
    );
  }
}

function buildWelcomeHtml(input: SendWelcomeEmailInput): string {
  return ledgerEmail({
    preheader: "Tu suscripción Pro está activa.",
    eyebrow: "Pro",
    title: "Tu suscripción Pro está activa.",
    bodyHtml:
      ledgerParagraph(escHtml(greetingFor(input.recipientName))) +
      ledgerParagraph("Tu suscripción al plan Pro de Criterial Signals ya está activa. Desde hoy recibes el Weekly completo, el Brief Mensual y el acceso al archivo de todas las publicaciones.") +
      ledgerRows([
        ["Paso 1", `Entra en <a href="${ARCHIVE_URL}" style="color:#2F5BA8;">criterialsignals.com/archive.html</a>`],
        ["Paso 2", "Escribe este email y solicita un enlace de acceso"],
        ["Paso 3", "Abre el enlace que recibirás en tu bandeja"],
      ]),
    cta: { label: "Ir al archivo →", url: ARCHIVE_URL },
  });
}

function buildAdvisoryConfirmationHtml(recipientName: string, tipoEncargo: string, descripcion: string): string {
  return ledgerEmail({
    preheader: "Te responderemos en menos de 24 horas.",
    eyebrow: "Advisory",
    title: "Hemos recibido tu consulta.",
    bodyHtml:
      ledgerParagraph(escHtml(greetingFor(recipientName))) +
      ledgerParagraph(`Hemos recibido tu consulta de <strong style="color:#0B0D10;">${escHtml(tipoEncargo)}</strong>. Revisaremos los detalles y te responderemos con una propuesta de alcance y coste en menos de 24 horas.`) +
      ledgerRows([["Tipo", escHtml(tipoEncargo)]]) +
      ledgerQuote(escHtml(descripcion).replace(/\n/g, "<br>")) +
      `<div style="height:16px;"></div>` +
      ledgerParagraph("Si tienes alguna pregunta adicional, puedes responder directamente a este email.", true),
  });
}

function buildAdvisoryInternalHtml(recipientName: string, userEmail: string, tipoEncargo: string, descripcion: string): string {
  return ledgerEmail({
    preheader: `Nueva consulta Advisory de ${recipientName}`,
    eyebrow: "Interno",
    title: "Nueva consulta Advisory",
    bodyHtml:
      ledgerRows([
        ["Nombre", escHtml(recipientName)],
        ["Email", `<a href="mailto:${escHtml(userEmail)}" style="color:#2F5BA8;">${escHtml(userEmail)}</a>`],
        ["Tipo", escHtml(tipoEncargo)],
      ]) +
      ledgerQuote(escHtml(descripcion).replace(/\n/g, "<br>")),
  });
}

export interface SendWelcomeEmailInput {
  to: string;
  recipientName: string;
}

export async function sendWelcomeEmail(
  input: SendWelcomeEmailInput,
): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set in the function environment");
  }

  const firstName = input.recipientName
    ? input.recipientName.split(" ")[0]
    : "";
  const greeting = firstName ? `Hola ${firstName},` : "Hola,";

  const text = [
    greeting,
    "",
    "Tu suscripción al plan Pro de Criterial Signals ya está activa.",
    "",
    "A partir de ahora recibirás:",
    "  · Señales semanales de mercado sobre España",
    "  · Un brief mensual premium",
    "  · Acceso al archivo completo de publicaciones",
    "",
    "Para acceder al archivo:",
    `1. Ve a ${ARCHIVE_URL}`,
    "2. Introduce este email y solicita un enlace de acceso",
    "3. Haz clic en el enlace que recibirás en tu bandeja de entrada",
    "",
    "Si tienes cualquier pregunta, responde directamente a este email.",
    "",
    "Criterial Signals",
  ].join("\n");

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [input.to],
      subject: "Bienvenido a Criterial Signals Pro",
      text,
      html: buildWelcomeHtml(input),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Resend API returned ${response.status}: ${errorBody.slice(0, 500)}`,
    );
  }
}

export interface SendPublicationNotificationInput {
  to: string;
  publicationTitle: string;
  publicationPeriod: string;
  publicationType: "weekly" | "monthly";
}

function buildPublicationNotificationHtml(
  input: SendPublicationNotificationInput,
): string {
  const weekly = input.publicationType === "weekly";
  return ledgerEmail({
    preheader: weekly ? "El Weekly Signals de esta semana ya está en tu archivo." : "El Brief Mensual ya está en tu archivo.",
    eyebrow: weekly ? "Weekly · Pro" : "Brief Mensual · Pro",
    title: input.publicationTitle,
    bodyHtml:
      `<p style="margin:0 0 18px;font:500 10.5px ${L_MONO};letter-spacing:.06em;text-transform:uppercase;color:#646A73;">${escHtml(input.publicationPeriod)}</p>` +
      ledgerParagraph(weekly
        ? "El Weekly Signals de esta semana ya está disponible en tu archivo Pro, con el patrón, la implicación y el read-through de cada señal."
        : "El Brief Mensual de este mes ya está disponible en tu archivo Pro."),
    cta: { label: "Leer en el archivo →", url: ARCHIVE_URL },
    footExtra: `<br>¿No puedes entrar? Solicita el enlace de acceso en <a href="${ARCHIVE_URL}" style="color:#646A73;">criterialsignals.com/archive.html</a> con el email de tu suscripción.`,
  });
}

export async function sendPublicationNotification(
  input: SendPublicationNotificationInput,
): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const typeLabel = input.publicationType === "weekly" ? "Weekly Signals" : "Brief Mensual";
  const subject = `${input.publicationTitle} — Criterial Signals`;

  const text = [
    "Hola,",
    "",
    `${typeLabel} de Criterial ya disponible en el archivo Pro.`,
    "",
    input.publicationTitle,
    input.publicationPeriod,
    "",
    `Accede en: ${ARCHIVE_URL}`,
    "",
    "Criterial Signals",
  ].join("\n");

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [input.to],
      subject,
      text,
      html: buildPublicationNotificationHtml(input),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Resend API returned ${response.status}: ${errorBody.slice(0, 500)}`,
    );
  }
}

// ── Open Signals newsletter (free edition) ──────────────────────────────────
// signals.html captures emails inline; these two emails are the newsletter
// lifecycle: a confirmation on subscribe, then one email per new open edition.
// Both carry the mandatory unsubscribe link in the footer.

const SIGNALS_URL = "https://criterialsignals.com/signals.html";

function buildSignalsFooter(unsubscribeUrl: string): string {
  return ` · <a href="${escHtml(unsubscribeUrl)}" style="color:#646A73;">Darse de baja</a>`;
}

export interface SendSignalsConfirmationInput {
  to: string;
  unsubscribeUrl: string;
}

function buildSignalsConfirmationHtml(input: SendSignalsConfirmationInput): string {
  return ledgerEmail({
    preheader: "Estás suscrito a la edición abierta de Criterial Signals.",
    eyebrow: "Signals",
    title: "Ya estás suscrito a Signals.",
    bodyHtml:
      ledgerParagraph("Gracias por suscribirte. Recibirás cada nueva edición abierta de Criterial Signals —las señales del mercado español de capital privado— directamente en tu correo.") +
      ledgerParagraph("El análisis en profundidad de cada señal, el read-through de la semana y el Brief Mensual son parte de Pro.", true),
    cta: { label: "Ver las ediciones →", url: SIGNALS_URL },
    footExtra: buildSignalsFooter(input.unsubscribeUrl),
  });
}

export async function sendSignalsConfirmation(
  input: SendSignalsConfirmationInput,
): Promise<void> {
  const text = [
    "Estás dentro.",
    "",
    "Gracias por suscribirte. Recibirás cada nueva edición abierta de Criterial Signals —las señales del mercado español de capital privado— en tu correo.",
    "",
    `Ver las ediciones: ${SIGNALS_URL}`,
    "",
    `Darse de baja: ${input.unsubscribeUrl}`,
    "",
    "Criterial.",
  ].join("\n");

  await sendEmail({
    to: input.to,
    subject: "Estás suscrito a Criterial Signals · Edición abierta",
    text,
    html: buildSignalsConfirmationHtml(input),
  });
}

export interface SendOpenEditionInput {
  to: string;
  title: string;
  period: string;
  editionUrl: string;
  unsubscribeUrl: string;
}

function buildOpenEditionHtml(input: SendOpenEditionInput): string {
  return ledgerEmail({
    preheader: "Nueva edición abierta de Criterial Signals.",
    eyebrow: "Signals · Edición abierta",
    title: input.title,
    bodyHtml:
      `<p style="margin:0 0 18px;font:500 10.5px ${L_MONO};letter-spacing:.06em;text-transform:uppercase;color:#646A73;">${escHtml(input.period)}</p>` +
      ledgerParagraph("Ya está disponible la nueva edición abierta: las señales de la semana en el mercado español de capital privado, con el mapa de posicionamiento del periodo.") +
      ledgerParagraph(`El análisis de cada señal (patrón e implicación), el read-through y el Brief Mensual son parte de <a href="${SITE_URL}/pricing.html" style="color:#2F5BA8;">Pro</a>.`, true),
    cta: { label: "Leer la edición →", url: input.editionUrl },
    footExtra: buildSignalsFooter(input.unsubscribeUrl),
  });
}

export async function sendOpenEditionEmail(
  input: SendOpenEditionInput,
): Promise<void> {
  const text = [
    input.title,
    input.period,
    "",
    "Ya está disponible la nueva edición abierta de Criterial Signals.",
    "",
    `Leer la edición: ${input.editionUrl}`,
    "",
    `Darse de baja: ${input.unsubscribeUrl}`,
    "",
    "Criterial Signals",
  ].join("\n");

  await sendEmail({
    to: input.to,
    subject: `${input.title} — Criterial Signals`,
    text,
    html: buildOpenEditionHtml(input),
  });
}

export interface SendAdvisoryEmailInput {
  toUser: string;
  toInternal: string;
  recipientName: string;
  tipoEncargo: string;
  descripcion: string;
}

export async function sendAdvisoryEmails(
  input: SendAdvisoryEmailInput,
): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const firstName = input.recipientName ? input.recipientName.split(" ")[0] : "";
  const greeting = firstName ? `Hola ${firstName},` : "Hola,";

  const confirmRes = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [input.toUser],
      subject: "Hemos recibido tu consulta — Criterial",
      text: `${greeting}\n\nHemos recibido tu consulta de ${input.tipoEncargo}.\n\nTe responderemos con una propuesta de alcance y coste en menos de 24 horas.\n\nCriterial\ncriterialsignals.com`,
      html: buildAdvisoryConfirmationHtml(input.recipientName, input.tipoEncargo, input.descripcion),
    }),
  });
  if (!confirmRes.ok) {
    const body = await confirmRes.text();
    throw new Error(`Resend (confirmation) ${confirmRes.status}: ${body.slice(0, 500)}`);
  }

  const internalRes = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [input.toInternal],
      subject: `Nueva consulta Advisory — ${input.tipoEncargo}`,
      text: `Nueva consulta recibida.\n\nNombre: ${input.recipientName}\nEmail: ${input.toUser}\nTipo: ${input.tipoEncargo}\n\nDescripción:\n${input.descripcion}`,
      html: buildAdvisoryInternalHtml(input.recipientName, input.toUser, input.tipoEncargo, input.descripcion),
    }),
  });
  if (!internalRes.ok) {
    const body = await internalRes.text();
    throw new Error(`Resend (internal) ${internalRes.status}: ${body.slice(0, 500)}`);
  }
}
