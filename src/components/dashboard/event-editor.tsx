"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { salleOuverteAuJoueur } from "@/lib/event";
import { annoncerToast } from "@/lib/toast-bus";
import {
  createEventQuestion,
  createEventSession,
  deleteEventGame,
  deleteEventQuestion,
  deleteEventSession,
  setEventGameStatus,
  updateEventGame,
  updateEventQuestion,
  updateEventSession,
} from "@/actions/events";
import { Button } from "@/components/ui/button";
import { Card, TITRE_CARTE } from "@/components/ui/card";
import {
  CodeTtlDaysField,
  codeTtlDaysInitial,
} from "@/components/dashboard/code-ttl-days-field";
import { GenerateurQuestions } from "@/components/dashboard/generateur-questions";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { hrefEtapeEvenement } from "@/components/dashboard/atelier-event-etapes";
import { CarteStatutAnimation } from "@/components/dashboard/carte-statut-animation";
import { EventStatusBadge } from "@/components/dashboard/event-status";
import { RaccourciAtelier, VoirLeJeu } from "@/components/dashboard/atelier-raccourci";
import { PublicShare } from "@/components/dashboard/public-share";
import { FieldError, Input, Label } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
import { AutoSaveEtat } from "@/components/dashboard/auto-save-etat";
import {
  EVENT_ANSWER_MEANING_HINT,
  EVENT_QUESTION_LOSS_HINT,
  EVENT_SESSION_LOSS_HINT,
} from "@/lib/validations/events";
import type {
  EventGameStatus,
  EventQuestionType,
  EventSessionStatus,
} from "@/types/database";
import {
  EVENT_QUESTION_TYPES,
  eventQuestionTypeMeta,
} from "@/components/event/event-view-state";

const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

/**
 * CE QUI VIENT D'ÊTRE CRÉÉ, ET QUE LE SERVEUR N'A PAS ENCORE RENVOYÉ.
 *
 * Ces deux formulaires rechargeaient la page entière (`window.location.reload`)
 * après un enregistrement. C'était délibéré : `router.refresh()` a été mesuré
 * défaillant ~5 % du temps (docs/bugs.md) et il était ici le SEUL moyen de
 * montrer le résultat — les listes viennent du serveur, sans état local, et ces
 * formulaires n'avaient aucun accusé de succès. Sans rien à l'écran, le
 * commerçant ressaisissait : question dupliquée lançable deux fois en soirée,
 * sessions `draft` fantômes avec leur code et leur stock.
 *
 * Le rechargement réglait le symptôme au prix d'un saut complet — position
 * perdue, blocs repliés, écran qui clignote à chaque validation.
 *
 * Ce qui le remplace tient en deux garanties, et non une :
 *   1. un TOAST annonce l'enregistrement, indépendamment de tout rendu ;
 *   2. la ligne créée s'affiche ICI, en local, jusqu'à ce que le serveur la
 *      renvoie.
 *
 * Le recouvrement ne vit QUE le temps d'un rafraîchissement manqué : l'arrivée
 * d'une nouvelle liste serveur l'efface en bloc. Modèle repris de
 * `moderationsLocales` dans `event-remote.tsx`, pas inventé ici.
 */
export interface AjoutEnAttente {
  id: string;
  titre: string;
}

function useAjoutsEnAttente(listeServeur: unknown) {
  const [ajouts, setAjouts] = useState<AjoutEnAttente[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'arrivée d'une nouvelle liste serveur EST l'événement ; rien d'autre ne la signale.
    setAjouts((liste) => (liste.length === 0 ? liste : []));
  }, [listeServeur]);
  const noter = (ajout?: AjoutEnAttente) => {
    if (ajout) setAjouts((liste) => [...liste, ajout]);
  };
  return { ajouts, noter };
}

/** La ligne d'attente : elle dit que c'est enregistré, sans se faire passer
 *  pour la vraie ligne — celle-ci arrive avec le rafraîchissement. */
function LigneAjoutee({ titre }: { titre: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-k-green/70 bg-k-green/10 p-4">
      <p className="font-black text-k-ink">{titre}</p>
      <p className="mt-1 text-sm font-bold text-k-body">
        Enregistré — la liste se met à jour…
      </p>
    </div>
  );
}

export interface EditorOption {
  id: string;
  label: string;
  isCorrect: boolean;
}

export interface EditorQuestion {
  id: string;
  position: number;
  questionType: EventQuestionType;
  prompt: string;
  timeLimitSeconds: number;
  pointsBase: number;
  options: EditorOption[];
}

export interface EditorSession {
  id: string;
  label: string | null;
  joinCode: string;
  /**
   * URL publique ABSOLUE de la page joueur (`${APP_URL}/event/[join_code]`),
   * calculée côté page RSC : ce composant est client et n'a pas accès à
   * APP_URL.
   */
  publicUrl: string;
  /**
   * Nombre de CHARGEMENTS de la page publique de la session, lu par la page
   * RSC (le composant est client et ne peut pas interroger la base). Pas un
   * nombre de participants distincts.
   */
  openCount: number;
  status: EventSessionStatus;
  rewardLabel: string;
  rewardDetails: string | null;
  rewardStock: number;
  rewardClaimedCount: number;
  /** Validité du code EVENT- émis, en jours (null = sans limite). */
  codeTtlDays: number | null;
}

