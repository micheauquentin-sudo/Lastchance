import "server-only";

import { createAdminBackofficeClient } from "@/lib/admin/db";
import { actorIp } from "@/lib/admin/auth";
import type { AdminUser } from "@/types/admin";

interface LogInput {
  actor: Pick<AdminUser, "id" | "email" | "role">;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Journalise une action sensible du back-office dans admin_audit_logs.
 *
 * Best-effort : un échec d'écriture du journal ne doit pas casser
 * l'action métier (elle est déjà validée + autorisée), mais il est
 * remonté en console pour le monitoring. L'IP est capturée quand
 * disponible.
 */
export async function logAdminAction(input: LogInput): Promise<void> {
  try {
    const admin = createAdminBackofficeClient();
    const ip = await actorIp();
    const { error } = await admin.from("admin_audit_logs").insert({
      admin_user_id: input.actor.id,
      actor_email: input.actor.email,
      actor_role: input.actor.role,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      metadata: input.metadata ?? {},
      ip,
    });
    if (error) console.error("[admin-audit] insert:", error.message);
  } catch (err) {
    console.error("[admin-audit]:", err);
  }
}
