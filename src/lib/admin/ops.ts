import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { EXPECTED_MIGRATION, releaseSha } from "@/lib/release";
import { FREQUENT_WORKERS } from "@/lib/worker-health";

/**
 * Instantané opérationnel du back-office (audit #8) : release et
 * migrations, crons, files (jobs + webhooks), synchro sportive,
 * emails, latences réelles — et l'évaluation des objectifs simples :
 *   participation/réclamation : erreur < 1 % ;
 *   webhook : retard < 5 minutes ;
 *   résultat sportif : retard < 15 minutes ;
 *   aucun job bloqué plus de 30 minutes ;
 *   aucun échec du moteur de méta-progression sur 24 heures.
 */

export interface OpMetricSummary {
  op: string;
  calls: number;
  errorRate: number;
  p50Ms: number;
  p95Ms: number;
}

export interface CronStatus {
  jobname: string;
  schedule: string;
  lastRun: string | null;
  lastSuccess: string | null;
  lastStatus: string | null;
  /** Dernier succès plus récent que ~3 périodes de planification. */
  healthy: boolean;
}

export interface WorkerStatus {
  /**
   * Nom tel qu'il est enregistré dans `ops_worker_definitions`. Volontairement
   * `string` et non une union figée : le registre est une DONNÉE, superviser un
   * worker de plus est un UPDATE — pas un déploiement de ce fichier.
   */
  worker: string;
  configured: boolean;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastStatus: string | null;
  lastSuccessAt: string | null;
  oldestDueJobAgeMin: number | null;
  healthy: boolean;
  reason: string;
}

/**
 * Santé du MOTEUR de méta-progression (`progression_engine_failures`).
 *
 * Le moteur est un trigger sur `experience_events` qui attrape ses erreurs
 * MISSION PAR MISSION pour ne jamais casser l'événement analytique porteur. Sans
 * lecteur, une mission qui ne progresse JAMAIS — pour TOUS les joueurs d'une
 * enseigne — est parfaitement silencieuse : le journal se remplit, personne ne le
 * regarde, et le commerçant constate seulement que « les missions ne bougent
 * pas ». D'où cette sonde.
 *
 * `missionsAffected` est le signal qui compte plus que le volume : un échec
 * concentré sur une seule mission est une configuration cassée, un échec réparti
 * est une panne de plateforme.
 */
export interface ProgressionEngineHealth {
  /** Échecs enregistrés sur 24 h. `null` = journal illisible (jamais « 0 »). */
  failures24h: number | null;
  /** Missions distinctes touchées dans l'échantillon lu. */
  missionsAffected: number;
  /** SQLSTATE dominant de l'échantillon — l'entrée du diagnostic. */
  topSqlstate: string | null;
}

export interface Slo {
  key: string;
  label: string;
  /** true = objectif tenu, false = violé, null = pas de donnée. */
  ok: boolean | null;
  detail: string;
}

export interface OpsSnapshot {
  releaseSha: string;
  migrationExpected: string;
  migrationApplied: string | null;
  migrationCount: number | null;
  crons: CronStatus[];
  workers: WorkerStatus[];
  jobsQueued: number;
  jobsFailed: number;
  oldestJobAgeMin: number | null;
  webhookBacklog: number;
  webhookDeadLetters: number;
  oldestWebhookAgeMin: number | null;
  lastContestSync: string | null;
  laggingResults: number;
  fixtureCacheOldestMin: number | null;
  fixtureCacheErrors: number;
  lastStripeEvent: string | null;
  progressionEngine: ProgressionEngineHealth;
  emails7d: { targeted: number; sent: number };
  metrics: OpMetricSummary[];
  slos: Slo[];
}

const minutesSince = (iso: string | null): number | null =>
  iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60_000) : null;

/**
 * Objectif « workers », isolé du reste du snapshot pour être prouvable sans
 * monter les seize requêtes de `getOpsSnapshot`.
 *
 * `ops_workers_health()` ne renvoie QUE les workers supervisés
 * (`ops_worker_definitions.enabled`) : leur NOMBRE est une donnée, plus une
 * constante. La règle précédente — « exactement 2 lignes, toutes saines » —
 * serait devenue fausse au premier worker branché en plus : l'objectif aurait
 * viré au rouge à cause du succès du branchement. Ce qui reste vérifié, à
 * l'identique tant que le registre n'en supervise que deux : les deux workers
 * fréquents sont bien supervisés, et tout worker supervisé est sain. Un worker
 * fréquent ABSENT (jamais enregistré, ou repassé `enabled = false`) est un
 * angle mort, pas un silence anodin — sans ce contrôle, désactiver la
 * supervision de `jobs` rendrait l'objectif vert.
 */
