/**
 * Thin wrapper around the Resend Emails API.
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "noreply@criterialsignals.com";

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
