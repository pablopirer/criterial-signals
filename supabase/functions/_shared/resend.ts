/**
 * Thin wrapper around the Resend Emails API.
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "noreply@criterialsignals.com";
const ARCHIVE_URL = "https://pablopirer.github.io/criterial-signals/archive.html";

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
    .map((t) => `<span style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:11px;padding:3px 9px;border-radius:4px;background:#f0ede8;color:#666;margin-right:6px;">${t}</span>`)
    .join("");
  const signalsHtml = briefData.signals
    .map((s, i) => `
      <div style="padding:14px 0;border-bottom:1px solid #f0ede8;">
        <div style="display:flex;gap:10px;align-items:baseline;margin-bottom:5px;">
          <span style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:600;letter-spacing:.06em;color:#999990;min-width:18px;">0${i + 1}</span>
          <span style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;font-weight:600;color:#0D1F3C;">${s.titulo}</span>
        </div>
        <p style="font-size:13px;line-height:1.65;color:#555;margin:0 0 0 28px;">${s.cuerpo}</p>
      </div>`)
    .join("");
  const watchHtml = briefData.watch
    .map((w) => `
      <div style="margin-bottom:12px;">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:12px;font-weight:600;color:#0D1F3C;margin-bottom:3px;">${w.titulo}</div>
        <p style="font-size:12px;line-height:1.6;color:#666;margin:0;">${w.cuerpo}</p>
      </div>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8;padding:32px 16px;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="padding:28px 40px 24px;border-bottom:1px solid #e8e4dc;">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:.12em;color:#999990;margin-bottom:16px;">CRITERIAL SIGNALS</div>
    <div style="font-size:20px;font-weight:400;color:#0D1F3C;line-height:1.3;margin:0 0 6px;">${briefData.titulo}</div>
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#999990;margin-bottom:12px;">${briefData.subtitulo}</div>
    <div>${tagsHtml}</div>
  </td></tr>
  <tr><td style="padding:28px 40px;">
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#444;margin:0 0 24px;">${greeting}</p>
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:600;letter-spacing:.14em;color:#999990;text-transform:uppercase;margin:0 0 10px;">Executive Snapshot</div>
    <p style="font-size:15px;line-height:1.75;color:#333;border-left:2px solid #0D1F3C;padding-left:16px;margin:0 0 28px;">${briefData.snapshot}</p>
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:600;letter-spacing:.14em;color:#999990;text-transform:uppercase;margin:0 0 4px;">Three Relevant Signals</div>
    <div style="margin:0 0 28px;">${signalsHtml}</div>
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:600;letter-spacing:.14em;color:#999990;text-transform:uppercase;margin:0 0 10px;">What to Watch</div>
    <div style="background:#f7f5f0;border-radius:6px;padding:16px 18px;margin:0 0 28px;">${watchHtml}</div>
    <hr style="border:none;border-top:1px solid #e8e4dc;margin:0 0 24px;">
    <div style="text-align:center;padding:4px 0 8px;">
      <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#666;margin:0 0 14px;">El plan Pro incluye señales semanales, un brief mensual y acceso al archivo completo.</p>
      <a href="https://criterialsignals.com/pricing.html" style="display:inline-block;background:#0D1F3C;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:12px;font-weight:500;letter-spacing:.04em;padding:11px 28px;border-radius:4px;text-decoration:none;">Ver plan Pro</a>
    </div>
  </td></tr>
  <tr><td style="padding:16px 40px 24px;border-top:1px solid #e8e4dc;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:.1em;color:#999990;">CRITERIAL SIGNALS</td>
      <td align="right"><a href="https://criterialsignals.com" style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:10px;color:#999990;text-decoration:none;">criterialsignals.com</a></td>
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
  const firstName = input.recipientName ? input.recipientName.split(" ")[0] : "";
  const greeting = firstName ? `Hola ${firstName},` : "Hola,";
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8;padding:32px 16px;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="padding:28px 40px 24px;border-bottom:1px solid #e8e4dc;">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:.12em;color:#999990;margin-bottom:16px;">CRITERIAL SIGNALS</div>
    <div style="font-size:20px;font-weight:400;color:#0D1F3C;line-height:1.3;margin:0 0 6px;">Bienvenido al plan Pro.</div>
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#999990;">Tu suscripción ya está activa.</div>
  </td></tr>
  <tr><td style="padding:28px 40px;">
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#444;margin:0 0 24px;">${greeting}</p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.7;color:#444;margin:0 0 24px;">Tu suscripción al plan Pro de Criterial Signals ya está activa. A partir de ahora recibirás:</p>
    <div style="background:#f7f5f0;border-radius:6px;padding:16px 18px;margin:0 0 28px;">
      <div style="padding:8px 0;border-bottom:1px solid #e8e4dc;">
        <span style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#0D1F3C;">· Señales semanales de mercado sobre España</span>
      </div>
      <div style="padding:8px 0;border-bottom:1px solid #e8e4dc;">
        <span style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#0D1F3C;">· Brief mensual premium</span>
      </div>
      <div style="padding:8px 0;">
        <span style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#0D1F3C;">· Acceso al archivo completo de publicaciones</span>
      </div>
    </div>
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:600;letter-spacing:.14em;color:#999990;text-transform:uppercase;margin:0 0 10px;">Cómo acceder al archivo</div>
    <div style="background:#f7f5f0;border-radius:6px;padding:16px 18px;margin:0 0 28px;">
      <div style="padding:6px 0;"><span style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#555;">1. Ve a <a href="${ARCHIVE_URL}" style="color:#0D1F3C;">criterialsignals.com/archive.html</a></span></div>
      <div style="padding:6px 0;"><span style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#555;">2. Introduce este email y solicita un enlace de acceso</span></div>
      <div style="padding:6px 0;"><span style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#555;">3. Haz clic en el enlace que recibirás en tu bandeja</span></div>
    </div>
    <hr style="border:none;border-top:1px solid #e8e4dc;margin:0 0 24px;">
    <div style="text-align:center;padding:4px 0 8px;">
      <a href="${ARCHIVE_URL}" style="display:inline-block;background:#0D1F3C;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:12px;font-weight:500;letter-spacing:.04em;padding:11px 28px;border-radius:4px;text-decoration:none;">Ir al archivo</a>
    </div>
  </td></tr>
  <tr><td style="padding:16px 40px 24px;border-top:1px solid #e8e4dc;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:.1em;color:#999990;">CRITERIAL SIGNALS</td>
      <td align="right"><a href="https://criterialsignals.com" style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:10px;color:#999990;text-decoration:none;">criterialsignals.com</a></td>
    </tr></table>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildAdvisoryConfirmationHtml(recipientName: string, tipoEncargo: string, descripcion: string): string {
  const firstName = recipientName ? recipientName.split(" ")[0] : "";
  const greeting = firstName ? `Hola ${firstName},` : "Hola,";
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8;padding:32px 16px;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="padding:28px 40px 24px;border-bottom:1px solid #e8e4dc;">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:.12em;color:#999990;margin-bottom:16px;">CRITERIAL</div>
    <div style="font-size:20px;font-weight:400;color:#0D1F3C;line-height:1.3;margin:0 0 6px;">Hemos recibido tu consulta.</div>
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#999990;">Advisory — ${tipoEncargo}</div>
  </td></tr>
  <tr><td style="padding:28px 40px;">
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#444;margin:0 0 24px;">${greeting}</p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.7;color:#444;margin:0 0 24px;">Hemos recibido tu consulta de <strong>${tipoEncargo}</strong>. Revisaremos los detalles y te responderemos con una propuesta de alcance y coste en menos de 24 horas.</p>
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:600;letter-spacing:.14em;color:#999990;text-transform:uppercase;margin:0 0 10px;">Tu consulta</div>
    <div style="background:#f7f5f0;border-radius:6px;padding:16px 18px;margin:0 0 28px;">
      <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.65;color:#555;margin:0;">${descripcion}</p>
    </div>
    <hr style="border:none;border-top:1px solid #e8e4dc;margin:0 0 24px;">
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#666;margin:0;">Si tienes alguna pregunta adicional, puedes responder directamente a este email.</p>
  </td></tr>
  <tr><td style="padding:16px 40px 24px;border-top:1px solid #e8e4dc;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetice Neue',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:.1em;color:#999990;">CRITERIAL</td>
      <td align="right"><a href="https://criterialsignals.com" style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:10px;color:#999990;text-decoration:none;">criterialsignals.com</a></td>
    </tr></table>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildAdvisoryInternalHtml(recipientName: string, userEmail: string, tipoEncargo: string, descripcion: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8;padding:32px 16px;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="padding:28px 40px 24px;border-bottom:1px solid #e8e4dc;">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:.12em;color:#999990;margin-bottom:16px;">CRITERIAL — INTERNO</div>
    <div style="font-size:20px;font-weight:400;color:#0D1F3C;line-height:1.3;">Nueva consulta Advisory</div>
  </td></tr>
  <tr><td style="padding:28px 40px;">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:600;letter-spacing:.14em;color:#999990;text-transform:uppercase;margin:0 0 10px;">Datos del contacto</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#999990;padding:6px 0;width:120px;">Nombre</td><td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#0D1F3C;padding:6px 0;">${recipientName}</td></tr>
      <tr><td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#999990;padding:6px 0;">Email</td><td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#0D1F3C;padding:6px 0;"><a href="mailto:${userEmail}" style="color:#0D1F3C;">${userEmail}</a></td></tr>
      <tr><td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#999990;padding:6px 0;">Tipo</td><td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#0D1F3C;padding:6px 0;">${tipoEncargo}</td></tr>
    </table>
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:600;letter-spacing:.14em;color:#999990;text-transform:uppercase;margin:0 0 10px;">Descripción</div>
    <div style="background:#f7f5f0;border-radius:6px;padding:16px 18px;">
      <p style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.65;color:#555;margin:0;">${descripcion}</p>
    </div>
  </td></tr>
  <tr><td style="padding:16px 40px 24px;border-top:1px solid #e8e4dc;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:.1em;color:#999990;">CRITERIAL</td>
      <td align="right"><a href="https://criterialsignals.com" style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:10px;color:#999990;text-decoration:none;">criterialsignals.com</a></td>
    </tr></table>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
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
