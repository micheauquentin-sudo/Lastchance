/**
 * Cœur métier « pur » du Passeport de fidélité : mapping des jsonb renvoyés
 * par les RPC record_loyalty_stamp et consume_loyalty_spin_grant vers des
 * résultats typés pour l'UI. Fonctions testables sans accès base ni imports
 * server-only (miroir de src/lib/hunts.ts).
 */

import type {
  LoyaltyRewardType,
  LoyaltySpinGrantState,
  LoyaltyStampState,
  LoyaltyTier,
  LoyaltyValidationMode,
} from "@/types/database";

// ────────────────────────────────────────────────────────────
// Résultat d'un tampon (mapping du jsonb record_loyalty_stamp)
// ────────────────────────────────────────────────────────────

/** Palier atteint lors d'un tampon : lot (code ou rupture) ou spin offert. */
export interface LoyaltyMilestoneReached {
  milestoneId: string;
  visitCount: number;
  rewardType: LoyaltyRewardType;
  rewardLabel: string;
  rewardDetails: string | null;
  /** reward_type='lot' gagné : code de retrait FIDELITE-… (null sinon). */
  code: string | null;
  /** reward_type='spin' : jeton à consommer sur la roue offerte (null sinon). */
  grantToken: string | null;
  /** reward_type='spin' : roue cible du tour offert (null sinon). */
  targetWheelId: string | null;
  /** reward_type='lot' en rupture de stock : aucun code émis. */
  outOfStock: boolean;
}

export interface LoyaltyStampResult {
  state: LoyaltyStampState;
  /** null sur `unavailable`/`invalid_code` (aucun oracle sur l'état interne). */
  program: {
    id: string;
    name: string;
    validationMode: LoyaltyValidationMode;
  } | null;
  visitCount: number;
  tier: LoyaltyTier;
  tierThresholds: { silver: number; gold: number };
  /** Paliers NOUVELLEMENT atteints lors de ce tampon (vide sinon). */
  milestonesReached: LoyaltyMilestoneReached[];
  /** Prochain palier au-dessus du compteur courant (null si aucun). */
  nextMilestone: { visitCount: number; rewardType: LoyaltyRewardType } | null;
  /** Secondes avant de pouvoir retamponner (`too_soon`). */
  retryInSeconds: number | null;
}

const LOYALTY_STAMP_STATES: readonly LoyaltyStampState[] = [
  "unavailable",
  "invalid_code",
  "too_soon",
  "stamped",
];

const LOYALTY_SPIN_GRANT_STATES: readonly LoyaltySpinGrantState[] = [
  "unavailable",
  "already_consumed",
  "no_prize",
  "spun",
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

function asRewardType(value: unknown): LoyaltyRewardType {
  return value === "spin" ? "spin" : "lot";
}

function asTier(value: unknown): LoyaltyTier {
  return value === "gold" ? "gold" : value === "silver" ? "silver" : "bronze";
}

function asValidationMode(value: unknown): LoyaltyValidationMode {
  return value === "rotating_code" ? "rotating_code" : "staff";
}

function mapMilestoneReached(raw: unknown): LoyaltyMilestoneReached | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  return {
    milestoneId: asString(rec.milestone_id) ?? "",
    visitCount: asInt(rec.visit_count) ?? 0,
    rewardType: asRewardType(rec.reward_type),
    rewardLabel: asString(rec.reward_label) ?? "",
    rewardDetails: asString(rec.reward_details),
    code: asString(rec.code),
    grantToken: asString(rec.grant_token),
    targetWheelId: asString(rec.target_wheel_id),
    outOfStock: rec.out_of_stock === true,
  };
}

/**
 * Convertit le jsonb de record_loyalty_stamp en résultat typé, sans jamais
 * faire confiance à sa forme (défauts sûrs sur toute valeur manquante ou
 * invalide). Un jsonb non reconnu retombe sur `unavailable`.
 */
export function mapLoyaltyStampResult(raw: unknown): LoyaltyStampResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: LoyaltyStampState =
    stateRaw && (LOYALTY_STAMP_STATES as string[]).includes(stateRaw)
      ? (stateRaw as LoyaltyStampState)
      : "unavailable";

  const programRec = root ? asRecord(root.program) : null;
  const program = programRec
    ? {
        id: asString(programRec.id) ?? "",
        name: asString(programRec.name) ?? "",
        validationMode: asValidationMode(programRec.validation_mode),
      }
    : null;

  const thresholdsRec = root ? asRecord(root.tier_thresholds) : null;
  const tierThresholds = {
    silver: (thresholdsRec ? asInt(thresholdsRec.silver) : null) ?? 0,
    gold: (thresholdsRec ? asInt(thresholdsRec.gold) : null) ?? 0,
  };

  const milestonesReached = Array.isArray(root?.milestones_reached)
    ? (root!.milestones_reached as unknown[])
        .map(mapMilestoneReached)
        .filter((m): m is LoyaltyMilestoneReached => m !== null)
    : [];

  const nextRec = root ? asRecord(root.next_milestone) : null;
  const nextMilestone = nextRec
    ? {
        visitCount: asInt(nextRec.visit_count) ?? 0,
        rewardType: asRewardType(nextRec.reward_type),
      }
    : null;

  return {
    state,
    program,
    visitCount: (root ? asInt(root.visit_count) : null) ?? 0,
    tier: asTier(root?.tier),
    tierThresholds,
    milestonesReached,
    nextMilestone,
    retryInSeconds: root ? asInt(root.retry_in_seconds) : null,
  };
}

// ────────────────────────────────────────────────────────────
// Résultat d'un tour offert (mapping du jsonb consume_loyalty_spin_grant)
// ────────────────────────────────────────────────────────────

export interface LoyaltySpinGrantResult {
  state: LoyaltySpinGrantState;
  /** Spin produit (spun) ou déjà produit (already_consumed) ; null sinon. */
  spinId: string | null;
  wheelId: string | null;
  prizeId: string | null;
  isLosing: boolean;
}

/**
 * Convertit le jsonb de consume_loyalty_spin_grant en résultat typé, avec les
 * mêmes garanties de robustesse que mapLoyaltyStampResult (jsonb non reconnu
 * → `unavailable`).
 */
export function mapLoyaltySpinGrant(raw: unknown): LoyaltySpinGrantResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: LoyaltySpinGrantState =
    stateRaw && (LOYALTY_SPIN_GRANT_STATES as string[]).includes(stateRaw)
      ? (stateRaw as LoyaltySpinGrantState)
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
// Niveau dérivé du compteur de visites (pur, testable)
// ────────────────────────────────────────────────────────────

/** Niveau d'un passeport pour un compteur de visites et des seuils donnés. */
export function loyaltyTierForVisits(
  visitCount: number,
  silverThreshold: number,
  goldThreshold: number,
): LoyaltyTier {
  if (visitCount >= goldThreshold) return "gold";
  if (visitCount >= silverThreshold) return "silver";
  return "bronze";
}
