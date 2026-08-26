/**
 * Cœur métier « pur » du module Créateur de quiz : mapping des jsonb renvoyés
 * par les RPC service_role (join_quiz, start_quiz_question, submit_quiz_answer,
 * finish_quiz, consume_quiz_spin_grant, quiz_public_state, draw_quiz_winners)
 * vers des résultats typés pour l'UI. Fonctions testables sans accès base ni
 * imports server-only (miroir de src/lib/calendar.ts et src/lib/event.ts).
 *
 * INVARIANT DE SÉCURITÉ #2 (voir migration 20260803120000) : la VÉRITÉ d'une
 * question (`correct_answer`) ne fuit JAMAIS vers un joueur qui n'a pas encore
 * répondu à CETTE question. Ce module redouble le filtrage de la RPC — défense
 * en profondeur, exactement comme `mapPublicDay` du calendrier force à null le
 * contenu d'une case non ouverte :
 *   · la vue « question jouable » (`QuizPlayableQuestion`) N'A PAS de champ pour
 *     la bonne réponse : rien à oublier de filtrer, la fuite est structurellement
 *     impossible ;
 *   · dans `mapQuizPublicState`, `correctAnswer` / `yourAnswer` / `isCorrect` /
 *     `pointsAwarded` / `elapsedMs` ne sont lus QUE pour une question de statut
 *     `answered`, quoi qu'ait renvoyé la RPC ;
 *   · dans `mapQuizAnswerResult`, `correctAnswer` n'est retenue que pour un état
 *     qui PROUVE que ce joueur a répondu (recorded / too_late / already_answered).
 *
 * INVARIANT DE SÉCURITÉ #1 : le CHRONOMÈTRE et l'ÉVALUATION restent 100 % en
 * base. Les helpers de temps ci-dessous (`quizTimeRemainingMs`, `quizTimerView`)
 * ne servent QU'À AFFICHER un compte à rebours à partir de `server_now` /
 * `started_at` renvoyés par le serveur : aucune décision (justesse, hors-délai,
 * score) n'est jamais prise ici. La borne fait foi dans `submit_quiz_answer`.
 */

import type { Json } from "@/types/database.generated";

// ────────────────────────────────────────────────────────────
// Types de domaine (miroir des enums / CHECK SQL)
// ────────────────────────────────────────────────────────────

/** Forme de la réponse — LE MOTEUR (4 valeurs, cf. en-tête de la migration). */
export type QuizQuestionType = "choice" | "number" | "ranking" | "text";

/** Mode de récompense d'un quiz (5 modes). */
export type QuizRewardMode =
  | "threshold"
  | "draw"
  | "ranking"
  | "instant"
  | "none";

/** Habillage de la page publique. */
export type QuizTheme =
  | "neutre"
  | "gourmand"
  | "degustation"
  | "culture"
  | "produit"
  | "sport"
  | "entreprise";

export type QuizStatus = "draft" | "active" | "archived";

export type QuizJoinState = "unavailable" | "joined";

export type QuizStartState =
  | "unavailable"
  | "finished"
  | "already_answered"
  | "started";

export type QuizSubmitState =
  | "unavailable"
  | "not_joined"
  | "finished"
  | "not_started"
  | "already_answered"
  | "invalid_answer"
  | "recorded"
  | "too_late";

export type QuizFinishState =
  | "unavailable"
  | "not_joined"
  | "finished"
  | "already_finished";

export type QuizSpinGrantState =
  | "unavailable"
  | "already_consumed"
  | "no_prize"
  | "spun";

/**
 * Issues de `draw_quiz_winners`. `no_participants` = AUCUN lot émis (personne n'a
 * encore terminé, ou plus aucun stock) : le tirage n'est PAS consommé côté base
 * (`draw_state` reste `pending`), il reste donc relançable. Cet état DOIT figurer
 * ici et dans `DRAW_STATES` — sans quoi `mapQuizDraw` le dégraderait en
 * `unavailable`, et l'éditeur lirait « Quiz introuvable » pour un quiz existant.
 */
export type QuizDrawResultState =
  | "unavailable"
  | "invalid_mode"
  | "already_drawn"
  | "no_participants"
  | "drawn";

/** Statut d'une question POUR CE JOUEUR (vue publique). */
export type QuizQuestionStatus = "pending" | "in_progress" | "answered";

/** Bornes miroir des CHECK SQL de `quiz_questions` / `quizzes`. */
export const QUIZ_PROMPT_MAX = 500;
export const QUIZ_INTRO_MAX = 2000;
export const QUIZ_NAME_MAX = 120;
export const QUIZ_TEXT_ANSWER_MAX = 200;
export const QUIZ_TEXT_VARIANT_MAX = 120;
export const QUIZ_TEXT_VARIANTS_MAX = 10;
export const QUIZ_TIME_LIMIT_MIN = 5;
export const QUIZ_TIME_LIMIT_MAX = 600;
export const QUIZ_POINTS_MAX = 1000;
export const QUIZ_IMAGE_URL_MAX = 2048;
/** Modèle d'UI (`preset`) — miroir du CHECK `^[a-z][a-z0-9_]{1,39}$`. */
export const QUIZ_PRESET_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

