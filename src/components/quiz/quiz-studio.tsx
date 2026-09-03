"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateQuiz, updateQuizReward } from "@/actions/quiz";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSaveManuel } from "@/lib/use-auto-save-manuel";
import { CoquilleStudio } from "@/components/studio/coquille";
import { useEnregistrementDepuisEtat } from "@/components/studio/use-enregistrement-etat";
import {
  QuizStatusControls,
  type DashboardQuiz,
  type DashboardQuizQuestion,
  type QuizWheelOption,
} from "@/components/dashboard/quiz-editor";
import { AtelierQuizVerification } from "@/components/dashboard/atelier-quiz-verification";
import type { EntreeVerificationQuiz } from "@/lib/activation/quiz";
import type { ActionResult } from "@/lib/utils";
import { ApercuQuiz } from "@/components/quiz/studio/apercu";
import { ChampsCachesQuiz } from "@/components/quiz/studio/champs-caches";
import {
  chargeDotationQuiz,
  etatInitialQuiz,
  type EtatQuiz,
} from "@/components/quiz/studio/etat";
import {
  ETAPES_STUDIO_QUIZ,
  parseEtapeStudioQuiz,
  type EtapeStudioQuiz,
} from "@/components/quiz/studio/etapes";
import {
  EtapeAllure,
  EtapeGain,
  EtapeLot,
  EtapeNom,
  EtapePartage,
  EtapeQuestionDetail,
  EtapeQuestions,
  SelecteurQuestion,
  useSelectionQuestion,
} from "@/components/quiz/studio/pages";

/**
 * LE STUDIO DU QUIZ (VIT-41) — l'écran de réglages, en voyant la question.
 *
 * ── CE QU'IL TIENT, ET RIEN D'AUTRE ──
 *
 * Trois choses : l'état des réglages, les deux charges utiles du quiz, et
 * l'étape affichée. La coquille, le fil d'étapes, le bandeau et
 * l'enregistrement automatique viennent du socle (`@/components/studio/`) ;
 * chaque étape vit dans `studio/pages.tsx`, l'aperçu dans `studio/apercu.tsx`.
 *
 * ── DEUX CANAUX D'ÉCRITURE, ET C'EST LE MODULE QUI L'IMPOSE ──
 *
 * Le quiz n'a pas UNE action d'écriture mais deux, de formes différentes :
 *
 *  · `updateQuiz(prev, FormData)` part par le `<form>` VIDE de la coquille, et
 *    l'enregistrement automatique du socle le déclenche par `requestSubmit` ;
 *  · `updateQuizReward({ … })` prend un OBJET typé — il n'y a aucun formulaire
 *    à soumettre. C'est exactement le cas pour lequel `useAutoSaveManuel`
 *    existe, et c'est déjà ainsi que l'atelier l'appelle.
 *
 * Les fusionner aurait voulu dire réécrire une action serveur pour arranger un
 * écran. Ce qui est fusionné, c'est ce qui doit l'être : l'ÉTAT. Une seule
 * source, deux départs, aucun champ qui dépend de l'étape ouverte.
 *
 * ── LES TROIS PIÈGES QUE CE FICHIER EXISTE POUR DÉSAMORCER ──
 *
 * 1. `updateQuiz` ÉCRASE `intro_text` quand le champ n'est pas rendu. La parade
 *    n'est pas une précaution mais la structure : aucun contrôle visible ne
 *    porte de `name`, et `ChampsCachesQuiz` rend la charge EN ENTIER à chaque
 *    rendu, quelle que soit l'étape ouverte.
 * 2. `updateQuizReward` est INDIVISIBLE : ses sept colonnes partent en bloc,
 *    avec un `superRefine` qui croise le mode et les champs. « Ce qu'on gagne »
 *    et « Le lot » sont donc deux VUES d'une seule charge, construite à un seul
 *    endroit par `chargeDotationQuiz` — jamais deux soumissions.
 * 3. `code_ttl_days` est lu par `formData.has()`, pas `get()` : le vide y est
 *    une valeur légitime (« sans limite »). Il est rendu par les champs cachés,
 *    et `CodeTtlDaysField` reçoit `champCache={false}` — sinon son champ
 *    vivrait dans une étape démontable et ne partirait jamais.
 *
 * ── ET UN QUATRIÈME QU'ON NE TOUCHE PAS ──
 *
 * `QuizShareSettings` garde son formulaire SÉPARÉ. Lui et `updateQuiz` écrivent
 * la même ligne `quizzes` : un champ commun ferait qu'enregistrer les réglages
 * réécrirait le drapeau de partage selon celui qui poste en dernier.
 */
