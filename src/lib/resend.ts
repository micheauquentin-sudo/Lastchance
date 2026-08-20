import "server-only";

import { Resend } from "resend";
import { APP_URL, optionalEnv } from "@/lib/env";
// Aucun échec d'envoi n'atteignait Sentry : ce module ne journalisait qu'en
// console, donc une panne de domaine ou un compte Resend en mode test
// n'émettait aucune alerte — les emails de gain, de code de chasse et de
// rappel disparaissaient en silence.
import { recordCounter, reportError } from "@/lib/monitoring";
// Type SEUL (effacé à la compilation) : `weekly-digest.ts` importe les envois
// de ce module, l'inverse ne doit rien ajouter à l'exécution. Même geste que
// `automations.ts` avec `@/lib/jobs`.
import type { WeeklyDigestStats } from "@/lib/weekly-digest";

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
  /** Échéance serveur du code, quand la campagne en pose une. */
  redeemExpiresAt?: string | null;
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
      reportError("resend", `envoi échoué: ${JSON.stringify(error)}`);
      return;
    }
    console.log(`[resend] email de gain envoyé (id: ${data?.id})`);
  } catch (err) {
    reportError("resend", `exception à l'envoi: ${err}`);
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
  redeemExpiresAt?: string | null;
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
      ${
        p.redeemExpiresAt
          ? `<p style="color:#b91c1c;font-size:13px;font-weight:bold;margin:8px 0 0;">À présenter avant le ${escapeHtml(
              new Date(p.redeemExpiresAt).toLocaleString("fr-FR", {
                dateStyle: "short",
                timeStyle: "short",
              }),
            )} — passé ce délai, le code n'est plus valable.</p>`
          : ""
      }
    </div>
    <p style="text-align:center;color:#a1a1aa;font-size:11px;margin:16px 0 0;">
      Vous recevez cet email car vous avez participé au jeu de ${org}.
    </p>
  </div>
</body>
</html>`;
}

/**
 * Email transactionnel du code de retrait d'une chasse au trésor terminée.
 * Best-effort (miroir de sendPrizeEmail) : le joueur a déjà son code à
 * l'écran, l'email n'est qu'un rappel — jamais requis pour voir le code.
 */
export async function sendHuntRewardEmail(params: {
  to: string;
  huntName: string;
  rewardLabel: string;
  rewardDetails: string | null;
  code: string;
  organizationName: string;
}): Promise<boolean> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_EMAIL");

  if (!apiKey || !from) {
    console.warn(
      `[resend] non configuré (RESEND_API_KEY: ${apiKey ? "ok" : "MANQUANTE"}, ` +
        `RESEND_FROM_EMAIL: ${from ? "ok" : "MANQUANTE"}) — code de chasse non envoyé`,
    );
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `🗺️ Votre code chez ${params.organizationName}`,
      html: huntRewardEmailHtml(params),
    });

    if (error) {
      reportError("resend", `code de chasse échoué: ${JSON.stringify(error)}`);
      return false;
    }
    console.log(`[resend] code de chasse envoyé (id: ${data?.id})`);
    return true;
  } catch (err) {
    reportError("resend", `code de chasse, exception: ${err}`);
    return false;
  }
}

function huntRewardEmailHtml(p: {
  huntName: string;
  rewardLabel: string;
  rewardDetails: string | null;
  code: string;
  organizationName: string;
}): string {
  const hunt = escapeHtml(p.huntName);
  const label = escapeHtml(p.rewardLabel);
  const desc = p.rewardDetails ? escapeHtml(p.rewardDetails) : "";
  const code = escapeHtml(p.code);
  const org = escapeHtml(p.organizationName);

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;text-align:center;">
      <p style="font-size:13px;letter-spacing:2px;color:#7c3aed;text-transform:uppercase;margin:0 0 12px;">${org}</p>
      <h1 style="font-size:24px;color:#18181b;margin:0 0 8px;">Chasse terminée 🗺️</h1>
      <p style="color:#52525b;font-size:15px;margin:0 0 24px;">Bravo, vous avez bouclé « ${hunt} » ! Votre récompense :</p>
      <p style="font-size:20px;font-weight:bold;color:#18181b;margin:0 0 4px;">${label}</p>
      ${desc ? `<p style="color:#71717a;font-size:14px;margin:0 0 24px;">${desc}</p>` : ""}
      <div style="background:#f4f4f5;border-radius:12px;padding:20px;margin:24px 0;">
        <p style="font-size:11px;letter-spacing:2px;color:#71717a;margin:0 0 6px;">VOTRE CODE</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;color:#18181b;margin:0;font-family:monospace;">${code}</p>
      </div>
      <p style="color:#71717a;font-size:13px;margin:0;">Présentez ce code en caisse pour récupérer votre lot.</p>
    </div>
    <p style="text-align:center;color:#a1a1aa;font-size:11px;margin:16px 0 0;">
      Vous recevez cet email car vous avez participé à la chasse au trésor de ${org}.
    </p>
  </div>
</body>
</html>`;
}

function calendarReminderEmailHtml(p: {
  calendarName: string;
  organizationName: string;
  calendarUrl: string;
}): string {
  const cal = escapeHtml(p.calendarName);
  const org = escapeHtml(p.organizationName);
  const url = escapeHtml(p.calendarUrl);

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;text-align:center;">
      <p style="font-size:13px;letter-spacing:2px;color:#f97316;text-transform:uppercase;margin:0 0 16px;">${org}</p>
      <h1 style="font-size:22px;color:#18181b;margin:0 0 12px;">Votre case du jour est prête 🎁</h1>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Une nouvelle case de « ${cal} » vient de s'ouvrir. Découvrez ce qui vous attend aujourd'hui !
      </p>
      <a href="${url}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 28px;border-radius:12px;">
        Ouvrir ma case
      </a>
    </div>
    <p style="text-align:center;color:#a1a1aa;font-size:11px;margin:16px 0 0;">
      Vous recevez ce rappel car vous l'avez demandé sur le calendrier de ${org}.
    </p>
  </div>
</body>
</html>`;
}

/**
 * Rappel quotidien « votre case du jour est prête » (opt-in reminder RGPD,
 * dédoublonné inter-runs par email_log côté cron). Best-effort : retourne false
 * si l'envoi n'est pas parti (non configuré ou refus). En-tête List-Unsubscribe
 * (mailto) : le joueur peut demander l'arrêt des rappels, canal de désinscription
 * requis en messagerie de masse.
 */
export async function sendCalendarReminderEmail(params: {
  to: string;
  calendarName: string;
  organizationName: string;
  calendarUrl: string;
}): Promise<boolean> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_EMAIL");
  if (!apiKey || !from) {
    console.warn("[resend] non configuré — rappel calendrier non envoyé");
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `🎁 Votre case du jour chez ${params.organizationName}`,
      html: calendarReminderEmailHtml({
        calendarName: params.calendarName,
        organizationName: params.organizationName,
        calendarUrl: params.calendarUrl,
      }),
      headers: {
        "List-Unsubscribe": `<mailto:${from}?subject=unsubscribe-calendar>`,
      },
    });
    if (error) {
      reportError("resend", `rappel calendrier échoué: ${JSON.stringify(error)}`);
      return false;
    }
    return true;
  } catch (err) {
    reportError("resend", `rappel calendrier, exception: ${err}`);
    return false;
  }
}

function newsletterEmailHtml(p: {
  subject: string;
  bodyText: string;
  organizationName: string;
  unsubscribeUrl: string;
}): string {
  const subject = escapeHtml(p.subject);
  const org = escapeHtml(p.organizationName);
  // Texte brut → HTML : échappé puis sauts de ligne convertis, seule
  // mise en forme autorisée (pas d'éditeur riche côté commerçant).
  const body = escapeHtml(p.bodyText).replaceAll("\n", "<br>");

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;">
      <p style="font-size:13px;letter-spacing:2px;color:#f97316;text-transform:uppercase;margin:0 0 16px;">${org}</p>
      <h1 style="font-size:22px;color:#18181b;margin:0 0 16px;">${subject}</h1>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0;">${body}</p>
    </div>
    <p style="text-align:center;color:#a1a1aa;font-size:11px;margin:16px 0 0;">
      Vous recevez cet email car vous vous êtes inscrit(e) à la newsletter de ${org}.
      <a href="${p.unsubscribeUrl}" style="color:#a1a1aa;">Se désinscrire</a>.
    </p>
  </div>
</body>
</html>`;
}

