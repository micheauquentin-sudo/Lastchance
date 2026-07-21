import { NextResponse } from "next/server";
import {
  groupContestsByLeague,
  syncContestFixtures,
  type ContestSyncSummary,
} from "@/lib/contest-sync";
import { fetchLeagueFixturesCached } from "@/lib/fixtures";
import { optionalEnv } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

/**
 * Worker de synchronisation des championnats de pronostics :
 * GET /api/cron/sync-contests (CRON_SECRET).
 *
 * Appelé toutes les 10 minutes par pg_cron côté Supabase (migration
 * 20260721121000, secrets Vault) — le cron Vercel quotidien reste en
 * filet de sécurité. Organisation du travail :
 *  - une seule paire d'appels fournisseur par LIGUE (cache partagé +
 *    verrou claim_fixture_refresh), distribuée à tous les championnats ;
 *  - ligues traitées de la plus périmée à la plus fraîche, championnats
 *    d'une ligue en parallèle, erreurs isolées (un championnat en échec
 *    ne bloque ni sa ligue ni les autres) ;
 *  - budget temps : sous la limite de la fonction (60 s), les ligues
 *    restantes sont différées au prochain passage (10 min plus tard) ;
 *  - supervision : contests.last_synced_at / last_sync_error posés par
 *    syncContestFixtures, et alerte Sentry quand un résultat attendu
 *    reste absent au-delà du seuil.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Marge avant la limite Vercel : on ne DÉMARRE plus de ligue au-delà. */
const TIME_BUDGET_MS = 45_000;

/** Un match parti depuis 3 h sans résultat = retard anormal → alerte. */
const RESULT_LAG_THRESHOLD_MS = 3 * 60 * 60 * 1000;

interface SyncableContestRow {
  id: string;
  organization_id: string;
  competition_key: string;
  slug: string;
}

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET manquant" }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const startedAt = Date.now();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("contests")
    .select(
      "id, organization_id, competition_key, slug, organizations!inner(addon_pronostics)",
    )
    .eq("status", "active")
    .eq("organizations.addon_pronostics", true);
  if (error) {
    reportError("cron.sync-contests", error.message);
    return NextResponse.json({ error: "Lecture impossible" }, { status: 500 });
  }

  const contests = (data ?? []) as unknown as SyncableContestRow[];
  const groups = groupContestsByLeague(contests);

  // Priorité aux ligues dont la copie est la plus ancienne (ou absente) :
  // si le budget temps coupe le passage, ce sont les plus fraîches qui
  // attendent 10 minutes de plus.
  const leagueIds = [...groups.keys()];
  const fetchedAt = new Map<string, number>();
  if (leagueIds.length > 0) {
    const { data: cacheRows } = await admin
      .from("fixture_cache")
      .select("league_id, fetched_at")
      .in("league_id", leagueIds);
    for (const row of cacheRows ?? []) {
      fetchedAt.set(row.league_id, new Date(row.fetched_at).getTime());
    }
  }
  leagueIds.sort((a, b) => (fetchedAt.get(a) ?? 0) - (fetchedAt.get(b) ?? 0));

  const totals: ContestSyncSummary & {
    contests: number;
    providerErrors: number;
    contestErrors: number;
    deferred: number;
  } = {
    imported: 0,
    resultsApplied: 0,
    rescheduled: 0,
    contests: 0,
    providerErrors: 0,
    contestErrors: 0,
    deferred: 0,
  };

  for (const leagueId of leagueIds) {
    const group = groups.get(leagueId)!;

    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      totals.deferred += group.length;
      continue;
    }

    // Une seule lecture fournisseur (ou cache) pour toute la ligue.
    let fixtures;
    try {
      fixtures = await fetchLeagueFixturesCached(admin, leagueId);
    } catch (err) {
      reportError("cron.sync-contests.provider", err);
      totals.providerErrors += 1;
      continue;
    }

    // Championnats de la ligue en parallèle, erreurs isolées.
    const results = await Promise.allSettled(
      group.map(async (contest) => {
        const summary = await syncContestFixtures(admin, contest, fixtures);
        if (summary.imported || summary.resultsApplied || summary.rescheduled) {
          revalidatePath(`/pronos/${contest.slug}`);
          revalidatePath(`/dashboard/pronostics/${contest.id}`);
        }
        return summary;
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        totals.imported += result.value.imported;
        totals.resultsApplied += result.value.resultsApplied;
        totals.rescheduled += result.value.rescheduled;
        totals.contests += 1;
      } else {
        reportError("cron.sync-contests.contest", result.reason);
        totals.contestErrors += 1;
      }
    }
  }

  // Alerte de retard : un match automatique parti depuis plus de 3 h
  // toujours « scheduled » signifie fournisseur muet, mapping cassé ou
  // worker à l'arrêt — Sentry alerte au lieu d'attendre un joueur fâché.
  let laggingResults = 0;
  const autoContestIds = [...groups.values()].flat().map((c) => c.id);
  if (autoContestIds.length > 0) {
    const threshold = new Date(Date.now() - RESULT_LAG_THRESHOLD_MS).toISOString();
    const { data: lagging } = await admin
      .from("contest_matches")
      .select("id, kickoff_at, contest_id")
      .in("contest_id", autoContestIds)
      .eq("status", "scheduled")
      .lt("kickoff_at", threshold);
    laggingResults = (lagging ?? []).length;
    if (laggingResults > 0) {
      const oldest = (lagging ?? []).reduce(
        (min, m) => Math.min(min, new Date(m.kickoff_at).getTime()),
        Number.POSITIVE_INFINITY,
      );
      const hours = Math.round((Date.now() - oldest) / 3_600_000);
      reportError(
        "cron.sync-contests.lag",
        `${laggingResults} match(s) sans résultat plus de 3 h après le coup d'envoi (plus ancien : ~${hours} h)`,
      );
    }
  }

  return NextResponse.json(
    { ok: true, ...totals, laggingResults, durationMs: Date.now() - startedAt },
    { headers: { "cache-control": "no-store" } },
  );
}
