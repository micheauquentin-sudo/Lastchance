import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { reportError } from "@/lib/monitoring";

export type WorkerName = "jobs" | "sync-contests";
export type WorkerRunStatus = "succeeded" | "degraded" | "failed";

type AdminClient = ReturnType<typeof createAdminClient>;

function safeCounters(counters: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counters).map(([key, value]) => [
      key.slice(0, 60),
      Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0,
    ]),
  );
}

/** Ouvre un heartbeat réel, après authentification de la route worker. */
export async function startWorkerRun(
  admin: AdminClient,
  worker: WorkerName,
): Promise<{ id: string; startedAt: number }> {
  const startedAt = Date.now();
  const { data, error } = await admin
    .from("ops_worker_runs")
    .insert({ worker, status: "running" })
    .select("id")
    .single();
  if (error || !data?.id) {
    const cause = error?.message ?? "heartbeat sans identifiant";
    reportError(`cron.${worker}.heartbeat.start`, cause);
    throw new Error("Journal de santé du worker indisponible.");
  }
  return { id: String(data.id), startedAt };
}

/** Clôt le heartbeat sans stocker de message brut, d'URL, de secret ou de PII. */
export async function finishWorkerRun(
  admin: AdminClient,
  run: { id: string; startedAt: number },
  status: WorkerRunStatus,
  counters: Record<string, number>,
  errorCode?: string,
): Promise<void> {
  const { data, error } = await admin
    .from("ops_worker_runs")
    .update({
      status,
      completed_at: new Date().toISOString(),
      duration_ms: Math.max(0, Date.now() - run.startedAt),
      counters: safeCounters(counters),
      error_code: errorCode?.slice(0, 120) ?? null,
    })
    .eq("id", run.id)
    .eq("status", "running")
    .select("id")
    .maybeSingle();
  if (error || !data?.id) {
    reportError(
      `cron.heartbeat.${status}`,
      error?.message ?? "heartbeat déjà clos ou introuvable",
    );
    throw new Error("Clôture du journal de santé impossible.");
  }
}
