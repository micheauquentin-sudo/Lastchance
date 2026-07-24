/**
 * Cœur métier « pur » du module Parrainage ludique : mapping des jsonb renvoyés
 * par les RPC service_role (ensure_referral_sponsor, referral_public_state,
 * validate_referral, consume_referral_spin_grant) vers des résultats typés pour
 * l'UI. Fonctions testables sans accès base ni imports server-only (miroir de
 * src/lib/calendar.ts, src/lib/loyalty.ts et src/lib/event.ts).
 *
 * DÉFENSIF : aucune confiance dans la forme du jsonb (défauts sûrs sur toute
 * valeur manquante ou invalide). Un jsonb non reconnu retombe sur l'état neutre
 * `unavailable`. La RPC referral_public_state filtre déjà les versements à CE
 * parrain (jamais ceux d'un autre) ; le mapping ne fait que recopier ce qu'elle
 * expose, sans jamais l'élargir.
 */

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

/** Nature d'un versement de parrainage (miroir du CHECK SQL). */
export type ReferralRewardKind = "none" | "spin" | "lot";

function asRewardKind(value: unknown): ReferralRewardKind {
  return value === "spin" ? "spin" : value === "lot" ? "lot" : "none";
}

/** Bénéficiaire d'un versement (miroir du CHECK SQL). */
export type ReferralBeneficiary = "sponsor" | "filleul" | "chest";

function asBeneficiary(value: unknown): ReferralBeneficiary {
  return value === "filleul" ? "filleul" : value === "chest" ? "chest" : "sponsor";
}

// ────────────────────────────────────────────────────────────
// Config publique du programme (labels/kinds, jamais de stock/compteur)
// ────────────────────────────────────────────────────────────

/**
 * Configuration PUBLIQUE d'un programme telle que servie au joueur : uniquement
 * les libellés et natures des 3 versements. Ni stock, ni compteur, ni plafond
 * n'y figurent (jamais exposés au parcours joueur). Présente à l'identique dans
 * `program` d'ensure_referral_sponsor et de referral_public_state.
 */
export interface ReferralProgramPublic {
  sponsorRewardKind: ReferralRewardKind;
  sponsorRewardLabel: string;
  filleulRewardKind: ReferralRewardKind;
  filleulRewardLabel: string;
  chestRewardKind: ReferralRewardKind;
  chestRewardLabel: string;
}

function mapReferralProgramPublic(raw: unknown): ReferralProgramPublic | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  return {
    sponsorRewardKind: asRewardKind(rec.sponsor_reward_kind),
    sponsorRewardLabel: asString(rec.sponsor_reward_label) ?? "",
    filleulRewardKind: asRewardKind(rec.filleul_reward_kind),
    filleulRewardLabel: asString(rec.filleul_reward_label) ?? "",
    chestRewardKind: asRewardKind(rec.chest_reward_kind),
    chestRewardLabel: asString(rec.chest_reward_label) ?? "",
  };
}

// ────────────────────────────────────────────────────────────
// Versement émis (issue d'un `referral_emit_reward` embarqué)
// ────────────────────────────────────────────────────────────

/**
 * Issue d'UN versement de parrainage : sa nature, s'il a réellement été émis, et
 * la capacité produite — un code de retrait PARRAIN-… (`lot`), un jeton de tour
 * offert (`spin`), ou rien (rupture de stock / `none`). Jamais les deux à la
 * fois (contrainte SQL referral_rewards_shape_check).
 */
export interface ReferralRewardOutcome {
  kind: ReferralRewardKind;
  rewarded: boolean;
  /** `lot` émis : code de retrait PARRAIN-… présenté en caisse (null sinon). */
  code: string | null;
  /** `spin` émis : jeton à consommer sur la roue de la campagne (null sinon). */
  grant: string | null;
  /** `lot` en rupture de stock au moment de l'émission : aucun code. */
  outOfStock: boolean;
}

function mapRewardOutcome(raw: unknown): ReferralRewardOutcome | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  return {
    kind: asRewardKind(rec.kind),
    rewarded: rec.rewarded === true,
    code: asString(rec.code),
    grant: asString(rec.grant),
    outOfStock: rec.out_of_stock === true,
  };
}

// ────────────────────────────────────────────────────────────
// ensure_referral_sponsor — get-or-create du parrain
// ────────────────────────────────────────────────────────────

/** États racine d'ensure_referral_sponsor. */
export type ReferralSponsorState = "unavailable" | "ready";

export interface ReferralSponsorResult {
  state: ReferralSponsorState;
  /** Jeton partageable PR-… (null hors `ready`) — sert à bâtir le lien. */
  referralCode: string | null;
  /** Jauge de l'équipe (filleuls validés). */
  gauge: number;
  validatedCount: number;
  chestThreshold: number;
  /** Le coffre a-t-il déjà été versé à ce parrain ? */
  chestRewarded: boolean;
  /** Le parrain a-t-il fourni un email opt-in ? */
  hasEmail: boolean;
  /** Config publique du programme (labels/kinds), null hors `ready`. */
  program: ReferralProgramPublic | null;
}