/** Les 7 modèles d'interface du besoin produit (le moteur les IGNORE). */
export const QUIZ_PRESETS = [
  "multiple_choice",
  "true_false",
  "mystery_image",
  "estimate",
  "timed",
  "ranking",
  "free_prediction",
] as const;

export const QUIZ_THEMES: readonly QuizTheme[] = [
  "neutre",
  "gourmand",
  "degustation",
  "culture",
  "produit",
  "sport",
  "entreprise",
];

export const QUIZ_QUESTION_TYPES: readonly QuizQuestionType[] = [
  "choice",
  "number",
  "ranking",
  "text",
];

export const QUIZ_REWARD_MODES: readonly QuizRewardMode[] = [
  "threshold",
  "draw",
  "ranking",
  "instant",
  "none",
];

/** Option ordonnée d'une question choice / ranking. */
export interface QuizOption {
  id: string;
  label: string;
}

/**
 * Réponse d'un joueur, AVANT sérialisation en jsonb. Union discriminée miroir de
 * `is_valid_quiz_answer` (la base reste l'autorité).
 */
export type QuizAnswerInput =
  | { type: "choice"; optionId: string }
  | { type: "number"; value: number }
  | { type: "ranking"; order: string[] }
  | { type: "text"; value: string };

/** Résultat officiel d'une question, AVANT sérialisation en jsonb. */
export type QuizSolutionInput =
  | { type: "choice"; optionId: string }
  | { type: "number"; value: number }
  | { type: "ranking"; order: string[] }
  | { type: "text"; variants: string[] };

/**
 * Sérialise une réponse joueur vers la forme jsonb attendue par
 * `submit_quiz_answer` : choice → chaîne, number → nombre, ranking → tableau de
 * chaînes, text → chaîne. La forme est REVALIDÉE en base (`is_valid_quiz_answer`)
 * contre les options et le `ranking_size` de la question.
 */
export function quizAnswerToJson(answer: QuizAnswerInput): Json {
  switch (answer.type) {
    case "choice":
      return answer.optionId;
    case "number":
      return answer.value;
    case "ranking":
      return answer.order;
    case "text":
      return answer.value;
  }
}

/**
 * Sérialise un résultat officiel vers la forme jsonb de
 * `quiz_questions.correct_answer` : identique à une réponse joueur, SAUF `text`
 * où la vérité est un TABLEAU de variantes acceptées.
 */
export function quizSolutionToJson(solution: QuizSolutionInput): Json {
  switch (solution.type) {
    case "choice":
      return solution.optionId;
    case "number":
      return solution.value;
    case "ranking":
      return solution.order;
    case "text":
      return solution.variants;
  }
}

/**
 * Forme canonique d'une réponse libre — miroir TS de la fonction SQL
 * `quiz_normalize_text` (minuscules, accents français repliés, tout caractère
 * non alphanumérique ramené à une espace, espaces collapsés, bords rognés).
 *
 * USAGE STRICTEMENT D'APERÇU (aide de saisie du commerçant, message d'erreur) :
 * l'AUTORITÉ de comparaison est SQL. Aucune justesse n'est décidée ici.
 */
export function normalizeQuizText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les accents
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ────────────────────────────────────────────────────────────
// Helpers défensifs (aucune confiance dans la forme du jsonb)
// ────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
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

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asTheme(value: unknown): QuizTheme {
  return QUIZ_THEMES.includes(value as QuizTheme)
    ? (value as QuizTheme)
    : "neutre";
}

function asQuestionType(value: unknown): QuizQuestionType {
  return QUIZ_QUESTION_TYPES.includes(value as QuizQuestionType)
    ? (value as QuizQuestionType)
    : "choice";
}

function asRewardMode(value: unknown): QuizRewardMode {
  return QUIZ_REWARD_MODES.includes(value as QuizRewardMode)
    ? (value as QuizRewardMode)
    : "none";
}

function asPreset(value: unknown): string {
  const preset = asString(value);
  return preset && QUIZ_PRESET_PATTERN.test(preset) ? preset : "multiple_choice";
}

function asOptions(value: unknown): QuizOption[] {
  return asArray(value).flatMap((entry) => {
    const o = asRecord(entry);
    if (!o) return [];
    const id = asString(o.id);
    const label = asString(o.label);
    if (!id) return [];
    return [{ id, label: label ?? "" }];
  });
}

// ────────────────────────────────────────────────────────────
// La question TELLE QUE PRÉSENTÉE AU JOUEUR (jamais la vérité)
// ────────────────────────────────────────────────────────────

/**
 * Question jouable. Ce type N'A VOLONTAIREMENT AUCUN champ pour la bonne réponse
 * (miroir de `EventPublicOption`, qui n'expose jamais `is_correct`) : aucun
 * mapping ne peut donc laisser fuir la vérité vers le navigateur d'un joueur qui
 * n'a pas encore répondu — invariant #2, appliqué par construction.
 */
