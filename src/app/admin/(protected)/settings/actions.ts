"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAction, AdminForbiddenError } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { canAssignRole, canManageAdmin, evaluateRoleChange } from "@/lib/admin/rbac";
import {
  createAdminSchema,
  toggleAdminSchema,
  updateAdminRoleSchema,
} from "@/lib/validations/admin";
import { getAdminById } from "@/lib/admin/data";
import type { AdminRole, AdminUser } from "@/types/admin";
import type { ActionResult } from "@/lib/utils";

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Nombre de super_admins actifs (garde anti-verrouillage). */
async function activeSuperAdminCount(db: ReturnType<typeof createAdminClient>): Promise<number> {
  const { count } = await db
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin")
    .eq("is_active", true);
  return count ?? 0;
}

/**
 * Résout un email en user_id auth (l'utilisateur doit déjà avoir un
 * compte). Via un RPC indexé — pas d'énumération de la table des
 * utilisateurs (qui contient aussi tous les commerçants).
 */
async function findAuthUserId(
  db: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const { data } = await db.rpc("admin_user_id_by_email", { p_email: email });
  return (data as string | null) ?? null;
}

/** Ajoute un membre à l'équipe admin. Anti-escalade : rôle ≤ le sien. */
export async function createAdmin(formData: FormData): Promise<ActionResult> {
  let actor: AdminUser;
  try {
    actor = await authorizeAction("admins.manage");
  } catch (e) {
    return fail(e instanceof AdminForbiddenError ? e.message : "Non autorisé.");
  }

  const parsed = createAdminSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name") ?? "",
    role: formData.get("role"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { email, name, role } = parsed.data;

  if (!canAssignRole(actor.role, role as AdminRole)) {
    return fail("Vous ne pouvez pas attribuer un rôle supérieur au vôtre.");
  }

  const db = createAdminClient();
  const userId = await findAuthUserId(db, email);
  if (!userId) {
    return fail("Aucun compte pour cet email. La personne doit d'abord s'inscrire.");
  }

  const { data: existing } = await db
    .from("admin_users")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return fail("Cet utilisateur est déjà membre de l'équipe admin.");

  const { data: created, error } = await db
    .from("admin_users")
    .insert({ user_id: userId, email, name, role, created_by: actor.id, is_active: true })
    .select("id")
    .single();
  if (error) return fail("Échec de la création.");

  await logAdminAction({
    actor,
    action: "admin.create",
    targetType: "admin_user",
    targetId: created?.id,
    metadata: { email, role },
  });
  revalidatePath("/admin/settings");
  return { ok: true, data: undefined };
}

/** Modifie le rôle d'un admin, avec toutes les gardes anti-escalade. */
export async function updateAdminRole(formData: FormData): Promise<ActionResult> {
  let actor: AdminUser;
  try {
    actor = await authorizeAction("admins.manage");
  } catch (e) {
    return fail(e instanceof AdminForbiddenError ? e.message : "Non autorisé.");
  }

  const parsed = updateAdminRoleSchema.safeParse({
    adminId: formData.get("adminId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { adminId, role } = parsed.data;

  const target = await getAdminById(adminId);
  if (!target) return fail("Admin introuvable.");

  const verdict = evaluateRoleChange(
    { id: actor.id, role: actor.role },
    { id: target.id, role: target.role },
    role as AdminRole,
  );
  if (!verdict.ok) return fail(verdict.reason);

  // Anti-verrouillage : ne pas rétrograder le dernier super_admin actif.
  const db = createAdminClient();
  if (target.role === "super_admin" && role !== "super_admin" && target.is_active) {
    if ((await activeSuperAdminCount(db)) <= 1) {
      return fail("Impossible : dernier super_admin actif.");
    }
  }

  const { error } = await db
    .from("admin_users")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", adminId);
  if (error) return fail("Échec de la mise à jour.");

  await logAdminAction({
    actor,
    action: "admin.role.change",
    targetType: "admin_user",
    targetId: adminId,
    metadata: { from: target.role, to: role, target_email: target.email },
  });
  revalidatePath("/admin/settings");
  return { ok: true, data: undefined };
}

/** Active/désactive un compte admin. */
export async function toggleAdmin(formData: FormData): Promise<ActionResult> {
  let actor: AdminUser;
  try {
    actor = await authorizeAction("admins.manage");
  } catch (e) {
    return fail(e instanceof AdminForbiddenError ? e.message : "Non autorisé.");
  }

  const parsed = toggleAdminSchema.safeParse({
    adminId: formData.get("adminId"),
    isActive: formData.get("isActive") === "true",
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { adminId, isActive } = parsed.data;

  const target = await getAdminById(adminId);
  if (!target) return fail("Admin introuvable.");

  if (!canManageAdmin({ id: actor.id, role: actor.role }, { id: target.id, role: target.role })) {
    return fail("Vous ne pouvez pas gérer ce compte.");
  }

  const db = createAdminClient();
  if (!isActive && target.role === "super_admin" && target.is_active) {
    if ((await activeSuperAdminCount(db)) <= 1) {
      return fail("Impossible : dernier super_admin actif.");
    }
  }

  const { error } = await db
    .from("admin_users")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", adminId);
  if (error) return fail("Échec de la mise à jour.");

  await logAdminAction({
    actor,
    action: isActive ? "admin.activate" : "admin.deactivate",
    targetType: "admin_user",
    targetId: adminId,
    metadata: { target_email: target.email },
  });
  revalidatePath("/admin/settings");
  return { ok: true, data: undefined };
}