const SPONSOR_STATES: readonly ReferralSponsorState[] = ["unavailable", "ready"];

/**
 * Convertit le jsonb d'ensure_referral_sponsor en résultat typé. Tout jsonb non
 * reconnu (ou state ≠ ready) retombe sur `unavailable` neutre (aucun oracle sur
 * l'indisponibilité du programme).
 */
export function mapReferralSponsor(raw: unknown): ReferralSponsorResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: ReferralSponsorState =
    stateRaw && (SPONSOR_STATES as string[]).includes(stateRaw)
      ? (stateRaw as ReferralSponsorState)
      : "unavailable";

  if (state !== "ready" || !root) {
    return {
      state: "unavailable",
      referralCode: null,
      gauge: 0,
      validatedCount: 0,
      chestThreshold: 0,
      chestRewarded: false,
      hasEmail: false,
      program: null,
    };
  }

  const validatedCount = asInt(root.validated_count) ?? 0;
  return {
    state: "ready",
    referralCode: asString(root.referral_code),
    gauge: asInt(root.gauge) ?? validatedCount,
    validatedCount,
    chestThreshold: asInt(root.chest_threshold) ?? 0,
    chestRewarded: root.chest_rewarded === true,
    hasEmail: root.has_email === true,
    program: mapReferralProgramPublic(root.program),
  };
}

// ────────────────────────────────────────────────────────────
// referral_public_state — état suivable du parrain (page + polling)
// ────────────────────────────────────────────────────────────

/**
 * Versement du parrain courant tel que servi sur la page suivable. La RPC ne
 * renvoie QUE ses propres versements (sponsor + chest) — jamais ceux d'un autre
 * device (non-fuite). Le mapping recopie sans élargir.
 */
export interface ReferralRewardView {
  beneficiary: ReferralBeneficiary;
  kind: ReferralRewardKind;
  /** `lot` : code de retrait PARRAIN-… (null pour un `spin`). */
  code: string | null;
  /** `spin` : jeton à consommer (null s'il l'a été, ou pour un `lot`). */
  spinGrantToken: string | null;
  grantConsumedAt: string | null;
  resultingSpinId: string | null;
  redeemedAt: string | null;
  outOfStock: boolean;
  createdAt: string | null;
}

export interface ReferralPublicState {
  state: "ok" | "unavailable";
  campaignId: string | null;
  gauge: number;
  validatedCount: number;
  chestThreshold: number;
  chestRewarded: boolean;
  /** Jeton partageable du parrain courant (null si pas encore parrain). */
  referralCode: string | null;
  program: ReferralProgramPublic | null;
  rewards: ReferralRewardView[];
}

function mapPublicReward(raw: unknown): ReferralRewardView | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  return {
    beneficiary: asBeneficiary(rec.beneficiary),
    kind: asRewardKind(rec.kind),
    code: asString(rec.code),
    spinGrantToken: asString(rec.spin_grant_token),
    grantConsumedAt: asString(rec.grant_consumed_at),
    resultingSpinId: asString(rec.resulting_spin_id),
    redeemedAt: asString(rec.redeemed_at),
    outOfStock: rec.out_of_stock === true,
    createdAt: asString(rec.created_at),
  };
}

/**
 * Convertit le jsonb de referral_public_state en état typé. Un jsonb non reconnu
 * (ou state ≠ ok) retombe sur `unavailable` neutre.
 */
export function mapReferralPublicState(raw: unknown): ReferralPublicState {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") {
    return {
      state: "unavailable",
      campaignId: null,
      gauge: 0,
      validatedCount: 0,
      chestThreshold: 0,
      chestRewarded: false,
      referralCode: null,
      program: null,
      rewards: [],
    };
  }

  const gauge = asInt(root.gauge) ?? 0;
  return {
    state: "ok",
    campaignId: asString(root.campaign_id),
    gauge,
    validatedCount: asInt(root.validated_count) ?? gauge,
    chestThreshold: asInt(root.chest_threshold) ?? 0,
    chestRewarded: root.chest_rewarded === true,
    referralCode: asString(root.referral_code),
    program: mapReferralProgramPublic(root.program),
    rewards: asArray(root.rewards).flatMap((entry) => {
      const reward = mapPublicReward(entry);
      return reward ? [reward] : [];
    }),
  };
}

// ────────────────────────────────────────────────────────────
// validate_referral — LE CŒUR (issue d'une validation de filleul)
// ────────────────────────────────────────────────────────────

/**
 * États racine de validate_referral tels que produits par le MAPPER : fidèles au
 * jsonb de la RPC (motifs de refus distincts), pour l'observabilité serveur et les
 * tests. Le mapper ne produit JAMAIS `rejected`.
 *
 * `rejected` est l'état de refus GÉNÉRIQUE — le SEUL motif de refus qui franchit la
 * frontière action → client : `validateReferral` écrase (redactReferralValidation)
 * tous les motifs internes (invalid, expired, capped, self_referral, duplicate,
 * loop, no_participation) en `rejected` AVANT de répondre. Aucun oracle réseau sur
 * l'existence ou l'état d'un code PR-… : seuls `validated`, `unavailable` et
 * `rejected` sortent de l'action.
 */
