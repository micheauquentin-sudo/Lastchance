import "server-only";

import { cookies } from "next/headers";
import { hashPlayerToken } from "@/lib/pronostics";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPronosticsAccess } from "@/lib/subscription";
import type {
  Contest,
  ContestMatch,
  ContestPlayer,
  ContestPrediction,
  Organization,
} from "@/types/database";

type PublicContestOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "logo_url"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_pronostics"
  | "comp_access"
  | "comp_access_until"
  | "timezone"
>;

export type ContestContext =
  | { ok: false; error: string }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      contest: Contest;
      organization: PublicContestOrganization;
      matches: ContestMatch[];
    };

interface ContestContextRow extends Contest {
  organizations: PublicContestOrganization | null;
  contest_matches: ContestMatch[];
}

/** Nom du cookie portant le jeton joueur d'un championnat. */
export function contestTokenCookieName(contestId: string): string {
  return `lc-prono-${contestId}`;
}

/**
 * Charge et valide la chaîne championnat → organisation → matchs pour le
 * parcours public /pronos. Client admin : la page est anonyme, rien
 * n'est accessible via l'anon key (RLS éditeurs uniquement).
 *
 * Un championnat `finished` reste consultable (classement final) ; seul
 * un brouillon ou un module coupé est masqué.
 */
export async function loadContestContext(slug: string): Promise<ContestContext> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("contests")
    .select(
      // NB : deux FK relient contest_matches à contests (simple + composite
      // inter-tenant, 00023) — l'embed doit nommer la FK sinon PostgREST
      // répond 300 (PGRST201, relation ambiguë) et la page croit le
      // championnat inexistant.
      "id, organization_id, slug, name, competition_key, status, scoring, rewards, collect_email, collect_phone, tiebreaker_question, tiebreaker_answer, finalized_at, created_at, organizations(id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_pronostics, comp_access, comp_access_until, timezone), contest_matches!contest_matches_contest_id_fkey(id, contest_id, organization_id, home_key, home_name, home_badge, home_color, away_key, away_name, away_badge, away_color, kickoff_at, status, home_score, away_score, finish_type, home_penalties, away_penalties, position, created_at)",
    )
    .eq("slug", slug)
    .maybeSingle();

  const row = data as unknown as ContestContextRow | null;
  if (!row) return { ok: false, error: "Ce championnat n'existe pas." };

  const org = row.organizations;
  if (!org || org.id !== row.organization_id) {
    console.error("[pronostics-context] organisation incohérente", {
      contestId: row.id,
    });
    return { ok: false, error: "Championnat indisponible." };
  }

  if (!hasPronosticsAccess(org)) {
    return { ok: false, error: "Ce championnat est momentanément désactivé." };
  }
  if (row.status === "draft") {
    return { ok: false, error: "Ce championnat n'est pas encore ouvert." };
  }

  const { organizations: _org, contest_matches, ...contest } = row;
  void _org;

  const matches = (contest_matches ?? []).sort(
    (a, b) =>
      new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime() ||
      a.position - b.position,
  );

  return { ok: true, admin, contest, organization: org, matches };
}

export interface ContestPlayerState {
  player: Pick<ContestPlayer, "id" | "first_name" | "avatar"> | null;
  /** Pronostics du joueur indexés par match_id. */
  predictions: Record<string, Pick<ContestPrediction, "home_score" | "away_score" | "points">>;
}

/**
 * Retrouve le joueur inscrit via le cookie httpOnly posé à l'inscription,
 * ainsi que ses pronostics. Aucun joueur → état vide (formulaire
 * d'inscription affiché).
 */
export async function loadContestPlayerState(
  admin: ReturnType<typeof createAdminClient>,
  contestId: string,
): Promise<ContestPlayerState> {
  const store = await cookies();
  const token = store.get(contestTokenCookieName(contestId))?.value;
  if (!token) return { player: null, predictions: {} };

  const { data: player } = await admin
    .from("contest_players")
    .select("id, first_name, avatar")
    .eq("contest_id", contestId)
    .eq("token_hash", hashPlayerToken(token))
    .maybeSingle();

  if (!player) return { player: null, predictions: {} };

  const { data: rows } = await admin
    .from("contest_predictions")
    .select("match_id, home_score, away_score, points")
    .eq("contest_id", contestId)
    .eq("player_id", player.id);

  const predictions: ContestPlayerState["predictions"] = {};
  for (const p of rows ?? []) {
    predictions[p.match_id] = {
      home_score: p.home_score,
      away_score: p.away_score,
      points: p.points,
    };
  }

  return { player, predictions };
}

