"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
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
  status: EventSessionStatus;
  rewardLabel: string;
  rewardDetails: string | null;
  rewardStock: number;
  rewardClaimedCount: number;
}

// ════════════════════════════════════════════════════════════
// Réglages du jeu (nom, statut, suppression)
// ════════════════════════════════════════════════════════════

export function EventGameSettings({
  gameId,
  name,
  status,
}: {
  gameId: string;
  name: string;
  status: EventGameStatus;
}) {
  const [nameState, nameAction, namePending] = useActionState(updateEventGame, null);
  const [statusState, statusAction, statusPending] = useActionState(
    setEventGameStatus,
    null,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteEventGame,
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Card className="space-y-6">
      <form action={nameAction} className="flex flex-wrap items-end gap-3">
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
        <FieldError message={nameState && !nameState.ok ? nameState.error : undefined} />
      </form>

      <div className="border-t border-zinc-100 pt-5">
        <div className="flex flex-wrap items-center gap-3">
          {status !== "active" ? (
            <form action={statusAction}>
              <input type="hidden" name="id" value={gameId} />
              <input type="hidden" name="status" value="active" />
              <Button type="submit" disabled={statusPending}>
                {statusPending ? "…" : "Activer le jeu"}
              </Button>
            </form>
          ) : (
            <form action={statusAction}>
              <input type="hidden" name="id" value={gameId} />
              <input type="hidden" name="status" value="archived" />
              <Button type="submit" variant="secondary" disabled={statusPending}>
                {statusPending ? "…" : "Archiver"}
              </Button>
            </form>
          )}
          {status === "active" && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              Actif — vous pouvez lancer des sessions live
            </span>
          )}
        </div>
        {status !== "active" && (
          <p className="mt-3 text-sm text-zinc-500">
            Ajoutez au moins une question, puis activez le jeu pour pouvoir lancer
            une session en direct.
          </p>
        )}
        <FieldError
          message={statusState && !statusState.ok ? statusState.error : undefined}
        />
      </div>

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

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Questions</h2>
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

      {adding && (
        <div className="mb-4">
          <QuestionForm
            gameId={gameId}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {questions.length === 0 ? (
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
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteEventQuestion,
    null,
  );
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
          <form action={deleteAction}>
            <input type="hidden" name="id" value={question.id} />
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
  onDone: () => void;
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
        router.refresh();
        onDone();
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

export function EventSessionsSection({
  gameId,
  gameActive,
  sessions,
}: {
  gameId: string;
  gameActive: boolean;
  sessions: EditorSession[];
}) {
  const [creating, setCreating] = useState(false);

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Sessions en direct</h2>
        {!creating && (
          <Button variant="secondary" onClick={() => setCreating(true)}>
            + Nouvelle session
          </Button>
        )}
      </div>
      <p className="mb-4 text-sm text-zinc-500">
        Une session est un déroulé live du jeu, avec son code d&apos;accès et son
        lot. Le nombre de gagnants (stock) est <strong>fini et obligatoire</strong> :
        il plafonne les codes de retrait émis à la fin.
      </p>

      {!gameActive && (
        <p className="mb-4 rounded-xl border-2 border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
          Activez le jeu (au moins une question) pour piloter une session en
          direct.
        </p>
      )}

      {creating && (
        <div className="mb-4">
          <SessionForm
            gameId={gameId}
            onDone={() => setCreating(false)}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {sessions.length === 0 ? (
        !creating && (
          <p className="rounded-xl border-2 border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
            Aucune session. Créez-en une pour animer une soirée.
          </p>
        )
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

function SessionRow({ session }: { session: EditorSession }) {
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteEventSession,
    null,
  );

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
            🎛 Piloter
          </Link>
          <Link
            href={`/event/${session.joinCode}/screen`}
            target="_blank"
            className="rounded-lg border-2 border-k-ink bg-white px-3 py-1.5 text-xs font-bold text-k-ink hover:bg-k-yellow/30"
          >
            📺 Écran
          </Link>
        </div>
      </div>

      <div className="mt-3 border-t border-zinc-200 pt-3">
        <SessionEditForm session={session} />
        <form action={deleteAction} className="mt-2">
          <input type="hidden" name="id" value={session.id} />
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
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(session?.label ?? "");
  const [rewardLabel, setRewardLabel] = useState(session?.rewardLabel ?? "");
  const [rewardDetails, setRewardDetails] = useState(session?.rewardDetails ?? "");
  const [rewardStock, setRewardStock] = useState(session?.rewardStock ?? 1);
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
          })
        : await createEventSession({
            gameId: gameId!,
            label,
            rewardLabel,
            rewardDetails,
            rewardStock,
          });
      if (result.ok) {
        router.refresh();
        onDone();
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
