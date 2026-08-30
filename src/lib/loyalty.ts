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
  /**
   * LE SOLDE DÉPENSABLE après ce tampon (`points_balance`). C'est la valeur
   * que l'écran affiche en tête du passeport : sans elle, le solde n'aurait
   * bougé qu'au rechargement suivant, alors que la base vient de le créditer.
   */
  pointsBalance: number;
  /** Le CUMUL gagné après ce tampon — l'assiette du niveau, jamais le solde. */
  pointsEarnedTotal: number;
  tier: LoyaltyTier;
  tierThresholds: { silver: number; gold: number };
  /**
   * `true` ⇔ CE tampon a CRÉÉ le passeport (source de vérité : le drapeau
   * `is_new_member` de record_loyalty_stamp, capté par FOUND juste après
   * l'insert on-conflict-do-nothing — donc sans course).
   *
   * Deux usages : l'écran de caisse distingue « nouveau client » de « client
   * connu », et le backend ne compte que des créations RÉELLES (jamais des
   * tentatives) dans ses compteurs d'observabilité. Toujours `false` sur
   * `unavailable` / `invalid_code`, qui ne créent aucun passeport.
   */
  isNewMember: boolean;
  /** Paliers NOUVELLEMENT atteints lors de ce tampon (vide sinon). */
  milestonesReached: LoyaltyMilestoneReached[];
  /** Prochain palier au-dessus du compteur courant (null si aucun). */
  nextMilestone: { visitCount: number; rewardType: LoyaltyRewardType } | null;
  /** Secondes avant de pouvoir retamponner (`too_soon`). */
  retryInSeconds: number | null;
}

/**
 * LISTE BLANCHE des états rendus par `record_loyalty_stamp` — et c'est bien
 * une liste blanche, pas une documentation : `mapLoyaltyStampResult` retombe
 * sur `unavailable` pour TOUT état absent d'ici (voir plus bas). Un état neuf
 * ajouté en SQL et oublié ici est donc AVALÉ EN SILENCE — le joueur lit
 * « passeport indisponible » là où la base disait autre chose, et rien ne
 * rougit.
 *
 * `loyalty.test.ts` compare cette liste aux `jsonb_build_object('state', …)`
 * de la dernière migration qui définit la RPC : l'oubli devient rouge.
 */
export const LOYALTY_STAMP_STATES: readonly LoyaltyStampState[] = [
  "unavailable",
  "invalid_code",
  "order_invalid",
  "too_soon",
  "stamped",
];

// Le MESSAGE joueur de `order_invalid` vit dans
// `src/components/loyalty/tampon-commande-state.ts`, avec ceux des autres
// états : une seule formulation par état, un seul endroit. Ce module ne
// traduit pas, il mappe.

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
    pointsBalance: (root ? asInt(root.points_balance) : null) ?? 0,
    pointsEarnedTotal: (root ? asInt(root.points_earned_total) : null) ?? 0,
    tier: asTier(root?.tier),
    tierThresholds,
    isNewMember: root?.is_new_member === true,
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
// Résultat d'un ÉCHANGE de points (mapping du jsonb spend_loyalty_points)
// ────────────────────────────────────────────────────────────

/**
 * États nommés de `spend_loyalty_points`. LISTE BLANCHE, au même titre que
 * `LOYALTY_STAMP_STATES` : un état absent d'ici est ramené à `inactive`, le
 * refus le plus neutre — jamais à `spent`, qui ferait croire à un achat.
 */
export const LOYALTY_SPEND_STATES = [
  "spent",
  "insufficient_points",
  "out_of_stock",
  "unknown_milestone",
  "inactive",
  "not_a_member",
] as const;

export type LoyaltySpendState = (typeof LOYALTY_SPEND_STATES)[number];

export interface LoyaltySpendResult {
  state: LoyaltySpendState;
  /** `spent` : la récompense existait déjà (même request_id rejoué). */
  idempotent: boolean;
  rewardId: string | null;
  milestoneId: string | null;
  rewardType: LoyaltyRewardType;
  /** Absent du rejeu idempotent : la RPC n'y relit pas le palier. */
  rewardLabel: string | null;
  rewardDetails: string | null;
  targetWheelId: string | null;
  /** `lot` acheté : code de retrait FIDELITE-… */
  code: string | null;
  /** `spin` acheté : jeton du tour offert. */
  grantToken: string | null;
  /** Points réellement débités (gravés sur la récompense). */
  spentPoints: number | null;
  /** Solde APRÈS l'opération — ce que l'écran doit afficher tout de suite. */
  pointsBalance: number | null;
  pointsEarnedTotal: number | null;
  /** `insufficient_points` : ce qui manque, exactement. */
  pointsMissing: number | null;
  /** Prix du palier visé, tel que la base l'a lu (refus chiffrés). */
  costPoints: number | null;
}

/**
 * Convertit le jsonb de `spend_loyalty_points`, sans jamais faire confiance à
 * sa forme. Ce module ne TRADUIT pas : les phrases françaises des refus vivent
 * chez l'appelant, avec les autres messages joueur du module.
 */
export function mapLoyaltySpendResult(raw: unknown): LoyaltySpendResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: LoyaltySpendState =
    stateRaw && (LOYALTY_SPEND_STATES as readonly string[]).includes(stateRaw)
      ? (stateRaw as LoyaltySpendState)
      : "inactive";

  return {
    state,
    idempotent: root?.idempotent === true,
    rewardId: root ? asString(root.reward_id) : null,
    milestoneId: root ? asString(root.milestone_id) : null,
    rewardType: asRewardType(root?.reward_type),
    rewardLabel: root ? asString(root.reward_label) : null,
    rewardDetails: root ? asString(root.reward_details) : null,
    targetWheelId: root ? asString(root.target_wheel_id) : null,
    code: root ? asString(root.code) : null,
    grantToken: root ? asString(root.grant_token) : null,
    spentPoints: root ? asInt(root.spent_points) : null,
    pointsBalance: root ? asInt(root.points_balance) : null,
    pointsEarnedTotal: root ? asInt(root.points_earned_total) : null,
    pointsMissing: root ? asInt(root.points_missing) : null,
    costPoints: root ? asInt(root.cost_points) : null,
  };
}

// ────────────────────────────────────────────────────────────
// Niveau dérivé du compteur porteur du rang (pur, testable)
// ────────────────────────────────────────────────────────────

/**
 * Niveau d'un passeport pour un compteur et des seuils donnés.
 *
 * Depuis 20261114120000 le compteur passé est `points_earned_total` — le CUMUL
 * gagné — et les seuils sont en points. Le SOLDE ne doit jamais être passé
 * ici : dépenser ses points ferait redescendre de niveau.
 */
export function loyaltyTierForVisits(
  visitCount: number,
  silverThreshold: number,
  goldThreshold: number,
): LoyaltyTier {
  if (visitCount >= goldThreshold) return "gold";
  if (visitCount >= silverThreshold) return "silver";
  return "bronze";
}