export interface LeaderboardEntry {
  playerId: string;
  firstName: string;
  avatar: string;
  points: number;
  exactCount: number;
  diffCount: number;
  predictionCount: number;
  /** Rang calculé en SQL : ex æquo partagés en cours de saison
   *  (points > exacts > écarts > question subsidiaire), rangs uniques
   *  après clôture (palmarès figé, tirage compris). */
  rank: number;
}

export interface ContestLeaderboard {
  /** Page demandée, déjà triée et classée. */
  entries: LeaderboardEntry[];
  /** Inscrits classés au total (consentement accepté). */
  totalPlayers: number;
}

/** Ligne brute de la RPC contest_leaderboard / contest_player_rank. */
export interface ContestLeaderboardRow {
  player_id: string;
  first_name: string;
  avatar: string;
  email: string | null;
  total_points: number;
  exact_count: number;
  diff_count: number;
  prediction_count: number;
  rank: number;
  total_players: number;
}

function toLeaderboardEntry(row: ContestLeaderboardRow): LeaderboardEntry {
  return {
    playerId: row.player_id,
    firstName: row.first_name,
    avatar: row.avatar ?? "",
    points: Number(row.total_points),
    exactCount: Number(row.exact_count),
    diffCount: Number(row.diff_count),
    predictionCount: Number(row.prediction_count),
    rank: Number(row.rank),
  };
}

/**
 * Classement agrégé en base (RPC contest_leaderboard) : totaux, rangs
 * ex æquo et compteurs calculés par PostgreSQL. La page publique ne
 * charge que le top demandé — jamais tous les pronostics.
 *
 * `leagueId` restreint aux membres d'une ligue privée du championnat :
 * rangs re-numérotés 1..n et totalPlayers = effectif de la ligue (une
 * ligue d'un autre championnat renvoie un classement vide, pas d'oracle).
 */
export async function loadContestLeaderboard(
  admin: ReturnType<typeof createAdminClient>,
  contestId: string,
  limit = 50,
  offset = 0,
  leagueId: string | null = null,
): Promise<ContestLeaderboard> {
  const { data, error } = await admin.rpc("contest_leaderboard", {
    p_contest_id: contestId,
    p_limit: limit,
    p_offset: offset,
    p_league_id: leagueId,
  });
  if (error) {
    // Page publique : un classement vide vaut mieux qu'une erreur 500.
    console.error("[pronostics] classement:", error.message);
    return { entries: [], totalPlayers: 0 };
  }
  const rows = (data ?? []) as ContestLeaderboardRow[];
  return {
    entries: rows.map(toLeaderboardEntry),
    totalPlayers: Number(rows[0]?.total_players ?? 0),
  };
}

/**
 * Ligne de classement d'un joueur précis (rang global, ou rang dans une
 * ligue privée via `leagueId`) — la « position du joueur courant » quand
 * il est sous le top affiché publiquement.
 */
export async function loadContestPlayerRank(
  admin: ReturnType<typeof createAdminClient>,
  contestId: string,
  playerId: string,
  leagueId: string | null = null,
): Promise<LeaderboardEntry | null> {
  const { data, error } = await admin.rpc("contest_player_rank", {
    p_contest_id: contestId,
    p_player_id: playerId,
    p_league_id: leagueId,
  });
  if (error) {
    console.error("[pronostics] rang joueur:", error.message);
    return null;
  }
  const row = ((data ?? []) as ContestLeaderboardRow[])[0];
  return row ? toLeaderboardEntry(row) : null;
}

export interface PlayerAward {
  rewardLabel: string;
  code: string;
  status: "pending" | "delivered" | "cancelled";
  rank: number;
}

/**
 * Récompense du joueur courant après clôture (null : rien gagné, ou
 * championnat pas encore clôturé). Sert l'encart « votre lot » du
 * mini espace joueur.
 */
export async function loadPlayerAward(
  admin: ReturnType<typeof createAdminClient>,
  contestId: string,
  playerId: string,
): Promise<PlayerAward | null> {
  const { data, error } = await admin
    .from("contest_awards")
    .select("reward_label, code, status, rank")
    .eq("contest_id", contestId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) {
    console.error("[pronostics] récompense joueur:", error.message);
    return null;
  }
  if (!data || data.status === "cancelled") return null;
  return {
    rewardLabel: data.reward_label,
    code: data.code,
    status: data.status,
    rank: Number(data.rank),
  };
}

