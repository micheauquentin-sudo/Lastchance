import "server-only";

import Stripe from "stripe";
import { optionalEnv, requiredEnv } from "@/lib/env";
import type { SubscriptionStatus } from "@/types/database";

export function getStripe(): Stripe {
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

/**
 * Offres SaaS. Une seule en V1 — en ajouter une = ajouter une entrée
 * ici + un price dans Stripe, rien d'autre à changer.
 */
export const PLANS = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 29,
    trialDays: 7,
    getPriceId: () => optionalEnv("STRIPE_PRICE_ID_STARTER"),
  },
] as const;

export type PlanId = (typeof PLANS)[number]["id"];

export function getPlan(planId: string) {
  return PLANS.find((p) => p.id === planId) ?? PLANS[0];
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
