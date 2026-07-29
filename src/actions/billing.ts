"use server";

import { redirect } from "next/navigation";
import { requireOrganizationOwner } from "@/lib/authorization";
import { reportError } from "@/lib/monitoring";
import { ensureStripeCustomer, getStripe, resolveCheckoutPlan } from "@/lib/stripe";
import { trialDaysLeft } from "@/lib/subscription";
import { APP_URL } from "@/lib/env";
import type { ActionResult } from "@/lib/utils";

/**
 * Démarre un abonnement via Stripe Checkout.
 *
 * Le champ `plan` du formulaire permet aux CTA d'upgrade de désigner une
 * autre offre que celle en cours ; absent, l'offre de l'organisation fait
 * foi. Le montant facturé reste celui du `price` Stripe : rien de ce que le
 * client envoie n'influence le prix, seulement le choix d'un price connu du
 * catalogue.
 */
export async function createCheckoutSession(
  _prevState?: unknown,
  formData?: FormData,
): Promise<ActionResult> {
  const { user, organization } = await requireOrganizationOwner();

  const requested = formData?.get("plan");
  const selection = resolveCheckoutPlan({
    requestedPlanId: typeof requested === "string" && requested ? requested : null,
    organizationPlanId: organization.plan,
  });
  if (!selection.ok) return { ok: false, error: selection.error };
  const { plan, priceId } = selection;

  let url: string | null = null;
  try {
    const stripe = getStripe();
    const customerId = await ensureStripeCustomer(stripe, {
      organizationId: organization.id,
      organizationName: organization.name,
      existingCustomerId: organization.stripe_customer_id,
      email: user.email ?? "",
    });

    // L'essai Stripe reprend les jours restants de l'essai applicatif :
    // un essai expiré ne se réarme pas en entrant une carte.
    const remainingTrialDays = Math.min(
      plan.trialDays,
      trialDaysLeft(organization),
    );

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
    reportError("billing.checkout", err);
    return { ok: false, error: "Impossible de démarrer le paiement" };
  }

  if (!url) return { ok: false, error: "Impossible de démarrer le paiement" };
  redirect(url);
}

/** Ouvre le portail client Stripe (moyens de paiement, annulation…). */
export async function createPortalSession(): Promise<ActionResult> {
  const { organization } = await requireOrganizationOwner();

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
    reportError("billing.portal", err);
    return { ok: false, error: "Impossible d'ouvrir le portail de facturation" };
  }

  redirect(url);
}
