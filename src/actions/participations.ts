"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserAndOrg } from "@/lib/auth";
import { expireGoogleWalletPass } from "@/lib/google-wallet";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeHuntCode,
  normalizeJackpotCode,
  normalizeLoyaltyCode,
  normalizeRedeemCode,
  sanitizeSearchTerm,
  type ActionResult,
} from "@/lib/utils";
import { huntRedeemCodeSchema } from "@/lib/validations/hunts";
import { jackpotRedeemCodeSchema } from "@/lib/validations/jackpot";
import { loyaltyRedeemCodeSchema } from "@/lib/validations/loyalty";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";

export interface CashierParticipation {
  id: string;
  created_at: string;
  first_name: string | null;
  redeem_code: string | null;
  redeemed_at: string | null;
  /** Échéance SERVEUR du code (null : sans limite). */
  redeem_expires_at: string | null;
  cancelled_at: string | null;
  basket_cents: number | null;
  prizes: { label: string; description: string } | null;
  campaigns: { name: string } | null;
}

export async function lookupParticipationByCode(
  code: string,
): Promise<CashierParticipation | null> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  const allowed = await rateLimit(
    rateLimitBucket("cashier:lookup", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return null;
  const { data } = await createAdminClient()
    .from("participations")
    .select(
      "id, created_at, first_name, redeem_code, redeemed_at, redeem_expires_at, cancelled_at, basket_cents, prizes!participations_prize_id_fkey(label, description), campaigns!participations_campaign_id_fkey(name)",
    )
    .eq("organization_id", organization.id)
    .eq("redeem_code", code)
    .limit(1)
    .maybeSingle();
  return data as unknown as CashierParticipation | null;
}

/** « 12,50 » / « 12.50 » / « 12 » → centimes (null si vide). */
function parseBasketToCents(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) return undefined;
  return Math.round(value * 100);
}

const redeemSchema = z.object({ id: z.string().uuid() });

/**
 * Marque un gain comme récupéré (présenté en caisse), avec montant du
 * panier facultatif. L'expiration et l'annulation sont vérifiées par la
 * RPC en base — le compte à rebours client n'est qu'un affichage.
 */
export async function redeemParticipation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = redeemSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const basketCents = parseBasketToCents(String(formData.get("basket") ?? ""));
  if (basketCents === undefined) {
    return { ok: false, error: "Montant du panier invalide" };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const allowed = await rateLimit(
    rateLimitBucket("cashier:redeem", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };
  const admin = createAdminClient();
  const { data: target } = await admin
    .from("participations")
    .select("redeem_code")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!target?.redeem_code) return { ok: false, error: "Gain introuvable" };
  const { data: rows, error } = await admin.rpc("redeem_by_code", {
    p_organization_id: organization.id,
    p_redeem_code: target.redeem_code,
    p_actor: user.id,
    p_basket_cents: basketCents,
  });

  if (error) {
    console.error("[participations] redeem:", error.message);
    return { ok: false, error: "Validation impossible" };
  }
  const row = (rows as Array<{
    redeemed_now: boolean;
    redeemed_at: string | null;
    redeem_expires_at: string | null;
    cancelled_at: string | null;
  }> | null)?.[0];
  if (!row?.redeemed_now) {
    // La base a refusé : dire précisément pourquoi à la caisse.
    if (row?.cancelled_at) return { ok: false, error: "Ce gain a été annulé" };
    if (
      row &&
      row.redeemed_at === null &&
      row.redeem_expires_at &&
      new Date(row.redeem_expires_at).getTime() <= Date.now()
    ) {
      return { ok: false, error: "Code expiré — le délai de retrait est dépassé" };
    }
    return { ok: false, error: "Ce gain a déjà été validé" };
  }

  // Le pass Google Wallet du client est invalidé (best-effort).
  void expireGoogleWalletPass(target.redeem_code);

  revalidatePath("/dashboard/participations");
  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}

const cancelSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(5, "Motif requis (5 caractères minimum)").max(300),
});

/**
 * Annule un gain réclamé mais pas encore retiré (fraude, erreur,
 * rupture) : motif journalisé, lot remis en stock, code désactivé,
 * pass Wallet invalidé.
 */
