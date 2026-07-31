import type { Organization, SubscriptionStatus } from "@/types/database";

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

type OrgEventsFields = OrgAccessFields & Pick<Organization, "addon_events">;

/**
 * Le module Mode événement en direct est-il utilisable ? Miroir exact de
 * hasJackpotAccess : addon activé (option payante ou incluse, géré depuis le
 * back-office admin) + accès actif — un essai expiré coupe aussi les événements.
 */
export function hasEventsAccess(
  org: OrgEventsFields,
  now = new Date(),
): boolean {
  return org.addon_events && hasActiveAccess(org, now);
}

type OrgCalendarFields = OrgAccessFields & Pick<Organization, "addon_calendar">;

/**
 * Le module Calendrier / campagnes quotidiennes est-il utilisable ? Miroir exact
 * de hasEventsAccess : addon activé (option payante ou incluse, géré depuis le
 * back-office admin) + accès actif — un essai expiré coupe aussi les calendriers.
 */
export function hasCalendarAccess(
  org: OrgCalendarFields,
  now = new Date(),
): boolean {
  return org.addon_calendar && hasActiveAccess(org, now);
}

/**
 * Ce que la page Réglages doit lire pour décider des deux boutons de
 * facturation. Type local et non `Pick<Organization, …>` : la colonne
 * `stripe_event_created_at` n'est pas dans le `grant select(...)` accordé à
 * `authenticated` sur `organizations` (migration 00017), elle ne se lit donc
 * que par le client service_role et n'appartient pas à l'objet rendu par
 * `getUserAndOrg`.
 */
export interface BillingActionsFields {
  /**
   * Client Stripe de l'organisation. Il est créé — et persisté — à
   * l'OUVERTURE de la page de paiement (`ensureStripeCustomer`, appelé par
   * `createCheckoutSession` AVANT `checkout.sessions.create`), jamais à
   * l'encaissement. Sa présence ne prouve donc AUCUN abonnement : un
   * commerçant qui clique « Retour » sur la page Stripe en repart avec un
   * client Stripe et zéro souscription, et rien ne le remet jamais à null.
   */
  stripeCustomerId: string | null;
  subscriptionStatus: SubscriptionStatus;
  /**
   * Date de l'événement d'abonnement Stripe le plus récent appliqué. Écrite
   * UNIQUEMENT par `apply_stripe_subscription_event_v2` (migration
   * 20260805170000, seule définition vivante), c'est-à-dire seulement quand
   * Stripe a réellement annoncé un abonnement. C'est le discriminant « cette
   * organisation est déjà passée par une souscription ».
   */
  stripeEventCreatedAt: string | null;
  /**
   * Le commerçant revient-il à l'instant d'un paiement réussi
   * (`?checkout=success`) ? Le webhook qui écrit `stripeEventCreatedAt`
   * arrive quelques secondes plus tard : sans ce drapeau, la page propose
   * un SECOND paiement à quelqu'un qui vient de payer.
   */
  justPaid?: boolean;
}

/**
 * Quelles actions de facturation proposer au propriétaire.
 *
 * Le piège que cette fonction existe pour fermer : « posséder un client
 * Stripe » ≠ « posséder un abonnement ». Confondre les deux faisait
 * disparaître définitivement le bouton « Démarrer mon abonnement » dès le
 * premier abandon de la page de paiement, en le remplaçant par un portail
 * client qui, lui, ne sait pas créer d'abonnement.
 *
 * - `canManage` : le portail Stripe n'a de sens que pour un client qui a
 *   effectivement souscrit une fois (moyens de paiement, factures,
 *   résiliation). Il reste ouvert après une résiliation : l'historique de
 *   facturation appartient au commerçant.
 * - `canCheckout` : ouvert tant qu'aucune souscription n'a eu lieu, et
 *   rouvert après une résiliation — `canceled` est terminal chez Stripe, un
 *   nouvel abonnement est le SEUL retour possible, donc aucun risque de
 *   doublon. Volontairement PAS rouvert sur `inactive` : ce statut couvre
 *   `incomplete` et `paused`, où un objet abonnement existe encore chez
 *   Stripe et se reprend depuis le portail — y offrir un checkout ferait
 *   facturer deux abonnements au même commerçant.
 *
 * Les deux peuvent être vrais en même temps (abonnement résilié : on
 * consulte ses factures ET on se réabonne) : ce ne sont pas deux branches
 * d'une alternative.
 */
export function billingActions(org: BillingActionsFields): {
  /** Stripe a déjà annoncé un abonnement pour cette organisation. */
  everSubscribed: boolean;
  /** Abonnement Stripe encore vivant (ni résilié, ni jamais souscrit). */
  hasLiveSubscription: boolean;
  canCheckout: boolean;
  canManage: boolean;
} {
  const everSubscribed = org.stripeEventCreatedAt !== null;
  // FENÊTRE DU RETOUR DE PAIEMENT. `stripe_event_created_at` n'est écrit que
  // par le webhook, qui arrive quelques secondes APRÈS que Stripe a renvoyé
  // le commerçant sur `?checkout=success`. Pendant cet intervalle
  // `everSubscribed` est encore faux : la page afficherait « Votre abonnement
  // est en cours d'activation » ET, juste dessous, « Démarrer mon
  // abonnement ». Le commerçant qui vient de payer et qui reclique paie deux
  // fois.
  //
  // L'ancien prédicat (`!!stripe_customer_id`, posé à l'OUVERTURE du
  // paiement) fermait cette fenêtre — trop largement, c'était le défaut
  // qu'on corrige, mais il la fermait. La remplacer sans la rouvrir demande
  // de dire explicitement « il revient de payer ».
  //
  // Le paramètre vient de l'URL, donc forgeable : le forger ne fait que
  // masquer son propre bouton, jamais accorder quoi que ce soit. Aucun
  // droit ne se dérive d'ici.
  const canCheckout =
    !org.justPaid && (!everSubscribed || org.subscriptionStatus === "canceled");
  return {
    everSubscribed,
    hasLiveSubscription: everSubscribed && !canCheckout,
    canCheckout,
    canManage: everSubscribed && org.stripeCustomerId !== null,
  };
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
