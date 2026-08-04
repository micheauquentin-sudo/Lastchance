import type { Organization, SubscriptionStatus } from "@/types/database";

/**
 * Les neuf modules qui peuvent porter un octroi daté. Miroir du `check` de
 * `organization_module_grants.module` et du `if not in` de
 * `org_has_module_access` — les trois listes sont comparées entre elles par
 * `supabase/tests/module_grants.test.sql`, dans le catalogue vivant.
 */
export const GRANTABLE_MODULES = [
  "wheel",
  "hunts",
  "calendar",
  "loyalty",
  "quiz",
  "jackpot",
  "events",
  "referral",
  "pronostics",
] as const;

/**
 * Le type est DÉRIVÉ de la liste, et non écrit à côté d'elle : les deux ne
 * peuvent donc pas diverger. Ce module n'importe que des types, il est
 * lisible depuis un composant client — c'est pourquoi la liste vit ici et non
 * dans `validations/admin`, dont la chaîne d'imports atteint
 * `@/lib/supabase/admin` et ferait entrer du code serveur dans le bundle.
 * (Le build l'a refusé, ce n'est pas une précaution théorique.)
 */
export type GrantableModule = (typeof GRANTABLE_MODULES)[number];

type OrgAccessFields = Pick<
  Organization,
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "comp_access"
  | "comp_access_until"
> & {
  /**
   * Modules portant un octroi daté VIVANT (démarré, non échu, non révoqué),
   * tel que le rend `org_has_live_module_grant` côté SQL.
   *
   * OPTIONNEL, ET C'EST LE POINT : ce champ est ajouté au type plutôt qu'un
   * paramètre à chacune des fonctions ci-dessous. Une signature élargie aurait
   * obligé à toucher les quelque quatre-vingts appelants pour qu'ils passent
   * une valeur qu'aucun d'eux ne connaît encore. Absent ou vide, il rend le
   * comportement STRICTEMENT identique à celui d'avant le lot 2 : c'est ce qui
   * rend la bascule sûre, chaque appelant gagnant la connaissance des octrois
   * le jour où son chargeur la lui fournit, et pas avant.
   *
   * Le revers est réel et se lit ici : un appelant qui ne renseigne pas ce
   * champ refusera un droit que la base accorde. Le sens de l'erreur est
   * délibéré — on dégrade vers le refus, jamais vers l'octroi.
   */
  live_module_grants?: readonly GrantableModule[] | null;
};

/**
 * Un octroi vivant couvre-t-il CE module ? Port de
 * `org_has_live_module_grant` (migration 20260907120000).
 */
export function hasLiveModuleGrant(
  org: Pick<OrgAccessFields, "live_module_grants">,
  module: GrantableModule,
): boolean {
  return (org.live_module_grants ?? []).includes(module);
}

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
 * Marge après `trial_ends_at` avant que le cron `expire-trials` ne bascule un
 * essai jamais converti en `canceled`.
 *
 * TROIS JOURS, et ce chiffre n'est pas arbitraire : c'est la durée pendant
 * laquelle Stripe réessaie un webhook dont l'endpoint répond mal. Une panne
 * COMPLÈTE de notre réception d'événements se rattrape donc à l'intérieur de
 * la fenêtre, et l'abonnement souscrit la veille de l'expiration est annoncé
 * avant qu'on ne touche au statut. Le décalage d'horloge entre Vercel,
 * Postgres et Stripe se compte en secondes : il est couvert mille fois.
 *
 * Ce délai n'est PAS ce qui protège du faux positif — c'est
 * `hasLiveStripeSubscription`, interrogé avant chaque bascule, qui le fait.
 * La marge n'est que la seconde couche : elle évite d'aller déranger Stripe
 * pour des comptes dont l'essai vient tout juste de finir.
 *
 * Aucun accès n'en dépend : `hasActiveAccess` coupe à `trial_ends_at`, pas
 * ici. Allonger ce délai laisse le statut mentir plus longtemps, il ne prête
 * rien à personne.
 */
