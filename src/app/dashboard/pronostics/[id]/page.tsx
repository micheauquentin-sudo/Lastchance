import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { getUserAndOrg } from "@/lib/auth";
import { getCompetition, isAutoCompetition } from "@/lib/competitions";
import { hasPendingResults, syncContestFixtures } from "@/lib/contest-sync";
import { Avatar } from "@/lib/avatars";
import { APP_URL } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseRewards,
  parseScoring,
  rewardForRank,
} from "@/lib/pronostics";
import type { ContestLeaderboardRow } from "@/lib/pronostics-context";
import { createClient } from "@/lib/supabase/server";
import { hasPronosticsAccess } from "@/lib/subscription";
import { Card } from "@/components/ui/card";
import { ContestMatchList } from "@/components/dashboard/contest-matches";
import {
  ContestAwardsList,
  ContestFinalizeCard,
  ContestRewardsEditor,
  ContestScoringForm,
  ContestSettings,
} from "@/components/dashboard/contest-settings";
import { ContestShareLink } from "@/components/dashboard/contest-share";
import { ContestStatusBadge } from "@/components/dashboard/contest-status";
import type { Contest, ContestAward, ContestMatch } from "@/types/database";

export const metadata: Metadata = { title: "Championnat" };

/** Taille de page du classement dashboard (agrégé et paginé en SQL). */
const LEADERBOARD_PAGE_SIZE = 50;