function teamInviteEmailHtml(p: {
  organizationName: string;
  inviteUrl: string;
}): string {
  const org = escapeHtml(p.organizationName);

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;text-align:center;">
      <p style="font-size:13px;letter-spacing:2px;color:#f97316;text-transform:uppercase;margin:0 0 16px;">Invitation</p>
      <h1 style="font-size:22px;color:#18181b;margin:0 0 12px;">Rejoignez l'équipe de ${org}</h1>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Vous avez été invité(e) à accéder au dashboard Lastchance de ${org}.
      </p>
      <a href="${p.inviteUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 28px;border-radius:12px;">
        Accepter l'invitation
      </a>
      <p style="color:#a1a1aa;font-size:12px;margin:24px 0 0;">
        Ce lien expire dans 7 jours. Si vous n'attendiez pas cette invitation, ignorez cet email.
      </p>
    </div>
  </div>
</body>
</html>`;
}

/** Envoi de l'email d'invitation d'équipe. Best-effort, jamais bloquant. */
export async function sendTeamInviteEmail(params: {
  to: string;
  organizationName: string;
  inviteUrl: string;
}): Promise<boolean> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_EMAIL");
  if (!apiKey || !from) {
    console.warn("[resend] non configuré — invitation d'équipe non envoyée");
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `Rejoignez l'équipe de ${params.organizationName} sur Lastchance`,
      html: teamInviteEmailHtml({
        organizationName: params.organizationName,
        inviteUrl: params.inviteUrl,
      }),
    });
    if (error) {
      reportError("resend", `invitation d'équipe échouée: ${JSON.stringify(error)}`);
      return false;
    }
    return true;
  } catch (err) {
    reportError("resend", `invitation d'équipe, exception: ${err}`);
    return false;
  }
}

function contestRecoveryEmailHtml(p: {
  contestName: string;
  organizationName: string;
  recoverUrl: string;
}): string {
  const contest = escapeHtml(p.contestName);
  const org = escapeHtml(p.organizationName);

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;text-align:center;">
      <p style="font-size:13px;letter-spacing:2px;color:#f97316;text-transform:uppercase;margin:0 0 16px;">${org}</p>
      <h1 style="font-size:22px;color:#18181b;margin:0 0 12px;">Retrouvez vos pronostics 🔑</h1>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Cliquez pour retrouver votre grille, vos points et votre classement
        du championnat « ${contest} » sur cet appareil.
      </p>
      <a href="${p.recoverUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 28px;border-radius:12px;">
        Retrouver mes pronostics
      </a>
      <p style="color:#a1a1aa;font-size:12px;margin:24px 0 0;">
        Ce lien expire dans 30 minutes et ne sert qu'une fois. Vos autres
        appareils seront déconnectés. Si vous n'avez rien demandé,
        ignorez cet email — votre grille reste protégée.
      </p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Lien magique de récupération d'identité joueur (Pronostics).
 * Contrairement aux emails best-effort, l'échec est signalé à l'appelant :
 * sans email parti, le joueur attendrait un lien qui n'arrive jamais.
 */
export async function sendContestRecoveryEmail(params: {
  to: string;
  contestName: string;
  organizationName: string;
  recoverUrl: string;
}): Promise<boolean> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_EMAIL");
  if (!apiKey || !from) {
    console.warn("[resend] non configuré — lien de récupération non envoyé");
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `🔑 Retrouvez vos pronostics — ${params.contestName}`,
      html: contestRecoveryEmailHtml(params),
    });
    if (error) {
      reportError("resend", `récupération échouée: ${JSON.stringify(error)}`);
      return false;
    }
    return true;
  } catch (err) {
    reportError("resend", `récupération, exception: ${err}`);
    return false;
  }
}

function winNotificationEmailHtml(p: {
  prizeLabel: string;
  customerFirstName: string;
  redeemCode: string;
  dashboardUrl: string;
}): string {
  const label = escapeHtml(p.prizeLabel);
  const name = escapeHtml(p.customerFirstName);
  const code = escapeHtml(p.redeemCode);

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;">
      <p style="font-size:13px;letter-spacing:2px;color:#f97316;text-transform:uppercase;margin:0 0 16px;">Nouveau gain</p>
      <h1 style="font-size:22px;color:#18181b;margin:0 0 8px;">${name} vient de gagner 🎉</h1>
      <p style="color:#3f3f46;font-size:15px;margin:0 0 20px;">${label}</p>
      <div style="background:#f4f4f5;border-radius:12px;padding:16px 20px;margin:0 0 20px;">
        <p style="font-size:11px;letter-spacing:2px;color:#71717a;margin:0 0 4px;">CODE À VALIDER</p>
        <p style="font-size:20px;font-weight:bold;letter-spacing:3px;color:#18181b;margin:0;font-family:monospace;">${code}</p>
      </div>
      <a href="${p.dashboardUrl}" style="display:inline-block;color:#f97316;font-size:13px;text-decoration:none;">Voir dans le dashboard →</a>
    </div>
    <p style="text-align:center;color:#a1a1aa;font-size:11px;margin:16px 0 0;">
      Vous recevez cet email car les notifications de gain sont activées. Désactivables dans Réglages.
    </p>
  </div>
</body>
</html>`;
}

/**
 * Notification temps réel au commerçant à chaque gain réclamé.
 * Best-effort, jamais bloquant : le client a déjà son code à l'écran
 * quoi qu'il arrive.
 */
export async function sendWinNotificationEmail(params: {
  to: string;
  prizeLabel: string;
  customerFirstName: string;
  redeemCode: string;
}): Promise<void> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_EMAIL");
  if (!apiKey || !from) return;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `🎉 ${params.customerFirstName || "Un client"} vient de gagner`,
      html: winNotificationEmailHtml({
        prizeLabel: params.prizeLabel,
        customerFirstName: params.customerFirstName || "Un client",
        redeemCode: params.redeemCode,
        dashboardUrl: `${APP_URL}/dashboard/redeem`,
      }),
    });
    if (error) {
      reportError("resend", `notification de gain échouée: ${JSON.stringify(error)}`);
    }
  } catch (err) {
    reportError("resend", `notification de gain, exception: ${err}`);
  }
}

function reengagementEmailHtml(p: {
  organizationName: string;
  playUrl: string;
  unsubscribeUrl: string;
}): string {
  const org = escapeHtml(p.organizationName);
  const play = escapeHtml(p.playUrl);

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;text-align:center;">
      <p style="font-size:13px;letter-spacing:2px;color:#f97316;text-transform:uppercase;margin:0 0 16px;">${org}</p>
      <h1 style="font-size:22px;color:#18181b;margin:0 0 12px;">Vous nous manquez ! 🎁</h1>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Ça fait un moment… Retentez votre chance et repartez peut-être avec un cadeau.
      </p>
      <a href="${play}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 28px;border-radius:12px;">
        Rejouer maintenant
      </a>
    </div>
    <p style="text-align:center;color:#a1a1aa;font-size:11px;margin:16px 0 0;">
      Vous recevez cet email car vous vous êtes inscrit(e) à la newsletter de ${org}.
      <a href="${p.unsubscribeUrl}" style="color:#a1a1aa;">Se désinscrire</a>.
    </p>
  </div>
</body>
</html>`;
}

