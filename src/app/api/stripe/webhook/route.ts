import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, mapStripeStatus } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { monitored, reportError, reportSecurityEvent } from "@/lib/monitoring";
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
  // Opération critique : durée mesurée, lenteurs et erreurs remontées.
  return monitored("stripe.webhook", () => handleWebhook(request));
}

async function handleWebhook(request: Request) {
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
  } catch {
    reportSecurityEvent("stripe_invalid_signature");
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
    reportError("stripe.events-insert", dupError.message);
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

        // Délai de grâce des impayés : on date l'ENTRÉE en past_due (sans
        // réarmer la grâce à chaque relance Stripe), et on efface la date
        // dès que le statut change (paiement régularisé ou résiliation).
        let pastDueSince: string | null = null;
        if (status === "past_due") {
          const { data: current } = await admin
            .from("organizations")
            .select("past_due_since")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();
          pastDueSince = current?.past_due_since ?? new Date().toISOString();
        }

        const { data: updatedOrgs, error } = await admin
          .from("organizations")
          .update({
            subscription_status: status,
            past_due_since: pastDueSince,
            ...trialSync,
          })
          .eq("stripe_customer_id", customerId)
          .select("id");

        if (error) {
          reportError("stripe.sync-status", error.message);
          return NextResponse.json({ error: "Sync échouée" }, { status: 500 });
        }
        console.log(
          `[stripe] ${event.type} → ${customerId} = ${status}`,
        );

        await writeAuditLog({
          organizationId: updatedOrgs?.[0]?.id ?? null,
          actor: "stripe",
          action: "subscription.sync",
          metadata: { event: event.type, status, customer_id: customerId },
        });
        if (status === "past_due" || status === "canceled" || status === "inactive") {
          reportSecurityEvent("subscription_access_degraded", {
            organization_id: updatedOrgs?.[0]?.id ?? null,
            status,
          });
        }
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
    reportError("stripe.webhook", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
