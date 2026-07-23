import type { Organization } from "@/types/database";

type OrgAccessFields = Pick<
  Organization,
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "comp_access"
  | "comp_access_until"
>;

const MS_PER_DAY = 86_400_000;

/**
 * Accès offert en cours ? Accordé manuellement depuis le back-office
 * (premium sans paiement) : actif tant que `comp_access` est vrai et,
 * s'il est daté, que `comp_access_until` n'est pas dépassé.
 */
export function hasCompAccess(
  org: Pick<Organization, "comp_access" | "comp_access_until">,
  now = new Date(),
): boolean {
  if (!org.comp_access) return false;
  if (!org.comp_access_until) return true;
  return new Date(org.comp_access_until).getTime() > now.getTime();
}

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
  // Accès offert par le back-office : prime sur l'état Stripe.
  if (hasCompAccess(org, now)) return true;
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

type OrgPronosticsFields = OrgAccessFields & Pick<Organization, "addon_pronostics">;

/**
 * Le module Pronostics est-il utilisable ? Addon activé (option payante
 * ou incluse, géré depuis le back-office admin) + accès actif — même
 * règle que les roues : un essai expiré coupe aussi les pronostics.
 */
export function hasPronosticsAccess(
  org: OrgPronosticsFields,
  now = new Date(),
): boolean {
  return org.addon_pronostics && hasActiveAccess(org, now);
}

type OrgHuntsFields = OrgAccessFields & Pick<Organization, "addon_hunts">;

/**
 * Le module Chasse au trésor est-il utilisable ? Miroir exact de
 * hasPronosticsAccess : addon activé (option payante ou incluse, géré
 * depuis le back-office admin) + accès actif — un essai expiré coupe
 * aussi les chasses.
 */
export function hasHuntsAccess(
  org: OrgHuntsFields,
  now = new Date(),
): boolean {
  return org.addon_hunts && hasActiveAccess(org, now);
}

type OrgLoyaltyFields = OrgAccessFields & Pick<Organization, "addon_loyalty">;

/**
 * Le module Passeport de fidélité est-il utilisable ? Miroir exact de
 * hasHuntsAccess : addon activé (option payante ou incluse, géré depuis le
 * back-office admin) + accès actif — un essai expiré coupe aussi la fidélité.
 */
export function hasLoyaltyAccess(
  org: OrgLoyaltyFields,
  now = new Date(),
): boolean {
  return org.addon_loyalty && hasActiveAccess(org, now);
}

type OrgJackpotFields = OrgAccessFields & Pick<Organization, "addon_jackpot">;

/**
 * Le module Jackpot collectif est-il utilisable ? Miroir exact de
 * hasLoyaltyAccess : addon activé (option payante ou incluse, géré depuis le
 * back-office admin) + accès actif — un essai expiré coupe aussi le jackpot.
 */
export function hasJackpotAccess(
  org: OrgJackpotFields,
  now = new Date(),
): boolean {
  return org.addon_jackpot && hasActiveAccess(org, now);
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
