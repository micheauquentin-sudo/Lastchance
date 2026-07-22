import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { optionalEnv } from "@/lib/env";
import { reportError } from "@/lib/monitoring";

/**
 * Purge RGPD automatique : GET /api/cron/purge-data
 *
 * Déclenché par un cron (Vercel Cron). Protégé par CRON_SECRET (header
 * Authorization: Bearer …). Pour chaque organisation ayant choisi une
 * durée de conservation (data_retention_months), supprime :
 *  - les participations (données personnelles : prénom/email/téléphone)
 *    plus anciennes que la durée choisie ;
 *  - les abonnés newsletter désinscrits depuis plus longtemps que cette
 *    durée (minimisation — aucune base légale à les garder après leur
 *    désinscription + la période de conservation).
 *  - les joueurs des championnats de pronostics et leurs grilles associées.
 *  - les joueurs des chasses au trésor (scans et complétions en cascade).
 * Comportement par défaut inchangé : data_retention_months = null →
 * aucune purge (opt-in explicite du commerçant).
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

  const [personal, contests, hunts] = await Promise.all([
    admin.rpc("purge_expired_personal_data"),
    admin.rpc("purge_expired_contest_players"),
    admin.rpc("purge_expired_hunt_players"),
  ]);

  // Mesures d'exploitation : sans valeur au-delà de 30 jours.
  const { error: metricsError } = await admin
    .from("ops_metrics")
    .delete()
    .lt("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  if (metricsError) reportError("cron.purge-data.metrics", metricsError.message);
  if (personal.error || contests.error || hunts.error) {
    reportError(
      "cron.purge-data",
      personal.error?.message ??
        contests.error?.message ??
        hunts.error?.message ??
        "unknown",
    );
    return NextResponse.json({ error: "Purge impossible" }, { status: 500 });
  }
  const result = ((personal.data ?? [])[0] ?? {}) as {
    organizations_processed?: number;
    participations_deleted?: number;
    subscribers_deleted?: number;
  };

  return NextResponse.json(
    {
      ok: true,
      orgsProcessed: result.organizations_processed ?? 0,
      participationsDeleted: result.participations_deleted ?? 0,
      subscribersDeleted: result.subscribers_deleted ?? 0,
      contestPlayersDeleted: Number(contests.data ?? 0),
      huntPlayersDeleted: Number(hunts.data ?? 0),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
