"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateEventGame,
  updateEventQuestion,
  updateEventSession,
} from "@/actions/events";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSaveManuel } from "@/lib/use-auto-save-manuel";
import { CoquilleStudio } from "@/components/studio/coquille";
import { useEnregistrementDepuisEtat } from "@/components/studio/use-enregistrement-etat";
import { AtelierEventVerification } from "@/components/dashboard/atelier-event-verification";
import {
  EventGameStatusControls,
  type EditorQuestion,
  type EditorSession,
} from "@/components/dashboard/event-editor";
import type { EntreeActivationEvent } from "@/lib/activation/events";
import type { EventGameStatus } from "@/types/database";
import { ApercuSoiree } from "@/components/event/studio/apercu";
import { ChampsCachesSoiree } from "@/components/event/studio/champs-caches";
import {
  chargeRythmeEvenement,
  chargeSalleEvenement,
  etatInitialRythme,
  etatInitialSalle,
  etatInitialSoiree,
  type EtatRythme,
  type EtatSalle,
  type EtatSoiree,
} from "@/components/event/studio/etat";
import {
  ETAPES_STUDIO_SOIREE,
  parseEtapeStudioSoiree,
  type EtapeStudioSoiree,
} from "@/components/event/studio/etapes";
import {
  EtapeAcces,
  EtapeLot,
  EtapeNom,
  EtapeQuestions,
  EtapeRythme,
  EtapeSalles,
  SelecteurQuestion,
  SelecteurSalle,
  useSelectionParmi,
} from "@/components/event/studio/pages";

/**
 * LE STUDIO DE LA SOIRÉE (VIT-47) — l'écran de réglages, en voyant le téléphone
 * du client.
 *
 * ── CE QU'IL TIENT, ET RIEN D'AUTRE ──
 *
 * Trois choses : les états des réglages, les trois charges utiles de la soirée,
 * et l'étape affichée. La coquille, le fil d'étapes, le bandeau et
 * l'enregistrement automatique viennent du socle (`@/components/studio/`) ;
 * chaque étape vit dans `studio/pages.tsx`, l'aperçu dans `studio/apercu.tsx`.
 *
 * ── TROIS CANAUX D'ÉCRITURE, ET C'EST LE MODULE QUI L'IMPOSE (ADR-156) ──
 *
 *  · `updateEventGame(prev, FormData)` part par le `<form>` VIDE de la coquille,
 *    et l'enregistrement automatique du socle le déclenche par `requestSubmit` ;
 *  · `updateEventQuestion({ … })` et `updateEventSession({ … })` prennent des
 *    OBJETS typés — il n'y a aucun formulaire à soumettre. C'est exactement le
 *    cas pour lequel `useAutoSaveManuel` existe, et c'est déjà ainsi que
 *    l'atelier les appelle.
 *
 * Les fusionner aurait voulu dire réécrire trois actions serveur pour arranger
 * un écran. Ce qui est unifié, c'est ce qui doit l'être : une charge par chose,
 * construite à UN seul endroit (`studio/etat.ts`), quelle que soit l'étape.
 *
 * ── POURQUOI LES RÉGLAGES VIVENT DANS UNE CARTE PAR IDENTIFIANT ──
 *
 * Les questions et les salles se choisissent dans un sélecteur : l'état ne
 * concerne donc pas « la soirée » mais « la question ouverte ». Un état unique
 * ré-amorcé à chaque changement de sélection aurait fait partir un
 * enregistrement À CHAQUE bascule du sélecteur — `useAutoSaveManuel` s'arme sur
 * toute signature différente de la dernière enregistrée, et changer de question
 * en change une.
 *
 * La signature observée est donc la CARTE ENTIÈRE des réglages touchés :
 * choisir une autre question ne la modifie pas (rien n'a été saisi), saisir la
 * modifie. Et `enregistrerRythmes` ne poste que ce qui diffère de ce qui a déjà
 * été enregistré — sans quoi une frappe sur la question B republierait aussi la
 * question A, indéfiniment.
 */
const ID_FORMULAIRE = "studio-soiree-reglages";

/** Ce qui n'a jamais été touché n'est pas dans la carte : rien à envoyer. */
type CarteReglages<T> = Record<string, T>;

/**
 * LES ÉTATS DE REMPLACEMENT — quand il n'y a RIEN à choisir.
 *
 * Les étapes concernées rendent alors leur encart « rien à choisir » et ne
 * lisent aucune de ces valeurs. Elles n'existent que pour que le type reste
 * non-nul, et elles vivent ICI, nommées, plutôt que semées en littéral dans le
 * rendu : un défaut inventé au fil du JSX finit par être enregistré.
 */
