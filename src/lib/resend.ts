import "server-only";

import { Resend } from "resend";
import { APP_URL, optionalEnv } from "@/lib/env";

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
      console.error("[resend] invitation d'équipe échouée:", JSON.stringify(error));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[resend] invitation d'équipe, exception:", err);
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
      console.error("[resend] récupération échouée:", JSON.stringify(error));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[resend] récupération, exception:", err);
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
      console.error("[resend] notification de gain échouée:", JSON.stringify(error));
    }
  } catch (err) {
    console.error("[resend] notification de gain, exception:", err);
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
        console.error("[resend] lot relance échoué:", JSON.stringify(error));
        continue;
      }
      sent += data?.data?.length ?? batch.length;
      sentEmails.push(...batch.map((recipient) => recipient.email));
    } catch (err) {
      console.error("[resend] lot relance, exception:", err);
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
}): Promise<{ sent: number }> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_EMAIL");

  if (!apiKey || !from) {
    console.warn(
      `[resend] non configuré (RESEND_API_KEY: ${apiKey ? "ok" : "MANQUANTE"}, ` +
        `RESEND_FROM_EMAIL: ${from ? "ok" : "MANQUANTE"}) — newsletter non envoyée`,
    );
    return { sent: 0 };
  }

  const resend = new Resend(apiKey);
  const BATCH_SIZE = 100;
  let sent = 0;

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
        console.error("[resend] lot newsletter échoué:", JSON.stringify(error));
        continue;
      }
      sent += data?.data?.length ?? batch.length;
    } catch (err) {
      console.error("[resend] lot newsletter, exception:", err);
    }
  }

  console.log(`[resend] newsletter envoyée à ${sent}/${params.recipients.length} abonné(s)`);
  return { sent };
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
      console.error("[resend] alerte budget échouée:", JSON.stringify(error));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[resend] alerte budget, exception:", err);
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
      console.error("[resend] alerte stock échouée:", JSON.stringify(error));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[resend] alerte stock, exception:", err);
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
