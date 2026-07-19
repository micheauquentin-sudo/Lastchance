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
      "id, organization_id, slug, name, competition_key, status, scoring, rewards, collect_email, collect_phone, created_at, organizations(id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_pronostics, comp_access, comp_access_until, timezone), contest_matches!contest_matches_contest_id_fkey(id, contest_id, organization_id, home_key, home_name, home_badge, home_color, away_key, away_name, away_badge, away_color, kickoff_at, status, home_score, away_score, finish_type, home_penalties, away_penalties, position, created_at)",
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
}

/**
 * Total de points par joueur inscrit (0 pour un joueur sans pronostic
 * marqué). L'agrégation se fait ici : volumes faibles (clientèle d'un
 * commerce), pas besoin de RPC dédiée.
 */
export async function loadContestLeaderboard(
  admin: ReturnType<typeof createAdminClient>,
  contestId: string,
): Promise<LeaderboardEntry[]> {
  const [{ data: players }, { data: preds }] = await Promise.all([
    admin
      .from("contest_players")
      .select("id, first_name, avatar")
      .eq("contest_id", contestId)
      .eq("accepted_terms", true),
    admin
      .from("contest_predictions")
      .select("player_id, points")
      .eq("contest_id", contestId)
      .not("points", "is", null),
  ]);

  const totals = new Map<string, number>();
  for (const p of preds ?? []) {
    totals.set(p.player_id, (totals.get(p.player_id) ?? 0) + (p.points ?? 0));
  }

  return (players ?? []).map((p) => ({
    playerId: p.id,
    firstName: p.first_name,
    avatar: p.avatar ?? "",
    points: totals.get(p.id) ?? 0,
  }));
}
