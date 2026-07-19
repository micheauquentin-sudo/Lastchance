import "server-only";

import { getCompetition } from "@/lib/competitions";
import {
  fetchLeagueFixtures,
  resolveProviderSide,
  type ProviderFixture,
} from "@/lib/fixtures";
import { reportError } from "@/lib/monitoring";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cœur de la synchronisation d'un championnat avec le fournisseur de
 * calendriers : importe les prochains matchs, suit les reports et
 * applique les résultats (points recalculés par la RPC transactionnelle).
 *
 * Toujours exécuté avec le client service role : appelé après une garde
 * d'appartenance (action commerçant) ou par le cron. La RPC de résultat
 * accepte le service role depuis la migration 00025.
 */

export interface ContestSyncSummary {
  imported: number;
  resultsApplied: number;
  rescheduled: number;
}

interface SyncableContest {
  id: string;
  organization_id: string;
  competition_key: string;
}

export async function syncContestFixtures(
  admin: ReturnType<typeof createAdminClient>,
  contest: SyncableContest,
  prefetched?: ProviderFixture[],
): Promise<ContestSyncSummary> {
  const summary: ContestSyncSummary = {
    imported: 0,
    resultsApplied: 0,
    rescheduled: 0,
  };

  const competition = getCompetition(contest.competition_key);
  if (!competition?.providerLeagueId) return summary;

  const fixtures =
    prefetched ?? (await fetchLeagueFixtures(competition.providerLeagueId));
  if (fixtures.length === 0) return summary;

  const { data: existingRows, error: existingError } = await admin
    .from("contest_matches")
    .select("id, external_ref, kickoff_at, status, home_score, away_score, position")
    .eq("contest_id", contest.id);
  if (existingError) {
    reportError("pronostics.sync.load", existingError.message);
    return summary;
  }

  const existingByRef = new Map(
    (existingRows ?? [])
      .filter((m) => m.external_ref !== "")
      .map((m) => [m.external_ref, m] as const),
  );
  let nextPosition =
    (existingRows ?? []).reduce((max, m) => Math.max(max, m.position), -1) + 1;

  const now = Date.now();

  for (const fixture of fixtures) {
    const existing = existingByRef.get(fixture.ref);

    if (!existing) {
      // Un match déjà joué avant l'import n'a rien à faire dans la
      // grille : personne n'a pu le pronostiquer.
      if (fixture.finished || new Date(fixture.kickoffAt).getTime() <= now) {
        continue;
      }
      const home = resolveProviderSide(competition, fixture.homeName);
      const away = resolveProviderSide(competition, fixture.awayName);
      const { error } = await admin.from("contest_matches").insert({
        contest_id: contest.id,
        organization_id: contest.organization_id,
        home_key: home.key,
        home_name: home.name,
        home_badge: home.badge,
        home_color: home.color,
        away_key: away.key,
        away_name: away.name,
        away_badge: away.badge,
        away_color: away.color,
        kickoff_at: fixture.kickoffAt,
        external_ref: fixture.ref,
        position: nextPosition,
      });
      if (error) {
        reportError("pronostics.sync.insert", error.message);
        continue;
      }
      nextPosition += 1;
      summary.imported += 1;
      continue;
    }

    // Report / changement d'horaire d'un match pas encore joué.
    if (
      !fixture.finished &&
      existing.status === "scheduled" &&
      new Date(existing.kickoff_at).toISOString() !== fixture.kickoffAt
    ) {
      const { error } = await admin
        .from("contest_matches")
        .update({ kickoff_at: fixture.kickoffAt })
        .eq("id", existing.id)
        .eq("contest_id", contest.id);
      if (error) {
        reportError("pronostics.sync.reschedule", error.message);
      } else {
        summary.rescheduled += 1;
      }
    }

    // Résultat connu côté fournisseur, absent ou différent chez nous :
    // la RPC fige le score et recalcule les points en une transaction.
    if (
      fixture.finished &&
      fixture.homeScore !== null &&
      fixture.awayScore !== null &&
      (existing.status !== "finished" ||
        existing.home_score !== fixture.homeScore ||
        existing.away_score !== fixture.awayScore)
    ) {
      const { data: applied, error } = await admin.rpc(
        "set_contest_match_result",
        {
          p_organization_id: contest.organization_id,
          p_match_id: existing.id,
          p_home_score: fixture.homeScore,
          p_away_score: fixture.awayScore,
        },
      );
      if (error || applied !== true) {
        reportError("pronostics.sync.result", error?.message ?? "refusé");
      } else {
        summary.resultsApplied += 1;
      }
    }
  }

  return summary;
}