/**
 * Envoi d'une relance aux clients inactifs d'un commerçant (opt-in
 * org + cooldown gérés en amont). Best-effort par lot, mêmes garanties
 * que la newsletter. Retourne le nombre d'emails acceptés par Resend.
 */
export async function sendReengagementEmails(params: {
  organizationName: string;
  playUrl: string;
  recipients: { email: string; unsubscribeToken: string }[];
}): Promise<{ sent: number; sentEmails: string[] }> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_EMAIL");

  if (!apiKey || !from) {
    console.warn("[resend] non configuré — relance non envoyée");
    return { sent: 0, sentEmails: [] };
  }

  const resend = new Resend(apiKey);
  const BATCH_SIZE = 100;
  let sent = 0;
  const sentEmails: string[] = [];

  for (let i = 0; i < params.recipients.length; i += BATCH_SIZE) {
    const batch = params.recipients.slice(i, i + BATCH_SIZE);
    try {
      const { data, error } = await resend.batch.send(
        batch.map((r) => ({
          from,
          to: r.email,
          subject: `On vous garde une place chez ${params.organizationName} 🎁`,
          html: reengagementEmailHtml({
            organizationName: params.organizationName,
            playUrl: params.playUrl,
            unsubscribeUrl: `${APP_URL}/newsletter/unsubscribe?token=${r.unsubscribeToken}`,
          }),
          headers: {
            "List-Unsubscribe": `<${APP_URL}/api/newsletter/unsubscribe?token=${r.unsubscribeToken}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        })),
      );
      if (error) {
        reportError("resend", `lot relance échoué: ${JSON.stringify(error)}`);
        continue;
      }
      sent += data?.data?.length ?? batch.length;
      sentEmails.push(...batch.map((recipient) => recipient.email));
    } catch (err) {
      reportError("resend", `lot relance, exception: ${err}`);
    }
  }

  console.log(`[resend] relance envoyée à ${sent}/${params.recipients.length} client(s)`);
  return { sent, sentEmails };
}

/**
 * Envoi d'une campagne newsletter aux abonnés d'un commerçant. Best-effort
 * par lot (l'API batch de Resend accepte jusqu'à 100 emails/appel) : un
 * lot en échec n'empêche pas les suivants. Retourne le nombre d'emails
 * effectivement acceptés par Resend.
 */
export async function sendNewsletterEmails(params: {
  subject: string;
  bodyText: string;
  organizationName: string;
  recipients: { email: string; unsubscribeToken: string }[];
  // `delivered` accompagne `sent` pour que l'appelant puisse journaliser QUI a
  // reçu l'email. Sans cette liste, un job de newsletter interrompu en plein
  // envoi ne peut que tout renvoyer ou tout abandonner — il ne peut pas
  // reprendre. Même approximation que le compteur : un lot accepté par le
  // fournisseur est considéré livré dans son ensemble.
}): Promise<{ sent: number; delivered: string[] }> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_EMAIL");

  if (!apiKey || !from) {
    console.warn(
      `[resend] non configuré (RESEND_API_KEY: ${apiKey ? "ok" : "MANQUANTE"}, ` +
        `RESEND_FROM_EMAIL: ${from ? "ok" : "MANQUANTE"}) — newsletter non envoyée`,
    );
    return { sent: 0, delivered: [] };
  }

  const resend = new Resend(apiKey);
  const BATCH_SIZE = 100;
  let sent = 0;
  const delivered: string[] = [];

  for (let i = 0; i < params.recipients.length; i += BATCH_SIZE) {
    const batch = params.recipients.slice(i, i + BATCH_SIZE);
    try {
      const { data, error } = await resend.batch.send(
        batch.map((r) => ({
          from,
          to: r.email,
          subject: params.subject,
          html: newsletterEmailHtml({
            subject: params.subject,
            bodyText: params.bodyText,
            organizationName: params.organizationName,
            unsubscribeUrl: `${APP_URL}/newsletter/unsubscribe?token=${r.unsubscribeToken}`,
          }),
          headers: {
            "List-Unsubscribe": `<${APP_URL}/api/newsletter/unsubscribe?token=${r.unsubscribeToken}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        })),
      );
      if (error) {
        reportError("resend.newsletter-batch", JSON.stringify(error));
        continue;
      }
      sent += data?.data?.length ?? batch.length;
      for (const r of batch) delivered.push(r.email);
    } catch (err) {
      reportError("resend.newsletter-batch", err);
    }
  }

  console.log(`[resend] newsletter envoyée à ${sent}/${params.recipients.length} abonné(s)`);
  return { sent, delivered };
}

// ── Automatisations commerçant ───────────────────────────────────────

/** Vrai si l'envoi d'emails est configuré (clé API + expéditeur). */
export function isResendConfigured(): boolean {
  return Boolean(optionalEnv("RESEND_API_KEY") && optionalEnv("RESEND_FROM_EMAIL"));
}

/** Centimes → « 12,50 € » (affichage commerçant). */
function formatEuros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

/**
 * Envoi par lots générique (API batch Resend, 100 emails/appel) : un lot
 * en échec n'empêche pas les suivants. Retourne les emails acceptés —
 * les scénarios s'en servent pour journaliser email_log.
 */
