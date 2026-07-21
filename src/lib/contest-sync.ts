import "server-only";

import { getCompetition } from "@/lib/competitions";
import {
  fetchLeagueFixturesCached,
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
  // Compétition manuelle ou hors catalogue : rien à synchroniser, et
  // surtout pas de trace « réussie » qui n'aurait aucun sens.
  if (!getCompetition(contest.competition_key)?.providerLeagueId) {
    return { imported: 0, resultsApplied: 0, rescheduled: 0 };
  }
  try {
    const summary = await syncWithProvider(admin, contest, prefetched);
    // Trace de supervision : dernière synchro RÉUSSIE par championnat.
    await admin
      .from("contests")
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq("id", contest.id);
    return summary;
  } catch (err) {
    // L'échec est tracé sur le championnat (last_synced_at garde la
    // dernière réussite) puis remonte à l'appelant, qui décide.
    await admin
      .from("contests")
      .update({
        last_sync_error: err instanceof Error ? err.message : String(err),
      })
      .eq("id", contest.id);
    throw err;
  }
}

async function syncWithProvider(
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

  // Cache partagé en base : la copie d'une ligue sert tous les
  // championnats de tous les commerçants (fenêtre de fraîcheur 15 min).
  const fixtures =
    prefetched ??
    (await fetchLeagueFixturesCached(admin, competition.providerLeagueId));
  if (fixtures.length === 0) return summary;

  const { data: existingRows, error: existingError } = await admin
    .from("contest_matches")
    .select(
      "id, external_ref, kickoff_at, status, home_score, away_score, finish_type, home_penalties, away_penalties, position",
    )
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
    // Le score inclut les prolongations ; la séance de tirs au but est
    // stockée à part (affichage) et ne compte pas dans les points.
    if (
      fixture.finished &&
      fixture.homeScore !== null &&
      fixture.awayScore !== null &&
      (existing.status !== "finished" ||
        existing.home_score !== fixture.homeScore ||
        existing.away_score !== fixture.awayScore ||
        existing.finish_type !== fixture.finishType ||
        existing.home_penalties !== fixture.homePenalties ||
        existing.away_penalties !== fixture.awayPenalties)
    ) {
      const { data: applied, error } = await admin.rpc(
        "set_contest_match_result",
        {
          p_organization_id: contest.organization_id,
          p_match_id: existing.id,
          p_home_score: fixture.homeScore,
          p_away_score: fixture.awayScore,
          p_finish_type: fixture.finishType,
          p_home_penalties: fixture.homePenalties,
          p_away_penalties: fixture.awayPenalties,
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

/**
 * Regroupe les championnats synchronisables par ligue fournisseur : une
 * seule paire d'appels (ou lecture de cache) par ligue, distribuée à
 * tous les championnats concernés. Les compétitions manuelles ou
 * inconnues du catalogue sont ignorées.
 */
export function groupContestsByLeague<T extends { competition_key: string }>(
  contests: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const contest of contests) {
    const leagueId = getCompetition(contest.competition_key)?.providerLeagueId;
    if (!leagueId) continue;
    const group = groups.get(leagueId);
    if (group) group.push(contest);
    else groups.set(leagueId, [contest]);
  }
  return groups;
}

/**
 * Durée minimale d'un match (mi-temps comprise) avant d'espérer un
 * résultat : évite de solliciter la synchro pendant la rencontre.
 */
const MIN_MATCH_DURATION_MS = 100 * 60 * 1000;

/**
 * Un résultat est-il vraisemblablement tombé depuis la dernière synchro ?
 * Vrai si un match encore « scheduled » a débuté il y a plus d'une durée
 * de match. Sert de déclencheur paresseux : chaque visite de la page
 * (joueur qui vient voir le classement, commerçant sur sa fiche) pousse
 * une synchronisation en arrière-plan — le résultat arrive dans les
 * minutes qui suivent le coup de sifflet final, sans attendre le cron.
 * Le cache partagé (15 min) borne les appels fournisseur.
 */
export function hasPendingResults(
  matches: Array<{ status: string; kickoff_at: string }>,
  now: Date = new Date(),
): boolean {
  return matches.some(
    (m) =>
      m.status === "scheduled" &&
      new Date(m.kickoff_at).getTime() + MIN_MATCH_DURATION_MS <= now.getTime(),
  );
}
