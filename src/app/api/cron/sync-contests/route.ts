import { NextResponse } from "next/server";
import { getCompetition } from "@/lib/competitions";
import { syncContestFixtures, type ContestSyncSummary } from "@/lib/contest-sync";
import { fetchLeagueFixtures, type ProviderFixture } from "@/lib/fixtures";
import { optionalEnv } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

/**
 * Synchronisation nocturne des championnats de pronostics :
 * GET /api/cron/sync-contests (Vercel Cron, CRON_SECRET).
 *
 * Pour chaque championnat actif d'une organisation avec le module :
 * import des nouveaux matchs annoncés, suivi des reports, application
 * des résultats (points recalculés). Une seule paire de requêtes
 * fournisseur par compétition, partagée entre tous les championnats.
 * Le bouton « Synchroniser » du dashboard couvre l'immédiat.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const totals: ContestSyncSummary & { contests: number; providerErrors: number } = {
    imported: 0,
    resultsApplied: 0,
    rescheduled: 0,
    contests: 0,
    providerErrors: 0,
  };

  // Une seule récupération fournisseur par compétition.
  const fixturesByCompetition = new Map<string, ProviderFixture[]>();
  for (const contest of contests) {
    const competition = getCompetition(contest.competition_key);
    if (!competition?.providerLeagueId) continue;

    let fixtures = fixturesByCompetition.get(contest.competition_key);
    if (!fixtures) {
      try {
        fixtures = await fetchLeagueFixtures(competition.providerLeagueId);
      } catch (err) {
        reportError("cron.sync-contests.provider", err);
        totals.providerErrors += 1;
        continue;
      }
      fixturesByCompetition.set(contest.competition_key, fixtures);
    }

    const summary = await syncContestFixtures(admin, contest, fixtures);
    totals.imported += summary.imported;
    totals.resultsApplied += summary.resultsApplied;
    totals.rescheduled += summary.rescheduled;
    totals.contests += 1;

    if (summary.imported || summary.resultsApplied || summary.rescheduled) {
      revalidatePath(`/pronos/${contest.slug}`);
      revalidatePath(`/dashboard/pronostics/${contest.id}`);
    }
  }

  return NextResponse.json(
    { ok: true, ...totals },
    { headers: { "cache-control": "no-store" } },
  );
}
