"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import {
  loadLoyaltyActionContext,
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
import {
  monitored,
  reportError,
  reportSecurityEvent,
} from "@/lib/monitoring";
import { generatePlayerToken, hashPlayerToken } from "@/lib/pronostics";
import {
  RATE_LIMITS,
  rateLimit,
  rateLimitBucket,
} from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { signClaimToken } from "@/lib/spin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasLoyaltyAccess } from "@/lib/subscription";
import { turnstileEnabled, verifyTurnstile } from "@/lib/turnstile";
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
// Contrôle d'abus — principe de conception du module
//
// Dans le parcours PUBLIC, AUCUN seau `failClosed` n'est porté par une clé
// PARTAGÉE entre utilisateurs (IP, programme, organisation). Six revues
// successives ont montré que chacun de ces seaux devient un INTERRUPTEUR : un
// tiers qui sature la clé refuse le service à tous les autres — « déni
// d'inscription d'un programme entier pour ~10 $/jour », « interrupteur
// permanent à 0,1 req/s ». Une clé partagée ne porte donc plus qu'un compteur
// LARGE et fail-OPEN, à valeur d'OBSERVABILITÉ : il incrémente, il alerte, il
// ne refuse JAMAIS.
//
// Le `failClosed` reste légitime — et employé — sur une clé propre à UNE
// identité (hash du jeton de passeport) ou à UN opérateur authentifié
// (user.id) : la saturer ne coupe que son porteur.
//
// Ce que ces seaux ne portent plus, ce sont les VERROUS ÉCONOMIQUES, qui
// vivent en base (migrations 20260725190000 puis 20260725200000) : stock fini
// obligatoire sur TOUT palier — `lot` comme `spin` —, et palier au plus tôt à
// la visite 2. Un passeport fabriqué ne vaut rien tant qu'une SECONDE visite
// n'a pas été validée, séparée de la première par le cooldown du programme
// (>= 300 s) ; et la perte maximale d'un programme vaut exactement la somme
// des stocks choisis par le commerçant, quel que soit le nombre de passeports
// créés. La frappe de masse ayant perdu son objet, les seaux qui prétendaient
// la borner ne protégeaient plus rien — ils ne coupaient plus que de vrais
// clients.
//
// ── INVENTAIRE DES SEAUX DU PARCOURS PUBLIC ────────────────────────────
// Toute entrée ajoutée ici doit préciser CLÉ / PARTAGE / MODE, et le mode est
// dicté par le partage : partagée ⇒ fail-OPEN, propre à une identité ⇒
// fail-CLOSED. Aucun seau n'est consommé avant la garde qui identifie
// l'appelant (jeton, cookie, session).
//
//  getLoyaltyCheckinToken
//    · loyalty:checkin:member:<programme>:<hash cookie>  identité   CLOSED
//    · loyalty:public:ip:<programme>:<ip>   [checkinTokenInner]  partagée  OPEN (observabilité)
//  stampLoyaltyVisit / stampInner
//    · loyalty:stamp:code:<programme>:<hash cookie>      identité   CLOSED
//    · loyalty:stamp:member:<programme>:<hash cookie>    identité   CLOSED
//    · loyalty:public:ip:<programme>:<ip>                partagée   OPEN (observabilité)
//    · loyalty:new:program:<programme>                   partagée   OPEN (observabilité, création réelle seulement)
//  consumeLoyaltySpin / consumeSpinInner
//    · loyalty:spin:member:<programme>:<hash cookie>     identité   CLOSED
//    · loyalty:public:ip:<programme>:<ip>                partagée   OPEN (observabilité)
//  claimPrize (src/actions/play.ts — chemin PARTAGÉ avec la roue publique)
//    · claim:spin:<spin_id du jeton vérifié>             identité   CLOSED
//    · claim:ip:<ip>                                     partagée   OPEN (observabilité)
//
// Chemins AUTHENTIFIÉS (hors parcours public) : `loyalty:staff:<org>:<user>`,
// `loyalty:counter:<org>:<user>` — clé d'OPÉRATEUR, fail-CLOSED légitime ; les
// jumeaux `loyalty:staff:new|known:<org>:<user>` restent en observabilité.
// ────────────────────────────────────────────────────────────