export async function cancelParticipation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: "Action non autorisée" };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("participations")
    .select("redeem_code")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  const { data: cancelled, error } = await admin.rpc("cancel_participation", {
    p_organization_id: organization.id,
    p_participation_id: parsed.data.id,
    p_reason: parsed.data.reason,
    p_restock: true,
  });
  if (error) {
    console.error("[participations] cancel:", error.message);
    return { ok: false, error: "Annulation impossible" };
  }
  if (cancelled !== true) {
    return {
      ok: false,
      error: "Ce gain est déjà retiré ou annulé — plus rien à annuler.",
    };
  }

  if (target?.redeem_code) void expireGoogleWalletPass(target.redeem_code);

  revalidatePath("/dashboard/participations");
  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}

// ────────────────────────────────────────────────────────────
// Caisse unifiée : lot de roue (participation) OU chasse au trésor
// ────────────────────────────────────────────────────────────

/** Complétion de chasse retrouvée en caisse par son code (CHASSE-…). */
export interface CashierHuntCompletion {
  id: string;
  code: string;
  completed_at: string;
  redeemed_at: string | null;
  hunt_name: string;
  reward_label: string;
  reward_details: string | null;
}

/** Lot de fidélité retrouvé en caisse par son code (FIDELITE-…). */
export interface CashierLoyaltyReward {
  id: string;
  code: string;
  earned_at: string;
  redeemed_at: string | null;
  program_name: string;
  reward_label: string;
  reward_details: string | null;
}

/** Gain de jackpot retrouvé en caisse par son code (JACKPOT-…). */
export interface CashierJackpotWin {
  id: string;
  code: string;
  drawn_at: string;
  redeemed_at: string | null;
  campaign_name: string;
  reward_label: string;
  reward_details: string | null;
}

/**
 * Résultat unifié d'une recherche de code en caisse. L'UI distingue le lot
 * de roue, la chasse au trésor, le passeport de fidélité et le jackpot par
 * `source`.
 */
export type CashierMatch =
  | { source: "wheel"; participation: CashierParticipation }
  | { source: "hunt"; completion: CashierHuntCompletion }
  | { source: "loyalty"; reward: CashierLoyaltyReward }
  | { source: "jackpot"; win: CashierJackpotWin };

