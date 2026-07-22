"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserAndOrg } from "@/lib/auth";
import { expireGoogleWalletPass } from "@/lib/google-wallet";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeHuntCode,
  normalizeRedeemCode,
  type ActionResult,
} from "@/lib/utils";
import { huntRedeemCodeSchema } from "@/lib/validations/hunts";
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

/**
 * Résultat unifié d'une recherche de code en caisse. L'UI distingue le lot
 * de roue de la chasse au trésor par le champ `source`.
 */
export type CashierMatch =
  | { source: "wheel"; participation: CashierParticipation }
  | { source: "hunt"; completion: CashierHuntCompletion };

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

/**
 * Recherche unifiée d'un code en caisse : tente d'abord le flux
 * participation existant (GAIN-…), puis la chasse au trésor (CHASSE-…) si
 * aucun résultat. Les deux préfixes étant disjoints, la normalisation
 * route directement vers le bon flux.
 */
export async function lookupRedeemCode(rawCode: string): Promise<CashierMatch | null> {
  const gainCode = normalizeRedeemCode(rawCode);
  if (gainCode) {
    const participation = await lookupParticipationByCode(gainCode);
    if (participation) return { source: "wheel", participation };
    return null;
  }

  const huntCode = normalizeHuntCode(rawCode);
  if (huntCode) {
    const completion = await lookupHuntCompletionByCode(huntCode);
    if (completion) return { source: "hunt", completion };
  }
  return null;
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
