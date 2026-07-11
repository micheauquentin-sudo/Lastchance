import type { Organization } from "@/types/database";

type OrgAccessFields = Pick<
  Organization,
  "subscription_status" | "trial_ends_at" | "past_due_since"
>;

const MS_PER_DAY = 86_400_000;

/**
 * Délai de grâce sur un impayé : Stripe relance la carte pendant
 * plusieurs jours (dunning, ~2 semaines par défaut) et notifie la fin
 * réelle de l'abonnement (canceled/unpaid) par webhook. Pendant cette
 * fenêtre, couper le jeu du commerçant pour une carte expirée serait
 * disproportionné. La borne applicative garantit la coupure même si le
 * webhook final n'arrivait jamais.
 */
export const PAST_DUE_GRACE_DAYS = 14;

/**
 * L'organisation a-t-elle un accès complet (roues publiques jouables,
 * campagnes activables) ?
 * - abonnement Stripe actif → oui
 * - essai en cours (statut trialing, trial_ends_at non dépassé) → oui
 * - impayé (past_due) → oui pendant le délai de grâce, non au-delà
 * - essai expiré ou abonnement annulé → non : le commerçant garde son
 *   dashboard et peut créer des QR codes, mais ne peut plus activer de
 *   campagne et ses roues publiques sont désactivées.
 */
export function hasActiveAccess(org: OrgAccessFields, now = new Date()): boolean {
  if (org.subscription_status === "active") return true;
  if (org.subscription_status === "past_due") {
    const graceEnd = pastDueGraceEndsAt(org);
    // past_due_since absent = transition en cours (le webhook la date) :
    // on ne coupe pas sur un état incomplet.
    return graceEnd === null || graceEnd.getTime() > now.getTime();
  }
  if (org.subscription_status !== "trialing") return false;
  return new Date(org.trial_ends_at).getTime() > now.getTime();
}

/** Fin du délai de grâce d'un impayé, null hors impayé daté. */
export function pastDueGraceEndsAt(org: OrgAccessFields): Date | null {
  if (org.subscription_status !== "past_due" || !org.past_due_since) {
    return null;
  }
  return new Date(
    new Date(org.past_due_since).getTime() + PAST_DUE_GRACE_DAYS * MS_PER_DAY,
  );
}

/** L'organisation est-elle en essai expiré (jamais abonnée) ? */
export function isTrialExpired(org: OrgAccessFields, now = new Date()): boolean {
  return (
    org.subscription_status === "trialing" &&
    new Date(org.trial_ends_at).getTime() <= now.getTime()
  );
}

/** Jours d'essai restants (arrondi supérieur), 0 si expiré ou non concerné. */
export function trialDaysLeft(org: OrgAccessFields, now = new Date()): number {
  if (org.subscription_status !== "trialing") return 0;
  const remaining = new Date(org.trial_ends_at).getTime() - now.getTime();
  return Math.max(0, Math.ceil(remaining / MS_PER_DAY));
}
