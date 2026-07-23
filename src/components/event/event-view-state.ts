/**
 * Cœur « pur » de l'affichage du Mode événement en direct : mapping phase →
 * vue, calcul du chrono restant (purement visuel), répartition des votes en
 * pourcentages, tri du classement et libellés des types de question. Aucune
 * dépendance réseau ni server-only — testable en isolation (Vitest), miroir de
 * jackpot-state.ts.
 *
 * Le chrono N'EST PAS autoritatif : le scoring se fait côté serveur au reveal.
 * Ces helpers ne servent qu'à animer l'écran et le téléphone.
 */

import type {
  EventDistributionEntry,
  EventLeaderboardEntry,
} from "@/lib/event";
import type { EventQuestionType, EventSessionPhase } from "@/types/database";

// ────────────────────────────────────────────────────────────
// Mapping phase → vue affichée
// ────────────────────────────────────────────────────────────

/** Vue de haut niveau rendue par l'écran / le téléphone selon la phase. */
export type EventView =
  | "lobby"
  | "question"
  | "locked"
  | "reveal"
  | "leaderboard"
  | "ended";

/**
 * Réduit une phase de la machine à états à la vue à rendre. `question_active`
 * et `question_locked` partagent l'écran de question (la seconde fige la saisie),
 * mais restent deux vues distinctes pour couper le chrono et l'entrée joueur.
 */
export function viewForPhase(phase: EventSessionPhase): EventView {
  switch (phase) {
    case "question_active":
      return "question";
    case "question_locked":
      return "locked";
    case "reveal":
      return "reveal";
    case "leaderboard":
      return "leaderboard";
    case "ended":
      return "ended";
    case "lobby":
    default:
      return "lobby";
  }
}

// ────────────────────────────────────────────────────────────
// Chrono visuel du compte à rebours
// ────────────────────────────────────────────────────────────

export interface EventCountdown {
  /** Secondes restantes, bornées [0, timeLimit]. */
  secondsLeft: number;
  /** Millisecondes restantes, bornées [0, timeLimit×1000]. */
  msLeft: number;
  /** Fraction écoulée [0, 1] (1 = temps entièrement écoulé). */
  elapsedRatio: number;
  /** Fraction restante [0, 1] (largeur d'une barre de chrono). */
  remainingRatio: number;
  /** Le temps imparti est-il écoulé ? */
  expired: boolean;
}

/**
 * Calcule le compte à rebours d'une question depuis l'instant de lancement
 * serveur et la fenêtre de la question. Purement visuel. Tolérant : un
 * startedAt absent ou illisible, un timeLimit nul → chrono « plein » non expiré
 * (l'écran n'affiche pas de barre trompeuse). Jamais de NaN, jamais de valeur
 * hors bornes.
 */
export function computeCountdown(
  startedAt: string | null,
  timeLimitSeconds: number,
  nowMs: number,
): EventCountdown {
  const limit = Math.max(0, Math.trunc(timeLimitSeconds));
  const limitMs = limit * 1000;

  const startMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  if (Number.isNaN(startMs) || limitMs <= 0) {
    return {
      secondsLeft: limit,
      msLeft: limitMs,
      elapsedRatio: 0,
      remainingRatio: 1,
      expired: false,
    };
  }

  const msLeft = Math.max(0, Math.min(limitMs, startMs + limitMs - nowMs));
  const remainingRatio = limitMs > 0 ? msLeft / limitMs : 0;
  return {
    secondsLeft: Math.ceil(msLeft / 1000),
    msLeft,
    elapsedRatio: 1 - remainingRatio,
    remainingRatio,
    expired: msLeft <= 0,
  };
}

// ────────────────────────────────────────────────────────────
// Répartition des votes (barres %) — sondage / reveal
// ────────────────────────────────────────────────────────────

