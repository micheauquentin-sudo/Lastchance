import "server-only";

import Stripe from "stripe";
import { optionalEnv, requiredEnv } from "@/lib/env";
import { PLAN_TIERS, type PlanTier, type PlanTierId } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
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
    // Ces deux statuts sont déjà terminaux et Stripe refuse de les annuler.
    if (
      subscription.status !== "canceled" &&
      subscription.status !== "incomplete_expired"
    ) {
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

  return {
    planId: selectedPlan.id,
    entitlements: [...entitlements],
    unknownPriceIds,
  };
}

/** Statut Stripe → statut interne de l'organisation. */
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
