import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * File de travaux générique (table `jobs`) : les traitements longs
 * sortent des requêtes HTTP. Dépôt idempotent ici ; réclamation par le
 * worker (/api/cron/jobs) via la RPC claim_jobs (verrou + reprise).
 */

/** Types de jobs connus du worker — étendre ici ET dans le dispatch. */
export type JobType =
  | "newsletter.send"
  | "reengage.org"
  // Automatisations commerçant : les deux premiers sont déposés par la
  // BASE (claim_winning_spin / trigger prizes), le dernier par le cron
  // quotidien /api/cron/automations.
  | "automation.budget-paused"
  | "automation.low-stock"
  | "automation.run-scenarios";

export interface JobRow {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: "queued" | "running" | "completed" | "partial" | "failed";
  run_after: string;
  attempts: number;
  max_attempts: number;
  organization_id: string | null;
  idempotency_key: string | null;
  last_error: string | null;
  created_at: string;
  completed_at: string | null;
}

/** Backoff en minutes entre deux tentatives : 1, 5, 15, puis 60 (plafond). */
export function backoffMinutes(attempts: number): number {
  const steps = [1, 5, 15, 60];
  return steps[Math.min(Math.max(attempts - 1, 0), steps.length - 1)];
}

/**
 * Dépose un job. `idempotencyKey` fourni → un doublon est silencieusement
 * ignoré (contrainte unique) : un cron qui rejoue ne duplique rien.
 * Retourne false uniquement sur une vraie erreur d'insertion.
 */
export async function enqueueJob(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    type: JobType;
    payload: Record<string, unknown>;
    organizationId?: string;
    idempotencyKey?: string;
    runAfter?: Date;
    maxAttempts?: number;
  },
): Promise<boolean> {
  const { error } = await admin.from("jobs").insert({
    type: params.type,
    payload: params.payload,
    organization_id: params.organizationId ?? null,
    idempotency_key: params.idempotencyKey ?? null,
    run_after: (params.runAfter ?? new Date()).toISOString(),
    max_attempts: params.maxAttempts ?? 5,
  });
  if (error) {
    // 23505 : clé d'idempotence déjà déposée — c'est un succès.
    if (error.code === "23505") return true;
    console.error("[jobs] dépôt impossible:", error.message);
    return false;
  }
  return true;
}

/** Issue d'un traitement de job côté worker. */
export type JobOutcome =
  | { status: "completed" | "partial" | "failed"; error?: string }
  | { status: "retry"; error: string };

/**
 * Clôt (ou re-planifie) un job réclamé. `retry` re-file le job avec
 * backoff tant que max_attempts n'est pas épuisé — sinon `failed`.
 */
export async function settleJob(
  admin: ReturnType<typeof createAdminClient>,
  job: Pick<JobRow, "id" | "attempts" | "max_attempts">,
  outcome: JobOutcome,
): Promise<void> {
  const base = { locked_until: null, last_error: outcome.error?.slice(0, 500) ?? null };

  if (outcome.status === "retry" && job.attempts < job.max_attempts) {
    const delayMs = backoffMinutes(job.attempts) * 60_000;
    const { error } = await admin
      .from("jobs")
      .update({
        ...base,
        status: "queued",
        run_after: new Date(Date.now() + delayMs).toISOString(),
      })
      .eq("id", job.id);
    if (error) console.error("[jobs] replanification:", error.message);
    return;
  }

  const finalStatus = outcome.status === "retry" ? "failed" : outcome.status;
  const { error } = await admin
    .from("jobs")
    .update({
      ...base,
      status: finalStatus,
      completed_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  if (error) console.error("[jobs] clôture:", error.message);
}
