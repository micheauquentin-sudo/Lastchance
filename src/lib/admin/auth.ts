import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminBackofficeClient } from "@/lib/admin/db";
import { can, type Permission } from "@/lib/admin/rbac";
import type { AdminUser } from "@/types/admin";

/**
 * Durée de vie ABSOLUE d'une session admin (minutes) : passé ce délai
 * depuis la dernière connexion, l'accès au back-office est coupé et une
 * ré-authentification est exigée, même si la session Supabase reste
 * techniquement valide. Configurable via ADMIN_SESSION_MAX_MINUTES.
 */
const SESSION_MAX_MIN = Number(process.env.ADMIN_SESSION_MAX_MINUTES ?? 480); // 8 h

/**
 * Fenêtre « sudo » (minutes) : les actions les plus sensibles (gestion
 * d'équipe, suspension d'un commerçant) exigent une connexion récente.
 * Configurable via ADMIN_SUDO_MINUTES.
 */
const SUDO_MIN = Number(process.env.ADMIN_SUDO_MINUTES ?? 15);

function minutesSince(iso: string | null): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

/**
 * Identité admin du back-office.
 *
 * Trois barrières :
 *  1. une session Supabase valide (auth.users) ;
 *  2. un enregistrement `admin_users` ACTIF pour cet utilisateur ;
 *  3. une session admin non expirée (last_login_at récent).
 *
 * La table admin_users est verrouillée par RLS (aucune policy) : on la
 * lit via une service role key dédiée, filtrée sur l'id de l'utilisateur
 * authentifié. Une session trop ancienne (ou jamais initialisée via la
 * connexion admin) renvoie null → l'utilisateur repasse par /admin/login.
 */
export const getAdminUser = cache(async (): Promise<AdminUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminBackofficeClient();
  const { data } = await admin
    .from("admin_users")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  const record = (data as AdminUser | null) ?? null;
  if (!record) return null;

  // Barrière 3 : session admin expirée => forcer la ré-authentification.
  if (minutesSince(record.last_login_at) > SESSION_MAX_MIN) return null;

  return record;
});

/** Erreur levée par une action serveur admin refusée (RBAC / sudo). */
export class AdminForbiddenError extends Error {
  constructor(message = "Action non autorisée.") {
    super(message);
    this.name = "AdminForbiddenError";
  }
}

/**
 * Garde de PAGE : exige un admin actif (et, si fourni, la permission).
 * Redirige vers /admin/login (non admin / session expirée) ou
 * /admin/unauthorized (admin sans la permission).
 */
export async function requireAdmin(permission?: Permission): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  if (permission && !can(admin.role, permission)) redirect("/admin/unauthorized");
  return admin;
}

/**
 * Garde d'ACTION serveur : exige un admin actif + la permission, sinon
 * lève AdminForbiddenError. `requireFresh` impose en plus une connexion
 * récente (fenêtre sudo) pour les actions sensibles. À appeler AVANT
 * toute mutation, indépendamment de l'UI.
 */
export async function authorizeAction(
  permission: Permission,
  opts: { requireFresh?: boolean } = {},
): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) throw new AdminForbiddenError("Session admin requise.");
  if (!can(admin.role, permission)) {
    throw new AdminForbiddenError("Permission insuffisante pour cette action.");
  }
  if (opts.requireFresh && minutesSince(admin.last_login_at) > SUDO_MIN) {
    throw new AdminForbiddenError(
      "Ré-authentification requise : reconnectez-vous pour cette action sensible.",
    );
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
