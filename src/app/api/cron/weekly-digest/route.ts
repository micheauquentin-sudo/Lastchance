import { NextResponse } from "next/server";
import { optionalEnv } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWeeklyDigest } from "@/lib/weekly-digest";
import { finishWorkerRunSafely, startWorkerRunSafely } from "@/lib/worker-health";

/**
 * Rapport du lundi : GET /api/cron/weekly-digest
 *
 * Déclenché par Vercel Cron (`0 8 * * 1`, hebdomadaire), protégé par
 * CRON_SECRET, instrumenté comme les neuf autres workers.
 *
 * La route ne fait que trois choses : authentifier, ouvrir/clore le
 * heartbeat, et publier les compteurs. Tout le métier vit dans
 * `@/lib/weekly-digest` — c'est là que se lisent le filtre d'opt-out, le
 * seuil de semaine vide et le tri des montants par rôle, et c'est là que ces
 * règles sont testées sans passer par HTTP.
 *
 * DÉGRADÉ, PAS ÉCHOUÉ : un reliquat d'organisations (plafond du lot) ou une
 * agrégation refusée pour une organisation isolée n'annulent pas le travail
 * fait. Le heartbeat le dit avec un code de catégorie ; rien d'autre ne le
 * dirait, puisqu'un rapport non envoyé ne produit aucune erreur visible.
 *
 * Aucun destinataire, aucun identifiant d'organisation et aucun libellé de
 * lot ne transitent par la supervision : les compteurs sont des nombres.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET manquant" }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const admin = createAdminClient();
  // Heartbeat ouvert APRÈS l'authentification, et best-effort : un rapport
  // hebdomadaire ne dépend pas du journal de santé.
  const run = await startWorkerRunSafely(admin, "weekly-digest");

  let counters: Awaited<ReturnType<typeof runWeeklyDigest>>;
  try {
    counters = await runWeeklyDigest(admin);
  } catch (error) {
    reportError("cron.weekly-digest", error);
    await finishWorkerRunSafely(admin, run, "failed", { sent: 0 }, "digest_failed");
    return NextResponse.json(
      { ok: false, error: "Rapport hebdomadaire impossible" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }

  const degraded =
    counters.deferred > 0 ||
    counters.digest_failed > 0 ||
    counters.not_configured > 0;
  const errorCode = counters.not_configured
    ? "resend_not_configured"
    : counters.digest_failed > 0
      ? "digest_partial"
      : counters.deferred > 0
        ? "organizations_deferred"
        : undefined;

  await finishWorkerRunSafely(
    admin,
    run,
    degraded ? "degraded" : "succeeded",
    counters,
    errorCode,
  );

  return NextResponse.json(
    { ok: true, ...counters },
    { headers: { "cache-control": "no-store" } },
  );
}
