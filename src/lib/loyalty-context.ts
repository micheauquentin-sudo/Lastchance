import "server-only";

import { cookies } from "next/headers";
import { loyaltyTierForVisits } from "@/lib/loyalty";
import { hashPlayerToken } from "@/lib/pronostics";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasLoyaltyAccess } from "@/lib/subscription";
import type {
  LoyaltyMilestone,
  LoyaltyProgram,
  LoyaltyRewardType,
  LoyaltyTier,
  Organization,
} from "@/types/database";

type PublicLoyaltyOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "logo_url"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_loyalty"
  | "comp_access"
  | "comp_access_until"
  | "timezone"
>;

/** Programme sans le secret du code tournant (jamais exposé au client). */
export type PublicLoyaltyProgram = Omit<LoyaltyProgram, "rotating_secret">;

const ORG_COLUMNS =
  "id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_loyalty, comp_access, comp_access_until, timezone";

/** Colonnes publiques du programme — rotating_secret volontairement exclu. */
const PROGRAM_COLUMNS =
  "id, organization_id, name, status, validation_mode, rotating_period_seconds, min_stamp_interval_seconds, silver_threshold, gold_threshold, created_at";

/** Erreur générique unique : aucun oracle sur l'existence/l'état interne. */
const UNAVAILABLE = "Ce passeport de fidélité n'est pas disponible.";

/** Nom du cookie httpOnly portant le jeton joueur d'un programme. */
export function loyaltyTokenCookieName(programId: string): string {
  return `lc-loyalty-${programId}`;
}

/** Palier tel que présenté au joueur (config, sans compteurs internes). */
export interface LoyaltyMilestoneView {
  id: string;
  visitCount: number;
  rewardType: LoyaltyRewardType;
  rewardLabel: string;
  rewardDetails: string | null;
  targetWheelId: string | null;
  /** Palier lot dont le stock est épuisé (plus aucun code à émettre). */
  soldOut: boolean;
}

/** Récompense gagnée par le passeport courant (lot ou spin offert). */
export interface LoyaltyPassportReward {
  id: string;
  milestoneId: string;
  rewardType: LoyaltyRewardType;
  earnedAt: string;
  rewardLabel: string;
  rewardDetails: string | null;
  /** reward_type='lot' : code de retrait FIDELITE-… présenté en caisse. */
  code: string | null;
  redeemedAt: string | null;
  /** reward_type='spin' : jeton du tour offert (null si déjà consommé). */
  grantToken: string | null;
  consumedAt: string | null;
  resultingSpinId: string | null;
}

/**
 * État du passeport du joueur courant (cookie httpOnly) en LECTURE SEULE :
 * rien n'est écrit au rendu de la page. Aucun cookie/passeport → état vide.
 */
export interface LoyaltyPassportState {
  hasPassport: boolean;
  /**
   * Jeton plaintext du passeport (valeur du cookie) — rendu en QR pour que le
   * staff valide la visite (mode staff). null si aucun passeport encore établi.
   */
  memberToken: string | null;
  visitCount: number;
  tier: LoyaltyTier;
  rewards: LoyaltyPassportReward[];
}

interface ProgramWithOrg {
  program: PublicLoyaltyProgram;
  organization: PublicLoyaltyOrganization;
}

/**
 * Charge un programme + son organisation via la service role et VÉRIFIE la
 * cohérence inter-tenant (la service role contourne la RLS : chaque relation
 * doit pointer le même tenant). null si introuvable/incohérent.
 */
async function fetchProgramWithOrg(
  admin: ReturnType<typeof createAdminClient>,
  programId: string,
): Promise<ProgramWithOrg | null> {
  const { data } = await admin
    .from("loyalty_programs")
    .select(`${PROGRAM_COLUMNS}, organizations(${ORG_COLUMNS})`)
    .eq("id", programId)
    .maybeSingle();
  if (!data) return null;

  const row = data as unknown as PublicLoyaltyProgram & {
    organizations: PublicLoyaltyOrganization | null;
  };
  const org = row.organizations;
  if (!org || org.id !== row.organization_id) {
    console.error("[loyalty-context] organisation incohérente", { programId });
    return null;
  }
  const { organizations: _org, ...program } = row;
  void _org;
  return { program, organization: org };
}

function toMilestoneView(row: LoyaltyMilestone): LoyaltyMilestoneView {
  return {
    id: row.id,
    visitCount: row.visit_count,
    rewardType: row.reward_type,
    rewardLabel: row.reward_label,
    rewardDetails: row.reward_details,
    targetWheelId: row.target_wheel_id,
    soldOut:
      row.reward_type === "lot" &&
      row.reward_stock !== null &&
      row.reward_claimed_count >= row.reward_stock,
  };
}

