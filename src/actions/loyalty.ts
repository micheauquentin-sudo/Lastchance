"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import {
  loadLoyaltyContext,
  loyaltyTokenCookieName,
} from "@/lib/loyalty-context";
import {
  mapLoyaltySpinGrant,
  mapLoyaltyStampResult,
  type LoyaltyStampResult,
} from "@/lib/loyalty";
import {
  signLoyaltyCheckin,
  verifyLoyaltyCheckin,
} from "@/lib/loyalty-checkin";
import { monitored, reportError } from "@/lib/monitoring";
import { generatePlayerToken, hashPlayerToken } from "@/lib/pronostics";
import {
  RATE_LIMITS,
  rateLimit,
  rateLimitBucket,
  rateLimitFailureExceeded,
  recordRateLimitFailure,
} from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { signClaimToken } from "@/lib/spin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasLoyaltyAccess } from "@/lib/subscription";
import { verifyTurnstile } from "@/lib/turnstile";
import type { ActionResult } from "@/lib/utils";
import {
  consumeLoyaltySpinSchema,
  createLoyaltyMilestoneSchema,
  createLoyaltyProgramSchema,
  deleteLoyaltyMilestoneSchema,
  deleteLoyaltyProgramSchema,
  loyaltyCheckinRequestSchema,
  loyaltyCounterCodeSchema,
  setLoyaltyProgramStatusSchema,
  stampLoyaltyVisitSchema,
  stampLoyaltyVisitStaffSchema,
  updateLoyaltyMilestoneSchema,
  updateLoyaltyProgramSchema,
} from "@/lib/validations/loyalty";

/** Durée de vie du cookie joueur d'un passeport (180 j, comme les chasses). */
const LOYALTY_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

const NOT_EDITOR = "Action non autorisée";
const GENERIC_ERROR = "Une erreur est survenue, réessayez.";

// ────────────────────────────────────────────────────────────
// Dashboard commerçant — programmes (session + RLS éditeurs)
// ────────────────────────────────────────────────────────────

export async function createLoyaltyProgram(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createLoyaltyProgramSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: program, error } = await supabase
    .from("loyalty_programs")
    .insert({ organization_id: organization.id, name: parsed.data.name })
    .select("id")
    .single();

  if (error || !program) {
    console.error("[loyalty] create program:", error?.message);
    return { ok: false, error: "Impossible de créer le programme" };
  }

  revalidatePath("/dashboard/loyalty");
  redirect(`/dashboard/loyalty/${program.id}`);
}

/** Réglages d'un programme (nom, mode de validation, seuils, cooldown). */
export async function updateLoyaltyProgram(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateLoyaltyProgramSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    validation_mode: formData.get("validation_mode"),
    rotating_period_seconds: formData.get("rotating_period_seconds") ?? 60,
    min_stamp_interval_seconds: formData.get("min_stamp_interval_seconds") ?? 86400,
    silver_threshold: formData.get("silver_threshold"),
    gold_threshold: formData.get("gold_threshold"),
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
    .from("loyalty_programs")
    .update(fields)
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[loyalty] update program:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath("/dashboard/loyalty");
  revalidatePath(`/dashboard/loyalty/${id}`);
  return { ok: true, data: undefined };
}

/**
 * Change le statut d'un programme. L'activation exige le module actif et au
 * moins un palier (mêmes gardes que l'activation d'une chasse / campagne).
 */
