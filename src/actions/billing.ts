"use server";

import { redirect } from "next/navigation";
import { requireOrganizationOwner } from "@/lib/authorization";
import { reportError } from "@/lib/monitoring";
import {
  ensureStripeCustomer,
  findOfferSubscription,
  getAddonLinePriceId,
  getStripe,
  hasLiveOfferSubscription,
  resolveCheckoutPlan,
  resolveSmsPackCheckout,
  SMS_CREDIT_PURCHASE,
} from "@/lib/stripe";
import { ADDONS_LIGNE_ABONNEMENT } from "@/lib/plans";
import { MODULE_GRANT_PURCHASE } from "@/lib/octroi-achat";
import { resolveAddonCheckout } from "@/lib/octroi-checkout";
import { moduleDepuisEntitlement, termesActivation } from "@/lib/octroi-termes";
import {
  chargerOctroisEnAttente,
  octroiRecurrentVivant,
} from "@/lib/module-grants-loader";
import { createAdminClient } from "@/lib/supabase/admin";
import { rpcStrict } from "@/lib/supabase/rpc";
import { revalidatePath } from "next/cache";
import {
  CHECKOUT_REFUS_ABONNEMENT_VIVANT,
  GRANTABLE_MODULES,
  trialDaysLeft,
} from "@/lib/subscription";
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
    //
    // LE TEXTE DU REFUS EST PARTAGÉ, il n'est pas recopié ici : c'est lui qui
    // fait apparaître le bouton « Gérer mon abonnement » sur l'écran
    // (`billingButtonsToShow`). Le message nommait auparavant une sortie que
    // `canManage` avait pu fermer — webhook en retard ou jamais appliqué —, et
    // le propriétaire qui venait de payer se retrouvait sans aucune action
    // possible. Le recopier en littéral rouvrirait exactement ce cul-de-sac.
    //
    // `hasLiveOfferSubscription` ET NON `hasLiveStripeSubscription` (SD-3). La
    // seconde compte aussi les abonnements de PASS mensuel, qui sont des objets
    // Stripe séparés depuis le lot P0.5 : un Parrainage à 12 € fermait donc
    // définitivement la vente de l'offre à 29 €, avec un message qui renvoyait
    // vers un portail incapable de la créer. Ce que la garde doit empêcher est
    // le SECOND abonnement d'offre, jamais le premier.
    if (await hasLiveOfferSubscription(stripe, customerId)) {
      return { ok: false, error: CHECKOUT_REFUS_ABONNEMENT_VIVANT };
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

/**
 * Achète UN add-on seul, sans abonnement.
 *
 * Jumeau de `createSmsCreditCheckoutSession`, dont il reprend la doctrine : le
 * formulaire désigne un add-on par sa clé et, pour un pass à jauge, un palier ;
 * ni la durée, ni la fenêtre d'activation, ni le montant ne transitent par le
 * navigateur. Tout le reste est relu du catalogue — ici par
 * `resolveAddonCheckout` pour le prix, et par `termesDepuisCatalogue` côté
 * webhook pour la fenêtre.
 *
 * ── PROPRIÉTAIRE SEULEMENT, ET C'EST UNE RÈGLE PRODUIT ──────
 *
 * `requireOrganizationOwner` applique le §3 du cahier : « un propriétaire peut
 * acheter ; un éditeur voit le catalogue mais reçoit "Demander au
 * propriétaire", jamais un contrôle Stripe ». L'écran cache le bouton, mais
 * c'est cette ligne qui le garantit — un éditeur qui poste le formulaire à la
 * main est refusé ici.
 *
 * ── LA GARDE « DÉJÀ ACHETÉ » NE VAUT QUE POUR LES MENSUELS ──
 *
 * Racheter une Chasse au trésor après la fin de la précédente est le geste
 * normal, et rien ne l'empêche : un achat unique est consommable, il se rachète.
 * Un MENSUEL, non. Le commerçant qui en a déjà un actif n'obtiendrait rien de
 * plus qu'un second prélèvement — et, à la résiliation de l'un des deux
 * abonnements, rien ne dirait lequel des deux octrois refermer,
 * `source_reference` portant un identifiant de session et jamais d'abonnement.
 *
 * ── CE REFUS EST UN CONFORT, LA GARDE EST EN BASE ───────────
 *
 * Entre le moment où l'on regarde et celui où le webhook écrit, un double clic
 * ouvre une fenêtre que deux sessions de paiement traversent : aucune
 * vérification applicative ne peut la fermer. C'est l'index unique partiel
 * `organization_module_grants_recurrent_vivant_idx` (20260910120000) qui la
 * ferme, et le webhook crie sur le paiement refusé pour qu'il soit remboursé.
 *
 * Ce que le refus ci-dessous achète est autre chose : le commerçant apprend
 * qu'il l'a DÉJÀ, avant de sortir sa carte, au lieu d'être débité puis refusé.
 *
 * ── CE QU'IL N'INTERDIT PAS ─────────────────────────────────
 *
 * Le rachat APRÈS résiliation. L'octroi résilié est révoqué, donc il ne compte
 * plus comme actif : reprendre en mars ce qu'on a arrêté en janvier reste
 * possible. Le blocage porte sur le cumul, jamais sur le retour.
 */
export async function createAddonCheckoutSession(
  _prevState?: unknown,
  formData?: FormData,
): Promise<ActionResult> {
  const { user, organization } = await requireOrganizationOwner();

  const demande = formData?.get("addon");
  const jauge = formData?.get("capacity");
  // La jauge est PARSÉE ici mais VALIDÉE au catalogue : `resolveAddonCheckout`
  // n'accepte qu'un palier réellement vendu. Un `NaN` devient `null`, qui est
  // refusé pour un pass à jauge — jamais replié sur le premier palier.
  const jaugeChoisie =
    typeof jauge === "string" && jauge.trim() ? Number.parseInt(jauge, 10) : null;

  const selection = resolveAddonCheckout(
    typeof demande === "string" && demande ? demande : null,
    Number.isSafeInteger(jaugeChoisie) ? jaugeChoisie : null,
  );
  if (!selection.ok) return { ok: false, error: selection.erreur };
  const { offre, priceId, mode, capacity } = selection;

  // ── LA COMPÉTITION D'UNE SAISON DE PRONOSTICS (SD-5) ────────
  //
  // « Une seule compétition identifiée, un seul contest_id » (catalogue,
  // décision propriétaire du 2026-08-04). La colonne `resource_id` existait
  // depuis le lot 2 mais rien ne la remplissait : le webhook posait
  // `p_resource_id: null` en dur, donc un pass à 39 € vendu POUR une
  // compétition ouvrait le module ENTIER — toutes les compétitions, pour la
  // durée du plafond dur de douze mois.
  //
  // ── REFUSER PLUTÔT QU'OCTROYER LARGE ──
  //
  // Un achat sans compétition est refusé ICI, avant tout contact avec Stripe.
  // L'alternative — encaisser puis octroyer le module entier — est exactement
  // le défaut qu'on ferme, et elle a le désavantage d'être SILENCIEUSE : le
  // commerçant recevrait plus que ce que le catalogue vend, et personne ne le
  // saurait. Un refus, lui, se lit à l'écran et se corrige d'un clic.
  const ressource = await ressourceDuPass(offre, formData, organization.id);
  if (!ressource.ok) return { ok: false, error: ressource.erreur };
  const resourceId = ressource.resourceId;

  // LE REFUS DE CUMUL, avant tout contact avec Stripe. Placé ici et non après
  // `ensureStripeCustomer` : créer un client Stripe pour une vente qu'on va
  // refuser laisserait une trace commerciale d'un achat qui n'a pas eu lieu.
  if (offre.billing.model === "recurring-monthly") {
    // `moduleVise` et non `module` : ESLint interdit ce nom (Next.js le
    // réserve pour son runtime), et l'erreur ne se voit qu'au lint.
    const moduleVise = moduleDepuisEntitlement(offre.entitlement, GRANTABLE_MODULES);
    if (!moduleVise) {
      // Défaut de notre catalogue : un mensuel qui ne désigne aucun module
      // octroyable ne peut pas être vendu, faute de savoir ce qu'on ouvrirait.
      reportError(
        "billing.addon-checkout",
        `« ${offre.entitlement} » n'est pas un module octroyable`,
      );
      return { ok: false, error: "Impossible de démarrer le paiement" };
    }

    const deja = await octroiRecurrentVivant(organization.id, moduleVise);
    if (deja === "actif") {
      // LE MESSAGE DIT CE QU'IL A, PAS CE QUI A ÉCHOUÉ. « Achat refusé »
      // laisserait croire à une panne et ferait réessayer ; ici le commerçant
      // apprend une bonne nouvelle — c'est déjà en service — et le seul geste
      // qui lui reste ouvert.
      return {
        ok: false,
        error: `« ${offre.name} » est déjà actif sur votre compte et se renouvelle chaque mois. Pour l'arrêter, ouvrez « Gérer mon abonnement ».`,
      };
    }
    if (deja === "indetermine") {
      // On ne vend pas dans le doute : vendre ici, c'est risquer le second
      // prélèvement qu'on vient d'interdire.
      return {
        ok: false,
        error:
          "Impossible de vérifier vos options en cours pour le moment. Réessayez dans un instant.",
      };
    }
  }

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
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      // ── L'ABONNEMENT PORTE SON ORGANISATION (P0.5) ──────────
      //
      // Uniquement en mode `subscription` : Stripe refuse `subscription_data`
      // sur une session de paiement unique. Un mensuel crée un abonnement
      // SÉPARÉ, qui ne portait jusqu'ici ni marqueur ni organisation — le
      // webhook n'avait que le prix pour le reconnaître et que
      // `stripe_customer_id` pour retrouver le commerçant.
      //
      // Ce n'est PAS ce qui décide de l'aiguillage : le prix reste seul juge,
      // pour qu'un abonnement créé à la main dans le tableau de bord soit
      // détourné lui aussi de la synchronisation d'offre. C'est un REPLI de
      // résolution, utile le jour où le client Stripe d'une organisation est
      // recréé et que la colonne ne pointe plus sur lui.
      ...(mode === "subscription"
        ? {
            subscription_data: {
              metadata: {
                organization_id: organization.id,
                entitlement: offre.entitlement,
              },
            },
          }
        : {}),
      // Les deux porteurs d'identité, exigés ENSEMBLE par
      // `readModuleGrantPurchase`. Le webhook n'a rien à déduire : il compare,
      // et refuse si les deux se contredisent.
      client_reference_id: organization.id,
      metadata: {
        purchase: MODULE_GRANT_PURCHASE,
        organization_id: organization.id,
        // Une CLÉ d'un vocabulaire fermé, relue au catalogue côté webhook. Ni
        // la durée ni le prix ne sont écrits ici : les recopier créerait une
        // seconde source, et deux sources finissent toujours par diverger.
        entitlement: offre.entitlement,
        ...(capacity === null ? {} : { capacity: String(capacity) }),
        // La ressource bornante, déjà VÉRIFIÉE comme appartenant à cette
        // organisation. Voir `ressourceDuPass` : c'est un choix du commerçant,
        // qu'aucun catalogue ne saurait retrouver côté webhook — le seul des
        // paramètres d'octroi qui doive légitimement voyager.
        ...(resourceId === null ? {} : { resource_id: resourceId }),
      },
      success_url: `${APP_URL}/dashboard/settings/modules?achat=succes`,
      cancel_url: `${APP_URL}/dashboard/settings/modules?achat=annule`,
    });
    url = session.url;
  } catch (err) {
    reportError("billing.addon-checkout", err);
    return { ok: false, error: "Impossible de démarrer le paiement" };
  }

  if (!url) return { ok: false, error: "Impossible de démarrer le paiement" };
  redirect(url);
}

