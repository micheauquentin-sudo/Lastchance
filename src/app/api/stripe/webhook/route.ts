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

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        // Stripe ne garantit pas l'ordre de livraison. Relire l'objet courant
        // rend aussi un ancien événement conforme à l'état faisant foi.
        const current = await stripe.subscriptions.retrieve(subscription.id);
        const status =
          current.status === "canceled" || event.type === "customer.subscription.deleted"
            ? "canceled"
            : mapStripeStatus(current.status);

        const customerId =
          typeof current.customer === "string"
            ? current.customer
            : current.customer.id;

        // Déduplication, contrôle d'ordre et mise à jour sont réalisés dans
        // une seule transaction SQL. Un échec annule aussi la prise en charge
        // de l'événement, afin qu'une relance Stripe puisse réellement agir.
        const { data: rows, error } = await admin.rpc(
          "apply_stripe_subscription_event",
          {
            p_event_id: event.id,
            p_event_created_at: new Date(event.created * 1000).toISOString(),
            p_customer_id: customerId,
            p_status: status,
            p_trial_ends_at:
              status === "trialing" && current.trial_end
                ? new Date(current.trial_end * 1000).toISOString()
                : null,
          },
        );
        if (error) {
          reportError("stripe.atomic-sync", error.message);
          return NextResponse.json({ error: "Sync échouée" }, { status: 500 });
        }
        const result = (rows as Array<{
          organization_id: string | null;
          applied: boolean;
          duplicate: boolean;
        }> | null)?.[0];
        if (result?.duplicate) {
          return NextResponse.json({ received: true, duplicate: true });
        }
        console.log(
          `[stripe] ${event.type} → ${customerId} = ${status} (${result?.applied ? "appliqué" : "ancien ignoré"})`,
        );

        await writeAuditLog({
          organizationId: result?.organization_id ?? null,
          actor: "stripe",
          action: "subscription.sync",
          metadata: {
            event: event.type,
            status,
            customer_id: customerId,
            applied: result?.applied ?? false,
          },
        });
        if (
          result?.applied &&
          (status === "past_due" || status === "canceled" || status === "inactive")
        ) {
          reportSecurityEvent("subscription_access_degraded", {
            organization_id: result.organization_id,
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