export async function setLoyaltyProgramStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setLoyaltyProgramStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const { id, status } = parsed.data;
  const supabase = await createClient();

  if (status === "active") {
    if (!hasLoyaltyAccess(organization)) {
      return {
        ok: false,
        error: "Le module Passeport de fidélité n'est pas activé sur votre compte.",
      };
    }
    const { data: program } = await supabase
      .from("loyalty_programs")
      .select("id")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle();
    if (!program) return { ok: false, error: "Programme introuvable" };

    const { count } = await supabase
      .from("loyalty_milestones")
      .select("id", { count: "exact", head: true })
      .eq("program_id", id)
      .eq("organization_id", organization.id);
    if ((count ?? 0) < 1) {
      return {
        ok: false,
        error: "Ajoutez au moins un palier avant d'activer le programme.",
      };
    }
  }

  const { error } = await supabase
    .from("loyalty_programs")
    .update({ status })
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[loyalty] status:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath("/dashboard/loyalty");
  revalidatePath(`/dashboard/loyalty/${id}`);
  return { ok: true, data: undefined };
}

export async function deleteLoyaltyProgram(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteLoyaltyProgramSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { error } = await supabase
    .from("loyalty_programs")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[loyalty] delete program:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath("/dashboard/loyalty");
  redirect("/dashboard/loyalty");
}

// ────────────────────────────────────────────────────────────
// Dashboard commerçant — paliers
// ────────────────────────────────────────────────────────────

/**
 * Champs d'un palier normalisés selon le type (miroir des CHECK SQL) :
 * un lot porte libellé/détails/stock et aucune roue ; un tour offert porte
 * une roue cible et rien d'autre.
 */
function milestoneFieldsForType(input: {
  visit_count: number;
  reward_type: "spin" | "lot";
  reward_label: string;
  reward_details: string;
  reward_stock: number | null;
  target_wheel_id: string | null;
}) {
  const isSpin = input.reward_type === "spin";
  return {
    visit_count: input.visit_count,
    reward_type: input.reward_type,
    reward_label: isSpin ? "" : input.reward_label,
    reward_details: isSpin ? null : input.reward_details || null,
    reward_stock: isSpin ? null : input.reward_stock,
    target_wheel_id: isSpin ? input.target_wheel_id : null,
  };
}

/** Vérifie qu'une roue cible existe DANS l'organisation (anti cross-tenant). */
async function wheelBelongsToOrg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  wheelId: string,
  organizationId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("wheels")
    .select("id")
    .eq("id", wheelId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return Boolean(data);
}

