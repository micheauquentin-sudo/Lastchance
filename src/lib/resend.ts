import "server-only";

import { Resend } from "resend";
import { optionalEnv } from "@/lib/env";

/**
 * Envoi de l'email de gain. Best-effort : si Resend n'est pas configuré
 * (dev) ou échoue, on loggue sans bloquer la participation — le client
 * a déjà son code à l'écran.
 */
export async function sendPrizeEmail(params: {
  to: string;
  firstName: string;
  prizeLabel: string;
  prizeDescription: string;
  redeemCode: string;
  organizationName: string;
}): Promise<void> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_EMAIL");

  if (!apiKey || !from) {
    console.warn(
      `[resend] non configuré (RESEND_API_KEY: ${apiKey ? "ok" : "MANQUANTE"}, ` +
        `RESEND_FROM_EMAIL: ${from ? "ok" : "MANQUANTE"}) — email de gain non envoyé`,
    );
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `🎁 Votre gain chez ${params.organizationName}`,
      html: prizeEmailHtml(params),
    });

    if (error) {
      // Causes fréquentes : domaine non vérifié dans Resend, ou compte en
      // mode test (n'envoie qu'à l'adresse du propriétaire du compte).
      console.error("[resend] envoi échoué:", JSON.stringify(error));
      return;
    }
    console.log(`[resend] email de gain envoyé (id: ${data?.id})`);
  } catch (err) {
    console.error("[resend] exception à l'envoi:", err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function prizeEmailHtml(p: {
  firstName: string;
  prizeLabel: string;
  prizeDescription: string;
  redeemCode: string;
  organizationName: string;
}): string {
  const name = escapeHtml(p.firstName);
  const label = escapeHtml(p.prizeLabel);
  const desc = escapeHtml(p.prizeDescription);
  const code = escapeHtml(p.redeemCode);
  const org = escapeHtml(p.organizationName);

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;text-align:center;">
      <p style="font-size:13px;letter-spacing:2px;color:#7c3aed;text-transform:uppercase;margin:0 0 12px;">${org}</p>
      <h1 style="font-size:24px;color:#18181b;margin:0 0 8px;">Félicitations ${name} 🎉</h1>
      <p style="color:#52525b;font-size:15px;margin:0 0 24px;">Vous avez gagné :</p>
      <p style="font-size:20px;font-weight:bold;color:#18181b;margin:0 0 4px;">${label}</p>
      ${desc ? `<p style="color:#71717a;font-size:14px;margin:0 0 24px;">${desc}</p>` : ""}
      <div style="background:#f4f4f5;border-radius:12px;padding:20px;margin:24px 0;">
        <p style="font-size:11px;letter-spacing:2px;color:#71717a;margin:0 0 6px;">VOTRE CODE</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;color:#18181b;margin:0;font-family:monospace;">${code}</p>
      </div>
      <p style="color:#71717a;font-size:13px;margin:0;">Présentez ce code en caisse pour récupérer votre gain.</p>
    </div>
    <p style="text-align:center;color:#a1a1aa;font-size:11px;margin:16px 0 0;">
      Vous recevez cet email car vous avez participé au jeu de ${org}.
    </p>
  </div>
</body>
</html>`;
}