export function evaluateWorkersSlo(workers: WorkerStatus[]): Slo {
  const supervised = new Set(workers.map((worker) => worker.worker));
  const missingFrequent = FREQUENT_WORKERS.filter(
    (worker) => !supervised.has(worker),
  );

  return {
    key: "workers",
    label: "Workers supervisés configurés et actifs",
    ok:
      workers.length === 0
        ? false
        : missingFrequent.length === 0 &&
          workers.every((worker) => worker.healthy),
    detail:
      workers.length === 0
        ? "santé réelle indisponible"
        : [
            ...(missingFrequent.length > 0
              ? [`non supervisé(s) : ${missingFrequent.join(", ")}`]
              : []),
            ...workers.map(
              (worker) =>
                `${worker.worker}: ${worker.healthy ? "OK" : worker.reason}`,
            ),
          ].join(" · "),
  };
}

/** Préfixe des compteurs de repli, un par famille d'encaissement. */
const REGISTRY_MISS_PREFIX = "rewards.registry_miss.";

/**
 * Complétude du registre universel des récompenses.
 *
 * Chaque ligne `rewards.registry_miss.<famille>` est un encaissement que le
 * moteur unique n'a PAS vu et que la RPC historique a sauvé. Ce repli est muet
 * par construction — le caissier ne voit rien — donc sans ce compteur, rien ne
 * dit s'il sert encore, et le retirer se ferait à l'aveugle : au premier code
 * resté hors registre, un caissier lirait « code introuvable » en tenant un lot
 * valide, devant un client qui attend.
 *
 * Zéro sur 24 h, famille par famille, est la condition de la bascule. Les
 * familles concernées sont NOMMÉES : la bascule se fait module par module, un
 * total agrégé ne dirait pas lequel est prêt.
 *
 * `registry_error` (RPC injoignable) est compté à part : il relève de la
 * disponibilité du registre, pas de sa complétude. Les deux empêchent la
 * bascule, pour des raisons différentes.
 */
export function evaluateRewardsRegistrySlo(metrics: OpMetricSummary[]): Slo {
  const misses = metrics.filter((m) => m.op.startsWith(REGISTRY_MISS_PREFIX));
  const missCalls = misses.reduce((sum, m) => sum + m.calls, 0);
  const errors =
    metrics.find((m) => m.op === "rewards.registry_error")?.calls ?? 0;
  const families = misses
    .map((m) => m.op.slice(REGISTRY_MISS_PREFIX.length))
    .join(", ");

  return {
    key: "rewards-registry",
    label: "Registre des récompenses : aucun encaissement hors registre",
    ok: missCalls === 0 && errors === 0,
    detail:
      missCalls === 0 && errors === 0
        ? "tous les codes présentés sont passés par le moteur unique (24 h)"
        : [
            ...(missCalls > 0
              ? [
                  `${missCalls} encaissement(s) sauvé(s) par le repli historique : ${families}`,
                ]
              : []),
            ...(errors > 0 ? [`${errors} appel(s) au registre en échec`] : []),
          ].join(" · "),
  };
}

