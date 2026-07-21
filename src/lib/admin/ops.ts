import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { EXPECTED_MIGRATION, releaseSha } from "@/lib/release";

/**
 * Instantané opérationnel du back-office (audit #8) : release et
 * migrations, crons, files (jobs + webhooks), synchro sportive,
 * emails, latences réelles — et l'évaluation des objectifs simples :
 *   participation/réclamation : erreur < 1 % ;
 *   webhook : retard < 5 minutes ;
 *   résultat sportif : retard < 15 minutes ;
 *   aucun job bloqué plus de 30 minutes.
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
  emails7d: { targeted: number; sent: number };
  metrics: OpMetricSummary[];
  slos: Slo[];
}

const minutesSince = (iso: string | null): number | null =>
  iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60_000) : null;

export async function getOpsSnapshot(): Promise<OpsSnapshot> {
  const admin = createAdminClient();
  const now = Date.now();

  const [
    migrations,
    crons,
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
    campaigns7dRes,
  ] = await Promise.all([
    admin.rpc("applied_migrations_info").maybeSingle(),
    admin.rpc("cron_last_success"),
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
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: true })
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
  ];

  return {
    releaseSha: releaseSha(),
    migrationExpected: EXPECTED_MIGRATION,
    migrationApplied,
    migrationCount,
    crons: cronRows,
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
    emails7d,
    metrics,
    slos,
  };
}
