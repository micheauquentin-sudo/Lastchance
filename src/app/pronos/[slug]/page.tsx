import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { getCompetition, isAutoCompetition } from "@/lib/competitions";
import { hasPendingResults, syncContestFixtures } from "@/lib/contest-sync";
import { reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadContestContext,
  loadContestLeaderboard,
  loadContestPlayerRank,
  loadContestPlayerState,
  loadPlayerAward,
  type LeaderboardEntry,
} from "@/lib/pronostics-context";
import {
  isPredictionOpen,
  parseRewards,
  rewardForRank,
} from "@/lib/pronostics";
import { Avatar } from "@/lib/avatars";
import {
  ContestProfileEditor,
  ContestRegisterForm,
  PredictionCard,
} from "@/components/pronos/contest-experience";
import { PlayerHub } from "@/components/pronos/player-hub";
import type { ContestMatch } from "@/types/database";

/**
 * Page publique d'un championnat de pronostics — DA « Kermesse » (crème,
 * encre, jaune, ombres dures), même famille visuelle que le dashboard.
 *
 * Joueur inscrit : mini espace personnel (en-tête profil + onglets
 * Matchs / Classement / Profil). Visiteur : inscription + classement.
 *
 * Rendu dynamique : le contenu dépend du cookie joueur (pronostics
 * personnels) — aucune mise en cache ISR possible, et le trafic (clients
 * d'un commerce, quelques visites par journée de matchs) ne la justifie pas.
 */
export const dynamic = "force-dynamic";

/** Le classement public s'arrête là ; la position du joueur courant est
 *  retrouvée à part s'il est au-delà (agrégation SQL, jamais tout chargé). */
const PUBLIC_LEADERBOARD_SIZE = 50;

export const metadata: Metadata = {
  title: "Pronostics",
  robots: { index: false },
};

