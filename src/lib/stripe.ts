import "server-only";

import Stripe from "stripe";
import { optionalEnv, requiredEnv } from "@/lib/env";
import { PLAN_TIERS, type PlanTier, type PlanTierId } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
// Le plafond est celui du geste manuel, et il est repris ici volontairement :
// « un crédit SMS ne se reprend pas » est la même propriété, quelle que soit
// la porte d'entrée. Deux constantes le diraient deux fois, et divergeraient.
import { SMS_CREDIT_MAX_UNITS } from "@/lib/validations/admin";
import type { Entitlement } from "@/platform/experiences/contract";
import type { SubscriptionStatus } from "@/types/database";

export function getStripe(): Stripe {
  // STRIPE_API_BASE : uniquement pour les tests (stub local / stripe-mock).
  // Jamais défini en production — l'API officielle est utilisée par défaut.
  const base = optionalEnv("STRIPE_API_BASE");
  if (base) {
    const url = new URL(base);
    return new Stripe(requiredEnv("STRIPE_SECRET_KEY"), {
      host: url.hostname,
      port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
      protocol: url.protocol === "https:" ? "https" : "http",
    });
  }
  return new Stripe(requiredEnv("STRIPE_SECRET_KEY"));
}

const CUSTOMER_LINK_ERROR = "Impossible d'associer le client Stripe";

/**
 * Clé d'idempotence du client Stripe d'une organisation : déterministe et
 * stable, elle est la seule chose qui empêche deux appels simultanés de créer
 * deux clients. Stripe rejoue alors la première réponse au lieu de créer un
 * doublon, et les deux appels repartent avec le MÊME identifiant.
 * Les clés expirent après 24 h côté Stripe : au-delà, l'UPDATE conditionnel
 * ci-dessous reste le filet.
 */
function stripeCustomerIdempotencyKey(organizationId: string): string {
  return `lc-customer-${organizationId}`;
}

/**
 * Stripe refuse la clé dans deux cas, et les deux signifient « un autre appel
 * s'occupe déjà de cette organisation » :
 *  - 400, la clé est rejouée avec d'autres paramètres (second owner, autre
 *    email) ;
 *  - 409, la requête identique est encore en vol.
 * Le 409 n'est PAS une `StripeIdempotencyError` (le SDK ne mappe cette classe
 * que sur 400/404) : seul `rawType` couvre les deux.
 */
function isIdempotencyConflict(err: unknown): boolean {
  return (
    err instanceof Stripe.errors.StripeError
    && err.rawType === "idempotency_error"
  );
}

/** Lit l'identifiant client Stripe actuellement enregistré pour une org. */
async function readStripeCustomerId(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) {
    console.error("[billing] read customer:", error.message);
    throw new Error(CUSTOMER_LINK_ERROR);
  }
  return (
    (data as { stripe_customer_id: string | null } | null)?.stripe_customer_id
    ?? null
  );
}

/**
 * Journalisation volontairement muette sur les identifiants : ni client
 * Stripe ni organisation ne transitent par les logs applicatifs.
 */
function logCustomerLink(message: string): void {
  console.warn(`[billing] ${message}`);
}

/**
 * Retourne le client Stripe de l'organisation, en le créant au besoin.
 *
 * IDEMPOTENCE — un `stripe_customer_id` déjà enregistré n'est JAMAIS écrasé :
 * c'est la seule clé qui relie les webhooks Stripe à l'organisation, et la
 * remplacer détacherait un abonnement payant de son commerçant. Trois
 * garde-fous en série, du moins cher au plus sûr :
 *  1. l'instantané reçu par l'appelant peut être périmé : la base est relue
 *     avant toute création ;
 *  2. la création porte une clé d'idempotence stable par organisation :
 *     deux appels simultanés obtiennent le même client, jamais deux ;
 *  3. l'association est posée par un UPDATE **conditionnel**
 *     (`stripe_customer_id is null`) — sous READ COMMITTED, deux appels
 *     simultanés ne peuvent pas se remplacer l'un l'autre : le second
 *     réévalue le prédicat après le verrou de ligne et ne touche rien. Il
 *     relit alors la ligne et réutilise l'identifiant du gagnant.
 */
