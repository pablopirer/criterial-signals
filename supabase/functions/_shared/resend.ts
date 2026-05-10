/**
 * Thin wrapper around the Resend Emails API.
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "noreply@criterialsignals.com";
const ARCHIVE_URL = "https://pablopirer.github.io/criterial-signals/archive.html";

export interface SendBriefEmailInput {
  to: string;
  recipientName: string;
  interestType: string;
  briefText: string;
}

export async function sendBriefEmail(
  input: SendBriefEmailInput,
): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set in the function environment");
  }

  const subject = "Tu muestra de Criterial Signals";

  const text = [
    `Hola${input.recipientName ? ` ${input.recipientName.split(" ")[0]}` : ""},`,
    "",
    "Aquí tienes tu muestra de Criterial Signals:",
    "",
    "---",
    "",
    input.briefText,
    "",
    "---",
    "",
    "Si el formato te convence, el plan Pro te da acceso a señales semanales",
    "y una lectura mensual más estructurada.",
    "",
    "https://criterialsignals.com/pricing.html",
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
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Resend API returned ${response.status}: ${errorBody.slice(0, 500)}`,
    );
  }
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
    "  · Señales semanales de mercado sobre Iberia",
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
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Resend API returned ${response.status}: ${errorBody.slice(0, 500)}`,
    );
  }
}
