import "server-only";

import { APP_URL } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { isResendConfigured, sendWeeklyDigestEmails } from "@/lib/resend";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { MemberRole } from "@/types/database";

/**
 * Le rapport du lundi — orchestration.
 *
 * La RPC `org_weekly_digest` (20260821120000) rend en UN aller-retour la
 * semaine écoulée ET la précédente. Ce module décide QUI reçoit, QUOI, et
 * SURTOUT quand ne rien envoyer.
 *
 * ── LES MONTANTS SONT LA RESPONSABILITÉ DE CE MODULE ─────────────────
 *
 * La RPC est appelée par un cron en `service_role`, donc SANS rôle
 * applicatif : sa propre garde `is_org_editor()` ne peut plus rien protéger
 * — elle rend tout au service_role, et c'est correct pour un cron. L'en-tête
 * de la migration l'écrit noir sur blanc et renvoie la décision à l'appelant.
 *
 * Le tri se fait donc ici, PAR DESTINATAIRE : `basket_cents` est une donnée
 * de marge, que la policy « prizes: editors » refuse à un caissier. Un e-mail
 * ne doit pas être le contournement d'une policy.
 *
 * DEUX LIGNES DE DÉFENSE, volontairement redondantes :
 *   1. la liste des destinataires (`DIGEST_RECIPIENT_ROLES`) n'adresse
 *      aujourd'hui que le titulaire du compte — un caissier ne reçoit rien
 *      du tout ;
 *   2. `digestForRole` NULLifie les montants pour tout rôle hors
 *      owner/editor, quel que soit le chemin par lequel il est devenu
 *      destinataire.
 *
 * La seconde n'est pas décorative : c'est elle qui tient le jour où (1)
 * s'élargit. Le client n'a pas tranché entre « owner seul » et « owner +
 * editors » ; (1) prend le choix le plus sûr, (2) rend l'élargissement sans
 * danger pour la marge.
 *
 * ── AUCUN CODE DE RETRAIT ───────────────────────────────────────────
 *
 * La RPC n'en rend aucun, et rien ici n'en lit : le rapport nomme des
 * libellés gravés et des nombres. Un code recopié dans une boîte aux lettres
 * serait un droit au porteur.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** Lot le plus gagné de la semaine : libellé GRAVÉ, jamais un code. */
export interface WeeklyDigestTopReward {
  label: string;
  count: number;
}

export interface WeeklyDigestStats {
  periodDays: number;
  players: number;
  rewardsIssued: number;
  rewardsRedeemed: number;
  /** `null` = destinataire sans droit sur les montants. JAMAIS `0`. */
  basketCents: number | null;
  prevPlayers: number;
  prevRewardsIssued: number;
  prevRewardsRedeemed: number;
  prevBasketCents: number | null;
  topRewards: WeeklyDigestTopReward[];
}

/**
 * Rôles adressés. **Le titulaire du compte seul**, faute d'arbitrage client
 * entre « owner » et « owner + editors » : c'est le choix qui ne peut pas
 * envoyer de rapport à quelqu'un qui n'aurait pas dû le recevoir.
 * L'élargir tient en une entrée de plus dans ce tableau.
 */
export const DIGEST_RECIPIENT_ROLES = ["owner"] as const satisfies readonly MemberRole[];

/** Rôles qui ont droit aux montants — la règle d'`org_prize_funnel`. */
const ROLES_WITH_AMOUNTS: readonly MemberRole[] = ["owner", "editor"];

/** Au plus trois destinataires par organisation (un compte co-détenu). */
const MAX_RECIPIENTS_PER_ORG = 3;

/**
 * Organisations traitées par passage. Le plafond n'est pas silencieux : le
 * total éligible est demandé à la base, le reste publié en `deferred`, et le
 * passage se clôt en `degraded`. Sans colonne de rotation (le registre n'en
 * porte pas pour ce worker), un plafond atteint privé de signal laisserait
 * toujours LA MÊME queue de parc sans rapport, sans que rien ne le dise.
 */
const MAX_ORGS = 200;

export function roleSeesAmounts(role: MemberRole): boolean {
  return ROLES_WITH_AMOUNTS.includes(role);
}

/** Vue du rapport pour un rôle donné : montants NULLifiés hors éditeur. */
export function digestForRole(
  stats: WeeklyDigestStats,
  role: MemberRole,
): WeeklyDigestStats {
  if (roleSeesAmounts(role)) return stats;
  return { ...stats, basketCents: null, prevBasketCents: null };
}

