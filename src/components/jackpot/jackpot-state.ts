/**
 * Cœur « pur » de l'affichage du Jackpot collectif : progression de la jauge
 * PARTAGÉE, montant d'affichage croissant, messages d'état d'une participation
 * et présets de réglages (rotation, cooldown). Aucune dépendance réseau ni
 * server-only — testable en isolation (Vitest), miroir de
 * loyalty-passport-state.ts.
 */

import type { JackpotParticipationResult } from "@/lib/jackpot";
import type { JackpotDrawMode, JackpotValidationMode } from "@/types/database";

export type JackpotMessageTone = "success" | "info" | "warning" | "error";

export interface JackpotStateMessage {
  tone: JackpotMessageTone;
  title: string;
  body: string | null;
}

// ────────────────────────────────────────────────────────────
// Jauge partagée : progression vers l'objectif
// ────────────────────────────────────────────────────────────

export interface JackpotProgress {
  /** Avancement borné [0, 1] (1 si l'objectif est nul, jamais NaN). */
  ratio: number;
  /** Pourcentage entier [0, 100] pour l'affichage et aria-valuenow. */
  percent: number;
  /** Participations restantes avant l'objectif (0 si atteint). */
  remaining: number;
  /** L'objectif est-il atteint ? */
  reached: boolean;
}

/**
 * Progression de la jauge partagée vers l'objectif. Tolérante : un objectif nul
 * ou négatif retombe sur un ratio plein plutôt que sur NaN, un compteur négatif
 * est ramené à zéro.
 */
export function jackpotProgress(
  currentCount: number,
  threshold: number,
): JackpotProgress {
  const safeCount = Math.max(0, Math.trunc(currentCount));
  const safeThreshold = Math.max(0, Math.trunc(threshold));
  const remaining = Math.max(0, safeThreshold - safeCount);
  const ratio =
    safeThreshold > 0 ? Math.max(0, Math.min(1, safeCount / safeThreshold)) : 1;
  return {
    ratio,
    percent: Math.round(ratio * 100),
    remaining,
    reached: safeThreshold > 0 && safeCount >= safeThreshold,
  };
}

/**
 * Montant d'affichage (cosmétique) en euros, format français. Sans décimales si
 * le montant tombe juste, deux sinon. Le montant n'est PAS le lot réel (le lot
 * reste le lot fini de la campagne) : c'est un compteur qui « chauffe » la salle.
 */
export function formatJackpotAmount(cents: number): string {
  const euros = Math.max(0, Math.trunc(cents)) / 100;
  return euros.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: Number.isInteger(euros) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Délai lisible en français court (« 3 h », « 12 min », « 45 s »). */
export function formatJackpotDelay(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 3600) return `${Math.round(s / 3600)} h`;
  if (s >= 60) return `${Math.round(s / 60)} min`;
  return `${s} s`;
}

// ────────────────────────────────────────────────────────────
// Message d'état d'une participation
// ────────────────────────────────────────────────────────────

/**
 * Bannière affichée après une participation, selon le résultat typé de
 * record_jackpot_participation. Le code gagnant lui-même est présenté à part
 * (écran de gain) : ce message ne fait qu'annoncer l'issue. `unavailable` reste
 * volontairement générique (aucun oracle sur le motif d'indisponibilité).
 *
 * Un `recorded` porte plusieurs nuances, testées dans l'ordre :
 *  · gagnant           → la participation remporte le jackpot ;
 *  · seuil + rupture   → objectif atteint mais stock épuisé, aucun tirage ;
 *  · armé (rescan_win) → jackpot débloqué, gain instantané possible au prochain
 *                        passage (« retentez votre chance ») ;
 *  · enregistrée       → +1 vers l'objectif commun.
 */
export function messageForJackpotParticipation(
  result: JackpotParticipationResult,
): JackpotStateMessage {
  switch (result.state) {
    case "recorded":
      if (result.isWinner) {
        return {
          tone: "success",
          title: "🎉 Jackpot remporté !",
          body: "Gardez votre code de retrait — il est à présenter en caisse.",
        };
      }
      if (result.outOfStock) {
        return {
          tone: "warning",
          title: "Objectif atteint — lots épuisés",
          body: "Le jackpot est complet mais tous les lots sont déjà partis. Présentez-vous au comptoir : le commerçant saura vous accueillir.",
        };
      }
      if (result.armed) {
        return {
          tone: "info",
          title: "Jackpot débloqué !",
          body: "L'objectif est atteint : le prochain passage peut remporter le lot. Retentez votre chance !",
        };
      }
      return {
        tone: "success",
        title: "Participation enregistrée !",
        body: "Un pas de plus vers le jackpot collectif. Revenez et faites monter la cagnotte.",
      };
    case "invalid_code":
      return {
        tone: "error",
        title: "Code incorrect",
        body: "Ce code n'est pas valide, ou il a déjà changé. Regardez l'écran du comptoir et réessayez.",
      };
    case "too_soon": {
      const seconds = result.retryInSeconds ?? null;
      return {
        tone: "warning",
        title: "Vous venez déjà de participer",
        body:
          seconds && seconds > 0
            ? `Revenez participer dans ${formatJackpotDelay(seconds)}.`
            : "Une participation compte par période. Revenez un peu plus tard.",
      };
    }
    case "unavailable":
    default:
      return {
        tone: "error",
        title: "Jackpot indisponible",
        body: "Ce jackpot n'est pas accessible pour le moment.",
      };
  }
}

