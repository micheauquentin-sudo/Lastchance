import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  readModuleGrantPurchase,
  type ModuleGrantPurchase,
} from "@/lib/octroi-achat";
import {
  moduleDepuisEntitlement,
  termesDepuisCatalogue,
} from "@/lib/octroi-termes";
import { partitionnerPrix, type PrixDePass } from "@/lib/octroi-checkout";
import { GRANTABLE_MODULES } from "@/lib/subscription";
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
 * - idempotence à DEUX ÉTAGES, et les deux clés diffèrent expressément :
 *   `stripe_events` déduplique L'ÉVÉNEMENT (les deux chemins y passent), et
 *   pour le crédit SMS l'index `sms_credit_entries_one_purchase_per_reference`
 *   déduplique LE PAIEMENT. Le second est celui qui compte : l'identifiant
 *   d'événement change au rejeu, celui de la session non.
 * - synchronise organizations.subscription_status
 * - crédite les packs de SMS payés (mode payment)
 *
 * Événements à activer dans le dashboard Stripe :
 *   checkout.session.completed,
 *   checkout.session.async_payment_succeeded,
 *   checkout.session.async_payment_failed,
 *   customer.subscription.created / updated / deleted
 *
 * ⚠️ LES DEUX `async_payment_*` NE SONT PAS FACULTATIFS. `createSmsCredit
 * CheckoutSession` ne fixe aucun `payment_method_types` : les moyens de
 * paiement viennent du tableau de bord Stripe. Dès qu'un moyen différé y est
 * actif — SEPA ou virement, l'ordinaire d'un compte français — un achat
 * produit `checkout.session.completed` en `payment_status: unpaid`, puis
 * l'encaissement se tranche DEUX À CINQ JOURS plus tard par un
 * `async_payment_succeeded` ou `async_payment_failed`. Ne pas les activer,
 * c'est un commerçant débité qui n'a jamais un seul crédit.
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

        // ── LE TRI QUI PROTÈGE LE PLAN PAYÉ (P0.5) ─────────────
        //
        // Un add-on mensuel acheté seul crée chez Stripe un abonnement SÉPARÉ
        // de l'abonnement d'offre. Le faire passer par la synchronisation
        // ci-dessous ferait l'un des deux dégâts d'ADR-079 : soit son prix sort
        // « inconnu » et la route répond 500 en boucle — ce qui coupe aussi la
        // synchro des abonnements principaux —, soit on l'ignore et
        // `resolveStripeEntitlements` retombe sur `PLANS[0]`, déclassant un
        // client à jour de ses paiements.
        //
        // La partition sépare les deux moitiés AVANT toute résolution. Le cas
        // MIXTE (un abonnement portant les deux familles, inatteignable depuis
        // l'application) n'est ni refusé ni deviné : chaque moitié suit son
        // chemin, et l'anomalie est signalée. Voir `partitionnerPrix`.
        const { passes, autres } = partitionnerPrix(priceIds);

        if (passes.length > 0) {
          const echec = await traiterAbonnementDePass(admin, event, {
            subscriptionId: current.id,
            customerId,
            status,
            metadata: current.metadata ?? null,
            passes,
            mixte: autres.length > 0,
          });
          if (echec) return echec;
        }

        // Aucun pass reconnu : `autres` vaut exactement `priceIds` et ce qui
        // suit est le chemin historique, inchangé. Un abonnement de pass PUR
        // (`autres` vide) ne le traverse jamais — c'est là toute l'isolation.
        if (passes.length > 0 && autres.length === 0) break;

        const resolved = resolveStripeEntitlements(autres);
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
            // `autres` et non `priceIds` : dans le cas mixte, écrire ici le
            // prix de pass ferait porter à l'abonnement d'OFFRE la trace d'un
            // produit qu'il ne vend pas, et le prochain lecteur en déduirait
            // un droit d'abonnement là où il y a un octroi daté.
            p_price_ids: autres,
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

      // LES TROIS ÉVÉNEMENTS DE CHECKOUT PARTAGENT UN SEUL CHEMIN, et c'est la
      // condition pour que le différé fonctionne : un paiement SEPA passe par
      // `completed` (non payé) puis `async_payment_succeeded` (payé), et c'est
      // le second qui doit créditer. Router le second ailleurs, ou l'oublier,
      // c'est encaisser sans jamais créditer.
      //
      // Qu'une même session traverse ce chemin deux fois n'est PAS un risque de
      // double crédit : la référence écrite au grand livre est la session, et
      // l'index partiel `sms_credit_entries_one_purchase_per_reference` n'en
      // laisse passer qu'un mouvement.
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object;

        // ACHAT D'ADD-ON AUTONOME (P0.4). Traité avant les crédits SMS, mais
        // l'ordre est indifférent : les deux marqueurs de metadata sont
        // disjoints, donc chaque lecteur rend `none` sur les sessions de
        // l'autre. Ce qui n'est pas indifférent, c'est que ce chemin ne passe
        // PAS par `claimStripeEvent` — voir `octroyerModule`.
        const octroi = readModuleGrantPurchase(session);
        if (octroi.kind !== "none") {
          return await octroyerModule(admin, event, session.id, octroi);
        }

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

        if (event.type === "checkout.session.async_payment_failed") {
          // NE PAS RESTER MUET SUR UN ENCAISSEMENT RATÉ. C'est le seul moment
          // où l'on apprend qu'un achat entamé il y a plusieurs jours n'aura
          // pas lieu ; le commerçant, lui, a vu son tunnel aboutir. Aucun
          // crédit à défaire (rien n'a été écrit) : ce qui manque est la
          // trace, pas un correctif.
          if (purchase.kind !== "none") {
            reportError(
              "stripe.sms-credits-async-failed",
              `encaissement différé échoué pour la session ${session.id}`,
            );
            await writeAuditLog({
              organizationId: purchase.organizationId,
              actor: "stripe",
              action: "sms_credit.purchase_failed",
              metadata: { session_id: session.id, event: event.id },
            });
          }
          break;
        }

        if (purchase.kind === "credit") {
          return await creditSmsPack(admin, event, session.id, purchase);
        }
        // `unpaid` s'acquitte : il n'y a rien à retenter ici. L'encaissement
        // différé se tranchera par `async_payment_succeeded` ou
        // `async_payment_failed`, tous deux traités ci-dessus.
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

