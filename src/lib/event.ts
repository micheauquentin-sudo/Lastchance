/**
 * Cœur métier « pur » du Mode événement en direct : mapping des jsonb renvoyés
 * par les RPC service_role (join_event_session, submit_event_answer,
 * event_public_state, machine à états) vers des résultats typés pour l'UI.
 * Fonctions testables sans accès base ni imports server-only (miroir de
 * src/lib/jackpot.ts).
 *
 * INVARIANT DE SÉCURITÉ #1 (voir migration 20260727120000) : la bonne réponse ne
 * fuit JAMAIS dans un payload joueur. Ce module NE LIT JAMAIS `is_correct` d'une
 * option, et n'expose `correctOptionId` QUE lorsque la phase vaut 'reveal' —
 * défense en profondeur redoublant le filtrage déjà opéré par event_public_state
 * (qui renvoie null hors reveal). Le mapping des options ne connaît que
 * id / label / position.
 */

import type {
  EventJoinState,
  EventQuestionType,
  EventSessionPhase,
  EventSessionStatus,
  EventSubmitState,
  EventTransitionState,
} from "@/types/database";

// ────────────────────────────────────────────────────────────
// Helpers défensifs (aucune confiance dans la forme du jsonb)
// ────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asQuestionType(value: unknown): EventQuestionType {
  return value === "poll" ? "poll" : value === "prono" ? "prono" : "quiz";
}

const SESSION_STATUSES: readonly EventSessionStatus[] = [
  "draft",
  "lobby",
  "live",
  "ended",
  "archived",
];
const SESSION_PHASES: readonly EventSessionPhase[] = [
  "lobby",
  "question_active",
  "question_locked",
  "reveal",
  "leaderboard",
  "ended",
];

function asStatus(value: unknown): EventSessionStatus {
  return SESSION_STATUSES.includes(value as EventSessionStatus)
    ? (value as EventSessionStatus)
    : "draft";
}

function asPhase(value: unknown): EventSessionPhase {
  return SESSION_PHASES.includes(value as EventSessionPhase)
    ? (value as EventSessionPhase)
    : "lobby";
}

// ────────────────────────────────────────────────────────────
// join_event_session
// ────────────────────────────────────────────────────────────

export interface EventJoinResult {
  state: EventJoinState;
  /** Joueur créé/rejoint (null hors `joined`). */
  player: { id: string; pseudo: string; avatar: string; score: number } | null;
  /** État courant de la session (null hors `joined`). */
  session: {
    id: string;
    status: EventSessionStatus;
    phase: EventSessionPhase;
  } | null;
}

const JOIN_STATES: readonly EventJoinState[] = [
  "unavailable",
  "invalid_pseudo",
  "joined",
];

export function mapEventJoin(raw: unknown): EventJoinResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: EventJoinState =
    stateRaw && (JOIN_STATES as string[]).includes(stateRaw)
      ? (stateRaw as EventJoinState)
      : "unavailable";

  const playerRec = root ? asRecord(root.player) : null;
  const sessionRec = root ? asRecord(root.session) : null;

  return {
    state,
    player:
      state === "joined" && playerRec
        ? {
            id: asString(playerRec.id) ?? "",
            pseudo: asString(playerRec.pseudo) ?? "",
            avatar: asString(playerRec.avatar) ?? "",
            score: asInt(playerRec.score) ?? 0,
          }
        : null,
    session:
      state === "joined" && sessionRec
        ? {
            id: asString(sessionRec.id) ?? "",
            status: asStatus(sessionRec.status),
            phase: asPhase(sessionRec.phase),
          }
        : null,
  };
}

// ────────────────────────────────────────────────────────────
// submit_event_answer — JAMAIS de justesse (invariant #1)
// ────────────────────────────────────────────────────────────

export interface EventSubmitResult {
  state: EventSubmitState;
}

const SUBMIT_STATES: readonly EventSubmitState[] = [
  "unavailable",
  "locked",
  "not_joined",
  "invalid_option",
  "already_answered",
  "recorded",
];

/**
 * Mappe le jsonb de submit_event_answer. La RPC ne renvoie QU'UN `state` neutre
 * (aucun `is_correct`, aucun point) : ce mapping le confirme en n'exposant que
 * l'état. Un jsonb non reconnu retombe sur `unavailable`.
 */
export function mapEventSubmit(raw: unknown): EventSubmitResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: EventSubmitState =
    stateRaw && (SUBMIT_STATES as string[]).includes(stateRaw)
      ? (stateRaw as EventSubmitState)
      : "unavailable";
  return { state };
}

// ────────────────────────────────────────────────────────────
// event_public_state — LA source unique de l'état public
// ────────────────────────────────────────────────────────────

/** Option telle que servie au public : JAMAIS de is_correct (invariant #1). */
export interface EventPublicOption {
  id: string;
  label: string;
  position: number;
}

/** Question courante côté écran / téléphone (sans aucune correction). */
export interface EventPublicQuestion {
  id: string;
  questionType: EventQuestionType;
  prompt: string;
  timeLimitSeconds: number;
  /** Instant de lancement serveur (référence du compte à rebours). */
  startedAt: string | null;
  options: EventPublicOption[];
}

export interface EventDistributionEntry {
  optionId: string;
  label: string;
  position: number;
  votes: number;
}

export interface EventLeaderboardEntry {
  pseudo: string;
  avatar: string;
  score: number;
  rank: number;
}

/** Vue « moi » : score/rang du joueur + son code s'il fait partie du podium. */
export interface EventYouState {
  score: number;
  rank: number;
  /** Lot remporté : rang du podium + code EVENT-… (null sinon). */
  win: { rank: number; code: string } | null;
}