// ────────────────────────────────────────────────────────────
// Habillage des modes (page publique + éditeur commerçant)
// ────────────────────────────────────────────────────────────

/** Phrase d'explication d'un mode de résolution (une ligne, éditeur). */
export function jackpotDrawModeSummary(mode: JackpotDrawMode): string {
  switch (mode) {
    case "rescan_win":
      return "Une fois l'objectif atteint, le jackpot est « armé » : chaque nouvelle participation peut remporter le lot instantanément.";
    case "date_draw":
      return "Les participations remplissent la jauge jusqu'à une date de tirage : un gagnant est tiré au sort le jour dit.";
    case "threshold_draw":
    default:
      return "Dès que l'objectif de participations est atteint, un gagnant est tiré au sort parmi les participants du cycle.";
  }
}

/** Phrase d'explication d'un mode de validation (une ligne, éditeur). */
export function jackpotValidationModeSummary(mode: JackpotValidationMode): string {
  return mode === "rotating_code"
    ? "Un code à 6 chiffres s'affiche sur un écran au comptoir et change régulièrement ; le client le saisit pour participer."
    : "Le client présente le QR de sa page jackpot ; vous le scannez en caisse pour valider sa participation.";
}

// ────────────────────────────────────────────────────────────
// Présets de réglages (rotation du code, cooldown) — éditeur
// ────────────────────────────────────────────────────────────

/** Bornes de rotation du code tournant (miroir CHECK SQL 15..300 s). */
export const JACKPOT_PERIOD_MIN = 15;
export const JACKPOT_PERIOD_MAX = 300;
const PERIOD_CHOICES = [15, 30, 45, 60, 90, 120, 180, 240, 300];

/** Ramène une période enregistrée dans la plage autorisée [15, 300]. */
export function clampJackpotPeriod(seconds: number): number {
  if (!Number.isFinite(seconds)) return 60;
  return Math.min(JACKPOT_PERIOD_MAX, Math.max(JACKPOT_PERIOD_MIN, Math.trunc(seconds)));
}

export interface JackpotOption {
  value: number;
  label: string;
}

/** Options de rotation, la valeur courante toujours incluse et triée. */
export function jackpotPeriodOptions(current: number): JackpotOption[] {
  const values = [...new Set([...PERIOD_CHOICES, clampJackpotPeriod(current)])].sort(
    (a, b) => a - b,
  );
  return values.map((v) => ({ value: v, label: formatDurationLabel(v) }));
}

/** Durée lisible en français (« 7 jours », « 6 heures », « 15 min », « 45 s »). */
export function formatDurationLabel(seconds: number): string {
  const s = Math.max(0, Math.trunc(seconds));
  if (s >= 86400 && s % 86400 === 0) {
    const d = s / 86400;
    return `${d} jour${d > 1 ? "s" : ""}`;
  }
  if (s >= 3600 && s % 3600 === 0) {
    const h = s / 3600;
    return `${h} heure${h > 1 ? "s" : ""}`;
  }
  if (s >= 60 && s % 60 === 0) {
    return `${s / 60} min`;
  }
  return `${s} s`;
}

/** Planchers de cooldown (miroir jackpot_campaigns_cooldown_floor_check). */
const ROTATING_COOLDOWN_FLOOR = 300;
const STAFF_COOLDOWN_FLOOR = 300;

/**
 * Plancher de l'intervalle entre deux participations d'un même joueur, par mode
 * de validation : `max(2 × période, 300)` en code tournant (un code accepté sur
 * deux fenêtres ne doit pas valoir deux participations), 300 s en caisse.
 */
export function jackpotCooldownFloor(
  mode: JackpotValidationMode,
  periodSeconds: number,
): number {
  return mode === "rotating_code"
    ? Math.max(2 * clampJackpotPeriod(periodSeconds), ROTATING_COOLDOWN_FLOOR)
    : STAFF_COOLDOWN_FLOOR;
}

const COOLDOWN_CHOICES = [
  300, 900, 1800, 3600, 7200, 21600, 43200, 86400, 172800, 604800,
];

export interface ResolvedJackpotCooldown {
  /** Valeur retenue (remontée au plancher si nécessaire). */
  value: number;
  /** Options proposées (>= plancher), valeur courante incluse. */
  options: JackpotOption[];
  /** Plancher applicable au mode courant. */
  floorSeconds: number;
  /** La valeur d'entrée a-t-elle dû être relevée au plancher ? */
  adjusted: boolean;
}

/**
 * Résout l'intervalle de participation : filtre les options sous le plancher du
 * mode, remonte la valeur courante au plancher au besoin, et signale l'ajustement
 * (miroir de resolveLoyaltyCooldown).
 */
export function resolveJackpotCooldown(input: {
  mode: JackpotValidationMode;
  periodSeconds: number;
  cooldownSeconds: number;
}): ResolvedJackpotCooldown {
  const floorSeconds = jackpotCooldownFloor(input.mode, input.periodSeconds);
  const adjusted = input.cooldownSeconds < floorSeconds;
  const value = adjusted ? floorSeconds : input.cooldownSeconds;
  const values = [...new Set([...COOLDOWN_CHOICES, floorSeconds, value])]
    .filter((v) => v >= floorSeconds)
    .sort((a, b) => a - b);
  return {
    value,
    options: values.map((v) => ({ value: v, label: formatDurationLabel(v) })),
    floorSeconds,
    adjusted,
  };
}
