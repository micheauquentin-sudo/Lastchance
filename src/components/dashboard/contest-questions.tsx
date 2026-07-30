"use client";

import { useEffect, useState } from "react";
import {
  addContestQuestion,
  deleteMatch,
  setQuestionResult,
} from "@/actions/pronostics";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { RankingPicker, type RankingOption } from "@/components/ui/ranking-picker";
import {
  suggestedQuestionsFor,
  type GenericSuggestedQuestion,
} from "@/components/dashboard/contest-event-kinds";
import { isoToZonedDateTimeInput } from "@/lib/date-time";
import { useActionForm } from "@/lib/use-action-form";

/* Constructeur de questions génériques (choix unique, classement,
   estimation) — le pendant hors football de la liste des matchs, qui
   reste strictement inchangée.

   `contest_matches` est INSERT-only pour le commerçant (aucun grant
   UPDATE) : une question ne se MODIFIE pas, elle se supprime et se
   recrée. L'UI ne propose donc jamais de bouton « Modifier » qui
   échouerait — seulement « Supprimer » et le formulaire d'ajout.

   useActionForm et non useActionState : l'état de chargement doit retomber
   même quand le rendu ne rejoue pas la revalidation — docs/bugs.md. */

/** Bornes miroir de src/lib/pronostics.ts (et des CHECK SQL). */
const PROMPT_MAX = 300;
const OPTIONS_MIN = 2;
const OPTIONS_MAX = 50;
const OPTION_LABEL_MAX = 120;
const NUMBER_MAX = 1000000000;

export type GenericQuestionType = "choice" | "ranking" | "number";

const QUESTION_TYPES: Array<{
  key: GenericQuestionType;
  label: string;
  icon: string;
  hint: string;
}> = [
  {
    key: "choice",
    label: "Choix unique",
    icon: "🎯",
    hint: "Une seule bonne réponse parmi vos propositions (gagnant, lauréat, vainqueur d'une finale…).",
  },
  {
    key: "ranking",
    label: "Classement",
    icon: "🥇",
    hint: "L'ordre d'un top N parmi vos propositions (podium, arrivée d'une course…).",
  },
  {
    key: "number",
    label: "Estimation chiffrée",
    icon: "🔢",
    hint: "Un nombre à deviner (audience, nombre de points, durée…).",
  },
];

const selectClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

