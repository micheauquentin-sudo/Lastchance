import { authorizeCronRequest } from "@/lib/timing-safe";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { optionalEnv } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { drainWebhookDeliveries } from "@/lib/webhook-worker";
import { finishWorkerRunSafely, startWorkerRunSafely } from "@/lib/worker-health";

/**
 * Second passage quotidien sur la file des webhooks sortants — le drain
 * principal vit dans /api/cron/jobs. Même logique partagée
 * (src/lib/webhook-worker.ts) : retys en minutes, dead-letter après
 * épuisement, purge des accusés > 30 jours.
 *
 * ⚠️ CE BLOC A DIT SUCCESSIVEMENT LES DEUX CHOSES, et voici l'état vérifié.
 * Il annonçait un filet de sécurité, puis a été corrigé en « l'un des DEUX
 * seuls passages de la journée » au motif que la planification pg_cron à
 * 5 minutes (`lastchance-jobs-worker`) restait inactive faute de secrets Vault.
 * Ces secrets sont posés depuis le chantier « cadence-file » (2026-08-01,
 * ADR-062) : /api/cron/jobs draine bien la file toutes les 5 minutes en
 * production. « Filet de sécurité » redevient donc le mot juste — ce passage
 * quotidien (`5 9 * * *`) couvre la panne de pg_cron, pas le cas nominal.
 *
 * Le passage écrit son heartbeat (ops_worker_runs, worker `webhooks`) :
 * sans lui, un filet de sécurité muet est indistinguable d'un filet qui
 * ne tourne plus. Les accusés en dead-letter sont COMPTÉS, pas traités
 * comme une dégradation du worker : c'est l'endpoint distant qui échoue,
 * le drain, lui, a fait son travail.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Marge avant la limite de la fonction : le reliquat repart au passage suivant. */
const TIME_BUDGET_MS = 45_000;

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) return NextResponse.json({ error: "CRON_SECRET manquant" }, { status: 500 });
  if (!authorizeCronRequest(request, secret)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const admin = createAdminClient();
  // Ouverture BEST-EFFORT : le filet de sécurité doit drainer la file même
  // sans journal de santé — `null` = pas de journal, l'échec est déjà
  // remonté à Sentry par startWorkerRun, assaini.
  const run = await startWorkerRunSafely(admin, "webhooks");

  let summary;
  try {
    summary = await drainWebhookDeliveries(admin, { budgetMs: TIME_BUDGET_MS });
  } catch (error) {
    reportError("cron.webhooks", error);
    await finishWorkerRunSafely(
      admin,
      run,
      "failed",
      { claimed: 0, delivered: 0, deadLettered: 0, deferred: 0, settleFailed: 0 },
      "webhook_drain_failed",
    );
    return NextResponse.json(
      { ok: false, error: "Drain des webhooks impossible" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }

  // DÉGRADÉ sur une clôture refusée par la base (JOB-9). Publier
  // `settleFailed` sans jamais l'agir laisserait l'objectif « workers » du
  // back-office au vert pendant qu'on perd des états : une livraison partie
  // dont l'accusé n'a pas pu s'écrire sera RÉCLAMÉE À NOUVEAU au passage
  // suivant, donc renvoyée au commerçant. C'est exactement le genre d'anomalie
  // qu'un compteur muet fait passer inaperçue.
  //
  // `deferred` ne dégrade PAS, et la différence est délibérée : un reliquat
  // relâché faute de budget est le fonctionnement NOMINAL d'une file drainée
  // toutes les 5 minutes, pas une anomalie.
  const degraded = summary.settleFailed > 0;

  // Clôture best-effort : les accusés sont déjà partis, un journal muet ne
  // doit pas faire rejouer le drain.
  await finishWorkerRunSafely(
    admin,
    run,
    degraded ? "degraded" : "succeeded",
    {
      claimed: summary.claimed,
      delivered: summary.delivered,
      deadLettered: summary.deadLettered,
      deferred: summary.deferred,
      settleFailed: summary.settleFailed,
    },
    degraded ? "webhook_settle_failed" : undefined,
  );

  return NextResponse.json(
    { ok: true, ...summary },
    { headers: { "cache-control": "no-store" } },
  );
}
