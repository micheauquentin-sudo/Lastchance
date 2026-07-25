import "server-only";

import Stripe from "stripe";
import { optionalEnv, requiredEnv } from "@/lib/env";
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

/** Offres organisées par objectif. Les tarifs non validés restent à null. */
export const PLANS = [
  {
    id: "core",
    legacyIds: ["starter"],
    name: "Core",
    priceMonthly: 29,
    trialDays: 7,
    entitlements: ["core"] satisfies Entitlement[],
    getPriceId: () =>
      optionalEnv("STRIPE_PRICE_ID_CORE")
      ?? optionalEnv("STRIPE_PRICE_ID_STARTER"),
  },
  {
    id: "engagement",
    legacyIds: [],
    name: "Engagement",
    priceMonthly: null,
    trialDays: 7,
    entitlements: [
      "core",
      "loyalty",
      "calendar",
      "referral",
      "hunts",
      "quiz",
    ] satisfies Entitlement[],
    getPriceId: () => optionalEnv("STRIPE_PRICE_ID_ENGAGEMENT"),
  },
  {
    id: "live",
    legacyIds: [],
    name: "Live & Events",
    priceMonthly: null,
    trialDays: 7,
    entitlements: [
      "core",
      "events",
      "pronostics",
      "jackpot",
      "quiz",
    ] satisfies Entitlement[],
    getPriceId: () => optionalEnv("STRIPE_PRICE_ID_LIVE"),
  },
  {
    id: "full",
    legacyIds: [],
    name: "Full Platform",
    priceMonthly: null,
    trialDays: 7,
    entitlements: [
      "core",
      "pronostics",
      "hunts",
      "loyalty",
      "jackpot",
      "events",
      "calendar",
      "quiz",
      "referral",
    ] satisfies Entitlement[],
    getPriceId: () => optionalEnv("STRIPE_PRICE_ID_FULL"),
  },
] as const;

export type PlanId = (typeof PLANS)[number]["id"];

export function getPlan(planId: string) {
  return (
    PLANS.find(
      (plan) =>
        plan.id === planId
        || (plan.legacyIds as readonly string[]).includes(planId),
    ) ?? PLANS[0]
  );
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
