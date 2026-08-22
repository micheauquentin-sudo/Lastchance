import { optionalEnv } from "@/lib/env";
import { ADDON_OFFERS, type AddonOffer } from "@/lib/plans";
import type { Entitlement } from "@/platform/experiences/contract";

/**
 * LE RATTACHEMENT STRIPE DES ADD-ONS AUTONOMES.
 *
 * ── POURQUOI DES VARIABLES DISTINCTES DE `ADDON_PRICE_ENV` ──
 *
 * `ADDON_PRICE_ENV` (src/lib/stripe.ts) désigne les prix des add-ons vendus
 * COMME LIGNES D'UN ABONNEMENT : le webhook d'abonnement les traduit en
 * booléens `addon_*` permanents. Ce qui est vendu ici est un autre produit —
 * un achat autonome, daté, qui n'exige aucun abonnement et crée un octroi.
 *
 * Réutiliser les mêmes variables aurait fait vendre l'un pour l'autre : un
 * commerçant sans abonnement aurait payé une ligne d'abonnement qui ne
 * s'attache à rien, ou un abonné aurait reçu un pass de trente jours à la
 * place d'une option permanente. Deux produits, deux prix, deux variables.
 *
 * ── UN ADD-ON SANS VARIABLE N'EST PAS PROPOSÉ ──
 *
 * Exactement la règle des packs de crédits SMS, et elle a la même vertu : les
 * décisions commerciales (quels add-ons vendre, à quel prix, à partir de
 * quand) deviennent des variables d'environnement à poser, jamais un préalable
 * au code. Le catalogue décrit les huit offres ; seules celles dont le prix
 * Stripe existe sont achetables, et l'écran ne montre que celles-là.
 */

/** Nom de variable pour un add-on simple. */
function envAddon(entitlement: Entitlement): string {
  return `STRIPE_PRICE_ID_PASS_${entitlement.toUpperCase()}`;
}

/** Nom de variable pour un palier de jauge : un prix par palier vendu. */
function envPalier(entitlement: Entitlement, maxPlayers: number): string {
  return `${envAddon(entitlement)}_${maxPlayers}`;
}

/**
 * Mode de checkout Stripe. Un récurrent est un abonnement, tout le reste est
 * un paiement unique — et se tromper ici ne produit pas une erreur mais un
 * prélèvement mensuel sur ce qui devait être payé une fois.
 */
export function modeCheckout(offre: AddonOffer): "payment" | "subscription" {
  return offre.billing.model === "recurring-monthly" ? "subscription" : "payment";
}

/* ════════════════════════════════════════════════════════════
 * RECONNAÎTRE UN PRIX DE PASS — le renversement, et pourquoi il vit ICI
 *
 * ── CE QU'IL DÉBLOQUE ───────────────────────────────────────
 *
 * Les deux add-ons mensuels sont restés invendables tant que le webhook ne
 * savait pas les recevoir (ADR-079) : un `mode: "subscription"` crée chez
 * Stripe un abonnement SÉPARÉ, dont le prix `STRIPE_PRICE_ID_PASS_*` sortait
 * « inconnu » de `resolveStripeEntitlements` — donc 500 en boucle. Et la
 * correction évidente, ignorer ce prix, était PIRE : la résolution retombe sur
 * `PLANS[0]` et `apply_stripe_subscription_event_v2` aurait écrasé le plan payé
 * de l'organisation par l'offre la moins chère.
 *
 * La sortie n'est ni le 500 ni l'oubli : c'est de RECONNAÎTRE ces prix assez
 * tôt pour que l'abonnement ne parte jamais dans la synchronisation d'offre.
 * C'est ce que ces deux fonctions rendent possible.
 *
 * ── POURQUOI DANS CE MODULE ET NON DANS `stripe.ts` ─────────
 *
 * Ce fichier est le seul qui connaisse la grammaire des variables
 * `STRIPE_PRICE_ID_PASS_*`, suffixe de palier compris (`envAddon`, `envPalier`).
 * Porter le renversement dans `stripe.ts` obligerait à y dupliquer ces deux
 * constructeurs de noms — c'est-à-dire à recréer exactement la confusion entre
 * les deux familles de prix que l'en-tête de ce fichier a été écrit pour
 * empêcher.
 * ════════════════════════════════════════════════════════════ */

/** Ce qu'un identifiant de price Stripe désigne, quand il désigne un pass. */
export interface PrixDePass {
  entitlement: Exclude<Entitlement, "core">;
  /** Palier reconnu, `null` hors pass à jauge. */
  capacity: number | null;
  offre: AddonOffer;
}

