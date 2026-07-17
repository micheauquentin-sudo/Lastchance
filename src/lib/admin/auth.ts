import "server-only";

import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminBackofficeClient } from "@/lib/admin/db";
import { can, type Permission } from "@/lib/admin/rbac";
import type { AdminUser } from "@/types/admin";
import { clientIpFromHeaders } from "@/lib/request-ip";

/**
 * Durée de vie ABSOLUE d'une session admin (minutes) : passé ce délai
 * depuis la dernière connexion, l'accès au back-office est coupé et une
 * ré-authentification est exigée, même si la session Supabase reste
 * techniquement valide. Configurable via ADMIN_SESSION_MAX_MINUTES.
 */
function positiveMinutes(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 10_080
    ? parsed
    : fallback;
}

const SESSION_MAX_MIN = positiveMinutes(
  process.env.ADMIN_SESSION_MAX_MINUTES,
  480,
);

/**
 * Fenêtre « sudo » (minutes) : les actions les plus sensibles (gestion
 * d'équipe, suspension d'un commerçant) exigent une connexion récente.
 * Configurable via ADMIN_SUDO_MINUTES.
 */
const SUDO_MIN = positiveMinutes(process.env.ADMIN_SUDO_MINUTES, 15);
export const ADMIN_SESSION_COOKIE = "lc-admin-session";

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Identité admin du back-office.
 *
 * Trois barrières :
 *  1. une session Supabase valide (auth.users) ;
 *  2. un enregistrement `admin_users` ACTIF pour cet utilisateur ;
 *  3. un cookie admin aléatoire lié à une session serveur non expirée.
 *
 * La table admin_users est verrouillée par RLS (aucune policy) : on la
 * lit via une service role key dédiée, filtrée sur l'id de l'utilisateur
 * authentifié. Chaque connexion possède sa propre expiration et sa propre
 * fenêtre de réauthentification ; une autre connexion ne peut pas la rafraîchir.
 */
interface AdminContext {
  admin: AdminUser;
  sessionId: string;
  freshUntil: string;
}

const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token || token.length < 32) return null;

  const admin = createAdminBackofficeClient();
  const { data: session } = await admin
    .from("admin_sessions")
    .select("id, admin_user_id, user_id, fresh_until, expires_at, revoked_at")
    .eq("token_hash", tokenHash(token))
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!session) return null;

  const { data } = await admin
    .from("admin_users")
    .select("*")
    .eq("id", session.admin_user_id)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  const record = (data as AdminUser | null) ?? null;
  if (!record) return null;

  return {
    admin: record,
    sessionId: session.id,
    freshUntil: session.fresh_until,
  };
});

export const getAdminUser = cache(async (): Promise<AdminUser | null> =>
  (await getAdminContext())?.admin ?? null,
);

/** Crée une preuve de connexion indépendante de toutes les autres sessions. */
export async function startAdminSession(
  adminUser: AdminUser,
  authUserId: string,
): Promise<void> {
  const rawToken = randomBytes(32).toString("base64url");
  const now = Date.now();
  const db = createAdminBackofficeClient();
  const { error } = await db.from("admin_sessions").insert({
    admin_user_id: adminUser.id,
    user_id: authUserId,
    token_hash: tokenHash(rawToken),
    fresh_until: new Date(now + SUDO_MIN * 60_000).toISOString(),
    expires_at: new Date(now + SESSION_MAX_MIN * 60_000).toISOString(),
  });
  if (error) throw new Error(`Création session admin impossible: ${error.message}`);
  (await cookies()).set(ADMIN_SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: SESSION_MAX_MIN * 60,
    priority: "high",
  });
}

export async function revokeCurrentAdminSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (token) {
    await createAdminBackofficeClient()
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", tokenHash(token));
  }
  store.delete(ADMIN_SESSION_COOKIE);
}

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
  const context = await getAdminContext();
  const admin = context?.admin ?? null;
  if (!admin || !context) throw new AdminForbiddenError("Session admin requise.");
  if (!can(admin.role, permission)) {
    throw new AdminForbiddenError("Permission insuffisante pour cette action.");
  }
  if (opts.requireFresh && new Date(context.freshUntil).getTime() <= Date.now()) {
    throw new AdminForbiddenError(
      "Ré-authentification requise : reconnectez-vous pour cette action sensible.",
    );
  }
  return admin;
}

/** IP source (journalisation d'audit). */
export async function actorIp(): Promise<string | null> {
  const h = await headers();
  const ip = clientIpFromHeaders(h);
  return ip === "unknown" ? null : ip;
}