export async function ensureStripeCustomer(
  stripe: Stripe,
  params: {
    organizationId: string;
    organizationName: string;
    email: string;
    existingCustomerId: string | null;
  },
): Promise<string> {
  if (params.existingCustomerId) return params.existingCustomerId;

  // Service role : seul le serveur associe un customer Stripe à une org.
  const admin = createAdminClient();
  const known = await readStripeCustomerId(admin, params.organizationId);
  if (known) return known;

  let customerId: string;
  try {
    const customer = await stripe.customers.create(
      {
        email: params.email,
        name: params.organizationName,
        metadata: { organization_id: params.organizationId },
      },
      { idempotencyKey: stripeCustomerIdempotencyKey(params.organizationId) },
    );
    customerId = customer.id;
  } catch (err) {
    // Toute autre panne Stripe doit remonter telle quelle : la masquer
    // reviendrait à inventer un état d'abonnement.
    if (!isIdempotencyConflict(err)) throw err;
    // La clé a déjà servi pour cette organisation : un appel concurrent a créé
    // le client, ou est en train de le faire. La base tranche.
    const inFlightWinner = await readStripeCustomerId(
      admin,
      params.organizationId,
    );
    if (inFlightWinner) {
      logCustomerLink("création concurrente détectée, client existant réutilisé");
      return inFlightWinner;
    }
    logCustomerLink("création concurrente encore en vol, abandon");
    throw new Error(CUSTOMER_LINK_ERROR);
  }

  const { data, error } = await admin
    .from("organizations")
    .update({ stripe_customer_id: customerId })
    .eq("id", params.organizationId)
    .is("stripe_customer_id", null)
    .select("stripe_customer_id");
  if (error) {
    console.error("[billing] save customer:", error.message);
    throw new Error(CUSTOMER_LINK_ERROR);
  }
  if (data && data.length > 0) return customerId;

  // Aucune ligne mise à jour : soit un appel concurrent a posé son
  // identifiant, soit l'organisation n'existe plus. La base fait foi.
  const winner = await readStripeCustomerId(admin, params.organizationId);
  if (!winner) {
    console.error("[billing] save customer: organisation introuvable");
    throw new Error(CUSTOMER_LINK_ERROR);
  }
  if (winner !== customerId) {
    logCustomerLink("course concurrente perdue, association existante conservée");
  }
  return winner;
}

/**
 * Un abonnement Stripe est-il DÉFINITIVEMENT mort ?
 *
 * Deux statuts seulement : `canceled` et `incomplete_expired`. Stripe refuse
 * de les annuler (ils le sont déjà) et rien ne les reprend — le seul retour
 * possible est un NOUVEL abonnement. Tous les autres, y compris `unpaid`,
 * `incomplete` et `paused`, décrivent un objet abonnement qui vit encore et
 * se reprend depuis le portail client.
 *
 * Ce prédicat n'existe qu'ici, en un seul exemplaire, parce qu'il tranche
 * deux questions qui doivent répondre pareil sous peine de coûter de
 * l'argent : « faut-il annuler cet abonnement ? » et « puis-je en ouvrir un
 * nouveau ? ». Le dupliquer, c'est laisser les deux réponses diverger.
 */
export function isTerminalSubscriptionStatus(
  status: Stripe.Subscription.Status,
): boolean {
  return status === "canceled" || status === "incomplete_expired";
}

/**
 * Ce client a-t-il encore, chez Stripe, un abonnement vivant ?
 *
 * LA QUESTION NE PEUT PAS SE RÉPONDRE EN LOCAL. `mapStripeStatus` replie
 * `unpaid` — abonnement bien vivant, que le portail réactive — sur le même
 * `canceled` qu'un `incomplete_expired` mort. Ce repli est délibéré et écrit
 * (00009_past_due_grace.sql, docs/decisions.md) : côté ACCÈS, un impayé sorti
 * du dunning ne doit plus jouer, exactement comme un résilié. Mais il détruit
 * l'information dont le CHECKOUT a besoin, et `organizations` ne conserve
 * nulle part le statut Stripe brut. Stripe fait donc foi, comme pour tout le
 * reste de l'état d'abonnement.
 *
 * Sortie au premier abonnement vivant rencontré : un client qui en possède un
 * ne coûte qu'une page, quel que soit son historique de résiliations.
 */
export async function hasLiveStripeSubscription(
  stripe: Stripe,
  customerId: string,
): Promise<boolean> {
  for await (const subscription of stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  })) {
    if (!isTerminalSubscriptionStatus(subscription.status)) return true;
  }
  return false;
}

