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
 */
export function addonAchetableEnLigne(entitlement: Entitlement): boolean {
  const offre = ADDON_OFFERS.find((o) => o.entitlement === entitlement);
  if (!offre) return false;
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
