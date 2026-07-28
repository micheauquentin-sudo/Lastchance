import { EXPERIENCE_CATALOG } from "@/platform/experiences/catalog";
import type { Entitlement } from "@/platform/experiences/contract";

/**
 * CATALOGUE D'OFFRES — source de vérité du packaging.
 *
 * Ce module est **descriptif**, jamais monétaire : il dit ce qu'une offre
 * contient, ce qu'elle vaut à l'affichage et vers quoi elle mène. Le montant
 * réellement facturé vient toujours du `price` Stripe désigné par les
 * variables d'environnement (voir `getPlanPriceId` dans `@/lib/stripe`) —
 * aucun chemin de code ne construit un montant à partir d'ici : les
 * paramètres Stripe qui permettraient de facturer un montant ad hoc sont
 * interdits dans `src/`, garde exécutable dans plans.test.ts.
 *
 * `priceMonthly` est donc un prix **de vitrine** : il sert à afficher l'offre
 * au commerçant et à estimer le MRR au back-office. S'il diverge du price
 * Stripe, c'est l'affichage qui ment, pas la facture.
 *
 * Pur (aucun accès env, aucun `server-only`) : importable depuis un composant
 * serveur comme depuis un composant client.
 */

/**
 * Version du packaging. À incrémenter à chaque changement de prix, de
 * périmètre ou de limite — les tests figent la proposition associée, et un
 * changement non intentionnel casse la suite au lieu de passer inaperçu.
 */
export const PACKAGING_VERSION = "2026-07-a";

export type PlanTierId = "core" | "engagement" | "live" | "full";

export interface PlanLimits {
  /**
   * Participants simultanés d'une session d'événement live. Limite
   * RÉELLEMENT appliquée en base par `event_participant_capacity()`
   * (migration 20260805190000_security_equity.sql) — le catalogue en est le
   * miroir d'affichage, et un test garde les deux alignés.
   */
  eventParticipants: 100 | 500 | 1000;
}

export interface PlanTier {
  id: PlanTierId;
  /** Identifiants historiques encore stockés dans `organizations.plan`. */
  legacyIds: readonly string[];
  name: string;
  tagline: string;
  /** Prix de vitrine mensuel en euros. Voir l'avertissement en tête. */
  priceMonthly: number;
  currency: "EUR";
  trialDays: number;
  /** Droits ouverts par l'offre — `core` est le socle commun. */
  entitlements: readonly Entitlement[];
  limits: PlanLimits;
  /** Capacités incluses qui ne passent pas par un droit (socle commun). */
  highlights: readonly string[];
}

/**
 * Ordre = ordre de prix croissant. `resolveStripeEntitlements` s'en sert
 * aussi comme ordre de précédence quand un abonnement porte plusieurs prix
 * d'offre : le plus haut gagne pour l'étiquette `organizations.plan`.
 *
 * L'échelle n'est PAS linéaire : Engagement (asynchrone, fidélisation) et
 * Live (temps réel, animation) sont deux offres parallèles, pas deux
 * paliers. Passer de l'une à l'autre retirerait des modules — d'où
 * `upgradeTargetsFor`, qui ne propose que des offres strictement plus
 * complètes ET plus chères.
 */
export const PLAN_TIERS: readonly PlanTier[] = [
  {
    id: "core",
    legacyIds: ["starter"],
    name: "Core",
    tagline: "Le jeu qui fait revenir vos clients, en libre-service.",
    priceMonthly: 29,
    currency: "EUR",
    trialDays: 7,
    entitlements: ["core"],
    limits: { eventParticipants: 100 },
    highlights: [
      "QR codes et roues illimités",
      "Lots remis en caisse avec code",
      "Studio créatif et affiches",
      "Emails automatiques et webhooks sortants",
    ],
  },
  {
    id: "engagement",
    legacyIds: [],
    name: "Engagement",
    tagline: "Installer l'habitude : fidélité, rendez-vous, bouche-à-oreille.",
    priceMonthly: 59,
    currency: "EUR",
    trialDays: 7,
    entitlements: ["core", "loyalty", "calendar", "referral", "hunts", "quiz"],
    limits: { eventParticipants: 100 },
    highlights: ["Tout Core", "Campagnes multi-modules sur la même clientèle"],
  },
  {
    id: "live",
    legacyIds: [],
    name: "Live & Events",
    tagline: "Animer une salle : soirées, compétitions, temps réel.",
    priceMonthly: 89,
    currency: "EUR",
    trialDays: 7,
    entitlements: ["core", "events", "pronostics", "jackpot", "quiz"],
    limits: { eventParticipants: 500 },
    highlights: [
      "Tout Core",
      "Écran de salle et télécommande organisateur",
      "500 participants par session live",
    ],
  },
  {
    id: "full",
    legacyIds: [],
    name: "Full Platform",
    tagline: "Toute la plateforme, sans arbitrage entre modules.",
    priceMonthly: 129,
    currency: "EUR",
    trialDays: 7,
    entitlements: [
      "core",
      "pronostics",
      "hunts",
      "loyalty",
      "jackpot",
      "events",
      "calendar",
      "quiz",
      "referral",
    ],
    limits: { eventParticipants: 1000 },
    highlights: [
      "Engagement + Live réunis",
      "1 000 participants par session live",
      "Accès à tout nouveau module inclus",
    ],
  },
] as const;

