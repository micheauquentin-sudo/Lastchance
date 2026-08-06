"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminBackofficeClient } from "@/lib/admin/db";
import { rpcStrict } from "@/lib/supabase/rpc";
import { logAdminAction } from "@/lib/admin/audit";
import {
  calculerFenetres,
  INDEX_RECURRENT_UNIQUE,
  messageCumulRecurrent,
  violeContrainte,
} from "@/lib/admin/module-grants";
import {
  addNoteSchema,
  deleteMerchantSchema,
  merchantAddonSchema,
  merchantCompAccessSchema,
  merchantGrantRevokeSchema,
  merchantModuleGrantSchema,
  merchantPlanSchema,
  merchantSmsCreditSchema,
  merchantSmsSenderDeclareSchema,
  merchantSmsSenderStatusSchema,
  merchantStatusSchema,
} from "@/lib/validations/admin";
import { PLANS, cancelCustomerSubscriptions } from "@/lib/stripe";
import { endOfLocalDayToIso } from "@/lib/date-time";
import {
  cleanupErrorMessage,
  selectAuthCleanupCandidates,
} from "@/lib/admin/merchant-deletion";
import {
  auditTargetId,
  authorizeOrTrace,
} from "@/lib/admin/denied-trace";
import type { AdminUser } from "@/types/admin";
import type { ActionResult } from "@/lib/utils";

/**
 * Générique sur la charge utile du SUCCÈS : un échec n'en porte pas, mais il
 * doit rester renvoyable depuis une action dont le succès, lui, en porte une
 * (`creditMerchantSmsBalance` rend `{ created }`).
 */
function fail<T = void>(error: string): ActionResult<T> {
  return { ok: false, error };
}

type AdminDb = ReturnType<typeof createAdminBackofficeClient>;
type CleanupIssue = { stage: string; message: string; userId?: string };

async function updateDeletionJob(
  db: AdminDb,
  jobId: string,
  fields: Record<string, unknown>,
): Promise<string | null> {
  const { error } = await db
    .from("merchant_deletion_jobs")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", jobId);
  return error?.message ?? null;
}

/**
 * Les cases du back-office restent un outil de migration pour les comptes
 * legacy. Dès qu'un snapshot Stripe existe, le webhook est l'unique autorité
 * sur le plan et les droits : une mutation manuelle créerait sinon un accès
 * payé hors Stripe jusqu'au prochain événement.
 *
 * ── LE REFUS EST TRACÉ, ET IL L'EST ICI ──
 *
 * Seuls les succès étaient journalisés. `authorizeOrTrace` ne couvre pas ce
 * refus-là : il trace le manque de PERMISSION, alors qu'ici l'opérateur est
 * parfaitement autorisé et c'est l'autorité sur les droits qui lui est
 * refusée. Un opérateur qui insiste douze fois sur douze modules d'une
 * organisation pilotée par Stripe ne laissait donc aucune trace — exactement
 * la classe de trou fermée par les PR #46-50, « un back-office qui
 * n'enregistrait que ses succès ».
 *
 * La trace est écrite DANS cette fonction et non chez ses dix appelants : la
 * doctrine du module `denied-trace` s'applique mot pour mot — un refus recopié
 * dix fois est un endroit où l'on oublie dix fois d'écrire la trace.
 *
 * Suffixe `.denied` et non `.blocked` : `/admin/audit` ne colore en rouge que
 * le premier, et un refus qu'on ne repère pas dans le journal ne remplit pas
 * l'office pour lequel il y est écrit.
 */
async function rejectStripeManagedEntitlements(
  db: AdminDb,
  organizationId: string,
  /**
   * De quoi nommer la tentative refusée dans le journal. `action` est le nom
   * de l'action AU SUCCÈS (`merchant.addon_hunts.change`) : le suffixe est
   * ajouté ici, pour que les deux faces d'un même geste se retrouvent côte à
   * côte dans le journal.
   */
  audit: { actor: AdminUser; action: string },
  /**
   * Message rendu à l'opérateur quand le refus tombe. Le défaut convient aux
   * actions dont l'objet EST le droit payant ; une action qui ne fait
   * qu'inclure un module en chemin doit dire quoi faire pour aboutir quand
   * même, sans quoi le refus se lit comme une panne.
   */
  refusal = "Cette organisation est pilotée par Stripe. Modifiez son abonnement dans Stripe.",
): Promise<ActionResult | null> {
  const { count, error } = await db
    .from("organization_entitlements")
    .select("organization_id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("source", "stripe")
    // `active` est le TROISIÈME filtre, et il doit y être : le trigger
    // `protect_stripe_managed_entitlements` le porte depuis la migration
    // 20260818120000. Une résiliation ne supprime pas les neuf lignes du
    // snapshot, elle les repose inactives — sans ce filtre, ce garde
    // refuserait applicativement là où la base accepte, et un commerçant
    // parti resterait « piloté par Stripe » à vie, hors d'atteinte du moindre
    // geste commercial. Les deux gardes doivent poser LA MÊME question.
    .eq("active", true);

  if (error) {
    console.error("[admin] entitlement authority check:", error.message);
    // Tracé aussi : l'écriture est refusée sans qu'on sache qui a autorité.
    // Une panne du contrôle et un refus légitime se ressemblent à l'écran, et
    // seule la métadonnée les distingue après coup.
    await logAdminAction({
      actor: audit.actor,
      action: `${audit.action}.denied`,
      targetType: "organization",
      targetId: organizationId,
      metadata: { reason: "entitlement_authority_unavailable" },
    });
    return fail("Impossible de vérifier la source des droits.");
  }
  if ((count ?? 0) > 0) {
    await logAdminAction({
      actor: audit.actor,
      action: `${audit.action}.denied`,
      targetType: "organization",
      targetId: organizationId,
      metadata: { reason: "stripe_managed" },
    });
    return fail(refusal);
  }
  return null;
}

async function removeOrganizationStorage(
  db: AdminDb,
  bucket: string,
  organizationId: string,
) {
  const paths: string[] = [];
  let offset = 0;
  while (true) {
    const { data: files, error } = await db.storage
      .from(bucket)
      .list(organizationId, { limit: 100, offset });
    if (error) throw error;
    for (const file of files ?? []) paths.push(`${organizationId}/${file.name}`);
    if (!files || files.length < 100) break;
    offset += files.length;
  }
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await db.storage.from(bucket).remove(paths.slice(index, index + 100));
    if (error) throw error;
  }
}

