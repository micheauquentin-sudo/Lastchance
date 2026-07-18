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
import type { ActionResult } from "@/lib/utils";

function fail(error: string): ActionResult {
  return { ok: false, error };
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
    actor = await authorizeAction("merchants.edit", { requireFresh: true });
  } catch (e) {
    return fail(e instanceof AdminForbiddenError ? e.message : "Non autorisé.");
  }

  const parsed = merchantCompAccessSchema.safeParse({
    organizationId: formData.get("organizationId"),
    enabled: formData.get("enabled"),
    until: formData.get("until") ?? "",
    note: formData.get("note") ?? "",
    includePronostics: formData.get("includePronostics") ?? "false",
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { organizationId, enabled, until, note, includePronostics } = parsed.data;

  const db = createAdminBackofficeClient();
  const { data: before } = await db
    .from("organizations")
    .select("comp_access, addon_pronostics")
    .eq("id", organizationId)
    .maybeSingle();
  if (!before) return fail("Commerçant introuvable.");

  // until n'a de sens que si l'accès est accordé ; on repart propre sinon.
  const compUntil = enabled && until !== "" ? until.toISOString() : null;
  const fields: {
    comp_access: boolean;
    comp_access_until: string | null;
    comp_access_note: string;
    addon_pronostics?: boolean;
  } = {
    comp_access: enabled,
    comp_access_until: compUntil,
    comp_access_note: enabled ? note : "",
  };
  // L'option n'ajoute jamais un retrait implicite de l'addon : on ne
  // l'active que si demandé, sans le couper à la révocation de l'accès.
  if (enabled && includePronostics) fields.addon_pronostics = true;

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
 * Ordre : annulation Stripe (best-effort) → suppression de la ligne
 * organisation (cascade sur les 17 tables métier) → journal d'audit →
 * purge des comptes de connexion devenus orphelins et du logo (best-effort).
 * L'audit est écrit APRÈS la suppression réussie mais survit à celle-ci
 * (admin_audit_logs ne référence pas organizations).
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
  const { data: org } = await db
    .from("organizations")
    .select("id, name, slug, stripe_customer_id, logo_url")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return fail("Commerçant introuvable.");

  // Garde-fou anti-erreur : le slug ressaisi doit correspondre exactement.
  if (confirmSlug !== org.slug) {
    return fail("Le nom saisi ne correspond pas — suppression annulée.");
  }

  // Comptes de l'équipe relevés AVANT la cascade (qui efface les adhésions).
  const { data: memberRows } = await db
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId);
  const memberIds = (memberRows ?? []).map((m) => m.user_id as string);

  // Stripe d'abord : stopper la facturation avant d'effacer nos données.
  let stripeCanceled = false;
  if (org.stripe_customer_id) {
    const result = await cancelCustomerSubscriptions(org.stripe_customer_id);
    stripeCanceled = result.ok;
    if (!result.ok) {
      console.warn("[admin] annulation Stripe:", result.error);
    }
  }

  const { error: deleteError } = await db
    .from("organizations")
    .delete()
    .eq("id", organizationId);
  if (deleteError) {
    console.error("[admin] delete merchant:", deleteError.message);
    return fail("Échec de la suppression.");
  }

  await logAdminAction({
    actor,
    action: "merchant.delete",
    targetType: "organization",
    targetId: organizationId,
    metadata: {
      name: org.name,
      slug: org.slug,
      members: memberIds.length,
      stripeCanceled,
    },
  });

  // Comptes de connexion devenus orphelins (plus aucune organisation) :
  // suppression best-effort — la donnée métier est déjà partie.
  for (const userId of memberIds) {
    try {
      const { count } = await db
        .from("organization_members")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", userId);
      if ((count ?? 0) === 0) {
        await db.auth.admin.deleteUser(userId);
      }
    } catch (e) {
      console.warn("[admin] purge compte orphelin:", e);
    }
  }

  // Logos dans le Storage (bucket "logos", dossier {org.id}) : best-effort.
  try {
    const { data: files } = await db.storage.from("logos").list(org.id);
    if (files && files.length > 0) {
      await db.storage
        .from("logos")
        .remove(files.map((f) => `${org.id}/${f.name}`));
    }
  } catch (e) {
    console.warn("[admin] purge logos:", e);
  }

  revalidatePath("/admin/merchants");
  redirect("/admin/merchants");
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