/** Forme d'un uuid : ce qu'on vérifie AVANT d'interroger Postgres. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type VerdictRessource =
  | { ok: true; resourceId: string | null }
  | { ok: false; erreur: string };

/**
 * LA RESSOURCE À LAQUELLE CET ACHAT EST BORNÉ, vérifiée côté serveur.
 *
 * Rend `null` — et non un refus — pour les sept add-ons qui ouvrent leur module
 * entier : ce n'est pas « pas de ressource fournie », c'est « ce produit n'en
 * prend pas ». Passer une ressource à ces achats-là serait sans effet, la
 * metadata n'étant écrite que sur retour non nul.
 *
 * ── POURQUOI LA VÉRIFICATION EST ICI ET NON DANS LE WEBHOOK ──
 *
 * Le webhook doit écrire ce qui a été PAYÉ ; refuser au moment de l'octroi
 * encaisserait sans rien ouvrir. C'est donc avant le paiement qu'on s'assure
 * que la compétition existe et appartient au commerçant — un identifiant volé
 * chez un autre tenant est refusé ici, et de toute façon inopérant plus loin
 * (l'octroi porte `organization_id`, la garde SQL croise les deux).
 *
 * ── L'INDÉCISION REFUSE LA VENTE ──
 *
 * Même sens que `octroiRecurrentVivant` : une panne de lecture fait refuser
 * l'achat, jamais passer sans borne. Vendre dans le doute, ici, c'est vendre
 * une saison entière au prix d'une compétition.
 */
