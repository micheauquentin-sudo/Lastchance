"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import {
  huntTokenCookieName,
  loadHuntClaimContext,
  loadHuntStepContext,
} from "@/lib/hunt-context";
import {
  firstFreeStepPosition,
  mapHuntScanResult,
  planReorder,
  type HuntScanResult,
} from "@/lib/hunts";
import { monitored, reportError } from "@/lib/monitoring";
import { generatePlayerToken, hashPlayerToken } from "@/lib/pronostics";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { sendHuntRewardEmail } from "@/lib/resend";
import { createClient } from "@/lib/supabase/server";
import { hasHuntsAccess } from "@/lib/subscription";
import { randomCode, type ActionResult } from "@/lib/utils";
import {
  claimHuntRewardSchema,
  createHuntSchema,
  createHuntStepSchema,
  deleteHuntSchema,
  deleteHuntStepSchema,
  reorderHuntStepsSchema,
  setHuntStatusSchema,
  stampHuntStepSchema,
  updateHuntSchema,
  updateHuntStepSchema,
} from "@/lib/validations/hunts";

// ────────────────────────────────────────────────────────────
// Dashboard commerçant (session + RLS éditeurs)
// ────────────────────────────────────────────────────────────

/** Durée de vie du cookie joueur d'une chasse (180 j, comme les pronos). */
const HUNT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

const NOT_EDITOR = "Action non autorisée";

export async function createHunt(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createHuntSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: hunt, error } = await supabase
    .from("hunts")
    .insert({ organization_id: organization.id, name: parsed.data.name })
    .select("id")
    .single();

  if (error || !hunt) {
    console.error("[hunts] create:", error?.message);
    return { ok: false, error: "Impossible de créer la chasse" };
  }

  revalidatePath("/dashboard/hunts");
  redirect(`/dashboard/hunts/${hunt.id}`);
}

/** Réglages d'une chasse (nom, ordre, délai, lot, stock, fenêtre). */
export async function updateHunt(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateHuntSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    order_mode: formData.get("order_mode"),
    min_scan_interval_seconds: formData.get("min_scan_interval_seconds") ?? 0,
    reward_label: formData.get("reward_label") ?? "",
    reward_details: formData.get("reward_details") ?? "",
    reward_stock: formData.get("reward_stock") ?? "",
    starts_at: formData.get("starts_at") ?? "",
    ends_at: formData.get("ends_at") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("hunts")
    .update(fields)
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[hunts] update:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath("/dashboard/hunts");
  revalidatePath(`/dashboard/hunts/${id}`);
  return { ok: true, data: undefined };
}

/**
 * Change le statut d'une chasse. L'activation exige le module actif, au
 * moins 2 étapes et un lot final renseigné (mêmes gardes que l'activation
 * d'une campagne / d'un championnat).
 */
export async function setHuntStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setHuntStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const { id, status } = parsed.data;
  const supabase = await createClient();

  if (status === "active") {
    if (!hasHuntsAccess(organization)) {
      return {
        ok: false,
        error: "Le module Chasse au trésor n'est pas activé sur votre compte.",
      };
    }
    const { data: hunt } = await supabase
      .from("hunts")
      .select("reward_label")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle();
    if (!hunt) return { ok: false, error: "Chasse introuvable" };
    if (!hunt.reward_label.trim()) {
      return {
        ok: false,
        error: "Renseignez le lot final avant d'activer la chasse.",
      };
    }
    const { count } = await supabase
      .from("hunt_steps")
      .select("id", { count: "exact", head: true })
      .eq("hunt_id", id)
      .eq("organization_id", organization.id);
    if ((count ?? 0) < 2) {
      return {
        ok: false,
        error: "Ajoutez au moins 2 étapes avant d'activer la chasse.",
      };
    }
  }

  const { error } = await supabase
    .from("hunts")
    .update({ status })
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[hunts] status:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath("/dashboard/hunts");
  revalidatePath(`/dashboard/hunts/${id}`);
  return { ok: true, data: undefined };
}

export async function deleteHunt(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteHuntSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { error } = await supabase
    .from("hunts")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[hunts] delete:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath("/dashboard/hunts");
  redirect("/dashboard/hunts");
}

// ── Étapes (une étape = un QR code) ──