/**
 * CE PRICE STRIPE EST-IL UN PRIX D'ACHAT AUTONOME ?
 *
 * Rend l'add-on et, pour un pass à jauge, le PALIER exact — c'est le même
 * renversement que celui d'`ADDON_PRICE_ENV` dans `resolveStripeEntitlements`,
 * mais sur l'autre famille de variables.
 *
 * Un `priceId` vide rend `null` sans rien parcourir : `optionalEnv` rend
 * `undefined` sur une variable absente, mais une variable posée à la chaîne
 * vide rendrait `""`, et comparer `"" === ""` ferait reconnaître comme pass
 * n'importe quel prix vide.
 */
export function passDepuisPrix(priceId: string): PrixDePass | null {
  if (!priceId) return null;

  for (const offre of ADDON_OFFERS) {
    if (offre.billing.model === "capacity-pass") {
      for (const palier of offre.billing.steps) {
        if (optionalEnv(envPalier(offre.entitlement, palier.maxPlayers)) === priceId) {
          return { entitlement: offre.entitlement, capacity: palier.maxPlayers, offre };
        }
      }
      continue;
    }
    if (optionalEnv(envAddon(offre.entitlement)) === priceId) {
      return { entitlement: offre.entitlement, capacity: null, offre };
    }
  }
  return null;
}

/** Les deux moitiés d'une photographie d'items Stripe. */
export interface PartitionPrix {
  /** Prix d'achat autonome reconnus, dans l'ordre reçu. */
  passes: PrixDePass[];
  /** Tout le reste : prix d'offre, prix d'add-on d'abonnement, inconnus. */
  autres: string[];
}

/**
 * PARTITIONNE les prix d'un abonnement, plutôt que de le classer d'un `some()`.
 *
 * ── CE QUE LE CAS MIXTE EST, ET CE QU'ON EN FAIT ────────────
 *
 * Un abonnement portant À LA FOIS un prix d'offre et un prix de pass n'est pas
 * atteignable depuis l'application : les trois créateurs de session
 * (`src/actions/billing.ts`) posent chacun UN seul `line_items`, et aucun
 * `update` d'abonnement n'existe côté applicatif. Il ne peut naître que d'un
 * geste manuel dans le tableau de bord Stripe.
 *
 * C'est précisément pourquoi la partition est écrite plutôt qu'un `some()` ou
 * un `every()`. Un `some(estPass)` aurait fait sauter la synchronisation
 * d'offre d'un abonnement qui en porte une — le commerçant serait retombé au
 * plan d'entrée. Un `every(estPass)` aurait envoyé le prix de pass dans
 * `resolveStripeEntitlements`, donc 500 en boucle. Les deux réponses naïves
 * sont fausses, et chacune casse un côté différent.
 *
 * La conduite retenue par l'appelant (webhook) est donc : CHAQUE MOITIÉ SUIT
 * SON CHEMIN — les prix d'offre vont à la synchronisation d'abonnement (le plan
 * y est correctement résolu, puisqu'un prix d'offre est présent), les prix de
 * pass vont au chemin d'octroi. Ignorer l'une des deux prendrait de l'argent
 * sans ouvrir de droit, ou couperait un droit payé. Le cas est signalé, parce
 * qu'il ne devrait pas exister ; il n'est pas refusé, parce qu'il est payé.
 */
export function partitionnerPrix(priceIds: readonly string[]): PartitionPrix {
  const passes: PrixDePass[] = [];
  const autres: string[] = [];
  for (const priceId of priceIds) {
    const pass = passDepuisPrix(priceId);
    if (pass) passes.push(pass);
    else autres.push(priceId);
  }
  return { passes, autres };
}

export type VerdictCheckout =
  | {
      ok: true;
      offre: AddonOffer;
      priceId: string;
      mode: "payment" | "subscription";
      /** Jauge retenue, `null` hors pass à jauge. */
      capacity: number | null;
    }
  | { ok: false; erreur: string };

/**
 * Résout ce qu'il faut envoyer à Stripe pour vendre CET add-on.
 *
 * Le prix n'est jamais construit ici : seul un identifiant de price Stripe est
 * rendu, comme pour les offres et les packs SMS. Un montant écrit en TypeScript
 * serait un second prix, et deux prix finissent toujours par diverger.
 */