/* ════════════════════════════════════════════════════════════
 * L'ABONNEMENT D'UN ADD-ON MENSUEL (P0.5)
 *
 * ── UN SEUL CRÉATEUR D'OCTROI, ET CE N'EST PAS CE CHEMIN ────
 *
 * Un add-on mensuel acheté seul produit DEUX familles d'événements : le
 * `checkout.session.completed` de sa session (metadata `module_grant`), et les
 * `customer.subscription.*` de l'abonnement que Stripe crée derrière. Les deux
 * décrivent le même achat.
 *
 * L'octroi est créé par le PREMIER, par `octroyerModule`, exactement comme les
 * six achats uniques : même lecteur de metadata, même relecture des termes au
 * catalogue, même référence de paiement, même index d'idempotence. Ce chemin-ci
 * n'en crée aucun. Les faire créer tous les deux poserait deux octrois pour un
 * seul paiement — l'un référencé par la session, l'autre par l'abonnement, donc
 * invisibles l'un à l'autre pour l'index du lot 4 — et ferait crier l'index du
 * lot 5 sur chaque vente normale.
 *
 * Ce chemin a donc UN seul travail que l'autre ne peut pas faire : REFERMER.
 * Les termes d'un mensuel posent délibérément `ends_at: null`
 * (`octroi-termes.ts` : une fin à trente jours couperait le module au premier
 * renouvellement), et la pause du lot 2 est dérivée d'une échéance. Sans
 * révocation, un add-on résilié resterait ouvert POUR TOUJOURS.
 *
 * ── CE QU'ON NE FAIT PAS SUR `updated`, ET CE QUE ÇA COÛTE ──
 *
 * Un impayé (`past_due`) ne referme rien ici. C'est le même traitement que
 * l'abonnement principal, qui accorde quatorze jours de grâce avant de couper,
 * et Stripe finit par annuler l'abonnement — ce qui nous ramène au cas
 * `canceled`. La contrepartie est écrite plutôt que découverte : un add-on
 * mensuel impayé reste ouvert jusqu'à l'annulation Stripe.
 *
 * ── LA RECONNAISSANCE PASSE PAR LE PRIX, PAS PAR LA METADATA ──
 *
 * `createAddonCheckoutSession` pose désormais `subscription_data.metadata`, et
 * l'organisation en est relue en premier. Mais c'est le PRIX qui décide du
 * ROUTAGE, et cette hiérarchie n'est pas un détail : un abonnement dont la
 * metadata manquerait — créé à la main dans le tableau de bord, ou avant ce lot
 * — doit quand même être détourné de `apply_stripe_subscription_event_v2`. Si
 * la metadata décidait, son absence rouvrirait précisément le déclassement
 * qu'ADR-079 refusait. La metadata aide à RÉSOUDRE, le prix décide d'AIGUILLER.
 * ════════════════════════════════════════════════════════════ */