/**
 * Stripe a-t-il DÉJÀ annoncé un abonnement pour cette organisation ?
 *
 * Lit `organizations.stripe_event_created_at`, écrite uniquement par
 * `apply_stripe_subscription_event_v2`. La colonne est hors du
 * `grant select(...)` accordé à `authenticated` (00017) : elle ne se lit que
 * par un client service_role, d'où cette fonction serveur plutôt qu'un champ
 * de plus dans `getUserAndOrg`.
 *
 * REPLI PRUDENT en cas de panne de lecture : `true`. Répondre `false`
 * ferait annoncer « votre essai gratuit est terminé » à un commerçant qui a
 * réellement souscrit puis résilié ; répondre `true` fait seulement retomber
 * sur le message générique « abonnement inactif », qui est ce qui s'affichait
 * avant l'existence de ce discriminant. On dégrade vers le vague, jamais vers
 * le faux.
 */
export async function hasEverSubscribed(organizationId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select("stripe_event_created_at")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) {
    console.error("[billing] read subscription history:", error.message);
    return true;
  }
  return (
    (data as { stripe_event_created_at: string | null } | null)
      ?.stripe_event_created_at != null
  );
}

/**
 * Annule tous les abonnements en cours d'un client Stripe. L'appel public
 * échoue explicitement si Stripe est absent ou indisponible : la suppression
 * locale peut ainsi être bloquée avant de perdre l'identifiant client.
 */
export async function cancelCustomerSubscriptionsWithClient(
  stripe: Stripe,
  customerId: string,
): Promise<void> {
  // ApiListPromise est un itérateur asynchrone : Stripe charge les pages
  // suivantes automatiquement au-delà de la limite de 100 résultats.
  for await (const subscription of stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  })) {
    if (!isTerminalSubscriptionStatus(subscription.status)) {
      await stripe.subscriptions.cancel(subscription.id);
    }
  }
}

export async function cancelCustomerSubscriptions(
  customerId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!optionalEnv("STRIPE_SECRET_KEY")) {
    return { ok: false, error: "Stripe n'est pas configuré." };
  }
  try {
    const stripe = getStripe();
    await cancelCustomerSubscriptionsWithClient(stripe, customerId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "stripe error" };
  }
}

/**
 * Prix Stripe d'une offre, par environnement. Le catalogue (`@/lib/plans`)
 * décrit ce que contient l'offre ; ces variables disent avec quel `price`
 * Stripe elle est facturée. Une offre sans identifiant configuré reste
 * affichable et n'ouvre simplement pas de checkout — jamais d'erreur.
 *
 * `core` accepte l'ancien nom `STRIPE_PRICE_ID_STARTER` : c'est le seul
 * price réellement provisionné historiquement, renommer la variable en
 * production couperait les souscriptions.
 */
const PLAN_PRICE_ENV: Record<PlanTierId, readonly string[]> = {
  core: ["STRIPE_PRICE_ID_CORE", "STRIPE_PRICE_ID_STARTER"],
  engagement: ["STRIPE_PRICE_ID_ENGAGEMENT"],
  live: ["STRIPE_PRICE_ID_LIVE"],
  full: ["STRIPE_PRICE_ID_FULL"],
};

export function getPlanPriceId(planId: PlanTierId): string | undefined {
  for (const name of PLAN_PRICE_ENV[planId]) {
    const value = optionalEnv(name);
    if (value) return value;
  }
  return undefined;
}

/** Une offre est souscrivable en ligne si son price Stripe est configuré. */
export function isPlanPurchasable(planId: PlanTierId): boolean {
  return getPlanPriceId(planId) !== undefined;
}

export type PlanWithBilling = PlanTier & { getPriceId: () => string | undefined };

/**
 * Offres = catalogue versionné + rattachement Stripe. L'ordre du catalogue
 * est conservé : il fait aussi office d'ordre de précédence quand un
 * abonnement porte plusieurs prix d'offre.
 */
export const PLANS: readonly PlanWithBilling[] = PLAN_TIERS.map((tier) => ({
  ...tier,
  getPriceId: () => getPlanPriceId(tier.id),
}));

export type PlanId = PlanTierId;

export function getPlan(planId: string): PlanWithBilling {
  return (
    PLANS.find(
      (plan) => plan.id === planId || plan.legacyIds.includes(planId),
    ) ?? PLANS[0]
  );
}

/**
 * Choisit l'offre à facturer au checkout. Une offre demandée explicitement
 * (CTA d'upgrade) doit exister au catalogue : une valeur inconnue est
 * REFUSÉE au lieu de retomber sur l'offre d'entrée, qui facturerait autre
 * chose que ce que le commerçant a cliqué. Sans demande explicite, l'offre
 * courante de l'organisation fait foi (comportement historique).
 *
 * Le montant n'est jamais construit ici : seul l'identifiant de price
 * Stripe est retourné.
 */
