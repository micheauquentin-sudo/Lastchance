import "server-only";

import Stripe from "stripe";
import { optionalEnv, requiredEnv } from "@/lib/env";
import type { SubscriptionStatus } from "@/types/database";

export function getStripe(): Stripe {
  return new Stripe(requiredEnv("STRIPE_SECRET_KEY"));
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