export function resolveAddonCheckout(
  entitlementDemande: string | null,
  jaugeDemandee: number | null = null,
): VerdictCheckout {
  const offre = ADDON_OFFERS.find((o) => o.entitlement === entitlementDemande);
  if (!offre) {
    // REFUSÉ plutôt que replié sur un add-on par défaut : un repli ferait
    // payer autre chose que ce que le commerçant a cliqué.
    return { ok: false, erreur: "Cette option n'existe pas." };
  }

  // ── LE TUNNEL AUTONOME EST FERMÉ AUX OPTIONS DE LIGNE ──
  //
  // Vitrine et Réserver ne se vendent qu'en item d'un abonnement en cours.
  // Les laisser passer ici serait pire qu'un refus : `modeCheckout` rendrait
  // `"subscription"` pour un mensuel, Stripe ouvrirait un SECOND abonnement,
  // et le commerçant recevrait deux prélèvements à deux dates — exactement le
  // défaut que `toggleSubscriptionOption` a été écrite pour fermer.
  //
  // Le refus est ici plutôt qu'à l'écran parce qu'un écran ne garde rien : il
  // évite seulement de proposer un bouton qui échouera.
  if (!offre.soldStandalone) {
    return {
      ok: false,
      erreur:
        `« ${offre.name} » s'ajoute à une offre en cours, depuis vos réglages `
        + `— elle ne s'achète pas séparément.`,
    };
  }

  // AUCUNE GARDE DE MODÈLE ICI, ET C'EST LE GESTE FINAL DE CE LOT.
  // `venteEnLigneOuverte` refusait `recurring-monthly` tant que le webhook ne
  // savait pas isoler un abonnement de pass (ADR-079). Il le sait : il
  // reconnaît ces prix par `partitionnerPrix`, ne les envoie jamais à
  // `apply_stripe_subscription_event_v2`, et révoque l'octroi `recurring` à la
  // résiliation. La garde n'avait plus rien à garder — et une garde qui ne
  // garde plus rien finit par empêcher ce qu'elle protégeait.
  //
  // Ce qui la REMPLACE n'est pas rien : « un seul récurrent vivant » est
  // désormais tenu par un index unique partiel (20260910120000), et le refus
  // de rachat est dit au commerçant par `createAddonCheckoutSession`.
  if (offre.billing.model === "capacity-pass") {
    const palier = offre.billing.steps.find((s) => s.maxPlayers === jaugeDemandee);
    if (!palier) {
      return { ok: false, erreur: "Choisissez une jauge parmi celles proposées." };
    }
    const priceId = optionalEnv(envPalier(offre.entitlement, palier.maxPlayers));
    if (!priceId) {
      return { ok: false, erreur: indisponible(offre) };
    }
    return {
      ok: true,
      offre,
      priceId,
      mode: modeCheckout(offre),
      capacity: palier.maxPlayers,
    };
  }

  const priceId = optionalEnv(envAddon(offre.entitlement));
  if (!priceId) return { ok: false, erreur: indisponible(offre) };

  return { ok: true, offre, priceId, mode: modeCheckout(offre), capacity: null };
}

function indisponible(offre: AddonOffer): string {
  // Le message dit au commerçant ce qu'il peut FAIRE, pas ce qui manque à la
  // configuration : « price ID absent » ne lui apprend rien et l'inquiète.
  return `« ${offre.name} » n'est pas encore disponible à la vente en ligne. Écrivez-nous et nous l'ouvrirons sur votre compte.`;
}

/**
 * Cet add-on est-il achetable en ligne aujourd'hui ?
 *
 * Lu par l'écran pour ne proposer un bouton que là où il aboutit. Un pass à
 * jauge est achetable dès qu'UN palier a son prix — l'écran n'affichera que
 * les paliers réellement vendus.
 *
 * ── CE QUE CETTE FONCTION NE DIT PAS, ET QU'ELLE NE DOIT PAS DIRE ──
 *
 * « Ce commerçant peut-il l'acheter MAINTENANT ? ». Un mensuel déjà actif est
 * achetable en ligne — il l'est simplement déjà, et c'est
 * `createAddonCheckoutSession` qui le lui dit, avec l'organisation sous la
 * main. Faire descendre cette question ici demanderait un accès base à une
 * fonction que l'écran appelle pour huit add-ons à chaque rendu.
 */
export function addonAchetableEnLigne(entitlement: Entitlement): boolean {
  const offre = ADDON_OFFERS.find((o) => o.entitlement === entitlement);
  if (!offre) return false;
  // Une option de LIGNE ne se vend pas par ce tunnel : sa disponibilité tient
  // à l'autre famille de variables, celle des items d'abonnement. Répondre
  // `true` ici afficherait un bouton « Acheter » qui mène au refus posé dans
  // `resolveAddonCheckout`.
  if (!offre.soldStandalone) return false;
  if (offre.billing.model === "capacity-pass") {
    return offre.billing.steps.some(
      (s) => optionalEnv(envPalier(entitlement, s.maxPlayers)) !== undefined,
    );
  }
  return optionalEnv(envAddon(entitlement)) !== undefined;
}

/** Paliers réellement vendus d'un pass à jauge, dans l'ordre du catalogue. */
export function paliersDisponibles(
  entitlement: Entitlement,
): readonly { maxPlayers: number; price: number }[] {
  const offre = ADDON_OFFERS.find((o) => o.entitlement === entitlement);
  if (!offre || offre.billing.model !== "capacity-pass") return [];
  return offre.billing.steps.filter(
    (s) => optionalEnv(envPalier(entitlement, s.maxPlayers)) !== undefined,
  );
}