/**
 * Compteur d'OBSERVABILITÉ sur clé PARTAGÉE : incrémente, signale le
 * dépassement, et ne refuse jamais (le verdict est volontairement ignoré,
 * `rateLimit` est appelé sans `failClosed`).
 *
 * Coût d'écriture : une seule ligne par (seau, fenêtre), réutilisée par upsert
 * — contrairement à `ops_metrics`, qui insère une ligne par requête. C'est ce
 * qui en fait un premier rempart acceptable là où l'instrumentation ne l'est
 * pas.
 */
async function observeSharedKey(
  bucket: string,
  rule: (typeof RATE_LIMITS)[keyof typeof RATE_LIMITS],
  event: string,
  extra: Record<string, unknown>,
): Promise<void> {
  if (!(await rateLimit(bucket, rule))) {
    reportSecurityEvent(event, {
      ...extra,
      bucket,
      limit: rule.limit,
      window_seconds: rule.windowSeconds,
    });
  }
}

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
 * un lot porte libellé/détails et aucune roue ; un tour offert porte une roue
 * cible et pas de libellé.
 *
 * `reward_stock` est le SEUL champ commun aux deux types, et il est TOUJOURS
 * repris tel quel : le VERROU ÉCONOMIQUE couvre `spin` autant que `lot`
 * (loyalty_milestones_reward_stock_check réécrit par 20260725200000). Sur un
 * `spin` il plafonne les TOURS OFFERTS émis par le palier — écraser cette
 * valeur à null, comme le faisait la version précédente, rendait le palier
 * illimité et lèverait aujourd'hui une erreur 23514 côté base.
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
    reward_stock: input.reward_stock,
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
 *
 * Le résultat porte `isNewMember` : l'écran de caisse annonce « nouveau
 * passeport » ou « client connu », et le backend en tire ses compteurs
 * d'observabilité (voir plus bas).
 */
export async function stampLoyaltyVisitStaff(input: {
  programId: string;
  checkinToken: string;
}): Promise<ActionResult<LoyaltyStampResult>> {
  return monitored("loyalty.stampStaff", () => stampStaffInner(input));
}

