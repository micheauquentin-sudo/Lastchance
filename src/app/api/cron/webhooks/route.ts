import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { optionalEnv } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { drainWebhookDeliveries } from "@/lib/webhook-worker";
import { finishWorkerRunSafely, startWorkerRunSafely } from "@/lib/worker-health";

/**
 * Filet de sécurité quotidien de la file des webhooks sortants — le
 * drain régulier vit dans le worker fréquent (/api/cron/jobs, toutes
 * les 5 minutes via pg_cron). Même logique partagée
 * (src/lib/webhook-worker.ts) : retys en minutes, dead-letter après
 * épuisement, purge des accusés > 30 jours.
 *
 * Le passage écrit son heartbeat (ops_worker_runs, worker `webhooks`) :
 * sans lui, un filet de sécurité muet est indistinguable d'un filet qui
 * ne tourne plus. Les accusés en dead-letter sont COMPTÉS, pas traités
 * comme une dégradation du worker : c'est l'endpoint distant qui échoue,
 * le drain, lui, a fait son travail.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) return NextResponse.json({ error: "CRON_SECRET manquant" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const admin = createAdminClient();
  // Ouverture BEST-EFFORT : le filet de sécurité doit drainer la file même
  // sans journal de santé — `null` = pas de journal, l'échec est déjà
  // remonté à Sentry par startWorkerRun, assaini.
  const run = await startWorkerRunSafely(admin, "webhooks");

  let summary;
  try {
    summary = await drainWebhookDeliveries(admin);
  } catch (error) {
    reportError("cron.webhooks", error);
    await finishWorkerRunSafely(
      admin,
      run,
      "failed",
      { claimed: 0, delivered: 0, deadLettered: 0 },
      "webhook_drain_failed",
    );
    return NextResponse.json(
      { ok: false, error: "Drain des webhooks impossible" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }

  // Clôture best-effort : les accusés sont déjà partis, un journal muet ne
  // doit pas faire rejouer le drain.
  await finishWorkerRunSafely(admin, run, "succeeded", {
    claimed: summary.claimed,
    delivered: summary.delivered,
    deadLettered: summary.deadLettered,
  });

  return NextResponse.json(
    { ok: true, ...summary },
    { headers: { "cache-control": "no-store" } },
  );
}
