import { authorizeCronRequest } from "@/lib/timing-safe";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { optionalEnv } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { finishWorkerRunSafely, startWorkerRunSafely } from "@/lib/worker-health";

/**
 * Tirages de jackpot à date échue : GET /api/cron/jackpot-draws (CRON_SECRET).
 *
 * Pour chaque campagne `date_draw` dont `draw_at` est passé, active, avec du
 * stock et des participants du cycle courant non encore tirée :
 * `run_jackpot_date_draws` effectue le tirage crypto atomique (verrou de ligne),
 * crée le gain + code JACKPOT-… et ouvre le cycle suivant.
 *
 * La cadence sensible au temps est déjà assurée par pg_cron côté Supabase
 * (planification `lastchance-jackpot-date-draws`, toutes les 5 min, cf.
 * migration). Ce cron Vercel n'est qu'un FILET DE SÉCURITÉ (comme
 * sync-contests) : la RPC est idempotente — l'unicité (campaign_id, cycle) sur
 * jackpot_wins et la revalidation sous verrou empêchent tout double tirage,
 * qu'un ou deux planificateurs l'appellent.
 *
 * Les gagnants sont anonymes (seul le hash du jeton touche la base, aucune
 * PII) : il n'y a donc AUCUN destinataire à notifier ici. Le joueur découvre
 * son gain — et son code de retrait — en rechargeant la page suivable du
 * jackpot (loadJackpotContext lit ses gains par winner_token_hash).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface JackpotDrawRow {
  campaign_id: string;
  organization_id: string;
  cycle: number;
  code: string;
}

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET manquant" }, { status: 500 });
  }
  if (!authorizeCronRequest(request, secret)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const admin = createAdminClient();
  // Ouverture BEST-EFFORT : un tirage à date échue ne peut pas attendre le
  // journal de santé — `null` = pas de journal, le tirage a lieu (il reste
  // idempotent). L'échec est déjà remonté à Sentry par startWorkerRun.
  const run = await startWorkerRunSafely(admin, "jackpot-draws");

  const { data, error } = await admin.rpc("run_jackpot_date_draws");
  if (error) {
    reportError("cron.jackpot-draws", error.message);
    await finishWorkerRunSafely(admin, run, "failed", { drawn: 0 }, "draw_failed");
    return NextResponse.json({ error: "Tirage impossible" }, { status: 500 });
  }

  const draws = (data ?? []) as JackpotDrawRow[];
  // Seul le NOMBRE de tirages est journalisé : les codes JACKPOT-… et les
  // identifiants de campagne n'ont rien à faire dans un journal de santé.
  // Clôture best-effort : les gains sont émis, un journal muet ne doit pas
  // faire passer le tirage pour un échec.
  await finishWorkerRunSafely(admin, run, "succeeded", { drawn: draws.length });

  return NextResponse.json(
    { ok: true, drawn: draws.length },
    { headers: { "cache-control": "no-store" } },
  );
}
