import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface AuditEntry {
  /** Organisation concernée (null pour un événement hors org). */
  organizationId: string | null;
  /** Auteur : id utilisateur, 'stripe', 'public', 'system'. */
  actor: string;
  /** Verbe court de l'action (ex : 'participation.redeem'). */
  action: string;
  /** Contexte structuré (pas de PII brute). */
  metadata?: Record<string, unknown>;
}

/**
 * Journalise une action sensible. Best-effort : un échec d'écriture du
 * journal ne doit jamais faire échouer l'opération métier — il est
 * simplement logué.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      organization_id: entry.organizationId,
      actor: entry.actor,
      action: entry.action,
      metadata: entry.metadata ?? {},
    });
    if (error) console.error("[audit] insert:", error.message);
  } catch (err) {
    console.error("[audit]:", err);
  }
}
