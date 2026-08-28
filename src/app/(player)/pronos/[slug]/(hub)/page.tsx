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
  loadContestPlayerLeagues,
  loadContestPlayerRank,
  loadContestPlayerState,
  loadPlayerAward,
} from "@/lib/pronostics-context";
import {
  attendResultat,
  effectiveLocksAt,
  isPredictionOpen,
  isQuestionLocked,
  parseQuestionOptions,
  parseRewards,
  progressionPronostics,
} from "@/lib/pronostics";
import {
  ContestProfileEditor,
  ContestRegisterForm,
  PredictionCard,
  QuestionCard,
  RecoveryRequestForm,
} from "@/components/pronos/contest-experience";
import { ContestLeaguesPanel } from "@/components/pronos/contest-leagues";
import { ContestLeaderboardCard } from "@/components/pronos/leaderboard";
import { PlayerHub } from "@/components/pronos/player-hub";
import { PageOpenBeacon } from "@/components/page-open-beacon";
import { PredictionProgress } from "@/components/pronos/prediction-progress";
import { GrillePronostics } from "@/components/pronos/grille-pronostics";
import { PlayerPageShell } from "@/components/ui/player-page-shell";
import { fondChoisi, fondPourTheme } from "@/lib/fonds-ecran";
import { sortieDeLOrganisation } from "@/lib/sortie-apres-jeu";
import { contestThemeTokens } from "@/components/pronos/contest-theme";
import type { ContestMatch, SeasonalTheme } from "@/types/database";

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

/**
 * Code de retrait périmé : lot pas encore remis dont l'échéance serveur est
 * passée. Évalué ICI (composant serveur) car `PlayerHub` est un composant
 * client — une comparaison au temps y divergerait entre SSR et hydratation.
 */
