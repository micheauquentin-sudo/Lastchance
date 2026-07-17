"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminBackofficeClient } from "@/lib/admin/db";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import {
  actorIp,
  revokeCurrentAdminSession,
  startAdminSession,
} from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import type { AdminUser } from "@/types/admin";
import type { ActionResult } from "@/lib/utils";

/**
 * Connexion au back-office. Deux barrières :
 *  1. identifiants Supabase valides ;
 *  2. compte admin_users ACTIF correspondant.
 * Si (1) sans (2), on déconnecte immédiatement : un commerçant ne doit
 * jamais obtenir de session admin. Toute tentative est journalisée.
 */
export async function adminLogin(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, error: "Identifiants requis." };
  }

  const ip = (await actorIp()) ?? "unknown";
  if (!(await rateLimit(
    rateLimitBucket("admin:login", ip),
    RATE_LIMITS.authLogin,
    { failClosed: true },
  ))) {
    return { ok: false, error: "Trop de tentatives. Réessayez plus tard." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { ok: false, error: "Identifiants invalides." };
  }

  // Barrière 2 : appartenance admin active (lecture service role).
  const db = createAdminBackofficeClient();
  const { data: admin } = await db
    .from("admin_users")
    .select("*")
    .eq("user_id", data.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!admin) {
    // Pas d'accès admin : on referme la session ouverte à l'instant.
    await supabase.auth.signOut();
    await db.from("admin_audit_logs").insert({
      actor_email: email,
      actor_role: "none",
      action: "admin.login.denied",
      metadata: { reason: "not_an_admin" },
      ip,
    });
    return { ok: false, error: "Accès réservé à l'équipe LastChance." };
  }

  const typed = admin as AdminUser;
  // Démarre l'horloge de session admin (sessions courtes + sudo).
  await db
    .from("admin_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", typed.id);
  await startAdminSession(typed, data.user.id);
  await logAdminAction({
    actor: { id: typed.id, email: typed.email, role: typed.role },
    action: "admin.login",
  });
  redirect("/admin");
}

/** Déconnexion du back-office. */
export async function adminLogout(): Promise<void> {
  await revokeCurrentAdminSession();
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