const ETAT_VIDE_RYTHME: EtatRythme = { timeLimitSeconds: 20, pointsBase: 1000 };
const ETAT_VIDE_SALLE: EtatSalle = {
  label: "",
  rewardLabel: "",
  rewardDetails: "",
  rewardStock: "0",
  codeTtlDays: "",
};

export function EventStudio({
  gameId,
  gameName,
  status,
  questions,
  sessions,
  entreeVerification,
  organizationName,
  logoUrl,
  hrefJeu,
  peutEditer,
}: {
  gameId: string;
  gameName: string;
  status: EventGameStatus;
  questions: EditorQuestion[];
  sessions: EditorSession[];
  entreeVerification: EntreeActivationEvent;
  organizationName: string;
  logoUrl: string | null;
  /** Salle ouverte au joueur, `null` si aucune — passé tel quel à `VoirLeJeu`. */
  hrefJeu: string | null;
  peutEditer: boolean;
}) {
  const router = useRouter();
  const [etape, setEtape] = useState<EtapeStudioSoiree>(() =>
    parseEtapeStudioSoiree(null),
  );
  const [etat, setEtat] = useState<EtatSoiree>(() =>
    etatInitialSoiree(gameName),
  );

  const { selection: questionChoisie, setSelection: setQuestionChoisie } =
    useSelectionParmi(questions);
  const { selection: salleChoisie, setSelection: setSalleChoisie } =
    useSelectionParmi(sessions);

  const question = questions.find((q) => q.id === questionChoisie) ?? null;
  const salle = sessions.find((s) => s.id === salleChoisie) ?? null;

  const formulaire = useRef<HTMLFormElement | null>(null);
  /** Le conteneur que `useAutoSaveManuel` écoute pour vider sa file au
   *  `focusout` : il enveloppe TOUTES les étapes, donc il est toujours monté —
   *  posé sur le contenu d'une seule étape, l'écouteur ne se serait attaché
   *  qu'à celles ouvertes au moment où l'effet a couru. */
  const colonneReglages = useRef<HTMLDivElement | null>(null);

  const { state, pending, onSubmit } = useActionForm(updateEventGame, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  useEnregistrementDepuisEtat({
    valeur: etat.name,
    formulaire,
    actif: peutEditer,
  });

  // ── Le rythme des questions ──────────────────────────────
  const [rythmes, setRythmes] = useState<CarteReglages<EtatRythme>>({});
  const rythmesEnvoyes = useRef<CarteReglages<EtatRythme>>({});
  const [rythmeEnCours, setRythmeEnCours] = useState(false);
  const [rythmeErreur, setRythmeErreur] = useState<string | null>(null);
  const [rythmeReussi, setRythmeReussi] = useState(false);

  const rythme = question
    ? (rythmes[question.id] ?? etatInitialRythme(question))
    : null;

  const majRythme = (patch: Partial<EtatRythme>) => {
    if (!question) return;
    const base = rythmes[question.id] ?? etatInitialRythme(question);
    setRythmes((carte) => ({
      ...carte,
      [question.id]: { ...base, ...patch },
    }));
  };

  const parId = useMemo(
    () => new Map(questions.map((q) => [q.id, q])),
    [questions],
  );

  /**
   * N'ENVOIE QUE CE QUI A CHANGÉ DEPUIS LE DERNIER ENREGISTREMENT.
   *
   * La signature observée est la carte ENTIÈRE (voir l'en-tête) : sans ce
   * filtre, régler la question B republierait aussi la question A à chaque
   * frappe. Chaque charge est CONSTRUITE, jamais assemblée à la main — c'est
   * `chargeRythmeEvenement` qui garantit que le type, l'intitulé et la bonne
   * réponse repartent avec les deux nombres réglés ici.
   */
  const enregistrerRythmes = async (): Promise<boolean> => {
    const aEnvoyer = Object.entries(rythmes).filter(([id, valeur]) => {
      const dejaEnvoye = rythmesEnvoyes.current[id];
      return (
        !dejaEnvoye ||
        dejaEnvoye.timeLimitSeconds !== valeur.timeLimitSeconds ||
        dejaEnvoye.pointsBase !== valeur.pointsBase
      );
    });
    if (aEnvoyer.length === 0) return true;

    setRythmeEnCours(true);
    setRythmeErreur(null);
    try {
      for (const [id, valeur] of aEnvoyer) {
        const cible = parId.get(id);
        if (!cible) continue;
        const res = await updateEventQuestion(
          chargeRythmeEvenement(cible, valeur),
        );
        if (!res.ok) {
          setRythmeErreur(res.error);
          return false;
        }
        rythmesEnvoyes.current[id] = valeur;
      }
      setRythmeReussi(true);
      router.refresh();
      return true;
    } catch {
      setRythmeErreur("Enregistrement impossible, réessayez.");
      return false;
    } finally {
      setRythmeEnCours(false);
    }
  };

  const { enAttente: rythmeEnAttente, declencher: envoyerRythmes } =
    useAutoSaveManuel(colonneReglages, {
      signature: JSON.stringify(rythmes),
      enregistrer: enregistrerRythmes,
      actif: peutEditer,
      message: "Question enregistrée.",
    });

  // ── Le lot et l'étiquette des salles ─────────────────────
  const [salles, setSalles] = useState<CarteReglages<EtatSalle>>({});
  const sallesEnvoyees = useRef<CarteReglages<string>>({});
  const [salleEnCours, setSalleEnCours] = useState(false);
  const [salleErreur, setSalleErreur] = useState<string | null>(null);
  const [salleReussie, setSalleReussie] = useState(false);

  const etatSalle = salle
    ? (salles[salle.id] ?? etatInitialSalle(salle))
    : null;

  const majSalle = (patch: Partial<EtatSalle>) => {
    if (!salle) return;
    const base = salles[salle.id] ?? etatInitialSalle(salle);
    setSalles((carte) => ({ ...carte, [salle.id]: { ...base, ...patch } }));
  };

  /**
   * MÊME RÈGLE, ET UN PIÈGE DE PLUS.
   *
   * `updateEventSession` lit ses champs avec `input.X ?? ""` : une charge
   * partielle n'écrit pas « inchangé », elle écrit le vide — donc un stock à
   * zéro, donc « podium sans lot », en silence. `chargeSalleEvenement` rend
   * TOUJOURS les cinq champs, y compris l'échéance du code, dont l'ABSENCE de
   * la clé (et elle seule) signifie « ne touche pas ».
   */
  const enregistrerSalles = async (): Promise<boolean> => {
    const aEnvoyer = Object.entries(salles)
      .map(([id, valeur]) => [id, chargeSalleEvenement(id, valeur)] as const)
      .filter(
        ([id, charge]) =>
          sallesEnvoyees.current[id] !== JSON.stringify(charge),
      );
    if (aEnvoyer.length === 0) return true;

    setSalleEnCours(true);
    setSalleErreur(null);
    try {
      for (const [id, charge] of aEnvoyer) {
        const res = await updateEventSession(charge);
        if (!res.ok) {
          setSalleErreur(res.error);
          return false;
        }
        sallesEnvoyees.current[id] = JSON.stringify(charge);
      }
      setSalleReussie(true);
      router.refresh();
      return true;
    } catch {
      setSalleErreur("Enregistrement impossible, réessayez.");
      return false;
    } finally {
      setSalleEnCours(false);
    }
  };

  const { enAttente: salleEnAttente, declencher: envoyerSalles } =
    useAutoSaveManuel(colonneReglages, {
      signature: JSON.stringify(salles),
      enregistrer: enregistrerSalles,
      actif: peutEditer,
      message: "Salle enregistrée.",
    });

  /**
   * LE BOUTON « ENREGISTRER » VIDE AUSSI LES DEUX AUTRES FILES.
   *
   * Il ne cible, par `form=`, que le formulaire du nom : sans ces deux lignes,
   * un commerçant qui règle son stock, clique « Enregistrer » et quitte aussitôt
   * l'écran verrait `updateEventGame` partir — et son lot attendre un délai qui
   * n'arrivera jamais. C'est la promesse même du bouton dans un studio à
   * enregistrement automatique : « rien n'est en vol quand je pars ».
   *
   * CONDITIONNÉ à `enAttente`, et pas déclenché à chaque clic : `declencher`
   * FORCE l'envoi même sans changement, ce qui ferait reposter une question
   * depuis l'étape « Le nom » — et remonter, là, un refus que personne n'était
   * en train de provoquer.
   */
  const soumettreReglages = (event: React.FormEvent<HTMLFormElement>) => {
    if (rythmeEnAttente) envoyerRythmes();
    if (salleEnAttente) envoyerSalles();
    onSubmit(event);
  };

  const allerAuxQuestions = () => setEtape("questions");
  const allerAuxSalles = () => setEtape("salles");

  return (
    <CoquilleStudio
      titre="Mon studio — soirée"
      hrefRetour={`/dashboard/events/${gameId}`}
      idFormulaire={ID_FORMULAIRE}
      formulaire={formulaire}
      onSubmit={soumettreReglages}
      champsCaches={<ChampsCachesSoiree id={gameId} etat={etat} />}
      etapes={ETAPES_STUDIO_SOIREE}
      etape={etape}
      onEtape={setEtape}
      peutEditer={peutEditer}
      enregistrement={{
        // LES TROIS CANAUX, LUS ENSEMBLE : le commerçant n'a qu'un écran, il ne
        // doit pas avoir à deviner lequel des trois enregistrements parle.
        enCours: pending || rythmeEnCours || salleEnCours,
        reussi: state?.ok === true || rythmeReussi || salleReussie,
        erreur:
          state && !state.ok
            ? state.error
            : (rythmeErreur ?? salleErreur ?? undefined),
      }}
      outils={
        etape === "questions" || etape === "rythme" ? (
          <SelecteurQuestion
            questions={questions}
            selection={questionChoisie}
            onSelection={setQuestionChoisie}
          />
        ) : etape === "salles" || etape === "lot" || etape === "acces" ? (
          <SelecteurSalle
            sessions={sessions}
            selection={salleChoisie}
            onSelection={setSalleChoisie}
          />
        ) : null
      }
      apercu={
        <ApercuSoiree
          gameName={etat.name}
          organizationName={organizationName}
          logoUrl={logoUrl}
          question={question}
          rythme={rythme}
          salle={
            salle
              ? { joinCode: salle.joinCode, rewardStock: salle.rewardStock }
              : null
          }
          /* CE QU'ON REGARDE SUIT CE QU'ON RÈGLE : une question quand on écrit
             les manches, la salle d'attente quand on prépare l'affiche — c'est
             l'écran sur lequel le client tombe en scannant le QR. */
          phase={
            etape === "questions" || etape === "rythme" ? "question" : "lobby"
          }
        />
      }
    >
      <div ref={colonneReglages}>
        {etape === "nom" ? (
          <EtapeNom
            etat={etat}
            majEtat={(patch) => setEtat((e) => ({ ...e, ...patch }))}
            peutEditer={peutEditer}
          />
        ) : null}

        {etape === "questions" ? (
          <EtapeQuestions gameId={gameId} questions={questions} />
        ) : null}

        {etape === "rythme" ? (
          <EtapeRythme
            question={question}
            /* `question` nulle ⇒ l'étape rend son encart « rien à choisir » et
               ne lit pas ces valeurs. Elles n'existent que pour garder le type
               non-nul, jamais pour être écrites. */
            etat={rythme ?? ETAT_VIDE_RYTHME}
            majEtat={majRythme}
            peutEditer={peutEditer}
            onAllerAuxQuestions={allerAuxQuestions}
          />
        ) : null}

        {etape === "salles" ? (
          <EtapeSalles
            gameId={gameId}
            gameActive={status === "active"}
            sessions={sessions}
            selection={salleChoisie}
            onSelection={setSalleChoisie}
            etat={etatSalle ?? ETAT_VIDE_SALLE}
            majEtat={majSalle}
            peutEditer={peutEditer}
          />
        ) : null}

        {etape === "lot" ? (
          <EtapeLot
            salle={salle}
            etat={etatSalle ?? ETAT_VIDE_SALLE}
            majEtat={majSalle}
            peutEditer={peutEditer}
            onAllerAuxSalles={allerAuxSalles}
          />
        ) : null}

        {etape === "acces" ? (
          <EtapeAcces
            gameId={gameId}
            salle={salle}
            onAllerAuxSalles={allerAuxSalles}
          />
        ) : null}

        {etape === "verification" ? (
          <div className="space-y-4">
            <AtelierEventVerification
              gameId={gameId}
              entree={entreeVerification}
            />
            {/* LA PUBLICATION RESTE OÙ ELLE EST : cette carte porte le geste
                d'ouverture et son raccourci vers l'atelier, exactement comme sur
                la page de suivi. Le studio ne le duplique pas, il le montre. */}
            <EventGameStatusControls
              gameId={gameId}
              status={status}
              hrefJeu={hrefJeu}
            />
          </div>
        ) : null}
      </div>
    </CoquilleStudio>
  );
}
