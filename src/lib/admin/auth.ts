import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, type Permission } from "@/lib/admin/rbac";
import type { AdminUser } from "@/types/admin";

/**
 * Identité admin du back-office.
 *
 * Deux barrières :
 *  1. une session Supabase valide (auth.users) — comme l'app ;
 *  2. un enregistrement `admin_users` ACTIF pour cet utilisateur.
 *
 * La table admin_users est verrouillée par RLS (aucune policy) : on la
 * lit via la service role key, filtrée sur l'id de l'utilisateur
 * authentifié — jamais sur une entrée arbitraire. Un simple compte
 * commerçant, même valide, ne renvoie donc aucun admin.
 */
export const getAdminUser = cache(async (): Promise<AdminUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_users")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  return (data as AdminUser | null) ?? null;
});

/** Erreur levée par une action serveur admin refusée (RBAC). */
export class AdminForbiddenError extends Error {
  constructor(message = "Action non autorisée.") {
    super(message);
    this.name = "AdminForbiddenError";
  }
}

/**
 * Garde de PAGE : exige un admin actif (et, si fourni, la permission).
 * Redirige vers /admin/login (non connecté / non admin) ou
 * /admin/unauthorized (admin sans la permission). À appeler en tête de
 * chaque page/segment du back-office.
 */
export async function requireAdmin(permission?: Permission): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  if (permission && !can(admin.role, permission)) redirect("/admin/unauthorized");
  return admin;
}

/**
 * Garde d'ACTION serveur : exige un admin actif + la permission, sinon
 * lève AdminForbiddenError (jamais de redirect dans une action mutante).
 * TOUJOURS l'appeler AVANT toute mutation, indépendamment de l'UI.
 */
export async function authorizeAction(permission: Permission): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) throw new AdminForbiddenError("Session admin requise.");
  if (!can(admin.role, permission)) {
    throw new AdminForbiddenError("Permission insuffisante pour cette action.");
  }
  return admin;
}

/** IP source (journalisation d'audit). */
export async function actorIp(): Promise<string | null> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null
  );
}