export function resolveCheckoutPlan(params: {
  requestedPlanId: string | null;
  organizationPlanId: string;
}):
  | { ok: true; plan: PlanWithBilling; priceId: string }
  | { ok: false; error: string } {
  const requestedId = params.requestedPlanId;
  let plan: PlanWithBilling;
  if (requestedId) {
    const requested = PLANS.find(
      (candidate) =>
        candidate.id === requestedId || candidate.legacyIds.includes(requestedId),
    );
    if (!requested) return { ok: false, error: "Offre inconnue." };
    plan = requested;
  } else {
    plan = getPlan(params.organizationPlanId);
  }

  const priceId = plan.getPriceId();
  if (!priceId) {
    return {
      ok: false,
      error: `La facturation de l'offre ${plan.name} n'est pas encore configurée.`,
    };
  }
  return { ok: true, plan, priceId };
}

const ADDON_PRICE_ENV: ReadonlyArray<{
  entitlement: Exclude<Entitlement, "core">;
  env: string;
}> = [
  { entitlement: "pronostics", env: "STRIPE_PRICE_ID_ADDON_PRONOSTICS" },
  { entitlement: "hunts", env: "STRIPE_PRICE_ID_ADDON_HUNTS" },
  { entitlement: "loyalty", env: "STRIPE_PRICE_ID_ADDON_LOYALTY" },
  { entitlement: "jackpot", env: "STRIPE_PRICE_ID_ADDON_JACKPOT" },
  { entitlement: "events", env: "STRIPE_PRICE_ID_ADDON_EVENTS" },
  { entitlement: "calendar", env: "STRIPE_PRICE_ID_ADDON_CALENDAR" },
  { entitlement: "quiz", env: "STRIPE_PRICE_ID_ADDON_QUIZ" },
  { entitlement: "referral", env: "STRIPE_PRICE_ID_ADDON_REFERRAL" },
];

/**
 * Traduit une photographie d'items Stripe en droits internes. Tout prix
 * inconnu est renvoyé explicitement : le webhook doit alors échouer et être
 * retenté, jamais couper silencieusement des modules.
 */
export function resolveStripeEntitlements(priceIds: string[]): {
  planId: PlanId;
  entitlements: Entitlement[];
  unknownPriceIds: string[];
} {
  const entitlements = new Set<Entitlement>();
  const unknownPriceIds: string[] = [];
  let selectedPlan: (typeof PLANS)[number] = PLANS[0];

  for (const priceId of new Set(priceIds)) {
    const plan = PLANS.find((candidate) => candidate.getPriceId() === priceId);
    if (plan) {
      if (
        PLANS.findIndex((candidate) => candidate.id === plan.id)
        > PLANS.findIndex((candidate) => candidate.id === selectedPlan.id)
      ) {
        selectedPlan = plan;
      }
      plan.entitlements.forEach((entitlement) => entitlements.add(entitlement));
      continue;
    }
    const addon = ADDON_PRICE_ENV.find(
      (candidate) => optionalEnv(candidate.env) === priceId,
    );
    if (addon) {
      entitlements.add(addon.entitlement);
      continue;
    }
    unknownPriceIds.push(priceId);
  }

  // LE COUPLE RENDU DOIT ÊTRE AUTO-COHÉRENT. `selectedPlan` vaut `PLANS[0]`
  // dès l'entrée, mais ses droits n'étaient ajoutés QUE si un prix d'offre
  // était rencontré dans la boucle. Deux sorties incohérentes en
  // découlaient, mesurées et non déduites :
  //
  //   · `[]`               → planId `core`, droits VIDES ;
  //   · `["price_addon"]`  → planId `core`, droits sans `core`.
  //
  // Aucune n'est atteignable aujourd'hui — le checkout envoie toujours un
  // prix d'offre, un abonnement Stripe porte toujours un item, et un prix
  // d'addon non configuré tombe dans `unknownPriceIds`, ce qui fait échouer
  // le webhook AVANT la RPC. La sûreté tient donc en partie à une
  // non-configuration, ce qui n'est pas une garantie.
  //
  // Le geste ferme aussi une borne repérée côté SQL : `p_entitlements` vide
  // sur un abonnement VIVANT poserait neuf lignes `active = false` et
  // rendrait la main au back-office alors que Stripe gouverne encore —
  // exactement l'inverse de ce que `protect_stripe_managed_entitlements`
  // protège. On le ferme ICI plutôt que par une garde dans la RPC : une RPC
  // qui lève ferait retenter Stripe trois jours puis abandonner, en laissant
  // l'organisation périmée. On remplacerait un cas impossible par une panne
  // possible.
  selectedPlan.entitlements.forEach((entitlement) => entitlements.add(entitlement));

  return {
    planId: selectedPlan.id,
    entitlements: [...entitlements],
    unknownPriceIds,
  };
}

