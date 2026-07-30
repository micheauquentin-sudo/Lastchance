"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminBackofficeClient } from "@/lib/admin/db";
import {
  actorIp,
  authorizeAction,
  getAdminUser,
  AdminForbiddenError,
} from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import type { Permission } from "@/lib/admin/rbac";
import type { AdminUser } from "@/types/admin";
import {
  addNoteSchema,
  deleteMerchantSchema,
  merchantAddonSchema,
  merchantCompAccessSchema,
  merchantPlanSchema,
  merchantStatusSchema,
} from "@/lib/validations/admin";
import { PLANS, cancelCustomerSubscriptions } from "@/lib/stripe";
import { endOfLocalDayToIso } from "@/lib/date-time";
import {
  cleanupErrorMessage,
  selectAuthCleanupCandidates,
} from "@/lib/admin/merchant-deletion";
import {
  RATE_LIMITS,
  rateLimit,
  rateLimitBucket,
} from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/utils";

function fail(error: string): ActionResult {
  return { ok: false, error };
}

type AdminDb = ReturnType<typeof createAdminBackofficeClient>;
type CleanupIssue = { stage: string; message: string; userId?: string };

/**
 * L'identifiant arrive du formulaire AVANT toute validation : une tentative
 * est refusée bien avant que zod n'ait parlé. Or `admin_audit_logs.target_id`
 * porte un `check (char_length(target_id) <= 120)` — y verser la chaîne brute
 * ferait échouer l'insertion, donc PERDRE la trace, exactement pour la requête
 * fabriquée qu'on cherchait à voir. On ne retient qu'une valeur qui a la forme
 * d'un identifiant, sinon rien.
 */
function auditTargetId(formData: FormData): string | null {
  const raw = formData.get("organizationId");
  return typeof raw === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
    ? raw
    : null;
}

/**
 * Consigne une tentative REFUSÉE.
 *
 * Le back-office n'enregistrait que ses succès : un compte révoqué qui rejoue
 * ses anciennes actions, un opérateur qui teste les limites de son rôle, ou un
 * POST fabriqué contre l'action serveur n'y laissaient rien. Dans ces
 * conditions, cinquante `merchants.delete` refusés d'affilée ressemblent à une
 * journée calme — on ne peut pas voir qu'on sonde l'outil.
 *
 * Écriture directe plutôt que `logAdminAction` : celui-ci exige une ligne
 * `admin_users` existante pour `admin_user_id`, ce qu'un appel sans session n'a
 * pas — or c'est justement le cas le plus intéressant à voir. Même forme que le
 * refus de connexion (`admin.login.denied`, src/app/admin/actions.ts) : rôle
 * `none` quand l'appelant n'est pas identifié, et suffixe `.denied` que l'écran
 * /admin/audit colore en rouge.
 *
 * Best-effort par construction : une panne du journal ne doit pas devenir une
 * panne d'autorisation. Le refus est déjà prononcé ; la trace n'en est que la
 * mémoire, et la perdre vaut mieux que renvoyer une erreur d'un autre genre.
 */