export interface EventPublicSession {
  id: string;
  status: EventSessionStatus;
  phase: EventSessionPhase;
  joinCode: string;
  rewardLabel: string;
  rewardStock: number;
  rewardClaimedCount: number;
}

export interface EventPublicState {
  state: "ok" | "unavailable";
  session: EventPublicSession | null;
  question: EventPublicQuestion | null;
  /** Bonne réponse UNIQUEMENT en phase reveal — null partout ailleurs. */
  correctOptionId: string | null;
  /** Répartition des votes — null avant la fermeture de la fenêtre (lock). */
  distribution: EventDistributionEntry[] | null;
  leaderboard: EventLeaderboardEntry[];
  you: EventYouState | null;
}

function mapPublicQuestion(raw: unknown): EventPublicQuestion | null {
  const q = asRecord(raw);
  if (!q) return null;
  return {
    id: asString(q.id) ?? "",
    questionType: asQuestionType(q.question_type),
    prompt: asString(q.prompt) ?? "",
    timeLimitSeconds: asInt(q.time_limit_seconds) ?? 0,
    startedAt: asString(q.started_at),
    // Le mapping des options ne connaît que id/label/position : `is_correct`
    // n'est même pas lu, il ne peut donc pas fuir vers un client (invariant #1).
    options: asArray(q.options).flatMap((entry) => {
      const o = asRecord(entry);
      if (!o) return [];
      return [
        {
          id: asString(o.id) ?? "",
          label: asString(o.label) ?? "",
          position: asInt(o.position) ?? 0,
        },
      ];
    }),
  };
}

function mapYou(raw: unknown): EventYouState | null {
  const y = asRecord(raw);
  if (!y) return null;
  const winRec = asRecord(y.win);
  const winCode = winRec ? asString(winRec.code) : null;
  const winRank = winRec ? asInt(winRec.rank) : null;
  return {
    score: asInt(y.score) ?? 0,
    rank: asInt(y.rank) ?? 0,
    win: winRec && winCode && winRank !== null ? { rank: winRank, code: winCode } : null,
  };
}

/**
 * Convertit le jsonb d'event_public_state en état typé, sans jamais faire
 * confiance à sa forme. `correctOptionId` n'est retenu QUE si la phase vaut
 * 'reveal' : défense en profondeur par-dessus le filtrage déjà appliqué par la
 * RPC. Un jsonb non reconnu (ou state ≠ ok) retombe sur `unavailable` neutre.
 */
export function mapEventPublicState(raw: unknown): EventPublicState {
  const root = asRecord(raw);
  const sessionRec = root ? asRecord(root.session) : null;

  if (!root || asString(root.state) !== "ok" || !sessionRec) {
    return {
      state: "unavailable",
      session: null,
      question: null,
      correctOptionId: null,
      distribution: null,
      leaderboard: [],
      you: null,
    };
  }

  const session: EventPublicSession = {
    id: asString(sessionRec.id) ?? "",
    status: asStatus(sessionRec.status),
    phase: asPhase(sessionRec.phase),
    joinCode: asString(sessionRec.join_code) ?? "",
    rewardLabel: asString(sessionRec.reward_label) ?? "",
    rewardStock: asInt(sessionRec.reward_stock) ?? 0,
    rewardClaimedCount: asInt(sessionRec.reward_claimed_count) ?? 0,
  };

  const distributionRaw = root.distribution;
  const distribution =
    distributionRaw === null || distributionRaw === undefined
      ? null
      : asArray(distributionRaw).flatMap((entry) => {
          const d = asRecord(entry);
          if (!d) return [];
          return [
            {
              optionId: asString(d.option_id) ?? "",
              label: asString(d.label) ?? "",
              position: asInt(d.position) ?? 0,
              votes: asInt(d.votes) ?? 0,
            },
          ];
        });

  const leaderboard = asArray(root.leaderboard).flatMap((entry) => {
    const l = asRecord(entry);
    if (!l) return [];
    return [
      {
        pseudo: asString(l.pseudo) ?? "",
        avatar: asString(l.avatar) ?? "",
        score: asInt(l.score) ?? 0,
        rank: asInt(l.rank) ?? 0,
      },
    ];
  });

  return {
    state: "ok",
    session,
    question: mapPublicQuestion(root.question),
    // La bonne réponse n'est JAMAIS retenue hors reveal, quoi qu'ait renvoyé la
    // RPC (invariant #1, défense en profondeur).
    correctOptionId:
      session.phase === "reveal" ? asString(root.correct_option_id) : null,
    distribution,
    leaderboard,
    you: mapYou(root.you),
  };
}

// ────────────────────────────────────────────────────────────
// Machine à états organisateur (jsonb {state:'ok'|...})
// ────────────────────────────────────────────────────────────

export interface EventTransitionResult {
  state: EventTransitionState;
}

const TRANSITION_STATES: readonly EventTransitionState[] = [
  "ok",
  "invalid_transition",
  "unknown_question",
  "already_played",
  "missing_correct_option",
];

/**
 * Mappe le jsonb d'une RPC de la machine à états. Un état non reconnu retombe
 * sur `invalid_transition` (échec propre plutôt qu'un faux « ok »).
 */
export function mapEventTransition(raw: unknown): EventTransitionResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: EventTransitionState =
    stateRaw && (TRANSITION_STATES as string[]).includes(stateRaw)
      ? (stateRaw as EventTransitionState)
      : "invalid_transition";
  return { state };
}