const isPlayerAwardExpired = (award: {
  status: string;
  redeemExpiresAt: string | null;
}) =>
  award.status !== "delivered" &&
  award.redeemExpiresAt !== null &&
  new Date(award.redeemExpiresAt).getTime() <= Date.now();

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
  const [{ player, predictions }, board, sortie] = await Promise.all([
    loadContestPlayerState(admin, contest.id),
    loadContestLeaderboard(admin, contest.id, PUBLIC_LEADERBOARD_SIZE),
    // Vitrine publiée + liens de l'organisation, pour le bas de page. Elle
    // rejoint la salve plutôt que de l'attendre : elle ne dépend que du
    // championnat déjà résolu. Toute panne y vaut `null` — un bas de page
    // muet ne casse pas un championnat.
    sortieDeLOrganisation(organization.id),
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
  // Une ligne encore ouverte : le football garde sa règle d'origine
  // (coup d'envoi), une question générique suit son verrouillage
  // effectif — coalesce(locks_at, default_locks_at, kickoff_at).
  const isOpen = (m: ContestMatch) =>
    (m.question_type ?? "score") === "score"
      ? isPredictionOpen(m.kickoff_at)
      : !isQuestionLocked(m, contest);
  const toPredict = player
    ? upcoming.filter((m) => isOpen(m) && !predictions[m.id]).length
    : 0;
  // Progression de la grille. La RÈGLE (et le défaut qu'elle ferme) vit dans
  // `progressionPronostics` — une fonction pure, donc éprouvée : elle valait
  // `matches.length`, ce qui rendait la barre impossible à remplir pour un
  // joueur arrivé en cours de saison.
  const progression = progressionPronostics(
    matches.map((m) => ({
      ouvert: isOpen(m),
      pronostique: Boolean(predictions[m.id]),
    })),
  );

  // ── TROIS FAMILLES, ET NON DEUX ──
  //
  // « À venir » mélangeait un match ouvert et un match dont le coup d'envoi
  // était passé : deux lignes voisines, l'une jouable, l'autre pas, sous le
  // même titre. On sépare ce sur quoi le joueur peut AGIR (la grille), ce
  // qu'il attend (le résultat), et ce qui est joué.
  const estScore = (m: ContestMatch) => (m.question_type ?? "score") === "score";
  const aPronostiquer = upcoming.filter(isOpen);
  const grille = aPronostiquer.filter(estScore);
  const questionsOuvertes = aPronostiquer.filter((m) => !estScore(m));
  const enAttente = upcoming.filter((m) => !isOpen(m));

  // Ligues privées du joueur : classements re-numérotés 1..n chargés en
  // SQL (une RPC bornée par ligue — l'effectif d'une ligue est limité).
  const playerLeagues = player
    ? await loadContestPlayerLeagues(admin, contest.id, player.id)
    : [];
  const leagueBoards = player
    ? await Promise.all(
        playerLeagues.map(async (league) => {
          const [leagueBoard, mine] = await Promise.all([
            loadContestLeaderboard(
              admin,
              contest.id,
              PUBLIC_LEADERBOARD_SIZE,
              0,
              league.id,
            ),
            loadContestPlayerRank(admin, contest.id, player.id, league.id),
          ]);
          return { league, board: leagueBoard, mine };
        }),
      )
    : [];

  const renderCard = (m: ContestMatch) => {
    // Question générique : formulaire adapté au type. Le football
    // (question_type 'score') garde sa carte de pronostic INCHANGÉE.
    if ((m.question_type ?? "score") !== "score") {
      const saved = predictions[m.id];
      return (
        <QuestionCard
          key={m.id}
          slug={slug}
          question={{
            id: m.id,
            questionType: m.question_type as "choice" | "ranking" | "number",
            prompt: m.prompt ?? "",
            options: parseQuestionOptions(m.options),
            rankingSize: m.ranking_size,
            locksAt: effectiveLocksAt(m, contest),
            finished: m.status === "finished",
            // Déjà filtré par publicCorrectAnswer côté serveur : null
            // tant que la question n'est pas résolue.
            correctAnswer: m.correct_answer,
          }}
          answer={
            saved ? { answer: saved.answer, points: saved.points } : null
          }
          timeZone={organization.timezone}
          locked={m.status === "finished" || isQuestionLocked(m, contest)}
        />
      );
    }
    return (
      <PredictionCard
        key={m.id}
        slug={slug}
        match={m}
        prediction={predictions[m.id] ?? null}
        scoreLabel={competition?.scoreLabel ?? "points"}
        timeZone={organization.timezone}
        locked={m.status === "finished" || !isPredictionOpen(m.kickoff_at)}
        attenteResultat={
          m.status !== "finished" && attendResultat(m.kickoff_at)
        }
      />
    );
  };

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

  // Classement général : carte partagée (aussi réutilisée par les ligues).
  const generalBoard = (
    <ContestLeaderboardCard
      title={finished ? "🏅 Classement final" : "Classement"}
      entries={leaderboard}
      totalPlayers={board.totalPlayers}
      myPlayerId={player?.id ?? null}
      myEntry={myEntry}
      rewards={rewards}
      finished={finished}
    />
  );
  const leaderboardSection = leaderboard.length > 0 && generalBoard;

  return (
    <Shell theme={contest.theme} fondKey={contest.fond_key}>
      <PageOpenBeacon module="pronostics" publicId={contest.slug} />
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
          {/* La compétition n'a de sens que pour le football : un
              événement générique n'a pas de catalogue sportif. */}
          {competition && contest.event_kind === "football" && (
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
            organizationId={organization.id}
            sortie={sortie}
            award={
              myAward && myAward.status !== "cancelled"
                ? {
                    rewardLabel: myAward.rewardLabel,
                    code: myAward.code,
                    status: myAward.status === "delivered" ? "delivered" : "pending",
                    redeemExpiresAt: myAward.redeemExpiresAt,
                    expired: isPlayerAwardExpired(myAward),
                  }
                : null
            }
            matchesSlot={
              <section className="space-y-6">
                <PredictionProgress
                  done={progression.done}
                  total={progression.total}
                />

                {/* ── 1. CE QUE LE JOUEUR PEUT FAIRE MAINTENANT ──
                    Une seule carte, un seul bouton, tous les matchs ouverts
                    dedans. C'est le geste du joueur : il remplit sa journée
                    puis valide. */}
                <GrillePronostics
                  slug={slug}
                  entrees={grille.map((m) => ({
                    match: m,
                    prediction: predictions[m.id]
                      ? {
                          home_score: predictions[m.id].home_score,
                          away_score: predictions[m.id].away_score,
                        }
                      : null,
                  }))}
                  scoreLabel={competition?.scoreLabel ?? "points"}
                  timeZone={organization.timezone}
                />

                {/* Les questions génériques gardent leur carte : un
                    classement et une estimation ne se saisissent pas dans une
                    grille de scores, et les regrouper aurait demandé un
                    formulaire commun à quatre formes de réponse. */}
                {questionsOuvertes.length > 0 && (
                  <div>
                    <h2 className="text-lg font-black text-k-ink mb-3">
                      Questions ouvertes
                    </h2>
                    <ul className="space-y-3">
                      {questionsOuvertes.map(renderCard)}
                    </ul>
                  </div>
                )}

                {/* ── 2. CE QU'IL ATTEND ── */}
                {enAttente.length > 0 && (
                  <div>
                    <h2 className="text-lg font-black text-k-ink mb-3">
                      En attente de résultat
                    </h2>
                    <ul className="space-y-3">{enAttente.map(renderCard)}</ul>
                  </div>
                )}

                {/* ── 3. CE QUI EST JOUÉ ── */}
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
                {matches.length > 0 && grille.length === 0 &&
                  questionsOuvertes.length === 0 && (
                    <p className="text-center text-sm text-k-body">
                      Aucun match ouvert aux pronostics pour le moment — la
                      prochaine journée arrive.
                    </p>
                  )}
              </section>
            }
            leaderboardSlot={
              <div>
                {rewardsSection}
                {generalBoard}
              </div>
            }
            leaguesSlot={
              <ContestLeaguesPanel
                slug={slug}
                contestName={contest.name}
                leagues={playerLeagues}
                generalBoard={generalBoard}
                leagueBoards={Object.fromEntries(
                  leagueBoards.map(({ league, board: leagueBoard, mine }) => [
                    league.id,
                    <ContestLeaderboardCard
                      key={league.id}
                      title={`Classement — ${league.name}`}
                      entries={leagueBoard.entries}
                      totalPlayers={leagueBoard.totalPlayers}
                      myPlayerId={player.id}
                      myEntry={mine}
                      finished={finished}
                      emptyText="Le classement de la ligue apparaîtra dès les premiers pronostics."
                    />,
                  ]),
                )}
              />
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
              {/* Cookie perdu / nouvel appareil : lien magique par email. */}
              {contest.collect_email && <RecoveryRequestForm slug={slug} />}
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
            {/* Un gagnant sans cookie doit pouvoir retrouver son code. */}
            {contest.collect_email && <RecoveryRequestForm slug={slug} />}
          </>
        )}

        <footer className="mt-10 text-center text-xs text-k-body">
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

/**
 * Le championnat était la SEULE page joueur suivie sans thème : fond crème en
 * dur, quelle que soit la saison. Il rejoint la palette partagée avec le
 * calendrier (`SeasonalTheme`) et le shell commun.
 *
 * `theme` est OPTIONNEL et retombe sur `neutre` : la colonne n'entre dans le
 * `select` du contexte public qu'avec le lot backend, et une page joueur ne
 * doit pas tomber pour un fond d'écran. L'écran d'erreur (championnat inconnu,
 * module coupé) n'a par construction aucun thème à afficher.
 */
function Shell({
  theme,
  fondKey = null,
  children,
}: {
  theme?: SeasonalTheme | null;
  /** Réglage BRUT : `null` = suivre le thème, `"aucun"`, ou une clé. */
  fondKey?: string | null;
  children: React.ReactNode;
}) {
  const tokens = contestThemeTokens(theme);
  return (
    <PlayerPageShell
      pageStyle={tokens.pageStyle}
      // Le fond du THÈME n'est plus qu'un repli : il ne s'applique que si le
      // commerçant n'a rien choisi. `fondChoisi` distingue « suivre le
      // thème » (null) de « aucun fond » (choix explicite) — sans quoi
      // retirer l'image d'un thème qui en a une aurait été impossible.
      fond={fondChoisi(fondKey, fondPourTheme(tokens.key))}
    >
      {children}
    </PlayerPageShell>
  );
}