export default async function ContestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { organization, role } = await getUserAndOrg();
  if (!organization || !hasPronosticsAccess(organization)) notFound();
  const supabase = await createClient();
  const canViewPlayers = role === "owner";

  const rawPage = Number((await searchParams).page);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const [{ data: contest }, { data: matches }, { data: boardRows }, { data: lockedFlag }] =
    await Promise.all([
      supabase
        .from("contests")
        .select("*")
        .eq("id", id)
        .eq("organization_id", organization!.id)
        .maybeSingle(),
      supabase
        .from("contest_matches")
        .select("*")
        .eq("contest_id", id)
        .order("kickoff_at", { ascending: true })
        .order("position", { ascending: true }),
      // Classement agrégé et paginé en base (RPC gardée : owner
      // uniquement — la session RLS du dashboard est vérifiée en SQL).
      canViewPlayers
        ? supabase.rpc("contest_leaderboard", {
            p_contest_id: id,
            p_limit: LEADERBOARD_PAGE_SIZE,
            p_offset: (page - 1) * LEADERBOARD_PAGE_SIZE,
          })
        : Promise.resolve({ data: [] as ContestLeaderboardRow[] }),
      // Règlement verrouillé (premier pronostic ou coup d'envoi passé) :
      // les éditeurs affichent alors le champ « motif » requis.
      supabase.rpc("contest_is_locked", { p_contest_id: id }),
    ]);

  if (!contest) notFound();

  const c = contest as Contest;
  const matchList = (matches ?? []) as ContestMatch[];
  const competition = getCompetition(c.competition_key);
  if (!competition) notFound();

  const scoring = parseScoring(c.scoring);
  const rewards = parseRewards(c.rewards);

  // Un match auto vient de se terminer ? Synchronisation en arrière-plan
  // (après la réponse) : le commerçant voit le résultat au prochain
  // rafraîchissement sans attendre le cron ni cliquer sur le bouton.
  if (
    c.status === "active" &&
    isAutoCompetition(c.competition_key) &&
    hasPendingResults(matchList)
  ) {
    after(async () => {
      try {
        await syncContestFixtures(createAdminClient(), {
          id: c.id,
          organization_id: c.organization_id,
          competition_key: c.competition_key,
        });
      } catch (err) {
        reportError("pronostics.lazy-sync", err);
      }
    });
  }

  // Classement agrégé en SQL : la page ne reçoit que les 50 lignes
  // demandées, déjà classées (rang ex æquo), avec le total d'inscrits.
  const leaderboard = (boardRows ?? []) as ContestLeaderboardRow[];
  const totalPlayers = Number(leaderboard[0]?.total_players ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalPlayers / LEADERBOARD_PAGE_SIZE));

  const locked = lockedFlag === true;
  const finalized = c.finalized_at !== null;

  // Palmarès (après clôture) : lots + pseudo du gagnant en un embed.
  let awards: Array<ContestAward & { playerName: string }> = [];
  if (canViewPlayers && finalized) {
    const { data: awardRows } = await supabase
      .from("contest_awards")
      .select("*, contest_players(first_name)")
      .eq("contest_id", id)
      .order("rank", { ascending: true });
    awards = ((awardRows ?? []) as Array<
      ContestAward & { contest_players: { first_name: string } | null }
    >).map(({ contest_players, ...award }) => ({
      ...award,
      playerName: contest_players?.first_name ?? "Joueur supprimé",
    }));
  }

  const publicUrl = `${APP_URL}/pronos/${c.slug}`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/pronostics"
          className="text-sm text-zinc-500 hover:text-k-ink"
        >
          ← Pronostics
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-3xl" aria-hidden>
            {competition.icon}
          </span>
          <h1 className="text-2xl font-bold">{c.name}</h1>
          <ContestStatusBadge status={c.status} />
        </div>
        <p className="text-sm text-zinc-500 mt-1">{competition.label}</p>
      </div>

      {c.status !== "draft" && (
        <Card>
          <h2 className="font-semibold mb-2">Lien à partager</h2>
          <p className="text-sm text-zinc-500 mb-3">
            Affichez-le en QR code au comptoir ou envoyez-le à vos clients :
            ils s&apos;inscrivent et pronostiquent depuis leur téléphone.
          </p>
          <ContestShareLink url={publicUrl} />
        </Card>
      )}

      <ContestMatchList
        matches={matchList}
        contestId={c.id}
        competition={competition}
        timeZone={organization.timezone}
      />

      <Card>
        <h2 className="font-semibold mb-1">Classement</h2>
        {!canViewPlayers ? (
          <p className="text-sm text-zinc-500">
            Le classement et les coordonnées des participants sont réservés au
            propriétaire de l&apos;établissement.
          </p>
        ) : (
          <>
        <p className="text-sm text-zinc-500 mb-4">
          {totalPlayers} joueur{totalPlayers > 1 ? "s" : ""} inscrit
          {totalPlayers > 1 ? "s" : ""}
        </p>
        {leaderboard.length === 0 ? (
          page > 1 ? (
            <p className="text-sm text-zinc-500">
              Cette page est vide —{" "}
              <Link href="?page=1" className="font-semibold text-k-ink underline">
                revenir au début du classement
              </Link>
              .
            </p>
          ) : (
            <p className="text-sm text-zinc-500">
              Personne pour l&apos;instant — partagez le lien ci-dessus dès que
              le championnat est ouvert.
            </p>
          )
        ) : (
          <>
          <ol className="space-y-1.5">
            {leaderboard.map((row) => {
              const reward = rewardForRank(rewards, Number(row.rank));
              return (
                <li
                  key={row.player_id}
                  className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2"
                >
                  <span className="w-8 text-center font-black tabular-nums text-k-ink">
                    {row.rank}
                  </span>
                  <Avatar id={row.avatar} className="h-7 w-7 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-k-ink">
                    {row.first_name}
                    {row.email ? (
                      <span className="ml-2 font-normal text-zinc-400">
                        {row.email}
                      </span>
                    ) : null}
                  </span>
                  {reward ? (
                    <span className="shrink-0 rounded-full bg-k-yellow/60 px-2.5 py-0.5 text-xs font-bold text-k-ink">
                      🎁 {reward}
                    </span>
                  ) : null}
                  <span className="w-14 text-right text-sm font-black tabular-nums">
                    {row.total_points} pt{row.total_points > 1 ? "s" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
          {totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination du classement">
              {page > 1 ? (
                <Link href={`?page=${page - 1}`} className="font-semibold text-k-ink hover:underline">
                  ← Précédent
                </Link>
              ) : (
                <span aria-hidden />
              )}
              <span className="text-zinc-400">
                Page {page} / {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={`?page=${page + 1}`} className="font-semibold text-k-ink hover:underline">
                  Suivant →
                </Link>
              ) : (
                <span aria-hidden />
              )}
            </nav>
          )}
          </>
        )}
          </>
        )}
      </Card>

      {canViewPlayers && finalized && awards.length > 0 && (
        <ContestAwardsList contestId={c.id} awards={awards} />
      )}

      {canViewPlayers && !finalized && c.status !== "draft" && (
        <ContestFinalizeCard contest={c} />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <ContestScoringForm
          contestId={c.id}
          scoring={scoring}
          locked={locked}
          finalized={finalized}
        />
        <ContestRewardsEditor
          contestId={c.id}
          rewards={rewards}
          locked={locked}
          finalized={finalized}
        />
      </div>

      <ContestSettings contest={c} locked={locked} />
    </div>
  );
}
