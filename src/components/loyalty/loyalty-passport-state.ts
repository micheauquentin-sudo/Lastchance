/**
 * Cœur « pur » de l'affichage du Passeport de fidélité côté joueur : niveau
 * (bronze/argent/or), progression vers le niveau suivant, fenêtre de la carte
 * de tampons et messages d'état d'un tampon. Aucune dépendance réseau ni
 * server-only — testable en isolation (Vitest), miroir de hunts/hunt-state.ts.
 */

import type { LoyaltyStampState, LoyaltyTier } from "@/types/database";

export type LoyaltyMessageTone = "success" | "info" | "warning" | "error";

export interface LoyaltyStateMessage {
  tone: LoyaltyMessageTone;
  title: string;
  body: string | null;
}

/** Habillage visuel d'un niveau (libellé, emoji, classes DA « Kermesse »). */
export interface LoyaltyTierMeta {
  tier: LoyaltyTier;
  label: string;
  emoji: string;
  /** Pastille du badge (fond + texte). */
  badgeClass: string;
  /** Couleur d'accent (barres, jauge) — hex, sûr sur fond crème. */
  accent: string;
}

const TIER_META: Record<LoyaltyTier, LoyaltyTierMeta> = {
  bronze: {
    tier: "bronze",
    label: "Bronze",
    emoji: "🥉",
    badgeClass: "bg-[#d99e6b] text-k-ink",
    accent: "#d99e6b",
  },
  silver: {
    tier: "silver",
    label: "Argent",
    emoji: "🥈",
    badgeClass: "bg-[#ccd3dc] text-k-ink",
    accent: "#9aa6b4",
  },
  gold: {
    tier: "gold",
    label: "Or",
    emoji: "🥇",
    badgeClass: "bg-k-yellow text-k-ink",
    accent: "#e0a92e",
  },
};

/** Habillage d'un niveau donné (toujours défini). */
export function loyaltyTierMeta(tier: LoyaltyTier): LoyaltyTierMeta {
  return TIER_META[tier] ?? TIER_META.bronze;
}

/** Les trois niveaux dans l'ordre, pour la frise de progression. */
export const LOYALTY_TIERS: readonly LoyaltyTier[] = ["bronze", "silver", "gold"];

export interface LoyaltyTierProgress {
  tier: LoyaltyTier;
  /** Niveau visé (null si déjà au niveau or). */
  nextTier: LoyaltyTier | null;
  /** Seuil (en visites) du niveau visé (null si or). */
  nextThreshold: number | null;
  /** Visites restantes pour l'atteindre (0 si or). */
  remaining: number;
  /** Avancement dans le palier courant, borné [0, 1]. */
  ratio: number;
}

/**
 * Progression vers le niveau suivant. Bornes des seuils supposées cohérentes
 * (0 < silver < gold, garanti par la validation serveur) mais tolérantes : un
 * dénominateur nul retombe sur un ratio plein plutôt que sur NaN.
 */
export function loyaltyTierProgress(
  visitCount: number,
  silverThreshold: number,
  goldThreshold: number,
  tier: LoyaltyTier,
): LoyaltyTierProgress {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const safe = Math.max(0, visitCount);

  if (tier === "gold") {
    return { tier, nextTier: null, nextThreshold: null, remaining: 0, ratio: 1 };
  }
  if (tier === "silver") {
    const span = goldThreshold - silverThreshold;
    return {
      tier,
      nextTier: "gold",
      nextThreshold: goldThreshold,
      remaining: Math.max(0, goldThreshold - safe),
      ratio: span > 0 ? clamp((safe - silverThreshold) / span) : 1,
    };
  }
  return {
    tier,
    nextTier: "silver",
    nextThreshold: silverThreshold,
    remaining: Math.max(0, silverThreshold - safe),
    ratio: silverThreshold > 0 ? clamp(safe / silverThreshold) : 1,
  };
}

export interface LoyaltyStampWindow {
  /** Cases de la carte pour le palier en cours (position réelle de visite). */
  cells: Array<{ position: number; filled: boolean }>;
  /** Borne basse de la fenêtre (palier précédent, ou 0). */
  windowStart: number;
  /** Palier visé (null si tous les paliers sont dépassés). */
  windowEnd: number | null;
  /** Visites restantes avant le prochain palier (0 si aucun). */
  remaining: number;
  /** Fenêtre trop large pour un rendu en cases : l'UI bascule sur une jauge. */
  compact: boolean;
}

/**
 * Fenêtre de la « carte de tampons » : cases entre le palier précédent et le
 * prochain palier, remplies jusqu'au compteur courant. Au-delà du dernier
 * palier, la fenêtre se ferme (windowEnd null). Une fenêtre trop grande pour
 * être dessinée (> maxCells) est signalée `compact` pour un repli en jauge.
 *
 * @param milestoneVisitCounts nombres de visites des paliers (ordre libre).
 */
export function loyaltyStampWindow(
  visitCount: number,
  milestoneVisitCounts: number[],
  maxCells = 12,
): LoyaltyStampWindow {
  const safe = Math.max(0, visitCount);
  const sorted = [...new Set(milestoneVisitCounts.filter((n) => n > 0))].sort(
    (a, b) => a - b,
  );

  const nextEnd = sorted.find((n) => n > safe) ?? null;
  const windowStart = sorted.filter((n) => n <= safe).pop() ?? 0;

  if (nextEnd === null) {
    return {
      cells: [],
      windowStart,
      windowEnd: null,
      remaining: 0,
      compact: false,
    };
  }

  const size = nextEnd - windowStart;
  const remaining = Math.max(0, nextEnd - safe);
  if (size > maxCells) {
    return { cells: [], windowStart, windowEnd: nextEnd, remaining, compact: true };
  }

  const cells = Array.from({ length: size }, (_, i) => {
    const position = windowStart + i + 1;
    return { position, filled: position <= safe };
  });
  return { cells, windowStart, windowEnd: nextEnd, remaining, compact: false };
}

/**
 * Message affiché après un tampon en mode rotating_code, selon l'état renvoyé
 * par la RPC record_loyalty_stamp. Valeurs dynamiques passées en paramètre
 * pour rester déterministe. `unavailable` reste volontairement générique
 * (aucun oracle sur le motif d'indisponibilité).
 */
export function messageForStampState(
  state: LoyaltyStampState,
  opts: { retryInSeconds?: number | null } = {},
): LoyaltyStateMessage {
  switch (state) {
    case "stamped":
      return {
        tone: "success",
        title: "Visite validée !",
        body: "Un tampon de plus sur votre carte de fidélité.",
      };
    case "invalid_code":
      return {
        tone: "error",
        title: "Code incorrect",
        body: "Ce code n'est pas valide, ou il a déjà changé. Regardez l'écran du comptoir et réessayez.",
      };
    case "too_soon": {
      const seconds = opts.retryInSeconds ?? null;
      return {
        tone: "warning",
        title: "Vous avez déjà tamponné",
        body:
          seconds && seconds > 0
            ? `Revenez tamponner dans ${formatDelay(seconds)}.`
            : "Une seule visite compte par période. Revenez un peu plus tard.",
      };
    }
    case "unavailable":
    default:
      return {
        tone: "error",
        title: "Passeport indisponible",
        body: "Ce passeport de fidélité n'est pas accessible pour le moment.",
      };
  }
}

/** Délai lisible en français court (« 3 h », « 12 min », « 45 s »). */
export function formatDelay(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 3600) {
    const h = Math.round(s / 3600);
    return `${h} h`;
  }
  if (s >= 60) {
    const m = Math.round(s / 60);
    return `${m} min`;
  }
  return `${s} s`;
}
