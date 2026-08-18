import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { reportError } from "@/lib/monitoring";

/**
 * Miroir applicatif du registre `public.ops_worker_definitions`
 * (migration 20260805240000) : `ops_worker_runs.worker` y est désormais
 * une CLÉ ÉTRANGÈRE — un nom absent du registre est refusé par la base,
 * là où le CHECK figé refusait au contraire tout ajout. Cette liste ne
 * décide PAS de la supervision (c'est la colonne `enabled` du registre) :
 * elle dit seulement quelles routes savent écrire un heartbeat.
 */
export const WORKER_NAMES = [
  "jobs",
  "sync-contests",
  "reengage",
  "purge-data",
  "webhooks",
  "automations",
  "calendar-reminders",
  "jackpot-draws",
  "expire-trials",
  "weekly-digest",
] as const;

export type WorkerName = (typeof WORKER_NAMES)[number];

/**
 * Les deux workers à cadence courte, seuls exigés par le healthcheck de
 * production : les autres sont quotidiens — hebdomadaire pour
 * `weekly-digest` — et leur silence dégrade la supervision sans rendre la
 * plateforme indisponible.
 */
export const FREQUENT_WORKERS: readonly WorkerName[] = ["jobs", "sync-contests"];

/**
 * Route HTTP d'un worker — SOURCE UNIQUE de la correspondance nom → chemin.
 *
 * La convention `/api/cron/<nom>` existait déjà, mais recopiée à la main dans
 * `cron-coverage.test.ts` (trois fois) et nulle part ailleurs. Elle devient
 * réutilisable ici parce qu'un second appelant en a besoin : l'activation de la
 * cadence rapide écrit dans le Vault l'URL que Postgres appellera, et deviner
 * ce chemin y coûterait un pg_cron qui frappe un 404 toutes les 5 minutes sans
 * que rien ne le dise.
 */
export function cronRoutePath(worker: WorkerName): string {
  return `/api/cron/${worker}`;
}

export type WorkerRunStatus = "succeeded" | "degraded" | "failed";

/**
 * Poignée d'un heartbeat ouvert. `null` signifie « observabilité
 * indisponible » — pour les six crons quotidiens, ce n'est pas une panne
 * du worker : leur travail métier continue sans journal.
 */
export type WorkerRun = { id: string; startedAt: number };

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
): Promise<WorkerRun> {
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

/**
 * Ouvre un heartbeat SANS pouvoir faire échouer l'appelant. C'est le cas
 * NOMINAL, et non l'exception : neuf des dix workers passent par ici
 * (reengage, purge-data, webhooks, automations, calendar-reminders,
 * jackpot-draws, expire-trials, weekly-digest, et `jobs` depuis JOB-7). Leur
 * travail métier ne dépend en rien du journal de santé — une table absente,
 * un nom hors registre ou une base momentanément indisponible ne doivent pas
 * suspendre une purge RGPD, un tirage, ni la file entière (newsletters,
 * relances, SMS). Le journal OBSERVE le travail, il ne le gouverne pas ; la
 * concurrence est écartée en amont, par les verrous et l'idempotence de
 * `claim_jobs`. L'échec reste visible : `startWorkerRun` l'a déjà remonté à
 * Sentry, sans message brut ni PII. Retourne `null` = « pas de journal ».
 *
 * Seul `sync-contests` appelle encore `startWorkerRun` strict, et rend un 500
 * si le journal manque. Aucune raison n'est écrite sur place ; tant qu'elle ne
 * l'est pas, le doute vaut d'être signalé plutôt que recopié en exemple.
 */
export async function startWorkerRunSafely(
  admin: AdminClient,
  worker: WorkerName,
): Promise<WorkerRun | null> {
  try {
    return await startWorkerRun(admin, worker);
  } catch {
    // Déjà remontée par startWorkerRun.
    return null;
  }
}

/** Clôt le heartbeat sans stocker de message brut, d'URL, de secret ou de PII. */
export async function finishWorkerRun(
  admin: AdminClient,
  run: WorkerRun,
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

/**
 * Clôture best-effort d'un heartbeat : une panne du journal ne doit ni
 * remplacer la panne d'origine dans la réponse du worker, ni transformer
 * un travail métier réussi en échec. L'échec reste visible — `finishWorkerRun`
 * l'a remonté à Sentry avant de lever — et l'exécution laissée `running`
 * sera refermée par `purge_ops_worker_runs`.
 *
 * `run` vaut `null` quand l'ouverture elle-même a échoué
 * (`startWorkerRunSafely`) : il n'y a alors rien à clore, et rien à
 * signaler de plus — l'absence a déjà été remontée à l'ouverture.
 */
export async function finishWorkerRunSafely(
  admin: AdminClient,
  run: WorkerRun | null,
  status: WorkerRunStatus,
  counters: Record<string, number>,
  errorCode?: string,
): Promise<void> {
  if (!run) return;
  try {
    await finishWorkerRun(admin, run, status, counters, errorCode);
  } catch {
    // Déjà remontée par finishWorkerRun.
  }
}
