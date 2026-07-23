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
 *  - les passeports de fidélité DORMANTS (tampons et récompenses en cascade),
 *    bornés à la dernière activité (voir purge_expired_loyalty_members).
 *  - les joueurs de jackpot DORMANTS (identité + cooldown), bornés à la
 *    dernière activité (voir purge_expired_jackpot_players ; les entrées de
 *    tirage et les gains anonymes, sans PII, ne sont pas cascadés).
 * Comportement par défaut inchangé : data_retention_months = null →
 * aucune purge (opt-in explicite du commerçant).
 *
 * Hygiène technique (indépendante de la rétention choisie) : les mesures
 * d'exploitation de plus de 30 j et les seaux de rate-limit expirés.
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

  const [personal, contests, hunts, loyalty, jackpot, events, calendars] =
    await Promise.all([
      admin.rpc("purge_expired_personal_data"),
      admin.rpc("purge_expired_contest_players"),
      admin.rpc("purge_expired_hunt_players"),
      admin.rpc("purge_expired_loyalty_members"),
      admin.rpc("purge_expired_jackpot_players"),
      admin.rpc("purge_expired_event_sessions"),
      admin.rpc("purge_expired_calendar_players"),
    ]);

  // Seaux de rate-limit expirés : `public.rate_limits` est une table de
  // compteurs à fenêtre fixe, jamais nettoyée par ses écrivains (chaque nouvelle
  // fenêtre insère une ligne, les seaux d'échecs de fidélité en ajoutent
  // encore). Sans cet appel elle croît indéfiniment. Rétention 24 h = la plus
  // longue fenêtre en vigueur, `RATE_LIMITS.newsletterSend` (86 400 s) ; les
  // suivantes sont très en dessous (authSignup 1 h, pronoRegisterIp 1 h).
  // NE PAS abaisser cette valeur sans vérifier RATE_LIMITS : une rétention plus
  // courte que la plus longue fenêtre remettrait à zéro des compteurs
  // anti-spam ENCORE actifs.
  const { error: bucketsError } = await admin.rpc("prune_rate_limits", {
    p_older_than_seconds: 86_400,
  });
  if (bucketsError) reportError("cron.purge-data.rate-limits", bucketsError.message);

  // Mesures d'exploitation : sans valeur au-delà de 30 jours.
  const { error: metricsError } = await admin
    .from("ops_metrics")
    .delete()
    .lt("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  if (metricsError) reportError("cron.purge-data.metrics", metricsError.message);
  if (
    personal.error ||
    contests.error ||
    hunts.error ||
    loyalty.error ||
    jackpot.error ||
    events.error ||
    calendars.error
  ) {
    reportError(
      "cron.purge-data",
      personal.error?.message ??
        contests.error?.message ??
        hunts.error?.message ??
        loyalty.error?.message ??
        jackpot.error?.message ??
        events.error?.message ??
        calendars.error?.message ??
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
      loyaltyMembersDeleted: Number(loyalty.data ?? 0),
      jackpotPlayersDeleted: Number(jackpot.data ?? 0),
      eventPlayersDeleted: Number(events.data ?? 0),
      calendarPlayersDeleted: Number(calendars.data ?? 0),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
