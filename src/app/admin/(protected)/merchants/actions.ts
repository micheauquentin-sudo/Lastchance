"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminBackofficeClient } from "@/lib/admin/db";
import { authorizeAction, AdminForbiddenError } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
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
import type { ActionResult } from "@/lib/utils";

function fail(error: string): ActionResult {
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
  let actor;
  try {
    // Action sensible : connexion récente exigée (sudo).
    actor = await authorizeAction("merchants.suspend", { requireFresh: true });
  } catch (e) {
    return fail(e instanceof AdminForbiddenError ? e.message : "Non autorisé.");
  }

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

/** Change le plan d'un commerçant. */
export async function setMerchantPlan(formData: FormData): Promise<ActionResult> {
  let actor;
  try {
    actor = await authorizeAction("merchants.edit");
  } catch (e) {
    return fail(e instanceof AdminForbiddenError ? e.message : "Non autorisé.");
  }

  const parsed = merchantPlanSchema.safeParse({
    organizationId: formData.get("organizationId"),
    plan: formData.get("plan"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, plan } = parsed.data;

  if (!PLANS.some((p) => p.id === plan)) return fail("Plan inconnu.");

  const db = createAdminBackofficeClient();
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
  let actor;
  try {
    actor = await authorizeAction("merchants.edit", { requireFresh: true });
  } catch (e) {
    return fail(e instanceof AdminForbiddenError ? e.message : "Non autorisé.");
  }

  const parsed = merchantAddonSchema.safeParse({
    organizationId: formData.get("organizationId"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, enabled } = parsed.data;

  const db = createAdminBackofficeClient();
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
  let actor;
  try {
    actor = await authorizeAction("merchants.edit", { requireFresh: true });
  } catch (e) {
    return fail(e instanceof AdminForbiddenError ? e.message : "Non autorisé.");
  }

  const parsed = merchantAddonSchema.safeParse({
    organizationId: formData.get("organizationId"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, enabled } = parsed.data;

  const db = createAdminBackofficeClient();
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

/**
 * Accorde ou révoque un accès offert (premium sans paiement). Indépendant
 * de Stripe : hasActiveAccess l'honore directement. Peut inclure l'addon
 * Pronostics. Action sensible (accès gratuit) : sudo exigé.
 */
export async function setMerchantCompAccess(
  formData: FormData,
): Promise<ActionResult> {
  let actor;
  try {
    actor = await authorizeAction("merchants.comp_access", { requireFresh: true });
  } catch (e) {
    return fail(e instanceof AdminForbiddenError ? e.message : "Non autorisé.");
  }

  const parsed = merchantCompAccessSchema.safeParse({
    organizationId: formData.get("organizationId"),
    enabled: formData.get("enabled"),
    until: formData.get("until") ?? "",
    note: formData.get("note") ?? "",
    includePronostics: formData.get("includePronostics") ?? "false",
    includeHunts: formData.get("includeHunts") ?? "false",
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, enabled, until, note, includePronostics, includeHunts } =
    parsed.data;

  const db = createAdminBackofficeClient();
  const { data: before } = await db
    .from("organizations")
    .select("comp_access, addon_pronostics, addon_hunts, timezone")
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
  } = {
    comp_access: enabled,
    comp_access_until: compUntil,
    comp_access_note: enabled ? note : "",
  };
  // Les options n'ajoutent jamais un retrait implicite d'un addon : on ne
  // les active que si demandé, sans les couper à la révocation de l'accès.
  if (enabled && includePronostics) fields.addon_pronostics = true;
  if (enabled && includeHunts) fields.addon_hunts = true;

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
 */
export async function deleteMerchant(formData: FormData): Promise<ActionResult> {
  let actor;
  try {
    actor = await authorizeAction("merchants.delete", { requireFresh: true });
  } catch (e) {
    return fail(e instanceof AdminForbiddenError ? e.message : "Non autorisé.");
  }

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
    console.error("[admin] journal après Stripe:", stripeJobError);
    return fail("Suppression interrompue : son suivi durable n'a pas pu être mis à jour.");
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
  let actor;
  try {
    actor = await authorizeAction("support.reply");
  } catch (e) {
    return fail(e instanceof AdminForbiddenError ? e.message : "Non autorisé.");
  }

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