// ════════════════════════════════════════════════════════════
// Réglages du jeu (nom, statut, suppression)
// ════════════════════════════════════════════════════════════

/**
 * LE GESTE DE PUBLICATION, SORTI DE LA CARTE DE RÉGLAGES.
 *
 * Il était mêlé au champ « Nom du jeu », dans la même carte : sur les sept
 * autres modules, il a sa carte propre, juste sous la Carte de l'Aventure. Un
 * seul endroit pour un seul geste, quel que soit le module.
 */
/** Ce qui est vrai maintenant — les trois états de la soirée, côté client. */
const PHRASE_ETAT: Record<EventGameStatus, string> = {
  draft:
    "Le jeu n'est pas ouvert : aucune session en direct ne peut accueillir de joueur.",
  active: "Le jeu est ouvert : vous pouvez lancer des sessions en direct.",
  archived:
    "Le jeu est clôturé : plus aucune session ne s'ouvre, et les codes déjà gagnés restent retirables.",
};

export function EventGameStatusControls({
  gameId,
  status,
  hrefJeu = null,
}: {
  gameId: string;
  status: EventGameStatus;
  /** Salle la plus récente côté joueur, `null` si aucune session. */
  hrefJeu?: string | null;
}) {
  const {
    state: statusState,
    pending: statusPending,
    onSubmit: statusSubmit,
  } = useActionForm(setEventGameStatus, {
    // Même motif que les cinq autres bascules : le badge d'état et le lien
    // vers la télécommande suivent la prop serveur. Un animateur qui lance sa
    // soirée doit voir que l'événement est EN LIGNE — c'est de là qu'il pilote.
    reloadOnSuccess: true,
  });

  return (
    <CarteStatutAnimation
      titre="Statut du jeu"
      badge={<EventStatusBadge status={status} />}
      phrase={PHRASE_ETAT[status] ?? PHRASE_ETAT.draft}
      actions={
        status !== "active" ? (
          <form onSubmit={statusSubmit}>
            <input type="hidden" name="id" value={gameId} />
            <input type="hidden" name="status" value="active" />
            <Button type="submit" disabled={statusPending}>
              {statusPending ? "…" : "Ouvrir aux joueurs"}
            </Button>
          </form>
        ) : (
          <form onSubmit={statusSubmit}>
            <input type="hidden" name="id" value={gameId} />
            <input type="hidden" name="status" value="archived" />
            <Button type="submit" variant="secondary" disabled={statusPending}>
              {statusPending ? "…" : "Clôturer"}
            </Button>
          </form>
        )
      }
      raccourcis={
        <>
          <RaccourciAtelier href={hrefEtapeEvenement(gameId, "jeu")} />
          <VoirLeJeu href={hrefJeu} />
        </>
      }
      notes={
        /* Ce paragraphe ne calcule RIEN : le composant ne reçoit même pas le
           nombre de questions. L'étape « La vérification » de l'atelier le
           calcule, sur le module que le serveur oppose lui-même. */
        status !== "active" ? (
          <p className="mt-2 text-xs font-bold text-k-body">
            Ajoutez au moins une question, puis ouvrez le jeu aux joueurs pour
            pouvoir lancer une session en direct.{" "}
            <Link
              href={hrefEtapeEvenement(gameId, "verification")}
              className="font-bold text-k-ink underline underline-offset-2"
            >
              Voir ce qu&apos;il manque
            </Link>
          </p>
        ) : null
      }
      erreur={statusState && !statusState.ok ? statusState.error : undefined}
    />
  );
}