/* ════════════════════════════════════════════════════════════
 * PACKS DE CRÉDIT SMS — un achat ponctuel, JAMAIS un abonnement
 *
 * ── POURQUOI CE BLOC EXISTE ─────────────────────────────────
 *
 * Jusqu'ici le crédit SMS ne naissait que du back-office plateforme
 * (`creditMerchantSmsBalance`, seul appelant de `credit_sms_balance`). Le
 * canal était donc inexploitable au-delà d'un commerçant : chacun devait être
 * crédité à la main. Ce bloc décrit ce que Stripe vend ; le webhook décide de
 * ce qui est crédité.
 *
 * ── MODE `payment`, ET C'EST LA DÉCISION STRUCTURANTE ───────
 *
 * Un pack de crédits n'est pas un abonnement. Le vendre en mode
 * `subscription` ferait naître un objet `Subscription` chez Stripe, donc des
 * `customer.subscription.*`, donc un passage par
 * `apply_stripe_subscription_event_v2` qui réécrirait `subscription_status`,
 * `plan` et les droits de l'organisation à partir d'un prix qui ne décrit
 * aucune offre. Autrement dit : acheter 500 SMS couperait l'accès aux modules
 * payés. Le mode `payment` n'émet aucun de ces événements.
 * ════════════════════════════════════════════════════════════ */

/**
 * Marqueur porté par la `metadata` de la session de paiement.
 *
 * C'est LUI qui route le webhook, pas l'identifiant de prix : un `price`
 * remplacé en production (changement de tarif) ne doit pas faire perdre la
 * nature d'un achat déjà payé dont l'événement est encore en cours de rejeu.
 */
export const SMS_CREDIT_PURCHASE = "sms_credits";

export interface SmsCreditPack {
  /** Identifiant stable, envoyé par le formulaire et gelé dans la metadata. */
  id: string;
  /** Nombre de SMS crédités. Vit ICI, jamais dans le navigateur. */
  units: number;
  label: string;
}

/**
 * Le catalogue des packs, rattaché à Stripe par environnement — exactement le
 * motif de `PLAN_PRICE_ENV` : le code dit ce que contient le pack, l'
 * environnement dit avec quel `price` il est facturé.
 *
 * AUCUN MONTANT ICI, et ce n'est pas un oubli : le prix vit dans le `price`
 * Stripe. Écrire « 500 SMS = 22 € » en dur ferait diverger l'affichage de ce
 * qui est réellement encaissé le jour où le tarif bouge.
 *
 * Un pack dont la variable n'est pas posée est simplement ABSENT de la liste
 * proposée — jamais une erreur au clic. Un environnement sans configuration
 * (développement, CI, préproduction fraîche) affiche donc une absence propre,
 * comme `getSmsProvider` rend `null` sans clé.
 */
const SMS_CREDIT_PACK_ENV: ReadonlyArray<SmsCreditPack & { env: string }> = [
  { id: "sms-100", units: 100, label: "100 SMS", env: "STRIPE_PRICE_ID_SMS_100" },
  { id: "sms-500", units: 500, label: "500 SMS", env: "STRIPE_PRICE_ID_SMS_500" },
  {
    id: "sms-2000",
    units: 2000,
    label: "2 000 SMS",
    env: "STRIPE_PRICE_ID_SMS_2000",
  },
];

export function getSmsPackPriceId(packId: string): string | undefined {
  const pack = SMS_CREDIT_PACK_ENV.find((candidate) => candidate.id === packId);
  return pack ? optionalEnv(pack.env) : undefined;
}

/** Les packs réellement achetables : ceux dont le prix Stripe est configuré. */
export function listSmsCreditPacks(): SmsCreditPack[] {
  return SMS_CREDIT_PACK_ENV.filter((pack) => optionalEnv(pack.env)).map(
    ({ id, units, label }) => ({ id, units, label }),
  );
}

