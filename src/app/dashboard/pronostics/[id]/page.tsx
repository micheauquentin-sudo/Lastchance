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
  effectiveLocksAt,
  parseQuestionOptions,
  parseRewards,
  parseScoring,
  rewardForRank,
  type ContestQuestionType,
} from "@/lib/pronostics";
import type { ContestLeaderboardRow } from "@/lib/pronostics-context";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import {
  eventKindLabel,
  FOOTBALL_EVENT_KIND,
  getEventKind,
} from "@/components/dashboard/contest-event-kinds";
import { ContestMatchList } from "@/components/dashboard/contest-matches";
import {
  ContestQuestionsCard,
  type DashboardQuestion,
  type GenericQuestionType,
} from "@/components/dashboard/contest-questions";
import {
  ContestAwardsList,
  ContestDangerZone,
  ContestEventCard,
  ContestFinalizeCard,
  ContestIdentityCard,
  ContestRewardsEditor,
  ContestScoringForm,
  ContestStatusControls,
  ContestTiebreakerCard,
} from "@/components/dashboard/contest-settings";
import {
  etapeVoisine,
  numeroEtape,
  parseEtape,
} from "@/components/dashboard/atelier-etapes";
import {
  definitionEtapeContest,
  ETAPES_CONTEST,
  hrefEtapeContest,
  type EtapeContest,
} from "@/components/dashboard/atelier-contest-etapes";
import { AtelierContestEntree } from "@/components/dashboard/atelier-contest-entree";
import { AtelierContestVerification } from "@/components/dashboard/atelier-contest-verification";
import {
  AtelierNavigationEtape,
  AtelierStepper,
} from "@/components/dashboard/atelier-stepper";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { PublicShare } from "@/components/dashboard/public-share";
import { GuidedJourney } from "@/components/dashboard/guided-journey";
import { RelaunchFormulaAction } from "@/components/dashboard/relaunch-formula-action";
import { RelaunchFormulaCard } from "@/components/dashboard/relaunch-formula-card";
import { RelanceErreur } from "@/components/dashboard/relance-erreur";
import {
  conclusionAventure,
  construireEtapesAventure,
} from "@/lib/experience-lifecycle";
import { etatSourceRelance } from "@/lib/experience-relance";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { readModulePageOpenCount } from "@/lib/module-page-opens";
import { ContestStatusBadge } from "@/components/dashboard/contest-status";
import type {
  Contest,
  ContestAward,
  ContestMatch,
  TeamMemberRow,
} from "@/types/database";

export const metadata: Metadata = { title: "Championnat" };

/** Taille de page du classement dashboard (agrégé et paginé en SQL). */
const LEADERBOARD_PAGE_SIZE = 50;

/**
 * Code de retrait périmé : lot encore « à remettre » dont l'échéance serveur
 * est passée. Évalué ICI (composant serveur) car `ContestAwardsList` est un
 * composant client — une comparaison au temps y divergerait entre le rendu
 * SSR et l'hydratation.
 */
const isAwardExpired = (
  award: Pick<ContestAward, "status" | "redeem_expires_at">,
) =>
  award.status === "pending" &&
  award.redeem_expires_at !== null &&
  new Date(award.redeem_expires_at).getTime() <= Date.now();