export async function createLoyaltyMilestone(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createLoyaltyMilestoneSchema.safeParse({
    program_id: formData.get("program_id"),
    visit_count: formData.get("visit_count"),
    reward_type: formData.get("reward_type"),
    reward_label: formData.get("reward_label") ?? "",
    reward_details: formData.get("reward_details") ?? "",
    reward_stock: formData.get("reward_stock") ?? "",
    target_wheel_id: formData.get("target_wheel_id") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: program } = await supabase
    .from("loyalty_programs")
    .select("id")
    .eq("id", parsed.data.program_id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!program) return { ok: false, error: "Programme introuvable" };

  if (
    parsed.data.reward_type === "spin" &&
    parsed.data.target_wheel_id &&
    !(await wheelBelongsToOrg(supabase, parsed.data.target_wheel_id, organization.id))
  ) {
    return { ok: false, error: "Roue introuvable dans votre organisation" };
  }

  // Position d'affichage = fin de liste (l'ordre métier reste visit_count).
  const { data: existing } = await supabase
    .from("loyalty_milestones")
    .select("position")
    .eq("program_id", parsed.data.program_id)
    .eq("organization_id", organization.id);
  const position =
    Math.max(0, ...(existing ?? []).map((m) => (m.position as number) ?? 0)) + 1;

  const { error } = await supabase.from("loyalty_milestones").insert({
    program_id: parsed.data.program_id,
    organization_id: organization.id,
    position,
    ...milestoneFieldsForType(parsed.data),
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Un palier existe déjà pour ce nombre de visites" };
    }
    console.error("[loyalty] create milestone:", error.message);
    return { ok: false, error: "Impossible d'ajouter le palier" };
  }

  revalidatePath(`/dashboard/loyalty/${parsed.data.program_id}`);
  return { ok: true, data: undefined };
}

export async function updateLoyaltyMilestone(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateLoyaltyMilestoneSchema.safeParse({
    id: formData.get("id"),
    visit_count: formData.get("visit_count"),
    reward_type: formData.get("reward_type"),
    reward_label: formData.get("reward_label") ?? "",
    reward_details: formData.get("reward_details") ?? "",
    reward_stock: formData.get("reward_stock") ?? "",
    target_wheel_id: formData.get("target_wheel_id") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("loyalty_milestones")
    .select("program_id")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Palier introuvable" };

  if (
    parsed.data.reward_type === "spin" &&
    parsed.data.target_wheel_id &&
    !(await wheelBelongsToOrg(supabase, parsed.data.target_wheel_id, organization.id))
  ) {
    return { ok: false, error: "Roue introuvable dans votre organisation" };
  }

  const { error } = await supabase
    .from("loyalty_milestones")
    .update(milestoneFieldsForType(parsed.data))
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Un palier existe déjà pour ce nombre de visites" };
    }
    console.error("[loyalty] update milestone:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath(`/dashboard/loyalty/${existing.program_id}`);
  return { ok: true, data: undefined };
}

export async function deleteLoyaltyMilestone(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteLoyaltyMilestoneSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: milestone } = await supabase
    .from("loyalty_milestones")
    .select("program_id")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!milestone) return { ok: false, error: "Palier introuvable" };

  // Un programme actif conserve au moins un palier (invariant d'activation).
  const [{ data: program }, { count }] = await Promise.all([
    supabase
      .from("loyalty_programs")
      .select("status")
      .eq("id", milestone.program_id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("loyalty_milestones")
      .select("id", { count: "exact", head: true })
      .eq("program_id", milestone.program_id)
      .eq("organization_id", organization.id),
  ]);
  if (program?.status === "active" && (count ?? 0) <= 1) {
    return {
      ok: false,
      error:
        "Un programme actif garde au moins un palier. Désactivez-le pour retirer le dernier.",
    };
  }

  const { error } = await supabase
    .from("loyalty_milestones")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);
  if (error) {
    console.error("[loyalty] delete milestone:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath(`/dashboard/loyalty/${milestone.program_id}`);
  return { ok: true, data: undefined };
}

// ────────────────────────────────────────────────────────────
// Écran comptoir — code tournant courant (authentifié, jamais public)
// ────────────────────────────────────────────────────────────

export interface LoyaltyCounterCode {
  /** Code TOTP courant (null si le programme n'est pas en mode rotating). */
  code: string | null;
  /** Période de rotation, pour le compte à rebours côté écran. */
  periodSeconds: number;
}

/**
 * Code tournant à afficher au comptoir. Réservé à un owner/editor — même garde
 * que la page `/dashboard/loyalty/[id]/comptoir` : une server action reste un
 * endpoint appelable directement, et le code courant vaut un tampon. Un compte
 * `cashier` (ou tout autre rôle) le lirait à distance et s'auto-tamponnerait
 * sans être en boutique ; la caisse dispose déjà de `stampLoyaltyVisitStaff`.
 * Le secret ne sort jamais côté client, seul le code courant est renvoyé ;
 * le frontend rafraîchit à intervalle régulier.
 */
export async function getLoyaltyCounterCode(
  programId: string,
): Promise<LoyaltyCounterCode | null> {
  const parsed = loyaltyCounterCodeSchema.safeParse({ programId });
  if (!parsed.success) return null;

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return null;

  const allowed = await rateLimit(
    rateLimitBucket("loyalty:counter", organization.id, user.id),
    RATE_LIMITS.loyaltyCounter,
    { failClosed: true },
  );
  if (!allowed) return null;

  const supabase = await createClient();
  const { data: program } = await supabase
    .from("loyalty_programs")
    .select("id, validation_mode, rotating_period_seconds")
    .eq("id", parsed.data.programId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!program) return null;

  if (program.validation_mode !== "rotating_code") {
    return { code: null, periodSeconds: program.rotating_period_seconds };
  }

  const { data: code, error } = await createAdminClient().rpc(
    "current_loyalty_code",
    { p_program_id: parsed.data.programId },
  );
  if (error) {
    reportError("loyalty.counter-code", error.message);
    return null;
  }
  return {
    code: (code as string | null) ?? null,
    periodSeconds: program.rotating_period_seconds,
  };
}

// ────────────────────────────────────────────────────────────
// Caisse — tampon validé par le staff (mode staff)
// ────────────────────────────────────────────────────────────

/**
 * Valide une visite depuis la caisse (mode staff) : le staff scanne le QR
 * affiché par le client, qui porte un JETON DE CHECK-IN signé et éphémère
 * (~3 min, cf. lib/loyalty-checkin.ts) — jamais le jeton d'identité du
 * passeport, qui ne quitte pas le serveur. AUTHENTIFIÉE, réservée à un membre
 * de l'organisation ; l'identité du validateur (user.id) est transmise à la
 * RPC comme p_validated_by (obligatoire en mode staff).
 */
export async function stampLoyaltyVisitStaff(input: {
  programId: string;
  checkinToken: string;
}): Promise<ActionResult<LoyaltyStampResult>> {
  return monitored("loyalty.stampStaff", () => stampStaffInner(input));
}

async function stampStaffInner(
  input: Parameters<typeof stampLoyaltyVisitStaff>[0],
): Promise<ActionResult<LoyaltyStampResult>> {
  try {
    const parsed = stampLoyaltyVisitStaffSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const { user, organization, role } = await getUserAndOrg();
    if (!user || !organization) redirect("/login");
    // Caisse : owner, editor ou cashier opèrent le comptoir.
    if (role !== "owner" && role !== "editor" && role !== "cashier") {
      return { ok: false, error: NOT_EDITOR };
    }

    const allowed = await rateLimit(
      rateLimitBucket("loyalty:staff", organization.id, user.id),
      RATE_LIMITS.cashier,
      { failClosed: true },
    );
    if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };

    // Multi-tenant : le programme doit appartenir à l'organisation active.
    const supabase = await createClient();
    const { data: program } = await supabase
      .from("loyalty_programs")
      .select("id")
      .eq("id", parsed.data.programId)
      .eq("organization_id", organization.id)
      .maybeSingle();
    if (!program) return { ok: false, error: "Programme de fidélité introuvable" };

    // Le QR ne porte QUE ce laissez-passer signé : signature, expiration et
    // programme sont vérifiés ici. Un jeton photographié devient inerte à
    // l'expiration, et n'a jamais donné accès au passeport (lecture des codes
    // de retrait, consommation des tours offerts).
    const checkin = verifyLoyaltyCheckin(parsed.data.checkinToken);
    if (!checkin || checkin.programId !== parsed.data.programId) {
      return {
        ok: false,
        error:
          "Carte expirée ou illisible — demandez au client de rafraîchir son passeport.",
      };
    }

    const { data, error } = await createAdminClient().rpc("record_loyalty_stamp", {
      p_program_id: parsed.data.programId,
      p_member_token_hash: checkin.memberTokenHash,
      p_rotating_code: undefined,
      p_validated_by: user.id,
    });
    if (error) {
      reportError("loyalty.stampStaff", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    return { ok: true, data: mapLoyaltyStampResult(data) };
  } catch (err) {
    reportError("loyalty.stampStaff", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ────────────────────────────────────────────────────────────
// Parcours public — passeport joueur (anonyme, service role via contexte)
// ────────────────────────────────────────────────────────────

/**
 * Jeton de check-in du passeport (mode staff) : établit au besoin l'identité
 * du passeport (cookie httpOnly, sans tamponner) puis renvoie un laissez-passer
 * SIGNÉ et ÉPHÉMÈRE, seule valeur encodée dans le QR présenté au comptoir.
 *
 * Le jeton d'identité (valeur du cookie) n'est jamais renvoyé au client : un QR
 * photographié ne permet ni de rejouer l'identité du passeport, ni d'en lire
 * les récompenses, ni de consommer un tour offert — et devient inerte à
 * l'expiration. Le client rafraîchit son jeton avant échéance.
 */
export async function getLoyaltyCheckinToken(input: {
  programId: string;
}): Promise<ActionResult<{ token: string; expiresAt: number }>> {
  return monitored("loyalty.checkinToken", () => checkinTokenInner(input));
}

async function checkinTokenInner(
  input: Parameters<typeof getLoyaltyCheckinToken>[0],
): Promise<ActionResult<{ token: string; expiresAt: number }>> {
  try {
    const parsed = loyaltyCheckinRequestSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const ctx = await loadLoyaltyContext(parsed.data.programId);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const ip = clientIpFromHeaders(await headers());
    if (
      !(await rateLimit(
        rateLimitBucket("loyalty:checkin:ip", ctx.program.id, ip),
        RATE_LIMITS.loyaltyStampIp,
        { failClosed: true },
      ))
    ) {
      return { ok: false, error: "Trop de tentatives. Patientez un instant." };
    }

    const store = await cookies();
    const cookieName = loyaltyTokenCookieName(ctx.program.id);
    let token = store.get(cookieName)?.value;
    if (!token) {
      token = generatePlayerToken();
      store.set(cookieName, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: LOYALTY_COOKIE_MAX_AGE,
      });
    }

    const { token: checkinToken, expiresAt } = signLoyaltyCheckin({
      programId: ctx.program.id,
      memberTokenHash: hashPlayerToken(token),
    });
    return { ok: true, data: { token: checkinToken, expiresAt } };
  } catch (err) {
    reportError("loyalty.checkinToken", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Résultat d'un tampon public. Identique à `ActionResult<LoyaltyStampResult>`,
 * augmenté d'un drapeau `challengeRequired` : sous saturation du seau d'échecs
 * de l'IP, un passeport INCONNU doit résoudre un challenge Turnstile plutôt que
 * d'être refusé sec (l'UI affiche alors le widget et rejoue le tampon).
 */
export type LoyaltyStampActionResult =
  | { ok: true; data: LoyaltyStampResult }
  | { ok: false; error: string; challengeRequired?: boolean };

/**
 * Un passeport est CONNU dès qu'une ligne `loyalty_members` existe pour ce
 * programme et ce hash. C'est la seule preuve d'identité qu'un appelant ne peut
 * pas fabriquer : le cookie `lc-loyalty-<programId>` n'est qu'une valeur
 * aléatoire NON SIGNÉE, qu'il suffit de renouveler à chaque requête pour
 * repartir avec des seaux vierges — alors qu'une ligne `loyalty_members` n'est
 * créée que par un tampon RÉUSSI (record_loyalty_stamp valide le code AVANT
 * l'insert). Lecture service role, indexée sur (program_id, token_hash).
 *
 * Illisible → `false` (donc challenge, jamais un laissez-passer).
 */
async function isKnownPassport(
  admin: ReturnType<typeof createAdminClient>,
  programId: string,
  tokenHash: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("loyalty_members")
    .select("id")
    .eq("program_id", programId)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) {
    reportError("loyalty.known-passport", error.message);
    return false;
  }
  return Boolean(data);
}

/**
 * Tamponne une visite en mode rotating_code : le client fournit le code à 6
 * chiffres affiché au comptoir. POST du bouton uniquement (jamais au GET).
 * Crée/lit le cookie joueur, appelle record_loyalty_stamp et renvoie un
 * résultat typé (états, paliers atteints, niveau).
 *
 * `turnstileToken` n'est demandé que lorsque l'appel précédent a répondu
 * `challengeRequired` (IP en train d'échouer en série + passeport inconnu).
 */
export async function stampLoyaltyVisit(input: {
  programId: string;
  code: string;
  turnstileToken?: string;
}): Promise<LoyaltyStampActionResult> {
  return monitored("loyalty.stamp", () => stampInner(input));
}

async function stampInner(
  input: Parameters<typeof stampLoyaltyVisit>[0],
): Promise<LoyaltyStampActionResult> {
  try {
    const parsed = stampLoyaltyVisitSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const ctx = await loadLoyaltyContext(parsed.data.programId);
    // Programme inconnu / fermé / module coupé : résultat générique typé
    // (l'UI affiche le même message, aucun oracle sur le motif).
    if (!ctx.ok) {
      return { ok: true, data: mapLoyaltyStampResult({ state: "unavailable" }) };
    }

    const ip = clientIpFromHeaders(await headers());
    const tooManyAttempts = {
      ok: false as const,
      error: "Trop de tentatives. Patientez un instant avant de retamponner.",
    };
    if (
      !(await rateLimit(
        rateLimitBucket("loyalty:stamp:ip", ctx.program.id, ip),
        RATE_LIMITS.loyaltyStampIp,
        { failClosed: true },
      ))
    ) {
      return tooManyAttempts;
    }

    // Identité du passeport AVANT toute décision de limitation : le cookie est
    // posé dès la PREMIÈRE tentative, réussie ou non. (Le passeport lui-même ne
    // naît en base qu'au premier tampon validé, c'est la RPC qui crée la ligne.)
    const store = await cookies();
    const cookieName = loyaltyTokenCookieName(ctx.program.id);
    const existing = store.get(cookieName)?.value;
    const token = existing ?? generatePlayerToken();
    const tokenHash = hashPlayerToken(token);
    if (!existing) {
      store.set(cookieName, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: LOYALTY_COOKIE_MAX_AGE,
      });
    }

    // Seau d'ÉCHECS de code, dédié : des codes faux en série ne sont jamais
    // légitimes, on les compte à part en consultant le compteur AVANT
    // d'évaluer la tentative (message identique au seau IP : aucun oracle).
    //
    // Le seau IP est TOUJOURS consulté et TOUJOURS alimenté, cookie ou non :
    // clé uniquement sur le passeport, il était contournable en une ligne — la
    // valeur du cookie est choisie par l'appelant (24 octets aléatoires NON
    // signés), donc un cookie neuf à chaque requête = un seau neuf à chaque
    // requête, et plus aucun plafond d'échecs.
    //
    // Le seau du passeport reste en borne secondaire, mais UNIQUEMENT pour un
    // passeport connu (voir isKnownPassport) : l'alimenter pour des identités
    // fabriquées ne bornerait rien et remplirait `rate_limits` de lignes
    // jetables.
    const ipFailureBucket = rateLimitBucket(
      "loyalty:stamp:codefail:ip",
      ctx.program.id,
      ip,
    );
    const memberFailureBucket = rateLimitBucket(
      "loyalty:stamp:codefail:member",
      ctx.program.id,
      tokenHash,
    );
    const known = existing
      ? await isKnownPassport(ctx.admin, ctx.program.id, tokenHash)
      : false;

    if (
      known &&
      (await rateLimitFailureExceeded(
        memberFailureBucket,
        RATE_LIMITS.loyaltyStampCodeFailureMember,
      ))
    ) {
      return tooManyAttempts;
    }

    if (
      await rateLimitFailureExceeded(
        ipFailureBucket,
        RATE_LIMITS.loyaltyStampCodeFailureIp,
      )
    ) {
      // Saturation du seau IP : un passeport CONNU passe (il a déjà tamponné
      // avec un vrai code, il n'est pas la source du bruit et ne doit pas être
      // pris en otage par son voisin de Wi-Fi ou de CGNAT).
      //
      // Une identité INCONNUE — fabriquée à la volée, ou simplement un tout
      // nouveau client — n'est pas refusée sèchement : elle passe par un
      // challenge Turnstile. C'est le seul point du parcours où ce coût UX se
      // justifie (il ne concerne que des IP en train d'échouer en série), et
      // c'est ce qui garde l'acquisition possible pendant qu'une IP est brûlée.
      if (
        !known &&
        !(await verifyTurnstile(input.turnstileToken, ip, "loyalty-stamp"))
      ) {
        return {
          ok: false,
          error:
            "Vérification anti-robot requise. Validez le contrôle ci-dessous puis retamponnez.",
          challengeRequired: true,
        };
      }
    }

    if (
      !(await rateLimit(
        rateLimitBucket("loyalty:stamp:member", ctx.program.id, tokenHash),
        RATE_LIMITS.loyaltyStampMember,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de tampons récents. Patientez un instant avant de continuer.",
      };
    }

    const { data, error } = await ctx.admin.rpc("record_loyalty_stamp", {
      p_program_id: parsed.data.programId,
      p_member_token_hash: tokenHash,
      p_rotating_code: parsed.data.code,
      p_validated_by: undefined,
    });
    if (error) {
      reportError("loyalty.stamp", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const result = mapLoyaltyStampResult(data);
    // Seul un code faux nourrit les seaux d'échecs (ni les succès, ni les
    // cooldowns : ce sont des visites légitimes). L'IP est comptée dans TOUS
    // les cas — c'est le seul compteur qu'une rotation de cookie ne remet pas
    // à zéro ; le seau du passeport ne l'est que pour un passeport connu.
    if (result.state === "invalid_code") {
      await recordRateLimitFailure(
        ipFailureBucket,
        RATE_LIMITS.loyaltyStampCodeFailureIp,
      );
      if (known) {
        await recordRateLimitFailure(
          memberFailureBucket,
          RATE_LIMITS.loyaltyStampCodeFailureMember,
        );
      }
    }

    return { ok: true, data: result };
  } catch (err) {
    reportError("loyalty.stamp", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Issue d'un tour de roue offert consommé, prête pour l'UI de la roue. */
export interface LoyaltySpinOutcome {
  state: "spun" | "already_consumed" | "no_prize";
  wheelId: string | null;
  prizeId: string | null;
  isLosing: boolean;
  /** Index du lot dans la roue cible (animation), null si perdant/indispo. */
  prizeIndex: number | null;
  label: string | null;
  description: string | null;
  /** Gain non perdant : jeton signé à passer à claimPrize (flux GAIN-…). */
  claimToken: string | null;
}

interface SpinRow {
  wheelId: string;
  prizeId: string | null;
  isLosing: boolean;
}

/** Relit un spin (reprise already_consumed via resulting_spin_id). */
async function loadSpinRow(
  admin: ReturnType<typeof createAdminClient>,
  spinId: string,
): Promise<SpinRow | null> {
  const { data } = await admin
    .from("spins")
    .select("wheel_id, prize_id, is_losing")
    .eq("id", spinId)
    .maybeSingle();
  if (!data) return null;
  return {
    wheelId: data.wheel_id as string,
    prizeId: (data.prize_id as string | null) ?? null,
    isLosing: data.is_losing as boolean,
  };
}

/** Enrichit l'issue avec le libellé et l'index du lot dans la roue cible. */
async function enrichSpinPrize(
  admin: ReturnType<typeof createAdminClient>,
  wheelId: string | null,
  prizeId: string | null,
): Promise<{ prizeIndex: number | null; label: string | null; description: string | null }> {
  const empty = { prizeIndex: null, label: null, description: null };
  if (!wheelId || !prizeId) return empty;

  const { data } = await admin
    .from("prizes")
    .select("id, label, description, position, created_at")
    .eq("wheel_id", wheelId)
    .eq("is_active", true);
  const prizes = ((data as Array<{
    id: string;
    label: string;
    description: string;
    position: number;
    created_at: string;
  }> | null) ?? []).sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
  );
  const idx = prizes.findIndex((p) => p.id === prizeId);
  if (idx < 0) return empty;
  return { prizeIndex: idx, label: prizes[idx].label, description: prizes[idx].description };
}

/**
 * Consomme un tour de roue offert (grant de palier). Échange le grant_token
 * contre un tirage atomique sur la roue cible via consume_loyalty_spin_grant,
 * puis, pour un gain non perdant, signe un jeton claim (spin_id) rebranché sur
 * le flux claimPrize existant (code GAIN-…). Le player_key du spin étant le
 * hash du passeport, recoverPendingWin ne le couvre pas : la reprise passe par
 * resulting_spin_id (état already_consumed).
 */
export async function consumeLoyaltySpin(input: {
  programId: string;
  grantToken: string;
}): Promise<ActionResult<LoyaltySpinOutcome>> {
  return monitored("loyalty.consumeSpin", () => consumeSpinInner(input));
}

async function consumeSpinInner(
  input: Parameters<typeof consumeLoyaltySpin>[0],
): Promise<ActionResult<LoyaltySpinOutcome>> {
  try {
    const parsed = consumeLoyaltySpinSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const ctx = await loadLoyaltyContext(parsed.data.programId);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const ip = clientIpFromHeaders(await headers());
    if (
      !(await rateLimit(
        rateLimitBucket("loyalty:spin:ip", ctx.program.id, ip),
        RATE_LIMITS.loyaltyStampIp,
        { failClosed: true },
      ))
    ) {
      return { ok: false, error: "Trop de tentatives. Patientez un instant." };
    }

    const store = await cookies();
    const token = store.get(loyaltyTokenCookieName(ctx.program.id))?.value;
    if (!token) return { ok: false, error: "Tour offert indisponible." };
    const tokenHash = hashPlayerToken(token);

    if (
      !(await rateLimit(
        rateLimitBucket("loyalty:spin:member", ctx.program.id, tokenHash),
        RATE_LIMITS.loyaltyStampMember,
        { failClosed: true },
      ))
    ) {
      return { ok: false, error: "Trop de tentatives. Patientez un instant." };
    }

    const { data, error } = await ctx.admin.rpc("consume_loyalty_spin_grant", {
      p_program_id: parsed.data.programId,
      p_member_token_hash: tokenHash,
      p_grant_token: parsed.data.grantToken,
    });
    if (error) {
      reportError("loyalty.consumeSpin", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const grant = mapLoyaltySpinGrant(data);
    if (grant.state === "unavailable") {
      return { ok: false, error: "Tour offert indisponible." };
    }
    if (grant.state === "no_prize") {
      return {
        ok: true,
        data: {
          state: "no_prize",
          wheelId: grant.wheelId,
          prizeId: null,
          isLosing: false,
          prizeIndex: null,
          label: null,
          description: null,
          claimToken: null,
        },
      };
    }

    // spun / already_consumed : reconstruire l'issue à partir du spin.
    let wheelId = grant.wheelId;
    let prizeId = grant.prizeId;
    let isLosing = grant.isLosing;
    if (grant.state === "already_consumed" && grant.spinId) {
      const spin = await loadSpinRow(ctx.admin, grant.spinId);
      if (spin) {
        wheelId = spin.wheelId;
        prizeId = spin.prizeId;
        isLosing = spin.isLosing;
      }
    }

    const enriched = await enrichSpinPrize(ctx.admin, wheelId, prizeId);
    const claimToken =
      !isLosing && prizeId && grant.spinId ? signClaimToken(grant.spinId) : null;

    return {
      ok: true,
      data: {
        state: grant.state,
        wheelId,
        prizeId,
        isLosing,
        prizeIndex: enriched.prizeIndex,
        label: enriched.label,
        description: enriched.description,
        claimToken,
      },
    };
  } catch (err) {
    reportError("loyalty.consumeSpin", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}