export interface QuizPlayableQuestion {
  id: string;
  position: number;
  questionType: QuizQuestionType;
  /** Modèle d'UI (ignoré par le moteur) : multiple_choice, true_false, … */
  preset: string;
  prompt: string;
  /** « Image mystère » : un média, pas un type de réponse. */
  imageUrl: string | null;
  /** choice / ranking : options ordonnées (elles ne désignent pas la vérité). */
  options: QuizOption[];
  /** ranking : taille du top attendu. */
  rankingSize: number | null;
  /** number : écart absolu toléré (affichage « à ±N près »). */
  tolerance: number | null;
  points: number;
  /** Chronomètre transversal : null = le joueur prend son temps. */
  timeLimitSeconds: number | null;
}

function mapPlayableQuestion(raw: unknown): QuizPlayableQuestion | null {
  const q = asRecord(raw);
  if (!q) return null;
  return {
    id: asString(q.id) ?? "",
    position: asInt(q.position) ?? 0,
    questionType: asQuestionType(q.question_type),
    preset: asPreset(q.preset),
    prompt: asString(q.prompt) ?? "",
    imageUrl: asString(q.image_url),
    options: asOptions(q.options),
    rankingSize: asInt(q.ranking_size),
    tolerance: asNumber(q.tolerance),
    points: asInt(q.points) ?? 0,
    timeLimitSeconds: asInt(q.time_limit_seconds),
  };
}

// ────────────────────────────────────────────────────────────
// join_quiz
// ────────────────────────────────────────────────────────────

export interface QuizJoinResult {
  state: QuizJoinState;
  /** Quiz rejoint (null hors `joined`). */
  quiz: {
    id: string;
    name: string;
    theme: QuizTheme;
    introText: string | null;
    questionCount: number;
    rewardMode: QuizRewardMode;
    rewardLabel: string;
  } | null;
  /** Joueur créé/rejoint (null hors `joined`). */
  player: {
    id: string;
    firstName: string | null;
    avatar: string;
    score: number;
    correctCount: number;
    totalElapsedMs: number;
    finishedAt: string | null;
    marketingOptIn: boolean;
    hasEmail: boolean;
  } | null;
}

const JOIN_STATES: readonly QuizJoinState[] = ["unavailable", "joined"];

export function mapQuizJoin(raw: unknown): QuizJoinResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: QuizJoinState =
    stateRaw && (JOIN_STATES as string[]).includes(stateRaw)
      ? (stateRaw as QuizJoinState)
      : "unavailable";

  const quizRec = root ? asRecord(root.quiz) : null;
  const playerRec = root ? asRecord(root.player) : null;
  const joined = state === "joined";

  return {
    state,
    quiz:
      joined && quizRec
        ? {
            id: asString(quizRec.id) ?? "",
            name: asString(quizRec.name) ?? "",
            theme: asTheme(quizRec.theme),
            introText: asString(quizRec.intro_text),
            questionCount: asInt(quizRec.question_count) ?? 0,
            rewardMode: asRewardMode(quizRec.reward_mode),
            rewardLabel: asString(quizRec.reward_label) ?? "",
          }
        : null,
    player:
      joined && playerRec
        ? {
            id: asString(playerRec.id) ?? "",
            firstName: asString(playerRec.first_name),
            avatar: asString(playerRec.avatar) ?? "",
            score: asInt(playerRec.score) ?? 0,
            correctCount: asInt(playerRec.correct_count) ?? 0,
            totalElapsedMs: asInt(playerRec.total_elapsed_ms) ?? 0,
            finishedAt: asString(playerRec.finished_at),
            marketingOptIn: playerRec.marketing_opt_in === true,
            hasEmail: playerRec.has_email === true,
          }
        : null,
  };
}

// ────────────────────────────────────────────────────────────
// start_quiz_question — présentation + chronomètre serveur
// ────────────────────────────────────────────────────────────

/** Issue figée d'une question déjà répondue (aucune vérité attachée ici). */
export interface QuizAnsweredOutcome {
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  elapsedMs: number | null;
  timedOut: boolean;
}

export interface QuizStartResult {
  state: QuizStartState;
  /** Question à présenter (`started` uniquement) — SANS la bonne réponse. */
  question: QuizPlayableQuestion | null;
  /** Instant SERVEUR de présentation (référence du compte à rebours). */
  startedAt: string | null;
  /** Horloge SERVEUR au moment de la réponse (dérive client neutralisée). */
  serverNow: string | null;
  /** `already_answered` : issue figée de la tentative précédente. */
  outcome: QuizAnsweredOutcome | null;
}

const START_STATES: readonly QuizStartState[] = [
  "unavailable",
  "finished",
  "already_answered",
  "started",
];

/**
 * Convertit le jsonb de `start_quiz_question` en vue JOUEUR. La charge utile de
 * la RPC ne contient jamais `correct_answer` (invariant #2) et le type de sortie
 * n'a aucun champ pour l'accueillir : rien ne peut fuir. Un jsonb non reconnu
 * retombe sur `unavailable`.
 */