export async function getOpsSnapshot(): Promise<OpsSnapshot> {
  const admin = createAdminClient();
  const now = Date.now();

  const [
    migrations,
    crons,
    workersRaw,
    metricsRaw,
    jobsQueuedRes,
    jobsFailedRes,
    oldestJobRes,
    webhookBacklogRes,
    webhookDlqRes,
    oldestWebhookRes,
    lastSyncRes,
    laggingRes,
    cacheRes,
    lastStripeRes,
    progressionFailuresRes,
    campaigns7dRes,
  ] = await Promise.all([
    admin.rpc("applied_migrations_info").maybeSingle(),
    admin.rpc("cron_last_success"),
    admin.rpc("ops_workers_health"),
    admin.rpc("ops_metrics_summary", { p_hours: 24 }),
    admin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued"),
    admin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
    admin
      .from("jobs")
      .select("run_after, created_at, status")
      .or(
        `and(status.eq.queued,run_after.lte.${new Date(now).toISOString()}),status.eq.running`,
      )
      .order("run_after", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("webhook_deliveries")
      .select("id", { count: "exact", head: true })
      .is("delivered_at", null)
      .is("failed_at", null),
    admin
      .from("webhook_deliveries")
      .select("id", { count: "exact", head: true })
      .not("failed_at", "is", null)
      .is("delivered_at", null),
    admin
      .from("webhook_deliveries")
      .select("created_at")
      .is("delivered_at", null)
      .is("failed_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("contests")
      .select("last_synced_at")
      .not("last_synced_at", "is", null)
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Résultat sportif en retard : match auto parti depuis > 100 min
    // (durée d'un match) + 15 min d'objectif, toujours « scheduled ».
    admin
      .from("contest_matches")
      .select("id, contests!contest_matches_contest_id_fkey!inner(status)", {
        count: "exact",
        head: true,
      })
      .eq("status", "scheduled")
      .eq("contests.status", "active")
      .lt("kickoff_at", new Date(now - 115 * 60_000).toISOString()),
    admin.from("fixture_cache").select("fetched_at, provider_status"),
    admin
      .from("stripe_events")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Journal du moteur de méta-progression. Le `count` est exact ; les lignes
    // ramenées sont BORNÉES à 200 et ne servent qu'à ventiler (missions touchées,
    // SQLSTATE dominant) — une panne franche produirait un journal qu'on ne veut
    // pas charger en entier dans une page d'administration.
    admin
      .from("progression_engine_failures")
      .select("mission_id, sqlstate", { count: "exact" })
      .gt("failed_at", new Date(now - 86_400_000).toISOString())
      .order("failed_at", { ascending: false })
      .limit(200),
    admin
      .from("newsletter_campaigns")
      .select("recipient_count, sent_count, status")
      .gt("created_at", new Date(now - 7 * 86_400_000).toISOString()),
  ]);

  const metrics: OpMetricSummary[] = (
    (metricsRaw.data ?? []) as Array<{
      op: string;
      calls: number;
      error_rate: number;
      p50_ms: number;
      p95_ms: number;
    }>
  ).map((m) => ({
    op: m.op,
    calls: Number(m.calls),
    errorRate: Number(m.error_rate),
    p50Ms: Number(m.p50_ms),
    p95Ms: Number(m.p95_ms),
  }));

  const cronRows: CronStatus[] = (
    (crons.data ?? []) as Array<{
      jobname: string;
      schedule: string;
      last_run: string | null;
      last_success: string | null;
      last_status: string | null;
    }>
  ).map((c) => {
    const periodMin = c.schedule.startsWith("*/5")
      ? 5
      : c.schedule.startsWith("*/10")
        ? 10
        : 24 * 60;
    const ageMin = minutesSince(c.last_success);
    return {
      jobname: c.jobname,
      schedule: c.schedule,
      lastRun: c.last_run,
      lastSuccess: c.last_success,
      lastStatus: c.last_status,
      healthy: ageMin !== null && ageMin <= periodMin * 3,
    };
  });

  const workers: WorkerStatus[] = (
    (workersRaw.data ?? []) as Array<{
      worker: string;
      configured: boolean;
      last_started_at: string | null;
      last_completed_at: string | null;
      last_status: string | null;
      last_success_at: string | null;
      oldest_due_job_age_minutes: number | null;
      healthy: boolean;
      reason: string;
    }>
  ).map((row) => ({
    worker: row.worker,
    configured: row.configured,
    lastStartedAt: row.last_started_at,
    lastCompletedAt: row.last_completed_at,
    lastStatus: row.last_status,
    lastSuccessAt: row.last_success_at,
    oldestDueJobAgeMin: row.oldest_due_job_age_minutes,
    healthy: row.healthy,
    reason: row.reason,
  }));

  const oldestJob = oldestJobRes.data as
    | { run_after: string; created_at: string; status: string }
    | null;
  const oldestJobAgeMin = oldestJob
    ? minutesSince(
        oldestJob.status === "queued" && oldestJob.run_after > oldestJob.created_at
          ? oldestJob.run_after
          : oldestJob.created_at,
      )
    : null;

  const oldestWebhookAgeMin = minutesSince(
    (oldestWebhookRes.data as { created_at: string } | null)?.created_at ?? null,
  );

  const cacheRows = (cacheRes.data ?? []) as Array<{
    fetched_at: string;
    provider_status: string;
  }>;
  const fixtureCacheOldestMin =
    cacheRows.length > 0
      ? Math.max(...cacheRows.map((r) => minutesSince(r.fetched_at) ?? 0))
      : null;
  const fixtureCacheErrors = cacheRows.filter(
    (r) => r.provider_status === "error",
  ).length;

  const campaigns = (campaigns7dRes.data ?? []) as Array<{
    recipient_count: number;
    sent_count: number | null;
    status: string;
  }>;
  const emails7d = campaigns
    .filter((c) => c.status !== "queued" && c.status !== "sending")
    .reduce(
      (acc, c) => ({
        targeted: acc.targeted + c.recipient_count,
        sent: acc.sent + (c.sent_count ?? 0),
      }),
      { targeted: 0, sent: 0 },
    );

  // Un journal ILLISIBLE (migration 20260805220000 pas encore appliquée, droit
  // manquant) ne doit pas se lire « 0 échec » : ce serait un vert mensonger sur
  // exactement le cas qu'on cherche à voir. D'où `null` distinct de `0`.
  const progressionFailureRows = (progressionFailuresRes.data ?? []) as Array<{
    mission_id: string | null;
    sqlstate: string | null;
  }>;
  const progressionSqlstates = progressionFailureRows.reduce<
    Map<string, number>
  >((acc, row) => {
    const code = row.sqlstate ?? "inconnu";
    return acc.set(code, (acc.get(code) ?? 0) + 1);
  }, new Map());
  const progressionEngine: ProgressionEngineHealth = {
    failures24h: progressionFailuresRes.error
      ? null
      : (progressionFailuresRes.count ?? progressionFailureRows.length),
    missionsAffected: new Set(
      progressionFailureRows.flatMap((row) =>
        row.mission_id ? [row.mission_id] : [],
      ),
    ).size,
    topSqlstate:
      [...progressionSqlstates.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      null,
  };

  const migrationApplied =
    (migrations.data as { latest: string | null; total: number | null } | null)
      ?.latest ?? null;
  const migrationCount =
    (migrations.data as { latest: string | null; total: number | null } | null)
      ?.total ?? null;

  // ── Objectifs simples (audit #8) ─────────────────────────────
  const playOps = metrics.filter(
    (m) => m.op === "play.spinWheel" || m.op === "play.claimPrize",
  );
  const playCalls = playOps.reduce((s, m) => s + m.calls, 0);
  const playErrorRate =
    playCalls > 0
      ? playOps.reduce((s, m) => s + m.errorRate * m.calls, 0) / playCalls
      : null;

  const laggingResults = laggingRes.count ?? 0;

  const slos: Slo[] = [
    {
      key: "play-errors",
      label: "Participation / réclamation : erreur < 1 %",
      ok: playErrorRate === null ? null : playErrorRate < 0.01,
      detail:
        playErrorRate === null
          ? "aucune opération sur 24 h"
          : `${(playErrorRate * 100).toFixed(2)} % sur ${playCalls} appels (24 h)`,
    },
    {
      key: "webhook-delay",
      label: "Webhook sortant : retard < 5 min",
      ok: oldestWebhookAgeMin === null ? true : oldestWebhookAgeMin < 5,
      detail:
        oldestWebhookAgeMin === null
          ? "file vide"
          : `plus ancien en file : ${oldestWebhookAgeMin} min`,
    },
    {
      key: "sport-delay",
      label: "Résultat sportif : retard < 15 min",
      ok: laggingResults === 0,
      detail:
        laggingResults === 0
          ? "aucun résultat en attente au-delà du match"
          : `${laggingResults} match(s) sans résultat 15 min après la fin attendue`,
    },
    {
      key: "job-stuck",
      label: "Aucun job bloqué > 30 min",
      ok: oldestJobAgeMin === null ? true : oldestJobAgeMin < 30,
      detail:
        oldestJobAgeMin === null
          ? "file vide"
          : `plus ancien job actif : ${oldestJobAgeMin} min`,
    },
    {
      key: "progression-engine",
      label: "Moteur de méta-progression : aucun échec sur 24 h",
      ok:
        progressionEngine.failures24h === null
          ? null
          : progressionEngine.failures24h === 0,
      detail:
        progressionEngine.failures24h === null
          ? "journal du moteur illisible"
          : progressionEngine.failures24h === 0
            ? "aucun échec enregistré"
            : `${progressionEngine.failures24h} échec(s) · ${progressionEngine.missionsAffected} mission(s) touchée(s) · ${progressionEngine.topSqlstate ?? "sans code"}`,
    },
    evaluateRewardsRegistrySlo(metrics),
    evaluateWorkersSlo(workers),
  ];

  return {
    releaseSha: releaseSha(),
    migrationExpected: EXPECTED_MIGRATION,
    migrationApplied,
    migrationCount,
    crons: cronRows,
    workers,
    jobsQueued: jobsQueuedRes.count ?? 0,
    jobsFailed: jobsFailedRes.count ?? 0,
    oldestJobAgeMin,
    webhookBacklog: webhookBacklogRes.count ?? 0,
    webhookDeadLetters: webhookDlqRes.count ?? 0,
    oldestWebhookAgeMin,
    lastContestSync:
      (lastSyncRes.data as { last_synced_at: string } | null)?.last_synced_at ??
      null,
    laggingResults,
    fixtureCacheOldestMin,
    fixtureCacheErrors,
    lastStripeEvent:
      (lastStripeRes.data as { created_at: string } | null)?.created_at ?? null,
    progressionEngine,
    emails7d,
    metrics,
    slos,
  };
}