export const TRIAL_EXPIRY_GRACE_DAYS = 3;

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
  // BRANCHE NEUVE (lot 2, migration 20260907120000) : un octroi daté vivant —
  // quel que soit son module — porte le socle commun avec lui. C'est « tout
  // add-on peut être acheté seul : il embarque les briques communes »
  // (docs/codex-handoff.md §2). Le OU est le point : l'octroi ne remplace pas
  // l'abonnement, il devient une seconde source du même droit.
  //
  // La PAUSE À L'ÉCHÉANCE opère ici par ABSENCE : passé sa fin, l'octroi ne
  // figure plus dans `live_module_grants`, cette branche cesse de répondre et
  // le socle retombe sur l'abonnement — qui refusera s'il n'y en a pas. Aucune
  // écriture, donc aucune prolongation possible par panne.
  if ((org.live_module_grants?.length ?? 0) > 0) return true;
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
  // Un octroi daté vivant de CE module se suffit (lot 2) : il n'exige aucun
  // abonnement. Sinon, la règle d'avant reste entière.
  if (hasLiveModuleGrant(org, "pronostics")) return true;
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
  // Un octroi daté vivant de CE module se suffit (lot 2) : il n'exige aucun
  // abonnement. Sinon, la règle d'avant reste entière.
  if (hasLiveModuleGrant(org, "hunts")) return true;
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
  // Un octroi daté vivant de CE module se suffit (lot 2) : il n'exige aucun
  // abonnement. Sinon, la règle d'avant reste entière.
  if (hasLiveModuleGrant(org, "loyalty")) return true;
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
  // Un octroi daté vivant de CE module se suffit (lot 2) : il n'exige aucun
  // abonnement. Sinon, la règle d'avant reste entière.
  if (hasLiveModuleGrant(org, "jackpot")) return true;
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
  // Un octroi daté vivant de CE module se suffit (lot 2) : il n'exige aucun
  // abonnement. Sinon, la règle d'avant reste entière.
  if (hasLiveModuleGrant(org, "events")) return true;
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
  // Un octroi daté vivant de CE module se suffit (lot 2) : il n'exige aucun
  // abonnement. Sinon, la règle d'avant reste entière.
  if (hasLiveModuleGrant(org, "calendar")) return true;
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
 *   rouvert après une résiliation. Volontairement PAS rouvert sur
 *   `inactive` : ce statut couvre `incomplete` et `paused`, où un objet
 *   abonnement existe encore chez Stripe et se reprend depuis le portail —
 *   y offrir un checkout ferait facturer deux abonnements au même
 *   commerçant.
 *
 * Les deux peuvent être vrais en même temps (abonnement résilié : on
 * consulte ses factures ET on se réabonne) : ce ne sont pas deux branches
 * d'une alternative.
 *
 * CE QUE CETTE FONCTION NE GARANTIT PAS, et il faut le lire avant de s'y
 * fier. Une version antérieure de ce commentaire affirmait qu'ouvrir le
 * checkout sur `canceled` ne risquait aucun doublon, « `canceled` étant
 * terminal chez Stripe ». C'était faux : le `canceled` lu ici n'est pas le
 * `canceled` de Stripe mais le résultat de `mapStripeStatus`, qui y replie
 * AUSSI `unpaid` — un abonnement toujours vivant, que le portail réactive.
 * Un commerçant en impayé voit donc les deux boutons.
 *
 * Le repli n'est pas défait pour autant : il est délibéré et documenté côté
 * accès (00009_past_due_grace.sql, docs/decisions.md), où `unpaid` doit
 * couper comme un résilié, et le statut interne n'a que cinq valeurs
 * autorisées en base. L'information perdue n'est nulle part en local.
 *
 * Ces trois booléens décident donc de ce qu'on AFFICHE, jamais de ce qu'on
 * autorise. Le refus qui protège l'argent est posé côté serveur par
 * `createCheckoutSession` (src/actions/billing.ts), qui interroge Stripe via
 * `hasLiveStripeSubscription` avant d'ouvrir la moindre session — il ferme
 * du même geste la page laissée ouverte et le POST rejoué, que masquer un
 * bouton n'a jamais arrêtés.
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

/**
 * Le refus que `createCheckoutSession` oppose quand Stripe confirme un
 * abonnement ENCORE VIVANT pour ce client. Partagé entre l'action qui le
 * produit et l'écran qui le rend, parce que le second doit ouvrir la sortie
 * que le premier nomme — voir `billingButtonsToShow`.
 */
export const CHECKOUT_REFUS_ABONNEMENT_VIVANT =
  "Un abonnement est déjà ouvert pour ce compte. Utilisez "
  + "« Gérer mon abonnement » sur cet écran pour le reprendre ou mettre à "
  + "jour votre moyen de paiement.";