export default async function PronosPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await loadContestContext(slug);

  if (!ctx.ok) {
    return (
      <Shell>
        <div className="mx-auto max-w-md px-6 py-24 text-center">
          <div className="text-5xl mb-6">🏆</div>
          <h1 className="text-2xl font-black text-k-ink mb-3">Oups</h1>
          <p className="text-k-body">{ctx.error}</p>
        </div>
      </Shell>
    );
  }

  const { contest, organization, matches, admin } = ctx;
  const competition = getCompetition(contest.competition_key);

  // Résultat probablement tombé depuis la dernière synchro (un match
  // « scheduled » a débuté il y a plus d'une durée de match) : on pousse
  // une synchronisation APRÈS la réponse — la page reste instantanée et
  // le prochain rafraîchissement (réflexe des joueurs en fin de match)
  // affiche le score et les points. Le cache partagé borne le fournisseur.
  if (
    contest.status === "active" &&
    isAutoCompetition(contest.competition_key) &&
    hasPendingResults(matches)
  ) {
    after(async () => {
      try {
        await syncContestFixtures(createAdminClient(), contest);
      } catch (err) {
        reportError("pronostics.lazy-sync", err);
      }
    });
  }
  const [{ player, predictions }, board] = await Promise.all([
    loadContestPlayerState(admin, contest.id),
    loadContestLeaderboard(admin, contest.id, PUBLIC_LEADERBOARD_SIZE),
  ]);

  const rewards = parseRewards(contest.rewards);
  const leaderboard = board.entries;
  const finished = contest.status === "finished";

  const upcoming = matches.filter((m) => m.status !== "finished");
  // Résultats : les plus récents d'abord (dernier match joué en tête).
  const played = matches.filter((m) => m.status === "finished").reverse();

  // Ma position : dans le top public, sinon rang global via la RPC dédiée.
  let myEntry = player
    ? leaderboard.find((e) => e.playerId === player.id) ?? null
    : null;
  if (player && !myEntry) {
    myEntry = await loadContestPlayerRank(admin, contest.id, player.id);
  }

  // Récompense du joueur après la clôture (code de retrait en caisse).
  const myAward =
    player && contest.finalized_at
      ? await loadPlayerAward(admin, contest.id, player.id)
      : null;
  const toPredict = player
    ? upcoming.filter(
        (m) => isPredictionOpen(m.kickoff_at) && !predictions[m.id],
      ).length
    : 0;

  const renderCard = (m: ContestMatch) => (
    <PredictionCard
      key={m.id}
      slug={slug}
      match={m}
      prediction={predictions[m.id] ?? null}
      scoreLabel={competition?.scoreLabel ?? "points"}
      timeZone={organization.timezone}
      locked={m.status === "finished" || !isPredictionOpen(m.kickoff_at)}
    />
  );

  const rewardsSection = rewards.length > 0 && (
    <section className="k-border mb-6 rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]">
      <h2 className="text-base font-black text-k-ink mb-3">🎁 À gagner</h2>
      <ul className="space-y-1.5">
        {rewards.map((r, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span className="shrink-0 rounded-full bg-k-yellow px-2.5 py-0.5 font-black text-k-ink">
              {r.from === r.to ? `${r.from}ᵉ` : `${r.from}ᵉ–${r.to}ᵉ`}
            </span>
            <span className="font-bold text-k-body">{r.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );

  const renderLeaderboardRow = (entry: LeaderboardEntry) => {
    const reward = rewardForRank(rewards, entry.rank);
    const isMe = player?.id === entry.playerId;
    return (
      <li
        key={entry.playerId}
        className={
          isMe
            ? "flex items-center gap-3 rounded-xl border-2 border-k-ink bg-k-yellow/50 px-3 py-2"
            : "flex items-center gap-3 rounded-xl bg-k-stripe px-3 py-2"
        }
      >
        <span className="w-7 text-center font-black tabular-nums text-k-ink">
          {entry.rank <= 3 && finished ? ["🥇", "🥈", "🥉"][entry.rank - 1] : entry.rank}
        </span>
        <Avatar
          id={entry.avatar}
          className="h-8 w-8 shrink-0"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-k-ink">
          {entry.firstName}
          {isMe && <span className="ml-1.5 text-xs">(vous)</span>}
        </span>
        {reward && (
          <span className="shrink-0 text-xs" title={reward} aria-label={reward}>
            🎁
          </span>
        )}
        <span className="w-12 text-right text-sm font-black tabular-nums text-k-ink">
          {entry.points} pt{entry.points > 1 ? "s" : ""}
        </span>
      </li>
    );
  };

  // Joueur courant au-delà du top public : sa ligne est ajoutée sous une
  // ellipse — il voit toujours sa position sans charger tout le monde.
  const me = myEntry;
  const myRowBeyondTop =
    me && !leaderboard.some((e) => e.playerId === me.playerId) ? me : null;

  const leaderboardSection = leaderboard.length > 0 && (
    <section className="k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]">
      <h2 className="text-lg font-black text-k-ink mb-3">
        {finished ? "🏅 Classement final" : "Classement"}
      </h2>
      <ol className="space-y-1.5">
        {leaderboard.map(renderLeaderboardRow)}
        {myRowBeyondTop && (
          <>
            <li aria-hidden className="select-none text-center leading-none text-k-body/60">
              ⋯
            </li>
            {renderLeaderboardRow(myRowBeyondTop)}
          </>
        )}
      </ol>
      {board.totalPlayers > leaderboard.length && (
        <p className="mt-3 text-center text-xs text-k-body/70">
          Top {leaderboard.length} affiché · {board.totalPlayers} joueurs classés
        </p>
      )}
    </section>
  );

  return (
    <Shell>
      <div className="mx-auto max-w-lg px-4 py-8 sm:py-12">
        {/* ── En-tête commerce + championnat ── */}
        <header className="text-center mb-8">
          {organization.logo_url ? (
            // URL Supabase déjà validée à l'upload ; une image HTML évite de
            // figer le domaine du projet dans next.config.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={organization.logo_url}
              alt={organization.name}
              width={64}
              height={64}
              className="mx-auto mb-3 h-16 w-16 rounded-full border-2 border-k-ink object-cover bg-white"
            />
          ) : (
            <div className="mx-auto mb-3 text-5xl">{competition?.icon ?? "🏆"}</div>
          )}
          <p className="text-sm font-bold uppercase tracking-wide text-k-body">
            {organization.name}
          </p>
          <h1 className="mt-1 text-3xl font-black text-k-ink leading-tight">
            {contest.name}
          </h1>
          {competition && (
            <p className="mt-1 text-sm text-k-body">
              {competition.icon} {competition.label}
            </p>
          )}
          {finished && (
            <p className="mt-3 inline-block rounded-full border-2 border-k-ink bg-k-yellow px-4 py-1 text-sm font-black text-k-ink">
              Championnat terminé — merci d&apos;avoir joué !
            </p>
          )}
        </header>

        {player ? (
          /* ── Mini espace joueur : profil + onglets ── */
          <PlayerHub
            firstName={player.first_name}
            avatar={player.avatar}
            points={myEntry?.points ?? 0}
            rank={myEntry?.rank ?? null}
            totalPlayers={board.totalPlayers}
            toPredict={toPredict}
            award={
              myAward && myAward.status !== "cancelled"
                ? {
                    rewardLabel: myAward.rewardLabel,
                    code: myAward.code,
                    status: myAward.status === "delivered" ? "delivered" : "pending",
                  }
                : null
            }
            matchesSlot={
              <section className="space-y-6">
                {upcoming.length > 0 && (
                  <div>
                    <h2 className="text-lg font-black text-k-ink mb-3">
                      À venir
                    </h2>
                    <ul className="space-y-3">{upcoming.map(renderCard)}</ul>
                  </div>
                )}
                {played.length > 0 && (
                  <div>
                    <h2 className="text-lg font-black text-k-ink mb-3">
                      Résultats
                    </h2>
                    <ul className="space-y-3">{played.map(renderCard)}</ul>
                  </div>
                )}
                {matches.length === 0 && (
                  <p className="text-center text-sm text-k-body">
                    Les matchs arrivent bientôt — revenez vite !
                  </p>
                )}
              </section>
            }
            leaderboardSlot={
              <div>
                {rewardsSection}
                {leaderboardSection || (
                  <p className="text-center text-sm text-k-body">
                    Le classement apparaîtra dès les premiers pronostics.
                  </p>
                )}
              </div>
            }
            profileSlot={
              <ContestProfileEditor
                slug={slug}
                firstName={player.first_name}
                avatar={player.avatar}
              />
            }
          />
        ) : !finished ? (
          /* ── Visiteur : récompenses + inscription + classement ── */
          <>
            {rewardsSection}
            <div className="mb-6">
              <ContestRegisterForm
                slug={slug}
                collectEmail={contest.collect_email}
                collectPhone={contest.collect_phone}
                tiebreakerQuestion={contest.tiebreaker_question}
              />
            </div>
            {leaderboardSection}
          </>
        ) : (
          /* ── Championnat terminé, visiteur : résultats + classement ── */
          <>
            {rewardsSection}
            {matches.length > 0 && (
              <section className="mb-8">
                <h2 className="text-lg font-black text-k-ink mb-3">
                  Les matchs
                </h2>
                <ul className="space-y-3">{matches.map(renderCard)}</ul>
              </section>
            )}
            {leaderboardSection}
          </>
        )}

        <footer className="mt-10 text-center text-xs text-k-body/70">
          Jeu proposé par {organization.name} · propulsé par{" "}
          <Link
            href="/?utm_source=pronos&utm_medium=footer"
            className="font-bold text-k-ink underline underline-offset-2 hover:text-k-orange"
          >
            Lastchance
          </Link>
          <br />
          Commerçant ? Créez vos propres jeux en 10 minutes.
        </footer>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-k-bg">
      {/* Bandeau rayé kermesse en tête de page */}
      <div
        aria-hidden
        className="h-3 w-full border-b-2 border-k-ink"
        style={{
          background:
            "repeating-linear-gradient(45deg, var(--color-k-yellow) 0 12px, var(--color-k-ink) 12px 24px)",
        }}
      />
      {children}
    </div>
  );
}
