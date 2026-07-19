import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { getUserAndOrg } from "@/lib/auth";
import { getCompetition, isAutoCompetition } from "@/lib/competitions";
import { hasPendingResults, syncContestFixtures } from "@/lib/contest-sync";
import { APP_URL } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseRewards,
  parseScoring,
  rankPlayers,
  rewardForRank,
} from "@/lib/pronostics";
import { createClient } from "@/lib/supabase/server";
import { hasPronosticsAccess } from "@/lib/subscription";
import { Card } from "@/components/ui/card";
import { ContestMatchList } from "@/components/dashboard/contest-matches";
import {
  ContestRewardsEditor,
  ContestScoringForm,
  ContestSettings,
} from "@/components/dashboard/contest-settings";
import { ContestShareLink } from "@/components/dashboard/contest-share";
import { ContestStatusBadge } from "@/components/dashboard/contest-status";
import type { Contest, ContestMatch } from "@/types/database";

export const metadata: Metadata = { title: "Championnat" };

export default async function ContestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization, role } = await getUserAndOrg();
  if (!organization || !hasPronosticsAccess(organization)) notFound();
  const supabase = await createClient();
  const canViewPlayers = role === "owner";

  const [{ data: contest }, { data: matches }, { data: players }, { data: preds }] =
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
      canViewPlayers
        ? supabase
            .from("contest_players")
            .select("id, first_name, email, created_at")
            .eq("contest_id", id)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as Array<{ id: string; first_name: string; email: string | null; created_at: string }> }),
      canViewPlayers
        ? supabase
            .from("contest_predictions")
            .select("player_id, points")
            .eq("contest_id", id)
            .not("points", "is", null)
        : Promise.resolve({ data: [] as Array<{ player_id: string; points: number | null }> }),
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

  // Classement en direct : total des points par joueur (0 si rien marqué).
  const totals = new Map<string, number>();
  for (const p of preds ?? []) {
    totals.set(p.player_id, (totals.get(p.player_id) ?? 0) + (p.points ?? 0));
  }
  const leaderboard = rankPlayers(
    players ?? [],
    (p) => totals.get(p.id) ?? 0,
  );

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
          {leaderboard.length} joueur{leaderboard.length > 1 ? "s" : ""} inscrit
          {leaderboard.length > 1 ? "s" : ""}
        </p>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Personne pour l&apos;instant — partagez le lien ci-dessus dès que
            le championnat est ouvert.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {leaderboard.map(({ player, points, rank }) => {
              const reward = rewardForRank(rewards, rank);
              return (
                <li
                  key={player.id}
                  className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2"
                >
                  <span className="w-8 text-center font-black tabular-nums text-k-ink">
                    {rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-k-ink">
                    {player.first_name}
                    {player.email ? (
                      <span className="ml-2 font-normal text-zinc-400">
                        {player.email}
                      </span>
                    ) : null}
                  </span>
                  {reward ? (
                    <span className="shrink-0 rounded-full bg-k-yellow/60 px-2.5 py-0.5 text-xs font-bold text-k-ink">
                      🎁 {reward}
                    </span>
                  ) : null}
                  <span className="w-14 text-right text-sm font-black tabular-nums">
                    {points} pt{points > 1 ? "s" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
          </>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <ContestScoringForm contestId={c.id} scoring={scoring} />
        <ContestRewardsEditor contestId={c.id} rewards={rewards} />
      </div>

      <ContestSettings contest={c} />
    </div>
  );
}
