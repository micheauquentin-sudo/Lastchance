import type { Metadata } from "next";
import { after } from "next/server";
import { getCompetition, isAutoCompetition } from "@/lib/competitions";
import { hasPendingResults, syncContestFixtures } from "@/lib/contest-sync";
import { reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadContestContext,
  loadContestLeaderboard,
  loadContestPlayerState,
} from "@/lib/pronostics-context";
import {
  isPredictionOpen,
  parseRewards,
  rankPlayers,
  rewardForRank,
} from "@/lib/pronostics";
import {
  ContestRegisterForm,
  PredictionCard,
} from "@/components/pronos/contest-experience";

/**
 * Page publique d'un championnat de pronostics — DA « Kermesse » (crème,
 * encre, jaune, ombres dures), même famille visuelle que le dashboard.
 *
 * Rendu dynamique : le contenu dépend du cookie joueur (pronostics
 * personnels) — aucune mise en cache ISR possible, et le trafic (clients
 * d'un commerce, quelques visites par journée de matchs) ne la justifie pas.
 */
export const dynamic = "force-dynamic";

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
  const [{ player, predictions }, leaderboardEntries] = await Promise.all([
    loadContestPlayerState(admin, contest.id),
    loadContestLeaderboard(admin, contest.id),
  ]);

  const rewards = parseRewards(contest.rewards);
  const leaderboard = rankPlayers(leaderboardEntries, (e) => e.points);
  const finished = contest.status === "finished";

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

        {/* ── Récompenses annoncées ── */}
        {rewards.length > 0 && (
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
        )}

        {/* ── Inscription ou grille de pronostics ── */}
        {!player && !finished ? (
          <div className="mb-6">
            <ContestRegisterForm
              slug={slug}
              collectEmail={contest.collect_email}
              collectPhone={contest.collect_phone}
            />
          </div>
        ) : player ? (
          <p className="mb-4 text-center text-sm font-bold text-k-body">
            Bonne chance {player.first_name} ! 🍀
          </p>
        ) : null}

        {/* ── Matchs ── */}
        {matches.length > 0 && (player || finished) && (
          <section className="mb-8">
            <h2 className="text-lg font-black text-k-ink mb-3">Les matchs</h2>
            <ul className="space-y-3">
              {matches.map((m) => (
                <PredictionCard
                  key={m.id}
                  slug={slug}
                  match={m}
                  prediction={predictions[m.id] ?? null}
                  scoreLabel={competition?.scoreLabel ?? "points"}
                  timeZone={organization.timezone}
                  locked={
                    m.status === "finished" || !isPredictionOpen(m.kickoff_at)
                  }
                />
              ))}
            </ul>
          </section>
        )}

        {matches.length === 0 && (
          <p className="mb-8 text-center text-sm text-k-body">
            Les matchs arrivent bientôt — revenez vite !
          </p>
        )}

        {/* ── Classement ── */}
        {leaderboard.length > 0 && (
          <section className="k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]">
            <h2 className="text-lg font-black text-k-ink mb-3">
              {finished ? "🏅 Classement final" : "Classement"}
            </h2>
            <ol className="space-y-1.5">
              {leaderboard.map(({ player: entry, points, rank }) => {
                const reward = rewardForRank(rewards, rank);
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
                      {rank <= 3 && finished ? ["🥇", "🥈", "🥉"][rank - 1] : rank}
                    </span>
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
                      {points} pt{points > 1 ? "s" : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <footer className="mt-10 text-center text-xs text-k-body/70">
          Jeu proposé par {organization.name} · propulsé par Lastchance
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