/** Recherche une complétion de chasse par son code (org-scopée). */
export async function lookupHuntCompletionByCode(
  code: string,
): Promise<CashierHuntCompletion | null> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  const allowed = await rateLimit(
    rateLimitBucket("cashier:lookup", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return null;

  const admin = createAdminClient();
  // hunt_completions n'a pas de FK directe vers hunts (seulement vers
  // hunt_players) : deux requêtes org-scopées plutôt qu'un embed.
  const { data: completion } = await admin
    .from("hunt_completions")
    .select("id, code, hunt_id, completed_at, redeemed_at")
    .eq("organization_id", organization.id)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (!completion) return null;

  const { data: hunt } = await admin
    .from("hunts")
    .select("name, reward_label, reward_details")
    .eq("id", completion.hunt_id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  return {
    id: completion.id,
    code: completion.code,
    completed_at: completion.completed_at,
    redeemed_at: completion.redeemed_at,
    hunt_name: hunt?.name ?? "Chasse supprimée",
    reward_label: hunt?.reward_label ?? "",
    reward_details: hunt?.reward_details ?? null,
  };
}

/** Recherche un lot de fidélité par son code (org-scopée). */
export async function lookupLoyaltyRewardByCode(
  code: string,
): Promise<CashierLoyaltyReward | null> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  const allowed = await rateLimit(
    rateLimitBucket("cashier:lookup", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return null;

  const admin = createAdminClient();
  // Le libellé du lot vit sur le palier, le nom sur le programme : on lit la
  // récompense (code FIDELITE-…) puis ces deux références, org-scopées.
  const { data: reward } = await admin
    .from("loyalty_rewards")
    .select("id, code, earned_at, redeemed_at, program_id, milestone_id")
    .eq("organization_id", organization.id)
    .eq("reward_type", "lot")
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (!reward) return null;

  const [{ data: program }, { data: milestone }] = await Promise.all([
    admin
      .from("loyalty_programs")
      .select("name")
      .eq("id", reward.program_id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    admin
      .from("loyalty_milestones")
      .select("reward_label, reward_details")
      .eq("id", reward.milestone_id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ]);

  return {
    id: reward.id,
    code: reward.code,
    earned_at: reward.earned_at,
    redeemed_at: reward.redeemed_at,
    program_name: program?.name ?? "Programme supprimé",
    reward_label: milestone?.reward_label ?? "",
    reward_details: milestone?.reward_details ?? null,
  };
}

/** Recherche un gain de jackpot par son code (org-scopée). */
export async function lookupJackpotWinByCode(
  code: string,
): Promise<CashierJackpotWin | null> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  const allowed = await rateLimit(
    rateLimitBucket("cashier:lookup", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return null;

  const admin = createAdminClient();
  // Le libellé du lot et le nom vivent sur la campagne : on lit le gain
  // (code JACKPOT-…) puis la campagne, org-scopés.
  const { data: win } = await admin
    .from("jackpot_wins")
    .select("id, code, drawn_at, redeemed_at, campaign_id")
    .eq("organization_id", organization.id)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (!win) return null;

  const { data: campaign } = await admin
    .from("jackpot_campaigns")
    .select("name, reward_label, reward_details")
    .eq("id", win.campaign_id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  return {
    id: win.id,
    code: win.code,
    drawn_at: win.drawn_at,
    redeemed_at: win.redeemed_at,
    campaign_name: campaign?.name ?? "Campagne supprimée",
    reward_label: campaign?.reward_label ?? "",
    reward_details: campaign?.reward_details ?? null,
  };
}

/**
 * Vrai si la saisie porte le préfixe CHASSE explicite (par opposition à un
 * code nu de 8 caractères). Même nettoyage que normalizeHuntCode, pour rester
 * cohérent avec sa lecture de l'entrée.
 */
function hasHuntPrefix(rawCode: string): boolean {
  return sanitizeSearchTerm(rawCode)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .startsWith("CHASSE");
}

/** Vrai si la saisie porte le préfixe FIDELITE explicite (miroir hunt). */
function hasLoyaltyPrefix(rawCode: string): boolean {
  return sanitizeSearchTerm(rawCode)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .startsWith("FIDELITE");
}

/** Vrai si la saisie porte le préfixe JACKPOT explicite (miroir hunt). */
function hasJackpotPrefix(rawCode: string): boolean {
  return sanitizeSearchTerm(rawCode)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .startsWith("JACKPOT");
}

/**
 * Recherche unifiée d'un code en caisse : lot de roue (GAIN-…) ou chasse au
 * trésor (CHASSE-…). Routage par TYPE de code.
 *
 * Les deux formats partagent EXACTEMENT le même suffixe — 8 caractères de
 * l'alphabet [A-HJ-NP-Z2-9] (roue : RPC claim_prize ; chasse :
 * record_hunt_scan) — donc seul le préfixe désambiguïse de façon fiable.
 * `normalizeRedeemCode` est permissif (il renvoie « GAIN-<saisie> » pour
 * presque toute entrée, CHASSE-… compris) : on NE peut PAS l'utiliser pour
 * router. `normalizeHuntCode` est au contraire strict — forme chasse valide
 * uniquement, codes GAIN-… rejetés — d'où l'ordre retenu :
 *
 *  1. chasse d'abord : un code GAIN-… (rejeté par normalizeHuntCode) tombe
 *     directement en roue et conserve son comportement historique.
 *  2. si l'entrée porte le préfixe CHASSE explicite, il FAIT AUTORITÉ : on ne
 *     retombe jamais sur la roue (hasHuntPrefix), même si aucune chasse ne
 *     correspond — un code chasse n'est jamais un lot de roue.
 *
 * Code NU (sans préfixe, ex. « ABCD2345 ») : réellement ambigu car il matche
 * les deux formats. Tie-break documenté — la chasse est tentée d'abord, la
 * roue en repli. En pratique un vrai code encodé en QR/pass porte toujours son
 * préfixe ; ce chemin ne concerne que la saisie manuelle abrégée.
 */
export async function lookupRedeemCode(rawCode: string): Promise<CashierMatch | null> {
  const huntCode = normalizeHuntCode(rawCode);
  if (huntCode) {
    const completion = await lookupHuntCompletionByCode(huntCode);
    if (completion) return { source: "hunt", completion };
    // Préfixe CHASSE explicite : autorité → pas de repli.
    if (hasHuntPrefix(rawCode)) return null;
  }

  // Fidélité : forme stricte FIDELITE-… (normalizeLoyaltyCode rejette GAIN-/
  // CHASSE-). Même logique d'autorité de préfixe que la chasse.
  const loyaltyCode = normalizeLoyaltyCode(rawCode);
  if (loyaltyCode) {
    const reward = await lookupLoyaltyRewardByCode(loyaltyCode);
    if (reward) return { source: "loyalty", reward };
    if (hasLoyaltyPrefix(rawCode)) return null;
  }

  // Jackpot : forme stricte JACKPOT-… (normalizeJackpotCode rejette GAIN-/
  // CHASSE-/FIDELITE-). Même logique d'autorité de préfixe que la chasse.
  const jackpotCode = normalizeJackpotCode(rawCode);
  if (jackpotCode) {
    const win = await lookupJackpotWinByCode(jackpotCode);
    if (win) return { source: "jackpot", win };
    if (hasJackpotPrefix(rawCode)) return null;
  }

  const gainCode = normalizeRedeemCode(rawCode);
  if (gainCode) {
    const participation = await lookupParticipationByCode(gainCode);
    if (participation) return { source: "wheel", participation };
  }

  return null;
}

/**
 * Valide en caisse la remise d'un lot de fidélité via la RPC dédiée
 * redeem_loyalty_reward (atomique, auditée, org-scopée), miroir de
 * redeemHuntCompletion. Un code inconnu ou d'une autre organisation ne
 * renvoie aucune ligne.
 */
export async function redeemLoyaltyReward(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loyaltyRedeemCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { ok: false, error: "Code de retrait invalide" };

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const allowed = await rateLimit(
    rateLimitBucket("cashier:redeem", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };

  const { data: rows, error } = await createAdminClient().rpc(
    "redeem_loyalty_reward",
    {
      p_organization_id: organization.id,
      p_code: parsed.data,
      p_actor: user.id,
    },
  );
  if (error) {
    console.error("[loyalty] redeem:", error.message);
    return { ok: false, error: "Validation impossible" };
  }

  const row = (rows as Array<{ redeemed_now: boolean }> | null)?.[0];
  if (!row) return { ok: false, error: "Code introuvable" };
  if (!row.redeemed_now) return { ok: false, error: "Ce lot a déjà été remis" };

  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}

/**
 * Valide en caisse la remise d'un gain de jackpot via la RPC dédiée
 * redeem_jackpot_prize (atomique, auditée, org-scopée), miroir de
 * redeemLoyaltyReward. Un code inconnu ou d'une autre organisation ne renvoie
 * aucune ligne.
 */
export async function redeemJackpotPrize(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = jackpotRedeemCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { ok: false, error: "Code de retrait invalide" };

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const allowed = await rateLimit(
    rateLimitBucket("cashier:redeem", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };

  const { data: rows, error } = await createAdminClient().rpc(
    "redeem_jackpot_prize",
    {
      p_organization_id: organization.id,
      p_code: parsed.data,
      p_actor: user.id,
    },
  );
  if (error) {
    console.error("[jackpot] redeem:", error.message);
    return { ok: false, error: "Validation impossible" };
  }

  const row = (rows as Array<{ redeemed_now: boolean }> | null)?.[0];
  if (!row) return { ok: false, error: "Code introuvable" };
  if (!row.redeemed_now) return { ok: false, error: "Ce lot a déjà été remis" };

  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}

/**
 * Valide en caisse la remise d'un lot de chasse au trésor via la RPC
 * dédiée redeem_hunt_completion (atomique, auditée, org-scopée). Un code
 * inconnu ou d'une autre organisation ne renvoie aucune ligne.
 */
export async function redeemHuntCompletion(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = huntRedeemCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { ok: false, error: "Code de retrait invalide" };

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const allowed = await rateLimit(
    rateLimitBucket("cashier:redeem", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };

  const { data: rows, error } = await createAdminClient().rpc(
    "redeem_hunt_completion",
    {
      p_organization_id: organization.id,
      p_code: parsed.data,
      p_actor: user.id,
    },
  );
  if (error) {
    console.error("[hunts] redeem:", error.message);
    return { ok: false, error: "Validation impossible" };
  }

  const row = (rows as Array<{ redeemed_now: boolean }> | null)?.[0];
  if (!row) return { ok: false, error: "Code introuvable" };
  if (!row.redeemed_now) return { ok: false, error: "Ce lot a déjà été remis" };

  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}