/**
 * Faut-il envoyer ce rapport ?
 *
 * SEUIL RETENU : au moins un signe d'activité sur la semaine écoulée **ou**
 * sur la précédente.
 *
 * Motif, dans les deux sens :
 *
 *  - un « 0 joueur, 0 lot » servi CHAQUE lundi apprend au commerçant à ne
 *    plus ouvrir l'e-mail, et emporte avec lui les semaines où il aurait eu
 *    quelque chose à dire. C'est le vrai coût, et il est irréversible ;
 *
 *  - mais une semaine tombée à zéro APRÈS une semaine active est
 *    exactement l'information la plus utile de l'année : la campagne s'est
 *    arrêtée, le QR a été décollé, l'écran est éteint. La taire pour cause
 *    de « rapport vide » reviendrait à ne prévenir de rien au moment où il
 *    faut prévenir.
 *
 * La règle est auto-limitante, et c'est ce qui la rend sûre : la deuxième
 * semaine vide consécutive voit AUSSI une période précédente vide, donc rien
 * ne part. Il ne peut jamais exister deux rapports vides d'affilée.
 *
 * Les MONTANTS sont exclus du critère, délibérément : ils dépendent du rôle
 * du destinataire, et le fait qu'un rapport parte ne doit pas dépendre de qui
 * le lit — un caissier et un propriétaire doivent recevoir les mêmes semaines.
 */
export function digestIsWorthSending(stats: WeeklyDigestStats): boolean {
  const current = stats.players + stats.rewardsIssued + stats.rewardsRedeemed;
  const previous =
    stats.prevPlayers + stats.prevRewardsIssued + stats.prevRewardsRedeemed;
  return current > 0 || previous > 0;
}

function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/** `null` conservé (absence de droit) ; toute autre valeur ramenée à un entier. */
function toAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toTopRewards(value: unknown): WeeklyDigestTopReward[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const label = (entry as { label?: unknown }).label;
    if (typeof label !== "string" || label.length === 0) return [];
    return [{ label, count: toCount((entry as { count?: unknown }).count) }];
  });
}

/** Ligne de la RPC → statistiques typées. `null` si la RPC n'a rien rendu. */
export function parseWeeklyDigest(row: unknown): WeeklyDigestStats | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  return {
    periodDays: toCount(r.period_days) || 7,
    players: toCount(r.players),
    rewardsIssued: toCount(r.rewards_issued),
    rewardsRedeemed: toCount(r.rewards_redeemed),
    basketCents: toAmount(r.basket_cents),
    prevPlayers: toCount(r.prev_players),
    prevRewardsIssued: toCount(r.prev_rewards_issued),
    prevRewardsRedeemed: toCount(r.prev_rewards_redeemed),
    prevBasketCents: toAmount(r.prev_basket_cents),
    topRewards: toTopRewards(r.top_rewards),
  };
}

/**
 * Semaine ISO (`2026-W31`) de l'instant donné, en UTC. Sert de clé de période
 * à l'anti-doublon : un second déclenchement le mardi ne renvoie rien.
 */
export function isoWeekKey(now: Date): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // Jeudi de la semaine ISO : c'est lui qui porte l'année ISO.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((d.getTime() - jan1) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Clé d'unicité d'un rapport : une organisation, une semaine, un lecteur. */
export function weeklyDigestDedupKey(
  organizationId: string,
  periodKey: string,
  recipient: string,
): string {
  return `weekly-digest:${organizationId}:${periodKey}:${recipient}`;
}

/**
 * Alias de type et non `interface`, délibérément : seul un alias reçoit la
 * signature d'index implicite qui le rend assignable au `Record<string,
 * number>` du journal de santé — sans cast à l'appel.
 */
export type WeeklyDigestCounters = {
  organizations: number;
  deferred: number;
  eligible_recipients: number;
  sent: number;
  skipped_empty: number;
  skipped_no_recipient: number;
  skipped_already_sent: number;
  digest_failed: number;
  not_configured: number;
};

function emptyCounters(): WeeklyDigestCounters {
  return {
    organizations: 0,
    deferred: 0,
    eligible_recipients: 0,
    sent: 0,
    skipped_empty: 0,
    skipped_no_recipient: 0,
    skipped_already_sent: 0,
    digest_failed: 0,
    not_configured: 0,
  };
}

interface DigestRecipient {
  email: string;
  role: MemberRole;
}

/**
 * Destinataires d'une organisation. L'e-mail n'est pas dupliqué sur
 * `organizations` : il vit dans `auth.users`, d'où l'aller-retour admin
 * (même chemin que `getOrgOwnerEmail`).
 */
async function digestRecipients(
  admin: Admin,
  organizationId: string,
): Promise<DigestRecipient[]> {
  const { data, error } = await admin
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .in("role", [...DIGEST_RECIPIENT_ROLES])
    .order("created_at", { ascending: true })
    .limit(MAX_RECIPIENTS_PER_ORG);
  if (error || !data) return [];

  const recipients: DigestRecipient[] = [];
  for (const member of data as Array<{ user_id: string; role: MemberRole }>) {
    const { data: user, error: userError } = await admin.auth.admin.getUserById(
      member.user_id,
    );
    if (userError || !user.user?.email) continue;
    recipients.push({ email: user.user.email, role: member.role });
  }
  return recipients;
}