export function EventGameSettings({
  gameId,
  name,
}: {
  gameId: string;
  name: string;
}) {
  // useActionForm et non useActionState : l'état de chargement doit retomber
  // même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
  const {
    state: nameState,
    pending: namePending,
    onSubmit: nameSubmit,
  } = useActionForm(updateEventGame, {
    networkError: "Enregistrement impossible, réessayez.",
    // Sans bouton à regarder, l'accusé de réception d'un enregistrement
    // automatique n'a plus d'autre endroit où vivre.
    toastOnSuccess: "Enregistré.",
  });
  /**
   * Le NOM SEULEMENT. La suppression du jeu, juste en dessous, garde son
   * double geste manuel : rien de destructif ne part sur un délai.
   */
  const nameFormRef = useRef<HTMLFormElement>(null);
  const nameAutoSave = useAutoSave(nameFormRef);
  /**
   * `deleteEventGame` RESTE en `useActionState` : l'action se termine par un
   * `redirect("/dashboard/events")`. Appelée impérativement, le `NEXT_REDIRECT`
   * qu'elle lève serait capté par le `catch` du hook — le commerçant lirait une
   * erreur sur une suppression pourtant faite, et resterait sur la page d'un jeu
   * qui n'existe plus. La navigation démonte de toute façon la frontière : le
   * défaut de transition figée est ici sans objet.
   */
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteEventGame,
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Card className="space-y-6">
      <form
        ref={nameFormRef}
        onSubmit={nameSubmit}
        className="flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="id" value={gameId} />
        <div className="max-w-sm">
          <Label htmlFor="event-game-name">Nom du jeu</Label>
          <Input
            id="event-game-name"
            name="name"
            defaultValue={name}
            required
            maxLength={120}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={namePending}>
          {namePending ? "…" : "Enregistrer"}
        </Button>
        {nameState?.ok && (
          <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
        )}
        <AutoSaveEtat
          {...nameAutoSave}
          messageBloque="Non enregistré : le nom du jeu ne peut pas être vide."
        />
        <FieldError message={nameState && !nameState.ok ? nameState.error : undefined} />
      </form>

      <InfoBulle id="aide-event-nom" resume="Où ce nom sera-t-il lu ?">
        Il s&apos;affiche en haut de l&apos;écran de salle et sur le téléphone
        des joueurs pendant toute la soirée : nommez la soirée telle que vous
        l&apos;annoncez à vos clients, pas d&apos;après votre organisation
        interne. Il se change à tout moment, même une fois le jeu ouvert.
      </InfoBulle>

      <div className="border-t border-zinc-100 pt-4">
        {confirmDelete ? (
          <form action={deleteAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={gameId} />
            <span className="text-sm text-k-body">
              Supprimer ce jeu, ses questions et ses sessions ?
            </span>
            <Button type="submit" variant="danger" disabled={deletePending}>
              {deletePending ? "Suppression…" : "Confirmer"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={deletePending}
            >
              Annuler
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            onClick={() => setConfirmDelete(true)}
          >
            Supprimer le jeu
          </Button>
        )}
        <FieldError
          message={deleteState && !deleteState.ok ? deleteState.error : undefined}
        />
      </div>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════
// Questions
// ════════════════════════════════════════════════════════════

export function EventQuestionsSection({
  gameId,
  questions,
}: {
  gameId: string;
  questions: EditorQuestion[];
}) {
  const [adding, setAdding] = useState(false);
  const { ajouts, noter } = useAjoutsEnAttente(questions);

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className={TITRE_CARTE}>
          Questions
        </h2>
        {!adding && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            + Ajouter une question
          </Button>
        )}
      </div>
      <p className="mb-4 text-sm text-zinc-500">
        Trois types : <strong>quiz</strong> (une bonne réponse, points à la
        rapidité), <strong>sondage</strong> (pas de bonne réponse, répartition en
        direct) et <strong>pronostic</strong> (bonne réponse désignée en direct au
        moment de révéler).
      </p>

      <GenerateurQuestions
        cible="evenement"
        cibleId={gameId}
        promptsExistants={questions.map((q) => q.prompt)}
      />

      <div className="mb-4">
        <InfoBulle
          id="aide-event-manches"
          resume="Puis-je modifier une question une fois la soirée commencée ?"
        >
          Tant que personne n&apos;a répondu, oui, sans réserve. Dès qu&apos;une
          réponse existe, trois changements sont refusés puis reproposés avec une
          case à cocher : ajouter ou retirer une option, changer la bonne réponse
          ou le type, et intervertir deux libellés — chacun réécrirait le sens de
          réponses déjà données, donc le classement de la soirée. Corriger une
          coquille n&apos;est jamais concerné.
        </InfoBulle>
      </div>

      {adding && (
        <div className="mb-4">
          <QuestionForm
            gameId={gameId}
            onDone={(ajout) => {
              setAdding(false);
              noter(ajout);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {/* `ajouts` COMPTE AUTANT QUE LA LISTE SERVEUR dans ce test : sans lui,
          « Aucune question. Ajoutez-en une pour commencer. » se réafficherait
          juste après une création réussie — la phrase même qui faisait
          ressaisir, et donc dupliquer. */}
      {questions.length === 0 && ajouts.length === 0 ? (
        !adding && (
          <p className="rounded-xl border-2 border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
            Aucune question. Ajoutez-en une pour commencer.
          </p>
        )
      ) : (
        <ul className="space-y-3">
          {questions.map((q, i) => (
            <li key={q.id}>
              <QuestionRow gameId={gameId} index={i} question={q} />
            </li>
          ))}
          {ajouts.map((a) => (
            <li key={a.id}>
              <LigneAjoutee titre={a.titre} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function QuestionRow({
  gameId,
  index,
  question,
}: {
  gameId: string;
  index: number;
  question: EditorQuestion;
}) {
  const [editing, setEditing] = useState(false);
  const {
    state: deleteState,
    pending: deletePending,
    onSubmit: deleteSubmit,
  } = useActionForm(deleteEventQuestion, {
    networkError: "Suppression impossible, réessayez.",
  });
  const meta = eventQuestionTypeMeta(question.questionType);

  if (editing) {
    return (
      <QuestionForm
        gameId={gameId}
        question={question}
        onDone={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="rounded-xl border-2 border-k-ink/15 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            {index + 1}. {meta.emoji} {meta.label} · {question.timeLimitSeconds}s ·{" "}
            {question.pointsBase} pts
          </p>
          <p className="mt-1 font-black text-k-ink">{question.prompt}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {question.options.map((o) => (
              <li
                key={o.id}
                className={`rounded-full border-2 px-2.5 py-0.5 text-xs font-bold ${
                  o.isCorrect
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                    : "border-zinc-200 bg-white text-k-body"
                }`}
              >
                {o.isCorrect && "✓ "}
                {o.label}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border-2 border-k-ink bg-white px-3 py-1.5 text-xs font-bold text-k-ink hover:bg-k-yellow/30"
          >
            Modifier
          </button>
          <form onSubmit={deleteSubmit} className="max-w-[16rem]">
            <input type="hidden" name="id" value={question.id} />
            {/* Même règle que la suppression de session juste en dessous : la
                case n'apparaît qu'APRÈS le refus qui NOMME le nombre de
                réponses perdues, et le filtre porte sur le marqueur partagé,
                jamais sur `!ok` — une coupure réseau ou un refus de rôle
                afficheraient sinon la même case destructive, ce qui apprend à
                la cocher par réflexe le jour où elle protège un classement.
                Une soirée EN DIRECT est refusée SANS marqueur : aucune case ne
                s'affiche alors, et c'est voulu — rien ne doit passer outre. */}
            {deleteState &&
              !deleteState.ok &&
              deleteState.error.includes(EVENT_QUESTION_LOSS_HINT) && (
                <label className="mb-2 flex items-start gap-2 text-xs font-semibold text-red-700">
                  <input
                    type="checkbox"
                    name="confirm_answers_loss"
                    value="1"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  />
                  Je comprends que les réponses déjà données seront perdues et
                  que le classement changera.
                </label>
              )}
            <button
              type="submit"
              disabled={deletePending}
              className="rounded-lg border-2 border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {deletePending ? "…" : "Supprimer"}
            </button>
          </form>
        </div>
      </div>
      <FieldError
        message={deleteState && !deleteState.ok ? deleteState.error : undefined}
      />
    </div>
  );
}

/** Formulaire de création / édition d'une question (input OBJET, options imbriquées). */
function QuestionForm({
  gameId,
  question,
  onDone,
  onCancel,
}: {
  gameId: string;
  question?: EditorQuestion;
  /** Reçoit la ligne créée pour l'afficher tout de suite ; rien en modification. */
  onDone: (ajout?: AjoutEnAttente) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<EventQuestionType>(
    question?.questionType ?? "quiz",
  );
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const [timeLimit, setTimeLimit] = useState(question?.timeLimitSeconds ?? 20);
  const [pointsBase, setPointsBase] = useState(question?.pointsBase ?? 1000);
  const [labels, setLabels] = useState<string[]>(
    question?.options.map((o) => o.label) ?? ["", ""],
  );
  // Index de la bonne réponse (quiz uniquement). -1 = aucune.
  const [correctIndex, setCorrectIndex] = useState<number>(() => {
    const idx = question?.options.findIndex((o) => o.isCorrect) ?? -1;
    return idx;
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Confirmation d'un geste qui réécrit le SENS des réponses déjà données :
  // intervertir deux libellés laisse les réponses en place et change ce
  // qu'elles signifient. Corriger une coquille n'est PAS concerné et ne
  // déclenche jamais ce refus — la distinction est mesurée côté serveur
  // (l'ensemble des libellés est-il identique ?), pas devinée ici.
  const [confirmSens, setConfirmSens] = useState(false);

  const isQuiz = type === "quiz";

  const setLabel = (i: number, value: string) => {
    setLabels((prev) => prev.map((l, j) => (j === i ? value : l)));
  };
  const addOption = () => setLabels((prev) => [...prev, ""]);
  const removeOption = (i: number) => {
    setLabels((prev) => prev.filter((_, j) => j !== i));
    setCorrectIndex((prev) => (prev === i ? -1 : prev > i ? prev - 1 : prev));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const cleaned = labels.map((l) => l.trim());
    if (cleaned.filter((l) => l).length < 2) {
      setError("Ajoutez au moins deux options non vides.");
      return;
    }
    if (isQuiz && (correctIndex < 0 || !cleaned[correctIndex])) {
      setError("Désignez la bonne réponse du quiz.");
      return;
    }
    const options = cleaned
      .map((label, i) => ({ label, is_correct: isQuiz && i === correctIndex }))
      .filter((o) => o.label);

    setPending(true);
    setError(null);
    try {
      const result = question
        ? await updateEventQuestion({
            id: question.id,
            questionType: type,
            prompt,
            timeLimitSeconds: timeLimit,
            pointsBase,
            options,
            // La case n'existe à l'écran qu'APRÈS un refus, lequel NOMME le
            // nombre de réponses déjà données. On ne demande pas de confirmer
            // un coût qu'on n'a pas encore annoncé.
            confirmLabelMeaning: confirmSens,
          })
        : await createEventQuestion({
            gameId,
            questionType: type,
            prompt,
            timeLimitSeconds: timeLimit,
            pointsBase,
            options,
          });
      if (result.ok) {
        // Voir `AjoutEnAttente` : le toast et la ligne locale remplacent le
        // rechargement franc, et couvrent ensemble le cas où le
        // rafraîchissement n'atterrit pas.
        annoncerToast({
          message: question ? "Question enregistrée." : "Question ajoutée.",
        });
        router.refresh();
        const nouvelId = question ? null : (result.data?.id ?? null);
        onDone(nouvelId ? { id: nouvelId, titre: prompt.trim() } : undefined);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Connexion perdue. Réessayez.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm font-bold text-k-ink">Type de question</legend>
        {EVENT_QUESTION_TYPES.map((t) => {
          const meta = eventQuestionTypeMeta(t);
          return (
            <label key={t} className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="radio"
                name="event-question-type"
                checked={type === t}
                onChange={() => {
                  setType(t);
                  if (t !== "quiz") setCorrectIndex(-1);
                }}
                className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
              />
              <span>
                <span className="font-bold text-k-ink">
                  {meta.emoji} {meta.label}
                </span>
                <span className="block text-xs text-zinc-500">{meta.hint}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <div>
        <Label htmlFor={`event-prompt-${question?.id ?? "new"}`}>Intitulé</Label>
        <textarea
          id={`event-prompt-${question?.id ?? "new"}`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          required
          maxLength={500}
          rows={2}
          placeholder="Ex : Quelle équipe a gagné la Coupe du monde 2018 ?"
          className={textareaClass}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <Label htmlFor={`event-time-${question?.id ?? "new"}`}>
            Temps de réponse (s)
          </Label>
          <Input
            id={`event-time-${question?.id ?? "new"}`}
            type="number"
            min={5}
            max={300}
            value={timeLimit}
            onChange={(e) => setTimeLimit(Number(e.target.value))}
            required
            className="w-32"
          />
        </div>
        <div>
          <Label htmlFor={`event-points-${question?.id ?? "new"}`}>
            Points de base
          </Label>
          <Input
            id={`event-points-${question?.id ?? "new"}`}
            type="number"
            min={0}
            max={100000}
            value={pointsBase}
            onChange={(e) => setPointsBase(Number(e.target.value))}
            required
            className="w-32"
            aria-describedby={`event-points-help-${question?.id ?? "new"}`}
          />
          <p
            id={`event-points-help-${question?.id ?? "new"}`}
            className="mt-1 text-xs text-zinc-500"
          >
            {isQuiz
              ? "Base des points ; répondre vite rapporte davantage."
              : "Sans effet sur un sondage (aucun score)."}
          </p>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-k-ink">
          Options{" "}
          {isQuiz && (
            <span className="font-normal text-zinc-500">
              — cochez la bonne réponse
            </span>
          )}
        </legend>
        {labels.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            {isQuiz && (
              <input
                type="radio"
                name={`event-correct-${question?.id ?? "new"}`}
                checked={correctIndex === i}
                onChange={() => setCorrectIndex(i)}
                aria-label={`Marquer l'option ${i + 1} comme bonne réponse`}
                className="h-4 w-4 shrink-0 accent-emerald-500"
              />
            )}
            <Input
              value={label}
              onChange={(e) => setLabel(i, e.target.value)}
              maxLength={200}
              placeholder={`Option ${i + 1}`}
              className="flex-1"
              aria-label={`Libellé de l'option ${i + 1}`}
            />
            {labels.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(i)}
                aria-label={`Supprimer l'option ${i + 1}`}
                className="shrink-0 rounded-lg border-2 border-zinc-300 px-2.5 py-2 text-sm font-bold text-zinc-500 hover:border-red-300 hover:text-red-600"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addOption}
          className="text-sm font-bold text-k-ink hover:underline"
        >
          + Ajouter une option
        </button>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "…" : question ? "Enregistrer" : "Ajouter"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Annuler
        </Button>
      </div>
      <FieldError message={error ?? undefined} />
      {/* La case n'apparaît qu'APRÈS le refus, lequel NOMME le nombre de
          réponses déjà données. La demander avant serait demander de
          confirmer un coût inconnu — et l'organisateur apprendrait à cocher
          sans lire, ce qui la rendrait inutile le jour où elle compte.
          Le filtre porte sur un MARQUEUR partagé et non sur une phrase
          recopiée : les quatre autres gardes destructives du produit suivent
          déjà cette forme, et une garde mécanique l'impose. */}
      {error?.includes(EVENT_ANSWER_MEANING_HINT) && (
        <label className="mt-2 flex items-start gap-2 text-xs font-semibold text-amber-800">
          <input
            type="checkbox"
            checked={confirmSens}
            onChange={(e) => setConfirmSens(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          Je comprends que les réponses déjà données seront rattachées à
          l&apos;autre libellé.
        </label>
      )}
    </form>
  );
}

// ════════════════════════════════════════════════════════════
// Sessions (déroulés live)
// ════════════════════════════════════════════════════════════

const SESSION_STATUS_LABEL: Record<EventSessionStatus, string> = {
  draft: "Brouillon",
  lobby: "Salon ouvert",
  live: "En direct",
  ended: "Terminée",
  archived: "Archivée",
};

/**
 * LES SESSIONS, CÔTÉ SUIVI — ce qui sert LE SOIR DE LA SOIRÉE.
 *
 * Cette carte mêlait deux gestes de nature opposée : régler le lot d'une salle
 * à venir, et piloter une salle en cours. Elle ne garde ici que le second — le
 * code d'accès, le QR imprimable, « Piloter », « Écran », le compteur
 * d'ouvertures et la suppression gardée. Ce qui se PRÉPARE (étiquette, lot,
 * détails, stock, échéance du code) vit à l'étape « La soirée » de l'atelier.
 */
export function EventSessionsSection({
  sessions,
}: {
  sessions: EditorSession[];
}) {
  return (
    <Card>
      <h2 className="mb-1 font-semibold">Sessions en direct</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Une session est un déroulé live du jeu, avec son code d&apos;accès et son
        QR. C&apos;est d&apos;ici que vous la pilotez et que vous projetez
        l&apos;écran de salle ; son lot se règle à l&apos;étape « La soirée » de
        l&apos;atelier.
      </p>

      {sessions.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
          Aucune session. Préparez-en une à l&apos;étape « La soirée » de
          l&apos;atelier pour animer un déroulé live.
        </p>
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => (
            <li key={s.id}>
              <SessionRow session={s} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * ÉTAPE « LA SOIRÉE » — la moitié PRÉPARER des sessions.
 *
 * Les quatre champs (étiquette, lot, détails, stock) voyagent ENSEMBLE et ce
 * n'est pas un choix de mise en page : `updateEventSession` les écrit en bloc
 * avec `input.X ?? ""`. Une étape qui n'afficherait que l'étiquette remettrait
 * le stock de lots à zéro — « podium sans lot » — sans un mot.
 */
export function EventSessionsPrepareSection({
  gameId,
  gameActive,
  sessions,
}: {
  gameId: string;
  gameActive: boolean;
  sessions: EditorSession[];
}) {
  const [creating, setCreating] = useState(false);
  const { ajouts, noter } = useAjoutsEnAttente(sessions);

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className={TITRE_CARTE}>
          La soirée
        </h2>
        {!creating && (
          <Button variant="secondary" onClick={() => setCreating(true)}>
            + Nouvelle session
          </Button>
        )}
      </div>
      <p className="mb-4 text-sm text-zinc-500">
        Une session est un déroulé live du jeu, avec son lot. Le nombre de
        gagnants (stock) est <strong>fini et obligatoire</strong> : il plafonne
        les codes de retrait émis à la fin.
      </p>

      {!gameActive && (
        <p className="mb-4 rounded-xl border-2 border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
          Activez le jeu (au moins une question) pour piloter une session en
          direct.
        </p>
      )}

      <div className="mb-4">
        <InfoBulle
          id="aide-event-soiree"
          resume="Pourquoi le stock est-il obligatoire, et l'échéance absente à la création ?"
        >
          Le stock est le nombre de codes de retrait émis au podium, du 1ᵉʳ au
          Nᵉ : à 0, le classement s&apos;affiche mais personne ne repart avec
          quoi que ce soit. L&apos;échéance du code EVENT-, elle, n&apos;apparaît
          qu&apos;en modification — la création ne sait pas encore l&apos;enregistrer,
          et l&apos;offrir laisserait croire qu&apos;elle est prise en compte. Une
          session neuve part donc « sans limite », et se règle juste après.
        </InfoBulle>
      </div>

      {creating && (
        <div className="mb-4">
          <SessionForm
            gameId={gameId}
            onDone={(ajout) => {
              setCreating(false);
              noter(ajout);
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {/* Même raison que pour les questions : sans `ajouts`, l'encart « Aucune
          session » revenait après une création réussie, et des sessions
          fantômes s'accumulaient — chacune avec son code et son stock. */}
      {sessions.length === 0 && ajouts.length === 0 ? (
        !creating && (
          <p className="rounded-xl border-2 border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
            Aucune session. Créez-en une pour animer une soirée.
          </p>
        )
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => (
            <li key={s.id}>
              <SessionPrepareRow session={s} />
            </li>
          ))}
          {ajouts.map((a) => (
            <li key={a.id}>
              <LigneAjoutee titre={a.titre} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Une session vue de l'atelier : son lot, son stock, et rien du pilotage. */
function SessionPrepareRow({ session }: { session: EditorSession }) {
  return (
    <div className="rounded-xl border-2 border-k-ink/15 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-black text-k-ink">
          {session.label || "Session sans nom"}
        </p>
        <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-bold text-zinc-600">
          {SESSION_STATUS_LABEL[session.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Lot : {session.rewardLabel || "—"} · {session.rewardClaimedCount}/
        {session.rewardStock} gagnant{session.rewardStock > 1 ? "s" : ""}
        {session.codeTtlDays === null
          ? " · code sans date limite"
          : ` · code valable ${session.codeTtlDays} jour${session.codeTtlDays > 1 ? "s" : ""}`}
      </p>
      <div className="mt-3 border-t border-zinc-200 pt-3">
        <SessionEditForm session={session} />
      </div>
    </div>
  );
}

function SessionRow({ session }: { session: EditorSession }) {
  const {
    state: deleteState,
    pending: deletePending,
    onSubmit: deleteSubmit,
  } = useActionForm(deleteEventSession, {
    networkError: "Suppression impossible, réessayez.",
  });

  return (
    <div className="rounded-xl border-2 border-k-ink/15 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-k-ink">
              {session.label || "Session sans nom"}
            </p>
            <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-bold text-zinc-600">
              {SESSION_STATUS_LABEL[session.status]}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Code :{" "}
            <span className="font-mono font-bold tracking-widest text-k-ink">
              {session.joinCode}
            </span>{" "}
            · Lot : {session.rewardLabel || "—"} · {session.rewardClaimedCount}/
            {session.rewardStock} gagnant{session.rewardStock > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href={`/dashboard/events/${session.id}/remote`}
            className="rounded-lg border-2 border-k-ink bg-k-yellow px-3 py-1.5 text-xs font-black text-k-ink"
          >
            🎛️ Piloter
          </Link>
          {/* Le lien joueur et son QR servent aussi à INVITER avant le début :
              une session en brouillon mène à sa salle d'attente, sans permettre
              d'inscription avant le lancement. Seule une session archivée ne
              doit plus être distribuée. L'écran de salle, lui, reste fermé tant
              que le salon n'est pas ouvert : il projette une partie en cours,
              pas une invitation. */}
          {session.status !== "archived" && (
            <Link
              href={`/event/${session.joinCode}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border-2 border-k-ink bg-white px-3 py-1.5 text-xs font-bold text-k-ink hover:bg-k-yellow/30"
            >
              👥 Joueurs
            </Link>
          )}
          {salleOuverteAuJoueur(session.status) && (
            <>
              <Link
                href={`/event/${session.joinCode}/screen`}
                target="_blank"
                className="rounded-lg border-2 border-k-ink bg-white px-3 py-1.5 text-xs font-bold text-k-ink hover:bg-k-yellow/30"
              >
                📺 Écran
              </Link>
            </>
          )}
        </div>
      </div>

      {/* §4 du cahier : un QR et un lien pour l'organisateur. Un QR de session
          existait déjà, mais côté JOUEUR — `EventJoinQr` sur l'écran de salle,
          généré en data-URL et projeté PENDANT la soirée. Ce n'est pas le même
          besoin : ici le commerçant prépare une AFFICHE AVANT (PNG 1024 px,
          encre franche sur blanc, bannière « SCANNEZ-MOI »), à coller sur les
          tables ou en vitrine. D'où `PublicShare` et non le QR d'écran.

          Le lien peut être imprimé avant le début : la page joueur rend alors
          une salle d'attente. Une session archivée, elle, reste fermée et son
          QR ne doit plus être distribué. */}
      <div className="mt-3 border-t border-zinc-200 pt-3">
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-zinc-500">
          QR code et lien de la session
        </p>
        {session.status !== "archived" ? (
          <>
            <PublicShare
              url={session.publicUrl}
              fileName={`evenement-${session.joinCode}`}
              qrLabel={session.label || `Session ${session.joinCode}`}
              openCount={session.openCount}
              resource={{ kind: "event", id: session.id }}
            />
            {session.status === "draft" && (
              <p className="mt-3 text-sm text-zinc-500">
                Le lien et le QR sont prêts à partager : les joueurs verront la salle
                d&apos;attente. Lancez la session depuis « Piloter » quand vous êtes prêt
                à ouvrir les inscriptions.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-500">
            Cette session est archivée : son lien joueur et son QR ne sont plus
            proposés.
          </p>
        )}
      </div>

      {/* Le lot, le stock et l'échéance ne se règlent PAS ici : ils vivent à
          l'étape « La soirée » de l'atelier. Cette ligne est celle qu'on
          regarde le soir venu, pas celle qu'on prépare. */}
      <div className="mt-3 border-t border-zinc-200 pt-3">
        <form onSubmit={deleteSubmit}>
          <input type="hidden" name="id" value={session.id} />
          {/* La case n'apparaît qu'APRÈS CE refus précis, lequel NOMME le
              nombre de lots encore à remettre. La demander avant de savoir
              combien serait du bruit ; la demander après, c'est un choix
              informé. Le filtre porte sur le marqueur partagé et non sur
              `!ok` : « Suppression impossible » ou une coupure réseau
              faisaient apparaître la même case destructive, ce qui apprend à
              la cocher par réflexe le jour où elle protège de vrais codes. */}
          {deleteState &&
            !deleteState.ok &&
            deleteState.error.includes(EVENT_SESSION_LOSS_HINT) && (
              <label className="mb-2 flex items-start gap-2 text-xs font-semibold text-red-700">
                <input
                  type="checkbox"
                  name="confirm_outstanding"
                  value="1"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                Je comprends que les codes non retirés deviendront introuvables
                en caisse.
              </label>
            )}
          <button
            type="submit"
            disabled={deletePending}
            className="text-xs font-bold text-red-600 hover:underline disabled:opacity-50"
          >
            {deletePending ? "Suppression…" : "Supprimer la session"}
          </button>
          <FieldError
            message={deleteState && !deleteState.ok ? deleteState.error : undefined}
          />
        </form>
      </div>
    </div>
  );
}

/** Édition inline d'une session (label + lot + stock). */
function SessionEditForm({ session }: { session: EditorSession }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-bold text-k-ink hover:underline"
      >
        Modifier le lot / l&apos;étiquette
      </button>
    );
  }

  return (
    <SessionForm
      session={session}
      onDone={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    />
  );
}

/** Formulaire de création / édition d'une session. */
function SessionForm({
  gameId,
  session,
  onDone,
  onCancel,
}: {
  gameId?: string;
  session?: EditorSession;
  /** Reçoit la ligne créée pour l'afficher tout de suite ; rien en modification. */
  onDone: (ajout?: AjoutEnAttente) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(session?.label ?? "");
  const [rewardLabel, setRewardLabel] = useState(session?.rewardLabel ?? "");
  const [rewardDetails, setRewardDetails] = useState(session?.rewardDetails ?? "");
  const [rewardStock, setRewardStock] = useState(session?.rewardStock ?? 1);
  const [codeTtlDays, setCodeTtlDays] = useState(() =>
    codeTtlDaysInitial(session?.codeTtlDays),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = session
        ? await updateEventSession({
            id: session.id,
            label,
            rewardLabel,
            rewardDetails,
            rewardStock,
            // Le champ n'est affiché QU'EN ÉDITION (createEventSession
            // n'accepte pas ce réglage) : ici il l'est toujours, donc la clé
            // est toujours posée. `codeTtlDays` vaut `''` quand le commerçant
            // a vidé la case — « sans limite », valeur légitime — et l'action
            // ne la distingue de « ne touche pas » que par l'ABSENCE de la
            // clé. Ne jamais écrire `codeTtlDays: codeTtlDays || undefined`.
            codeTtlDays: codeTtlDays.trim(),
          })
        : await createEventSession({
            gameId: gameId!,
            label,
            rewardLabel,
            rewardDetails,
            rewardStock,
          });
      if (result.ok) {
        // Voir `AjoutEnAttente` : le toast et la ligne locale remplacent le
        // rechargement franc, et couvrent ensemble le cas où le
        // rafraîchissement n'atterrit pas.
        annoncerToast({
          message: session ? "Session enregistrée." : "Session créée.",
        });
        router.refresh();
        const nouvelId = session ? null : (result.data?.id ?? null);
        onDone(
          nouvelId
            ? { id: nouvelId, titre: label.trim() || "Session sans nom" }
            : undefined,
        );
      } else {
        setError(result.error);
      }
    } catch {
      setError("Connexion perdue. Réessayez.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      <div>
        <Label htmlFor={`event-session-label-${session?.id ?? "new"}`}>
          Étiquette (optionnel)
        </Label>
        <Input
          id={`event-session-label-${session?.id ?? "new"}`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={120}
          placeholder="Ex : Soirée du 12 juillet"
        />
      </div>
      <div>
        <Label htmlFor={`event-session-reward-${session?.id ?? "new"}`}>Lot</Label>
        <Input
          id={`event-session-reward-${session?.id ?? "new"}`}
          value={rewardLabel}
          onChange={(e) => setRewardLabel(e.target.value)}
          maxLength={120}
          placeholder="Ex : Une tournée offerte"
        />
      </div>
      <div>
        <Label htmlFor={`event-session-details-${session?.id ?? "new"}`}>
          Détails du lot (optionnel)
        </Label>
        <textarea
          id={`event-session-details-${session?.id ?? "new"}`}
          value={rewardDetails}
          onChange={(e) => setRewardDetails(e.target.value)}
          maxLength={2000}
          rows={2}
          placeholder="Conditions, validité, modalités de retrait…"
          className={textareaClass}
        />
      </div>
      <div>
        <Label htmlFor={`event-session-stock-${session?.id ?? "new"}`}>
          Nombre de gagnants (stock, obligatoire)
        </Label>
        <Input
          id={`event-session-stock-${session?.id ?? "new"}`}
          type="number"
          min={0}
          max={1000000}
          value={rewardStock}
          onChange={(e) => setRewardStock(Number(e.target.value))}
          required
          className="w-32"
          aria-describedby={`event-session-stock-help-${session?.id ?? "new"}`}
        />
        <p
          id={`event-session-stock-help-${session?.id ?? "new"}`}
          className="mt-1 text-xs text-zinc-500"
        >
          Nombre de codes de retrait émis à la fin (le podium, du 1er au Nᵉ). 0 =
          podium à l&apos;écran sans lot à retirer.
        </p>
      </div>

      {/* ÉDITION SEULEMENT : `createEventSession` n'accepte pas ce réglage.
          Offrir la case à la création laisserait croire qu'elle est prise en
          compte alors qu'elle serait silencieusement perdue — une session
          neuve part donc « sans limite », et se règle juste après. */}
      {session && (
        <CodeTtlDaysField
          idPrefix={`event-session-${session.id}`}
          value={codeTtlDays}
          onChange={setCodeTtlDays}
          emissionHint="Délai laissé au gagnant pour présenter son code EVENT- en caisse, à partir de la FIN de la session (les codes sont émis au podium)."
        />
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "…" : session ? "Enregistrer" : "Créer la session"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Annuler
        </Button>
      </div>
      <FieldError message={error ?? undefined} />
    </form>
  );
}