export function mapQuizQuestion(raw: unknown): QuizStartResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: QuizStartState =
    stateRaw && (START_STATES as string[]).includes(stateRaw)
      ? (stateRaw as QuizStartState)
      : "unavailable";

  return {
    state,
    question: state === "started" && root ? mapPlayableQuestion(root.question) : null,
    startedAt: state === "started" && root ? asString(root.started_at) : null,
    serverNow: root ? asString(root.server_now) : null,
    outcome:
      state === "already_answered" && root
        ? {
            isCorrect: asBool(root.is_correct),
            pointsAwarded: asInt(root.points_awarded),
            elapsedMs: asInt(root.elapsed_ms),
            timedOut: root.timed_out === true,
          }
        : null,
  };
}

// ────────────────────────────────────────────────────────────
// submit_quiz_answer — la vérité n'est due qu'après avoir répondu
// ────────────────────────────────────────────────────────────

export interface QuizAnswerResult {
  state: QuizSubmitState;
  questionId: string | null;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  /** Délai SERVEUR figé (jamais recalculé côté Node). */
  elapsedMs: number | null;
  timedOut: boolean;
  /**
   * Résultat officiel de CETTE question — non nul UNIQUEMENT quand l'état prouve
   * que CE joueur y a répondu (recorded / too_late / already_answered).
   */
  correctAnswer: unknown;
  player: { score: number; correctCount: number; totalElapsedMs: number } | null;
  progression: { answeredCount: number; questionCount: number } | null;
}

const SUBMIT_STATES: readonly QuizSubmitState[] = [
  "unavailable",
  "not_joined",
  "finished",
  "not_started",
  "already_answered",
  "invalid_answer",
  "recorded",
  "too_late",
];

/** États qui PROUVENT que ce joueur a répondu à la question visée. */
const ANSWERED_STATES: readonly QuizSubmitState[] = [
  "recorded",
  "too_late",
  "already_answered",
];

/**
 * Convertit le jsonb de `submit_quiz_answer`. `correctAnswer` est forcée à null
 * pour tout état ne prouvant pas que ce joueur a répondu (invariant #2, défense
 * en profondeur) : un refus — `invalid_answer` en particulier — n'est jamais un
 * oracle sur la vérité. Un jsonb non reconnu retombe sur `unavailable`.
 */
export function mapQuizAnswerResult(raw: unknown): QuizAnswerResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: QuizSubmitState =
    stateRaw && (SUBMIT_STATES as string[]).includes(stateRaw)
      ? (stateRaw as QuizSubmitState)
      : "unavailable";

  const answered = (ANSWERED_STATES as string[]).includes(state);
  const playerRec = root ? asRecord(root.player) : null;
  const progRec = root ? asRecord(root.progression) : null;

  return {
    state,
    questionId: root ? asString(root.question_id) : null,
    isCorrect: answered && root ? asBool(root.is_correct) : null,
    pointsAwarded: answered && root ? asInt(root.points_awarded) : null,
    elapsedMs: answered && root ? asInt(root.elapsed_ms) : null,
    timedOut: answered && root?.timed_out === true,
    correctAnswer: answered && root ? (root.correct_answer ?? null) : null,
    player:
      answered && playerRec
        ? {
            score: asInt(playerRec.score) ?? 0,
            correctCount: asInt(playerRec.correct_count) ?? 0,
            totalElapsedMs: asInt(playerRec.total_elapsed_ms) ?? 0,
          }
        : null,
    progression: progRec
      ? {
          answeredCount: asInt(progRec.answered_count) ?? 0,
          questionCount: asInt(progRec.question_count) ?? 0,
        }
      : null,
  };
}

// ────────────────────────────────────────────────────────────
// Lot émis (code caisse QUIZ-… ou tour de roue offert)
// ────────────────────────────────────────────────────────────

export interface QuizRewardView {
  /** Mode qui a émis ce lot (copie figée côté base). */
  source: string;
  /** draw / ranking : rang du gagnant. */
  rank: number | null;
  /** Code de retrait en caisse QUIZ-… (null si tour offert ou rupture). */
  code: string | null;
  /** Tour de roue offert : jeton à consommer (null sinon). */
  spinGrantToken: string | null;
  /** Roue cible du tour offert (null sinon). */
  targetWheelId: string | null;
  resultingSpinId: string | null;
  outOfStock: boolean;
  redeemedAt: string | null;
}

function mapReward(raw: unknown): QuizRewardView | null {
  const r = asRecord(raw);
  if (!r) return null;
  return {
    source: asString(r.source) ?? "",
    rank: asInt(r.rank),
    code: asString(r.code),
    spinGrantToken: asString(r.spin_grant_token),
    targetWheelId: asString(r.target_wheel_id),
    resultingSpinId: asString(r.resulting_spin_id),
    outOfStock: r.out_of_stock === true,
    redeemedAt: asString(r.redeemed_at),
  };
}

// ────────────────────────────────────────────────────────────
// finish_quiz
// ────────────────────────────────────────────────────────────

export interface QuizFinishResult {
  state: QuizFinishState;
  player: {
    id: string;
    score: number;
    correctCount: number;
    totalElapsedMs: number;
    finishedAt: string | null;
  } | null;
  progression: { answeredCount: number; questionCount: number } | null;
  rewardMode: QuizRewardMode;
  rewardThreshold: number | null;
  /** Modes différés : le sort n'est pas encore tiré. */
  pendingDraw: boolean;
  reward: QuizRewardView | null;
  /** Un lot vient d'être émis par CET appel (jamais par un second). */
  emitted: boolean;
}