async function sendScenarioBatch(
  label: string,
  emails: Array<{
    to: string;
    subject: string;
    html: string;
    headers?: Record<string, string>;
  }>,
): Promise<{ sent: number; sentEmails: string[] }> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_EMAIL");
  if (!apiKey || !from) {
    console.warn(`[resend] non configuré — ${label} non envoyé`);
    return { sent: 0, sentEmails: [] };
  }

  const resend = new Resend(apiKey);
  const BATCH_SIZE = 100;
  let sent = 0;
  const sentEmails: string[] = [];

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    try {
      const { data, error } = await resend.batch.send(
        batch.map((e) => ({
          from,
          to: e.to,
          subject: e.subject,
          html: e.html,
          headers: e.headers,
        })),
      );
      if (error) {
        console.error(`[resend] lot ${label} échoué:`, JSON.stringify(error));
        continue;
      }
      sent += data?.data?.length ?? batch.length;
      sentEmails.push(...batch.map((e) => e.to));
    } catch (err) {
      console.error(`[resend] lot ${label}, exception:`, err);
    }
  }

  console.log(`[resend] ${label} : ${sent}/${emails.length} envoyé(s)`);
  return { sent, sentEmails };
}

/** En-têtes de désinscription à un clic (obligatoires en marketing). */
function unsubscribeHeaders(token: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${APP_URL}/api/newsletter/unsubscribe?token=${token}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

function unsubscribeFooter(organizationName: string, token: string): string {
  const org = escapeHtml(organizationName);
  return `<p style="text-align:center;color:#a1a1aa;font-size:11px;margin:16px 0 0;">
      Vous recevez cet email car vous vous êtes inscrit(e) auprès de ${org}.
      <a href="${APP_URL}/newsletter/unsubscribe?token=${token}" style="color:#a1a1aa;">Se désinscrire</a>.
    </p>`;
}

function playButton(playUrl: string | null, label: string): string {
  if (!playUrl) return "";
  return `<a href="${escapeHtml(playUrl)}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 28px;border-radius:12px;">
        ${escapeHtml(label)}
      </a>`;
}

function budgetPausedEmailHtml(p: {
  campaignName: string;
  budgetCents: number;
  spentCents: number;
  dashboardUrl: string;
}): string {
  const name = escapeHtml(p.campaignName);

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;">
      <p style="font-size:13px;letter-spacing:2px;color:#f97316;text-transform:uppercase;margin:0 0 16px;">Budget atteint</p>
      <h1 style="font-size:22px;color:#18181b;margin:0 0 12px;">Campagne « ${name} » mise en pause</h1>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Le plafond de budget de cette campagne est atteint : elle a été mise
        en pause automatiquement. Vos gains déjà distribués restent valables.
      </p>
      <div style="background:#f4f4f5;border-radius:12px;padding:16px 20px;margin:0 0 20px;">
        <p style="font-size:11px;letter-spacing:2px;color:#71717a;margin:0 0 4px;">DÉPENSÉ / BUDGET</p>
        <p style="font-size:20px;font-weight:bold;color:#18181b;margin:0;">${formatEuros(p.spentCents)} / ${formatEuros(p.budgetCents)}</p>
      </div>
      <p style="color:#3f3f46;font-size:14px;line-height:1.6;margin:0 0 20px;">
        Pour la relancer : augmentez son budget ou réactivez-la depuis le dashboard.
      </p>
      <a href="${p.dashboardUrl}" style="display:inline-block;color:#f97316;font-size:13px;text-decoration:none;">Gérer la campagne →</a>
    </div>
    <p style="text-align:center;color:#a1a1aa;font-size:11px;margin:16px 0 0;">
      Notification automatique Lastchance (plafond de budget de campagne).
    </p>
  </div>
</body>
</html>`;
}

/**
 * Notification au commerçant : campagne auto-pausée, budget atteint.
 * Retourne false si l'envoi n'est pas parti (non configuré ou refus).
 */
export async function sendBudgetPausedEmail(params: {
  to: string;
  campaignName: string;
  budgetCents: number;
  spentCents: number;
}): Promise<boolean> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_EMAIL");
  if (!apiKey || !from) {
    console.warn("[resend] non configuré — alerte budget non envoyée");
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `⏸️ Campagne « ${params.campaignName} » en pause — budget atteint`,
      html: budgetPausedEmailHtml({
        campaignName: params.campaignName,
        budgetCents: params.budgetCents,
        spentCents: params.spentCents,
        dashboardUrl: `${APP_URL}/dashboard/campaigns`,
      }),
    });
    if (error) {
      reportError("resend", `alerte budget échouée: ${JSON.stringify(error)}`);
      return false;
    }
    return true;
  } catch (err) {
    reportError("resend", `alerte budget, exception: ${err}`);
    return false;
  }
}

function scheduleBlockedEmailHtml(p: {
  campaignName: string;
  modulesUrl: string;
}): string {
  const name = escapeHtml(p.campaignName);

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;">
      <p style="font-size:13px;letter-spacing:2px;color:#f97316;text-transform:uppercase;margin:0 0 16px;">Ouverture annulée</p>
      <h1 style="font-size:22px;color:#18181b;margin:0 0 12px;">Campagne « ${name} » : l'ouverture programmée n'a pas eu lieu</h1>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Votre campagne devait s'ouvrir automatiquement aujourd'hui. Le droit qui
        ouvre la roue de la fortune est terminé : elle a été remise en pause et
        aucun joueur n'y a accédé.
      </p>
      <p style="color:#3f3f46;font-size:14px;line-height:1.6;margin:0 0 20px;">
        Rouvrez le module et la programmation repartira d'elle-même au prochain
        passage — vos dates, votre budget et vos lots sont intacts.
      </p>
      <a href="${p.modulesUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 28px;border-radius:12px;">Rouvrir le module</a>
    </div>
    <p style="text-align:center;color:#a1a1aa;font-size:11px;margin:16px 0 0;">
      Notification automatique Lastchance (ouverture programmée d'une campagne).
    </p>
  </div>
</body>
</html>`;
}

/**
 * Notification au commerçant : l'ouverture programmée d'une campagne a été
 * refusée faute de droit sur la roue, la campagne est restée en pause.
 * Retourne false si l'envoi n'est pas parti (non configuré ou refus).
 */
export async function sendScheduleBlockedEmail(params: {
  to: string;
  campaignName: string;
}): Promise<boolean> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_EMAIL");
  if (!apiKey || !from) {
    console.warn("[resend] non configuré — alerte droit expiré non envoyée");
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `⏸️ Campagne « ${params.campaignName} » : ouverture annulée, droit terminé`,
      html: scheduleBlockedEmailHtml({
        campaignName: params.campaignName,
        // La page des options, et non celle des campagnes : le geste attendu est
        // de rouvrir le module. Renvoyer vers la campagne offrirait un bouton
        // « Activer » que la base refuse tant que le droit manque.
        modulesUrl: `${APP_URL}/dashboard/settings/modules`,
      }),
    });
    if (error) {
      reportError("resend", `alerte droit expiré échouée: ${JSON.stringify(error)}`);
      return false;
    }
    return true;
  } catch (err) {
    reportError("resend", `alerte droit expiré, exception: ${err}`);
    return false;
  }
}

