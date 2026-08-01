import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  getStripe,
  mapStripeStatus,
  readSmsCreditPurchase,
  resolveStripeEntitlements,
} from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { monitored, reportError, reportSecurityEvent } from "@/lib/monitoring";
import { requiredEnv } from "@/lib/env";

/**
 * Webhook Stripe : source de vérité du statut d'abonnement.
 * - signature vérifiée (STRIPE_WEBHOOK_SECRET)
 * - idempotence via la table stripe_events, POUR LES DEUX CHEMINS : le statut
 *   d'abonnement (dans la RPC) et le crédit SMS acheté (ici) s'y dédupliquent
 *   sur le même identifiant d'événement — un seul registre de rejeu
 * - synchronise organizations.subscription_status
 * - crédite les packs de SMS payés (checkout.session.completed, mode payment)
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
        // `items` est une liste paginée (10 par défaut). Au-delà, la
        // photographie serait tronquée et couperait silencieusement des
        // modules payés : on échoue pour que Stripe retente, comme pour un
        // prix inconnu.
        if (current.items.has_more) {
          reportError(
            "stripe.items-truncated",
            `Items paginés pour l'abonnement ${current.id}`,
          );
          return NextResponse.json(
            { error: "Abonnement non lisible en entier" },
            { status: 500 },
          );
        }
        const priceIds = current.items.data.map((item) => item.price.id);
        const resolved = resolveStripeEntitlements(priceIds);
        if (resolved.unknownPriceIds.length > 0) {
          reportError(
            "stripe.unknown-price",
            `Configuration absente pour ${resolved.unknownPriceIds.length} prix Stripe`,
          );
          return NextResponse.json(
            { error: "Prix Stripe non configuré" },
            { status: 500 },
          );
        }

        // Déduplication, contrôle d'ordre et mise à jour sont réalisés dans
        // une seule transaction SQL. Un échec annule aussi la prise en charge
        // de l'événement, afin qu'une relance Stripe puisse réellement agir.
        const { data: rows, error } = await admin.rpc(
          "apply_stripe_subscription_event_v2",
          {
            p_event_id: event.id,
            p_event_created_at: new Date(event.created * 1000).toISOString(),
            p_customer_id: customerId,
            p_status: status,
            p_trial_ends_at:
              status === "trialing" && current.trial_end
                ? new Date(current.trial_end * 1000).toISOString()
                : null,
            p_subscription_id: current.id,
            p_plan_id: resolved.planId,
            p_entitlements: resolved.entitlements,
            p_price_ids: priceIds,
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
        const session = event.data.object;
        const purchase = readSmsCreditPurchase(session);

        if (purchase.kind === "invalid") {
          // ACQUITTÉ MALGRÉ LE DÉFAUT, et c'est un choix. La metadata est
          // gelée sur la session : aucun rejeu ne la réparera. Répondre 500
          // ferait retenter Stripe pendant trois jours, puis DÉSACTIVER le
          // point d'entrée après échecs soutenus — ce qui couperait aussi la
          // synchronisation des abonnements. On alerte et on acquitte.
          reportError("stripe.sms-credits-metadata", purchase.reason);
          break;
        }
        if (purchase.kind === "credit") {
          return await creditSmsPack(admin, event, session.id, purchase);
        }
        // `unpaid` s'acquitte aussi : rien à retenter ici, Stripe émettra
        // `checkout.session.async_payment_succeeded` si l'encaissement aboutit.
        if (purchase.kind === "unpaid") {
          console.log(
            `[stripe] achat de crédits SMS non payé (${session.payment_status}), aucun crédit`,
          );
          break;
        }

        // Le statut d'abonnement réel arrive via customer.subscription.* ;
        // on loggue pour la traçabilité.
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

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * PREND l'événement, ou dit qu'il était déjà pris.
 *
 * ── LE MÉCANISME N'EST PAS NEUF, ET C'EST EXPRÈS ────────────
 *
 * `stripe_events` est la table de déduplication que le chemin abonnement
 * utilise depuis 00019 : `apply_stripe_subscription_event_v2` y fait le même
 * `insert … on conflict (id) do nothing` et lit `found` pour trancher. Le
 * crédit SMS ne peut pas passer par cette RPC (elle écrit un statut
 * d'abonnement), mais il n'avait aucune raison d'inventer un second registre
 * de rejeu : deux mécanismes concurrents, c'est deux vérités sur « cet
 * événement a-t-il déjà été traité ? ».
 *
 * `ignoreDuplicates` émet exactement ce `on conflict do nothing`. La ligne
 * rendue est donc vide quand un autre appel — ou le même, rejoué — a déjà
 * pris l'événement. La primary key fait l'arbitrage : deux livraisons
 * simultanées du même événement ne peuvent pas gagner toutes les deux.
 */