const FINISH_STATES: readonly QuizFinishState[] = [
  "unavailable",
  "not_joined",
  "finished",
  "already_finished",
];

export function mapQuizFinish(raw: unknown): QuizFinishResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: QuizFinishState =
    stateRaw && (FINISH_STATES as string[]).includes(stateRaw)
      ? (stateRaw as QuizFinishState)
      : "unavailable";

  const closed = state === "finished" || state === "already_finished";
  const playerRec = root ? asRecord(root.player) : null;
  const progRec = root ? asRecord(root.progression) : null;

  return {
    state,
    player:
      closed && playerRec
        ? {
            id: asString(playerRec.id) ?? "",
            score: asInt(playerRec.score) ?? 0,
            correctCount: asInt(playerRec.correct_count) ?? 0,
            totalElapsedMs: asInt(playerRec.total_elapsed_ms) ?? 0,
            finishedAt: asString(playerRec.finished_at),
          }
        : null,
    progression:
      closed && progRec
        ? {
            answeredCount: asInt(progRec.answered_count) ?? 0,
            questionCount: asInt(progRec.question_count) ?? 0,
          }
        : null,
    rewardMode: root ? asRewardMode(root.reward_mode) : "none",
    rewardThreshold: root ? asInt(root.reward_threshold) : null,
    pendingDraw: closed && root?.pending_draw === true,
    reward: closed && root ? mapReward(root.reward) : null,
    emitted: state === "finished" && root?.emitted === true,
  };
}

// ────────────────────────────────────────────────────────────
// consume_quiz_spin_grant (miroir de mapCalendarSpinGrant)
// ────────────────────────────────────────────────────────────

export interface QuizSpinGrantResult {
  state: QuizSpinGrantState;
  spinId: string | null;
  wheelId: string | null;
  prizeId: string | null;
  isLosing: boolean;
}

const SPIN_GRANT_STATES: readonly QuizSpinGrantState[] = [
  "unavailable",
  "already_consumed",
  "no_prize",
  "spun",
];

export function mapQuizSpinGrant(raw: unknown): QuizSpinGrantResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: QuizSpinGrantState =
    stateRaw && (SPIN_GRANT_STATES as string[]).includes(stateRaw)
      ? (stateRaw as QuizSpinGrantState)
      : "unavailable";

  return {
    state,
    spinId: root ? asString(root.spin_id) : null,
    wheelId: root ? asString(root.wheel_id) : null,
    prizeId: root ? asString(root.prize_id) : null,
    isLosing: root?.is_losing === true,
  };
}

// ────────────────────────────────────────────────────────────
// draw_quiz_winners (tirage / classement différé)
// ────────────────────────────────────────────────────────────

export interface QuizDrawResult {
  state: QuizDrawResultState;
  mode: QuizRewardMode | null;
  /** Gagnants réellement dotés (jamais au-delà du stock). */
  winners: number;
  outOfStock: boolean;
  drawnAt: string | null;
}

const DRAW_STATES: readonly QuizDrawResultState[] = [
  "unavailable",
  "invalid_mode",
  "already_drawn",
  "no_participants",
  "drawn",
];

export function mapQuizDraw(raw: unknown): QuizDrawResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: QuizDrawResultState =
    stateRaw && (DRAW_STATES as string[]).includes(stateRaw)
      ? (stateRaw as QuizDrawResultState)
      : "unavailable";

  return {
    state,
    mode: root && asString(root.mode) ? asRewardMode(root.mode) : null,
    winners: (root ? asInt(root.winners) : null) ?? 0,
    outOfStock: root?.out_of_stock === true,
    drawnAt: root ? asString(root.drawn_at) : null,
  };
}

// ────────────────────────────────────────────────────────────
// quiz_public_state — LA source unique de l'état public (page + polling)
// ────────────────────────────────────────────────────────────

/**
 * Question telle que servie sur la page publique. Pour une question NON répondue
 * par ce joueur (`pending` / `in_progress`), la vérité et l'issue sont NULLES —
 * forcées ici quoi qu'ait renvoyé la RPC (invariant #2, défense en profondeur,
 * miroir de `mapPublicDay` du calendrier).
 */
export interface QuizPublicQuestion extends QuizPlayableQuestion {
  status: QuizQuestionStatus;
  /** `in_progress` : instant SERVEUR de présentation (chronomètre déjà lancé). */
  startedAt: string | null;
  /** `answered` uniquement — null partout ailleurs. */
  correctAnswer: unknown;
  yourAnswer: unknown;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  elapsedMs: number | null;
  timedOut: boolean;
}