function lowStockEmailHtml(p: {
  prizeLabel: string;
  stock: number;
  threshold: number;
  dashboardUrl: string;
}): string {
  const label = escapeHtml(p.prizeLabel);

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;">
      <p style="font-size:13px;letter-spacing:2px;color:#f97316;text-transform:uppercase;margin:0 0 16px;">Stock faible</p>
      <h1 style="font-size:22px;color:#18181b;margin:0 0 12px;">Le lot « ${label} » s'épuise</h1>
      <div style="background:#f4f4f5;border-radius:12px;padding:16px 20px;margin:0 0 20px;">
        <p style="font-size:11px;letter-spacing:2px;color:#71717a;margin:0 0 4px;">STOCK RESTANT / SEUIL D'ALERTE</p>
        <p style="font-size:20px;font-weight:bold;color:#18181b;margin:0;">${p.stock} / ${p.threshold}</p>
      </div>
      <p style="color:#3f3f46;font-size:14px;line-height:1.6;margin:0 0 20px;">
        Pensez à réapprovisionner ce lot ou à ajuster votre roue — un lot à
        stock épuisé ne peut plus être gagné.
      </p>
      <a href="${p.dashboardUrl}" style="display:inline-block;color:#f97316;font-size:13px;text-decoration:none;">Gérer mes lots →</a>
    </div>
    <p style="text-align:center;color:#a1a1aa;font-size:11px;margin:16px 0 0;">
      Notification automatique Lastchance (seuil d'alerte de stock).
    </p>
  </div>
</body>
</html>`;
}

/**
 * Notification au commerçant : stock d'un lot passé sous le seuil.
 * Retourne false si l'envoi n'est pas parti (non configuré ou refus).
 */
export async function sendLowStockEmail(params: {
  to: string;
  prizeLabel: string;
  stock: number;
  threshold: number;
}): Promise<boolean> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_EMAIL");
  if (!apiKey || !from) {
    console.warn("[resend] non configuré — alerte stock non envoyée");
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `⚠️ Stock faible : ${params.prizeLabel}`,
      html: lowStockEmailHtml({
        prizeLabel: params.prizeLabel,
        stock: params.stock,
        threshold: params.threshold,
        dashboardUrl: `${APP_URL}/dashboard/campaigns`,
      }),
    });
    if (error) {
      reportError("resend", `alerte stock échouée: ${JSON.stringify(error)}`);
      return false;
    }
    return true;
  } catch (err) {
    reportError("resend", `alerte stock, exception: ${err}`);
    return false;
  }
}

function wonNotRedeemedEmailHtml(p: {
  organizationName: string;
  firstName: string;
  prizeLabel: string;
  redeemCode: string;
  expiresText: string | null;
}): string {
  const org = escapeHtml(p.organizationName);
  const name = escapeHtml(p.firstName || "cher client");
  const label = escapeHtml(p.prizeLabel);
  const code = escapeHtml(p.redeemCode);

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;text-align:center;">
      <p style="font-size:13px;letter-spacing:2px;color:#7c3aed;text-transform:uppercase;margin:0 0 12px;">${org}</p>
      <h1 style="font-size:24px;color:#18181b;margin:0 0 8px;">Votre gain vous attend, ${name}</h1>
      <p style="color:#52525b;font-size:15px;margin:0 0 24px;">
        Vous n'avez pas encore récupéré :
      </p>
      <p style="font-size:20px;font-weight:bold;color:#18181b;margin:0 0 24px;">${label}</p>
      <div style="background:#f4f4f5;border-radius:12px;padding:20px;margin:0 0 24px;">
        <p style="font-size:11px;letter-spacing:2px;color:#71717a;margin:0 0 6px;">VOTRE CODE</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;color:#18181b;margin:0;font-family:monospace;">${code}</p>
      </div>
      ${p.expiresText ? `<p style="color:#71717a;font-size:13px;margin:0 0 8px;">Valable jusqu'au ${escapeHtml(p.expiresText)}.</p>` : ""}
      <p style="color:#71717a;font-size:13px;margin:0;">Présentez ce code en caisse pour récupérer votre gain.</p>
    </div>
    <p style="text-align:center;color:#a1a1aa;font-size:11px;margin:16px 0 0;">
      Vous recevez cet email car vous avez gagné au jeu de ${org}.
    </p>
  </div>
</body>
</html>`;
}

/**
 * Rappel transactionnel « gagné mais pas retiré » : le gain du joueur
 * lui-même (code + échéance), sans pression marketing. Retourne les
 * emails acceptés pour le journal anti-doublon.
 */
export async function sendWonNotRedeemedEmails(params: {
  organizationName: string;
  timezone: string;
  recipients: Array<{
    email: string;
    firstName: string;
    prizeLabel: string;
    redeemCode: string;
    redeemExpiresAt: string | null;
  }>;
}): Promise<{ sent: number; sentEmails: string[] }> {
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: params.timezone,
  });
  return sendScenarioBatch(
    "rappel gain",
    params.recipients.map((r) => ({
      to: r.email,
      subject: `⏳ Votre gain chez ${params.organizationName} vous attend`,
      html: wonNotRedeemedEmailHtml({
        organizationName: params.organizationName,
        firstName: r.firstName,
        prizeLabel: r.prizeLabel,
        redeemCode: r.redeemCode,
        expiresText: r.redeemExpiresAt
          ? formatter.format(new Date(r.redeemExpiresAt))
          : null,
      }),
    })),
  );
}

function inactiveEmailHtml(p: {
  organizationName: string;
  firstName: string;
  playUrl: string | null;
  unsubscribeToken: string;
}): string {
  const org = escapeHtml(p.organizationName);
  const greeting = p.firstName ? `Bonjour ${escapeHtml(p.firstName)},` : "Bonjour,";

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;text-align:center;">
      <p style="font-size:13px;letter-spacing:2px;color:#f97316;text-transform:uppercase;margin:0 0 16px;">${org}</p>
      <h1 style="font-size:22px;color:#18181b;margin:0 0 12px;">Ça fait longtemps !</h1>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 24px;">
        ${greeting}<br>
        Cela fait un moment qu'on ne vous a pas vu(e) chez ${org}.
        Repassez quand vous voulez — une surprise vous attend peut-être.
      </p>
      ${playButton(p.playUrl, "Tenter ma chance")}
    </div>
    ${unsubscribeFooter(p.organizationName, p.unsubscribeToken)}
  </div>
</body>
</html>`;
}

/** Relance marketing des inactifs (scénario configurable, paliers en jours). */
export async function sendInactiveEmails(params: {
  organizationName: string;
  playUrl: string | null;
  recipients: Array<{ email: string; firstName: string; unsubscribeToken: string }>;
}): Promise<{ sent: number; sentEmails: string[] }> {
  return sendScenarioBatch(
    "relance inactifs",
    params.recipients.map((r) => ({
      to: r.email,
      subject: `On ne vous oublie pas chez ${params.organizationName} 🎁`,
      html: inactiveEmailHtml({
        organizationName: params.organizationName,
        firstName: r.firstName,
        playUrl: params.playUrl,
        unsubscribeToken: r.unsubscribeToken,
      }),
      headers: unsubscribeHeaders(r.unsubscribeToken),
    })),
  );
}

function postRedemptionEmailHtml(p: {
  organizationName: string;
  firstName: string;
  prizeLabel: string;
  playUrl: string | null;
  unsubscribeToken: string;
}): string {
  const org = escapeHtml(p.organizationName);
  const label = escapeHtml(p.prizeLabel);
  const greeting = p.firstName ? `Bonjour ${escapeHtml(p.firstName)},` : "Bonjour,";

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;text-align:center;">
      <p style="font-size:13px;letter-spacing:2px;color:#f97316;text-transform:uppercase;margin:0 0 16px;">${org}</p>
      <h1 style="font-size:22px;color:#18181b;margin:0 0 12px;">Merci de votre visite !</h1>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 24px;">
        ${greeting}<br>
        Nous espérons que ${label} vous a plu. Toute l'équipe de ${org}
        vous remercie — à très bientôt !
      </p>
      ${playButton(p.playUrl, "Rejouer")}
    </div>
    ${unsubscribeFooter(p.organizationName, p.unsubscribeToken)}
  </div>
</body>
</html>`;
}

/** Suite de retrait (marketing) : merci après le passage en caisse. */
export async function sendPostRedemptionEmails(params: {
  organizationName: string;
  playUrl: string | null;
  recipients: Array<{
    email: string;
    firstName: string;
    prizeLabel: string;
    unsubscribeToken: string;
  }>;
}): Promise<{ sent: number; sentEmails: string[] }> {
  return sendScenarioBatch(
    "merci après retrait",
    params.recipients.map((r) => ({
      to: r.email,
      subject: `Merci de votre visite chez ${params.organizationName}`,
      html: postRedemptionEmailHtml({
        organizationName: params.organizationName,
        firstName: r.firstName,
        prizeLabel: r.prizeLabel,
        playUrl: params.playUrl,
        unsubscribeToken: r.unsubscribeToken,
      }),
      headers: unsubscribeHeaders(r.unsubscribeToken),
    })),
  );
}

function birthdayEmailHtml(p: {
  organizationName: string;
  firstName: string;
  playUrl: string | null;
  unsubscribeToken: string;
}): string {
  const org = escapeHtml(p.organizationName);
  const name = p.firstName ? ` ${escapeHtml(p.firstName)}` : "";

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;text-align:center;">
      <p style="font-size:13px;letter-spacing:2px;color:#f97316;text-transform:uppercase;margin:0 0 16px;">${org}</p>
      <h1 style="font-size:24px;color:#18181b;margin:0 0 12px;">Joyeux anniversaire${name} 🎂</h1>
      <p style="color:#3f3f46;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Toute l'équipe de ${org} vous souhaite une très belle journée.
        Passez nous voir — c'est l'occasion de tenter votre chance !
      </p>
      ${playButton(p.playUrl, "Tenter ma chance")}
    </div>
    ${unsubscribeFooter(p.organizationName, p.unsubscribeToken)}
  </div>
</body>
</html>`;
}

/** Vœux d'anniversaire (marketing, consentement anniversaire explicite). */
export async function sendBirthdayEmails(params: {
  organizationName: string;
  playUrl: string | null;
  recipients: Array<{ email: string; firstName: string; unsubscribeToken: string }>;
}): Promise<{ sent: number; sentEmails: string[] }> {
  return sendScenarioBatch(
    "anniversaires",
    params.recipients.map((r) => ({
      to: r.email,
      subject: r.firstName
        ? `🎂 Joyeux anniversaire ${r.firstName} !`
        : "🎂 Joyeux anniversaire !",
      html: birthdayEmailHtml({
        organizationName: params.organizationName,
        firstName: r.firstName,
        playUrl: params.playUrl,
        unsubscribeToken: r.unsubscribeToken,
      }),
      headers: unsubscribeHeaders(r.unsubscribeToken),
    })),
  );
}

// ── Rapport hebdomadaire du lundi ────────────────────────────────────

/**
 * Écart à la semaine précédente. C'est LA raison d'être de ce gabarit :
 * « 34 joueurs » n'intéresse personne, « 34 joueurs, +12 » se lit d'un coup
 * d'œil. Une semaine identique se dit « stable » et non « +0 » — un zéro signé
 * se lit comme une mesure abîmée.
 */
function formatDelta(current: number, previous: number): string {
  const delta = current - previous;
  if (delta === 0) return "stable";
  return `${delta > 0 ? "+" : "-"}${Math.abs(delta)}`;
}

/** Vert en hausse, rouge en baisse, gris à l'identique (sur fond blanc). */
function deltaColor(current: number, previous: number): string {
  if (current > previous) return "#15803d";
  if (current < previous) return "#b91c1c";
  return "#71717a";
}

function digestStatRow(
  label: string,
  value: string,
  current: number,
  previous: number,
): string {
  return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#3f3f46;font-size:14px;">${escapeHtml(label)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;text-align:right;color:#18181b;font-size:18px;font-weight:bold;">${escapeHtml(value)}</td>
        <td style="padding:10px 0 10px 12px;border-bottom:1px solid #f4f4f5;text-align:right;font-size:13px;font-weight:bold;color:${deltaColor(current, previous)};white-space:nowrap;">${escapeHtml(formatDelta(current, previous))}</td>
      </tr>`;
}

/**
 * Gabarit du rapport du lundi. EXPORTÉ, contrairement aux dix autres
 * gabarits, pour une raison précise : la garantie « un caissier ne reçoit
 * aucun montant » se démontre en LISANT le HTML rendu. Un gabarit qu'aucun
 * test ne peut lire est un gabarit dont la garantie n'est pas prouvée.
 *
 * `basketCents === null` = destinataire sans droit sur les montants (la RPC
 * NULLifie de même hors éditeur). Ce n'est PAS `0` : un zéro se lirait comme
 * une semaine sans chiffre d'affaires, alors que c'est une absence de droit.
 *
 * AUCUN code de retrait ici : `top_rewards` ne porte que des libellés gravés,
 * et un code recopié dans une boîte aux lettres serait un droit au porteur.
 */
export function weeklyDigestEmailContent(p: {
  organizationName: string;
  stats: WeeklyDigestStats;
  /** Page où le réglage se coupe réellement (voir `unsubscribeLine`). */
  settingsUrl: string;
}): { subject: string; html: string } {
  const org = escapeHtml(p.organizationName);
  const s = p.stats;
  const joueurs = `${s.players} joueur${s.players > 1 ? "s" : ""}`;

  const rows = [
    digestStatRow("Joueurs uniques", String(s.players), s.players, s.prevPlayers),
    digestStatRow(
      "Lots gagnés",
      String(s.rewardsIssued),
      s.rewardsIssued,
      s.prevRewardsIssued,
    ),
    digestStatRow(
      "Lots remis en caisse",
      String(s.rewardsRedeemed),
      s.rewardsRedeemed,
      s.prevRewardsRedeemed,
    ),
    // Le bloc des montants n'existe pas du tout pour qui n'y a pas droit :
    // il n'est ni masqué ni mis à zéro, il n'est pas rendu.
    s.basketCents !== null
      ? digestStatRow(
          "Panier attribuable",
          formatEuros(s.basketCents),
          s.basketCents,
          s.prevBasketCents ?? 0,
        )
      : "",
  ].join("\n      ");

  const top =
    s.topRewards.length > 0
      ? `<div style="background:#f4f4f5;border-radius:12px;padding:16px 20px;margin:20px 0 0;">
        <p style="font-size:11px;letter-spacing:2px;color:#71717a;margin:0 0 8px;">LES PLUS GAGNÉS</p>
        ${s.topRewards
          .map(
            (r) =>
              `<p style="color:#3f3f46;font-size:14px;margin:0 0 4px;">${escapeHtml(r.label)} <span style="color:#71717a;">× ${r.count}</span></p>`,
          )
          .join("\n        ")}
      </div>`
      : "";

  return {
    subject: `📊 Votre semaine chez ${p.organizationName} : ${joueurs} (${formatDelta(s.players, s.prevPlayers)})`,
    html: `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;">
      <p style="font-size:13px;letter-spacing:2px;color:#f97316;text-transform:uppercase;margin:0 0 12px;">${org}</p>
      <h1 style="font-size:22px;color:#18181b;margin:0 0 4px;">Votre semaine en un coup d'œil</h1>
      <p style="color:#71717a;font-size:13px;margin:0 0 20px;">
        Les ${s.periodDays} derniers jours, comparés aux ${s.periodDays} jours précédents.
      </p>
      <table style="width:100%;border-collapse:collapse;">
      ${rows}
      </table>
      ${top}
      <p style="margin:24px 0 0;">
        <a href="${APP_URL}/dashboard" style="display:inline-block;color:#f97316;font-size:13px;text-decoration:none;">Ouvrir mon tableau de bord →</a>
      </p>
    </div>
    ${weeklyDigestFooter(p.organizationName, p.settingsUrl)}
  </div>
</body>
</html>`,
  };
}

/**
 * Pied de page du rapport. Un hebdomadaire SANS issue finit en signalement de
 * spam — et un signalement coûte la délivrabilité de tous les e-mails
 * transactionnels du domaine, code de gain compris.
 *
 * Le lien pointe vers les Réglages, DERRIÈRE l'authentification, et non vers
 * un jeton signé comme les e-mails marketing : le destinataire est ici le
 * titulaire du compte, il a déjà un mot de passe. Un jeton ouvrirait une
 * écriture publique de plus, forgeable, pour un confort nul.
 */
function weeklyDigestFooter(organizationName: string, settingsUrl: string): string {
  const org = escapeHtml(organizationName);
  return `<p style="text-align:center;color:#a1a1aa;font-size:11px;margin:16px 0 0;">
      Vous recevez ce rapport en tant que titulaire du compte ${org}.
      <a href="${escapeHtml(settingsUrl)}" style="color:#a1a1aa;">Ne plus le recevoir</a>.
    </p>`;
}

/**
 * Envoi du rapport du lundi, par lots (API batch Resend, 100/appel). Chaque
 * destinataire porte SES propres statistiques : deux membres d'une même
 * organisation n'ont pas les mêmes droits sur les montants.
 */
export async function sendWeeklyDigestEmails(params: {
  recipients: Array<{
    email: string;
    organizationName: string;
    stats: WeeklyDigestStats;
    settingsUrl: string;
  }>;
}): Promise<{ sent: number; sentEmails: string[] }> {
  return sendScenarioBatch(
    "rapport hebdomadaire",
    params.recipients.map((r) => {
      const { subject, html } = weeklyDigestEmailContent({
        organizationName: r.organizationName,
        stats: r.stats,
        settingsUrl: r.settingsUrl,
      });
      return {
        to: r.email,
        subject,
        html,
        // URL seule, sans `List-Unsubscribe-Post` : la désinscription en un
        // clic exige un POST public, que ce chemin n'ouvre justement pas.
        // Annoncer One-Click sans le servir ferait échouer le clic chez le
        // fournisseur de messagerie.
        headers: { "List-Unsubscribe": `<${r.settingsUrl}>` },
      };
    }),
  );
}

/**
 * Confirmation d'une réservation (module Réserver, RES-1b).
 *
 * ── CE QUI N'EST PAS DANS CET EMAIL, ET POURQUOI ──
 *
 * AUCUN lien porteur de jeton, d'identifiant de réservation ou d'empreinte.
 * L'adresse donnée est celle de la PAGE PUBLIQUE de l'activité, et rien d'autre
 * (ADR-109 : « le QR public est une adresse, jamais une preuve de présence »).
 * C'est le cookie `lc-player` du navigateur qui fait retrouver au joueur sa
 * place ; un email transféré n'emporte donc aucun pouvoir avec lui — ni annuler,
 * ni se présenter à la place de quelqu'un. Le code de check-in, lui, y figure :
 * il ne vaut qu'au comptoir, sur une action staff authentifiée.
 *
 * ── L'ENVOI EST CONDITIONNÉ AU CONSENTEMENT, EN AMONT ──
 *
 * Cette fonction ne le vérifie pas et n'a pas à le faire : la base ne conserve
 * l'adresse QUE consentie (contrainte d'équivalence `reservations_consent_state`)
 * et la lit sur la ligne. Une adresse en main est donc déjà une adresse
 * consentie.
 *
 * Best-effort, comme tous les transactionnels de ce module : rend un booléen,
 * ne lève jamais. Chaque branche de sortie est COMPTÉE (motif `sms-prize.ts`) —
 * sans quoi un domaine non vérifié ferait disparaître les confirmations en
 * silence, et personne ne saurait dire combien.
 */
export async function sendReservationConfirmationEmail(params: {
  to: string;
  activityName: string;
  /** Créneau DÉJÀ formaté dans le fuseau de l'organisation. */
  slotLabel: string;
  code: string;
  organizationName: string;
  /** Page publique de l'activité — une adresse, jamais un jeton. */
  statusUrl: string;
}): Promise<boolean> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_EMAIL");

  if (!apiKey || !from) {
    console.warn(
      `[resend] non configuré (RESEND_API_KEY: ${apiKey ? "ok" : "MANQUANTE"}, ` +
        `RESEND_FROM_EMAIL: ${from ? "ok" : "MANQUANTE"}) — confirmation de réservation non envoyée`,
    );
    recordCounter("reserver.email.not_configured");
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `Votre réservation chez ${params.organizationName}`,
      html: reservationConfirmationEmailHtml(params),
    });

    if (error) {
      // NI `JSON.stringify(error)`, NI `error.message` — contrairement aux
      // autres envois de ce fichier, et pour une raison propre à ce chemin :
      // le destinataire est un VISITEUR, pas un commerçant inscrit. Resend
      // recopie l'adresse dans le message d'erreur (« Invalid `to` field: … »),
      // qui partirait alors dans les logs de la plateforme et dans Sentry — une
      // donnée personnelle collectée pour un seul envoi transactionnel,
      // conservée dans un système d'observabilité qui n'a jamais eu de base
      // pour la porter. `name` et `statusCode` disent tout ce qu'une astreinte
      // a besoin de savoir : quelle classe d'erreur, et si c'est nous ou eux.
      reportError(
        "resend",
        `confirmation de réservation échouée: ${error.name} (${error.statusCode ?? "sans statut"})`,
      );
      recordCounter("reserver.email.failed");
      return false;
    }
    console.log(`[resend] confirmation de réservation envoyée (id: ${data?.id})`);
    recordCounter("reserver.email.sent");
    return true;
  } catch (err) {
    reportError("resend", `exception à l'envoi de la confirmation: ${err}`);
    recordCounter("reserver.email.failed");
    return false;
  }
}

