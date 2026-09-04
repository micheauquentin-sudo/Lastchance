"use client";

import { useMemo, useRef, useState } from "react";
import { updateContest } from "@/actions/pronostics";
import { useActionForm } from "@/lib/use-action-form";
import { CoquilleStudio } from "@/components/studio/coquille";
import { useEnregistrementDepuisEtat } from "@/components/studio/use-enregistrement-etat";
import { ttlContestEditable } from "@/components/pronos/contest-code-ttl";
import { ApercuContest } from "@/components/pronos/studio/apercu";
import { ChampsCachesContest } from "@/components/pronos/studio/champs-caches";
import {
  etatInitialContest,
  reglagesEditablesContest,
  type EtatContest,
} from "@/components/pronos/studio/etat";
import {
  ETAPES_STUDIO_CONTEST,
  parseEtapeStudioContest,
  type EtapeStudioContest,
} from "@/components/pronos/studio/etapes";
import {
  AvertissementQuestions,
  EtapeAllure,
  EtapeBaremeSansMatiere,
  EtapeInscription,
  EtapeNom,
  OuVaLeReste,
} from "@/components/pronos/studio/pages";
import { ContestMatchList } from "@/components/dashboard/contest-matches";
import {
  ContestQuestionsCard,
  type DashboardQuestion,
} from "@/components/dashboard/contest-questions";
import {
  ContestEventCard,
  ContestRewardsEditor,
  ContestScoringForm,
  ContestStatusControls,
  ContestTiebreakerCard,
  LockedNotice,
} from "@/components/dashboard/contest-settings";
import { AtelierContestVerification } from "@/components/dashboard/atelier-contest-verification";
import type { EntreeVerificationContest } from "@/lib/activation/pronostics";
import type { Competition } from "@/lib/competitions";
import type { ContestQuestionType, ContestReward, ContestScoring } from "@/lib/pronostics";
import type { Contest, ContestMatch } from "@/types/database";

/**
 * LE STUDIO DU CHAMPIONNAT (VIT-43) — l'écran de préparation, en voyant la page
 * du joueur.
 *
 * ── CE QU'IL TIENT, ET RIEN D'AUTRE ──
 *
 * Trois choses : l'état des six réglages d'`updateContest`, l'étape affichée, et
 * l'assemblage. La coquille, le fil d'étapes, le bandeau et l'enregistrement
 * automatique viennent du socle (`@/components/studio/`) ; le contenu des trois
 * premières étapes vit dans `studio/pages.tsx`, l'aperçu dans `studio/apercu.tsx`.
 *
 * ── TROIS FORMULAIRES DEVIENNENT UNE CHARGE — CINQ RESTENT SÉPARÉS ──
 *
 * `updateContest` est le seul schéma de mise à jour PARTIELLE de ce module, et
 * l'atelier s'en sert avec trois formulaires discriminés par des champs cachés.
 * Le studio les fusionne en UNE charge utile complète, rendue depuis l'état à
 * chaque rendu : c'est ce qui rend « Le nom », « Ce que je demande à
 * l'inscription » et « L'allure » séparables sans qu'aucune colonne s'efface
 * par absence (voir `champs-caches.tsx`).
 *
 * Les CINQ autres actions gardent leur formulaire, et ce n'est pas un
 * demi-travail : `updateContestScoring`, `updateContestGenericScoring`,
 * `updateContestRewards`, `updateContestTiebreaker` et
 * `updateContestEventSettings` passent chacune par une RPC GARDÉE qui exige un
 * MOTIF journalisé dès que le championnat est verrouillé. Les fusionner aurait
 * voulu dire réécrire cinq actions serveur pour arranger un écran — et faire
 * partir un motif d'audit à la dixième frappe, tronqué au milieu d'une phrase.
 *
 * ── LE GEL EST LE POINT DÉLICAT DE CE MODULE ──
 *
 * Un studio enregistre en continu ; ce module, lui, a deux états où l'écriture
 * cesse d'être anodine — `locked` (le jeu a commencé) et `finalized` (le
 * championnat est clos). `reglagesEditablesContest` rend un SEUL verdict, et
 * c'est celui que reçoit `CoquilleStudio` : gelé, l'écran n'affiche ni
 * « Enregistrement automatique » ni bouton « Enregistrer », et les champs sont
 * désactivés. Un écran qui annoncerait l'automatisme sans le faire serait le
 * défaut d'ADR-153 pris par l'autre bout ; celui-ci dit ce qui se passe, et
 * `studio-charge.test.tsx` rougit si l'automatisme repart.
 *
 * ── PAS DE SYNCHRO DE CALENDRIER ICI, ET C'EST DÉLIBÉRÉ ──
 *
 * La page du tableau de bord déclenche `syncContestFixtures` dans un `after()`
 * AU RENDU, quand un match auto vient de se terminer. Cette page-ci ne le fait
 * pas : chacune de ses écritures revalide `/studio/pronostics/${id}` — c'est
 * tout l'objet des jumeaux de revalidation — donc le studio se re-rend à chaque
 * enregistrement automatique. Reproduire l'`after()` ferait appeler le
 * fournisseur de calendriers à chaque frappe débouclée, sur un écran qui ne
 * sert pas à lire les résultats. La synchro reste au suivi, au cron, et au
 * bouton « Synchroniser » de l'étape « Les matchs ».
 */
