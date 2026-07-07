import type { Organization } from "@/types/database";

type OrgAccessFields = Pick<
  Organization,
  "subscription_status" | "trial_ends_at"
>;

const MS_PER_DAY = 86_400_000;

/**
 * L'organisation a-t-elle un accès complet (roues publiques jouables,
 * campagnes activables) ?
 * - abonnement Stripe actif → oui
 * - essai en cours (statut trialing, trial_ends_at non dépassé) → oui
 * - essai expiré ou abonnement annulé/impayé → non : le commerçant
 *   garde son dashboard et peut créer des QR codes, mais ne peut plus
 *   activer de campagne et ses roues publiques sont désactivées.
 */
export function hasActiveAccess(org: OrgAccessFields, now = new Date()): boolean {
  if (org.subscription_status === "active") return true;
  if (org.subscription_status !== "trialing") return false;
  return new Date(org.trial_ends_at).getTime() > now.getTime();
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
