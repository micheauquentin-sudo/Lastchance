/**
 * Cœur métier « pur » de la Chasse au trésor : mapping du jsonb renvoyé
 * par la RPC record_hunt_scan vers un résultat typé pour l'UI, et
 * planification du réordonnancement des étapes. Fonctions testables sans
 * accès base ni imports server-only.
 */

import type { HuntOrderMode, HuntScanState } from "@/types/database";

// ────────────────────────────────────────────────────────────
// Résultat d'un scan (mapping du jsonb record_hunt_scan)
// ────────────────────────────────────────────────────────────

export interface HuntScanResult {
  state: HuntScanState;
  /** null sur `unavailable` (aucun oracle sur l'état interne de la chasse). */
  hunt: {
    id: string;
    name: string;
    orderMode: HuntOrderMode;
    rewardLabel: string;
  } | null;
  step: {
    position: number;
    label: string;
    /** Indice révélé une fois l'étape tamponnée (null sinon). */
    hint: string | null;
  } | null;
  progress: { done: number; total: number };
  /** Positions déjà tamponnées, croissantes. */
  stamped: number[];
  /** Secondes avant de pouvoir rescanner (`too_soon`). */
  retryInSeconds: number | null;
  /** Position attendue en ordre imposé (`wrong_order`). */
  expectedPosition: number | null;
  /** Code de retrait (`completed`). */
  code: string | null;
  /** Complétion déjà acquise avant ce scan (`completed`). */
  already: boolean;
}

const HUNT_SCAN_STATES: readonly HuntScanState[] = [
  "unavailable",
  "too_soon",
  "wrong_order",
  "scanned",
  "already",
  "completed",
  "hunt_full",
];

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

function asOrderMode(value: unknown): HuntOrderMode {
  return value === "ordered" ? "ordered" : "free";
}

/**
 * Convertit le jsonb de record_hunt_scan en résultat typé, sans jamais
 * faire confiance à sa forme (défauts sûrs sur toute valeur manquante ou
 * invalide). Un jsonb non reconnu retombe sur `unavailable`.
 */
export function mapHuntScanResult(raw: unknown): HuntScanResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: HuntScanState =
    stateRaw && (HUNT_SCAN_STATES as string[]).includes(stateRaw)
      ? (stateRaw as HuntScanState)
      : "unavailable";

  const huntRec = root ? asRecord(root.hunt) : null;
  const hunt = huntRec
    ? {
        id: asString(huntRec.id) ?? "",
        name: asString(huntRec.name) ?? "",
        orderMode: asOrderMode(huntRec.order_mode),
        rewardLabel: asString(huntRec.reward_label) ?? "",
      }
    : null;

  const stepRec = root ? asRecord(root.step) : null;
  const step = stepRec
    ? {
        position: asInt(stepRec.position) ?? 0,
        label: asString(stepRec.label) ?? "",
        hint: asString(stepRec.hint),
      }
    : null;

  const progressRec = root ? asRecord(root.progress) : null;
  const progress = {
    done: (progressRec ? asInt(progressRec.done) : null) ?? 0,
    total: (progressRec ? asInt(progressRec.total) : null) ?? 0,
  };

  const stamped = Array.isArray(root?.stamped)
    ? (root!.stamped as unknown[])
        .map(asInt)
        .filter((n): n is number => n !== null)
    : [];

  return {
    state,
    hunt,
    step,
    progress,
    stamped,
    retryInSeconds: root ? asInt(root.retry_in_seconds) : null,
    expectedPosition: root ? asInt(root.expected_position) : null,
    code: root ? asString(root.code) : null,
    already: root?.already === true,
  };
}

// ────────────────────────────────────────────────────────────
// Réordonnancement des étapes
// ────────────────────────────────────────────────────────────

/** Position minimale/maximale d'une étape (miroir du CHECK SQL). */
export const MIN_STEP_POSITION = 1;
export const MAX_STEP_POSITION = 10;

/**
 * Plus petite position libre dans 1..10 (attribuée à une nouvelle étape).
 * null si les 10 positions sont prises (10 étapes = plafond).
 */
export function firstFreeStepPosition(usedPositions: number[]): number | null {
  const used = new Set(usedPositions);
  for (let p = MIN_STEP_POSITION; p <= MAX_STEP_POSITION; p += 1) {
    if (!used.has(p)) return p;
  }
  return null;
}

export interface StepMove {
  id: string;
  position: number;
}

/**
 * Planifie un réordonnancement en une suite de déplacements d'étapes
 * (une étape à la fois), chacun vers une position LIBRE au moment du
 * déplacement — aucun état intermédiaire ne viole la contrainte d'unicité
 * (hunt_id, position), non déférable et bornée à 1..10.
 *
 * L'ensemble des positions occupées est conservé (permutation des slots
 * actuels) : l'ordre d'affichage change, pas les valeurs. Un slot libre
 * hors cible sert de « trou » pour dénouer les cycles.
 *
 * Retourne la séquence de déplacements (vide si rien à changer), ou null
 * si l'entrée est incohérente, ou dans l'unique cas irréductible d'une
 * chasse pleine (10 étapes) dont la permutation ne laisse aucun slot
 * libre — l'appelant invite alors à déplacer les étapes une par une.
 */
export function planReorder(
  steps: Array<{ id: string; position: number }>,
  orderedIds: string[],
): StepMove[] | null {
  if (steps.length !== orderedIds.length) return null;
  const stepIds = new Set(steps.map((s) => s.id));
  if (new Set(orderedIds).size !== orderedIds.length) return null;
  if (!orderedIds.every((id) => stepIds.has(id))) return null;

  const sortedSlots = steps.map((s) => s.position).sort((a, b) => a - b);
  const currentPos = new Map(steps.map((s) => [s.id, s.position]));
  const target = new Map(orderedIds.map((id, i) => [id, sortedSlots[i]]));
  const occupied = new Set<number>(sortedSlots);
  const targetSet = new Set<number>(sortedSlots);

  const moves: StepMove[] = [];
  const pending = new Set(
    steps.filter((s) => currentPos.get(s.id) !== target.get(s.id)).map((s) => s.id),
  );

  const firstFreeNonTarget = (): number | null => {
    for (let p = MIN_STEP_POSITION; p <= MAX_STEP_POSITION; p += 1) {
      if (!occupied.has(p) && !targetSet.has(p)) return p;
    }
    return null;
  };

  // Chaque tour place au moins une étape (déplacement direct) ou libère
  // un slot cible (parking) : la boucle est bornée par le nombre d'étapes.
  let guard = 0;
  while (pending.size > 0) {
    if (guard++ > 2 * MAX_STEP_POSITION + 2) return null;

    let moved = false;
    for (const id of [...pending]) {
      const t = target.get(id)!;
      if (!occupied.has(t)) {
        occupied.delete(currentPos.get(id)!);
        currentPos.set(id, t);
        occupied.add(t);
        moves.push({ id, position: t });
        pending.delete(id);
        moved = true;
      }
    }
    if (moved) continue;

    const hole = firstFreeNonTarget();
    if (hole === null) return null;
    const id = pending.values().next().value as string;
    occupied.delete(currentPos.get(id)!);
    currentPos.set(id, hole);
    occupied.add(hole);
    moves.push({ id, position: hole });
  }

  return moves;
}