const DEFAULT_TIER = PLAN_TIERS[0];

/** Rang de l'offre dans l'échelle de prix (0 = la moins chère). */
export function planRank(tierId: PlanTierId): number {
  return PLAN_TIERS.findIndex((tier) => tier.id === tierId);
}

/** Offre correspondant à un identifiant courant ou historique, sinon null. */
export function findPlanTier(planId: string): PlanTier | null {
  return (
    PLAN_TIERS.find(
      (tier) => tier.id === planId || tier.legacyIds.includes(planId),
    ) ?? null
  );
}

/**
 * Même résolution, mais jamais nulle : un `organizations.plan` inconnu
 * (offre retirée du catalogue) retombe sur l'offre d'entrée plutôt que de
 * faire disparaître l'abonnement de l'écran.
 */
export function getPlanTier(planId: string): PlanTier {
  return findPlanTier(planId) ?? DEFAULT_TIER;
}

export function tierIncludes(tier: PlanTier, entitlement: Entitlement): boolean {
  return tier.entitlements.includes(entitlement);
}

/** L'offre `candidate` couvre-t-elle tout ce que couvre `reference` ? */
function coversAllOf(candidate: PlanTier, reference: readonly Entitlement[]): boolean {
  return reference.every((entitlement) => candidate.entitlements.includes(entitlement));
}

/** Offre la moins chère ouvrant ce droit — la cible d'upsell d'un module. */
export function cheapestTierFor(entitlement: Entitlement): PlanTier | null {
  return PLAN_TIERS.find((tier) => tierIncludes(tier, entitlement)) ?? null;
}

/**
 * Offre la moins chère couvrant l'ensemble des droits déjà détenus : sert à
 * proposer le regroupement quand un commerçant cumule des options plus cher
 * que l'offre qui les contient toutes.
 */
export function recommendedTierFor(
  entitlements: readonly Entitlement[],
): PlanTier | null {
  return PLAN_TIERS.find((tier) => coversAllOf(tier, entitlements)) ?? null;
}

/**
 * Montées en gamme proposables depuis une offre : strictement plus chères ET
 * strictement plus complètes. La double condition interdit de vendre comme
 * « upgrade » un changement qui ferait perdre un module (Engagement → Live).
 */
export function upgradeTargetsFor(tierId: PlanTierId): PlanTier[] {
  const current = getPlanTier(tierId);
  return PLAN_TIERS.filter(
    (candidate) =>
      candidate.id !== current.id &&
      candidate.priceMonthly > current.priceMonthly &&
      coversAllOf(candidate, current.entitlements),
  );
}

/** Droits gagnés en passant de `from` à `to` (vide si `to` n'apporte rien). */
export function entitlementsGainedBy(
  from: PlanTierId,
  to: PlanTierId,
): Entitlement[] {
  const source = getPlanTier(from);
  const target = getPlanTier(to);
  return target.entitlements.filter(
    (entitlement) => !source.entitlements.includes(entitlement),
  );
}

/** « 29 €/mois » — un seul endroit met le prix en forme. */
export function formatMonthlyPrice(tier: PlanTier): string {
  return `${tier.priceMonthly} €/mois`;
}

export interface PlanTierView {
  id: PlanTierId;
  name: string;
  tagline: string;
  priceLabel: string;
  priceMonthly: number;
  trialDays: number;
  /** Libellés des expériences incluses, dans l'ordre du catalogue produit. */
  experiences: string[];
  highlights: string[];
  /** Limites affichables, déjà formulées (vide si non pertinent). */
  limits: string[];
}

/**
 * Projection sérialisable d'une offre pour l'UI : les libellés d'expériences
 * viennent du catalogue produit (EXPERIENCE_CATALOG), jamais d'une liste
 * recopiée — un module ajouté au catalogue apparaît ici sans retouche.
 */
export function describeTier(tier: PlanTier): PlanTierView {
  const experiences = EXPERIENCE_CATALOG.filter((entry) =>
    tier.entitlements.includes(entry.entitlement),
  ).map((entry) => entry.label);

  const limits: string[] = [];
  if (tierIncludes(tier, "events")) {
    limits.push(
      `${tier.limits.eventParticipants} participants par session live`,
    );
  }

  return {
    id: tier.id,
    name: tier.name,
    tagline: tier.tagline,
    priceLabel: formatMonthlyPrice(tier),
    priceMonthly: tier.priceMonthly,
    trialDays: tier.trialDays,
    experiences,
    highlights: [...tier.highlights],
    limits,
  };
}
