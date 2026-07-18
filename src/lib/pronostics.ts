/**
 * Cœur métier du module Pronostics : barème de points, classement,
 * récompenses par rang et identité joueur. Fonctions pures (testables),
 * miroir des colonnes jsonb de `contests` (scoring, rewards).
 */

import { createHash, randomBytes } from "node:crypto";

// ────────────────────────────────────────────────────────────
// Barème de points
// ────────────────────────────────────────────────────────────

export interface ContestScoring {
  /** Score exact trouvé. */
  exact: number;
  /** Bonne différence de buts/points (sans le score exact). */
  diff: number;
  /** Bon vainqueur (ou nul) seulement. */
  winner: number;
}

export const DEFAULT_SCORING: ContestScoring = { exact: 3, diff: 2, winner: 1 };

/** Borne de saisie des scores (miroir du CHECK SQL 0..99). */
export const MAX_SCORE = 99;

function scoringPoints(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 0 || value > 100) return null;
  return value;
}

/**
 * Lit la colonne jsonb `contests.scoring` sans jamais faire confiance à
 * sa forme (défauts sur toute valeur invalide).
 */
export function parseScoring(raw: unknown): ContestScoring {
  if (typeof raw !== "object" || raw === null) return DEFAULT_SCORING;
  const obj = raw as Record<string, unknown>;
  return {
    exact: scoringPoints(obj.exact) ?? DEFAULT_SCORING.exact,
    diff: scoringPoints(obj.diff) ?? DEFAULT_SCORING.diff,
    winner: scoringPoints(obj.winner) ?? DEFAULT_SCORING.winner,
  };
}

export interface MatchScore {
  home: number;
  away: number;
}

/**
 * Points d'un pronostic face au résultat réel. Un seul palier est payé,
 * le plus haut atteint : exact ⊃ diff ⊃ winner.
 * - exact : score exact
 * - diff : bonne différence (ex. prono 2-1, réel 3-2) — inclut le nul
 *   prédit avec le mauvais score (0-0 vs 2-2)
 * - winner : bon vainqueur (ou nul deviné) sans la différence
 */
export function scorePrediction(
  scoring: ContestScoring,
  actual: MatchScore,
  predicted: MatchScore,
): number {
  if (predicted.home === actual.home && predicted.away === actual.away) {
    return scoring.exact;
  }
  if (predicted.home - predicted.away === actual.home - actual.away) {
    return scoring.diff;
  }
  if (
    Math.sign(predicted.home - predicted.away) ===
    Math.sign(actual.home - actual.away)
  ) {
    return scoring.winner;
  }
  return 0;
}

// ────────────────────────────────────────────────────────────
// Récompenses par rang
// ────────────────────────────────────────────────────────────

export interface ContestReward {
  /** Rang de début (1 = premier). */
  from: number;
  /** Rang de fin inclus. */
  to: number;
  label: string;
}

/** Lit la colonne jsonb `contests.rewards` (entrées invalides ignorées). */
export function parseRewards(raw: unknown): ContestReward[] {
  if (!Array.isArray(raw)) return [];
  const rewards: ContestReward[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { from, to, label } = item as Record<string, unknown>;
    if (
      typeof from !== "number" || !Number.isInteger(from) || from < 1 ||
      typeof to !== "number" || !Number.isInteger(to) || to < from ||
      typeof label !== "string" || label.trim() === ""
    ) {
      continue;
    }
    rewards.push({ from, to, label: label.trim() });
  }
  return rewards;
}

/** Récompense attachée à un rang, null si aucune. */
export function rewardForRank(
  rewards: ContestReward[],
  rank: number,
): string | null {
  const hit = rewards.find((r) => rank >= r.from && rank <= r.to);
  return hit ? hit.label : null;
}

// ────────────────────────────────────────────────────────────
// Classement
// ────────────────────────────────────────────────────────────

export interface RankedPlayer<T> {
  player: T;
  points: number;
  /** Rang « compétition » : deux ex æquo partagent le rang (1, 2, 2, 4). */
  rank: number;
}

/**
 * Classe les joueurs par points décroissants avec gestion des ex æquo
 * (standard competition ranking). L'ordre d'entrée départage l'affichage
 * mais pas le rang.
 */
export function rankPlayers<T>(
  players: T[],
  pointsOf: (player: T) => number,
): RankedPlayer<T>[] {
  const sorted = [...players]
    .map((player) => ({ player, points: pointsOf(player) }))
    .sort((a, b) => b.points - a.points);

  const ranked: RankedPlayer<T>[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const rank =
      i > 0 && sorted[i].points === sorted[i - 1].points
        ? ranked[i - 1].rank
        : i + 1;
    ranked.push({ ...sorted[i], rank });
  }
  return ranked;
}

// ────────────────────────────────────────────────────────────
// Identité joueur : jeton navigateur → hash en base
// ────────────────────────────────────────────────────────────

/**
 * Jeton opaque remis au navigateur à l'inscription (cookie/localStorage
 * côté page publique). Seul son hash est stocké — un dump de la base ne
 * permet pas d'usurper un joueur.
 */
export function generatePlayerToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashPlayerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ────────────────────────────────────────────────────────────
// Fenêtre de pronostic
// ────────────────────────────────────────────────────────────

/** Un pronostic n'est modifiable que jusqu'au coup d'envoi. */
export function isPredictionOpen(
  kickoffAt: string | Date,
  now: Date = new Date(),
): boolean {
  return new Date(kickoffAt).getTime() > now.getTime();
}