function formatDate(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

/** Vue dashboard d'une question générique (préparée côté serveur). */
export interface DashboardQuestion {
  id: string;
  questionType: GenericQuestionType;
  prompt: string;
  options: RankingOption[];
  rankingSize: number | null;
  /** Échéance effective : locks_at, sinon défaut de l'événement. */
  locksAt: string;
  finished: boolean;
  /** Résultat officiel déjà saisi (jsonb brut) — null tant que non résolu. */
  correctAnswer: unknown;
}

// ────────────────────────────────────────────────────────────
// Constructeur : ajout d'une question typée
// ────────────────────────────────────────────────────────────

interface OptionRow {
  /** Clé React stable (les index bougent au réordonnancement). */
  uid: number;
  label: string;
  /** Exemple de saisie venu d'un brouillon — jamais une valeur. */
  placeholder?: string;
}

let optionUid = 1;

/**
 * Lignes de propositions au montage. Un brouillon n'apporte que des
 * EXEMPLES (`optionsPlaceholder`) : les champs restent VIDES, le
 * commerçant saisit ses propres options.
 */
function initialOptionRows(draft?: GenericSuggestedQuestion): OptionRow[] {
  const hints =
    draft && draft.questionType !== "number"
      ? (draft.optionsPlaceholder ?? [])
      : [];
  const count = Math.min(Math.max(OPTIONS_MIN, hints.length), OPTIONS_MAX);
  return Array.from({ length: count }, (_, index) => ({
    uid: optionUid++,
    label: "",
    placeholder: hints[index],
  }));
}

/** Identifiant d'option dérivé de la position — les questions sont
 *  créées d'un bloc (aucune réponse en base à ce stade), la position
 *  suffit et respecte OPTION_ID_PATTERN. */
function optionId(index: number): string {
  return `opt_${index + 1}`;
}

function QuestionBuilder({
  contestId,
  defaultLocksAt,
  timeZone,
  draft,
}: {
  contestId: string;
  /** Verrouillage par défaut de l'événement (null : aucun). */
  defaultLocksAt: string | null;
  timeZone: string;
  /**
   * Brouillon du modèle d'événement : pré-remplit le formulaire (type,
   * intitulé, taille de podium, exemples de propositions). RIEN n'est
   * écrit en base tant que le commerçant ne valide pas. Le parent
   * remonte le composant (`key`) à chaque brouillon choisi — l'état
   * initial suffit, aucun effet de synchronisation.
   */
  draft?: GenericSuggestedQuestion;
}) {
  const [type, setType] = useState<GenericQuestionType>(
    draft?.questionType ?? "choice",
  );
  const [rows, setRows] = useState<OptionRow[]>(() => initialOptionRows(draft));
  const [rankingSize, setRankingSize] = useState(
    String(draft?.rankingSize ?? 3),
  );
  const [prompt, setPrompt] = useState(draft?.prompt ?? "");
  const [locksLocal, setLocksLocal] = useState("");

  const { state, pending, onSubmit } = useActionForm(addContestQuestion, {
    // `reloadOnSuccess` : signature mécanique « insère une ligne dans une liste
    // rendue par le serveur, sans rendre aucun succès » — la seule famille où
    // l'échec du rafraîchissement fait recommencer le geste, donc crée un
    // doublon. Vérifiée par `use-action-form-coverage.test.ts`.
    reloadOnSuccess: true,
    // Les propositions, l'intitulé et l'échéance sont CONTRÔLÉS :
    // form.reset() ne les vide pas, le reset reste des setState explicites.
    onSuccess: () => {
      setRows([
        { uid: optionUid++, label: "" },
        { uid: optionUid++, label: "" },
      ]);
      setPrompt("");
      setLocksLocal("");
    },
    // Vide le champ visible du verrouillage (non contrôlé), pour rester
    // cohérent avec `locksLocal` remis à vide ci-dessus.
    resetOnSuccess: true,
    networkError: "Ajout impossible, réessayez.",
  });

  const needsOptions = type !== "number";
  const labels = rows.map((row) => row.label.trim()).filter((l) => l !== "");
  const serializedOptions = JSON.stringify(
    needsOptions
      ? labels.map((label, index) => ({ id: optionId(index), label }))
      : [],
  );
  // Une question sans échéance propre retombe sur le verrouillage par
  // défaut de l'événement (le serveur exige une date : on l'envoie ici).
  const effectiveLocal =
    locksLocal ||
    isoToZonedDateTimeInput(defaultLocksAt, timeZone);

  const move = (index: number, delta: number) => {
    setRows((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const typeInfo = QUESTION_TYPES.find((t) => t.key === type);

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="contest_id" value={contestId} />
      <input type="hidden" name="question_type" value={type} />
      <input type="hidden" name="options" value={serializedOptions} />
      <input
        type="hidden"
        name="ranking_size"
        value={type === "ranking" ? rankingSize : ""}
      />
      <input type="hidden" name="locks_at" value={effectiveLocal} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="question-type">Type de question</Label>
          <select
            id="question-type"
            value={type}
            onChange={(e) => setType(e.target.value as GenericQuestionType)}
            className={selectClass}
          >
            {QUESTION_TYPES.map((option) => (
              <option key={option.key} value={option.key}>
                {option.icon} {option.label}
              </option>
            ))}
          </select>
          {typeInfo && (
            <p className="mt-1 text-xs text-zinc-500">{typeInfo.hint}</p>
          )}
        </div>
        <div>
          <Label htmlFor="question-locks">
            Verrouillage {defaultLocksAt ? "(optionnel)" : ""}
          </Label>
          <Input
            id="question-locks"
            type="datetime-local"
            required={!defaultLocksAt}
            onChange={(e) => setLocksLocal(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            {defaultLocksAt
              ? `Sans date propre : ${formatDate(defaultLocksAt, timeZone)} (défaut de l'événement).`
              : "Les réponses ferment à cette date."}{" "}
            Heure de l&apos;établissement ({timeZone}).
          </p>
        </div>
      </div>

      <div>
        <Label htmlFor="question-prompt">Intitulé de la question</Label>
        <Input
          id="question-prompt"
          name="prompt"
          required
          maxLength={PROMPT_MAX}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ex : Quel pays gagne l'Eurovision ?"
        />
      </div>

      {needsOptions && (
        <fieldset>
          <legend className="mb-1.5 block text-sm font-bold text-k-ink">
            Propositions ({OPTIONS_MIN} minimum)
          </legend>
          <ol className="space-y-2">
            {rows.map((row, index) => (
              <li key={row.uid} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-center text-xs font-black tabular-nums text-zinc-400">
                  {index + 1}
                </span>
                <Input
                  value={row.label}
                  onChange={(e) =>
                    setRows((current) =>
                      current.map((r) =>
                        r.uid === row.uid ? { ...r, label: e.target.value } : r,
                      ),
                    )
                  }
                  maxLength={OPTION_LABEL_MAX}
                  placeholder={row.placeholder ?? `Proposition ${index + 1}`}
                  aria-label={`Proposition ${index + 1}`}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Monter la proposition ${index + 1}`}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => move(index, 1)}
                  disabled={index === rows.length - 1}
                  aria-label={`Descendre la proposition ${index + 1}`}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setRows((current) =>
                      current.length > OPTIONS_MIN
                        ? current.filter((r) => r.uid !== row.uid)
                        : current,
                    )
                  }
                  disabled={rows.length <= OPTIONS_MIN}
                  aria-label={`Supprimer la proposition ${index + 1}`}
                >
                  ✕
                </Button>
              </li>
            ))}
          </ol>
          <Button
            type="button"
            variant="secondary"
            className="mt-2"
            disabled={rows.length >= OPTIONS_MAX}
            onClick={() =>
              setRows((current) => [...current, { uid: optionUid++, label: "" }])
            }
          >
            + Ajouter une proposition
          </Button>
        </fieldset>
      )}

      {type === "ranking" && (
        <div>
          <Label htmlFor="question-ranking-size">Nombre de places à classer</Label>
          <Input
            id="question-ranking-size"
            type="number"
            min={OPTIONS_MIN}
            max={Math.max(OPTIONS_MIN, labels.length)}
            value={rankingSize}
            onChange={(e) => setRankingSize(e.target.value)}
            className="w-24 text-center"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Ne peut pas dépasser le nombre de propositions ({labels.length}).
          </p>
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Ajout…" : "+ Ajouter la question"}
      </Button>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// Saisie du résultat officiel, par type
// ────────────────────────────────────────────────────────────

function ResultForm({ question }: { question: DashboardQuestion }) {
  const { state, pending, onSubmit } = useActionForm(setQuestionResult, {
    networkError: "Enregistrement impossible, réessayez.",
  });
  const [order, setOrder] = useState<string[]>(() =>
    Array.isArray(question.correctAnswer)
      ? (question.correctAnswer as unknown[]).filter(
          (v): v is string => typeof v === "string",
        )
      : [],
  );
  // La RPC n'accepte le résultat qu'une fois la question verrouillée.
  // `Date.now()` est IMPUR : l'évaluer pendant le rendu viole la pureté React
  // (valeur instable, écart d'hydratation SSR/CSR). On tranche donc APRÈS
  // montage, et on replanifie à l'échéance pour que le formulaire de saisie
  // apparaisse de lui-même au verrouillage, sans rechargement.
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const deadline = new Date(question.locksAt).getTime();
    const remaining = deadline - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- décision d'horloge prise APRÈS montage : c'est précisément ce qui évite l'écart d'hydratation.
      setLocked(true);
      return;
    }
    // Pas de remise à `false` : c'est déjà l'état initial, et `locks_at` ne
    // change pas pour une question existante (contest_matches est en écriture
    // INSERT-only côté commerçant — modifier une question = la recréer).
    // setTimeout déborde au-delà de ~24,8 jours et déclencherait AUSSITÔT :
    // au-delà, on ne planifie rien (le composant sera remonté d'ici là).
    if (remaining > 2_000_000_000) return;
    const id = window.setTimeout(() => setLocked(true), remaining + 1_000);
    return () => window.clearTimeout(id);
  }, [question.locksAt]);

  if (!locked) {
    return (
      <p className="mt-3 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
        Le résultat sera saisissable après le verrouillage.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-2">
      <input type="hidden" name="id" value={question.id} />

      {question.questionType === "choice" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Label htmlFor={`result-choice-${question.id}`}>
              Bonne réponse
            </Label>
            <select
              id={`result-choice-${question.id}`}
              name="option_id"
              required
              defaultValue={
                typeof question.correctAnswer === "string"
                  ? question.correctAnswer
                  : ""
              }
              className={selectClass}
            >
              <option value="" disabled>
                Choisir…
              </option>
              {question.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "…" : question.finished ? "Corriger" : "Enregistrer"}
          </Button>
        </div>
      )}

      {question.questionType === "ranking" && (
        <div>
          <input type="hidden" name="order" value={JSON.stringify(order)} />
          <span className="mb-1.5 block text-sm font-bold text-k-ink">
            Ordre officiel
          </span>
          <RankingPicker
            options={question.options}
            size={question.rankingSize ?? OPTIONS_MIN}
            value={order}
            onChange={setOrder}
          />
          <Button
            type="submit"
            variant="secondary"
            className="mt-2"
            disabled={pending || order.length !== (question.rankingSize ?? 0)}
          >
            {pending ? "…" : question.finished ? "Corriger" : "Enregistrer"}
          </Button>
        </div>
      )}

      {question.questionType === "number" && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor={`result-number-${question.id}`}>
              Valeur officielle
            </Label>
            <Input
              id={`result-number-${question.id}`}
              name="value"
              type="number"
              step="any"
              min={-NUMBER_MAX}
              max={NUMBER_MAX}
              required
              defaultValue={
                typeof question.correctAnswer === "number"
                  ? question.correctAnswer
                  : ""
              }
              className="w-40"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "…" : question.finished ? "Corriger" : "Enregistrer"}
          </Button>
        </div>
      )}

      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

/** Résultat officiel en clair (côté commerçant : aucun enjeu de fuite). */
function officialAnswerLabel(question: DashboardQuestion): string | null {
  const labelOf = (id: unknown) =>
    question.options.find((option) => option.id === id)?.label ?? String(id);
  if (question.correctAnswer === null || question.correctAnswer === undefined) {
    return null;
  }
  if (question.questionType === "choice") return labelOf(question.correctAnswer);
  if (question.questionType === "ranking") {
    return Array.isArray(question.correctAnswer)
      ? question.correctAnswer.map((id, i) => `${i + 1}. ${labelOf(id)}`).join(" · ")
      : null;
  }
  return String(question.correctAnswer);
}

function QuestionRow({
  question,
  timeZone,
}: {
  question: DashboardQuestion;
  timeZone: string;
}) {
  const {
    state: deleteState,
    pending: deletePending,
    onSubmit: deleteSubmit,
  } = useActionForm(deleteMatch, {
    networkError: "Suppression impossible, réessayez.",
  });
  const typeInfo = QUESTION_TYPES.find((t) => t.key === question.questionType);
  const official = officialAnswerLabel(question);

  return (
    <li className="rounded-xl border-2 border-k-ink/15 bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-k-ink">
            <span aria-hidden>{typeInfo?.icon} </span>
            {question.prompt}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {typeInfo?.label}
            {question.questionType === "ranking" && question.rankingSize
              ? ` · top ${question.rankingSize}`
              : ""}
            {question.options.length > 0
              ? ` · ${question.options.length} proposition${question.options.length > 1 ? "s" : ""}`
              : ""}
            {" · "}
            {formatDate(question.locksAt, timeZone)}
          </p>
          {question.finished && official && (
            <p className="mt-1 text-xs font-bold text-k-green">
              Résultat : {official}
            </p>
          )}
        </div>
        <form
          onSubmit={(event) => {
            // Confirmer d'abord ; le hook n'est saisi que sur oui.
            if (
              !confirm(
                "Supprimer cette question et toutes les réponses associées ?",
              )
            ) {
              event.preventDefault();
              return;
            }
            deleteSubmit(event);
          }}
        >
          <input type="hidden" name="id" value={question.id} />
          <Button
            type="submit"
            variant="ghost"
            disabled={deletePending}
            aria-label={`Supprimer la question « ${question.prompt} »`}
          >
            ✕
          </Button>
        </form>
      </div>
      <ResultForm question={question} />
      <FieldError
        message={deleteState && !deleteState.ok ? deleteState.error : undefined}
      />
    </li>
  );
}

// ────────────────────────────────────────────────────────────
// Carte « Questions » du dashboard
// ────────────────────────────────────────────────────────────

export function ContestQuestionsCard({
  contestId,
  questions,
  defaultLocksAt,
  timeZone,
  eventKind,
}: {
  contestId: string;
  questions: DashboardQuestion[];
  defaultLocksAt: string | null;
  timeZone: string;
  /** Modèle de l'événement : pilote les brouillons proposés. */
  eventKind?: string;
}) {
  const [open, setOpen] = useState(false);
  // Brouillon choisi + compteur de remontage du constructeur (changer de
  // `key` réinitialise proprement son état, sans effet de synchronisation).
  const [draft, setDraft] = useState<GenericSuggestedQuestion | null>(null);
  const [draftNonce, setDraftNonce] = useState(0);

  // Les brouillons n'ont de sens qu'à la première configuration : dès
  // qu'une question existe, le commerçant a pris la main.
  const drafts =
    questions.length === 0 && eventKind ? suggestedQuestionsFor(eventKind) : [];

  const pickDraft = (suggestion: GenericSuggestedQuestion) => {
    setDraft(suggestion);
    setDraftNonce((n) => n + 1);
    setOpen(true);
  };

  return (
    <Card>
      <h2 className="font-semibold mb-1">Questions</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Au-delà des matchs : choix unique, classement ou estimation chiffrée.
        Les réponses ferment à l&apos;échéance de chaque question ; saisissez
        le résultat ensuite, les points sont attribués aussitôt.
      </p>

      {drafts.length > 0 && (
        <div className="mb-4 rounded-xl border-2 border-dashed border-k-ink/20 bg-k-yellow/10 p-3">
          <p className="text-sm font-bold text-k-ink">
            Questions suggérées pour ce type d&apos;événement
          </p>
          <p className="mb-2.5 text-xs text-zinc-500">
            Un clic pré-remplit le formulaire ci-dessous : complétez vos
            propositions, puis validez. Rien n&apos;est enregistré avant.
          </p>
          <ul className="flex flex-wrap gap-2">
            {drafts.map((suggestion) => {
              const info = QUESTION_TYPES.find(
                (t) => t.key === suggestion.questionType,
              );
              return (
                <li key={suggestion.prompt}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => pickDraft(suggestion)}
                  >
                    <span aria-hidden>{info?.icon} </span>
                    {suggestion.prompt}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {open ? (
        <div className="rounded-xl border-2 border-k-ink/15 bg-zinc-50/60 p-4">
          <QuestionBuilder
            key={draftNonce}
            contestId={contestId}
            defaultLocksAt={defaultLocksAt}
            timeZone={timeZone}
            draft={draft ?? undefined}
          />
          <Button
            type="button"
            variant="ghost"
            className="mt-2"
            onClick={() => setOpen(false)}
          >
            Fermer
          </Button>
        </div>
      ) : (
        <Button type="button" onClick={() => setOpen(true)}>
          + Ajouter une question
        </Button>
      )}

      {questions.length > 0 ? (
        <>
          <ul className="mt-5 space-y-2.5">
            {questions.map((question) => (
              <QuestionRow
                key={question.id}
                question={question}
                timeZone={timeZone}
              />
            ))}
          </ul>
          <p className="mt-3 text-xs text-zinc-500">
            Une question posée ne se modifie plus : pour la corriger,
            supprimez-la (les réponses des joueurs partent avec elle) puis
            recréez-la.
          </p>
        </>
      ) : (
        <p className="mt-5 text-sm text-zinc-500">
          Aucune question pour l&apos;instant.
        </p>
      )}
    </Card>
  );
}