export interface QuizPublicState {
  state: "ok" | "unavailable";
  /** Horloge SERVEUR (référence d'affichage du chronomètre). */
  serverNow: string | null;
  quiz: {
    id: string;
    name: string;
    theme: QuizTheme;
    status: string;
    introText: string | null;
    questionCount: number;
    rewardMode: QuizRewardMode;
    rewardThreshold: number | null;
    drawTopN: number | null;
    drawState: "pending" | "done";
    rewardLabel: string;
    rewardDetails: string | null;
    rewardStock: number;
    rewardClaimedCount: number;
  } | null;
  questions: QuizPublicQuestion[];
  /** Vue « moi » (null sans identité cookie) — jamais un autre joueur. */
  player: {
    id: string;
    firstName: string | null;
    avatar: string;
    score: number;
    correctCount: number;
    totalElapsedMs: number;
    finishedAt: string | null;
  } | null;
  progression: { answeredCount: number; questionCount: number };
  /** Lot du joueur courant (jamais celui d'un autre). */
  reward: QuizRewardView | null;
}

function asQuestionStatus(value: unknown): QuizQuestionStatus {
  return value === "answered"
    ? "answered"
    : value === "in_progress"
      ? "in_progress"
      : "pending";
}

/**
 * Mappe une question de la vue publique. La vérité (`correct_answer`), la réponse
 * du joueur et son issue ne sont lues QUE pour un statut `answered` — pour tout
 * autre statut elles sont forcées à null, même si la RPC en renvoyait (défense en
 * profondeur de l'invariant #2 : une question non répondue ne peut jamais laisser
 * fuir sa bonne réponse vers le navigateur du joueur).
 */
function mapPublicQuestion(raw: unknown): QuizPublicQuestion | null {
  const base = mapPlayableQuestion(raw);
  const q = asRecord(raw);
  if (!base || !q) return null;
  const status = asQuestionStatus(q.status);
  const answered = status === "answered";
  return {
    ...base,
    status,
    startedAt: answered ? null : asString(q.started_at),
    correctAnswer: answered ? (q.correct_answer ?? null) : null,
    yourAnswer: answered ? (q.your_answer ?? null) : null,
    isCorrect: answered ? asBool(q.is_correct) : null,
    pointsAwarded: answered ? asInt(q.points_awarded) : null,
    elapsedMs: answered ? asInt(q.elapsed_ms) : null,
    timedOut: answered ? q.timed_out === true : false,
  };
}

/**
 * Convertit le jsonb de `quiz_public_state` en état typé, sans jamais faire
 * confiance à sa forme. Un jsonb non reconnu (ou state ≠ ok) retombe sur
 * `unavailable` neutre — aucun oracle.
 */
export function mapQuizPublicState(raw: unknown): QuizPublicState {
  const root = asRecord(raw);
  const quizRec = root ? asRecord(root.quiz) : null;

  if (!root || asString(root.state) !== "ok" || !quizRec) {
    return {
      state: "unavailable",
      serverNow: null,
      quiz: null,
      questions: [],
      player: null,
      progression: { answeredCount: 0, questionCount: 0 },
      reward: null,
    };
  }

  const progRec = asRecord(root.progression);
  const playerRec = asRecord(root.player);

  return {
    state: "ok",
    serverNow: asString(root.server_now),
    quiz: {
      id: asString(quizRec.id) ?? "",
      name: asString(quizRec.name) ?? "",
      theme: asTheme(quizRec.theme),
      status: asString(quizRec.status) ?? "",
      introText: asString(quizRec.intro_text),
      questionCount: asInt(quizRec.question_count) ?? 0,
      rewardMode: asRewardMode(quizRec.reward_mode),
      rewardThreshold: asInt(quizRec.reward_threshold),
      drawTopN: asInt(quizRec.draw_top_n),
      drawState: quizRec.draw_state === "done" ? "done" : "pending",
      rewardLabel: asString(quizRec.reward_label) ?? "",
      rewardDetails: asString(quizRec.reward_details),
      rewardStock: asInt(quizRec.reward_stock) ?? 0,
      rewardClaimedCount: asInt(quizRec.reward_claimed_count) ?? 0,
    },
    questions: asArray(root.questions)
      .flatMap((entry) => {
        const q = mapPublicQuestion(entry);
        return q ? [q] : [];
      })
      .sort((a, b) => a.position - b.position),
    player: playerRec
      ? {
          id: asString(playerRec.id) ?? "",
          firstName: asString(playerRec.first_name),
          avatar: asString(playerRec.avatar) ?? "",
          score: asInt(playerRec.score) ?? 0,
          correctCount: asInt(playerRec.correct_count) ?? 0,
          totalElapsedMs: asInt(playerRec.total_elapsed_ms) ?? 0,
          finishedAt: asString(playerRec.finished_at),
        }
      : null,
    progression: {
      answeredCount: (progRec ? asInt(progRec.answered_count) : null) ?? 0,
      questionCount: (progRec ? asInt(progRec.question_count) : null) ?? 0,
    },
    reward: mapReward(root.reward),
  };
}

// ────────────────────────────────────────────────────────────
// Classement (quiz_leaderboard) — l'ordre fait foi en SQL
// ────────────────────────────────────────────────────────────

export interface QuizLeaderboardEntry {
  playerId: string;
  firstName: string | null;
  avatar: string;
  score: number;
  correctCount: number;
  totalElapsedMs: number;
  finishedAt: string | null;
  /** Rang ex æquo partagé (rank() SQL) ; recalculé en repli si absent. */
  rank: number;
  /** Nombre total de participations terminées. */
  totalPlayers: number;
}

