import {
  cheapestTierFor,
  findAddonOffer,
  formatAddonPrice,
  formatMonthlyPrice,
  getPlanTier,
  type AddonOffer,
  type PlanTier,
} from "@/lib/plans";
import {
  EXPERIENCE_CATALOG,
  MODULE_CATALOG,
} from "@/platform/experiences/catalog";
import type { Entitlement } from "@/platform/experiences/contract";

export interface PublishOffersSummary {
  entitlement: Entitlement;
  moduleLabel: string;
  /** Add-on achetable seul (sans abonnement), null si inexistant ou lié à un abonnement. */
  standaloneAddon: {
    offer: AddonOffer;
    priceLabel: string;
  } | null;
  /** Option uniquement ajoutable en ligne d'un abonnement existant (ex: Vitrine, Moments, Réservation). */
  subscriptionLineAddon: {
    offer: AddonOffer;
    priceLabel: string;
  } | null;
  /** Offre d'abonnement la moins chère incluant ce module. */
  cheapestTier: {
    tier: PlanTier;
    priceLabel: string;
  } | null;
  /** Offre « La Totale », proposée en alternative si différente de `cheapestTier`. */
  fullTier: {
    tier: PlanTier;
    priceLabel: string;
  } | null;
}

/**
 * Libellé commercial du module pour la modale de publication.
 * Dérivé des catalogues produit ; repli propre sur « Jeux instantanés » pour `core`.
 */
export function resolveModuleLabel(entitlement: Entitlement): string {
  const fromCatalog = [...EXPERIENCE_CATALOG, ...MODULE_CATALOG].find(
    (entry) => entry.entitlement === entitlement,
  );
  if (fromCatalog) return fromCatalog.label;
  return "Jeux instantanés";
}

/**
 * Sélectionne les 2 à 3 offres ciblées à afficher quand un commerçant tente
 * de publier un module sans droit actif — jamais tout le catalogue d'un coup,
 * afin d'éviter la paralysie du choix.
 */
export function buildPublishOffers(
  entitlement: Entitlement,
): PublishOffersSummary {
  const addon = findAddonOffer(entitlement);
  const standaloneAddon =
    addon && addon.soldStandalone
      ? { offer: addon, priceLabel: formatAddonPrice(addon) }
      : null;
  const subscriptionLineAddon =
    addon && !addon.soldStandalone
      ? { offer: addon, priceLabel: formatAddonPrice(addon) }
      : null;

  const cheapest = cheapestTierFor(entitlement);
  const cheapestTier = cheapest
    ? { tier: cheapest, priceLabel: formatMonthlyPrice(cheapest) }
    : null;

  const full = getPlanTier("full");
  const fullTier =
    cheapest?.id !== full.id
      ? { tier: full, priceLabel: formatMonthlyPrice(full) }
      : null;

  return {
    entitlement,
    moduleLabel: resolveModuleLabel(entitlement),
    standaloneAddon,
    subscriptionLineAddon,
    cheapestTier,
    fullTier,
  };
}