// ────────────────────────────────────────────────────────────
// Ligues privées (parcours joueur)
// ────────────────────────────────────────────────────────────

export interface PlayerLeague {
  id: string;
  name: string;
  /** Code d'invitation — réservé aux membres : ne sort de ce loader que
   *  pour le joueur dont on liste LES ligues. */
  code: string;
  /** Effectif de la ligue (membres inscrits, joueur compris). */
  memberCount: number;
}

/**
 * Ligues privées dont le joueur est membre (id, nom, code d'invitation,
 * effectif). Le code n'est montré qu'aux membres — un non-membre passe
 * par la saisie du code, jamais par une liste.
 */
export async function loadContestPlayerLeagues(
  admin: ReturnType<typeof createAdminClient>,
  contestId: string,
  playerId: string,
): Promise<PlayerLeague[]> {
  const { data, error } = await admin
    .from("contest_league_members")
    .select("league_id, contest_leagues!inner(id, contest_id, name, code)")
    .eq("player_id", playerId)
    .eq("contest_leagues.contest_id", contestId);
  if (error) {
    console.error("[pronostics] ligues joueur:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<{
    league_id: string;
    contest_leagues: { id: string; name: string; code: string } | null;
  }>;
  const leagues = rows.filter((r) => r.contest_leagues !== null);
  if (leagues.length === 0) return [];

  // Effectifs : une seule requête bornée (≤ 100 membres par ligue),
  // comptés côté serveur applicatif.
  const { data: members, error: membersError } = await admin
    .from("contest_league_members")
    .select("league_id")
    .in(
      "league_id",
      leagues.map((r) => r.league_id),
    );
  if (membersError) {
    console.error("[pronostics] effectif ligues:", membersError.message);
  }
  const counts = new Map<string, number>();
  for (const m of members ?? []) {
    counts.set(m.league_id, (counts.get(m.league_id) ?? 0) + 1);
  }

  return leagues
    .map((r) => ({
      id: r.contest_leagues!.id,
      name: r.contest_leagues!.name,
      code: r.contest_leagues!.code,
      memberCount: counts.get(r.league_id) ?? 1,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

// ────────────────────────────────────────────────────────────
// Mode TV (affichage public en salle, lecture seule)
// ────────────────────────────────────────────────────────────

/** Taille du classement servi au mode TV (dans la fourchette 20-50). */
const TV_LEADERBOARD_SIZE = 30;

/** Ligne de classement du mode TV — aucune coordonnée personnelle. */
export interface ContestTvEntry {
  rank: number;
  firstName: string;
  avatar: string;
  points: number;
}

export type ContestTvContext =
  | { ok: false; error: string }
  | {
      ok: true;
      contest: {
        name: string;
        status: Contest["status"];
        finalizedAt: string | null;
      };
      organization: { name: string; logoUrl: string | null };
      /** Inscrits classés au total (au-delà du top affiché). */
      totalPlayers: number;
      /** Top du classement général, déjà trié par rang. */
      entries: ContestTvEntry[];
      /** Horodatage serveur de la photo (fraîcheur côté écran). */
      generatedAt: string;
    };

/**
 * Contexte lecture seule du mode TV : classement général top 30 SANS
 * cookie joueur ni donnée personnelle (prénom/avatar/points/rang
 * uniquement). Mêmes gardes de visibilité que la page publique
 * (brouillon masqué, module coupé masqué, championnat clôturé visible).
 */
export async function loadContestTvContext(
  slug: string,
): Promise<ContestTvContext> {
  const ctx = await loadContestContext(slug);
  if (!ctx.ok) return ctx;

  const board = await loadContestLeaderboard(
    ctx.admin,
    ctx.contest.id,
    TV_LEADERBOARD_SIZE,
  );

  return {
    ok: true,
    contest: {
      name: ctx.contest.name,
      status: ctx.contest.status,
      finalizedAt: ctx.contest.finalized_at,
    },
    organization: {
      name: ctx.organization.name,
      logoUrl: ctx.organization.logo_url,
    },
    totalPlayers: board.totalPlayers,
    entries: board.entries.map((e) => ({
      rank: e.rank,
      firstName: e.firstName,
      avatar: e.avatar,
      points: e.points,
    })),
    generatedAt: new Date().toISOString(),
  };
}