/**
 * Ordre du classement : score DÉCROISSANT puis temps total CROISSANT — miroir
 * exact de `quiz_leaderboard` (et de l'ordre du tirage `draw_quiz_winners`).
 * USAGE D'AFFICHAGE : l'autorité du classement, comme celle du tirage, est SQL.
 */
export function compareQuizStandings(
  a: { score: number; totalElapsedMs: number },
  b: { score: number; totalElapsedMs: number },
): number {
  if (a.score !== b.score) return b.score - a.score;
  return a.totalElapsedMs - b.totalElapsedMs;
}

/**
 * Attribue les rangs d'une liste déjà ordonnée, EX ÆQUO PARTAGÉS : deux entrées
 * de même score ET même temps partagent le rang, la suivante saute (sémantique de
 * `rank()`, celle des pronostics et de `quiz_leaderboard`). Repli d'affichage
 * uniquement.
 */
export function assignQuizRanks<T extends { score: number; totalElapsedMs: number }>(
  entries: readonly T[],
): Array<T & { rank: number }> {
  const sorted = [...entries].sort(compareQuizStandings);
  let rank = 0;
  let previous: { score: number; totalElapsedMs: number } | null = null;
  return sorted.map((entry, index) => {
    if (
      !previous ||
      previous.score !== entry.score ||
      previous.totalElapsedMs !== entry.totalElapsedMs
    ) {
      rank = index + 1;
    }
    previous = entry;
    return { ...entry, rank };
  });
}

/**
 * Convertit les lignes de `quiz_leaderboard`. Le rang vient de SQL ; s'il manque
 * (ligne malformée), il est dérivé par `assignQuizRanks` — jamais l'inverse.
 * Aucun email n'existe dans cette charge utile (RPC destinée au public).
 */
export function mapQuizLeaderboard(raw: unknown): QuizLeaderboardEntry[] {
  const rows = asArray(raw).flatMap((entry) => {
    const r = asRecord(entry);
    if (!r) return [];
    return [
      {
        playerId: asString(r.player_id) ?? "",
        firstName: asString(r.first_name),
        avatar: asString(r.avatar) ?? "",
        score: asInt(r.score) ?? 0,
        correctCount: asInt(r.correct_count) ?? 0,
        totalElapsedMs: asInt(r.total_elapsed_ms) ?? 0,
        finishedAt: asString(r.finished_at),
        rank: asInt(r.rank) ?? 0,
        totalPlayers: asInt(r.total_players) ?? 0,
      },
    ];
  });

  if (rows.every((row) => row.rank >= 1)) return rows;
  // Repli : rangs dérivés localement (l'ordre reste celui du classement SQL).
  return assignQuizRanks(rows).map((row) => ({ ...row, rank: row.rank }));
}

// ────────────────────────────────────────────────────────────
// Chronomètre — AFFICHAGE SEUL (la borne fait foi en base)
// ────────────────────────────────────────────────────────────

export interface QuizTimerView {
  /** Fenêtre totale en ms (null : aucun chronomètre). */
  limitMs: number | null;
  /** Temps écoulé estimé en ms (0 si le chronomètre n'est pas lancé). */
  elapsedMs: number;
  /** Temps restant en ms (null : aucun chronomètre), jamais négatif. */
  remainingMs: number | null;
  /** La fenêtre paraît écoulée — INDICATIF : seul le serveur tranche. */
  expired: boolean;
}

/**
 * Temps restant AFFICHABLE d'une question chronométrée, calculé à partir des
 * instants SERVEUR (`server_now`, `started_at`) et de `time_limit_seconds`.
 *
 * Pourquoi `serverNow` et non `Date.now()` : l'horloge du téléphone peut dériver
 * (ou être trafiquée) ; on part du décalage mesuré côté serveur. Le résultat ne
 * sert QU'À l'affichage — `submit_quiz_answer` recalcule `now() - started_at` en
 * base et refuse seul le hors-délai (invariant #1). Retourne null quand il n'y a
 * pas de chronomètre ou pas encore de présentation.
 */
export function quizTimeRemainingMs(input: {
  serverNow: string | null;
  startedAt: string | null;
  timeLimitSeconds: number | null;
}): number | null {
  const { serverNow, startedAt, timeLimitSeconds } = input;
  if (!timeLimitSeconds || timeLimitSeconds <= 0) return null;
  if (!serverNow || !startedAt) return null;
  const now = Date.parse(serverNow);
  const started = Date.parse(startedAt);
  if (!Number.isFinite(now) || !Number.isFinite(started)) return null;
  const elapsed = Math.max(0, now - started);
  return Math.max(0, timeLimitSeconds * 1000 - elapsed);
}

/** Vue complète du chronomètre (affichage seul), dérivée des instants serveur. */
export function quizTimerView(input: {
  serverNow: string | null;
  startedAt: string | null;
  timeLimitSeconds: number | null;
}): QuizTimerView {
  const { serverNow, startedAt, timeLimitSeconds } = input;
  const limitMs =
    timeLimitSeconds && timeLimitSeconds > 0 ? timeLimitSeconds * 1000 : null;
  const now = serverNow ? Date.parse(serverNow) : Number.NaN;
  const started = startedAt ? Date.parse(startedAt) : Number.NaN;
  const elapsedMs =
    Number.isFinite(now) && Number.isFinite(started) ? Math.max(0, now - started) : 0;
  const remainingMs = quizTimeRemainingMs(input);
  return {
    limitMs,
    elapsedMs,
    remainingMs,
    expired: remainingMs !== null && remainingMs <= 0,
  };
}