interface ContexteAbonnementPass {
  subscriptionId: string;
  customerId: string;
  /** Statut déjà normalisé par l'appelant (`canceled` inclut `deleted`). */
  status: string;
  metadata: Record<string, string> | null;
  passes: PrixDePass[];
  mixte: boolean;
}

/**
 * Rend une réponse UNIQUEMENT quand il faut interrompre (500, pour rejeu).
 * `null` veut dire « traité, la suite peut continuer ».
 */
async function traiterAbonnementDePass(
  admin: AdminClient,
  event: Stripe.Event,
  ctx: ContexteAbonnementPass,
): Promise<NextResponse | null> {
  if (ctx.mixte) {
    // ANOMALIE SIGNALÉE, PAS REFUSÉE. Inatteignable depuis l'application (un
    // seul `line_items` par session, aucun `update` d'abonnement côté code) :
    // c'est donc un geste manuel dans le tableau de bord Stripe. Les deux
    // moitiés sont payées, on traite les deux — mais quelqu'un doit savoir.
    reportError(
      "stripe.abonnement-mixte",
      `L'abonnement ${ctx.subscriptionId} mêle prix d'offre et prix de pass`,
    );
  }

  // Rien à refermer tant que l'abonnement vit. L'octroi, lui, a été créé par
  // `checkout.session.completed` — voir l'en-tête de ce bloc.
  if (ctx.status !== "canceled") {
    console.log(
      `[stripe] abonnement d'add-on ${ctx.subscriptionId} = ${ctx.status}, aucun octroi à toucher`,
    );
    return null;
  }

  const organizationId = await resoudreOrganisation(admin, ctx);
  if (!organizationId) {
    // ACQUITTÉ, et c'est le choix le moins mauvais. Un client Stripe qui ne
    // correspond à aucune organisation ne se réparera pas au rejeu : ni la
    // metadata gelée sur l'abonnement, ni `organizations.stripe_customer_id`
    // ne changeront parce que Stripe insiste. Un 500 ferait retenter trois
    // jours puis désactiver le point d'entrée, ce qui couperait la synchro des
    // abonnements principaux — on remplacerait un droit resté ouvert par une
    // facturation entière hors service.
    //
    // Le signalement est double, parce que la conséquence l'est : c'est un
    // défaut de données ET un module payant qui reste ouvert sans contrepartie.
    reportError(
      "stripe.abonnement-pass-org",
      `Aucune organisation pour le client ${ctx.customerId} (abonnement ${ctx.subscriptionId})`,
    );
    reportSecurityEvent("module_grant_revocation_orpheline", {
      subscription_id: ctx.subscriptionId,
      customer_id: ctx.customerId,
    });
    return null;
  }

  for (const pass of ctx.passes) {
    // `moduleVise` et non `module` : ESLint interdit ce nom (Next.js le
    // réserve pour son runtime), et l'erreur ne se voit qu'au lint.
    const moduleVise = moduleDepuisEntitlement(pass.entitlement, GRANTABLE_MODULES);
    if (!moduleVise) {
      // Un prix de pass qui ne désigne aucun module octroyable est un défaut de
      // notre propre catalogue : signalé, jamais deviné.
      reportError(
        "stripe.abonnement-pass-module",
        `« ${pass.entitlement} » n'est pas un module octroyable`,
      );
      continue;
    }

    // RÉVOCATION PAR `update` DIRECT, comme le back-office (merchants/actions.ts),
    // et non par une RPC neuve : le trigger `freeze_module_grant_terms` ne
    // s'oppose qu'à `capacity` et `starts_at`, et `service_role` a les droits
    // d'écriture sur la table. Une RPC n'aurait rien ajouté qu'une signature de
    // plus à maintenir.
    //
    // LE FILTRE EST CELUI DE L'INDEX, PLUS `source`. Le prédicat
    // (`kind = recurring`, non révoqué, sans terme) désigne au plus une ligne —
    // c'est ce que l'index unique du lot 5 garantit, et c'est ce qui rend cette
    // révocation non ambiguë sans avoir à persister l'identifiant d'abonnement.
    // `source = 'stripe'` s'y ajoute pour qu'une résiliation ne révoque JAMAIS
    // un octroi offert par le back-office, que Stripe n'a jamais gouverné.
    const { data, error } = await admin
      .from("organization_module_grants")
      .update({
        revoked_at: new Date(event.created * 1000).toISOString(),
        revoked_reason: `stripe: abonnement ${ctx.subscriptionId} résilié`,
      })
      .eq("organization_id", organizationId)
      .eq("module", moduleVise)
      .eq("kind", "recurring")
      .eq("source", "stripe")
      .is("revoked_at", null)
      .is("ends_at", null)
      .select("id");

    if (error) {
      // 500 ASSUMÉ, et le rejeu est inoffensif : `is("revoked_at", null)` rend
      // la seconde passe sans effet si la première avait en réalité commité.
      // L'idempotence est dans le FILTRE, pas dans une prise d'événement.
      reportError("stripe.abonnement-pass-revocation", error.message);
      return NextResponse.json({ error: "Révocation échouée" }, { status: 500 });
    }

    const revoques = (data ?? []) as Array<{ id: string }>;
    if (revoques.length === 0) {
      // Rejeu, ou octroi déjà refermé autrement. Ce n'est pas une panne : c'est
      // l'idempotence qui fonctionne, et elle mérite d'être visible plutôt que
      // confondue avec une révocation réelle.
      console.log(
        `[stripe] aucun octroi récurrent vivant à révoquer (${moduleVise}, org ${organizationId})`,
      );
      continue;
    }

    await writeAuditLog({
      organizationId,
      actor: "stripe",
      action: "module_grant.revoked",
      metadata: {
        event: event.id,
        subscription_id: ctx.subscriptionId,
        module: moduleVise,
        grant_id: revoques[0].id,
      },
    });
    reportSecurityEvent("module_grant_revoked", {
      organization_id: organizationId,
      module: moduleVise,
    });
  }

  return null;
}