async function traceDeniedAttempt(
  action: string,
  permission: Permission,
  reason: string,
  formData: FormData,
): Promise<void> {
  try {
    // ── PLAFOND, et non refus ────────────────────────────────
    // Sans lui, ce correctif ouvrait un point d'ÉCRITURE NON AUTHENTIFIÉ dans
    // une table qu'on ne peut pas purger : `admin_audit_logs` porte le trigger
    // `admin_audit_no_delete` — même le service role ne peut rien y effacer, et
    // `purge_expired_personal_data` se contente d'ANONYMISER à 24 mois.
    //
    // Un POST fabriqué contre cette action ne coûtait rien avant ; il insérait
    // une ligne après. N'importe qui pouvait donc faire croître la table sans
    // borne et — c'est le pire — NOYER le signal que cette trace existe pour
    // rendre visible : `listAuditLogs` trie par date et pagine par trente, si
    // bien que « cinquante refus d'affilée » redevenaient invisibles, cette
    // fois sous un million de lignes indélébiles.
    //
    // Le seau est en OBSERVABILITÉ : au-delà du plafond on cesse d'écrire, on
    // ne refuse rien de plus. Le refus d'autorisation est déjà prononcé en
    // amont ; faire dépendre une décision de sécurité d'un seau partagé par IP
    // en ferait un interrupteur pour l'attaquant. Le précédent maison
    // `admin.login.denied` est protégé de la même façon.
    // IP absente (proxy non déclaré) : seau NOMMÉ et partagé plutôt qu'aucun
    // seau. Tous les appelants sans IP se partagent alors un plafond commun —
    // c'est plus strict, et c'est le bon sens : une trace qu'on ne peut pas
    // rattacher à une origine est aussi celle qu'on peut le plus facilement
    // fabriquer en masse.
    const ip = (await actorIp()) ?? "sans-ip";
    const sousPlafond = await rateLimit(
      rateLimitBucket("admin:denied-trace", ip),
      RATE_LIMITS.authLogin,
    );
    if (!sousPlafond) return;

    // `getAdminUser` est mémoïsé sur la requête : la garde vient de le lire,
    // relire l'identité ne coûte aucun aller-retour supplémentaire.
    const admin = await getAdminUser();
    const { error } = await createAdminBackofficeClient()
      .from("admin_audit_logs")
      .insert({
        admin_user_id: admin?.id ?? null,
        actor_email: admin?.email ?? "inconnu",
        actor_role: admin?.role ?? "none",
        action,
        target_type: "organization",
        target_id: auditTargetId(formData),
        metadata: { permission, reason },
        ip: await actorIp(),
      });
    if (error) console.error("[admin] trace de refus:", error.message);
  } catch (e) {
    console.error("[admin] trace de refus:", e);
  }
}

type AuthorizedAction =
  | { granted: true; actor: AdminUser }
  | { granted: false; denied: ActionResult };

/**
 * Garde commune aux treize actions. Elle n'existe pas pour factoriser trois
 * lignes : elle existe pour qu'aucun refus ne reparte muet. Un `catch` recopié
 * treize fois est un endroit où l'on oublie treize fois d'écrire la trace.
 */
async function authorizeOrTrace(
  permission: Permission,
  deniedAction: string,
  formData: FormData,
  opts: { requireFresh?: boolean } = {},
): Promise<AuthorizedAction> {
  try {
    return { granted: true, actor: await authorizeAction(permission, opts) };
  } catch (e) {
    const reason = e instanceof AdminForbiddenError ? e.message : "Non autorisé.";
    await traceDeniedAttempt(deniedAction, permission, reason, formData);
    return { granted: false, denied: fail(reason) };
  }
}

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
 */
async function rejectStripeManagedEntitlements(
  db: AdminDb,
  organizationId: string,
): Promise<ActionResult | null> {
  const { count, error } = await db
    .from("organization_entitlements")
    .select("organization_id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("source", "stripe");

  if (error) {
    console.error("[admin] entitlement authority check:", error.message);
    return fail("Impossible de vérifier la source des droits.");
  }
  if ((count ?? 0) > 0) {
    return fail(
      "Cette organisation est pilotée par Stripe. Modifiez son abonnement dans Stripe.",
    );
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
    formData,
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
    .select("subscription_status")
    .eq("id", organizationId)
    .maybeSingle();
  if (!before) return fail("Commerçant introuvable.");

  const { error } = await db
    .from("organizations")
    .update({ subscription_status: status })
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
    formData,
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
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId);
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
    formData,
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
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId);
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
    formData,
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
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId);
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
    formData,
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
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId);
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
    formData,
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
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId);
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
    formData,
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
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId);
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
    formData,
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
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId);
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
    formData,
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
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId);
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
    formData,
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
  const stripeManaged = await rejectStripeManagedEntitlements(db, organizationId);
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
    formData,
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = merchantCompAccessSchema.safeParse({
    organizationId: formData.get("organizationId"),
    enabled: formData.get("enabled"),
    until: formData.get("until") ?? "",
    note: formData.get("note") ?? "",
    includePronostics: formData.get("includePronostics") ?? "false",
    includeHunts: formData.get("includeHunts") ?? "false",
    includeLoyalty: formData.get("includeLoyalty") ?? "false",
    includeJackpot: formData.get("includeJackpot") ?? "false",
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
  const { data: before } = await db
    .from("organizations")
    .select("comp_access, addon_pronostics, addon_hunts, addon_loyalty, addon_jackpot, timezone")
    .eq("id", organizationId)
    .maybeSingle();
  if (!before) return fail("Commerçant introuvable.");

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
    formData,
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
    formData,
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