const ID_FORMULAIRE = "studio-quiz-reglages";

export function QuizStudio({
  quiz,
  questions,
  roues,
  entreeVerification,
  publicUrl,
  peutEditer,
}: {
  quiz: DashboardQuiz;
  questions: DashboardQuizQuestion[];
  roues: QuizWheelOption[];
  entreeVerification: EntreeVerificationQuiz;
  /** Page publique, `null` tant que le quiz n'est pas ouvert. */
  publicUrl: string | null;
  peutEditer: boolean;
}) {
  const router = useRouter();
  const [etape, setEtape] = useState<EtapeStudioQuiz>(() =>
    parseEtapeStudioQuiz(null),
  );
  const [etat, setEtat] = useState<EtatQuiz>(() =>
    etatInitialQuiz(quiz, roues),
  );
  const { selection, setSelection } = useSelectionQuestion(questions);

  const formulaire = useRef<HTMLFormElement | null>(null);
  /** Le conteneur que `useAutoSaveManuel` écoute pour vider sa file au
   *  `focusout` : il enveloppe TOUTES les étapes, donc il est toujours monté —
   *  posé sur le contenu d'une seule étape, l'écouteur ne se serait attaché
   *  qu'à celles ouvertes au moment où l'effet a couru. */
  const colonneReglages = useRef<HTMLDivElement | null>(null);

  const { state, pending, onSubmit } = useActionForm(updateQuiz, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  /**
   * LA SIGNATURE, ET NON L'OBJET D'ÉTAT.
   *
   * `useEnregistrementDepuisEtat` relance son minuteur à chaque NOUVELLE
   * référence. Lui passer `etat` ferait repartir le minuteur à chaque rendu du
   * studio — y compris ceux provoqués par la saisie de la DOTATION, qui ne
   * concerne pas cette action — et `updateQuiz` partirait tout seul sans que
   * rien de sa charge n'ait bougé. La chaîne mémoïsée ne change que lorsque
   * l'un des cinq champs change vraiment.
   */
  const signatureReglages = useMemo(
    () =>
      JSON.stringify([
        etat.name,
        etat.theme,
        etat.public_slug,
        etat.intro_text,
        etat.code_ttl_days,
      ]),
    [
      etat.name,
      etat.theme,
      etat.public_slug,
      etat.intro_text,
      etat.code_ttl_days,
    ],
  );

  useEnregistrementDepuisEtat({
    valeur: signatureReglages,
    formulaire,
    actif: peutEditer,
  });

  // ── La dotation : un seul envoi, depuis un seul état ──
  const [dotationEnCours, setDotationEnCours] = useState(false);
  const [dotationResultat, setDotationResultat] = useState<ActionResult | null>(
    null,
  );

  const enregistrerDotation = async (): Promise<boolean> => {
    setDotationEnCours(true);
    setDotationResultat(null);
    try {
      const res = await updateQuizReward(chargeDotationQuiz(quiz.id, etat));
      setDotationResultat(res);
      // Le stock restant et le verdict de la vérification suivent la prop
      // serveur : sans rafraîchissement, l'étape « On vérifie » resterait sur
      // la dotation d'avant.
      if (res.ok) router.refresh();
      return res.ok;
    } catch {
      setDotationResultat({
        ok: false,
        error: "Enregistrement impossible, réessayez.",
      });
      return false;
    } finally {
      setDotationEnCours(false);
    }
  };

  const { enAttente: dotationEnAttente, declencher: envoyerDotation } =
    useAutoSaveManuel(colonneReglages, {
      // LES SEPT CHAMPS, TOUJOURS — c'est la signature de la charge
      // INDIVISIBLE, pas celle de l'étape ouverte. Régler le stock renvoie donc
      // aussi le mode, et c'est ce que le `superRefine` exige.
      signature: JSON.stringify(chargeDotationQuiz(quiz.id, etat)),
      enregistrer: enregistrerDotation,
      actif: peutEditer,
    });

  /**
   * LE BOUTON « ENREGISTRER » VIDE AUSSI LA FILE DE LA DOTATION.
   *
   * Il ne cible, par `form=`, que le formulaire des réglages : sans cette
   * ligne, un commerçant qui règle son stock, clique « Enregistrer » et quitte
   * aussitôt l'écran verrait `updateQuiz` partir — et sa dotation attendre un
   * délai qui n'arrivera jamais. C'est la promesse même du bouton dans un
   * studio à enregistrement automatique : « rien n'est en vol quand je pars ».
   *
   * CONDITIONNÉ à `enAttente`, et pas déclenché à chaque clic : `declencher`
   * FORCE l'envoi même sans changement, ce qui ferait poster la dotation depuis
   * « Le nom » — et remonter, là, le refus d'une dotation incomplète que
   * personne n'était en train de régler.
   */
  const soumettreReglages = (event: React.FormEvent<HTMLFormElement>) => {
    if (dotationEnAttente) envoyerDotation();
    onSubmit(event);
  };

  const majEtat = (patch: Partial<EtatQuiz>) =>
    setEtat((e) => ({ ...e, ...patch }));

  const proprietes = { etat, majEtat, peutEditer };
  const roueDisparue =
    quiz.targetWheelId !== null &&
    !roues.some((r) => r.id === quiz.targetWheelId);

  return (
    <CoquilleStudio
      titre="Mon studio — quiz"
      hrefRetour={`/dashboard/quiz/${quiz.id}`}
      idFormulaire={ID_FORMULAIRE}
      formulaire={formulaire}
      onSubmit={soumettreReglages}
      champsCaches={<ChampsCachesQuiz id={quiz.id} etat={etat} />}
      etapes={ETAPES_STUDIO_QUIZ}
      etape={etape}
      onEtape={setEtape}
      peutEditer={peutEditer}
      enregistrement={{
        // LES DEUX CANAUX, LUS ENSEMBLE : le commerçant n'a qu'un écran, il ne
        // doit pas avoir à deviner lequel des deux enregistrements parle.
        enCours: pending || dotationEnCours,
        reussi: state?.ok === true || dotationResultat?.ok === true,
        erreur:
          state && !state.ok
            ? state.error
            : dotationResultat && !dotationResultat.ok
              ? dotationResultat.error
              : undefined,
      }}
      outils={
        <SelecteurQuestion
          questions={questions}
          selection={selection}
          onSelection={setSelection}
        />
      }
      apercu={
        <ApercuQuiz etat={etat} questions={questions} selection={selection} />
      }
    >
      <div ref={colonneReglages}>
        {etape === "nom" ? <EtapeNom {...proprietes} /> : null}
        {etape === "allure" ? <EtapeAllure {...proprietes} /> : null}
        {etape === "questions" ? (
          <EtapeQuestions quizId={quiz.id} questions={questions} />
        ) : null}
        {etape === "question" ? (
          <EtapeQuestionDetail
            quizId={quiz.id}
            questions={questions}
            selection={selection}
            onAllerAuxQuestions={() => setEtape("questions")}
          />
        ) : null}
        {etape === "gain" ? <EtapeGain {...proprietes} /> : null}
        {etape === "lot" ? (
          <EtapeLot
            {...proprietes}
            roues={roues}
            roueDisparue={roueDisparue}
            lotsDejaRemis={quiz.rewardClaimedCount}
          />
        ) : null}
        {etape === "partage" ? <EtapePartage quiz={quiz} /> : null}
        {etape === "verification" ? (
          <div className="space-y-4">
            <AtelierQuizVerification
              quizId={quiz.id}
              entree={entreeVerification}
            />
            <QuizStatusControls quiz={quiz} hrefJeu={publicUrl} />
          </div>
        ) : null}
      </div>
    </CoquilleStudio>
  );
}