/**
 * Passeport du joueur courant (cookie httpOnly) en lecture seule : compteur,
 * niveau (recalculé depuis les seuils courants), et récompenses gagnées (lots
 * + tours offerts). Aucun cookie/passeport → état vide.
 */
async function loadPassportState(
  admin: ReturnType<typeof createAdminClient>,
  program: PublicLoyaltyProgram,
): Promise<LoyaltyPassportState> {
  const empty: LoyaltyPassportState = {
    hasPassport: false,
    memberToken: null,
    visitCount: 0,
    tier: "bronze",
    rewards: [],
  };

  const store = await cookies();
  const token = store.get(loyaltyTokenCookieName(program.id))?.value;
  if (!token) return empty;

  const { data: member } = await admin
    .from("loyalty_members")
    .select("id, visit_count")
    .eq("program_id", program.id)
    .eq("token_hash", hashPlayerToken(token))
    .maybeSingle();
  // Cookie présent mais aucun passeport en base (mode staff avant la première
  // validation) : l'identité existe déjà (le QR peut être affiché) mais le
  // compteur reste à zéro.
  if (!member) {
    return { ...empty, hasPassport: true, memberToken: token };
  }

  const { data: rewardRows } = await admin
    .from("loyalty_rewards")
    .select(
      "id, milestone_id, reward_type, earned_at, code, redeemed_at, grant_token, consumed_at, resulting_spin_id",
    )
    .eq("member_id", member.id)
    .order("earned_at", { ascending: false });

  // Libellés portés par le palier (loyalty_rewards ne les dénormalise pas) :
  // un seul aller-retour, borné (≤ 1000 paliers/programme via le CHECK SQL).
  const milestoneIds = [
    ...new Set((rewardRows ?? []).map((r) => r.milestone_id as string)),
  ];
  const labels = new Map<string, { label: string; details: string | null }>();
  if (milestoneIds.length > 0) {
    const { data: ms } = await admin
      .from("loyalty_milestones")
      .select("id, reward_label, reward_details")
      .in("id", milestoneIds);
    for (const m of ms ?? []) {
      labels.set(m.id as string, {
        label: (m.reward_label as string) ?? "",
        details: (m.reward_details as string | null) ?? null,
      });
    }
  }

  const rewards: LoyaltyPassportReward[] = (rewardRows ?? []).map((r) => {
    const meta = labels.get(r.milestone_id as string);
    return {
      id: r.id as string,
      milestoneId: r.milestone_id as string,
      rewardType: r.reward_type as LoyaltyRewardType,
      earnedAt: r.earned_at as string,
      rewardLabel: meta?.label ?? "",
      rewardDetails: meta?.details ?? null,
      code: (r.code as string | null) ?? null,
      redeemedAt: (r.redeemed_at as string | null) ?? null,
      grantToken: (r.grant_token as string | null) ?? null,
      consumedAt: (r.consumed_at as string | null) ?? null,
      resultingSpinId: (r.resulting_spin_id as string | null) ?? null,
    };
  });

  return {
    hasPassport: true,
    memberToken: token,
    visitCount: member.visit_count as number,
    tier: loyaltyTierForVisits(
      member.visit_count as number,
      program.silver_threshold,
      program.gold_threshold,
    ),
    rewards,
  };
}

export type LoyaltyContext =
  | { ok: false; error: string }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      program: PublicLoyaltyProgram;
      organization: PublicLoyaltyOrganization;
      milestones: LoyaltyMilestoneView[];
      passport: LoyaltyPassportState;
    };

/**
 * Contexte public de la page passeport : résout programme → organisation
 * (service role + gardes inter-tenant), vérifie addon + abonnement + statut
 * actif, charge les paliers et l'état du passeport du joueur courant en
 * lecture seule. Réponse générique unique en cas d'invalidité (404 côté
 * page) — pas d'oracle sur le motif.
 */
export async function loadLoyaltyContext(
  programId: string,
): Promise<LoyaltyContext> {
  const admin = createAdminClient();

  const resolved = await fetchProgramWithOrg(admin, programId);
  if (!resolved) return { ok: false, error: UNAVAILABLE };
  const { program, organization } = resolved;

  if (!hasLoyaltyAccess(organization)) return { ok: false, error: UNAVAILABLE };
  if (program.status !== "active") return { ok: false, error: UNAVAILABLE };

  const { data: milestoneRows } = await admin
    .from("loyalty_milestones")
    .select(
      "id, program_id, organization_id, visit_count, reward_type, reward_label, reward_details, reward_stock, reward_claimed_count, target_wheel_id, position, created_at",
    )
    .eq("program_id", program.id)
    .order("visit_count", { ascending: true });

  const milestones = ((milestoneRows as LoyaltyMilestone[] | null) ?? []).map(
    toMilestoneView,
  );
  const passport = await loadPassportState(admin, program);

  return { ok: true, admin, program, organization, milestones, passport };
}
