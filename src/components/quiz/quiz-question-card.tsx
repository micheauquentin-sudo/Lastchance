"use client";

import { useEffect, useMemo, useState } from "react";
import { RankingPicker } from "@/components/ui/ranking-picker";
import {
  quizAnswerLayout,
  quizPresetInfo,
} from "@/components/quiz/quiz-presets";
import type { QuizThemeTokens } from "@/components/quiz/quiz-theme";
import {
  quizTimeRemainingMs,
  type QuizAnswerInput,
  type QuizAnswerResult,
  type QuizPlayableQuestion,
} from "@/lib/quiz";

/**
 * UNE question, telle que le joueur la voit sur son téléphone.
 *
 * NON-FUITE (invariant #2) — deux garanties structurelles :
 *  · `question` est un `QuizPlayableQuestion` : ce type N'A AUCUN champ pour la
 *    bonne réponse. Il n'y a donc rien à oublier de masquer, et ce composant n'a
 *    aucun moyen de la deviner (les `options` ne désignent pas la vérité) ;
 *  · la seule vérité affichée vient de `result.correctAnswer`, c'est-à-dire de la
 *    réponse du SERVEUR à la soumission de CE joueur — jamais avant.
 *
 * CHRONOMÈTRE : purement indicatif. Le décompte est dérivé des instants SERVEUR
 * (`serverNow`, `startedAt`) et non de l'horloge du téléphone ; c'est
 * `submit_quiz_answer` qui, seul, refuse un hors-délai. Le composant est remonté
 * par question (clé = id) : l'état initial du décompte reste donc pur, sans
 * `Date.now()` au rendu — aucun écart d'hydratation.
 */

const inputClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-base text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500";

/** Cadence du décompte : assez fine pour être vivante, assez lâche pour la batterie. */
const TICK_MS = 250;

function formatSeconds(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, "0")}`
    : `${seconds}`;
}

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * Compte à rebours AFFICHABLE. La borne initiale vient des instants serveur
 * (calcul PUR, identique serveur et client) ; seule la décrue seconde par seconde
 * s'appuie sur l'horloge locale, à partir du décalage mesuré à la réception.
 */
function useRemainingMs(
  input: {
    serverNow: string | null;
    startedAt: string | null;
    timeLimitSeconds: number | null;
    receivedAt: number;
  },
  frozen: boolean,
): number | null {
  const baseline = useMemo(
    () =>
      quizTimeRemainingMs({
        serverNow: input.serverNow,
        startedAt: input.startedAt,
        timeLimitSeconds: input.timeLimitSeconds,
      }),
    [input.serverNow, input.startedAt, input.timeLimitSeconds],
  );
  const [remaining, setRemaining] = useState<number | null>(baseline);

  useEffect(() => {
    if (baseline === null || frozen) return;
    const deadline = input.receivedAt + baseline;
    const id = window.setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      setRemaining(left);
      if (left <= 0) window.clearInterval(id);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [baseline, frozen, input.receivedAt]);

  return remaining;
}

function Timer({
  remainingMs,
  limitMs,
  fillClass,
}: {
  remainingMs: number;
  limitMs: number;
  fillClass: string;
}) {
  const ratio = limitMs > 0 ? Math.max(0, Math.min(1, remainingMs / limitMs)) : 0;
  const urgent = remainingMs <= 5000;
  return (
    <div
      // `role="timer"` sans région live : le décompte est LISIBLE à la demande,
      // mais n'interrompt pas le lecteur d'écran toutes les 250 ms. L'événement
      // qui compte (« temps écoulé ») est annoncé séparément, en polite.
      role="timer"
      aria-label="Temps restant"
      className="mb-3"
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-k-body">
          ⏱️ Temps restant
        </span>
        <span
          className={`font-mono text-lg font-black tabular-nums ${
            urgent ? "text-red-600" : "text-k-ink"
          }`}
        >
          {formatSeconds(remainingMs)}
        </span>
      </div>
      <div
        aria-hidden
        className="h-2.5 overflow-hidden rounded-full border-2 border-k-ink bg-white"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none ${
            urgent ? "bg-red-500" : fillClass
          }`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