/**
 * Quels boutons de facturation l'écran doit RÉELLEMENT rendre, une fois connu
 * le refus que l'action vient d'opposer.
 *
 * ── LE DÉFAUT QUE CETTE FONCTION FERME ──
 *
 * Le propriétaire paie sur Stripe, revient sur Réglages, puis reclique
 * « Réglages » dans le menu : l'URL perd `?checkout=success`, donc `justPaid`
 * retombe à faux. Si le webhook n'a pas encore été appliqué — ou ne l'est
 * JAMAIS (endpoint mal configuré, prix absent de la configuration : la route
 * du webhook rend alors 500 sans appeler la RPC) —, `stripe_event_created_at`
 * reste null, donc `everSubscribed` faux : `canCheckout` est vrai et
 * `canManage` faux. Il revoit « Démarrer mon abonnement », clique, et reçoit
 * un refus qui le renvoie vers « Gérer mon abonnement »… un bouton que
 * `canManage` vient précisément de cacher. De l'argent a changé de main et
 * l'écran ne porte plus aucune action.
 *
 * Le trou est BORNÉ à ce sous-cas : l'impayé (`unpaid` replié sur `canceled`)
 * déclenche le même refus, mais avec `everSubscribed` vrai, donc avec le
 * portail déjà affiché. On ne corrige pas une généralité.
 *
 * ── POURQUOI OUVRIR LE PORTAIL EST SÛR ICI, ET PAS EN GÉNÉRAL ──
 *
 * On n'élargit PAS `canManage` à `stripeCustomerId !== null` : un client
 * Stripe existe dès l'OUVERTURE du Checkout, donc dès le premier abandon de
 * la page de paiement, et le portail serait offert en permanence à quelqu'un
 * qui n'a jamais souscrit — le portail ne sait pas créer d'abonnement, il
 * n'aurait rien à lui montrer.
 *
 * On ouvre le portail sur LE SEUL refus qui prouve le contraire : ce message
 * n'est produit qu'après `hasLiveStripeSubscription`, c'est-à-dire après que
 * Stripe a énuméré un abonnement non terminal pour ce client. Et le client
 * Stripe est nécessairement persisté à cet instant, `ensureStripeCustomer`
 * ayant écrit `organizations.stripe_customer_id` avant que la garde ne parle :
 * le bouton ouvert ici ne peut donc pas retomber sur le « Aucun abonnement à
 * gérer » de `createPortalSession`.
 *
 * Rendre le bouton n'AUTORISE rien : `createPortalSession` garde son
 * `requireOrganizationOwner` et lit le client Stripe en base, jamais depuis
 * l'écran. Forger ce message côté client ne fait qu'afficher un bouton qui
 * s'exécute avec exactement les mêmes droits.
 *
 * CE QUE ÇA NE RÉPARE PAS, et qu'il faut lire : tant que le webhook n'est pas
 * appliqué, l'organisation reste `trialing` avec un essai échu, donc
 * `hasActiveAccess` faux — le commerçant est débité ET ses roues sont
 * coupées. Le portail lui rend une SORTIE (voir sa facture, sa carte,
 * résilier), pas son accès ; rétablir l'accès demande de réconcilier l'état
 * Stripe en base, ce qu'aucun de ces quatre fichiers ne peut faire.
 */
export function billingButtonsToShow(input: {
  canCheckout: boolean;
  canManage: boolean;
  /** Refus rendu par `createCheckoutSession`, s'il y en a un. */
  checkoutError?: string | null;
}): { showCheckout: boolean; showPortal: boolean } {
  return {
    showCheckout: input.canCheckout,
    showPortal:
      input.canManage
      || input.checkoutError === CHECKOUT_REFUS_ABONNEMENT_VIVANT,
  };
}

/**
 * L'organisation est-elle en essai expiré, sans jamais s'être abonnée ?
 *
 * CE PRÉDICAT NE PEUT PLUS SE LIRE SUR LE SEUL STATUT. Il testait
 * `subscription_status === 'trialing'`, ce qui suffisait tant qu'un essai non
 * converti restait `trialing` pour l'éternité. Le cron `expire-trials` le
 * bascule désormais en `canceled` — et `canceled` recouvre deux situations
 * que le commerçant ne vit PAS de la même façon :
 *   - « votre essai est terminé, abonnez-vous » (jamais souscrit) ;
 *   - « votre abonnement a été résilié » (a souscrit, puis a arrêté).
 *
 * Le discriminant est `stripe_event_created_at` : il n'est écrit que par
 * `apply_stripe_subscription_event_v2`, donc seulement quand Stripe a
 * réellement annoncé un abonnement. On le passe ici sous forme booléenne
 * (`ever_subscribed`) parce que la colonne n'est pas dans le
 * `grant select(...)` accordé à `authenticated` (00017) : elle se lit par un
 * client service_role, et l'appelant seul sait comment se la procurer.
 *
 * `ever_subscribed` est OPTIONNEL et testé `=== false` : un appelant qui ne
 * sait pas répondre garde exactement l'ancien comportement (seul `trialing`
 * compte). Le repli ne peut donc jamais faire dire « essai terminé » à un
 * vrai résilié — il fait, au pire, retomber sur le message générique.
 */