/**
 * L'ORGANISATION D'UN ABONNEMENT DE PASS, par le client puis par la metadata.
 *
 * `apply_stripe_subscription_event_v2` fait cette résolution DANS la RPC
 * (`select … from organizations where stripe_customer_id = p_customer_id`) et
 * lève sur un client inconnu. Dès qu'on court-circuite la RPC, on hérite de la
 * question — et du sort d'un client inconnu, tranché par l'appelant.
 *
 * ── POURQUOI LE CLIENT D'ABORD, ALORS QUE LA METADATA EST PLUS DIRECTE ──
 *
 * Parce que ce chemin RÉVOQUE. Se tromper d'organisation n'y coûte pas un
 * octroi manquant mais un module payé refermé chez quelqu'un d'autre, et
 * `stripe_customer_id` est le seul lien que la base elle-même reconnaisse entre
 * Stripe et une organisation — c'est celui qu'emprunte la RPC d'abonnement. Le
 * suivre garantit que les deux chemins désignent la MÊME organisation ; faire
 * primer une chaîne recopiée dans une metadata les laisserait diverger sans que
 * rien ne le signale.
 *
 * `subscription_data.metadata` reste utile en REPLI, et ce n'est pas théorique :
 * si le client Stripe d'une organisation est recréé, l'abonnement en cours
 * reste attaché à l'ancien, que plus aucune ligne ne référence. Sans ce repli,
 * la résiliation ne refermerait rien.
 */
