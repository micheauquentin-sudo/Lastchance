import { authorizeCronRequest } from "@/lib/timing-safe";
import { NextResponse } from "next/server";
import {
  processAutomationRunJob,
  processBudgetPausedJob,
  processLowStockJob,
  processScheduleBlockedJob,
} from "@/lib/automations";
import { optionalEnv } from "@/lib/env";
import { settleJob, type JobOutcome, type JobRow } from "@/lib/jobs";
import { monitored, reportError } from "@/lib/monitoring";
import { processNewsletterJob } from "@/lib/newsletter-worker";
import { reengageOrganization } from "@/lib/reengagement";
import { countStaleSmsDeliveries, processSmsSendJob } from "@/lib/sms-dispatch";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainWebhookDeliveries } from "@/lib/webhook-worker";
import {
  finishWorkerRunSafely,
  startWorkerRunSafely,
  type WorkerRunStatus,
} from "@/lib/worker-health";

/**
 * Worker de la file de travaux : GET /api/cron/jobs (CRON_SECRET).
 *
 * ── LA CADENCE RÉELLE : TOUTES LES 5 MINUTES ────────────────
 *
 * Cet en-tête a annoncé « une fois par jour », et ce n'est plus vrai. La
 * planification pg_cron `lastchance-jobs-worker` (migration 20260722100000)
 * exigeait deux secrets Vault, `jobs_worker_url` et `sync_contests_secret` :
 * ils sont posés depuis le chantier « cadence-file » (2026-08-01, ADR-062, une
 * action serveur les dépose sans qu'un humain recopie `CRON_SECRET`). Cette
 * route est donc appelée TOUTES LES 5 MINUTES en production ; le cron Vercel
 * `20 4 * * *` (vercel.json) n'est plus qu'un filet.
 *
 * CONSÉQUENCE, et c'est ce qui rend le budget temps ci-dessous nécessaire : le
 * reliquat d'un passage n'attend plus 24 h mais 5 minutes. Différer proprement
 * coûte donc peu, et vaut toujours mieux que se faire couper par la fonction au
 * milieu d'un travail.
 *
 * À chaque passage :
 *   1. reprise des jobs zombies (verrou expiré) ;
 *   2. réclamation et traitement des jobs dus (newsletter, relances…),
 *      erreurs isolées, backoff par job, échec définitif après
 *      max_attempts ;
 *   3. drain de la file des webhooks sortants (retys en minutes réels,
 *      dead-letter après épuisement).
 * Budget temps : sous la limite Vercel, le reste attend le passage suivant.
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
  if (!authorizeCronRequest(request, secret)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  return monitored("cron.jobs", () => runWorker(request));
}

async function runWorker(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const admin = createAdminClient();
  const probeOnly = new URL(request.url).searchParams.get("probe") === "1";
  // OUVERTURE BEST-EFFORT, comme expire-trials, reengage et webhooks. Ce worker
  // était le seul des quatre à refuser de travailler sans journal de santé, et
  // rien nulle part ne justifiait l'asymétrie : le journal OBSERVE le travail,
  // il ne le gouverne pas. La crainte qu'il couvrait — deux passages concurrents
  // — est déjà écartée en amont, `claim_jobs` posant un verrou par job
  // (`locked_until`, `for update skip locked`) et l'idempotence bornant les
  // effets. Refuser ici, c'est laisser une panne du journal arrêter la file
  // entière : newsletters, relances, SMS.
  const run = await startWorkerRunSafely(admin, "jobs");

  const totals = {
    revived: 0,
    processed: 0,
    completed: 0,
    partial: 0,
    failed: 0,
    retried: 0,
    /** Reportés à une date précise SANS consommer de tentative (fenêtre SMS). */
    deferred: 0,
    /** Lignes SMS figées en `sending` : crédit débité, envoi non prouvé. */
    smsStale: 0,
  };
  let webhooks = {
    claimed: 0,
    delivered: 0,
    deadLettered: 0,
    deferred: 0,
    settleFailed: 0,
  };

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
    // temps le permet — le passage suivant, cinq minutes plus tard, reprend
    // le reste (voir l'en-tête).
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
              "automation.schedule-blocked",
              "sms.send",
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
          // Un report daté n'est ni un succès ni un échec : compté à part,
          // sinon il gonflerait `retried` (un incident) ou `failed` (une
          // perte), et le worker se déclarerait dégradé une nuit ordinaire.
          else if (outcome.status === "deferred") totals.deferred += 1;
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
    // Le drain PARTAGE l'horloge du passage : sans elle, il repartait avec un
    // budget neuf alors que la file de jobs venait d'en consommer l'essentiel,
    // et c'est la fonction Vercel qui tranchait — au milieu d'une livraison.
    if (!probeOnly && Date.now() - startedAt < TIME_BUDGET_MS) {
      webhooks = await drainWebhookDeliveries(admin, {
        budgetMs: TIME_BUDGET_MS,
        startedAt,
      });
    }

    // Lecture d'OBSERVATION seule, après le travail : une ligne SMS restée en
    // `sending` porte des crédits débités sans envoi prouvé, et rien ne la
    // regardait — l'index existait sans lecteur. On ne rembourse pas (voir
    // `countStaleSmsDeliveries`), on rend la situation visible. Une probe ne
    // touche à rien, même en lecture comptée.
    if (!probeOnly) {
      totals.smsStale = await countStaleSmsDeliveries(admin);
    }

    const runStatus: WorkerRunStatus =
      totals.failed > 0 || totals.partial > 0 ? "degraded" : "succeeded";
    // Clôture best-effort, corollaire de l'ouverture : les jobs sont traités et
    // leurs effets sont partis ; un journal muet ne doit pas rendre un 500 qui
    // ferait rejouer le passage.
    await finishWorkerRunSafely(admin, run, runStatus, {
      ...totals,
      webhooksClaimed: webhooks.claimed,
      webhooksDelivered: webhooks.delivered,
      webhooksDeadLettered: webhooks.deadLettered,
      // Reliquat relâché faute de budget, et clôtures refusées par la base :
      // deux silences du drain, désormais lisibles au heartbeat.
      webhooksDeferred: webhooks.deferred,
      webhooksSettleFailed: webhooks.settleFailed,
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
    await finishWorkerRunSafely(admin, run, "failed", totals, "worker_execution_failed");
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
    // Ouverture programmée refusée faute de droit (run_campaign_schedule).
    case "automation.schedule-blocked":
      return processScheduleBlockedJob(admin, job);
    // SMS (src/lib/sms-dispatch.ts) : réservation + débit atomiques côté
    // base, envoi, puis clôture en `sent` / `failed` / `undeliverable`.
    case "sms.send":
      return processSmsSendJob(admin, job);
    default:
      return { status: "failed", error: `type inconnu: ${job.type}` };
  }
}
