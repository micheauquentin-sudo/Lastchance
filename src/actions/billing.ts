"use server";

import { redirect } from "next/navigation";
import { requireOrganizationOwner } from "@/lib/authorization";
import { reportError } from "@/lib/monitoring";
import {
  ensureStripeCustomer,
  getStripe,
  hasLiveStripeSubscription,
  resolveCheckoutPlan,
  resolveSmsPackCheckout,
  SMS_CREDIT_PURCHASE,
} from "@/lib/stripe";
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

    // GARDE ANTI-DOUBLE ABONNEMENT — c'est ici, et pas dans `billingActions`,
    // que la promesse « on ne facture pas deux fois » est tenue.
    //
    // Le bouton se cache sur `subscription_status`, où `mapStripeStatus` a
    // replié `unpaid` (abonnement ENCORE VIVANT chez Stripe, réactivable au
    // portail) sur le même `canceled` qu'un `incomplete_expired` mort. Un
    // commerçant en impayé se voit donc offrir les deux boutons, et le
    // checkout lui souscrirait un SECOND abonnement, facturé en parallèle du
    // premier. L'information manquante n'existe nulle part en base : elle se
    // demande à Stripe.
    //
    // La garde couvre du même geste tout ce qui contourne l'affichage — page
    // laissée ouverte pendant que le webhook change le statut, POST rejoué,
    // retour arrière après un paiement réussi.
    //
    // Une panne Stripe fait échouer l'appel, donc refuser le checkout (le
    // `catch` ci-dessous) : fermé par défaut, et sans coût réel puisqu'un
    // Stripe injoignable ne créerait de toute façon aucune session.
    if (await hasLiveStripeSubscription(stripe, customerId)) {
      return {
        ok: false,
        error:
          "Un abonnement est déjà ouvert pour ce compte. Passez par "
          + "« Gérer mon abonnement » pour le reprendre ou mettre à jour "
          + "votre moyen de paiement.",
      };
    }

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

/**
 * Achète un pack de crédits SMS via Stripe Checkout.
 *
 * ── MODE `payment`, PAS `subscription` ──────────────────────
 *
 * Voir le bloc « PACKS DE CRÉDIT SMS » de `@/lib/stripe` : un pack acheté en
 * mode abonnement produirait des `customer.subscription.*` qui réécriraient
 * `subscription_status`, `plan` et les droits de l'organisation. Acheter des
 * SMS couperait l'accès aux modules payés.
 *
 * ── AUCUNE GARDE « ABONNEMENT DÉJÀ OUVERT » ─────────────────
 *
 * `createCheckoutSession` refuse un second checkout parce qu'un second
 * abonnement facturerait en parallèle du premier. Ici, l'inverse est vrai :
 * racheter des crédits est le geste normal et répétable. La seule chose à
 * garantir est qu'un paiement ne soit crédité qu'une fois, et cela se joue
 * dans le webhook, pas ici.
 *
 * ── CE QUE LE FORMULAIRE PEUT ET NE PEUT PAS DIRE ───────────
 *
 * Il désigne un pack par son identifiant, rien de plus. Ni le nombre d'unités
 * ni le montant ne transitent par le navigateur : les deux sont relus du
 * catalogue serveur, et c'est le catalogue qui remplit la metadata sur
 * laquelle le webhook créditera.
 */
export async function createSmsCreditCheckoutSession(
  _prevState?: unknown,
  formData?: FormData,
): Promise<ActionResult> {
  const { user, organization } = await requireOrganizationOwner();

  const requested = formData?.get("pack");
  const selection = resolveSmsPackCheckout(
    typeof requested === "string" && requested ? requested : null,
  );
  if (!selection.ok) return { ok: false, error: selection.error };
  const { pack, priceId } = selection;

  let url: string | null = null;
  try {
    const stripe = getStripe();
    const customerId = await ensureStripeCustomer(stripe, {
      organizationId: organization.id,
      organizationName: organization.name,
      existingCustomerId: organization.stripe_customer_id,
      email: user.email ?? "",
    });

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      // `client_reference_id` porte l'organisation, la metadata porte la
      // nature de l'achat et le nombre d'unités. Les deux voyagent avec la
      // session : le webhook n'a rien à déduire ni à retrouver, ce qui lui
      // permet de créditer même si l'organisation a changé de client Stripe
      // entre-temps.
      client_reference_id: organization.id,
      metadata: {
        purchase: SMS_CREDIT_PURCHASE,
        organization_id: organization.id,
        sms_units: String(pack.units),
        sms_pack: pack.id,
      },
      success_url: `${APP_URL}/dashboard/settings?sms_credits=success`,
      cancel_url: `${APP_URL}/dashboard/settings?sms_credits=cancel`,
    });
    url = session.url;
  } catch (err) {
    reportError("billing.sms-credits", err);
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
