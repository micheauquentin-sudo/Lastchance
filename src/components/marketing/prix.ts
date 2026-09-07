import {
  formatMonthlyPrice,
  findAddonOffer,
  getPlanTier,
  PLAN_TIERS,
  type PlanTierId,
} from "@/lib/plans";
import type { Entitlement } from "@/platform/experiences/contract";

/**
 * PRIX DE VITRINE DU SITE PUBLIC — DÉRIVÉS, JAMAIS RETAPÉS.
 *
 * Les pages de `src/app/(public)` et les composants de
 * `src/components/marketing` portaient onze montants écrits à la main. Ils
 * étaient exacts le jour où ils ont été écrits, et rien ne les gardait : un
 * changement dans `src/lib/plans.ts` les laissait derrière, en silence, sur la
 * surface que voient les prospects.
 *
 * Ce module ne définit AUCUN prix. Il ne fait que lire la source de vérité
 * (`src/lib/plans.ts`) et la mettre dans la forme rédactionnelle qu'attend une
 * page marketing (« pass 29 € », « option 20 €/mois », « dès 29 €/mois »),
 * là où `formatAddonPrice` produit une étiquette de grille tarifaire.
 *
 * Les accesseurs LÈVENT quand l'offre ou l'option n'existe plus. C'est
 * volontaire : ces pages sont rendues statiquement, donc l'erreur tombe au
 * build plutôt que d'afficher un prix vide à un prospect.
 */

/** Prix de vitrine mensuel d'une offre, en euros. */
export function prixOffre(id: PlanTierId): number {
  return getPlanTier(id).priceMonthly;
}

/** « 59 €/mois » pour une offre. */
export function prixOffreMensuel(id: PlanTierId): string {
  return formatMonthlyPrice(getPlanTier(id));
}

/** Prix d'entrée de la gamme, en euros — l'offre la moins chère du catalogue. */
export const PRIX_ENTREE: number = Math.min(
  ...PLAN_TIERS.map((tier) => tier.priceMonthly),
);

/** « 29 € » — le prix d'entrée seul, pour les accroches. */
export const PRIX_ENTREE_EUROS = `${PRIX_ENTREE} €`;

/** « 29 €/mois » — le prix d'entrée mensualisé, pour les accroches. */
export const PRIX_ENTREE_MENSUEL = `${PRIX_ENTREE} €/mois`;

function addonOuLeve(entitlement: Entitlement) {
  const addon = findAddonOffer(entitlement);
  if (!addon) {
    throw new Error(
      `Aucune option « ${entitlement} » dans ADDON_OFFERS : le site public annonce un prix qui n'existe plus.`,
    );
  }
  return addon;
}

/** Prix mensuel d'une option récurrente, en euros. */
export function prixOptionMensuelle(entitlement: Entitlement): number {
  const addon = addonOuLeve(entitlement);
  if (addon.billing.model !== "recurring-monthly") {
    throw new Error(
      `L'option « ${entitlement} » n'est pas facturée au mois (${addon.billing.model}).`,
    );
  }
  return addon.billing.priceMonthly;
}

/** Prix d'un pass à achat unique (fenêtre d'usage ou compétition), en euros. */
export function prixPass(entitlement: Entitlement): number {
  const addon = addonOuLeve(entitlement);
  if (
    addon.billing.model !== "one-off-window" &&
    addon.billing.model !== "single-competition"
  ) {
    throw new Error(
      `L'option « ${entitlement} » n'est pas un pass à achat unique (${addon.billing.model}).`,
    );
  }
  return addon.billing.price;
}

/** Prix du plus petit palier d'un pass à jauge (« pass soirée dès 9 € »). */
export function prixPassPremierPalier(entitlement: Entitlement): number {
  const addon = addonOuLeve(entitlement);
  if (addon.billing.model !== "capacity-pass") {
    throw new Error(
      `L'option « ${entitlement} » n'est pas un pass à jauge (${addon.billing.model}).`,
    );
  }
  const premier = addon.billing.steps[0];
  if (!premier) {
    throw new Error(`Le pass « ${entitlement} » n'a plus aucun palier de jauge.`);
  }
  return premier.price;
}