function reservationConfirmationEmailHtml(p: {
  activityName: string;
  slotLabel: string;
  code: string;
  organizationName: string;
  statusUrl: string;
}): string {
  const activity = escapeHtml(p.activityName);
  const slot = escapeHtml(p.slotLabel);
  const code = escapeHtml(p.code);
  const org = escapeHtml(p.organizationName);
  const url = escapeHtml(p.statusUrl);

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;text-align:center;">
      <p style="font-size:13px;letter-spacing:2px;color:#7c3aed;text-transform:uppercase;margin:0 0 12px;">${org}</p>
      <h1 style="font-size:24px;color:#18181b;margin:0 0 8px;">C'est réservé ✅</h1>
      <p style="font-size:20px;font-weight:bold;color:#18181b;margin:0 0 4px;">${activity}</p>
      <p style="color:#52525b;font-size:15px;margin:0 0 24px;">${slot}</p>
      <div style="background:#f4f4f5;border-radius:12px;padding:20px;margin:24px 0;">
        <p style="font-size:11px;letter-spacing:2px;color:#71717a;margin:0 0 6px;">VOTRE CODE</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;color:#18181b;margin:0;font-family:monospace;">${code}</p>
      </div>
      <p style="color:#71717a;font-size:13px;margin:0 0 24px;">Présentez ce code sur place à votre arrivée.</p>
      <a href="${url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 20px;font-size:14px;">Voir ou annuler ma réservation</a>
      <p style="color:#a1a1aa;font-size:12px;margin:16px 0 0;">Ouvrez ce lien depuis le téléphone avec lequel vous avez réservé.</p>
    </div>
    <p style="text-align:center;color:#a1a1aa;font-size:11px;margin:16px 0 0;">
      Vous recevez cet email parce que vous avez demandé une confirmation en réservant chez ${org}.
    </p>
  </div>
</body>
</html>`;
}

/**
 * Confirmation d'une UNITÉ DE STOCK BLOQUÉE (RES-5, lot L9).
 *
 * ── MÊME MOTIF QUE LA CONFIRMATION DE RÉSERVATION, ET MÊMES INTERDITS ──
 *
 * Le destinataire est un VISITEUR, pas un commerçant inscrit : on ne remonte NI
 * `error.message`, NI `JSON.stringify(error)` — Resend y recopie l'adresse, qui
 * partirait alors dans Sentry et dans les journaux de la plateforme, collectée
 * pour un seul envoi transactionnel et conservée par un système qui n'a jamais
 * eu de base pour la porter. `name` et `statusCode` disent tout ce qu'une
 * astreinte a besoin de savoir.
 *
 * ── CE QUE LE MESSAGE PROMET, ET RIEN DE PLUS ──
 *
 * Le code, la fenêtre de retrait, et le fait qu'au-delà l'unité repart. Aucune
 * date de réapprovisionnement, aucun « il en reste N » : le module ne sait rien
 * du stock réel au-delà de ce qui est dans l'offre, et un chiffre écrit dans un
 * email est de toute façon périmé à la lecture.
 */
export async function sendStockHoldConfirmationEmail(params: {
  to: string;
  offerTitle: string;
  /** Fenêtre DÉJÀ formatée dans le fuseau de l'organisation. */
  windowLabel: string;
  code: string;
  organizationName: string;
  /** Page publique de l'offre — une adresse, jamais un jeton. */
  statusUrl: string;
}): Promise<boolean> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_EMAIL");

  if (!apiKey || !from) {
    console.warn(
      `[resend] non configuré (RESEND_API_KEY: ${apiKey ? "ok" : "MANQUANTE"}, ` +
        `RESEND_FROM_EMAIL: ${from ? "ok" : "MANQUANTE"}) — confirmation de réservation de stock non envoyée`,
    );
    recordCounter("reserver.stock_email.not_configured");
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `C'est mis de côté chez ${params.organizationName}`,
      html: stockHoldConfirmationEmailHtml(params),
    });

    if (error) {
      reportError(
        "resend",
        `confirmation de réservation de stock échouée: ${error.name} (${error.statusCode ?? "sans statut"})`,
      );
      recordCounter("reserver.stock_email.failed");
      return false;
    }
    console.log(
      `[resend] confirmation de réservation de stock envoyée (id: ${data?.id})`,
    );
    recordCounter("reserver.stock_email.sent");
    return true;
  } catch (err) {
    reportError("resend", `exception à l'envoi de la confirmation: ${err}`);
    recordCounter("reserver.stock_email.failed");
    return false;
  }
}

