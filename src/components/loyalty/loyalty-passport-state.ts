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
  /** Seuil (en POINTS) du niveau visé (null si or). */
  nextThreshold: number | null;
  /** Points restants pour l'atteindre (0 si or). */
  remaining: number;
  /** Avancement dans le palier courant, borné [0, 1]. */
  ratio: number;
}

/**
 * Progression vers le niveau suivant, EN POINTS.
 *
 * Le premier paramètre est le CUMUL GAGNÉ (`points_earned_total`), jamais le
 * solde : le rang se mérite une fois pour toutes, il ne se reprend pas quand
 * le client dépense. Bornes des seuils supposées cohérentes (0 < silver <
 * gold, garanti par la validation serveur) mais tolérantes : un dénominateur
 * nul retombe sur un ratio plein plutôt que sur NaN.
 */
export function loyaltyTierProgress(
  pointsEarnedTotal: number,
  silverThreshold: number,
  goldThreshold: number,
  tier: LoyaltyTier,
): LoyaltyTierProgress {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const safe = Math.max(0, pointsEarnedTotal);

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

export interface LoyaltyPointsGoal {
  /** Prix du premier palier que le solde ne couvre PAS encore (null : tous couverts). */
  nextCost: number | null;
  /** Points manquants pour l'atteindre (0 si aucun). */
  missing: number;
  /** Avancement depuis le palier abordable précédent, borné [0, 1]. */
  ratio: number;
  /** Nombre de paliers que le solde couvre déjà — ce qui est achetable MAINTENANT. */
  affordable: number;
}

/**
 * ── POURQUOI CE N'EST PLUS UNE CARTE DE TAMPONS ──
 *
 * L'écran affichait une carte à cases : « ✓ ✓ ○ ○ ○ », une case par visite
 * jusqu'au prochain palier. Elle disait une vérité simple tant que le compteur
 * ne faisait que monter.
 *
 * Le solde, lui, DESCEND à chaque échange. Une carte à cases se serait donc
 * VIDÉE après un achat : le client aurait vu des tampons qu'il avait bel et
 * bien gagnés lui être repris à l'écran, à l'instant même où il retirait son
 * cadeau. Une case cochée est une promesse d'irréversibilité — c'est tout son
 * intérêt — et la monnaie ne peut pas la tenir. Aucun réglage de la carte n'y
 * change quoi que ce soit : le défaut n'est pas dans le dessin, il est dans ce
 * que le dessin AFFIRME.
 *
 * Elle est donc remplacée par une jauge continue vers le prochain cadeau
 * ABORDABLE. Une jauge qui redescend ne trahit personne : elle montre un solde,
 * et un solde se dépense. Ce que la carte apportait — « il me manque combien ? »
 * — est conservé, en points, et c'est la seule chose que le client demandait.
 *
 * @param pointsBalance le SOLDE dépensable (jamais le cumul).
 * @param milestoneCosts prix des paliers, en points, ordre libre.
 */
export function loyaltyPointsGoal(
  pointsBalance: number,
  milestoneCosts: number[],
): LoyaltyPointsGoal {
  const safe = Math.max(0, pointsBalance);
  const sorted = [...new Set(milestoneCosts.filter((n) => n > 0))].sort(
    (a, b) => a - b,
  );

  const affordable = sorted.filter((n) => n <= safe).length;
  const nextCost = sorted.find((n) => n > safe) ?? null;
  if (nextCost === null) {
    return { nextCost: null, missing: 0, ratio: 1, affordable };
  }

  // Base de la jauge : le dernier palier déjà abordable (0 si aucun). Repartir
  // de zéro à chaque fois donnerait une jauge presque pleine en permanence dès
  // que les prix s'écartent.
  const from = sorted.filter((n) => n <= safe).pop() ?? 0;
  const span = nextCost - from;
  return {
    nextCost,
    missing: Math.max(0, nextCost - safe),
    ratio: span > 0 ? Math.max(0, Math.min(1, (safe - from) / span)) : 1,
    affordable,
  };
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

/**
 * Pourquoi un TOUR DE ROUE OFFERT n'est pas jouable ici et maintenant. Chaque
 * cas a son message : le joueur doit savoir s'il a perdu quelque chose ou non.
 *
 *  · `consumed`      — tour déjà joué (le grant porte un `consumed_at`) ;
 *  · `out_of_stock`  — palier atteint mais quota de tours offerts épuisé :
 *                      AUCUN tour n'a été émis (record_loyalty_stamp teste le
 *                      stock avant d'émettre, sur `spin` comme sur `lot`
 *                      depuis 20260725200000) ;
 *  · `closed`        — campagne de la roue cible fermée (statut, dates ou
 *                      créneau horaire) : consume_loyalty_spin_grant répond
 *                      `unavailable` SANS consommer le grant ;
 *  · `no_prize`      — la roue n'a aucun lot tirable par un tour offert (lots
 *                      illimités exclus du tirage) : `no_prize`, grant NON
 *                      consommé lui aussi ;
 *  · `missing_wheel` — roue cible introuvable (supprimée) ;
 *  · `failed`        — l'action a refusé (cadence, réseau, indisponibilité).
 *
 * Point commun aux quatre derniers : le tour reste sur le passeport. Le dire
 * explicitement est la seule façon d'éviter qu'un joueur croie l'avoir perdu.
 */
export type LoyaltySpinBlock =
  | "consumed"
  | "out_of_stock"
  | "closed"
  | "no_prize"
  | "missing_wheel"
  | "failed";

export function messageForSpinBlock(block: LoyaltySpinBlock): LoyaltyStateMessage {
  switch (block) {
    case "consumed":
      return {
        tone: "info",
        title: "Tour de roue déjà utilisé",
        body: null,
      };
    case "out_of_stock":
      return {
        tone: "warning",
        title: "Tours offerts épuisés",
        body: "Ce palier a distribué tous ses tours offerts. Présentez-vous au comptoir : le commerçant saura vous accueillir.",
      };
    case "closed":
      return {
        tone: "warning",
        title: "Roue fermée pour le moment",
        body: "Le jeu de ce commerce n'est pas ouvert en ce moment. Votre tour offert est conservé : revenez le lancer plus tard.",
      };
    case "no_prize":
      return {
        tone: "warning",
        title: "Aucun lot à distribuer pour l'instant",
        body: "La roue n'a plus de lot à donner. Votre tour offert est conservé : revenez le lancer plus tard.",
      };
    case "missing_wheel":
      return {
        tone: "warning",
        title: "Tour de roue indisponible",
        body: "Ce tour de roue n'est pas disponible pour le moment. Présentez-vous au comptoir.",
      };
    case "failed":
    default:
      return {
        tone: "warning",
        title: "Le tour n'a pas pu être lancé",
        body: "Rien n'est perdu : votre tour offert reste sur votre passeport, vous pourrez le lancer plus tard.",
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