async function claimStripeEvent(
  admin: AdminClient,
  event: Stripe.Event,
): Promise<{ ok: true; duplicate: boolean } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("stripe_events")
    .upsert(
      {
        id: event.id,
        event_created_at: new Date(event.created * 1000).toISOString(),
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, duplicate: (data ?? []).length === 0 };
}

/**
 * Crédite un pack de SMS payé.
 *
 * ── POURQUOI L'IDEMPOTENCE EST LE POINT DUR ─────────────────
 *
 * Un webhook Stripe est rejouable PAR CONCEPTION : réessai après un 500, après
 * un délai de réponse, ou rejeu manuel depuis le tableau de bord.
 * `sms_credit_entries` est append-only et `credit_sms_balance` n'a aucun
 * inverse — il n'existe aucun débit administratif. Un double crédit ne se
 * rattrape donc PAS : il faut qu'il ne se produise pas.
 *
 * ── L'ORDRE DES TROIS GESTES EST LA PROPRIÉTÉ ───────────────
 *
 * Prendre l'événement AVANT de créditer, et non l'inscrire après. Créditer
 * puis inscrire laisserait la fenêtre exacte où un rejeu arrive entre les
 * deux et crédite une seconde fois.
 *
 * ── CE QUI RESTE OUVERT, ET DANS QUEL SENS ÇA PENCHE ────────
 *
 * Prise et crédit ne sont pas dans la même transaction (le chemin abonnement,
 * lui, les a : tout se joue dans une seule RPC). Une panne du processus entre
 * les deux laisse un événement pris sans crédit, et le rejeu sera avalé comme
 * un doublon. La conséquence est un commerçant NON crédité — réparable au
 * back-office plateforme, qui garde son geste de rattrapage — là où l'erreur
 * symétrique serait un crédit en double, irréparable. Un échec explicite de la
 * RPC, lui, relâche la prise pour que le rejeu agisse réellement.
 */
async function creditSmsPack(
  admin: AdminClient,
  event: Stripe.Event,
  sessionId: string,
  purchase: { organizationId: string; units: number; packId: string | null },
): Promise<NextResponse> {
  const claim = await claimStripeEvent(admin, event);
  if (!claim.ok) {
    // Impossible de savoir si l'événement a déjà été traité : ne rien créditer
    // et laisser Stripe retenter est le seul choix sûr.
    reportError("stripe.sms-credits-claim", claim.error);
    return NextResponse.json({ error: "Crédit SMS échoué" }, { status: 500 });
  }
  if (claim.duplicate) {
    console.log("[stripe] crédit SMS déjà appliqué, rejeu sans effet");
    return NextResponse.json({ received: true, duplicate: true });
  }

  // `p_unit_cost_micros` N'EST PAS PASSÉ, pour la même raison que dans le
  // geste d'administration : la ligne du grand livre est libellée dans la
  // devise de l'organisation (`sms_credits.currency`), pas dans celle de la
  // session Stripe. Y recopier un montant venu d'une session d'une autre
  // devise écrirait une preuve de facturation fausse. Le montant réellement
  // encaissé reste chez Stripe, et `reference` y renvoie.
  const { error } = await admin.rpc("credit_sms_balance", {
    p_organization_id: purchase.organizationId,
    p_units: purchase.units,
    p_reason: "purchase",
    p_reference: `stripe:${sessionId}`,
  });

  if (error) {
    // RELÂCHER LA PRISE. Sans ce geste, le rejeu que le 500 provoque serait
    // lu comme un doublon et le paiement resterait sans contrepartie.
    const { error: releaseError } = await admin
      .from("stripe_events")
      .delete()
      .eq("id", event.id);
    if (releaseError) {
      reportError("stripe.sms-credits-release", releaseError.message);
    }
    reportError("stripe.sms-credits", error.message);
    return NextResponse.json({ error: "Crédit SMS échoué" }, { status: 500 });
  }

  await admin
    .from("stripe_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", event.id);

  await writeAuditLog({
    organizationId: purchase.organizationId,
    actor: "stripe",
    action: "sms_credit.purchase",
    metadata: {
      units: purchase.units,
      pack: purchase.packId,
      session_id: sessionId,
      event: event.id,
    },
  });

  return NextResponse.json({ received: true });
}