/**
 * Choisit le pack à facturer. Un identifiant inconnu ou non configuré est
 * REFUSÉ — jamais replié sur un pack voisin, qui facturerait autre chose que
 * ce que le commerçant a cliqué.
 */
export function resolveSmsPackCheckout(
  packId: string | null,
):
  | { ok: true; pack: SmsCreditPack; priceId: string }
  | { ok: false; error: string } {
  const pack = SMS_CREDIT_PACK_ENV.find((candidate) => candidate.id === packId);
  if (!pack) return { ok: false, error: "Pack de crédits inconnu." };
  const priceId = optionalEnv(pack.env);
  if (!priceId) {
    return {
      ok: false,
      error: `La vente du pack ${pack.label} n'est pas encore configurée.`,
    };
  }
  return { ok: true, pack: { id: pack.id, units: pack.units, label: pack.label }, priceId };
}

/**
 * Ce qu'une session de paiement terminée dit d'un achat de crédits SMS.
 *
 * Quatre issues distinctes plutôt qu'un booléen, parce qu'elles n'appellent
 * pas la même conduite côté webhook : `none` s'acquitte en silence (toutes les
 * autres sessions de checkout passent par là), `unpaid` s'acquitte AUSSI (il
 * n'y a rien à retenter — Stripe enverra un autre événement si le paiement
 * aboutit), `invalid` doit être remonté (c'est un défaut de notre propre
 * metadata, pas une panne), `credit` est le seul qui écrit.
 */
export type SmsCreditPurchase =
  | { kind: "none" }
  | { kind: "unpaid" }
  | { kind: "invalid"; reason: string }
  | { kind: "credit"; organizationId: string; units: number; packId: string | null };

export function readSmsCreditPurchase(session: {
  client_reference_id?: string | null;
  payment_status?: string | null;
  metadata?: Record<string, string> | null;
}): SmsCreditPurchase {
  const metadata = session.metadata ?? {};
  if (metadata.purchase !== SMS_CREDIT_PURCHASE) return { kind: "none" };

  // LA GARDE QUI COÛTE DE L'ARGENT SI ELLE MANQUE. `checkout.session.completed`
  // est émis dès que le client termine le tunnel, y compris pour un moyen de
  // paiement asynchrone (virement, prélèvement) dont l'encaissement peut
  // échouer des jours plus tard. Créditer sur autre chose que `paid`, c'est
  // livrer des SMS jamais payés — et le grand livre étant append-only, rien ne
  // les reprend.
  if (session.payment_status !== "paid") return { kind: "unpaid" };

  const organizationId = (session.client_reference_id ?? "").trim();
  if (!organizationId) {
    return { kind: "invalid", reason: "organisation absente de la session" };
  }

  const units = Number(metadata.sms_units);
  // Borne haute : le plafond du geste manuel s'applique aussi ici. La valeur
  // n'est pas manipulable par un tiers (signature vérifiée, metadata écrite
  // par nous), mais un zéro de trop dans une configuration de pack produirait
  // un crédit irrécupérable — `credit_sms_balance` n'a pas d'inverse.
  if (!Number.isSafeInteger(units) || units <= 0 || units > SMS_CREDIT_MAX_UNITS) {
    return { kind: "invalid", reason: `nombre d'unités invalide : ${metadata.sms_units}` };
  }

  return {
    kind: "credit",
    organizationId,
    units,
    packId: metadata.sms_pack ?? null,
  };
}

/**
 * Statut Stripe → statut interne de l'organisation.
 *
 * REPLI À SENS UNIQUE, et c'est voulu. Le statut interne ne connaît que cinq
 * valeurs (`organizations_subscription_status_check`, 00001, rejouée par
 * `apply_stripe_subscription_event_v2`) : il répond à « cette organisation
 * a-t-elle accès ? », pas à « à quoi ressemble l'objet abonnement ? ».
 * `unpaid` et `incomplete_expired` y tombent tous deux sur `canceled` parce
 * qu'ils coupent l'accès de la même façon.
 *
 * Ce qui se perd au passage : `unpaid` laisse un abonnement VIVANT chez
 * Stripe, `incomplete_expired` non. Aucun code ne doit donc déduire du statut
 * interne l'existence ou l'absence d'un objet abonnement — pour ça, et pour
 * ça seulement, `hasLiveStripeSubscription` interroge Stripe.
 */
export function mapStripeStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled";
    case "incomplete":
    case "paused":
    default:
      return "inactive";
  }
}