// ────────────────────────────────────────────────────────────
// Sas de présentation d'une question (pur, testable)
// ────────────────────────────────────────────────────────────

/**
 * Ce que le sas doit annoncer AVANT que le joueur n'appuie.
 *
 *  · `neuve` — rien n'est lancé : le décompte partira au signal, la promesse
 *    « vous aurez N secondes » est vraie ;
 *  · `en_cours` — `start_quiz_question` a DÉJÀ posé `started_at` pour cette
 *    question et ne le rembobine jamais (invariant anti-triche : sans lui, un
 *    rechargement offrirait un chronomètre neuf avec l'intitulé déjà lu). Le
 *    temps restant est celui qui reste vraiment ;
 *  · `expiree` — il ne reste rien ; la question ne rapportera plus de points,
 *    mais elle peut encore être envoyée ou passée pour que le parcours reste
 *    complet, ce dont dépend la récompense.
 */
export type QuizGateReprise =
  | { kind: "neuve" }
  | { kind: "en_cours"; remainingMs: number }
  | { kind: "expiree" };

/**
 * État du sas pour la question courante.
 *
 * ── Le défaut que cette fonction existe pour rendre impossible ──
 *
 * Le sas annonçait « Vous aurez N secondes dès que vous lancez » et « prenez le
 * temps de vous installer » de façon INCONDITIONNELLE. Un joueur dont le
 * téléphone se verrouille pendant qu'il lit l'intitulé revient sur ce même sas,
 * y lit une promesse de temps plein, appuie — et tombe sur « ⏱️ Temps écoulé ».
 * Zéro point, sans seconde chance, et en mode `threshold` cela peut lui coûter
 * son lot. L'information manquante était pourtant déjà servie par
 * `quiz_public_state` (`status`, `startedAt`) : elle n'était simplement jamais
 * lue.
 *
 * La perte de temps, elle, est ANTÉRIEURE au retour et délibérée. Ce qui se
 * corrige ici n'est pas la perte : c'est le texte qui la cachait.
 */
export function quizGateReprise(input: {
  status: QuizQuestionStatus;
  serverNow: string | null;
  startedAt: string | null;
  timeLimitSeconds: number | null;
}): QuizGateReprise {
  if (input.status !== "in_progress") return { kind: "neuve" };
  const remainingMs = quizTimeRemainingMs(input);
  // Question non chronométrée déjà présentée, ou instants illisibles : rien à
  // annoncer de plus que « touchez le bouton ». On ne fabrique pas un compte à
  // rebours qu'on ne sait pas calculer.
  if (remainingMs === null) return { kind: "neuve" };
  return remainingMs > 0 ? { kind: "en_cours", remainingMs } : { kind: "expiree" };
}

// ────────────────────────────────────────────────────────────
// Réordonnancement des questions (pur, testable)
// ────────────────────────────────────────────────────────────

export interface QuizPositionMove {
  id: string;
  position: number;
}

/**
 * Plan de réattribution des positions d'un quiz selon l'ordre demandé. L'unicité
 * `(quiz_id, position)` interdit tout état intermédiaire en collision et le CHECK
 * `position >= 0` interdit les positions négatives comme aire de stationnement :
 * le plan se fait donc en DEUX TEMPS — chaque question est d'abord garée
 * AU-DESSUS de toutes les positions occupées, puis redescendue sur sa position
 * finale 0..n-1. Appliqué dans l'ordre retourné, aucun couple ne se télescope.
 *
 * Retourne null si l'ordre ne décrit pas exactement l'ensemble courant (ids
 * inconnus, doublons, longueur différente) : l'action refuse alors sans écrire.
 */
export function planQuizReorder(
  questions: ReadonlyArray<{ id: string; position: number }>,
  orderedIds: readonly string[],
): QuizPositionMove[] | null {
  if (questions.length !== orderedIds.length) return null;
  const ids = new Set(questions.map((q) => q.id));
  if (ids.size !== questions.length) return null;
  if (new Set(orderedIds).size !== orderedIds.length) return null;
  if (!orderedIds.every((id) => ids.has(id))) return null;

  const current = new Map(questions.map((q) => [q.id, q.position]));
  const target = new Map(orderedIds.map((id, index) => [id, index]));
  // Rien à faire si chaque question est déjà à sa place.
  if (orderedIds.every((id) => current.get(id) === target.get(id))) return [];

  const parkBase =
    Math.max(questions.length, ...questions.map((q) => q.position + 1)) + 1;

  const moves: QuizPositionMove[] = [];
  orderedIds.forEach((id, index) => {
    moves.push({ id, position: parkBase + index });
  });
  orderedIds.forEach((id, index) => {
    moves.push({ id, position: index });
  });
  return moves;
}