async function resoudreOrganisation(
  admin: AdminClient,
  ctx: ContexteAbonnementPass,
): Promise<string | null> {
  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .eq("stripe_customer_id", ctx.customerId)
    .maybeSingle();

  if (error) {
    // Une panne de lecture n'est PAS un client inconnu. Le repli par metadata
    // s'applique aux deux — dans un cas comme dans l'autre, refermer ce qui est
    // résilié vaut mieux que ne rien refermer.
    reportError("stripe.abonnement-pass-org", error.message);
  }

  const trouvee = (data as { id: string } | null)?.id ?? null;
  if (trouvee) return trouvee;

  const declaree = (ctx.metadata?.organization_id ?? "").trim();
  return declaree || null;
}

/**
 * Transforme un paiement d'add-on en octroi daté.
 *
 * ── CE CHEMIN NE PREND PAS L'ÉVÉNEMENT, ET C'EST DÉLIBÉRÉ ───
 *
 * `creditSmsPack` appelle `claimStripeEvent` par confort, en disant lui-même
 * que la garantie n'est plus là mais dans l'index du grand livre. Ici on ne
 * l'appelle pas du tout, pour supprimer le trou que ce confort ouvre : un
 * événement PRIS mais dont l'écriture échoue ensuite laisse le rejeu se faire
 * avaler comme un doublon — commerçant débité, module non ouvert.
 *
 * La garantie est entière et vit ailleurs :
 * `organization_module_grants_stripe_ref_idx` (migration 20260908120000) est
 * un index unique sur (organisation, référence de paiement), et
 * `grant_module_from_payment` s'y appuie par `on conflict do nothing`. Un
 * rejeu ne peut donc rien créer de second, quel que soit le nombre de fois
 * qu'il passe ici.
 *
 * ⚠️ LA CLÉ EST LE PAIEMENT, PAS L'ÉVÉNEMENT — même invariant que pour les
 * crédits SMS, et pour la même raison : une session traverse légitimement ce
 * chemin sous DEUX identifiants d'événement (`completed` puis
 * `async_payment_succeeded`). Écrire `event.id` en référence rendrait le
 * double octroi systématique sur tout paiement différé.
 */