function stockHoldConfirmationEmailHtml(p: {
  offerTitle: string;
  windowLabel: string;
  code: string;
  organizationName: string;
  statusUrl: string;
}): string {
  const titre = escapeHtml(p.offerTitle);
  const fenetre = escapeHtml(p.windowLabel);
  const code = escapeHtml(p.code);
  const org = escapeHtml(p.organizationName);
  const url = escapeHtml(p.statusUrl);

  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:32px;text-align:center;">
      <p style="font-size:13px;letter-spacing:2px;color:#7c3aed;text-transform:uppercase;margin:0 0 12px;">${org}</p>
      <h1 style="font-size:24px;color:#18181b;margin:0 0 8px;">C'est mis de côté 🛍️</h1>
      <p style="font-size:20px;font-weight:bold;color:#18181b;margin:0 0 4px;">${titre}</p>
      <p style="color:#52525b;font-size:15px;margin:0 0 24px;">À retirer ${fenetre}</p>
      <div style="background:#f4f4f5;border-radius:12px;padding:20px;margin:24px 0;">
        <p style="font-size:11px;letter-spacing:2px;color:#71717a;margin:0 0 6px;">VOTRE CODE</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;color:#18181b;margin:0;font-family:monospace;">${code}</p>
      </div>
      <p style="color:#71717a;font-size:13px;margin:0 0 24px;">Présentez ce code en caisse pendant la fenêtre de retrait. Passé ce délai, l'unité repart à la vente.</p>
      <a href="${url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 20px;font-size:14px;">Voir ou annuler ma réservation</a>
      <p style="color:#a1a1aa;font-size:12px;margin:16px 0 0;">Ouvrez ce lien depuis le téléphone avec lequel vous avez réservé.</p>
    </div>
    <p style="text-align:center;color:#a1a1aa;font-size:11px;margin:16px 0 0;">
      Vous recevez cet email parce que vous avez demandé une confirmation en réservant chez ${org}.
    </p>
  </div>
</body>
</html>`;
}