export type ReferralValidationState =
  | "validated"
  | "unavailable"
  | "rejected"
  | "invalid"
  | "expired"
  | "capped"
  | "self_referral"
  | "duplicate"
  | "loop"
  | "no_participation";

export interface ReferralValidationResult {
  state: ReferralValidationState;
  /** Jauge après validation (0 hors `validated`). */
  gauge: number;
  chestThreshold: number;
  /** Le versement sponsor a-t-il été réellement émis ? */
  sponsorRewarded: boolean;
  /** Le coffre a-t-il été débloqué par CETTE validation ? */
  chestUnlocked: boolean;
  /** Versement au parrain (null hors `validated`). */
  sponsorReward: ReferralRewardOutcome | null;
  /** Bonus de bienvenue du filleul (null hors `validated`). */
  filleulReward: ReferralRewardOutcome | null;
  /** Versement du coffre — non null uniquement si `chestUnlocked`. */
  chestReward: ReferralRewardOutcome | null;
}

const VALIDATION_STATES: readonly ReferralValidationState[] = [
  "validated",
  "unavailable",
  "invalid",
  "expired",
  "capped",
  "self_referral",
  "duplicate",
  "loop",
  "no_participation",
];

/**
 * Convertit le jsonb de validate_referral en issue typée. Tout jsonb non reconnu
 * retombe sur `unavailable` neutre. Les récompenses ne sont lues que sur
 * `validated` (défauts sûrs sinon) — aucun oracle sur le motif d'un refus.
 */
export function mapReferralValidation(raw: unknown): ReferralValidationResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: ReferralValidationState =
    stateRaw && (VALIDATION_STATES as string[]).includes(stateRaw)
      ? (stateRaw as ReferralValidationState)
      : "unavailable";

  if (state !== "validated" || !root) {
    return {
      state,
      gauge: 0,
      chestThreshold: 0,
      sponsorRewarded: false,
      chestUnlocked: false,
      sponsorReward: null,
      filleulReward: null,
      chestReward: null,
    };
  }

  return {
    state: "validated",
    gauge: asInt(root.gauge) ?? 0,
    chestThreshold: asInt(root.chest_threshold) ?? 0,
    sponsorRewarded: root.sponsor_rewarded === true,
    chestUnlocked: root.chest_unlocked === true,
    sponsorReward: mapRewardOutcome(root.sponsor_reward),
    filleulReward: mapRewardOutcome(root.filleul_reward),
    chestReward: mapRewardOutcome(root.chest_reward),
  };
}

/**
 * Vue CLIENT d'une issue de validation : écrase tout motif de refus interne
 * (invalid, expired, capped, self_referral, duplicate, loop, no_participation) en
 * un état générique `rejected` — aucun oracle réseau sur l'existence ou l'état d'un
 * code PR-…. `validated` (avec sa récompense filleul) et `unavailable`
 * (indisponibilité STRUCTURELLE du programme, déjà visible sur la page) sont
 * préservés tels quels. Hors `validated`, le mapper a DÉJÀ neutralisé jauge et
 * versements : seul l'état porte de l'information, et c'est lui qu'on masque.
 *
 * À appeler côté ACTION (la couche qui parle au client), jamais dans le mapper pur
 * `mapReferralValidation`, qui reste fidèle au jsonb pour l'observabilité serveur.
 */
export function redactReferralValidation(
  result: ReferralValidationResult,
): ReferralValidationResult {
  if (result.state === "validated" || result.state === "unavailable") {
    return result;
  }
  return { ...result, state: "rejected" };
}

// ────────────────────────────────────────────────────────────
// consume_referral_spin_grant (miroir de mapCalendarSpinGrant)
// ────────────────────────────────────────────────────────────

export type ReferralSpinGrantState =
  | "unavailable"
  | "already_consumed"
  | "no_prize"
  | "spun";

export interface ReferralSpinGrantResult {
  state: ReferralSpinGrantState;
  /** Spin produit (spun) ou déjà produit (already_consumed) ; null sinon. */
  spinId: string | null;
  wheelId: string | null;
  prizeId: string | null;
  isLosing: boolean;
}

const SPIN_GRANT_STATES: readonly ReferralSpinGrantState[] = [
  "unavailable",
  "already_consumed",
  "no_prize",
  "spun",
];

export function mapReferralSpinGrant(raw: unknown): ReferralSpinGrantResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: ReferralSpinGrantState =
    stateRaw && (SPIN_GRANT_STATES as string[]).includes(stateRaw)
      ? (stateRaw as ReferralSpinGrantState)
      : "unavailable";

  return {
    state,
    spinId: root ? asString(root.spin_id) : null,
    wheelId: root ? asString(root.wheel_id) : null,
    prizeId: root ? asString(root.prize_id) : null,
    isLosing: root?.is_losing === true,
  };
}