export async function createHuntStep(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createHuntStepSchema.safeParse({
    hunt_id: formData.get("hunt_id"),
    label: formData.get("label"),
    hint: formData.get("hint") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: hunt } = await supabase
    .from("hunts")
    .select("id")
    .eq("id", parsed.data.hunt_id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!hunt) return { ok: false, error: "Chasse introuvable" };

  const { data: steps } = await supabase
    .from("hunt_steps")
    .select("position")
    .eq("hunt_id", parsed.data.hunt_id)
    .eq("organization_id", organization.id);
  const position = firstFreeStepPosition(
    (steps ?? []).map((s) => s.position as number),
  );
  if (position === null) {
    return { ok: false, error: "10 étapes maximum par chasse." };
  }

  const { error } = await supabase.from("hunt_steps").insert({
    hunt_id: parsed.data.hunt_id,
    organization_id: organization.id,
    position,
    label: parsed.data.label,
    hint_text: parsed.data.hint || null,
    // Jeton public non devinable (≥ 12 caractères, contrainte ^[A-Za-z0-9-]{8,64}$).
    token: randomCode(16),
  });

  if (error) {
    console.error("[hunts] create step:", error.message);
    return { ok: false, error: "Impossible d'ajouter l'étape" };
  }

  revalidatePath(`/dashboard/hunts/${parsed.data.hunt_id}`);
  return { ok: true, data: undefined };
}

export async function updateHuntStep(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateHuntStepSchema.safeParse({
    id: formData.get("id"),
    label: formData.get("label"),
    hint: formData.get("hint") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("hunt_steps")
    .update({ label: parsed.data.label, hint_text: parsed.data.hint || null })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .select("hunt_id")
    .maybeSingle();

  if (error) {
    console.error("[hunts] update step:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }
  if (!updated) return { ok: false, error: "Étape introuvable" };

  revalidatePath(`/dashboard/hunts/${updated.hunt_id}`);
  return { ok: true, data: undefined };
}

export async function deleteHuntStep(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteHuntStepSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: step } = await supabase
    .from("hunt_steps")
    .select("hunt_id")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!step) return { ok: false, error: "Étape introuvable" };

  // Une chasse active conserve au moins 2 étapes (invariant d'activation).
  const [{ data: hunt }, { count }] = await Promise.all([
    supabase
      .from("hunts")
      .select("status")
      .eq("id", step.hunt_id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("hunt_steps")
      .select("id", { count: "exact", head: true })
      .eq("hunt_id", step.hunt_id)
      .eq("organization_id", organization.id),
  ]);
  if (hunt?.status === "active" && (count ?? 0) <= 2) {
    return {
      ok: false,
      error:
        "Une chasse active garde au moins 2 étapes. Désactivez-la pour en retirer davantage.",
    };
  }

  const { error } = await supabase
    .from("hunt_steps")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);
  if (error) {
    console.error("[hunts] delete step:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath(`/dashboard/hunts/${step.hunt_id}`);
  return { ok: true, data: undefined };
}

/**
 * Réordonne les étapes d'une chasse selon la liste d'identifiants reçue.
 * Les positions sont réattribuées une par une vers un slot libre (aucun
 * état intermédiaire ne viole l'unicité). Le formulaire sérialise l'ordre
 * en JSON (champ caché), comme la saisie rapide des pronostics.
 */
export async function reorderHuntSteps(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let order: unknown;
  try {
    order = JSON.parse(String(formData.get("order") ?? "[]"));
  } catch {
    return { ok: false, error: "Données invalides" };
  }

  const parsed = reorderHuntStepsSchema.safeParse({
    hunt_id: formData.get("hunt_id"),
    order,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: steps } = await supabase
    .from("hunt_steps")
    .select("id, position")
    .eq("hunt_id", parsed.data.hunt_id)
    .eq("organization_id", organization.id);
  if (!steps || steps.length === 0) {
    return { ok: false, error: "Chasse introuvable" };
  }

  const moves = planReorder(
    steps.map((s) => ({ id: s.id as string, position: s.position as number })),
    parsed.data.order,
  );
  if (moves === null) {
    return {
      ok: false,
      error: "Réorganisation impossible en une fois : déplacez les étapes une par une.",
    };
  }

  for (const move of moves) {
    const { error } = await supabase
      .from("hunt_steps")
      .update({ position: move.position })
      .eq("id", move.id)
      .eq("hunt_id", parsed.data.hunt_id)
      .eq("organization_id", organization.id);
    if (error) {
      reportError("hunts.reorder", error.message);
      return { ok: false, error: "Réorganisation impossible" };
    }
  }

  revalidatePath(`/dashboard/hunts/${parsed.data.hunt_id}`);
  return { ok: true, data: undefined };
}

// ────────────────────────────────────────────────────────────
// Parcours public /hunt/[token] (anonyme, service role via contexte)
// ────────────────────────────────────────────────────────────

/**
 * Tamponne une étape. Le tampon se fait au POST du bouton (JAMAIS au GET :
 * anti-prefetch). Crée/lit le cookie joueur propre à la chasse, appelle la
 * RPC atomique record_hunt_scan et renvoie un résultat typé pour l'UI.
 */
export async function stampHuntStep(input: {
  stepToken: string;
}): Promise<ActionResult<HuntScanResult>> {
  return monitored("hunts.stamp", () => stampInner(input));
}

async function stampInner(
  input: Parameters<typeof stampHuntStep>[0],
): Promise<ActionResult<HuntScanResult>> {
  try {
    const parsed = stampHuntStepSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const ctx = await loadHuntStepContext(parsed.data.stepToken);
    // Chasse inconnue / fermée / module coupé : résultat générique typé
    // (l'UI affiche le même message, aucun oracle sur le motif).
    if (!ctx.ok) {
      return { ok: true, data: mapHuntScanResult({ state: "unavailable" }) };
    }

    const ip = clientIpFromHeaders(await headers());
    if (
      !(await rateLimit(
        rateLimitBucket("hunt:scan:ip", ctx.hunt.id, ip),
        RATE_LIMITS.huntScanIp,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de tentatives. Patientez un instant avant de rescanner.",
      };
    }

    const store = await cookies();
    const cookieName = huntTokenCookieName(ctx.hunt.id);
    const existing = store.get(cookieName)?.value;
    const token = existing ?? generatePlayerToken();
    const tokenHash = hashPlayerToken(token);

    if (
      !(await rateLimit(
        rateLimitBucket("hunt:scan:player", ctx.hunt.id, tokenHash),
        RATE_LIMITS.huntScanPlayer,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de scans récents. Patientez un instant avant de continuer.",
      };
    }

    const { data, error } = await ctx.admin.rpc("record_hunt_scan", {
      p_step_token: parsed.data.stepToken,
      p_player_token_hash: tokenHash,
    });
    if (error) {
      reportError("hunts.stamp", error.message);
      return { ok: false, error: "Une erreur est survenue, réessayez." };
    }

    const result = mapHuntScanResult(data);
    // Pose le cookie au premier scan validé (le joueur vient d'être créé).
    if (!existing && result.state !== "unavailable") {
      store.set(cookieName, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: HUNT_COOKIE_MAX_AGE,
      });
    }

    return { ok: true, data: result };
  } catch (err) {
    reportError("hunts.stamp", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}

export interface HuntClaimOutcome {
  code: string;
  rewardLabel: string;
  /** L'email de rappel a-t-il bien été envoyé (best-effort). */
  emailed: boolean;
}

/**
 * Rattache un email (OPTIONNEL) à la complétion pour recevoir le code par
 * mail, et envoie l'email transactionnel. Jamais requis pour voir le code
 * à l'écran. Opt-in marketing → abonné newsletter (miroir claimPrize).
 */
export async function claimHuntReward(input: {
  stepToken?: string;
  huntId?: string;
  email?: string;
  marketingOptIn?: boolean;
}): Promise<ActionResult<HuntClaimOutcome>> {
  return monitored("hunts.claim", () => claimInner(input));
}

async function claimInner(
  input: Parameters<typeof claimHuntReward>[0],
): Promise<ActionResult<HuntClaimOutcome>> {
  try {
    const parsed = claimHuntRewardSchema.safeParse({
      stepToken: input.stepToken,
      huntId: input.huntId,
      email: input.email ?? "",
      marketingOptIn: input.marketingOptIn ?? false,
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const ctx = await loadHuntClaimContext({
      stepToken: parsed.data.stepToken,
      huntId: parsed.data.huntId,
    });
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const ip = clientIpFromHeaders(await headers());
    if (
      !(await rateLimit(
        rateLimitBucket("hunt:claim:ip", ctx.hunt.id, ip),
        RATE_LIMITS.claim,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de tentatives. Patientez un instant avant de réessayer.",
      };
    }

    // Identité joueur via cookie httpOnly (jamais l'identifiant en clair).
    const NEED_COMPLETE = "Terminez la chasse pour obtenir votre code.";
    const store = await cookies();
    const token = store.get(huntTokenCookieName(ctx.hunt.id))?.value;
    if (!token) return { ok: false, error: NEED_COMPLETE };

    const { data: player } = await ctx.admin
      .from("hunt_players")
      .select("id")
      .eq("hunt_id", ctx.hunt.id)
      .eq("token_hash", hashPlayerToken(token))
      .maybeSingle();
    if (!player) return { ok: false, error: NEED_COMPLETE };

    const { data: completion } = await ctx.admin
      .from("hunt_completions")
      .select("id, code")
      .eq("hunt_id", ctx.hunt.id)
      .eq("player_id", player.id)
      .maybeSingle();
    if (!completion) return { ok: false, error: NEED_COMPLETE };

    let emailed = false;
    if (parsed.data.email) {
      const { error: updateError } = await ctx.admin
        .from("hunt_completions")
        .update({
          email: parsed.data.email,
          marketing_opt_in: parsed.data.marketingOptIn,
        })
        .eq("id", completion.id);
      if (updateError) reportError("hunts.claim.email", updateError.message);

      // Opt-in marketing : abonné à la newsletter du commerçant (miroir de
      // claim_winning_spin — idempotent, aucune écrasure d'un abonné).
      if (parsed.data.marketingOptIn) {
        const { error: subError } = await ctx.admin
          .from("newsletter_subscribers")
          .upsert(
            {
              organization_id: ctx.hunt.organization_id,
              email: parsed.data.email,
              source: "hunt",
            },
            { onConflict: "organization_id,email", ignoreDuplicates: true },
          );
        if (subError) reportError("hunts.claim.subscribe", subError.message);
      }

      emailed = await sendHuntRewardEmail({
        to: parsed.data.email,
        huntName: ctx.hunt.name,
        rewardLabel: ctx.hunt.reward_label,
        rewardDetails: ctx.hunt.reward_details,
        code: completion.code,
        organizationName: ctx.organization.name,
      });
    }

    return {
      ok: true,
      data: { code: completion.code, rewardLabel: ctx.hunt.reward_label, emailed },
    };
  } catch (err) {
    reportError("hunts.claim", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}