/** Change le statut d'abonnement d'un commerçant (suspendre/réactiver). */
export async function setMerchantStatus(formData: FormData): Promise<ActionResult> {
  // Action sensible : connexion récente exigée (sudo).
  const guard = await authorizeOrTrace(
    "merchants.suspend",
    "merchant.status.change.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = merchantStatusSchema.safeParse({
    organizationId: formData.get("organizationId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, status } = parsed.data;

  const db = createAdminBackofficeClient();
  const { data: before } = await db
    .from("organizations")
    .select("subscription_status, past_due_since")
    .eq("id", organizationId)
    .maybeSingle();
  if (!before) return fail("Commerçant introuvable.");

  const { error } = await db
    .from("organizations")
    .update({
      subscription_status: status,
      // `past_due_since` DATE l'impayé, et c'est cette date seule qui borne
      // le délai de grâce (`pastDueGraceEndsAt`, PAST_DUE_GRACE_DAYS). Sans
      // elle, `hasActiveAccess` lit « transition en cours, le webhook la
      // datera » et n'ouvre JAMAIS la coupure : passer un commerçant en
      // « Impayé » depuis le back-office ne coupait donc rien, indéfiniment.
      // Formule reprise à l'identique des deux écrivains SQL (00019:493 et
      // apply_stripe_subscription_event_v2, 20260805170000:242) :
      // `coalesce(past_due_since, now())` en entrée d'impayé, `null` en
      // sortie — le coalesce garantit qu'une seconde application du même
      // statut ne repousse pas l'échéance.
      past_due_since:
        status === "past_due"
          ? ((before.past_due_since as string | null) ?? new Date().toISOString())
          : null,
    })
    .eq("id", organizationId);
  if (error) return fail("Échec de la mise à jour.");

  await logAdminAction({
    actor,
    action: "merchant.status.change",
    targetType: "organization",
    targetId: organizationId,
    metadata: { from: before.subscription_status, to: status },
  });
  revalidatePath(`/admin/merchants/${organizationId}`);
  revalidatePath("/admin/merchants");
  return { ok: true, data: undefined };
}

/**
 * Change le plan d'un commerçant.
 *
 * Sudo exigé, comme les huit bascules d'addon qui partagent sa permission :
 * le plan porte le palier FACTURÉ, donc l'étendue des droits, là où un addon
 * ne coche qu'un module. Un poste laissé déverrouillé — ou un cookie admin
 * volé — ne doit pas suffire à rétrograder une boutique en pleine campagne.
 */
export async function setMerchantPlan(formData: FormData): Promise<ActionResult> {
  const guard = await authorizeOrTrace(
    "merchants.edit",
    "merchant.plan.change.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = merchantPlanSchema.safeParse({
    organizationId: formData.get("organizationId"),
    plan: formData.get("plan"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, plan } = parsed.data;

  if (!PLANS.some((p) => p.id === plan)) return fail("Plan inconnu.");

  const db = createAdminBackofficeClient();
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId, {
    actor,
    action: "merchant.plan.change",
  });
  if (stripeManaged) return stripeManaged;
  const { data: before } = await db
    .from("organizations")
    .select("plan")
    .eq("id", organizationId)
    .maybeSingle();
  if (!before) return fail("Commerçant introuvable.");

  const { error } = await db
    .from("organizations")
    .update({ plan })
    .eq("id", organizationId);
  if (error) return fail("Échec de la mise à jour.");

  await logAdminAction({
    actor,
    action: "merchant.plan.change",
    targetType: "organization",
    targetId: organizationId,
    metadata: { from: before.plan, to: plan },
  });
  revalidatePath(`/admin/merchants/${organizationId}`);
  return { ok: true, data: undefined };
}

/** Active ou coupe l'addon Pronostics, avec traçabilité d'une option payante. */
export async function setMerchantPronosticsAddon(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await authorizeOrTrace(
    "merchants.edit",
    "merchant.addon_pronostics.change.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = merchantAddonSchema.safeParse({
    organizationId: formData.get("organizationId"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, enabled } = parsed.data;

  const db = createAdminBackofficeClient();
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId, {
    actor,
    action: "merchant.addon_pronostics.change",
  });
  if (stripeManaged) return stripeManaged;
  const { data: before } = await db
    .from("organizations")
    .select("addon_pronostics")
    .eq("id", organizationId)
    .maybeSingle();
  if (!before) return fail("Commerçant introuvable.");

  const { error } = await db
    .from("organizations")
    .update({ addon_pronostics: enabled })
    .eq("id", organizationId);
  if (error) return fail("Échec de la mise à jour.");

  await logAdminAction({
    actor,
    action: "merchant.addon_pronostics.change",
    targetType: "organization",
    targetId: organizationId,
    metadata: { from: before.addon_pronostics, to: enabled },
  });
  revalidatePath(`/admin/merchants/${organizationId}`);
  revalidatePath("/dashboard/pronostics");
  return { ok: true, data: undefined };
}

/** Active ou coupe l'addon Chasse au trésor (miroir de l'addon Pronostics). */
export async function setMerchantHuntsAddon(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await authorizeOrTrace(
    "merchants.edit",
    "merchant.addon_hunts.change.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = merchantAddonSchema.safeParse({
    organizationId: formData.get("organizationId"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, enabled } = parsed.data;

  const db = createAdminBackofficeClient();
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId, {
    actor,
    action: "merchant.addon_hunts.change",
  });
  if (stripeManaged) return stripeManaged;
  const { data: before } = await db
    .from("organizations")
    .select("addon_hunts")
    .eq("id", organizationId)
    .maybeSingle();
  if (!before) return fail("Commerçant introuvable.");

  const { error } = await db
    .from("organizations")
    .update({ addon_hunts: enabled })
    .eq("id", organizationId);
  if (error) return fail("Échec de la mise à jour.");

  await logAdminAction({
    actor,
    action: "merchant.addon_hunts.change",
    targetType: "organization",
    targetId: organizationId,
    metadata: { from: before.addon_hunts, to: enabled },
  });
  revalidatePath(`/admin/merchants/${organizationId}`);
  revalidatePath("/dashboard/hunts");
  return { ok: true, data: undefined };
}

/** Active ou coupe l'addon Passeport de fidélité (miroir de l'addon Chasse). */
export async function setMerchantLoyaltyAddon(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await authorizeOrTrace(
    "merchants.edit",
    "merchant.addon_loyalty.change.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = merchantAddonSchema.safeParse({
    organizationId: formData.get("organizationId"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, enabled } = parsed.data;

  const db = createAdminBackofficeClient();
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId, {
    actor,
    action: "merchant.addon_loyalty.change",
  });
  if (stripeManaged) return stripeManaged;
  const { data: before } = await db
    .from("organizations")
    .select("addon_loyalty")
    .eq("id", organizationId)
    .maybeSingle();
  if (!before) return fail("Commerçant introuvable.");

  const { error } = await db
    .from("organizations")
    .update({ addon_loyalty: enabled })
    .eq("id", organizationId);
  if (error) return fail("Échec de la mise à jour.");

  await logAdminAction({
    actor,
    action: "merchant.addon_loyalty.change",
    targetType: "organization",
    targetId: organizationId,
    metadata: { from: before.addon_loyalty, to: enabled },
  });
  revalidatePath(`/admin/merchants/${organizationId}`);
  revalidatePath("/dashboard/loyalty");
  return { ok: true, data: undefined };
}

/** Active ou coupe l'addon Jackpot collectif (miroir de l'addon Fidélité). */
export async function setMerchantJackpotAddon(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await authorizeOrTrace(
    "merchants.edit",
    "merchant.addon_jackpot.change.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = merchantAddonSchema.safeParse({
    organizationId: formData.get("organizationId"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, enabled } = parsed.data;

  const db = createAdminBackofficeClient();
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId, {
    actor,
    action: "merchant.addon_jackpot.change",
  });
  if (stripeManaged) return stripeManaged;
  const { data: before } = await db
    .from("organizations")
    .select("addon_jackpot")
    .eq("id", organizationId)
    .maybeSingle();
  if (!before) return fail("Commerçant introuvable.");

  const { error } = await db
    .from("organizations")
    .update({ addon_jackpot: enabled })
    .eq("id", organizationId);
  if (error) return fail("Échec de la mise à jour.");

  await logAdminAction({
    actor,
    action: "merchant.addon_jackpot.change",
    targetType: "organization",
    targetId: organizationId,
    metadata: { from: before.addon_jackpot, to: enabled },
  });
  revalidatePath(`/admin/merchants/${organizationId}`);
  revalidatePath("/dashboard/jackpot");
  return { ok: true, data: undefined };
}

/** Active ou coupe l'addon Mode événement en direct (miroir de l'addon Jackpot). */
export async function setMerchantEventsAddon(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await authorizeOrTrace(
    "merchants.edit",
    "merchant.addon_events.change.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = merchantAddonSchema.safeParse({
    organizationId: formData.get("organizationId"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, enabled } = parsed.data;

  const db = createAdminBackofficeClient();
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId, {
    actor,
    action: "merchant.addon_events.change",
  });
  if (stripeManaged) return stripeManaged;
  const { data: before } = await db
    .from("organizations")
    .select("addon_events")
    .eq("id", organizationId)
    .maybeSingle();
  if (!before) return fail("Commerçant introuvable.");

  const { error } = await db
    .from("organizations")
    .update({ addon_events: enabled })
    .eq("id", organizationId);
  if (error) return fail("Échec de la mise à jour.");

  await logAdminAction({
    actor,
    action: "merchant.addon_events.change",
    targetType: "organization",
    targetId: organizationId,
    metadata: { from: before.addon_events, to: enabled },
  });
  revalidatePath(`/admin/merchants/${organizationId}`);
  revalidatePath("/dashboard/events");
  return { ok: true, data: undefined };
}

/** Active ou coupe l'addon Calendrier / campagnes quotidiennes (miroir de l'addon Mode événement). */
export async function setMerchantCalendarAddon(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await authorizeOrTrace(
    "merchants.edit",
    "merchant.addon_calendar.change.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = merchantAddonSchema.safeParse({
    organizationId: formData.get("organizationId"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, enabled } = parsed.data;

  const db = createAdminBackofficeClient();
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId, {
    actor,
    action: "merchant.addon_calendar.change",
  });
  if (stripeManaged) return stripeManaged;
  const { data: before } = await db
    .from("organizations")
    .select("addon_calendar")
    .eq("id", organizationId)
    .maybeSingle();
  if (!before) return fail("Commerçant introuvable.");

  const { error } = await db
    .from("organizations")
    .update({ addon_calendar: enabled })
    .eq("id", organizationId);
  if (error) return fail("Échec de la mise à jour.");

  await logAdminAction({
    actor,
    action: "merchant.addon_calendar.change",
    targetType: "organization",
    targetId: organizationId,
    metadata: { from: before.addon_calendar, to: enabled },
  });
  revalidatePath(`/admin/merchants/${organizationId}`);
  revalidatePath("/dashboard/calendar");
  return { ok: true, data: undefined };
}

/** Active ou coupe l'addon Parrainage ludique (miroir de l'addon Calendrier). */
export async function setMerchantReferralAddon(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await authorizeOrTrace(
    "merchants.edit",
    "merchant.addon_referral.change.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = merchantAddonSchema.safeParse({
    organizationId: formData.get("organizationId"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, enabled } = parsed.data;

  const db = createAdminBackofficeClient();
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId, {
    actor,
    action: "merchant.addon_referral.change",
  });
  if (stripeManaged) return stripeManaged;
  const { data: before } = await db
    .from("organizations")
    .select("addon_referral")
    .eq("id", organizationId)
    .maybeSingle();
  if (!before) return fail("Commerçant introuvable.");

  const { error } = await db
    .from("organizations")
    .update({ addon_referral: enabled })
    .eq("id", organizationId);
  if (error) return fail("Échec de la mise à jour.");

  await logAdminAction({
    actor,
    action: "merchant.addon_referral.change",
    targetType: "organization",
    targetId: organizationId,
    metadata: { from: before.addon_referral, to: enabled },
  });
  revalidatePath(`/admin/merchants/${organizationId}`);
  // Le parrainage se pilote depuis la campagne : c'est cette surface qu'on rafraîchit.
  revalidatePath("/dashboard/campaigns");
  return { ok: true, data: undefined };
}

/** Active ou coupe l'addon Quiz (miroir de l'addon Parrainage). */
export async function setMerchantQuizAddon(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await authorizeOrTrace(
    "merchants.edit",
    "merchant.addon_quiz.change.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = merchantAddonSchema.safeParse({
    organizationId: formData.get("organizationId"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, enabled } = parsed.data;

  const db = createAdminBackofficeClient();
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId, {
    actor,
    action: "merchant.addon_quiz.change",
  });
  if (stripeManaged) return stripeManaged;
  const { data: before } = await db
    .from("organizations")
    .select("addon_quiz")
    .eq("id", organizationId)
    .maybeSingle();
  if (!before) return fail("Commerçant introuvable.");

  const { error } = await db
    .from("organizations")
    .update({ addon_quiz: enabled })
    .eq("id", organizationId);
  if (error) return fail("Échec de la mise à jour.");

  await logAdminAction({
    actor,
    action: "merchant.addon_quiz.change",
    targetType: "organization",
    targetId: organizationId,
    metadata: { from: before.addon_quiz, to: enabled },
  });
  revalidatePath(`/admin/merchants/${organizationId}`);
  revalidatePath("/dashboard/quiz");
  return { ok: true, data: undefined };
}

/**
 * Accorde ou révoque un accès offert (premium sans paiement). Indépendant
 * de Stripe : hasActiveAccess l'honore directement. Peut inclure l'addon
 * Pronostics. Action sensible (accès gratuit) : sudo exigé.
 */
export async function setMerchantCompAccess(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await authorizeOrTrace(
    "merchants.comp_access",
    "merchant.comp_access.change.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = merchantCompAccessSchema.safeParse({
    organizationId: formData.get("organizationId"),
    enabled: formData.get("enabled"),
    // Aucun `?? ""` ni `?? "false"` : le SCHÉMA absorbe le champ non rendu
    // (`texteOptionnel`, `caseACochee`). Doubler le filet ici masquerait sa
    // disparition le jour où quelqu'un la retirerait du schéma.
    until: formData.get("until"),
    note: formData.get("note"),
    includePronostics: formData.get("includePronostics"),
    includeHunts: formData.get("includeHunts"),
    includeLoyalty: formData.get("includeLoyalty"),
    includeJackpot: formData.get("includeJackpot"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const {
    organizationId,
    enabled,
    until,
    note,
    includePronostics,
    includeHunts,
    includeLoyalty,
    includeJackpot,
  } = parsed.data;

  const db = createAdminBackofficeClient();

  // Seule action du fichier qui écrivait une colonne `addon_*` SANS demander
  // d'abord qui en est l'autorité. Le trigger `organizations_protect_stripe_
  // entitlements` (20260805170000:149) refusait alors l'UPDATE — unitaire,
  // donc perdu EN ENTIER : ni module, ni accès offert, ni date, ni motif — et
  // l'opérateur ne lisait que « Échec de la mise à jour. », sans cause ni
  // marche à suivre.
  //
  // La garde est CONDITIONNELLE, et c'est essentiel : le trigger est déclaré
  // `before update of plan, addon_*`, il ne se déclenche donc pas sur
  // comp_access / comp_access_until / comp_access_note. Un accès offert SANS
  // module reste parfaitement légitime sur une organisation pilotée par
  // Stripe, et la refuser serait une régression pure.
  const { data: before } = await db
    .from("organizations")
    .select("comp_access, addon_pronostics, addon_hunts, addon_loyalty, addon_jackpot, timezone")
    .eq("id", organizationId)
    .maybeSingle();
  if (!before) return fail("Commerçant introuvable.");

  // La garde ne se déclenche que sur une écriture qui CHANGE quelque chose.
  // Le trigger, lui, ne lève que sur `is distinct from` (20260805170000:126-137) :
  // cocher « Chasses » sur une organisation dont Stripe a DÉJÀ posé
  // `addon_hunts = true` n'aurait rien modifié, et le refus tombait sur un
  // no-op. L'opérateur restait bloqué — sans danger, l'échec étant fermé, mais
  // sans raison non plus, et avec un message qui lui demandait d'aller faire
  // dans Stripe ce qui y était déjà fait. Un refus qui protège de rien
  // n'enseigne rien : il apprend à contourner.
  //
  // L'état courant est donc lu D'ABORD, et la garde ne porte que sur les
  // modules réellement à activer.
  const modulesDemandes =
    enabled &&
    ((includePronostics && !before.addon_pronostics) ||
      (includeHunts && !before.addon_hunts) ||
      (includeLoyalty && !before.addon_loyalty) ||
      (includeJackpot && !before.addon_jackpot));
  if (modulesDemandes) {
    const stripeManaged = await rejectStripeManagedEntitlements(
      db,
      organizationId,
      { actor, action: "merchant.comp_access.change" },
      "Les modules de cette organisation sont pilotés par Stripe et ne peuvent pas "
        + "être cochés ici. Accordez l'accès offert sans module, puis ajoutez le "
        + "module à son abonnement dans Stripe.",
    );
    if (stripeManaged) return stripeManaged;
  }

  // until n'a de sens que si l'accès est accordé ; on repart propre sinon.
  let compUntil: string | null = null;
  if (enabled && until !== "") {
    try {
      compUntil = endOfLocalDayToIso(until, before.timezone as string);
    } catch {
      return fail("Date de fin ou fuseau horaire invalide.");
    }
    if (new Date(compUntil).getTime() <= Date.now()) {
      return fail("La date de fin doit être dans le futur.");
    }
  }
  const fields: {
    comp_access: boolean;
    comp_access_until: string | null;
    comp_access_note: string;
    addon_pronostics?: boolean;
    addon_hunts?: boolean;
    addon_loyalty?: boolean;
    addon_jackpot?: boolean;
  } = {
    comp_access: enabled,
    comp_access_until: compUntil,
    comp_access_note: enabled ? note : "",
  };
  // Les options n'ajoutent jamais un retrait implicite d'un addon : on ne
  // les active que si demandé, sans les couper à la révocation de l'accès.
  if (enabled && includePronostics) fields.addon_pronostics = true;
  if (enabled && includeHunts) fields.addon_hunts = true;
  if (enabled && includeLoyalty) fields.addon_loyalty = true;
  if (enabled && includeJackpot) fields.addon_jackpot = true;

  const { error } = await db
    .from("organizations")
    .update(fields)
    .eq("id", organizationId);
  if (error) return fail("Échec de la mise à jour.");

  await logAdminAction({
    actor,
    action: "merchant.comp_access.change",
    targetType: "organization",
    targetId: organizationId,
    metadata: {
      from: before.comp_access,
      to: enabled,
      until: compUntil,
      includePronostics: enabled && includePronostics,
      includeHunts: enabled && includeHunts,
      includeLoyalty: enabled && includeLoyalty,
      includeJackpot: enabled && includeJackpot,
    },
  });
  revalidatePath(`/admin/merchants/${organizationId}`);
  revalidatePath("/admin/merchants");
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

/**
 * Crédite des SMS à un commerçant.
 *
 * ── POURQUOI CE GESTE EST ICI ET NON DANS LE TABLEAU DE BORD ──
 *
 * Parce qu'aucun achat n'existe encore. Tant que le crédit SMS ne passe pas par
 * Stripe, celui qui crédite est celui qui encaisse — c'est-à-dire la
 * plateforme. Poser ce bouton côté commerçant lui donnerait littéralement le
 * droit de se servir : `credit_sms_balance` ne vérifie aucun paiement, elle
 * écrit au grand livre.
 *
 * ── LA GARDE STRIPE N'EST PAS APPELÉE, ET C'EST VOULU ──
 *
 * `rejectStripeManagedEntitlements` refuse les gestes qui écrasent un droit
 * dont Stripe est l'autorité. Le crédit SMS n'en est pas un : aucun produit
 * Stripe ne le vend aujourd'hui, aucune ligne d'`organization_entitlements` ne
 * le porte, et le trigger `organizations_protect_stripe_entitlements` ne
 * surveille que `plan` et les `addon_*`. Appeler la garde ici rendrait le
 * crédit IMPOSSIBLE pour tout commerçant abonné — c'est-à-dire pour ceux qui en
 * ont besoin. Le jour où Stripe vendra des packs, c'est le webhook qui
 * créditera, et cette action redeviendra un geste de rattrapage.
 *
 * Sudo exigé, comme les autres gestes d'argent du fichier : le crédit accordé
 * ne se reprend pas (voir `SMS_CREDIT_MAX_UNITS`).
 */
export async function creditMerchantSmsBalance(
  formData: FormData,
): Promise<ActionResult<{ created: boolean }>> {
  const guard = await authorizeOrTrace(
    "merchants.sms_credit",
    "merchant.sms_credit.grant.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = merchantSmsCreditSchema.safeParse({
    organizationId: formData.get("organizationId"),
    units: formData.get("units"),
    reason: formData.get("reason"),
    // `?? ""` CONSERVÉ, et c'est le seul du fichier : `reference` est un champ
    // OBLIGATOIRE (`min(1)`). Sans lui, l'absence rendrait « expected string,
    // received null » là où la chaîne vide fait dire au schéma « Indiquez la
    // référence » — un refus dans les deux cas, mais un seul est lisible.
    reference: formData.get("reference") ?? "",
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, units, reason, reference } = parsed.data;

  const db = createAdminBackofficeClient();

  // Existence vérifiée AVANT l'appel : sans elle, une organisation inconnue
  // ferait lever la RPC sur une violation de clé étrangère, et l'opérateur
  // lirait « Échec du crédit SMS » là où « Commerçant introuvable » lui dit
  // quoi corriger. La RPC reste le rempart ; ceci n'est que le message.
  const { data: before } = await db
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (!before) return fail("Commerçant introuvable.");

  // `p_unit_cost_micros` N'EST PAS PASSÉ : le tarif gelé sur le mouvement est
  // alors celui de `sms_credits.unit_cost_micros`, c'est-à-dire le tarif
  // courant de l'organisation. Ouvrir un champ de prix dans ce formulaire
  // laisserait un opérateur écrire n'importe quel montant dans une preuve de
  // facturation, pour un gain nul tant qu'aucun tarif négocié n'existe.
  const { data, error } = await rpcStrict(db, "credit_sms_balance", {
    p_organization_id: organizationId,
    p_units: units,
    p_reason: reason,
    p_reference: reference,
  });
  if (error) {
    console.error("[admin] crédit SMS:", error.message);
    return fail("Échec du crédit SMS.");
  }

  /* ── CRÉÉ, OU DÉJÀ LÀ : LA RPC LE DIT, ON NE LE DEVINE PAS ──
   *
   * `credit_sms_balance` rend désormais `(entry_id, created)` : depuis
   * `20260828120000`, un second appel sous la même référence ne lève plus, il
   * rend le mouvement PRÉEXISTANT. Cette action lisait ce retour comme un
   * succès de création, et le résultat était une trace fausse dans un journal
   * IMPURGEABLE (`admin_audit_no_delete`) : l'opérateur qui reclique voyait
   * « accordé » deux fois, et `admin_audit_logs` affirmait 4 000 unités là où
   * le grand livre en portait 2 000. Une trace fausse est pire qu'absente :
   * elle sera lue, et elle sera crue.
   *
   * ⚠️ `tsc` NE SIGNALE RIEN ICI. `metadata` est un `Json`, et l'ancien code
   * y écrivait un tableau à la place d'un uuid sans qu'aucun type ne bronche.
   * C'est pourquoi la distinction est assertée par un test plutôt que confiée
   * au compilateur.
   *
   * ⚠️ ET L'INDEX TOUCHE AUSSI LE BACK-OFFICE. Deux crédits DÉLIBÉRÉS sous la
   * même référence ne comptent plus que pour un — c'est le prix du verrou
   * anti-double-clic. D'où le retour explicite au formulaire : l'opérateur qui
   * voulait vraiment un second lot doit apprendre qu'il ne l'a pas eu, et
   * changer sa référence.
   */
  const outcome = (data ?? [])[0] ?? null;
  const created = outcome?.created === true;
  const entryId = outcome?.entry_id ?? null;

  await logAdminAction({
    actor,
    // Deux actions distinctes et non un champ dans la charge utile : le
    // journal se lit par action, et un rejeu rangé sous `grant` resterait
    // compté comme un octroi par tout lecteur qui filtre sur le nom.
    action: created
      ? "merchant.sms_credit.grant"
      : "merchant.sms_credit.grant.duplicate",
    targetType: "organization",
    targetId: organizationId,
    // `entryId` rattache la ligne d'audit au mouvement du grand livre : c'est
    // ce qui permet, devant une réclamation, de relier « qui a décidé » à
    // « ce qui a été écrit ». `units` reste la valeur DEMANDÉE ; sur un rejeu,
    // `credited: false` dit qu'elle n'a pas été ajoutée.
    metadata: { units, reason, reference, entryId, credited: created },
  });
  revalidatePath(`/admin/merchants/${organizationId}`);
  return { ok: true, data: { created } };
}

/* ════════════════════════════════════════════════════════════
 * L'EXPÉDITEUR SMS — les deux gestes qui n'appartiennent qu'à la plateforme
 *
 * `request_sms_sender` est côté commerçant (`@/actions/sms`). Les deux
 * fonctions ci-dessous sont l'autre moitié, et la migration 20260824120000 les
 * sépare exactement pour cette raison : si la même porte demandait ET
 * déclarait, la déclaration AF2M ne serait qu'un champ que le commerçant
 * remplit lui-même.
 *
 * ── LA MÊME GARDE QUE LE CRÉDIT, ET POUR LE MÊME MOTIF ──────
 *
 * `merchants.sms_credit`, super_admin seul, sudo exigé. Déclarer un expéditeur
 * n'écrit pas d'argent, mais engage la plateforme devant l'opérateur : le nom
 * déposé au registre l'est en notre nom, et une déclaration fautive se paie en
 * suspension du compte prestataire — pour TOUS les commerçants, pas seulement
 * celui-ci. Ranger ce geste avec les cases qui se rebasculent d'un clic serait
 * mal décrire ce qu'il coûte.
 * ════════════════════════════════════════════════════════════ */

/**
 * Déclare un expéditeur au registre AF2M, référence de registre à l'appui.
 *
 * `declare_sms_sender` rend `false` quand elle n'a touché aucune ligne — nom
 * inconnu, ou déjà `declared`. Le distinguer d'un succès importe : sans cela,
 * un opérateur qui se trompe d'une lettre lit « Enregistré » et croit la
 * déclaration acquise, alors que le commerçant reste bloqué en `pending`.
 */
export async function declareMerchantSmsSender(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await authorizeOrTrace(
    "merchants.sms_credit",
    "merchant.sms_sender.declare.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = merchantSmsSenderDeclareSchema.safeParse({
    organizationId: formData.get("organizationId"),
    senderId: formData.get("senderId"),
    reference: formData.get("reference") ?? "",
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, senderId, reference } = parsed.data;

  const db = createAdminBackofficeClient();
  const { data: touched, error } = await db.rpc("declare_sms_sender", {
    p_organization_id: organizationId,
    p_sender_id: senderId,
    p_af2m_reference: reference,
  });
  if (error) {
    console.error("[admin] déclaration expéditeur SMS:", error.message);
    return fail("Échec de la déclaration.");
  }
  if (!touched) {
    return fail(
      "Aucun expéditeur à déclarer sous ce nom (inconnu, ou déjà déclaré).",
    );
  }

  await logAdminAction({
    actor,
    action: "merchant.sms_sender.declare",
    targetType: "organization",
    targetId: organizationId,
    // La référence de registre est journalisée : c'est elle qui permet, devant
    // une réclamation de l'opérateur, de relier le nom qui part chez les
    // clients au dépôt qui l'autorise.
    metadata: { senderId, reference },
  });
  revalidatePath(`/admin/merchants/${organizationId}`);
  return { ok: true, data: undefined };
}

/**
 * Refuse, suspend, remet en attente ou retire un expéditeur.
 *
 * `declared` n'est pas atteignable par cette porte — ni par le schéma, ni par
 * la RPC, qui lève. Les deux le disent, et le doublon est voulu : celui du
 * schéma donne un message, celui de la base est le rempart.
 */
export async function setMerchantSmsSenderStatus(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await authorizeOrTrace(
    "merchants.sms_credit",
    "merchant.sms_sender.status.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = merchantSmsSenderStatusSchema.safeParse({
    organizationId: formData.get("organizationId"),
    senderId: formData.get("senderId"),
    status: formData.get("status"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, senderId, status, reason } = parsed.data;

  const db = createAdminBackofficeClient();
  const { data: touched, error } = await db.rpc("set_sms_sender_status", {
    p_organization_id: organizationId,
    p_sender_id: senderId,
    p_status: status,
    // Chaîne vide → `null` : `status_reason` ne doit pas porter un motif vide
    // que l'écran commerçant afficherait comme « Motif :  ».
    p_reason: reason || null,
  });
  if (error) {
    console.error("[admin] statut expéditeur SMS:", error.message);
    return fail("Échec de la mise à jour de l'expéditeur.");
  }
  if (!touched) return fail("Aucun expéditeur sous ce nom.");

  await logAdminAction({
    actor,
    action: "merchant.sms_sender.status",
    targetType: "organization",
    targetId: organizationId,
    metadata: { senderId, status, reason },
  });
  revalidatePath(`/admin/merchants/${organizationId}`);
  return { ok: true, data: undefined };
}

/**
 * Supprime définitivement un commerçant et TOUTES ses données. Réservé au
 * super_admin, sudo exigé, confirmation par ressaisie du slug.
 *
 * Ordre : création d'un journal durable → annulation Stripe bloquante →
 * suppression de l'organisation → purge Auth/Storage traçable. Le journal
 * conserve le customer Stripe et les erreurs après la cascade métier.
 *
 * Un point mérite l'attention : entre l'annulation Stripe et son inscription
 * au journal, l'effet est réel chez le prestataire mais pas encore mémorisé.
 * Si cette inscription échoue, l'audit prend le relais — sans quoi le suivi
 * durable resterait à `pending` en mentant sur ce qui a déjà été fait.
 */
export async function deleteMerchant(formData: FormData): Promise<ActionResult> {
  const guard = await authorizeOrTrace(
    "merchants.delete",
    "merchant.delete.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = deleteMerchantSchema.safeParse({
    organizationId: formData.get("organizationId"),
    confirmSlug: formData.get("confirmSlug"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, confirmSlug } = parsed.data;

  const db = createAdminBackofficeClient();
  const { data: org, error: orgError } = await db
    .from("organizations")
    .select("id, name, slug, stripe_customer_id")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) return fail("Lecture du commerçant impossible.");
  if (!org) return fail("Commerçant introuvable.");

  // Garde-fou anti-erreur : le slug ressaisi doit correspondre exactement.
  if (confirmSlug !== org.slug) {
    return fail("Le nom saisi ne correspond pas — suppression annulée.");
  }

  // Comptes de l'équipe relevés AVANT la cascade (qui efface les adhésions).
  const { data: memberRows, error: membersError } = await db
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId);
  if (membersError) return fail("Lecture de l'équipe impossible.");
  const memberIds = (memberRows ?? []).map((m) => m.user_id as string);

  // Les comptes administrateurs ne doivent jamais être purgés avec une org.
  let adminUserIds: string[] = [];
  if (memberIds.length > 0) {
    const { data: adminRows, error: adminsError } = await db
      .from("admin_users")
      .select("user_id")
      .in("user_id", memberIds);
    if (adminsError) return fail("Vérification des comptes administrateurs impossible.");
    adminUserIds = (adminRows ?? []).map((row) => row.user_id as string);
  }

  const { data: job, error: jobError } = await db
    .from("merchant_deletion_jobs")
    .insert({
      organization_id: org.id,
      organization_name: org.name,
      organization_slug: org.slug,
      stripe_customer_id: org.stripe_customer_id,
      actor_admin_user_id: actor.id,
      actor_email: actor.email,
      member_user_ids: memberIds,
      status: "pending",
    })
    .select("id")
    .single();
  if (jobError || !job) {
    console.error("[admin] création journal suppression:", jobError?.message);
    return fail("Impossible de sécuriser la suppression : réessayez.");
  }

  // Stripe d'abord : stopper la facturation avant d'effacer nos données.
  let stripeCanceled = org.stripe_customer_id === null;
  if (org.stripe_customer_id) {
    const result = await cancelCustomerSubscriptions(org.stripe_customer_id);
    stripeCanceled = result.ok;
    if (!result.ok) {
      await updateDeletionJob(db, job.id, {
        status: "failed",
        last_error: `stripe: ${result.error ?? "erreur inconnue"}`,
      });
      await logAdminAction({
        actor,
        action: "merchant.delete.blocked",
        targetType: "organization",
        targetId: organizationId,
        metadata: { jobId: job.id, stage: "stripe" },
      });
      return fail(
        "Suppression bloquée : l'abonnement Stripe n'a pas pu être arrêté. Réessayez.",
      );
    }
  }

  const stripeJobError = await updateDeletionJob(db, job.id, {
    status: "stripe_canceled",
    last_error: null,
  });
  if (stripeJobError) {
    // L'abonnement EST arrêté chez Stripe, mais le journal durable reste à
    // `pending` : il ment sur ce qui a déjà été fait chez le prestataire, et
    // c'est le pire état pour qui reprend le dossier — on croit devoir
    // annuler ce qui l'est, ou on facture un commerçant qu'on pense encore
    // abonné. Le fait est donc inscrit dans admin_audit_logs : table
    // distincte, append-only, avec son propre mode de panne, donc encore
    // atteignable quand merchant_deletion_jobs ne l'est plus. C'est elle qui
    // permet de rapprocher un job resté « pending » d'un abonnement pourtant
    // annulé.
    console.error("[admin] journal après Stripe:", stripeJobError);
    await logAdminAction({
      actor,
      action: "merchant.delete.blocked",
      targetType: "organization",
      targetId: organizationId,
      metadata: {
        jobId: job.id,
        stage: "job_stripe_canceled",
        // Le seul champ qui compte pour la reprise : l'annulation a eu lieu.
        stripeCanceled: true,
        error: stripeJobError,
      },
    });
    // Rejouer la suppression est SANS DANGER : cancelCustomerSubscriptions
    // ignore les abonnements déjà `canceled` (cf. src/lib/stripe.ts), donc la
    // seconde tentative repart d'un état propre au lieu de re-facturer.
    return fail(
      "Suppression interrompue : l'abonnement Stripe est bien annulé, mais son " +
        "suivi n'a pas pu l'enregistrer. Relancez la suppression — réannuler " +
        "un abonnement déjà annulé est sans effet.",
    );
  }

  const { data: deletedOrg, error: deleteError } = await db
    .from("organizations")
    .delete()
    .eq("id", organizationId)
    .select("id")
    .maybeSingle();
  if (deleteError || !deletedOrg) {
    const deleteMessage = deleteError?.message ?? "organization not deleted";
    console.error("[admin] delete merchant:", deleteMessage);
    await updateDeletionJob(db, job.id, {
      status: "failed",
      last_error: `database: ${deleteMessage}`,
    });
    return fail("Échec de la suppression.");
  }

  const cleanupIssues: CleanupIssue[] = [];
  const databaseJobError = await updateDeletionJob(db, job.id, {
    status: "database_deleted",
  });
  if (databaseJobError) {
    cleanupIssues.push({ stage: "job", message: databaseJobError });
  }

  // Comptes de connexion devenus orphelins (plus aucune organisation) :
  // chaque erreur retournée par Supabase est vérifiée et journalisée.
  const cleanupCandidates = selectAuthCleanupCandidates(
    memberIds,
    actor.user_id,
    adminUserIds,
  );
  for (const userId of cleanupCandidates) {
    const { count, error: countError } = await db
      .from("organization_members")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (countError) {
      cleanupIssues.push({
        stage: "auth_membership_check",
        userId,
        message: countError.message,
      });
      continue;
    }
    if ((count ?? 0) === 0) {
      const { error: authError } = await db.auth.admin.deleteUser(userId);
      if (authError) {
        cleanupIssues.push({
          stage: "auth_delete",
          userId,
          message: authError.message,
        });
      }
    }
  }

  // Chaque dossier peut dépasser 100 fichiers : pagination explicite.
  for (const bucket of ["logos", "poster-images"]) {
    try {
      await removeOrganizationStorage(db, bucket, org.id);
    } catch (e) {
      cleanupIssues.push({
        stage: `storage:${bucket}`,
        message: cleanupErrorMessage(e),
      });
    }
  }

  const completedAt = new Date().toISOString();
  const finalJobError = await updateDeletionJob(db, job.id, {
    status: cleanupIssues.length === 0 ? "completed" : "completed_with_warnings",
    cleanup_errors: cleanupIssues,
    last_error: cleanupIssues.length === 0 ? null : "Nettoyage incomplet",
    completed_at: completedAt,
  });
  if (finalJobError) {
    console.error("[admin] finalisation journal suppression:", finalJobError);
    cleanupIssues.push({ stage: "job_finalization", message: finalJobError });
  }

  await logAdminAction({
    actor,
    action: "merchant.delete",
    targetType: "organization",
    targetId: organizationId,
    metadata: {
      jobId: job.id,
      name: org.name,
      slug: org.slug,
      members: memberIds.length,
      stripeCanceled,
      protectedAdminAccounts: adminUserIds.length,
      cleanupWarnings: cleanupIssues.length,
    },
  });

  revalidatePath("/admin/merchants");
  redirect(
    cleanupIssues.length === 0
      ? "/admin/merchants?deletion=success"
      : "/admin/merchants?deletion=warning",
  );
}

/** Ajoute une note interne support sur un commerçant. */
export async function addMerchantNote(formData: FormData): Promise<ActionResult> {
  // Seule action du fichier sans sudo, et à dessein : écrire une note support
  // n'accorde aucun droit et ne touche aucune donnée du commerçant. L'exiger
  // ferait reconnecter le support toutes les quinze minutes pour rien.
  const guard = await authorizeOrTrace(
    "support.reply",
    "merchant.note.add.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = addNoteSchema.safeParse({
    organizationId: formData.get("organizationId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, body } = parsed.data;

  const db = createAdminBackofficeClient();
  const { error } = await db.from("admin_notes").insert({
    organization_id: organizationId,
    admin_user_id: actor.id,
    author_email: actor.email,
    body,
  });
  if (error) return fail("Échec de l'enregistrement de la note.");

  await logAdminAction({
    actor,
    action: "merchant.note.add",
    targetType: "organization",
    targetId: organizationId,
  });
  revalidatePath(`/admin/merchants/${organizationId}`);
  return { ok: true, data: undefined };
}

/**
 * Accorde un octroi daté de module (P0 lot 2, migration 20260907120000).
 *
 * Le back-office est aujourd'hui le SEUL chemin de création : aucun produit
 * Stripe n'existe pour ces droits, le cahier interdisant d'en créer avant que
 * les tarifs soient revalidés commercialement. Cette action est donc ce qui
 * rend la table atteignable — sans elle, la capacité livrée par la migration
 * ne serait accessible à personne, exactement la classe de défaut que ce
 * dépôt s'est reprochée plusieurs fois.
 */
export async function grantMerchantModule(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await authorizeOrTrace(
    "merchants.edit",
    "merchant.module_grant.create.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  // AUCUNE NORMALISATION ICI, ET C'EST DÉLIBÉRÉ. Un champ non rendu arrive en
  // `null` — le panneau n'affiche « durée » que pour un pass immédiat et
  // « délai » que pour un pass différé —, et c'est le SCHÉMA qui l'absorbe
  // désormais (`entierOptionnel`, `reference`). Le normaliser ici en plus
  // donnerait deux mécanismes pour une règle : celui qu'on lit et celui qui
  // décide, et le jour où ils divergeraient, personne ne saurait lequel fait
  // foi. Les champs obligatoires restent bruts : leur absence est une vraie
  // erreur de saisie, et Zod doit continuer à la dire.
  const parsed = merchantModuleGrantSchema.safeParse({
    organizationId: formData.get("organizationId"),
    module: formData.get("module"),
    kind: formData.get("kind"),
    demarrage: formData.get("demarrage"),
    dureeJours: formData.get("dureeJours"),
    delaiActivationJours: formData.get("delaiActivationJours"),
    jauge: formData.get("jauge"),
    reference: formData.get("reference"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const saisie = parsed.data;

  // La cohérence des deux fenêtres est décidée par un module PUR, testé sans
  // formulaire ni base (src/lib/admin/module-grants.test.ts).
  const verdict = calculerFenetres({
    module: saisie.module,
    kind: saisie.kind,
    demarrage: saisie.demarrage,
    dureeJours: saisie.dureeJours,
    delaiActivationJours: saisie.delaiActivationJours,
    jauge: saisie.jauge,
  });
  if (!verdict.ok) return fail(verdict.erreur);

  const db = createAdminBackofficeClient();
  const { data: org } = await db
    .from("organizations")
    .select("id")
    .eq("id", saisie.organizationId)
    .maybeSingle();
  if (!org) return fail("Commerçant introuvable.");

  const { data: cree, error } = await db
    .from("organization_module_grants")
    .insert({
      organization_id: saisie.organizationId,
      module: saisie.module,
      kind: saisie.kind,
      source: "backoffice",
      source_reference: saisie.reference || null,
      ...verdict.fenetres,
    })
    .select("id")
    .maybeSingle();
  if (error || !cree) {
    // ── LE CUMUL RÉCURRENT EST UN REFUS, PAS UNE PANNE ──
    //
    // `organization_module_grants_recurrent_vivant_idx` (20260910120000) tient
    // la décision produit : un commerçant n'a pas deux add-ons mensuels vivants
    // sur le même module. Sans ce rattrapage, l'admin lisait « Échec de la
    // création de l'octroi. » — un message qui ne dit ni que le refus est
    // délibéré, ni ce qui bloque, ni quoi faire, et qui invite donc à
    // recommencer le même geste.
    //
    // La contrainte est reconnue par son NOM (`violeContrainte`), jamais par la
    // phrase de Postgres : tout autre conflit d'unicité reste une vraie erreur.
    if (violeContrainte(error, INDEX_RECURRENT_UNIQUE)) {
      // La relecture reprend LE PRÉDICAT DE L'INDEX — récurrent, non révoqué,
      // sans terme — donc elle désigne exactement la ligne qui a bloqué. Elle
      // est scopée à l'organisation comme tout le reste du fichier.
      const { data: bloquant } = await db
        .from("organization_module_grants")
        .select("starts_at, source")
        .eq("organization_id", saisie.organizationId)
        .eq("module", saisie.module)
        .eq("kind", "recurring")
        .is("revoked_at", null)
        .is("ends_at", null)
        .maybeSingle();
      return fail(messageCumulRecurrent(saisie.module, bloquant));
    }
    return fail("Échec de la création de l'octroi.");
  }

  await logAdminAction({
    actor,
    action: "merchant.module_grant.create",
    targetType: "organization",
    targetId: saisie.organizationId,
    metadata: {
      grant_id: cree.id,
      module: saisie.module,
      kind: saisie.kind,
      ...verdict.fenetres,
    },
  });
  revalidatePath(`/admin/merchants/${saisie.organizationId}`);
  return { ok: true, data: undefined };
}

/**
 * Révoque un octroi. La ligne est CONSERVÉE — « les données et exports
 * restent lisibles » (cahier §2) — et cesse simplement d'être vivante.
 */
export async function revokeMerchantModuleGrant(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await authorizeOrTrace(
    "merchants.edit",
    "merchant.module_grant.revoke.denied",
    { type: "organization", id: auditTargetId(formData, "organizationId") },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = merchantGrantRevokeSchema.safeParse({
    organizationId: formData.get("organizationId"),
    grantId: formData.get("grantId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, grantId, reason } = parsed.data;

  const db = createAdminBackofficeClient();
  // La lecture est SCOPÉE à l'organisation, et pas seulement l'écriture : sans
  // cela, un identifiant d'octroi appartenant à un autre commerçant serait lu
  // ici puis refusé plus loin, ce qui en ferait une sonde d'existence.
  const { data: avant } = await db
    .from("organization_module_grants")
    .select("id, module, source, revoked_at")
    .eq("id", grantId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!avant) return fail("Octroi introuvable.");
  if (avant.revoked_at) return fail("Cet octroi est déjà révoqué.");
  // Un octroi né d'un paiement Stripe ne se révoque pas à la main : le
  // désaccord se réglerait au prochain webhook, et l'écran mentirait entre les
  // deux. Le geste juste est un remboursement côté Stripe.
  if (avant.source === "stripe") {
    return fail(
      "Cet octroi vient de Stripe : il se révoque depuis Stripe, pas ici.",
    );
  }

  const { error } = await db
    .from("organization_module_grants")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq("id", grantId)
    .eq("organization_id", organizationId);
  if (error) return fail("Échec de la révocation.");

  await logAdminAction({
    actor,
    action: "merchant.module_grant.revoke",
    targetType: "organization",
    targetId: organizationId,
    metadata: { grant_id: grantId, module: avant.module, reason },
  });
  revalidatePath(`/admin/merchants/${organizationId}`);
  return { ok: true, data: undefined };
}