/** Le passeport visé existe-t-il DÉJÀ ? (lecture indexée sur (programme, hash)) */
async function passportExists(
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
    reportError("loyalty.staff-identity", error.message);
    return false;
  }
  return Boolean(data);
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

    // Clé d'OPÉRATEUR authentifié (organisation + user.id), jamais partagée
    // entre clients : `failClosed` y est légitime, la saturer ne coupe que ce
    // poste de caisse.
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

    const admin = createAdminClient();

    // Classement de l'identité AVANT la RPC : le mode `staff` est le mode par
    // DÉFAUT en base, et c'est le seul chemin où un compte authentifié peut
    // faire naître un passeport. Sans ce classement, une frappe menée depuis un
    // poste de caisse était indiscernable d'une journée d'ouverture.
    const knownBefore = await passportExists(
      admin,
      parsed.data.programId,
      checkin.memberTokenHash,
    );

    const { data, error } = await admin.rpc("record_loyalty_stamp", {
      p_program_id: parsed.data.programId,
      p_member_token_hash: checkin.memberTokenHash,
      p_rotating_code: undefined,
      p_validated_by: user.id,
    });
    if (error) {
      reportError("loyalty.stampStaff", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const result = mapLoyaltyStampResult(data);

    // Deux compteurs JUMEAUX par opérateur (même fenêtre, même limite) :
    // créations RÉELLES d'un côté, visites de clients déjà connus de l'autre.
    // Le rapport entre les deux est le signal remonté à l'exploitant — une
    // caisse normale sert surtout des clients connus, une frappe n'inscrit que
    // des inconnus. Aucun refus : on alerte, on n'étrangle pas un commerce un
    // jour d'ouverture (le débit du poste reste borné par `cashier`, plus haut).
    //
    // Le compteur de créations n'est consommé qu'après un `is_new_member = true`
    // remonté par la RPC : un jeton rejoué, un `too_soon` ou un programme fermé
    // n'entament aucun budget.
    const knownBucket = rateLimitBucket(
      "loyalty:staff:known",
      organization.id,
      user.id,
    );
    if (result.isNewMember) {
      await observeSharedKey(
        rateLimitBucket("loyalty:staff:new", organization.id, user.id),
        RATE_LIMITS.loyaltyStaffPassportCreation,
        "loyalty_staff_passport_burst",
        {
          program_id: parsed.data.programId,
          organization_id: organization.id,
          validated_by: user.id,
          // Seau jumeau : son compteur donne le dénominateur du ratio
          // nouveaux/connus pour CE poste sur la même fenêtre.
          known_visits_bucket: knownBucket,
        },
      );
    } else if (knownBefore) {
      await rateLimit(knownBucket, RATE_LIMITS.loyaltyStaffKnownVisit);
    }

    return { ok: true, data: result };
  } catch (err) {
    reportError("loyalty.stampStaff", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ────────────────────────────────────────────────────────────
// Parcours public — passeport joueur (anonyme, service role via contexte)
// ────────────────────────────────────────────────────────────

/** Identité du passeport portée par le cookie httpOnly du navigateur. */
interface LoyaltyIdentity {
  /** Empreinte du jeton (seule valeur transmise à la base). */
  tokenHash: string;
  /** Le cookie préexistait-il ? Sinon, aucune identité à interroger en base. */
  returning: boolean;
}

/**
 * Résout — et pose au besoin — l'identité du passeport. AUCUN aller-retour
 * base : c'est précisément ce qui permet de trancher le premier seau avant la
 * moindre requête SQL, avant tout appel sortant et avant l'instrumentation
 * (`monitored` insère une ligne `ops_metrics` par appel).
 *
 * Le cookie est posé dès la première tentative, même refusée : sans lui, un
 * client légitime resterait éternellement « inconnu » et repaierait le
 * challenge à chaque essai.
 */
async function resolvePassportIdentity(
  programId: string,
): Promise<LoyaltyIdentity> {
  const store = await cookies();
  const cookieName = loyaltyTokenCookieName(programId);
  const existing = store.get(cookieName)?.value;
  const token = existing ?? generatePlayerToken();
  if (!existing) {
    store.set(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: LOYALTY_COOKIE_MAX_AGE,
    });
  }
  return { tokenHash: hashPlayerToken(token), returning: Boolean(existing) };
}

/** Seau d'observabilité de la pression publique (clé partagée, jamais un refus). */
async function observePublicPressure(
  programId: string,
  scope: "stamp" | "checkin" | "spin",
  ip: string,
): Promise<void> {
  await observeSharedKey(
    rateLimitBucket("loyalty:public:ip", programId, ip),
    RATE_LIMITS.loyaltyStampIp,
    "loyalty_public_pressure",
    { program_id: programId, scope },
  );
}

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
  const parsed = loyaltyCheckinRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // PREMIER REMPART — clé d'IDENTITÉ, donc `failClosed` légitime, et consulté
  // avant la moindre requête SQL comme avant toute écriture d'instrumentation.
  const identity = await resolvePassportIdentity(parsed.data.programId);
  if (
    !(await rateLimit(
      rateLimitBucket(
        "loyalty:checkin:member",
        parsed.data.programId,
        identity.tokenHash,
      ),
      RATE_LIMITS.loyaltyCheckinMember,
      { failClosed: true },
    ))
  ) {
    return { ok: false, error: "Trop de tentatives. Patientez un instant." };
  }

  return monitored("loyalty.checkinToken", () =>
    checkinTokenInner(parsed.data.programId, identity),
  );
}

async function checkinTokenInner(
  programId: string,
  identity: LoyaltyIdentity,
): Promise<ActionResult<{ token: string; expiresAt: number }>> {
  try {
    const ctx = await loadLoyaltyActionContext(programId);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    // Aucun challenge ici : ce jeton ne vaut RIEN sans un membre de l'équipe
    // qui le scanne (c'est stampLoyaltyVisitStaff, authentifiée, qui tamponne)
    // et il ne crée aucune ligne en base. Reste l'observabilité, sur clé
    // partagée : elle alerte, elle ne refuse pas — `validation_mode` vaut
    // `staff` par défaut et l'écran joueur n'a aucune saisie de repli, un refus
    // ici coupait TOUT tampon derrière une même box.
    const standing = await passportStanding(
      ctx.admin,
      ctx.program.id,
      identity.returning ? identity.tokenHash : null,
      ctx.program.min_stamp_interval_seconds,
    );
    if (standing !== "established") {
      await observePublicPressure(
        ctx.program.id,
        "checkin",
        clientIpFromHeaders(await headers()),
      );
    }

    const { token: checkinToken, expiresAt } = signLoyaltyCheckin({
      programId: ctx.program.id,
      memberTokenHash: identity.tokenHash,
    });
    return { ok: true, data: { token: checkinToken, expiresAt } };
  } catch (err) {
    reportError("loyalty.checkinToken", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Résultat d'un tampon public. Identique à `ActionResult<LoyaltyStampResult>`,
 * augmenté d'un drapeau `challengeRequired` : ouvrir un passeport (identité
 * inconnue) exige un challenge Turnstile, l'UI affiche alors le widget et
 * rejoue le tampon. Un client légitime ne le voit qu'à sa toute première
 * visite ; ensuite son identité le dispense.
 */
export type LoyaltyStampActionResult =
  | { ok: true; data: LoyaltyStampResult }
  | { ok: false; error: string; challengeRequired?: boolean };

/**
 * Ancienneté d'une identité de passeport. Le cookie `lc-loyalty-<programId>`
 * n'est qu'une valeur aléatoire NON SIGNÉE choisie par l'appelant : seule la
 * ligne `loyalty_members` (créée par la RPC APRÈS validation) atteste quelque
 * chose.
 *
 *  · `unknown`     — pas de cookie, ou cookie sans ligne en base. Un tampon
 *                    accepté ici CRÉERAIT une identité : c'est là, et là
 *                    seulement, qu'un challenge anti-robot a du sens.
 *  · `fresh`       — ligne existante mais pas encore établie (1re visite, ou
 *                    tampon trop récent).
 *  · `established` — `visit_count >= 2` (et, sauf dispense, dernier tampon
 *                    antérieur d'au moins une période de cooldown). Deux
 *                    visites espacées d'au moins 300 s (plancher SQL) ne se
 *                    fabriquent pas à la volée : c'est la classe qui ne touche
 *                    plus AUCUNE clé partagée, pas même en observabilité.
 */
type LoyaltyPassportStanding = "unknown" | "fresh" | "established";

/**
 * Plancher de la « période de cooldown » servant de test d'ancienneté. Miroir
 * du plancher SQL (loyalty_programs_cooldown_floor_check) : un programme ne
 * peut pas descendre sous 300 s, on ne descend donc jamais sous 300 s non plus.
 */
const LOYALTY_ESTABLISHED_MIN_AGE_SECONDS = 300;

/**
 * Classe l'identité portée par le cookie. Lecture service role indexée sur
 * (program_id, token_hash) — l'unicité de ce couple est attestée par pgTAP.
 *
 * Un passeport frappé à l'instant ne doit PAS s'auto-exempter : c'était la
 * faille d'une version précédente, où une identité fabriquée devenait
 * « connue » dès son premier tampon et échappait ensuite à tout challenge à
 * vie. D'où la double condition visit_count >= 2 ET dernier tampon vieux d'au
 * moins un cooldown.
 *
 * `requireRecency: false` lève la seconde condition, et UNIQUEMENT pour la
 * consommation d'un tour offert : le grant est émis PAR le tampon qui vient de
 * l'attribuer, donc `last_stamp_at` y est frais par construction. Exiger
 * l'ancienneté rendait `established` inatteignable sur ce chemin — même un
 * client or repassait par la clé mutualisée par IP. Détenir un grant vaut
 * déjà preuve d'ancienneté : les paliers commencent à la visite 2 (CHECK SQL),
 * et le jeton est un aléa de 24 octets tiré côté base.
 *
 * Illisible / absent → `unknown` (donc challenge, jamais un laissez-passer).
 */
async function passportStanding(
  admin: ReturnType<typeof createAdminClient>,
  programId: string,
  tokenHash: string | null,
  minStampIntervalSeconds: number,
  options: { requireRecency?: boolean } = {},
): Promise<LoyaltyPassportStanding> {
  if (!tokenHash) return "unknown";

  const { data, error } = await admin
    .from("loyalty_members")
    .select("visit_count, last_stamp_at")
    .eq("program_id", programId)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) {
    reportError("loyalty.passport-standing", error.message);
    return "unknown";
  }
  if (!data) return "unknown";

  const visitCount = (data.visit_count as number | null) ?? 0;
  const lastStampMs = data.last_stamp_at
    ? Date.parse(data.last_stamp_at as string)
    : Number.NaN;
  const cooldownMs =
    Math.max(minStampIntervalSeconds, LOYALTY_ESTABLISHED_MIN_AGE_SECONDS) * 1000;

  const recentEnough =
    options.requireRecency === false ||
    (Number.isFinite(lastStampMs) && Date.now() - lastStampMs >= cooldownMs);

  return visitCount >= 2 && recentEnough ? "established" : "fresh";
}

/**
 * Le challenge anti-robot est-il RÉELLEMENT jouable par un client ?
 *
 * Il faut les DEUX clés : le secret côté serveur (vérification) et la clé de
 * site côté client (rendu du widget). N'en provisionner qu'une briquerait le
 * parcours — `verifyTurnstile` refuserait en production sans qu'aucun widget
 * ne s'affiche, et plus aucun nouveau client ne pourrait ouvrir de passeport.
 *
 * COMPROMIS ASSUMÉ quand Turnstile n'est pas provisionné : on n'oppose pas de
 * challenge — le parcours resterait inutilisable pour les vrais nouveaux
 * clients, ce qui est pire que l'abus visé. Ce que cela coûte est désormais
 * borné par le produit et non par un seau : sans stock à drainer (fini,
 * obligatoire) et sans palier avant la visite 2, un passeport fabriqué ne vaut
 * rien. Provisionner TURNSTILE_SECRET_KEY *et* NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * reste la configuration attendue en production ; l'absence est reportée dans
 * `reportSecurityEvent` (challenge_available:false).
 */
function loyaltyChallengeAvailable(): boolean {
  return turnstileEnabled() && Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

/**
 * Tamponne une visite en mode rotating_code : le client fournit le code à 6
 * chiffres affiché au comptoir. POST du bouton uniquement (jamais au GET).
 * Crée/lit le cookie joueur, appelle record_loyalty_stamp et renvoie un
 * résultat typé (états, paliers atteints, niveau).
 *
 * `turnstileToken` n'est demandé que lorsque l'appel précédent a répondu
 * `challengeRequired` (ouverture d'un passeport, cf. stampInner).
 */
export async function stampLoyaltyVisit(input: {
  programId: string;
  code: string;
  turnstileToken?: string;
}): Promise<LoyaltyStampActionResult> {
  const parsed = stampLoyaltyVisitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // ── PREMIER REMPART ──────────────────────────────────────────────────
  // Deux seaux fail-closed clés sur l'IDENTITÉ du demandeur (son cookie),
  // consultés AVANT la moindre requête SQL, avant tout appel sortant et hors
  // de `monitored` — l'instrumentation insère une ligne `ops_metrics` par
  // appel, et aucune amplification d'écriture ne doit précéder la première
  // garde. Une clé propre à un porteur peut refuser sans couper personne
  // d'autre : c'est le seul endroit où `failClosed` est admis ici.
  const identity = await resolvePassportIdentity(parsed.data.programId);
  for (const [prefix, rule] of [
    ["loyalty:stamp:code", RATE_LIMITS.loyaltyStampCodeMember],
    ["loyalty:stamp:member", RATE_LIMITS.loyaltyStampMember],
  ] as const) {
    if (
      !(await rateLimit(
        rateLimitBucket(prefix, parsed.data.programId, identity.tokenHash),
        rule,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de tampons récents. Patientez un instant avant de continuer.",
      };
    }
  }

  return monitored("loyalty.stamp", () =>
    stampInner(parsed.data, identity, input.turnstileToken),
  );
}

async function stampInner(
  parsed: { programId: string; code: string },
  identity: LoyaltyIdentity,
  turnstileToken: string | undefined,
): Promise<LoyaltyStampActionResult> {
  try {
    const ctx = await loadLoyaltyActionContext(parsed.programId);
    // Programme inconnu / fermé / module coupé : résultat générique typé
    // (l'UI affiche le même message, aucun oracle sur le motif).
    if (!ctx.ok) {
      return { ok: true, data: mapLoyaltyStampResult({ state: "unavailable" }) };
    }

    const ip = clientIpFromHeaders(await headers());

    // Le code à 6 chiffres est AFFICHÉ au comptoir : le lire est légitime et
    // gratuit. L'abus historique était de le rejouer avec une IDENTITÉ NEUVE à
    // chaque requête ; les verrous en base l'ont vidé de son intérêt (rien
    // avant la visite 2, stock fini). Ne reste que le classement d'identité,
    // qui décide du challenge et de l'observabilité.
    const standing = await passportStanding(
      ctx.admin,
      ctx.program.id,
      identity.returning ? identity.tokenHash : null,
      ctx.program.min_stamp_interval_seconds,
    );

    // CRÉATION D'IDENTITÉ : seul cas où un challenge anti-robot a du sens. Il
    // ne consomme aucun budget partagé — il n'y en a plus — et `verifyTurnstile`
    // sort sans aller-retour réseau quand le jeton manque. Un client légitime
    // ne le paie qu'à sa toute première visite.
    if (standing === "unknown") {
      if (
        loyaltyChallengeAvailable() &&
        !(await verifyTurnstile(turnstileToken, ip, "loyalty-stamp"))
      ) {
        return {
          ok: false,
          error:
            "Vérification anti-robot requise. Validez le contrôle ci-dessous puis tamponnez.",
          challengeRequired: true,
        };
      }
    }

    // Clé partagée = observabilité seule. Un passeport ÉTABLI n'y touche même
    // pas : il ne peut pas être pris en otage par un voisin de Wi-Fi / CGNAT.
    if (standing !== "established") {
      await observePublicPressure(ctx.program.id, "stamp", ip);
    }

    const { data, error } = await ctx.admin.rpc("record_loyalty_stamp", {
      p_program_id: parsed.programId,
      p_member_token_hash: identity.tokenHash,
      p_rotating_code: parsed.code,
      p_validated_by: undefined,
    });
    if (error) {
      reportError("loyalty.stamp", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const result = mapLoyaltyStampResult(data);

    // Compteur de CRÉATIONS : consommé UNIQUEMENT sur une création réelle
    // (`is_new_member`, capté par la RPC dans la même transaction). Un code
    // invalide, un `too_soon` ou un programme fermé n'entament rien — c'est ce
    // qui interdit à une rafale de drainer le « budget d'inscription » des
    // vrais nouveaux clients. Et il ne refuse jamais : il alerte.
    if (result.isNewMember) {
      await observeSharedKey(
        rateLimitBucket("loyalty:new:program", ctx.program.id),
        RATE_LIMITS.loyaltyPassportCreationBurst,
        "loyalty_passport_creation_burst",
        {
          program_id: ctx.program.id,
          challenge_available: loyaltyChallengeAvailable(),
        },
      );
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
  const parsed = consumeLoyaltySpinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // Sans cookie il n'y a rien à consommer : on sort avant toute requête, tout
  // compteur et toute instrumentation.
  const store = await cookies();
  const token = store.get(loyaltyTokenCookieName(parsed.data.programId))?.value;
  if (!token) return { ok: false, error: "Tour offert indisponible." };
  const tokenHash = hashPlayerToken(token);

  // PREMIER REMPART — clé d'IDENTITÉ (`failClosed` légitime), avant SQL,
  // appel sortant et écriture d'instrumentation.
  if (
    !(await rateLimit(
      rateLimitBucket("loyalty:spin:member", parsed.data.programId, tokenHash),
      RATE_LIMITS.loyaltyStampMember,
      { failClosed: true },
    ))
  ) {
    return { ok: false, error: "Trop de tentatives. Patientez un instant." };
  }

  return monitored("loyalty.consumeSpin", () =>
    consumeSpinInner(parsed.data, tokenHash),
  );
}

async function consumeSpinInner(
  parsed: { programId: string; grantToken: string },
  tokenHash: string,
): Promise<ActionResult<LoyaltySpinOutcome>> {
  try {
    const ctx = await loadLoyaltyActionContext(parsed.programId);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    // `requireRecency: false` — le grant vient d'être émis par le tampon qui
    // l'a attribué, donc `last_stamp_at` est frais PAR CONSTRUCTION. Exiger
    // l'ancienneté rendait `established` inatteignable ici : tout client, même
    // or, repassait par la clé mutualisée par IP.
    const standing = await passportStanding(
      ctx.admin,
      ctx.program.id,
      tokenHash,
      ctx.program.min_stamp_interval_seconds,
      { requireRecency: false },
    );
    // Clé PARTAGÉE (programme + IP) : fail-OPEN, observabilité seule. Un
    // passeport ÉTABLI n'y touche même pas.
    if (standing !== "established") {
      await observePublicPressure(
        ctx.program.id,
        "spin",
        clientIpFromHeaders(await headers()),
      );
    }

    const { data, error } = await ctx.admin.rpc("consume_loyalty_spin_grant", {
      p_program_id: parsed.programId,
      p_member_token_hash: tokenHash,
      p_grant_token: parsed.grantToken,
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