export interface EventDistributionBar {
  optionId: string;
  label: string;
  position: number;
  votes: number;
  /** Pourcentage entier [0, 100] du total des votes (0 si aucun vote). */
  percent: number;
  /** Cette option a-t-elle le plus de voix ? (ex æquo → toutes marquées). */
  isTop: boolean;
}

export interface EventDistribution {
  bars: EventDistributionBar[];
  totalVotes: number;
}

/**
 * Convertit la répartition brute en barres triées par position, avec un
 * pourcentage entier par option et le repérage du (des) maximum(s). Tolérant à
 * un total nul (aucune division par zéro, tous à 0 %). Ne suppose aucun ordre
 * en entrée : trie par position pour un rendu stable.
 */
export function computeDistribution(
  distribution: EventDistributionEntry[] | null,
): EventDistribution {
  const entries = distribution ?? [];
  const totalVotes = entries.reduce((sum, e) => sum + Math.max(0, e.votes), 0);
  const maxVotes = entries.reduce((m, e) => Math.max(m, Math.max(0, e.votes)), 0);

  const bars = [...entries]
    .sort((a, b) => a.position - b.position)
    .map((e) => {
      const votes = Math.max(0, e.votes);
      return {
        optionId: e.optionId,
        label: e.label,
        position: e.position,
        votes,
        percent: totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0,
        isTop: maxVotes > 0 && votes === maxVotes,
      };
    });

  return { bars, totalVotes };
}

// ────────────────────────────────────────────────────────────
// Classement : tri stable
// ────────────────────────────────────────────────────────────

/**
 * Trie le classement par rang croissant (le serveur fait foi sur le rang) ;
 * départage les rangs égaux par score décroissant puis pseudo, pour un ordre
 * d'affichage déterministe. Renvoie une nouvelle liste (n'altère pas l'entrée).
 */
export function sortLeaderboard(
  entries: EventLeaderboardEntry[],
): EventLeaderboardEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.rank - b.rank ||
      b.score - a.score ||
      a.pseudo.localeCompare(b.pseudo, "fr"),
  );
}

/** Les trois premiers du classement (podium), déjà triés. */
export function podiumEntries(
  entries: EventLeaderboardEntry[],
): EventLeaderboardEntry[] {
  return sortLeaderboard(entries).slice(0, 3);
}

// ────────────────────────────────────────────────────────────
// Libellés des types de question (écran + éditeur)
// ────────────────────────────────────────────────────────────

export interface EventQuestionTypeMeta {
  label: string;
  /** Explication courte (une ligne) pour l'éditeur. */
  hint: string;
  emoji: string;
}

const QUESTION_TYPE_META: Record<EventQuestionType, EventQuestionTypeMeta> = {
  quiz: {
    label: "Quiz",
    hint: "Une bonne réponse à désigner : les joueurs marquent des points, d'autant plus vite qu'ils répondent tôt.",
    emoji: "🧠",
  },
  poll: {
    label: "Sondage",
    hint: "Aucune bonne réponse : on affiche la répartition des votes en direct, sans score.",
    emoji: "📊",
  },
  prono: {
    label: "Pronostic",
    hint: "La bonne réponse est désignée au moment de la révélation (ex. : résultat d'un match) — vous la choisissez en direct.",
    emoji: "🎯",
  },
};

export function eventQuestionTypeMeta(
  type: EventQuestionType,
): EventQuestionTypeMeta {
  return QUESTION_TYPE_META[type] ?? QUESTION_TYPE_META.quiz;
}

/** Ordre d'affichage canonique des types dans l'éditeur. */
export const EVENT_QUESTION_TYPES: readonly EventQuestionType[] = [
  "quiz",
  "poll",
  "prono",
] as const;

// ────────────────────────────────────────────────────────────
// Cadence de polling (repli primaire, cf. brief backend)
// ────────────────────────────────────────────────────────────

/** Intervalle de polling de l'état public (ms) — suspendu onglet masqué. */
export const EVENT_POLL_MS = 2500;
