import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, mapStripeStatus } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { requiredEnv } from "@/lib/env";

/**
 * Webhook Stripe : source de vérité du statut d'abonnement.
 * - signature vérifiée (STRIPE_WEBHOOK_SECRET)
 * - idempotence via la table stripe_events
 * - synchronise organizations.subscription_status
 *
 * Événements à activer dans le dashboard Stripe :
 *   checkout.session.completed,
 *   customer.subscription.created / updated / deleted
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Signature absente" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      requiredEnv("STRIPE_WEBHOOK_SECRET"),
    );
  } catch (err) {
    console.error("[stripe] signature invalide:", err);
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Idempotence : un event déjà traité est acquitté sans effet.
  const { error: dupError } = await admin
    .from("stripe_events")
    .insert({ id: event.id });
  if (dupError) {
    if (dupError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[stripe] stripe_events:", dupError.message);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const status =
          event.type === "customer.subscription.deleted"
            ? "canceled"
            : mapStripeStatus(subscription.status);

        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;

        // Si Stripe gère un essai, il devient la référence de fin d'essai
        // applicative (hasActiveAccess vérifie trial_ends_at).
        const trialSync =
          status === "trialing" && subscription.trial_end
            ? {
                trial_ends_at: new Date(
                  subscription.trial_end * 1000,
                ).toISOString(),
              }
            : {};

        const { error } = await admin
          .from("organizations")
          .update({ subscription_status: status, ...trialSync })
          .eq("stripe_customer_id", customerId);

        if (error) {
          console.error("[stripe] sync status:", error.message);
          return NextResponse.json({ error: "Sync échouée" }, { status: 500 });
        }
        console.log(
          `[stripe] ${event.type} → ${customerId} = ${status}`,
        );
        break;
      }

      case "checkout.session.completed": {
        // Le statut réel arrive via customer.subscription.* ;
        // on loggue pour la traçabilité.
        const session = event.data.object;
        console.log(
          `[stripe] checkout complété pour customer ${session.customer}`,
        );
        break;
      }

      default:
        // Événement non géré : acquitter sans erreur.
        break;
    }
  } catch (err) {
    console.error("[stripe] traitement:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
