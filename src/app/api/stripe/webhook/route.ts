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
import {
  GRANTABLE_MODULES,
  PAST_DUE_GRACE_DAYS,
} from "@/lib/subscription";
import {
  getStripe,
  mapStripeStatus,
  projectStripeSubscriptionItems,
  readSmsCreditPurchase,
  resolveStripeEntitlements,
} from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { rpcStrict } from "@/lib/supabase/rpc";
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
 *   customer.subscription.created / updated / deleted,
 *   charge.refunded,
 *   charge.dispute.created
 *
 * LES DEUX DERNIERS SONT NEUFS (SD-2) et ne sont pas facultatifs non plus :
 * sans eux, un add-on remboursé reste ouvert jusqu'à son terme et des crédits
 * SMS remboursés restent dépensables. Ne pas les activer ne produit aucune
 * erreur visible — c'est précisément ce qui rend l'oubli coûteux.
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

        // Projection de facturation distincte de la projection de droits.
        // Tous les abonnements y passent depuis l'objet courant relu chez
        // Stripe. Le back-office n'appelle ainsi jamais Stripe au rendu et
        // son MRR provient des lignes payees, pas des booleens d'acces.
        const billing = projectStripeSubscriptionItems(current);
        const { error: projectionError } = await rpcStrict(
          admin,
          "apply_stripe_subscription_projection_v1",
          {
            p_event_id: event.id,
            p_event_created_at: new Date(event.created * 1000).toISOString(),
            p_customer_id: customerId,
            p_subscription_id: current.id,
            p_stripe_status: current.status,
            // `?? false` N'EST PAS UNE COQUETTERIE. Ce parametre n'a pas de
            // valeur par defaut en SQL : `undefined` disparait a la
            // serialisation, PostgREST cherche alors une fonction a onze
            // arguments, ne la trouve pas, et le webhook rend 500 en
            // annoncant une fonction absente plutot qu'un champ manquant.
            p_cancel_at_period_end: current.cancel_at_period_end ?? false,
            p_cancel_at: current.cancel_at
              ? new Date(current.cancel_at * 1000).toISOString()
              : null,
            p_canceled_at: current.canceled_at
              ? new Date(current.canceled_at * 1000).toISOString()
              : null,
            p_ended_at: current.ended_at
              ? new Date(current.ended_at * 1000).toISOString()
              : null,
            p_next_billing_at: billing.nextBillingAt,
            p_items: billing.items,
            p_mrr_monthly_cents: billing.mrrMonthlyCents,
          },
        );
        if (projectionError) {
          reportError("stripe.subscription-projection", projectionError.message);
          return NextResponse.json(
            { error: "Projection de facturation echouee" },
            { status: 500 },
          );
        }

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
        const { data: rows, error } = await rpcStrict(
          admin,
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

      // ── CE QUI A ÉTÉ REMBOURSÉ SE REPREND (SD-2) ────────────
      //
      // Les deux événements partagent un seul chemin parce qu'ils décrivent le
      // même fait pour nous : l'argent est reparti. Un litige suit d'ailleurs
      // souvent un remboursement sur la même charge, et les deux RPC sont
      // idempotentes sur la référence d'achat — rejouer l'un après l'autre ne
      // reprend rien deux fois.
      case "charge.refunded": {
        const charge = event.data.object;
        return await reprendreApresRemboursement(admin, stripe, event, {
          paymentIntentId: idDe(charge.payment_intent),
          chargeId: charge.id,
          // `charge.refunded` est émis pour un remboursement PARTIEL comme pour
          // un total. Seul le total est traité — voir le corps.
          integral: charge.amount_refunded >= charge.amount,
          motif: `stripe: charge ${charge.id} remboursée`,
        });
      }

      case "charge.dispute.created": {
        const dispute = event.data.object;
        return await reprendreApresRemboursement(admin, stripe, event, {
          paymentIntentId: idDe(dispute.payment_intent),
          chargeId: idDe(dispute.charge),
          // UN LITIGE EST TOUJOURS TRAITÉ EN ENTIER. Stripe retire les fonds
          // dès son ouverture ; attendre l'issue laisserait le module ouvert
          // pendant les semaines d'instruction. Si le commerçant gagne, le
          // droit se rétablit par un nouvel achat — et c'est le bon sens de
          // l'erreur, l'inverse offrant le service à qui a repris son argent.
          integral: true,
          motif: `stripe: litige sur la charge ${idDe(dispute.charge) ?? "inconnue"}`,
        });
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

  // ── UN IMPAYÉ N'EST PAS UNE ANNULATION, MAIS CE N'EST PAS NON PLUS RIEN ──
  //
  // Ce bloc ne refermait QUE sur `canceled`, et c'était un trou : un add-on
  // mensuel impayé restait ouvert INDÉFINIMENT. `hasActiveAccess` teste
  // `live_module_grants` AVANT le statut d'abonnement (subscription.ts) —
  // un octroi vivant ouvre donc l'accès sans aucune grâce, là où l'abonnement
  // principal se referme au bout de `PAST_DUE_GRACE_DAYS`. Le commerçant qui
  // cessait de payer gardait son module jusqu'à ce que Stripe finisse par
  // annuler, ce qui peut ne jamais arriver selon la configuration des relances.
  //
  // ON POSE UNE ÉCHÉANCE, ON NE RÉVOQUE PAS. Révoquer sur `past_due` couperait
  // sans délai un client dont la carte a simplement expiré ; laisser courir
  // offre le service. L'octroi reçoit donc la même DURÉE de grâce que
  // l'abonnement principal (`PAST_DUE_GRACE_DAYS`), mais datée de CET
  // abonnement-ci et non de l'organisation — voir `echeanceImpaye`, où lire
  // `organizations.past_due_since` était un contresens pour un pass PUR. Il se
  // referme ensuite tout seul : la pause est DÉRIVÉE de `ends_at`, aucun cron
  // ne la prononce (migration 20260907120000).
  //
  // ET ELLE SE LÈVE SEULE : au retour en `active`, ce même chemin efface
  // l'échéance. Un commerçant qui régularise retrouve son module sans geste.
  if (ctx.status === "past_due" || ctx.status === "active") {
    return await echeanceImpaye(admin, event, ctx);
  }

  // Rien à refermer sur les autres états vivants. L'octroi, lui, a été créé par
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

  const { data, error } = await rpcStrict(admin, "grant_module_from_payment", {
    p_organization_id: achat.organizationId,
    p_module: achat.entitlement,
    p_kind: verdict.termes.kind,
    p_source_reference: sessionId,
    p_starts_at: verdict.termes.starts_at,
    p_ends_at: verdict.termes.ends_at,
    p_activate_by: verdict.termes.activate_by,
    p_capacity: verdict.termes.capacity,
    // LA RESSOURCE BORNANTE, et non plus `null` en dur (SD-5). Elle vient de la
    // metadata de session, seul endroit où le CHOIX du commerçant puisse
    // voyager — `createAddonCheckoutSession` a vérifié avant le paiement que la
    // compétition lui appartient, et `readModuleGrantPurchase` en revérifie la
    // forme. Non nulle uniquement pour une Saison de pronostics ; les sept
    // autres add-ons ouvrent leur module entier et rendent `null` comme avant.
    p_resource_id: achat.resourceId,
  });

  if (error) {
    // 500 ASSUMÉ : Stripe rejouera, et le rejeu est inoffensif — l'index rend
    // la seconde tentative sans effet si la première avait en réalité commité.
    // C'est précisément ce que l'idempotence en base achète : on peut échouer
    // franchement au lieu de deviner si l'écriture a eu lieu.
    reportError("stripe.module-grant-rpc", error.message);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }

  const ligne = (data ?? [])[0];

  /* ── UN REFUS DE CUMUL N'EST PAS UN REJEU (P0.5) ────────────
   *
   * La RPC distingue trois issues et non deux, et depuis la migration
   * 20260913120000 elle les dit par un MOT (`outcome`) et non par l'absence
   * d'identifiant. Le motif est écrit là-bas en entier ; en deux lignes : la
   * nullabilité d'une colonne de `returns table` ne remonte pas jusqu'aux types
   * générés, donc `grant_id` y était déclaré non-nullable, donc le cast qui
   * rétablissait la vérité avait l'air d'une redondance à supprimer — et sa
   * suppression aurait tué cette branche sans faire rougir un seul test.
   *
   * `refused` dit qu'un AUTRE paiement tient déjà ce module en récurrent :
   * l'index unique du lot 5 a refusé le second octroi. C'est le cas du double
   * clic — deux sessions de checkout partent, l'action n'en a refusé aucune
   * parce qu'aucun octroi n'existait encore quand elle a regardé, et les deux
   * sont encaissées.
   *
   * Le confondre avec un rejeu serait le pire silence possible : le commerçant
   * est débité deux fois, l'audit dirait « déjà octroyé », et personne ne
   * saurait qu'un remboursement est dû. On acquitte — aucun rejeu ne réparera
   * un conflit définitif, et un 500 en boucle couperait la synchro des
   * abonnements principaux — mais on crie.
   */
  if (ligne?.outcome === "refused") {
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

  /* ── CE QUE `outcome` ACHÈTE, ET QUI N'EXISTAIT PAS AVANT ──
   *
   * L'ancien encodage n'avait pas d'issue INCONNUE : `created` étant un
   * booléen, tout ce qui n'était pas `true` retombait sur « rejeu », y compris
   * une ligne absente. Une quatrième issue ajoutée un jour en base — ou un
   * littéral renommé — se serait donc journalisée « déjà octroyé » et acquittée
   * en silence, ce qui est exactement le silence que ce lot cherche à fermer.
   *
   * Ici les trois issues nominales sont NOMMÉES, et tout le reste crie. On
   * acquitte quand même : la RPC a fait ce qu'elle avait à faire, seul son
   * verdict nous échappe, et un 500 ferait retenter Stripe pour rien.
   *
   * ── ET LA TROISIÈME EST ARRIVÉE, EXACTEMENT COMME ANNONCÉ ───
   *
   * La migration 20260925120000 ajoute `reactivated` (SD-6) : un rachat pendant
   * la grâce d'impayé LÈVE l'échéance de l'octroi existant au lieu d'en créer un
   * second que la levée ferait ensuite violer l'index d'unicité. Le paragraphe
   * ci-dessus décrivait ce scénario au futur — « une quatrième issue ajoutée un
   * jour en base » —, et sans le mot `reactivated` dans cette liste, un rachat
   * parfaitement réussi serait sorti par le chemin d'alerte, SANS écrire la
   * moindre trace d'audit. Le droit rouvert n'aurait figuré nulle part.
   */
  const NOMINALES = ["created", "replayed", "reactivated"] as const;
  type IssueNominale = (typeof NOMINALES)[number];
  if (!(NOMINALES as readonly string[]).includes(ligne?.outcome ?? "")) {
    reportError(
      "stripe.module-grant-outcome",
      `issue inattendue « ${ligne?.outcome ?? "aucune ligne rendue"} » de grant_module_from_payment pour la session ${sessionId}`,
    );
    return NextResponse.json({ received: true });
  }
  const issue = ligne.outcome as IssueNominale;

  // TROIS ACTIONS D'AUDIT ET NON DEUX. Une table plutôt qu'un ternaire imbriqué :
  // le vocabulaire est celui déjà posé par ce fichier (`module_grant.granted`,
  // `module_grant.replayed`), et l'exhaustivité est tenue par le type — une
  // cinquième issue ne compilerait pas tant qu'elle n'a pas son nom ici.
  const ACTION_AUDIT: Record<IssueNominale, string> = {
    created: "module_grant.granted",
    replayed: "module_grant.replayed",
    // Le mot dit ce qui s'est passé : rien n'a été créé, une échéance d'impayé
    // a été levée sur un octroi qui n'avait jamais cessé d'exister.
    reactivated: "module_grant.reactivated",
  };

  await writeAuditLog({
    organizationId: achat.organizationId,
    actor: "stripe",
    action: ACTION_AUDIT[issue],
    metadata: {
      session_id: sessionId,
      event: event.id,
      module: achat.entitlement,
      // Non-null sur ces trois issues-là : `created` le rend depuis le
      // `returning`, `replayed` le relit sur la ligne en conflit, `reactivated`
      // rend celle qu'il vient de rouvrir. Le seul cas où il manque est
      // `refused`, sorti plus haut.
      grant_id: ligne.grant_id,
    },
  });

  return NextResponse.json({ received: true });
}

/** L'identifiant d'un champ Stripe expansible, qu'il soit rendu nu ou déplié. */
function idDe(champ: string | { id: string } | null | undefined): string | null {
  if (!champ) return null;
  return typeof champ === "string" ? champ : champ.id;
}

interface ContexteReprise {
  /** Le paiement, seul lien entre une charge et la session qui l'a créée. */
  paymentIntentId: string | null;
  chargeId: string | null;
  /** Faux pour un remboursement partiel : signalé, jamais deviné. */
  integral: boolean;
  /** Motif écrit sur l'octroi révoqué. Tronqué à 300 par la RPC. */
  motif: string;
}

/* ════════════════════════════════════════════════════════════
 * REPRENDRE CE QUI A ÉTÉ REMBOURSÉ OU CONTESTÉ (SD-2)
 *
 * ── LE PIÈGE CENTRAL : DEUX IDENTIFIANTS QUI NE SE PARLENT PAS ──
 *
 * Les deux RPC s'apparient sur la référence D'ACHAT — `source_reference` d'un
 * octroi et `reference` d'un mouvement de crédit SMS valent toutes deux
 * l'identifiant de la SESSION DE CHECKOUT (la seconde préfixée `stripe:`).
 * Or un `charge.refunded` ne porte ni l'un ni l'autre : il porte une charge et
 * un payment intent, que la base n'a jamais vus. Leur passer l'identifiant de
 * charge « parce qu'il est là » ne lèverait aucune erreur : les deux rendraient
 * ZÉRO LIGNE, c'est-à-dire « rien à reprendre », et le remboursement serait
 * classé traité en laissant le module ouvert. Le silence est ici le défaut, pas
 * l'exception.
 *
 * La traduction se demande donc à Stripe — `checkout.sessions.list({
 * payment_intent })` — avec le même client que le reste de la route.
 *
 * ── CE QUE CE CHEMIN NE COUVRE PAS, ET C'EST ÉCRIT PLUTÔT QUE DÉCOUVERT ──
 *
 *   * LE REMBOURSEMENT PARTIEL. Rembourser 10 € sur un pass à 39 € ne dit pas
 *     si le droit doit tomber ; reprendre la moitié d'un octroi n'existe pas, et
 *     reprendre le tout sur un geste commercial couperait un client servi. On
 *     signale et on acquitte.
 *   * LES FACTURES D'ABONNEMENT (offre mensuelle, pass récurrent). Leur charge
 *     n'est rattachée à aucune session de checkout — `session.payment_intent`
 *     est null en mode `subscription` —, donc la recherche ci-dessous ne rend
 *     rien. Ce n'est pas un trou béant : la résiliation Stripe, elle, révoque
 *     déjà l'octroi récurrent par `traiterAbonnementDePass`. Ce qui manque est
 *     le remboursement SANS résiliation, qui reste à traiter à la main.
 *
 * ── IDEMPOTENCE ──
 *
 * Entièrement portée par les deux RPC : un octroi déjà révoqué n'est pas
 * retouché et ne figure pas dans leur retour, et le débit SMS est gardé par
 * l'index `sms_credit_entries_one_refund_debit`. Ce chemin ne prend donc PAS
 * l'événement (`claimStripeEvent`), pour la raison écrite plus haut à propos
 * d'`octroyerModule` : une prise réussie suivie d'une écriture échouée ferait
 * avaler le rejeu comme un doublon. Un 500 est ici toujours sûr.
 * ════════════════════════════════════════════════════════════ */
async function reprendreApresRemboursement(
  admin: AdminClient,
  stripe: Stripe,
  event: Stripe.Event,
  ctx: ContexteReprise,
): Promise<NextResponse> {
  if (!ctx.integral) {
    // SIGNALÉ, PAS DEVINÉ. Un humain tranche ce que le code ne peut pas.
    reportError(
      "stripe.remboursement-partiel",
      `remboursement partiel sur la charge ${ctx.chargeId ?? "inconnue"} : aucune reprise automatique, à trancher à la main`,
    );
    return NextResponse.json({ received: true, partial: true });
  }

  if (!ctx.paymentIntentId) {
    reportError(
      "stripe.remboursement-sans-paiement",
      `charge ${ctx.chargeId ?? "inconnue"} sans payment_intent : impossible de retrouver la session d'achat`,
    );
    return NextResponse.json({ received: true });
  }

  let sessions: Stripe.ApiList<Stripe.Checkout.Session>;
  try {
    sessions = await stripe.checkout.sessions.list({
      payment_intent: ctx.paymentIntentId,
      limit: 2,
    });
  } catch (err) {
    // 500 ASSUMÉ : c'est une panne de lecture, pas un verdict. Stripe rejouera,
    // et le rejeu ne peut rien reprendre deux fois.
    reportError("stripe.remboursement-session", err);
    return NextResponse.json({ error: "Reprise impossible" }, { status: 500 });
  }

  const session = sessions.data[0] ?? null;
  if (!session) {
    // Ni octroi ni crédit sous ce paiement : facture d'abonnement, paiement
    // hors tunnel, ou achat antérieur au marqueur de metadata. Rien à reprendre
    // n'est un état normal, il se journalise sans crier.
    console.log(
      `[stripe] remboursement ${ctx.paymentIntentId} : aucune session de checkout, rien à reprendre`,
    );
    return NextResponse.json({ received: true });
  }
  if (sessions.data.length > 1) {
    // Inatteignable depuis l'application (un paiement, une session), mais le
    // constater coûte une ligne et sa découverte en produirait un mystère.
    reportError(
      "stripe.remboursement-sessions-multiples",
      `plusieurs sessions pour le paiement ${ctx.paymentIntentId}, seule ${session.id} est reprise`,
    );
  }

  // L'organisation vient de la SESSION, seul endroit où les deux reprises
  // puissent la lire : `revoke_grant_for_refund` ne la rend pas, et une reprise
  // qui ne rendrait rien laisserait l'audit sans destinataire.
  const organizationId =
    (session.client_reference_id ?? session.metadata?.organization_id ?? "").trim()
    || null;

  if (!organizationId) {
    // ACQUITTÉ ET CRIÉ, et c'est le prix du paramètre devenu REQUIS (MOYEN 1 de
    // la revue). Les deux RPC ne s'apparient plus sur la seule référence de
    // paiement : elles exigent l'organisation, faute de quoi une référence
    // devinée pouvait leur faire reprendre un droit chez un autre tenant.
    //
    // Aucun achat ayant réellement ouvert un droit ne tombe ici : toute session
    // créée par ce projet porte l'organisation DEUX FOIS
    // (`client_reference_id` ET `metadata.organization_id`), et
    // `readSmsCreditPurchase` comme `readModuleGrantPurchase` refusent d'écrire
    // quoi que ce soit sans les deux. Ce qui tombe ici est un paiement hors
    // tunnel — rien à reprendre —, et un 500 y ferait retenter Stripe trois
    // jours sur une metadata gelée avant de désactiver le point d'entrée.
    reportError(
      "stripe.remboursement-organisation",
      `session ${session.id} sans organisation : aucune reprise possible, à trancher à la main`,
    );
    return NextResponse.json({ received: true });
  }

  const { data: octrois, error: erreurOctrois } = await rpcStrict(
    admin,
    "revoke_grant_for_refund",
    {
      // L'ORGANISATION BORNE LA REPRISE, elle ne la désigne pas : la référence
      // de paiement reste ce qui choisit les lignes. C'est la garde qui rend
      // inoffensive une référence venue d'ailleurs — elle ne peut plus mordre
      // que sur le tenant que la session nomme.
      p_organization_id: organizationId,
      p_source_reference: session.id,
      p_reason: ctx.motif,
    },
  );
  if (erreurOctrois) {
    reportError("stripe.remboursement-octroi", erreurOctrois.message);
    return NextResponse.json({ error: "Reprise impossible" }, { status: 500 });
  }

  const { data: sms, error: erreurSms } = await rpcStrict(
    admin,
    "debit_sms_balance_for_refund",
    {
      p_organization_id: organizationId,
      // ⚠️ LE PRÉFIXE N'EST PAS DÉCORATIF. `creditSmsPack` écrit la référence
      // d'achat `stripe:<session>` au grand livre ; la passer NUE ici ferait
      // rendre zéro ligne à la RPC — donc « rien à reprendre » — sur un achat de
      // crédits parfaitement remboursé.
      p_source_reference: `stripe:${session.id}`,
    },
  );
  if (erreurSms) {
    // Les octrois ont pu être révoqués juste au-dessus : le 500 les rejouera,
    // et la RPC d'octroi ne re-révoque pas ce qui l'est déjà. C'est exactement
    // ce que l'idempotence achète — on peut échouer franchement.
    reportError("stripe.remboursement-sms", erreurSms.message);
    return NextResponse.json({ error: "Reprise impossible" }, { status: 500 });
  }

  const revoques = (octrois ?? []) as Array<{
    grant_id: string;
    grant_module: string;
  }>;
  const debit = ((sms ?? []) as Array<{
    org_id: string;
    debited_units: number;
    entry_id: string;
  }>)[0];

  for (const octroi of revoques) {
    await writeAuditLog({
      organizationId,
      actor: "stripe",
      action: "module_grant.revoked",
      metadata: {
        event: event.id,
        session_id: session.id,
        charge_id: ctx.chargeId,
        module: octroi.grant_module,
        grant_id: octroi.grant_id,
        reason: "refund",
      },
    });
    reportSecurityEvent("module_grant_revoked", {
      organization_id: organizationId,
      module: octroi.grant_module,
    });
  }

  if (debit) {
    await writeAuditLog({
      // L'organisation rendue par la RPC prime : elle vient de la ligne du
      // grand livre effectivement débitée, pas d'une metadata de session.
      organizationId: debit.org_id,
      actor: "stripe",
      action: "sms_credit.refunded",
      metadata: {
        event: event.id,
        session_id: session.id,
        charge_id: ctx.chargeId,
        units: debit.debited_units,
        entry_id: debit.entry_id,
      },
    });
  }

  if (revoques.length === 0 && !debit) {
    // Rejeu, ou remboursement d'un achat qui n'ouvrait aucun droit. Les deux se
    // ressemblent ici et c'est sans conséquence : dans les deux cas il n'y a
    // rien à reprendre. Visible plutôt que muet.
    console.log(
      `[stripe] remboursement de la session ${session.id} : rien à reprendre (déjà fait, ou achat sans droit)`,
    );
  }

  return NextResponse.json({
    received: true,
    revoked: revoques.length,
    sms_debited: debit?.debited_units ?? 0,
  });
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
  const { data, error } = await rpcStrict(admin, "credit_sms_balance", {
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

/**
 * POSE — OU LÈVE — L'ÉCHÉANCE D'UN OCTROI RÉCURRENT SELON L'IMPAYÉ.
 *
 * ── POURQUOI UNE ÉCHÉANCE ET NON UNE RÉVOCATION ──
 *
 * Un `past_due` n'est pas une résiliation : c'est le plus souvent une carte
 * expirée. Révoquer sur-le-champ couperait un client qui va payer dans l'heure.
 * Mais ne rien faire, ce que faisait ce webhook, laissait le module ouvert
 * INDÉFINIMENT — `hasActiveAccess` (subscription.ts) teste `live_module_grants`
 * AVANT le statut d'abonnement, si bien qu'un octroi vivant court-circuite la
 * grâce bornée dont bénéficie l'abonnement principal.
 *
 * L'octroi reçoit donc la même DURÉE de grâce que l'abonnement principal
 * (`PAST_DUE_GRACE_DAYS`). Passé ce terme, il cesse de figurer parmi les
 * octrois vivants et le module se referme — SANS CRON, par simple dérivation de
 * `ends_at`, comme le veut la migration 20260907120000.
 *
 * ── LA GRÂCE EST DATÉE DE L'ABONNEMENT, PLUS DE L'ORGANISATION ──
 *
 * Ce chemin lisait `organizations.past_due_since`, et c'était un contresens pour
 * sa population PRINCIPALE : ce champ n'est écrit que par
 * `apply_stripe_subscription_event_v2` (20260805170000), que l'abonnement de
 * pass PUR ne traverse JAMAIS — il sort par `break` juste après la partition des
 * prix. Un pass seul en `past_due` lisait donc `null`, renonçait, et le module
 * restait ouvert indéfiniment : exactement le trou que ce bloc prétendait
 * fermer. Par ricochet, la branche `reactivated` (SD-6), qui exige un `ends_at`
 * posé pour rouvrir un droit, était INATTEIGNABLE pour ces mêmes clients.
 *
 * Pire dans le cas MIXTE : `past_due_since` peut être ANCIEN (l'offre est en
 * impayé depuis des semaines) et rendre une fin ANTÉRIEURE au `starts_at` de
 * l'octroi du pass, donc une violation de `grant_fin_apres_debut`
 * (20260907120000) — donc un 500 rejoué trois jours avant que Stripe désactive
 * le point d'entrée, l'issue que ce fichier désigne partout comme la pire.
 *
 * L'ancre est donc `event.created` : l'instant où CET abonnement est passé en
 * `past_due`, seule date que l'événement porte de lui-même.
 * (`current_period_end` aurait été l'autre ancre possible, mais depuis
 * l'API 2025 elle a quitté l'abonnement pour ses ITEMS : il faudrait élire une
 * période parmi plusieurs pour un seul terme, sans que le choix se justifie.)
 *
 * ── ET ELLE NE SE REPOUSSE PAS : L'ÉCRITURE EST MONOTONE ──
 *
 * `event.created` change d'un événement à l'autre, et Stripe émet un
 * `customer.subscription.updated` à CHAQUE relance de recouvrement. Redater à
 * chaque passage rallongerait la grâce sans fin — le défaut même que la lecture
 * de `past_due_since` cherchait à éviter. Seuls les octrois SANS échéance sont
 * datés : le premier impayé fixe le terme, les suivants n'y touchent plus. C'est
 * mot pour mot le `coalesce(past_due_since, p_event_created_at)` de la RPC
 * d'abonnement, transposé sur l'octroi.
 *
 * Une valeur non nulle trouvée là est forcément la nôtre : les termes d'un
 * récurrent posent `ends_at: null` (octroi-termes.ts).
 *
 * ── ET LA BORNE QUI PROTÈGE LA CONTRAINTE ──
 *
 * `grant_fin_apres_debut` exige `ends_at > starts_at`. Une fin qui ne le
 * respecterait pas n'est pas écrite « au plus près » : elle est SIGNALÉE et la
 * ligne reste intacte. Même prudence que `shrink_contest_grants_on_close`
 * (20260925120000), qui exclut de son `least` les octrois non démarrés pour ne
 * pas faire échouer une clôture de championnat sur une contrainte.
 *
 * ── ET ELLE SE LÈVE TOUTE SEULE ──
 *
 * Au retour en `active`, `ends_at` repasse à `null`. Un commerçant qui met sa
 * carte à jour retrouve son module sans qu'un humain intervienne — c'est la
 * contrepartie qui rend l'échéance acceptable plutôt que punitive.
 */
async function echeanceImpaye(
  admin: AdminClient,
  event: Stripe.Event,
  ctx: ContexteAbonnementPass,
): Promise<NextResponse | null> {
  const organizationId = await resoudreOrganisation(admin, ctx);
  if (!organizationId) return null;

  const modules = ctx.passes.map((p) => p.entitlement);
  if (modules.length === 0) return null;

  if (ctx.status !== "past_due") {
    // LA LEVÉE NE LIT RIEN. La valeur posée est `null` : aucun calcul ne peut
    // être aberrant, aucune contrainte ne peut être violée, et c'est ce qui
    // rend la branche `reactivated` joignable dans les deux sens — l'échéance
    // se pose sur l'impayé, se lève sur la régularisation.
    const { error } = await admin
      .from("organization_module_grants")
      .update({ ends_at: null })
      .eq("organization_id", organizationId)
      .in("module", modules)
      .eq("kind", "recurring")
      .eq("source", "stripe")
      .is("resource_id", null)
      .is("revoked_at", null);

    if (error) {
      reportError("stripe.echeance-impaye", error.message);
      return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
    }

    console.log(
      `[stripe] abonnement d'add-on ${ctx.subscriptionId} = ${ctx.status} → échéance levée sur ${modules.join(", ")}`,
    );
    return null;
  }

  const fin = new Date(
    event.created * 1000 + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // LIRE AVANT D'ÉCRIRE, et c'est tout le prix de la borne : sans les
  // `starts_at` et les échéances déjà posées, rien ne distingue « rien à
  // faire » (rejeu) d'« échéance impossible à poser » (calcul aberrant) — et le
  // second se tairait, ce qui est précisément le silence qu'on ferme ici.
  const { data: candidats, error: erreurLecture } = await admin
    .from("organization_module_grants")
    .select("id, module, starts_at, ends_at")
    .eq("organization_id", organizationId)
    .in("module", modules)
    .eq("kind", "recurring")
    .eq("source", "stripe")
    // LE FILTRE D'`org_has_live_module_grant` (20260925120000), et il manquait.
    // Un octroi BORNÉ À UNE RESSOURCE — une Saison de pronostics vendue pour UNE
    // compétition — n'est pas gouverné par l'abonnement d'un module entier : lui
    // poser cette échéance, ou la lui lever, déciderait de la vie d'un droit que
    // cet abonnement n'a jamais vendu.
    .is("resource_id", null)
    .is("revoked_at", null);

  if (erreurLecture) {
    // 500 ASSUMÉ : c'est une panne de lecture, pas un verdict. Le rejeu
    // recommencera la lecture et retombera sur le même terme — `event.created`
    // ne bouge pas d'un rejeu à l'autre, à la différence de `now()`.
    reportError("stripe.echeance-impaye-lecture", erreurLecture.message);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }

  const lignes = (candidats ?? []) as Array<{
    id: string;
    module: string;
    starts_at: string | null;
    ends_at: string | null;
  }>;

  const finMs = Date.parse(fin);
  // MONOTONE : une échéance déjà posée ne bouge plus (voir l'en-tête).
  const aDater = lignes.filter((ligne) => ligne.ends_at === null);
  const posables = aDater.filter((ligne) => {
    const debut = ligne.starts_at === null ? NaN : Date.parse(ligne.starts_at);
    return Number.isFinite(debut) && debut < finMs;
  });

  if (posables.length < aDater.length) {
    // SIGNALÉ, JAMAIS FORCÉ. Écrire quand même ferait échouer la mise à jour sur
    // `grant_fin_apres_debut`, donc répondre 500 en boucle sur un état qu'aucun
    // rejeu ne répare. Un octroi non démarré n'a d'ailleurs pas d'accès à
    // fermer : ne rien écrire est aussi le geste juste.
    reportError(
      "stripe.echeance-impaye-borne",
      `${aDater.length - posables.length} octroi(s) sans début exploitable ou démarrant après la fin de grâce ${fin} (abonnement ${ctx.subscriptionId}) : échéance non posée`,
    );
  }

  if (posables.length === 0) {
    // Rejeu, ou aucun octroi datable. Visible plutôt que muet, jamais criard :
    // c'est l'état normal du second passage d'un impayé.
    console.log(
      `[stripe] abonnement d'add-on ${ctx.subscriptionId} = past_due → aucune échéance à poser (déjà datée, ou rien à dater)`,
    );
    return null;
  }

  const { error } = await admin
    .from("organization_module_grants")
    .update({ ends_at: fin })
    .in(
      "id",
      posables.map((ligne) => ligne.id),
    )
    // LES DEUX GARDES SURVIVENT À LA LECTURE : entre le `select` et cet
    // `update`, une résiliation ou un rachat a pu passer. `ends_at is null`
    // tient la monotonie même en course, et rend le rejeu d'un 500 sans effet.
    .is("revoked_at", null)
    .is("ends_at", null);

  if (error) {
    // 500 ASSUMÉ : Stripe rejouera, et le rejeu est inoffensif — l'écriture pose
    // une valeur, elle ne l'incrémente pas, et le terme ne dépend que de
    // `event.created`.
    reportError("stripe.echeance-impaye", error.message);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }

  console.log(
    `[stripe] abonnement d'add-on ${ctx.subscriptionId} = past_due → ends_at ${fin} sur ${posables.map((ligne) => ligne.module).join(", ")}`,
  );
  return null;
}