const ID_FORMULAIRE = "studio-contest-reglages";

export function ContestStudio({
  contest,
  matchs,
  questions,
  questionTypes,
  scoring,
  rewards,
  competition,
  organisation,
  icone,
  sousTitre,
  timeZone,
  entreeVerification,
  publicUrl,
  locked,
  finalized,
  peutEditer,
  isFootball,
  autoCompetition,
  baremeAMatiere,
}: {
  contest: Contest;
  /** Les lignes de type `score` — le football, inchangé. */
  matchs: ContestMatch[];
  questions: DashboardQuestion[];
  /** Types RÉELLEMENT présents : pilote les blocs du barème. */
  questionTypes: ContestQuestionType[];
  scoring: ContestScoring;
  rewards: ContestReward[];
  competition: Competition;
  organisation: { name: string; logoUrl: string | null };
  icone: string;
  sousTitre: string | null;
  timeZone: string;
  entreeVerification: EntreeVerificationContest;
  /** Page publique, `null` tant que le championnat est en brouillon. */
  publicUrl: string | null;
  /** RPC `contest_is_locked` : premier pronostic déposé ou coup d'envoi passé. */
  locked: boolean;
  finalized: boolean;
  peutEditer: boolean;
  isFootball: boolean;
  /** Calendrier synchronisé : aucun formulaire d'ajout de match. */
  autoCompetition: boolean;
  /** Le barème a-t-il de la matière ? Faux = étape sans palier à régler. */
  baremeAMatiere: boolean;
}) {
  const [etape, setEtape] = useState<EtapeStudioContest>(() =>
    parseEtapeStudioContest(null),
  );
  const [etat, setEtat] = useState<EtatContest>(() =>
    etatInitialContest(contest),
  );

  const formulaire = useRef<HTMLFormElement | null>(null);
  const { state, pending, onSubmit } = useActionForm(updateContest, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  // LE VERDICT UNIQUE DU GEL — lu par la coquille, par les champs et par
  // l'enregistrement automatique. Trois lectures d'une seule vérité.
  const reglagesEditables = reglagesEditablesContest({
    peutEditer,
    locked,
    finalized,
  });
  const ttlEditable = ttlContestEditable(contest.code_ttl_seconds);

  /**
   * LA SIGNATURE, ET NON L'OBJET D'ÉTAT.
   *
   * `useEnregistrementDepuisEtat` relance son minuteur à chaque NOUVELLE
   * référence. Lui passer `etat` ferait repartir le minuteur à chaque rendu du
   * studio — y compris ceux provoqués par la revalidation d'une des cinq autres
   * actions — et `updateContest` partirait sans que rien de sa charge n'ait
   * bougé. La chaîne mémoïsée ne change que lorsque l'un des six champs change
   * vraiment.
   */
  const signature = useMemo(
    () =>
      JSON.stringify([
        etat.name,
        etat.collect_email,
        etat.collect_phone,
        etat.theme,
        etat.fond_key,
        etat.code_ttl_days,
      ]),
    [
      etat.name,
      etat.collect_email,
      etat.collect_phone,
      etat.theme,
      etat.fond_key,
      etat.code_ttl_days,
    ],
  );

  useEnregistrementDepuisEtat({
    valeur: signature,
    formulaire,
    actif: reglagesEditables,
  });

  const majEtat = (patch: Partial<EtatContest>) =>
    setEtat((e) => ({ ...e, ...patch }));

  const proprietes = { etat, majEtat, peutEditer: reglagesEditables };
  const hrefSuivi = `/dashboard/pronostics/${contest.id}`;

  /**
   * LE BANDEAU DU GEL, SUR LES TROIS ÉTAPES QUE `updateContest` PORTE.
   *
   * `LockedNotice` est la phrase que l'atelier affiche déjà ; elle est reprise
   * telle quelle, et complétée d'un point que l'atelier n'a pas à dire : ici,
   * l'enregistrement automatique s'est ARRÊTÉ. Sans cette seconde phrase, le
   * commerçant lirait « toute modification exige un motif » sur un écran qui ne
   * lui propose aucun champ « motif » — parce qu'il n'y en a pas : ce studio
   * n'écrit plus du tout, et les corrections motivées se font au tableau de
   * bord.
   */
  const bandeauGel =
    peutEditer && !reglagesEditables ? (
      <div>
        <LockedNotice finalized={finalized} />
        <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
          Ces réglages ne s&apos;enregistrent plus tout seuls ici.{" "}
          <a
            href={hrefSuivi}
            className="font-bold underline underline-offset-2 hover:text-k-ink"
          >
            Le suivi du championnat
          </a>{" "}
          garde les corrections encore possibles, chacune par un clic et un
          motif journalisé.
        </p>
      </div>
    ) : null;

  return (
    <CoquilleStudio
      titre="Mon studio — championnat"
      hrefRetour={hrefSuivi}
      idFormulaire={ID_FORMULAIRE}
      formulaire={formulaire}
      onSubmit={onSubmit}
      champsCaches={
        <ChampsCachesContest
          id={contest.id}
          etat={etat}
          ttlEditable={ttlEditable}
        />
      }
      etapes={ETAPES_STUDIO_CONTEST}
      etape={etape}
      onEtape={setEtape}
      peutEditer={reglagesEditables}
      enregistrement={{
        enCours: pending,
        reussi: state?.ok === true,
        erreur: state && !state.ok ? state.error : undefined,
      }}
      apercu={
        <ApercuContest
          etat={etat}
          organisation={organisation}
          icone={icone}
          sousTitre={sousTitre}
          nbMatchsOuverts={matchs.length + questions.length}
          hrefSuivi={hrefSuivi}
        />
      }
    >
      {etape === "nom" ? (
        <div className="space-y-4">
          {bandeauGel}
          <EtapeNom {...proprietes} />
        </div>
      ) : null}

      {etape === "inscription" ? (
        <div className="space-y-4">
          {bandeauGel}
          <EtapeInscription
            {...proprietes}
            ttlEditable={ttlEditable}
            ttlStocke={contest.code_ttl_seconds}
          />
        </div>
      ) : null}

      {etape === "allure" ? (
        <div className="space-y-4">
          {bandeauGel}
          <EtapeAllure {...proprietes} />
        </div>
      ) : null}

      {etape === "matchs" ? (
        <div className="space-y-6">
          <p className="rounded-2xl border-2 border-k-ink/25 bg-white p-4 text-sm font-semibold text-k-body">
            {autoCompetition
              ? "Votre calendrier arrive tout seul : les rencontres sont importées depuis la compétition, chaque nuit, et les résultats avec elles. Rien à saisir ici — vérifiez, ou relancez la synchronisation si une rencontre manque."
              : isFootball
                ? "Vous saisissez vous-même les rencontres, une par une ou en bloc. Chaque match ferme automatiquement à son coup d'envoi, et vous saisirez le résultat depuis le suivi du championnat."
                : "Cet événement ne repose pas sur des rencontres : les affrontements n'apparaissent ici que si vous en avez ajouté. Sinon, passez directement aux questions."}
          </p>

          {(isFootball || matchs.length > 0) && (
            /* `saisieResultat={false}` : saisir un résultat VERROUILLE les
               pronostics du match et recalcule le classement public en direct.
               C'est de l'exploitation, pas de la préparation — et sa place est
               le suivi, pas un fil qu'on parcourt en réglant des couleurs. */
            <ContestMatchList
              matches={matchs}
              contestId={contest.id}
              competition={competition}
              timeZone={timeZone}
              saisieResultat={false}
            />
          )}

          <ContestEventCard
            contest={contest}
            locked={locked}
            timeZone={timeZone}
          />
        </div>
      ) : null}

      {etape === "questions" ? (
        <div className="space-y-6">
          <AvertissementQuestions />
          <ContestQuestionsCard
            contestId={contest.id}
            questions={questions}
            defaultLocksAt={contest.default_locks_at}
            timeZone={timeZone}
            eventKind={contest.event_kind}
            saisieResultat={false}
          />
        </div>
      ) : null}

      {etape === "subsidiaire" ? (
        <ContestTiebreakerCard contest={contest} locked={locked} />
      ) : null}

      {etape === "bareme" ? (
        baremeAMatiere ? (
          <ContestScoringForm
            contestId={contest.id}
            scoring={scoring}
            questionTypes={questionTypes}
            eventKind={contest.event_kind}
            locked={locked}
            finalized={finalized}
          />
        ) : (
          <EtapeBaremeSansMatiere
            onAllerAuxQuestions={() => setEtape("questions")}
          />
        )
      ) : null}

      {etape === "lots" ? (
        <div className="space-y-6">
          <ContestRewardsEditor
            contestId={contest.id}
            rewards={rewards}
            locked={locked}
            finalized={finalized}
          />
          <AtelierContestVerification entree={entreeVerification} />
          <ContestStatusControls contest={contest} hrefJeu={publicUrl} />
          <OuVaLeReste hrefSuivi={hrefSuivi} />
        </div>
      ) : null}
    </CoquilleStudio>
  );
}
