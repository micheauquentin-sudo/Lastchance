"use server";

import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlan, getStripe } from "@/lib/stripe";
import { trialDaysLeft } from "@/lib/subscription";
import { APP_URL } from "@/lib/env";
import type { ActionResult } from "@/lib/action-result";

/** Crée (au besoin) le client Stripe de l'org et retourne son id. */
async function ensureStripeCustomer(
  orgId: string,
  orgName: string,
  existingCustomerId: string | null,
  email: string,
): Promise<string> {
  if (existingCustomerId) return existingCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    name: orgName,
    metadata: { organization_id: orgId },
  });

  // Service role : seul le serveur associe un customer Stripe à une org.
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ stripe_customer_id: customer.id })
    .eq("id", orgId);
  if (error) {
    console.error("[billing] save customer:", error.message);
    throw new Error("Impossible d'associer le client Stripe");
  }

  return customer.id;
}

/** Démarre un abonnement via Stripe Checkout. */
export async function createCheckoutSession(): Promise<ActionResult> {
  const { user, organization } = await requireOrg();

  const plan = getPlan(organization.plan);
  const priceId = plan.getPriceId();
  if (!priceId) {
    return {
      ok: false,
      error: "La facturation n'est pas encore configurée (STRIPE_PRICE_ID_STARTER).",
    };
  }

  let url: string | null = null;
  try {
    const customerId = await ensureStripeCustomer(
      organization.id,
      organization.name,
      organization.stripe_customer_id,
      user.email ?? "",
    );

    // L'essai Stripe reprend les jours restants de l'essai applicatif :
    // un essai expiré ne se réarme pas en entrant une carte.
    const remainingTrialDays = Math.min(
      plan.trialDays,
      trialDaysLeft(organization),
    );

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        ...(remainingTrialDays >= 1
          ? { trial_period_days: remainingTrialDays }
          : {}),
        metadata: { organization_id: organization.id },
      },
      success_url: `${APP_URL}/dashboard/settings?checkout=success`,
      cancel_url: `${APP_URL}/dashboard/settings?checkout=cancel`,
    });
    url = session.url;
  } catch (err) {
    console.error("[billing] checkout:", err);
    return { ok: false, error: "Impossible de démarrer le paiement" };
  }

  if (!url) return { ok: false, error: "Impossible de démarrer le paiement" };
  redirect(url);
}

/** Ouvre le portail client Stripe (moyens de paiement, annulation…). */
export async function createPortalSession(): Promise<ActionResult> {
  const { organization } = await requireOrg();

  if (!organization.stripe_customer_id) {
    return { ok: false, error: "Aucun abonnement à gérer pour le moment." };
  }

  let url: string;
  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: organization.stripe_customer_id,
      return_url: `${APP_URL}/dashboard/settings`,
    });
    url = session.url;
  } catch (err) {
    console.error("[billing] portal:", err);
    return { ok: false, error: "Impossible d'ouvrir le portail de facturation" };
  }

  redirect(url);
}