async function octroyerModule(
  admin: AdminClient,
  event: Stripe.Event,
  sessionId: string,
  achat: Exclude<ModuleGrantPurchase, { kind: "none" }>,
): Promise<NextResponse> {
  if (achat.kind === "invalid") {
    // ACQUITTÉ MALGRÉ LE DÉFAUT, même arbitrage que pour les crédits SMS : la
    // metadata est gelée sur la session, aucun rejeu ne la réparera, et un 500
    // ferait retenter Stripe trois jours avant de désactiver le point d'entrée
    // — ce qui couperait aussi la synchronisation des abonnements.
    reportError("stripe.module-grant-metadata", achat.reason);
    return NextResponse.json({ received: true });
  }

  if (event.type === "checkout.session.async_payment_failed") {
    // Rien à défaire : aucun octroi n'a été écrit. Ce qui manque est la trace
    // — c'est le seul moment où l'on apprend qu'un achat entamé il y a
    // plusieurs jours n'aura pas lieu, alors que le commerçant, lui, a vu son
    // tunnel aboutir.
    reportError(
      "stripe.module-grant-async-failed",
      `encaissement différé échoué pour la session ${sessionId}`,
    );
    await writeAuditLog({
      organizationId: achat.organizationId,
      actor: "stripe",
      action: "module_grant.purchase_failed",
      metadata: { session_id: sessionId, event: event.id },
    });
    return NextResponse.json({ received: true });
  }

  if (achat.kind === "unpaid") {
    // Rien à retenter : l'encaissement se tranchera par
    // `async_payment_succeeded` ou `async_payment_failed`, tous deux traités.
    console.log(
      `[stripe] achat d'add-on non payé (session ${sessionId}), aucun octroi`,
    );
    return NextResponse.json({ received: true });
  }

  // LES TERMES SONT RELUS AU CATALOGUE, jamais dans la metadata — celle-ci a
  // transité par le navigateur, et les relire reviendrait à laisser le client
  // choisir combien de temps il a payé.
  const verdict = termesDepuisCatalogue(
    achat.entitlement,
    achat.acheteA,
    achat.capacity,
  );
  if (!verdict.ok) {
    // Défaut de notre propre catalogue ou jauge non vendue : acquitté et
    // remonté, pour la même raison que `invalid` ci-dessus — aucun rejeu ne le
    // réparera.
    reportError("stripe.module-grant-termes", verdict.erreur);
    return NextResponse.json({ received: true });
  }

  const { data, error } = await admin.rpc("grant_module_from_payment", {
    p_organization_id: achat.organizationId,
    p_module: achat.entitlement,
    p_kind: verdict.termes.kind,
    p_source_reference: sessionId,
    p_starts_at: verdict.termes.starts_at,
    p_ends_at: verdict.termes.ends_at,
    p_activate_by: verdict.termes.activate_by,
    p_capacity: verdict.termes.capacity,
    p_resource_id: null,
  });

  if (error) {
    // 500 ASSUMÉ : Stripe rejouera, et le rejeu est inoffensif — l'index rend
    // la seconde tentative sans effet si la première avait en réalité commité.
    // C'est précisément ce que l'idempotence en base achète : on peut échouer
    // franchement au lieu de deviner si l'écriture a eu lieu.
    reportError("stripe.module-grant-rpc", error.message);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }

  const ligne = (data ?? [])[0] as
    | { grant_id: string | null; created: boolean }
    | undefined;

  /* ── UN REFUS DE CUMUL N'EST PAS UN REJEU (P0.5) ────────────
   *
   * La RPC distingue trois issues et non deux. `(null, false)` dit qu'un AUTRE
   * paiement tient déjà ce module en récurrent : l'index unique du lot 5 a
   * refusé le second octroi. C'est le cas du double clic — deux sessions de
   * checkout partent, l'action n'en a refusé aucune parce qu'aucun octroi
   * n'existait encore quand elle a regardé, et les deux sont encaissées.
   *
   * Le confondre avec un rejeu serait le pire silence possible : le commerçant
   * est débité deux fois, l'audit dirait « déjà octroyé », et personne ne
   * saurait qu'un remboursement est dû. On acquitte — aucun rejeu ne réparera
   * un conflit définitif, et un 500 en boucle couperait la synchro des
   * abonnements principaux — mais on crie.
   */
  if (ligne && !ligne.created && !ligne.grant_id) {
    reportError(
      "stripe.module-grant-cumul",
      `Paiement ${sessionId} refusé : « ${achat.entitlement} » est déjà tenu par un octroi récurrent vivant (remboursement à faire)`,
    );
    reportSecurityEvent("module_grant_double_paiement", {
      organization_id: achat.organizationId,
      module: achat.entitlement,
    });
    await writeAuditLog({
      organizationId: achat.organizationId,
      actor: "stripe",
      action: "module_grant.refused_duplicate",
      metadata: {
        session_id: sessionId,
        event: event.id,
        module: achat.entitlement,
        grant_id: null,
      },
    });
    return NextResponse.json({ received: true, duplicate: true });
  }

  await writeAuditLog({
    organizationId: achat.organizationId,
    actor: "stripe",
    action: ligne?.created ? "module_grant.granted" : "module_grant.replayed",
    metadata: {
      session_id: sessionId,
      event: event.id,
      module: achat.entitlement,
      grant_id: ligne?.grant_id ?? null,
    },
  });

  return NextResponse.json({ received: true });
}

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
 * ── LA GARANTIE N'EST PLUS ICI, ET IL FAUT LE DIRE ──────────
 *
 * Ce qui empêche le double crédit est l'index partiel
 * `sms_credit_entries_one_purchase_per_reference` (20260828120000), donc LE
 * PAIEMENT — `stripe:<session>` — et non l'événement. La prise sur
 * `stripe_events` reste, mais elle est devenue un confort (éviter le travail
 * inutile d'un rejeu), plus une garantie.
 *
 * ⚠️ CE QUE LE COMMENTAIRE PRÉCÉDENT AFFIRMAIT ÉTAIT FAUX, et c'est la raison
 * de l'écrire ici plutôt que de le corriger en silence. Il justifiait le
 * relâchement de la prise par « un échec de la RPC signifie que rien n'a été
 * écrit ». supabase-js rend `{ error }` pour une coupure de pooler EXACTEMENT
 * comme pour une exception SQL : une transaction ayant COMMITÉ dont la réponse
 * s'est perdue est indistinguable, au point d'appel, d'un échec réel. Le
 * relâchement rouvrait donc la porte au second crédit qu'il prétendait
 * refermer. Quiconque relit ce fichier doit y trouver cette phrase, sinon le
 * raisonnement sera réintroduit.
 *
 * ── POURQUOI LE RELÂCHEMENT EST CONSERVÉ ────────────────────
 *
 * Parce qu'il est redevenu inoffensif, et qu'il sert : le rejeu que le 500
 * provoque retombe sur la même référence, donc sur le même mouvement de grand
 * livre. Sans lui, un échec réel laisserait un événement pris sans crédit et
 * le rejeu serait avalé comme un doublon — commerçant débité, non crédité.
 *
 * ⚠️ LA CLÉ EST LE PAIEMENT, PAS L'ÉVÉNEMENT — invariant à ne pas défaire. Une
 * même session traverse légitimement ce chemin sous DEUX identifiants
 * d'événement (`completed` puis `async_payment_succeeded`, cf. l'en-tête du
 * fichier). Écrire `stripe:<event.id>` en référence recréerait le double
 * crédit irrattrapable, en le rendant cette fois systématique sur tout
 * paiement différé.
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
  const { data, error } = await admin.rpc("credit_sms_balance", {
    p_organization_id: purchase.organizationId,
    p_units: purchase.units,
    p_reason: "purchase",
    p_reference: `stripe:${sessionId}`,
  });

  if (error) {
    // RELÂCHER LA PRISE. Sans ce geste, le rejeu que le 500 provoque serait
    // lu comme un doublon et le paiement resterait sans contrepartie.
    //
    // ⚠️ ON NE SAIT PAS SI LA RPC A ÉCRIT. Une réponse perdue après commit se
    // présente ici à l'identique d'une exception SQL. Le relâchement est sûr
    // NON PARCE QUE rien n'a été écrit, mais parce que le rejeu retombera sur
    // la même référence de paiement et n'ajoutera aucun mouvement.
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

  /* ── UN REJEU EST UN SUCCÈS, PAS UN CRÉDIT ──────────────────
   *
   * `credit_sms_balance` rend `(entry_id, created)`. Ce chemin ne lisait que
   * `error` : il compilait et fonctionnait, mais il répondait `received: true`
   * à l'identique qu'un mouvement ait été écrit ou réutilisé, et la trace
   * d'audit affirmait N unités dans les deux cas.
   *
   * Le rejeu qui retombe ici est LÉGITIME et attendu — c'est même la moitié
   * utile du relâchement de prise ci-dessus, et le cas d'un paiement différé
   * qui traverse deux identifiants d'événement pour une seule session. Ce
   * n'est donc pas une panne : c'est l'idempotence qui fonctionne. Mais elle
   * n'était mesurable par rien, et un défaut de facturation Stripe se serait
   * caché dans cette indistinction.
   */
  const outcome = (data ?? [])[0] ?? null;
  const created = outcome?.created === true;

  await admin
    .from("stripe_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", event.id);

  await writeAuditLog({
    organizationId: purchase.organizationId,
    actor: "stripe",
    // Le nom dit ce qui s'est passé. `units` reste la valeur de la session ;
    // `credited: false` dit qu'aucune unité n'a été ajoutée sous cette
    // référence de paiement — le mouvement existait déjà.
    action: created ? "sms_credit.purchase" : "sms_credit.purchase.replayed",
    metadata: {
      units: purchase.units,
      pack: purchase.packId,
      session_id: sessionId,
      event: event.id,
      entry_id: outcome?.entry_id ?? null,
      credited: created,
    },
  });

  if (!created) {
    console.log("[stripe] crédit SMS déjà écrit sous cette référence de paiement");
  }

  return NextResponse.json({ received: true, credited: created });
}
