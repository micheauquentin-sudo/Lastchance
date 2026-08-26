/**
 * Libellés français et pictogrammes du module Méta-progression, partagés par
 * l'éditeur commerçant (`/dashboard/progression`) et le panneau joueur greffé au
 * parcours de jeu. Aucun « use client » : ce sont des constantes pures, donc
 * importables des deux côtés de la frontière serveur/client.
 *
 * Les clés répliquent EXACTEMENT les catalogues fermés de `@/lib/meta-progression`
 * (eux-mêmes miroirs des CHECK SQL) : un `Record` complet fait échouer le
 * typecheck si une valeur est ajoutée en base sans traduction ici.
 */

import type {
  ProgressionBadgeIcon,
  ProgressionEventName,
  ProgressionExperienceKind,
  ProgressionSeasonStatus,
  ProgressionSource,
} from "@/lib/meta-progression";

/** Pictogramme d'un badge (catalogue fermé côté SQL). */
export const PROGRESSION_BADGE_GLYPHS: Record<ProgressionBadgeIcon, string> = {
  star: "⭐",
  trophy: "🏆",
  spark: "✨",
  crown: "👑",
  compass: "🧭",
};

export const PROGRESSION_BADGE_ICON_LABELS: Record<
  ProgressionBadgeIcon,
  string
> = {
  star: "Étoile",
  trophy: "Trophée",
  spark: "Étincelle",
  crown: "Couronne",
  compass: "Boussole",
};

/**
 * Événement analytics consommé par une mission. Formulé côté COMMERÇANT : ces
 * libellés décrivent ce que le trigger compte, pas une action que le joueur
 * déclencherait — les missions avancent toutes seules.
 */
export const PROGRESSION_EVENT_LABELS: Record<ProgressionEventName, string> = {
  experience_started: "Une expérience est lancée",
  experience_completed: "Une expérience est terminée",
  reward_issued: "Un lot est gagné",
  reward_redeemed: "Un lot est retiré en caisse",
  player_returned: "Le joueur revient",
};

/** Familles d'expériences comptabilisables (miroir de PLAYER_EXPERIENCE_KINDS). */
export const PROGRESSION_EXPERIENCE_LABELS: Record<
  ProgressionExperienceKind,
  string
> = {
  campaign: "Jeux instantanés",
  hunt: "Chasse au QR",
  loyalty: "Passeport fidélité",
  jackpot: "Jackpot collectif",
  event: "Événement live",
  calendar: "Calendrier",
  referral: "Parrainage",
  contest: "Pronostics",
  quiz: "Quiz",
};

/** Origine d'acquisition : filtre FACULTATIF d'une mission. */
export const PROGRESSION_SOURCE_LABELS: Record<ProgressionSource, string> = {
  direct: "Accès direct",
  qr: "Scan d'un QR code",
  share: "Lien partagé",
  referral: "Parrainage",
  unknown: "Origine inconnue",
};

/**
 * Présentation des 4 statuts de saison. `hint` explique au commerçant ce que le
 * statut AUTORISE — c'est le seul endroit à toucher pour faire évoluer le
 * discours d'un statut.
 */
export interface ProgressionSeasonStatusMeta {
  label: string;
  hint: string;
  /** Classes du badge de statut (fond / bordure / texte). */
  badgeClassName: string;
}

export const PROGRESSION_SEASON_STATUS_META: Record<
  ProgressionSeasonStatus,
  ProgressionSeasonStatusMeta
> = {
  draft: {
    label: "Brouillon",
    hint: "Seul état où la configuration peut encore être complétée.",
    badgeClassName: "border-k-ink bg-white text-k-ink",
  },
  active: {
    label: "En cours",
    hint: "Vos joueurs progressent. La configuration est figée.",
    badgeClassName: "border-k-ink bg-k-green/30 text-k-ink",
  },
  ended: {
    label: "Terminée",
    hint: "La saison est close : les compteurs ne bougent plus.",
    badgeClassName: "border-k-ink bg-k-yellow text-k-ink",
  },
  archived: {
    label: "Archivée",
    hint: "Conservée pour l'historique, invisible des joueurs.",
    badgeClassName: "border-zinc-400 bg-zinc-100 text-zinc-600",
  },
};