async function ressourceDuPass(
  offre: { billing: { model: string }; name: string },
  formData: FormData | undefined,
  organizationId: string,
): Promise<VerdictRessource> {
  if (offre.billing.model !== "single-competition") {
    return { ok: true, resourceId: null };
  }

  const demande = formData?.get("resource");
  const brut = typeof demande === "string" ? demande.trim() : "";
  if (!brut) {
    return {
      ok: false,
      erreur:
        `« ${offre.name} » s'achète pour UNE compétition. Créez-la d'abord dans ` +
        "Pronostics — un brouillon suffit —, puis choisissez-la ici.",
    };
  }
  // La forme est testée AVANT la requête : un identifiant malformé ferait
  // rendre à Postgres une erreur de cast (22P02) que l'appelant lirait comme
  // une panne, donc comme une indécision, là où c'est une saisie invalide.
  if (!UUID.test(brut)) {
    return { ok: false, erreur: "Cette compétition est introuvable sur votre compte." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contests")
    .select("id")
    .eq("id", brut)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    reportError("billing.addon-ressource", error.message);
    return {
      ok: false,
      erreur:
        "Impossible de vérifier cette compétition pour le moment. Réessayez dans un instant.",
    };
  }
  if (!data) {
    return { ok: false, erreur: "Cette compétition est introuvable sur votre compte." };
  }
  return { ok: true, resourceId: brut.toLowerCase() };
}

/** Ouvre le portail client Stripe (moyens de paiement, annulation…). */

/* ════════════════════════════════════════════════════════════
 * LES OPTIONS DE LIEU — UNE LIGNE DE L'ABONNEMENT, PAS UN SECOND
 *
 * ── CE QUE CETTE ACTION FAIT AUTREMENT QUE SA VOISINE ──
 *
 * `createAddonCheckoutSession` ouvre une session Stripe, donc un abonnement
 * SÉPARÉ pour un mensuel. Ici, on modifie l'abonnement EXISTANT : la Vitrine
 * et Réserver arrivent comme items du même abonnement, sur la même facture, à
 * la même date, et se résilient d'un seul geste.
 *
 * Stripe proratise seul, dans les deux sens — c'est `create_prorations`. Une
 * option ajoutée le 20 d'un mois payé n'est facturée que pour ses onze jours,
 * et une option retirée rend le reste en avoir.
 *
 * ── PAS D'ABONNEMENT, PAS D'OPTION ──
 *
 * Le refus est délibéré et il est commercial, pas technique : ces deux
 * options se vendent « sur Coup d'envoi, Le Club ou Le Grand Jeu ». Les
 * ouvrir seules donnerait le socle à 20 €, alors qu'il en coûte 29.
 *
 * ── AUCUNE ÉCRITURE EN BASE ICI ──
 *
 * L'action ne touche pas `organizations`. Stripe émet
 * `customer.subscription.updated`, le webhook relit la photographie complète
 * des prix et `resolveStripeEntitlements` en dérive les droits — expansion
 * `alsoGrants` comprise, donc Duo Miroir et Portrait de la Bande avec la
 * Vitrine. Écrire ici en plus créerait un second juge.
 * ════════════════════════════════════════════════════════════ */
export async function toggleSubscriptionOption(
  _prevState?: unknown,
  formData?: FormData,
): Promise<ActionResult> {
  const { organization } = await requireOrganizationOwner();

  const demande = formData?.get("option");
  const geste = formData?.get("geste");
  const offre = ADDONS_LIGNE_ABONNEMENT.find(
    (candidate) => candidate.entitlement === demande,
  );
  if (!offre) {
    return { ok: false, error: "Option inconnue" };
  }
  if (geste !== "ajouter" && geste !== "retirer") {
    return { ok: false, error: "Geste inconnu" };
  }

  const priceId = getAddonLinePriceId(offre.entitlement);
  if (!priceId) {
    // Même doctrine que les packs SMS : une option dont le prix n'est pas
    // configuré est ABSENTE de l'écran, jamais une erreur au clic. Si on
    // arrive ici, c'est que l'écran a été contourné.
    return { ok: false, error: `« ${offre.name} » n'est pas encore en vente.` };
  }

  if (!organization.stripe_customer_id) {
    return {
      ok: false,
      error: `« ${offre.name} » s'ajoute à une offre en cours. Souscrivez d'abord une offre.`,
    };
  }

  try {
    const stripe = getStripe();
    const abonnement = await findOfferSubscription(
      stripe,
      organization.stripe_customer_id,
    );
    if (!abonnement) {
      return {
        ok: false,
        error: `« ${offre.name} » s'ajoute à une offre en cours. Souscrivez d'abord une offre.`,
      };
    }

    const itemExistant = abonnement.itemParPrix.get(priceId);

    if (geste === "ajouter") {
      if (itemExistant) {
        // Le message dit ce qu'il A, pas ce qui a échoué : même doctrine que
        // le refus de cumul de `createAddonCheckoutSession`.
        return {
          ok: false,
          error: `« ${offre.name} » est déjà sur votre abonnement.`,
        };
      }
      await stripe.subscriptions.update(abonnement.id, {
        items: [{ price: priceId }],
        proration_behavior: "create_prorations",
      });
    } else {
      if (!itemExistant) {
        return {
          ok: false,
          error: `« ${offre.name} » n'est pas sur votre abonnement.`,
        };
      }
      await stripe.subscriptions.update(abonnement.id, {
        items: [{ id: itemExistant, deleted: true }],
        proration_behavior: "create_prorations",
      });
    }
  } catch (err) {
    reportError("billing.option-abonnement", err);
    return { ok: false, error: "Impossible de modifier votre abonnement" };
  }

  // Le droit lui-même arrive par le webhook ; on rafraîchit l'écran pour que
  // l'état affiché cesse d'être celui d'avant le clic.
  revalidatePath("/dashboard/settings/modules");
  revalidatePath("/dashboard/settings");
  return { ok: true, data: undefined };
}

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

/**
 * Démarre un pass acheté.
 *
 * ── POURQUOI CE GESTE EXISTE, PLUTÔT QU'UN DÉMARRAGE À L'ACHAT ──
 *
 * `termesDepuisCatalogue` pose délibérément `starts_at: null` sur un achat
 * unique : les trente jours payés ne doivent pas s'écouler pendant que le
 * commerçant rédige ses lots. « 29 EUR / 30 jours, ACTIVABLE DANS LES
 * 90 JOURS » (cahier §2) décrit deux durées, et celle-ci est la seconde.
 *
 * ── LES DATES SONT CALCULÉES ICI ET JAMAIS REÇUES ──
 *
 * Le formulaire ne porte QUE l'identifiant de l'octroi. La durée est relue au
 * catalogue par `termesActivation`, à partir du module lu EN BASE — pas d'un
 * champ posté. Un `ends_at` qui viendrait du navigateur ferait choisir au
 * client combien de temps il a payé, exactement ce que le webhook refuse déjà
 * de son côté.
 *
 * ── CE QUE LA RPC GARDE, ET QU'ON NE REFAIT PAS ICI ──
 *
 * Cloisonnement multi-tenant (l'organisation est dans son `where`), octroi déjà
 * démarré, révoqué, ou fenêtre d'activation dépassée. Les revérifier ici
 * donnerait deux réponses à la même question, et c'est celle de la base qui
 * fait foi — une server action reste POSTable en direct.
 */
export async function activateAddonGrant(
  _prevState?: unknown,
  formData?: FormData,
): Promise<ActionResult> {
  const { organization } = await requireOrganizationOwner();

  const demande = formData?.get("grant");
  const grantId = typeof demande === "string" ? demande.trim() : "";
  if (!grantId) return { ok: false, error: "Option introuvable." };

  // LE MODULE EST LU EN BASE, PAS DANS LE FORMULAIRE. C'est lui qui décide de
  // la durée : le laisser transiter par le navigateur permettrait de démarrer
  // une Chasse de trente jours en déclarant un Calendrier de trente-et-un.
  const attente = await chargerOctroisEnAttente(organization.id);
  const octroi = attente.find((o) => o.id === grantId);
  if (!octroi) {
    // Couvre l'introuvable, l'octroi d'un autre commerçant, le déjà démarré et
    // la fenêtre expirée — le chargeur les exclut tous. Un message unique,
    // parce que les distinguer renseignerait un appelant qui pêche des
    // identifiants sur ce qui existe chez les autres.
    return { ok: false, error: "Cette option ne peut plus être démarrée." };
  }

  const termes = termesActivation(octroi.module, new Date());
  if (!termes.ok) return { ok: false, error: termes.erreur };

  const admin = createAdminClient();
  const { data, error } = await rpcStrict(admin, "activate_module_grant", {
    p_organization_id: organization.id,
    p_grant_id: grantId,
    p_starts_at: termes.termes.starts_at,
    p_ends_at: termes.termes.ends_at,
  });

  if (error) {
    reportError("billing.addon-activation", error.message);
    return { ok: false, error: "Impossible de démarrer cette option" };
  }

  const verdict = (data as Array<{ activated: boolean; state: string }> | null)?.[0];
  if (!verdict?.activated) {
    return { ok: false, error: "Cette option ne peut plus être démarrée." };
  }

  revalidatePath("/dashboard/settings/modules");
  return { ok: true, data: undefined };
}