export function isTrialExpired(
  org: OrgAccessFields & { ever_subscribed?: boolean },
  now = new Date(),
): boolean {
  if (new Date(org.trial_ends_at).getTime() > now.getTime()) return false;
  if (org.subscription_status === "trialing") return true;
  return org.subscription_status === "canceled" && org.ever_subscribed === false;
}

/**
 * Ligne « Essai gratuit » de la fiche d'abonnement — ou `null` quand il n'y a
 * plus rien à en dire.
 *
 * ── Ce que la cascade précédente promettait à un abonné ──
 *
 * Elle ne testait que deux cas — `trialExpired`, puis `trialing` — et TOUT le
 * reste retombait sur `${plan.trialDays} jours`, c'est-à-dire la valeur
 * STATIQUE du catalogue. Un commerçant qui paie, badge vert « Actif » quatre
 * lignes plus haut, lisait donc « Essai gratuit : 7 jours » : le seul endroit
 * de la page qui parle de l'essai en promettait un neuf à quelqu'un qui venait
 * d'être débité. Idem pour `past_due`, et pour un résilié après un vrai
 * abonnement.
 *
 * La règle : `plan.trialDays` est un argument de VENTE, il n'a de sens que
 * pour qui n'a pas encore commencé. Dès qu'un statut Stripe existe, la ligne
 * décrit l'organisation, pas le catalogue.
 *
 * L'ORDRE COMPTE toujours : tester `trialing` d'abord réafficherait « N jours
 * restants » à un essai que le cron `expire-trials` vient de basculer.
 */
export function trialLine(input: {
  status: SubscriptionStatus;
  /** `isTrialExpired`, déjà calculé par l'appelant (il a le discriminant). */
  trialExpired: boolean;
  /** `trialDaysLeft`, pertinent seulement pendant l'essai. */
  daysLeft: number;
  /** Durée d'essai du catalogue — argument de vente, jamais un état. */
  trialDays: number;
}): string | null {
  if (input.trialExpired) return "Terminé";
  if (input.status === "trialing") {
    const n = Math.max(0, input.daysLeft);
    return `${n} jour${n > 1 ? "s" : ""} restant${n > 1 ? "s" : ""}`;
  }
  // Un statut Stripe VIVANT (ou mort après avoir vécu) clôt la question de
  // l'essai : on n'en parle plus du tout, plutôt que d'écrire « Terminé » à
  // quelqu'un qui n'en a peut-être jamais eu.
  if (input.status !== "inactive") return null;
  // `inactive` = aucun abonnement n'a jamais commencé : la promesse du
  // catalogue est encore vraie, et c'est le seul cas où elle l'est.
  return `${input.trialDays} jours`;
}

/**
 * Statut à AFFICHER, distinct du statut stocké. Voir `isTrialExpired` : un
 * essai jamais converti et un abonnement résilié portent tous deux
 * `canceled` en base, et les confondre dans le back-office donnerait
 * « Annulé » à un commerçant qui n'a jamais rien souscrit.
 */
export type SubscriptionDisplayStatus = SubscriptionStatus | "trial_expired";

export function displaySubscriptionStatus(org: {
  subscription_status: SubscriptionStatus;
  stripe_event_created_at: string | null;
}): SubscriptionDisplayStatus {
  if (org.subscription_status === "canceled" && org.stripe_event_created_at === null) {
    return "trial_expired";
  }
  return org.subscription_status;
}

/** Jours d'essai restants (arrondi supérieur), 0 si expiré ou non concerné. */
export function trialDaysLeft(org: OrgAccessFields, now = new Date()): number {
  if (org.subscription_status !== "trialing") return 0;
  const remaining = new Date(org.trial_ends_at).getTime() - now.getTime();
  return Math.max(0, Math.ceil(remaining / MS_PER_DAY));
}