export function QuizQuestionCard({
  index,
  total,
  question,
  startedAt,
  serverNow,
  receivedAt,
  tokens,
  result,
  submitting,
  nextPending,
  error,
  onSubmit,
  onNext,
  onForfeit,
}: {
  /** Rang de la question dans le quiz (0-based). */
  index: number;
  total: number;
  question: QuizPlayableQuestion;
  /** Instant SERVEUR de présentation (référence du décompte). */
  startedAt: string | null;
  /** Horloge SERVEUR au moment de la présentation. */
  serverNow: string | null;
  /** Horloge LOCALE à la réception de ces instants (neutralise la dérive). */
  receivedAt: number;
  tokens: QuizThemeTokens;
  /** Verdict du serveur : non nul ⇒ l'interface est verrouillée. */
  result: QuizAnswerResult | null;
  submitting: boolean;
  /** Passage à la question suivante en cours (aller-retour serveur). */
  nextPending: boolean;
  error: string | null;
  onSubmit: (answer: QuizAnswerInput) => void;
  onNext: () => void;
  /**
   * Temps écoulé et le joueur ne répond pas : ENREGISTRE une réponse blanche
   * (hors barème, 0 point) au lieu de sauter la question. La question compte
   * ainsi comme répondue — indispensable pour que la récompense reste due.
   */
  onForfeit: () => void;
}) {
  const answered = result !== null;
  const remainingMs = useRemainingMs(
    {
      serverNow,
      startedAt,
      timeLimitSeconds: question.timeLimitSeconds,
      receivedAt,
    },
    answered,
  );
  const limitMs = (question.timeLimitSeconds ?? 0) * 1000;
  // « Écoulé » est un AFFICHAGE : le serveur seul tranche le hors-délai.
  const expired = remainingMs !== null && remainingMs <= 0;

  const [choice, setChoice] = useState("");
  const [order, setOrder] = useState<string[]>([]);
  const [numberValue, setNumberValue] = useState("");
  const [textValue, setTextValue] = useState("");

  const layout = quizAnswerLayout(
    question.preset,
    question.questionType,
    question.options.length,
  );
  const size = question.rankingSize ?? 0;
  const locked = answered || submitting;

  const labelOf = (id: unknown) =>
    question.options.find((o) => o.id === id)?.label ?? String(id);

  const answer = (): QuizAnswerInput | null => {
    switch (question.questionType) {
      case "choice":
        return choice ? { type: "choice", optionId: choice } : null;
      case "ranking":
        return order.length === size && size > 0
          ? { type: "ranking", order }
          : null;
      case "number":
        return numberValue.trim() === ""
          ? null
          : { type: "number", value: Number(numberValue) };
      case "text":
        return textValue.trim() === ""
          ? null
          : { type: "text", value: textValue.trim() };
    }
  };

  const composed = answer();

  /** Réponse officielle, UNIQUEMENT depuis la charge utile du serveur. */
  const officialLabel = (() => {
    if (!result || result.correctAnswer === null || result.correctAnswer === undefined) {
      return null;
    }
    if (question.questionType === "choice") return labelOf(result.correctAnswer);
    if (question.questionType === "ranking") {
      return asStringArray(result.correctAnswer)
        .map((id, i) => `${i + 1}. ${labelOf(id)}`)
        .join(" · ");
    }
    if (question.questionType === "text") {
      const variants = asStringArray(result.correctAnswer);
      return variants.length > 0 ? variants[0] : String(result.correctAnswer);
    }
    return String(result.correctAnswer);
  })();

  const info = quizPresetInfo(question.preset);
  /**
   * Sondage et pronostic : il n'y a RIEN à corriger. Le serveur a bien rendu un
   * `isCorrect` (la colonne `correct_answer` est `not null`, elle porte la
   * première proposition par exigence de forme), mais l'afficher inventerait
   * une bonne réponse à une question d'opinion. On ne montre donc que l'accusé
   * de réception — et jamais `officialLabel`.
   */
  const sansVerite = info.sansVerite;

  return (
    <section
      aria-labelledby="quiz-question-prompt"
      className="k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-black ${tokens.accentChip}`}
        >
          Question {index + 1} / {total}
        </span>
        <span className="text-xs font-bold text-k-body">
          <span aria-hidden>{info.icon} </span>
          {sansVerite
            ? info.label
            : `${question.points} pt${question.points > 1 ? "s" : ""}`}
        </span>
      </div>

      {question.timeLimitSeconds !== null && remainingMs !== null && !answered && (
        <Timer
          remainingMs={remainingMs}
          limitMs={limitMs}
          fillClass={tokens.progressFill}
        />
      )}

      {/* Annonce SOBRE et unique : ce qui mérite d'interrompre un lecteur
          d'écran, c'est la fin du temps, pas chaque seconde. Elle dit aussi la
          conséquence et les deux sorties, comme le texte affiché plus bas. */}
      <p role="status" aria-live="polite" className="sr-only">
        {expired && !answered
          ? "Temps écoulé : cette question ne rapportera plus de point. Vous pouvez envoyer votre réponse quand même, ou passer sans répondre."
          : ""}
      </p>

      {question.imageUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={question.imageUrl}
          alt="Illustration de la question"
          className="mb-4 max-h-64 w-full rounded-xl border-2 border-k-ink bg-k-stripe object-contain"
        />
      )}

      <h2
        id="quiz-question-prompt"
        className="mb-4 text-lg font-black leading-snug text-k-ink"
      >
        {question.prompt}
        {question.timeLimitSeconds !== null && (
          <span className="sr-only">
            {" "}
            — question chronométrée, {question.timeLimitSeconds} secondes.
          </span>
        )}
      </h2>

      {/* ── Vrai / Faux : deux grands boutons, pouce sur l'écran ── */}
      {layout === "duo" && (
        <fieldset disabled={locked} className="grid grid-cols-2 gap-3">
          <legend className="sr-only">{question.prompt}</legend>
          {question.options.map((option) => {
            const active = choice === option.id;
            return (
              <label
                key={option.id}
                className={`flex cursor-pointer items-center justify-center rounded-2xl px-3 py-6 text-base font-black transition-colors ${
                  active ? tokens.optionActive : tokens.optionIdle
                }`}
              >
                <input
                  type="radio"
                  name="quiz-answer"
                  value={option.id}
                  checked={active}
                  onChange={() => setChoice(option.id)}
                  className="sr-only"
                />
                {option.label}
              </label>
            );
          })}
        </fieldset>
      )}

      {/* ── Choix parmi N options ── */}
      {layout === "list" && (
        <fieldset disabled={locked} className="space-y-2">
          <legend className="sr-only">{question.prompt}</legend>
          {question.options.map((option) => {
            const active = choice === option.id;
            return (
              <label
                key={option.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition-colors ${
                  active ? tokens.optionActive : tokens.optionIdle
                }`}
              >
                <input
                  type="radio"
                  name="quiz-answer"
                  value={option.id}
                  checked={active}
                  onChange={() => setChoice(option.id)}
                  className="h-4 w-4 shrink-0 accent-k-ink"
                />
                <span className="min-w-0 break-words">{option.label}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      {/* ── Classement (taps successifs, aucun glisser-déposer) ── */}
      {layout === "ranking" && (
        <div>
          <p className="mb-2 text-sm font-bold text-k-ink">
            Composez votre top {size}
          </p>
          <RankingPicker
            options={question.options}
            size={size}
            value={order}
            onChange={setOrder}
            disabled={locked}
          />
        </div>
      )}

      {/* ── Estimation chiffrée ── */}
      {layout === "number" && (
        <div>
          <label
            htmlFor="quiz-answer-number"
            className="mb-1.5 block text-sm font-bold text-k-ink"
          >
            Votre estimation
          </label>
          <input
            id="quiz-answer-number"
            type="number"
            step="any"
            inputMode="decimal"
            value={numberValue}
            onChange={(e) => setNumberValue(e.target.value)}
            disabled={locked}
            className={inputClass}
            aria-describedby={
              question.tolerance !== null ? "quiz-answer-number-help" : undefined
            }
          />
          {question.tolerance !== null && (
            <p id="quiz-answer-number-help" className="mt-1.5 text-xs text-k-body">
              Une réponse à ±{question.tolerance} près est acceptée.
            </p>
          )}
        </div>
      )}

      {/* ── Réponse libre ── */}
      {layout === "text" && (
        <div>
          <label
            htmlFor="quiz-answer-text"
            className="mb-1.5 block text-sm font-bold text-k-ink"
          >
            Votre réponse
          </label>
          <input
            id="quiz-answer-text"
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            disabled={locked}
            maxLength={200}
            autoComplete="off"
            className={inputClass}
            aria-describedby="quiz-answer-text-help"
          />
          <p id="quiz-answer-text-help" className="mt-1.5 text-xs text-k-body">
            Les accents, la casse et la ponctuation n&apos;ont pas
            d&apos;importance.
          </p>
        </div>
      )}

      {/* ── Envoi (une seule fois) ── */}
      {!answered && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => {
              if (composed) onSubmit(composed);
            }}
            disabled={submitting || composed === null}
            className="k-btn w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting
              ? "Envoi…"
              : expired
                ? "Envoyer quand même"
                : "Valider ma réponse"}
          </button>
          {expired && (
            <>
              <p className="mt-2 text-center text-sm font-bold text-red-600">
                {sansVerite
                  ? "⏱️ Temps écoulé — vous pouvez encore donner votre avis."
                  : "⏱️ Temps écoulé — cette question ne rapportera plus aucun point, que vous répondiez ou non."}
              </p>
              <button
                type="button"
                onClick={onForfeit}
                disabled={submitting}
                className="mt-2 w-full rounded-xl border-2 border-k-ink bg-white px-4 py-2.5 text-sm font-bold text-k-ink hover:bg-k-yellow/30 disabled:pointer-events-none disabled:opacity-60"
              >
                Passer sans répondre
              </button>
              <p className="mt-1.5 text-center text-xs text-k-body">
                Elle sera enregistrée sans réponse : votre score ne bouge pas et
                votre parcours reste complet pour la récompense.
              </p>
            </>
          )}
          <p className="mt-3 text-center text-[11px] font-mono text-k-body/70">
            Une seule réponse par question · correction côté serveur
          </p>
        </div>
      )}

      {/* ── Correction immédiate (annoncée aux lecteurs d'écran) ── */}
      {result && (
        <div
          role="status"
          aria-live="polite"
          className={`mt-5 rounded-xl border-2 p-4 ${
            sansVerite
              ? "border-k-ink/30 bg-white"
              : result.isCorrect
                ? "border-k-green bg-k-green/10"
                : "border-k-ink/30 bg-k-stripe"
          }`}
        >
          <p className="text-base font-black text-k-ink">
            {sansVerite
              ? "📊 C'est noté, merci !"
              : result.isCorrect
                ? "✓ Bonne réponse !"
                : "✕ Ce n'était pas ça."}
            {!sansVerite &&
              result.pointsAwarded !== null &&
              result.pointsAwarded > 0 && (
                <span className="ml-2 rounded-full border-2 border-k-ink bg-k-yellow px-2 py-0.5 text-xs font-black">
                  +{result.pointsAwarded} pt{result.pointsAwarded > 1 ? "s" : ""}
                </span>
              )}
          </p>
          {sansVerite && (
            <p className="mt-1 text-sm font-bold text-k-body">
              Il n&apos;y a pas de bonne réponse ici : cette question ne compte
              pas dans votre score.
            </p>
          )}
          {!sansVerite && result.timedOut && (
            <p className="mt-1 text-sm font-bold text-red-700">
              Réponse hors délai : elle ne rapporte pas de point.
            </p>
          )}
          {!sansVerite && officialLabel && !result.isCorrect && (
            <p className="mt-2 text-sm font-bold text-k-ink">
              La bonne réponse était : {officialLabel}
            </p>
          )}
          {result.elapsedMs !== null && (
            <p className="mt-1 text-xs text-k-body">
              Répondu en {formatElapsed(result.elapsedMs)}.
            </p>
          )}
          <button
            type="button"
            onClick={onNext}
            disabled={nextPending}
            className="k-btn-sm mt-4 w-full rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-3 text-sm font-black text-k-ink disabled:pointer-events-none disabled:opacity-60"
          >
            {nextPending
              ? "Un instant…"
              : index + 1 >= total
                ? "Voir mon résultat →"
                : "Question suivante →"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-bold text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