export default async function ContestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string;
    etape?: string;
    relance_error?: string | string[];
  }>;
}) {
  const { id } = await params;
  const { organization, role } = await getUserAndOrg();
  if (!organization) notFound();
  const supabase = await createClient();
  const canViewPlayers = role === "owner";

  const {
    page: rawPageParam,
    etape: etapeParam,
    relance_error: relanceError,
  } = await searchParams;
  const rawPage = Number(rawPageParam);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  // Les DEUX VISAGES de cette route : sans `?etape=`, la vue SUIVI (classement,
  // clôture, palmarès) ; avec, l'atelier. La politique « nulle » est ce qui
  // rend l'absence significative — la roue, elle, n'a pas de vue suivi.
  const etape = parseEtape(ETAPES_CONTEST, etapeParam, "nulle") as
    | EtapeContest
    | null;

  const [
    { data: contest },
    { data: matches },
    { data: boardRows },
    { data: lockedFlag },
    capacites,
  ] = await Promise.all([
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
      // Découvrir / préparer / publier (cahier §3), et non le DROIT EFFECTIF.
      // Cette page refusait par `hasPronosticsAccess` alors que la création
      // d'un brouillon est gratuite : le commerçant sans add-on créait son
      // championnat depuis la liste, était redirigé ici… et tombait sur un 404.
      // Seule la publication reste fermée, et elle l'est en base
      // (`assert_module_publish_allowed`).
      capacitesDuModule("pronostics"),
    ]);

  if (!capacites.canExplore) notFound();
  if (!contest) notFound();

  const c = contest as Contest;
  const rows = (matches ?? []) as ContestMatch[];
  // Une ligne de `contest_matches` est soit un MATCH (question_type
  // 'score' — le football, inchangé), soit une QUESTION générique. Repli
  // sur 'score' : la colonne est NOT NULL DEFAULT 'score' en base.
  const matchList = rows.filter((m) => (m.question_type ?? "score") === "score");
  const questionRows = rows.filter(
    (m) => (m.question_type ?? "score") !== "score",
  );
  const questionTypes = Array.from(
    new Set(rows.map((m) => (m.question_type ?? "score") as ContestQuestionType)),
  );
  const isFootball = c.event_kind === FOOTBALL_EVENT_KIND;
  const competition = getCompetition(c.competition_key);
  if (!competition) notFound();

  const questions: DashboardQuestion[] = questionRows.map((m) => ({
    id: m.id,
    questionType: m.question_type as GenericQuestionType,
    prompt: m.prompt ?? "",
    options: parseQuestionOptions(m.options),
    rankingSize: m.ranking_size,
    locksAt: effectiveLocksAt(m, c),
    finished: m.status === "finished",
    correctAnswer: m.correct_answer,
  }));

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
  let awards: Array<
    ContestAward & { playerName: string; expired: boolean }
  > = [];
  // Auteur d'une remise : `redeemed_by` porte un id d'utilisateur, résolu en
  // email via la RPC équipe (owner uniquement — comme ce bloc).
  let redeemers: Record<string, string> = {};
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
      expired: isAwardExpired(award),
    }));

    if (awards.some((a) => a.redeemed_by)) {
      const { data: membersData } = await supabase.rpc("org_team_members", {
        p_organization_id: organization!.id,
      });
      redeemers = Object.fromEntries(
        ((membersData ?? []) as TeamMemberRow[]).map((m) => [m.user_id, m.email]),
      );
    }
  }

  const publicUrl = `${APP_URL}/pronos/${c.slug}`;
  const openCount = await readModulePageOpenCount(
    supabase,
    "pronostics",
    c.id,
  );

  // Carte de l'Aventure et relance. Pour un championnat, la finalisation fait
  // foi : `finalized` est déjà calculé au-dessus, `status` vient de la ligne.
  const marqueurs = { status: c.status, finalized_at: c.finalized_at };
  // ANCRES pour tout ce qui vit sur CETTE vue (un href vers la page produirait
  // un « Continuer » qui la recharge) — mais l'ÉDITEUR est désormais une URL
  // d'étape : depuis l'Atelier, `#reglages` désignerait un bloc absent du DOM.
  // Au passage, l'ancre mentait déjà : elle pointait sur la carte « Questions »,
  // pas sur les réglages.
  const etapes = construireEtapesAventure({
    marqueurs: { kind: "pronostics", ...marqueurs },
    capacites,
    liens: {
      editeur: hrefEtapeContest(c.id, "championnat"),
      // Même condition que le bloc QR ci-dessous : un brouillon n'a pas de page
      // publique ouverte.
      apercu: c.status !== "draft" ? publicUrl : null,
      suivi: "#suivi",
      statut: "#statut",
    },
  });
  const conclusion = conclusionAventure(etapes, {
    relanceHref: capacites.canExplore ? "#relance" : null,
  });
  const peutCreerBrouillon = role === "owner" || role === "editor";

  // ── L'ATELIER (rendu seulement quand `?etape=` est présent) ──
  const definition = etape ? definitionEtapeContest(etape) : null;
  const numero = etape ? numeroEtape(ETAPES_CONTEST, etape) : 0;
  const precedente = etape ? etapeVoisine(ETAPES_CONTEST, etape, -1) : null;
  const suivante = etape ? etapeVoisine(ETAPES_CONTEST, etape, 1) : null;
  // Le seul endroit qui connaît la base d'URL de ce module.
  const hrefPour = (cle: string) => hrefEtapeContest(c.id, cle as EtapeContest);
  // Calendrier synchronisé : l'étape « Les matchs » n'a alors AUCUN formulaire
  // d'ajout, seulement un bouton de synchronisation et une liste en lecture.
  const autoCompetition = Boolean(competition.providerLeagueId);
  // Le barème dérive des types de questions RÉELLEMENT créés. Sur un événement
  // générique encore vide, il n'afficherait qu'un bloc « score » qui ne servira
  // jamais : mieux vaut renvoyer là où la matière se crée.
  const baremeAMatiere = rows.length > 0 || isFootball;

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
            {isFootball
              ? competition.icon
              : (getEventKind(c.event_kind)?.icon ?? "✨")}
          </span>
          <h1 className="text-2xl font-bold">{c.name}</h1>
          <ContestStatusBadge status={c.status} />
        </div>
        <p className="text-sm text-zinc-500 mt-1">
          {isFootball ? competition.label : eventKindLabel(c.event_kind)}
        </p>
      </div>

      {etape ? (
        <>
          <ModuleCapabilityNotice capacites={capacites} entitlement="pronostics">
            Championnats illimités, calendriers et résultats automatiques,
            classement public et récompenses par rang.
          </ModuleCapabilityNotice>

          <AtelierStepper
            etapes={ETAPES_CONTEST}
            courante={etape}
            hrefPour={hrefPour}
          />

          <section
            aria-label={`Étape ${numero} sur ${ETAPES_CONTEST.length} — ${definition!.titre}`}
            className="space-y-6"
          >
            {etape === "championnat" && <ContestIdentityCard contest={c} />}

            {etape === "matchs" && (
              <>
                <p className="rounded-2xl border-2 border-k-ink/25 bg-white p-4 text-sm font-semibold text-k-body">
                  {autoCompetition
                    ? "Votre calendrier arrive tout seul : les rencontres sont importées depuis la compétition, chaque nuit, et les résultats avec elles. Rien à saisir ici — vérifiez, ou relancez la synchronisation si une rencontre manque."
                    : isFootball
                      ? "Vous saisissez vous-même les rencontres, une par une ou en bloc. Chaque match ferme automatiquement à son coup d'envoi, et vous saisissez le résultat ensuite."
                      : "Cet événement ne repose pas sur des rencontres : les affrontements n'apparaissent ici que si vous en avez ajouté. Sinon, passez directement aux questions."}
                </p>

                {(isFootball || matchList.length > 0) && (
                  <ContestMatchList
                    matches={matchList}
                    contestId={c.id}
                    competition={competition}
                    timeZone={organization.timezone}
                  />
                )}

                <ContestEventCard
                  contest={c}
                  locked={locked}
                  timeZone={organization.timezone}
                />
              </>
            )}

            {etape === "questions" && (
              <>
                <InfoBulle
                  id="aide-questions-pronostics"
                  resume="Puis-je corriger une question après l'avoir posée ?"
                  defaultOpen
                >
                  Non : une question posée ne se modifie plus. Pour la corriger,
                  il faut la supprimer — et les réponses déjà données par vos
                  joueurs partent avec elle — puis la recréer. Relisez donc
                  l&apos;intitulé et les propositions avant de valider :
                  c&apos;est le seul moment où cela ne coûte rien.
                </InfoBulle>

                <ContestQuestionsCard
                  contestId={c.id}
                  questions={questions}
                  defaultLocksAt={c.default_locks_at}
                  timeZone={organization.timezone}
                  eventKind={c.event_kind}
                />

                <ContestTiebreakerCard contest={c} locked={locked} />
              </>
            )}

            {etape === "bareme" &&
              (baremeAMatiere ? (
                <ContestScoringForm
                  contestId={c.id}
                  scoring={scoring}
                  questionTypes={questionTypes}
                  eventKind={c.event_kind}
                  locked={locked}
                  finalized={finalized}
                />
              ) : (
                <Card>
                  <h2 className="font-semibold mb-1">
                    Rien à noter pour l&apos;instant
                  </h2>
                  <p className="text-sm text-zinc-500 mb-4">
                    Le barème dépend des types de questions que vous avez créés :
                    tant que votre événement n&apos;en porte aucune, il
                    n&apos;y a pas de palier à régler. Posez d&apos;abord vos
                    questions, les paliers correspondants apparaîtront ici.
                  </p>
                  <Link
                    href={hrefPour("questions")}
                    className="inline-flex rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
                  >
                    Revenir à l&apos;étape « Les questions »
                  </Link>
                </Card>
              ))}

            {etape === "recompenses" && (
              <ContestRewardsEditor
                contestId={c.id}
                rewards={rewards}
                locked={locked}
                finalized={finalized}
              />
            )}

            {etape === "verification" && (
              <AtelierContestVerification
                entree={{
                  contestId: c.id,
                  autoCompetition,
                  nbMatchs: matchList.length,
                  nbQuestions: questions.length,
                  echeances: questions.map((q) => q.locksAt),
                  nbRecompenses: rewards.length,
                  tiebreakerQuestion: c.tiebreaker_question,
                  tiebreakerAnswer: c.tiebreaker_answer,
                  collectEmail: c.collect_email,
                  collectPhone: c.collect_phone,
                }}
              />
            )}
          </section>

          <AtelierNavigationEtape
            precedente={precedente}
            suivante={suivante}
            hrefPour={hrefPour}
          />

          <p>
            <Link
              href={`/dashboard/pronostics/${c.id}`}
              className="text-sm font-bold text-zinc-500 hover:text-k-ink"
            >
              ← Retour au suivi du championnat
            </Link>
          </p>
        </>
      ) : (
        <>
      <GuidedJourney
        steps={etapes}
        title="Carte de l'Aventure"
        conclusion={conclusion}
      />

      <div id="statut" className="scroll-mt-24">
        <ContestStatusControls contest={c} />
      </div>

      <AtelierContestEntree
        contestId={c.id}
        locked={locked}
        finalized={finalized}
      />

      {c.status !== "draft" && (
        <Card>
          <h2 className="font-semibold mb-2">QR code et lien à partager</h2>
          <p className="text-sm text-zinc-500 mb-3">
            Affichez le QR code au comptoir ou envoyez le lien à vos clients :
            ils s&apos;inscrivent et pronostiquent depuis leur téléphone.
          </p>
          <PublicShare
            url={publicUrl}
            fileName={`pronostics-${c.slug}`}
            qrLabel={c.name}
              openCount={openCount}
          />
        </Card>
      )}

      <Card id="suivi" className="scroll-mt-24">
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
        <ContestAwardsList
          contestId={c.id}
          awards={awards}
          redeemers={redeemers}
        />
      )}

      {canViewPlayers && !finalized && c.status !== "draft" && (
        <ContestFinalizeCard contest={c} />
      )}

      <ContestDangerZone contest={c} />

      <RelanceErreur message={relanceError} />

      {capacites.canExplore && (
        <div id="relance" className="scroll-mt-24">
          <RelaunchFormulaCard
            sourceName={c.name}
            occasionLabel="la prochaine journée"
            sourceState={etatSourceRelance("pronostics", marqueurs)}
            canCreateDraft={peutCreerBrouillon}
            isSupported
            action={<RelaunchFormulaAction kind="pronostics" sourceId={c.id} />}
          />
        </div>
      )}
        </>
      )}
    </div>
  );
}
