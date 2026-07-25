import { NextResponse } from "next/server";
import {
  processAutomationRunJob,
  processBudgetPausedJob,
  processLowStockJob,
} from "@/lib/automations";
import { optionalEnv } from "@/lib/env";
import { settleJob, type JobOutcome, type JobRow } from "@/lib/jobs";
import { monitored, reportError } from "@/lib/monitoring";
import { processNewsletterJob } from "@/lib/newsletter-worker";
import { reengageOrganization } from "@/lib/reengagement";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainWebhookDeliveries } from "@/lib/webhook-worker";
import {
  finishWorkerRun,
  startWorkerRun,
  type WorkerRunStatus,
} from "@/lib/worker-health";

/**
 * Worker de la file de travaux : GET /api/cron/jobs (CRON_SECRET).
 *
 * Appelé toutes les 5 minutes par pg_cron côté Supabase (migration
 * 20260722100000, secret Vault partagé avec le worker de synchro) ;
 * un cron Vercel quotidien reste en filet. À chaque tick :
 *   1. reprise des jobs zombies (verrou expiré) ;
 *   2. réclamation et traitement des jobs dus (newsletter, relances…),
 *      erreurs isolées, backoff par job, échec définitif après
 *      max_attempts ;
 *   3. drain de la file des webhooks sortants (retys en minutes réels,
 *      dead-letter après épuisement).
 * Budget temps : sous la limite Vercel, le reste attend 5 minutes.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIME_BUDGET_MS = 45_000;
const CLAIM_BATCH = 10;

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET manquant" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  return monitored("cron.jobs", () => runWorker(request));
}

async function runWorker(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const admin = createAdminClient();
  const probeOnly = new URL(request.url).searchParams.get("probe") === "1";
  let run: Awaited<ReturnType<typeof startWorkerRun>>;
  try {
    run = await startWorkerRun(admin, "jobs");
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Heartbeat indisponible" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }

  const totals = {
    revived: 0,
    processed: 0,
    completed: 0,
    partial: 0,
    failed: 0,
    retried: 0,
  };
  let webhooks = { claimed: 0, delivered: 0, deadLettered: 0 };

  try {
    // Une probe doit être strictement inerte hors de son propre job : elle ne
    // reprend ni job métier zombie, ni webhook.
    if (!probeOnly) {
      const { data: revived, error: reviveError } =
        await admin.rpc("requeue_stale_jobs");
      if (reviveError) {
        throw new Error(`requeue_stale_jobs: ${reviveError.message}`);
      }
      totals.revived = Number(revived ?? 0);
    }

    // Traite par petits lots tant que du travail est dû et que le budget
    // temps le permet — le tick suivant (5 min) reprend le reste.
    while (Date.now() - startedAt < TIME_BUDGET_MS) {
      const { data, error } = await admin.rpc("claim_jobs", {
        p_types: probeOnly
          ? ["ops.probe"]
          : [
              "ops.probe",
              "newsletter.send",
              "reengage.org",
              "automation.budget-paused",
              "automation.low-stock",
              "automation.run-scenarios",
            ],
        p_limit: probeOnly ? 1 : CLAIM_BATCH,
        p_lock_seconds: 120,
      });
      if (error) {
        throw new Error(`claim_jobs: ${error.message}`);
      }
      const jobs = (data ?? []) as JobRow[];
      if (jobs.length === 0) break;

      for (const job of jobs) {
        totals.processed += 1;
        try {
          const outcome = await dispatch(admin, job);
          await settleJob(admin, job, outcome);
          if (outcome.status === "completed") totals.completed += 1;
          else if (outcome.status === "partial") totals.partial += 1;
          else if (outcome.status === "retry" && job.attempts < job.max_attempts) {
            totals.retried += 1;
          } else totals.failed += 1;
        } catch (err) {
          // Erreur inattendue du handler : retry avec backoff, puis échec.
          reportError(`cron.jobs.${job.type}`, err);
          await settleJob(admin, job, {
            status: "retry",
            error: err instanceof Error ? err.message : String(err),
          });
          if (job.attempts < job.max_attempts) totals.retried += 1;
          else totals.failed += 1;
        }
        if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      }
    }

    // Le probe ne réclame et ne modifie aucun job métier ni webhook.
    if (!probeOnly && Date.now() - startedAt < TIME_BUDGET_MS) {
      webhooks = await drainWebhookDeliveries(admin);
    }

    const runStatus: WorkerRunStatus =
      totals.failed > 0 || totals.partial > 0 ? "degraded" : "succeeded";
    await finishWorkerRun(admin, run, runStatus, {
      ...totals,
      webhooksClaimed: webhooks.claimed,
      webhooksDelivered: webhooks.delivered,
      webhooksDeadLettered: webhooks.deadLettered,
    });

    return NextResponse.json(
      {
        ok: runStatus === "succeeded",
        probe: probeOnly,
        ...totals,
        webhooks,
        durationMs: Date.now() - startedAt,
      },
      {
        status: runStatus === "succeeded" ? 200 : 207,
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (error) {
    reportError("cron.jobs", error);
    try {
      await finishWorkerRun(admin, run, "failed", totals, "worker_execution_failed");
    } catch {
      // L'erreur de heartbeat est déjà remontée par finishWorkerRun.
    }
    return NextResponse.json(
      { ok: false, error: "Exécution du worker impossible" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

/** Aiguillage par type — étendre ici ET dans JobType (src/lib/jobs.ts). */
async function dispatch(
  admin: ReturnType<typeof createAdminClient>,
  job: JobRow,
): Promise<JobOutcome> {
  switch (job.type) {
    case "ops.probe":
      return { status: "completed" };
    case "newsletter.send":
      return processNewsletterJob(admin, job);
    case "reengage.org": {
      const organizationId = String(job.payload.organizationId ?? "");
      if (!organizationId) {
        return { status: "failed", error: "payload sans organizationId" };
      }
      await reengageOrganization(admin, organizationId);
      return { status: "completed" };
    }
    // Automatisations commerçant (src/lib/automations.ts).
    case "automation.budget-paused":
      return processBudgetPausedJob(admin, job);
    case "automation.low-stock":
      return processLowStockJob(admin, job);
    case "automation.run-scenarios":
      return processAutomationRunJob(admin, job);
    default:
      return { status: "failed", error: `type inconnu: ${job.type}` };
  }
}