/**
 * Un passage du rapport du lundi.
 *
 * ORDRE DES GESTES, et il compte : on calcule, on décide d'envoyer, PUIS on
 * réserve la ligne `email_log`, puis on envoie. Réserver avant de savoir si
 * le rapport vaut la peine brûlerait la clé d'une semaine pour rien.
 *
 * La réservation précède l'envoi (même arbitrage que les rappels du
 * calendrier) : au pire un rapport manqué si Resend refuse après réservation,
 * JAMAIS un doublon. Pour un hebdomadaire, la répétition coûte plus cher que
 * l'oubli — c'est elle qui fait signaler l'e-mail comme spam.
 */
export async function runWeeklyDigest(
  admin: Admin,
  now: Date = new Date(),
): Promise<WeeklyDigestCounters> {
  const counters = emptyCounters();

  // Resend absent (dev, ou clé retirée) : on n'ouvre RIEN. Réserver puis ne
  // pas pouvoir envoyer consommerait la semaine en silence.
  if (!isResendConfigured()) {
    counters.not_configured = 1;
    return counters;
  }

  const {
    data: orgs,
    error,
    // Total éligible, que PostgREST rend indépendamment du `limit` : c'est lui
    // qui rend le reliquat mesurable au lieu de le faire disparaître.
    count: eligibleCount,
  } = await admin
    .from("organizations")
    .select("id, name", { count: "exact" })
    // Sans ce filtre, le réglage d'opt-out serait purement décoratif.
    .eq("weekly_digest", true)
    .order("id", { ascending: true })
    .limit(MAX_ORGS);

  if (error) {
    reportError("cron.weekly-digest.orgs", error.message);
    throw new Error("Lecture des organisations impossible.");
  }

  const selected = (orgs ?? []) as Array<{ id: string; name: string }>;
  counters.organizations = selected.length;
  counters.deferred = Math.max(0, (eligibleCount ?? selected.length) - selected.length);

  const periodKey = isoWeekKey(now);
  const settingsUrl = `${APP_URL}/dashboard/settings#weekly-digest`;
  const outbox: Array<{
    email: string;
    organizationName: string;
    stats: WeeklyDigestStats;
    settingsUrl: string;
  }> = [];
  let firstDigestError: string | null = null;

  for (const org of selected) {
    const { data, error: digestError } = await admin.rpc("org_weekly_digest", {
      p_organization_id: org.id,
      p_days: 7,
    });
    if (digestError) {
      // Une organisation en échec ne fait pas tomber les autres. Une seule
      // remontée pour tout le passage : une base indisponible est UN incident,
      // pas deux cents.
      counters.digest_failed += 1;
      firstDigestError ??= digestError.message;
      continue;
    }

    const stats = parseWeeklyDigest(
      Array.isArray(data) ? data[0] : (data as unknown),
    );
    // Aucune ligne rendue = aucune activité mesurable : même issue qu'une
    // semaine vide, et surtout pas un e-mail composé sur des zéros supposés.
    if (!stats || !digestIsWorthSending(stats)) {
      counters.skipped_empty += 1;
      continue;
    }

    const recipients = await digestRecipients(admin, org.id);
    if (recipients.length === 0) {
      counters.skipped_no_recipient += 1;
      continue;
    }
    counters.eligible_recipients += recipients.length;

    const reserved = await reserveDigestSlots(
      admin,
      org.id,
      periodKey,
      recipients.map((r) => r.email),
    );
    counters.skipped_already_sent += recipients.length - reserved.size;

    for (const recipient of recipients) {
      if (!reserved.has(recipient.email)) continue;
      outbox.push({
        email: recipient.email,
        organizationName: org.name,
        // LE TRI DES MONTANTS, par destinataire et non par organisation.
        stats: digestForRole(stats, recipient.role),
        settingsUrl,
      });
    }
  }

  if (firstDigestError) {
    reportError("cron.weekly-digest.rpc", firstDigestError);
  }

  if (outbox.length > 0) {
    const { sent } = await sendWeeklyDigestEmails({ recipients: outbox });
    counters.sent = sent;
  }

  return counters;
}

/**
 * Réserve atomiquement (dedup_key unique) les envois de la semaine et rend
 * les adresses RÉELLEMENT réservées : un second passage la même semaine
 * n'insère rien, donc n'envoie rien.
 *
 * Une panne du journal rend un ensemble VIDE — donc aucun envoi. C'est
 * délibéré : sans anti-doublon fiable, ne pas envoyer vaut mieux qu'envoyer
 * peut-être deux fois.
 */
async function reserveDigestSlots(
  admin: Admin,
  organizationId: string,
  periodKey: string,
  emails: string[],
): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const rows = emails.map((email) => ({
    organization_id: organizationId,
    scenario: "weekly_digest",
    recipient: email,
    participation_id: null,
    dedup_key: weeklyDigestDedupKey(organizationId, periodKey, email),
  }));
  const { data, error } = await admin
    .from("email_log")
    .upsert(rows, { onConflict: "dedup_key", ignoreDuplicates: true })
    .select("recipient");
  if (error) {
    reportError("cron.weekly-digest.log", error.message);
    return new Set();
  }
  return new Set(
    ((data as Array<{ recipient: string }> | null) ?? []).map((r) => r.recipient),
  );
}
