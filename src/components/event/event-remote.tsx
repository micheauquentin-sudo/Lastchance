"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  endEventSession,
  launchEventQuestion,
  lockEventQuestion,
  revealEventQuestion,
  showEventLeaderboard,
  startEventSession,
} from "@/actions/events";
import type { EventPublicState } from "@/lib/event";
import type { EventRemoteQuestion } from "@/lib/event-context";
import type { EventSessionPhase, EventSessionStatus } from "@/types/database";
import { computeDistribution, eventQuestionTypeMeta } from "./event-view-state";
import { useEventPoll } from "./use-event-poll";

/**
 * Télécommande organisateur du Mode événement en direct (owner/editor). Pilote
 * la machine à états (démarrer, lancer, verrouiller, révéler, classement,
 * terminer) et affiche une vue miroir compacte de l'écran public. Chaque bouton
 * appelle l'action puis re-poll l'état + rafraîchit la vue serveur (statut des
 * questions déjà jouées).
 *
 * Un état draft n'est pas encore « public » (getEventState renvoie indisponible) :
 * on s'appuie alors sur le statut chargé côté serveur, puis on bascule sur le
 * polling dès que la session est démarrée.
 */
export function EventRemote({
  sessionId,
  joinCode,
  screenUrl,
  playUrl,
  sessionTitle,
  initialStatus,
  initialPhase,
  questions,
  initialPublicState,
}: {
  sessionId: string;
  joinCode: string;
  screenUrl: string;
  playUrl: string;
  sessionTitle: string;
  initialStatus: EventSessionStatus;
  initialPhase: EventSessionPhase;
  questions: EventRemoteQuestion[];
  initialPublicState: EventPublicState;
}) {
  const router = useRouter();
  const { state, refresh } = useEventPoll(sessionId, initialPublicState);

  // Vérité effective : le polling fait foi dès qu'il répond ok (session
  // démarrée) ; sinon on retombe sur le statut/phase chargés côté serveur.
  const live = state.state === "ok" && state.session ? state.session : null;
  const status: EventSessionStatus = live?.status ?? initialStatus;
  const phase: EventSessionPhase = live?.phase ?? initialPhase;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const result = await fn();
        if (!result.ok) {
          setError(result.error ?? "Action impossible.");
        } else {
          setCorrectOptionId(null);
          refresh();
          router.refresh();
        }
      } catch {
        setError("Connexion perdue. Réessayez.");
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh, router],
  );

  const currentQuestion = state.question;
  const answered = computeDistribution(state.distribution).totalVotes;

  return (
    <div className="space-y-6">
      {/* En-tête : session + accès écran/lien de jeu */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{sessionTitle}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Code d&apos;accès :{" "}
            <span className="font-mono font-bold tracking-widest text-k-ink">
              {joinCode}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={screenUrl}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-bold text-k-ink"
          >
            📺 Écran de salle
          </Link>
          <Link
            href={playUrl}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-k-ink bg-white px-4 py-2.5 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
          >
            📱 Page joueur
          </Link>
        </div>
      </div>

      {/* Bandeau d'état courant */}
      <div className="rounded-2xl border-2 border-k-ink bg-k-ink px-5 py-4 text-k-bg">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full border-2 border-k-yellow px-3 py-1 text-sm font-black text-k-yellow">
            {phaseLabel(status, phase)}
          </span>
          {(phase === "question_active" || phase === "question_locked") && (
            <span className="text-sm font-bold text-k-bg/70 tabular-nums">
              {phase === "question_locked" || answered > 0
                ? `${answered} réponse${answered > 1 ? "s" : ""} reçue${answered > 1 ? "s" : ""}`
                : "Réponses en cours…"}
            </span>
          )}
        </div>
        {currentQuestion && (
          <p className="mt-2 text-lg font-black leading-tight">
            {eventQuestionTypeMeta(currentQuestion.questionType).emoji}{" "}
            {currentQuestion.prompt}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {error}
        </p>
      )}

      {/* Contrôles contextuels */}
      {status === "ended" ? (
        <div className="rounded-2xl border-2 border-k-ink bg-white p-5 text-center shadow-[4px_4px_0_rgba(33,29,22,0.9)]">
          <p className="text-lg font-black text-k-ink">🎬 Session terminée</p>
          <p className="mt-1 text-sm text-zinc-500">
            Le podium final est affiché à l&apos;écran. Les gagnants récupèrent
            leur lot en caisse.
          </p>
        </div>
      ) : status === "draft" ? (
        <ControlCard title="Démarrer" hint="Ouvre le salon : les joueurs peuvent rejoindre avec le code ou le QR.">
          <PrimaryButton
            busy={busy}
            onClick={() => run(() => startEventSession({ sessionId }))}
          >
            ▶ Démarrer la session
          </PrimaryButton>
        </ControlCard>
      ) : phase === "question_active" ? (
        <ControlCard title="Question en cours" hint="Verrouillez quand le temps est écoulé pour figer les réponses.">
          <PrimaryButton
            busy={busy}
            onClick={() => run(() => lockEventQuestion({ sessionId }))}
          >
            🔒 Verrouiller les réponses
          </PrimaryButton>
        </ControlCard>
      ) : phase === "question_locked" ? (
        <ControlCard
          title="Révéler la réponse"
          hint={
            currentQuestion?.questionType === "prono"
              ? "Pronostic : désignez la bonne réponse avant de révéler."
              : "Affiche la bonne réponse et la répartition à l'écran."
          }
        >
          {currentQuestion?.questionType === "prono" && (
            <fieldset className="mb-3 space-y-1.5">
              <legend className="mb-1 text-sm font-bold text-k-ink">
                Quelle était la bonne réponse ?
              </legend>
              {currentQuestion.options.map((opt) => (
                <label
                  key={opt.id}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-k-ink px-3 py-2 text-sm font-bold text-k-ink has-[:checked]:bg-k-yellow/30"
                >
                  <input
                    type="radio"
                    name="prono-correct"
                    value={opt.id}
                    checked={correctOptionId === opt.id}
                    onChange={() => setCorrectOptionId(opt.id)}
                    className="h-4 w-4 accent-k-ink"
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>
          )}
          <PrimaryButton
            busy={busy}
            disabled={
              currentQuestion?.questionType === "prono" && !correctOptionId
            }
            onClick={() =>
              run(() =>
                revealEventQuestion({
                  sessionId,
                  correctOptionId:
                    currentQuestion?.questionType === "prono"
                      ? (correctOptionId ?? undefined)
                      : undefined,
                }),
              )
            }
          >
            👁 Révéler
          </PrimaryButton>
        </ControlCard>
      ) : phase === "reveal" ? (
        <ControlCard title="Et ensuite ?" hint="Affichez le classement, ou enchaînez directement sur la question suivante.">
          <div className="flex flex-wrap gap-2">
            <PrimaryButton
              busy={busy}
              onClick={() => run(() => showEventLeaderboard({ sessionId }))}
            >
              🏆 Afficher le classement
            </PrimaryButton>
          </div>
          <QuestionLauncher
            questions={questions}
            busy={busy}
            onLaunch={(questionId) =>
              run(() => launchEventQuestion({ sessionId, questionId }))
            }
          />
          <EndButton busy={busy} onEnd={() => run(() => endEventSession({ sessionId }))} />
        </ControlCard>
      ) : (
        // phase lobby ou leaderboard : lancer une question / terminer
        <ControlCard
          title={phase === "leaderboard" ? "Question suivante" : "Lancer une question"}
          hint="Sélectionnez la question à envoyer à l'écran et aux téléphones."
        >
          <QuestionLauncher
            questions={questions}
            busy={busy}
            onLaunch={(questionId) =>
              run(() => launchEventQuestion({ sessionId, questionId }))
            }
          />
          <EndButton busy={busy} onEnd={() => run(() => endEventSession({ sessionId }))} />
        </ControlCard>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sous-composants
// ────────────────────────────────────────────────────────────

function phaseLabel(status: EventSessionStatus, phase: EventSessionPhase): string {
  if (status === "draft") return "Brouillon — à démarrer";
  if (status === "ended") return "Terminé";
  switch (phase) {
    case "question_active":
      return "🟢 Question en cours";
    case "question_locked":
      return "🔒 Réponses closes";
    case "reveal":
      return "👁 Révélation";
    case "leaderboard":
      return "🏆 Classement";
    case "lobby":
    default:
      return "🟡 Salon d'attente";
  }
}

function ControlCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-k-ink bg-white p-5 shadow-[4px_4px_0_rgba(33,29,22,0.9)]">
      <h2 className="font-black text-k-ink">{title}</h2>
      <p className="mb-4 mt-0.5 text-sm text-zinc-500">{hint}</p>
      {children}
    </div>
  );
}

function PrimaryButton({
  busy,
  disabled,
  onClick,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="k-btn rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-3.5 text-base font-black uppercase tracking-wide text-k-ink disabled:pointer-events-none disabled:opacity-50"
    >
      {busy ? "…" : children}
    </button>
  );
}

function QuestionLauncher({
  questions,
  busy,
  onLaunch,
}: {
  questions: EventRemoteQuestion[];
  busy: boolean;
  onLaunch: (questionId: string) => void;
}) {
  if (questions.length === 0) {
    return (
      <p className="mt-3 rounded-xl border-2 border-dashed border-zinc-300 px-3 py-4 text-center text-sm text-zinc-500">
        Ce jeu n&apos;a aucune question. Ajoutez-en dans l&apos;éditeur avant de
        jouer.
      </p>
    );
  }
  return (
    <ul className="mt-3 space-y-2">
      {questions.map((q, i) => {
        const meta = eventQuestionTypeMeta(q.questionType);
        return (
          <li
            key={q.id}
            className="flex items-center justify-between gap-3 rounded-xl border-2 border-k-ink/15 bg-zinc-50 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-k-ink">
                {i + 1}. {q.prompt}
              </p>
              <p className="text-xs font-bold text-zinc-500">
                {meta.emoji} {meta.label}
                {q.alreadyPlayed && " · déjà jouée"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onLaunch(q.id)}
              disabled={busy || q.alreadyPlayed}
              className="shrink-0 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink disabled:pointer-events-none disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-400"
            >
              {q.alreadyPlayed ? "Jouée" : "Lancer"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function EndButton({ busy, onEnd }: { busy: boolean; onEnd: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="mt-4 border-t border-zinc-100 pt-4">
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-k-body">
            Terminer et afficher le podium final ?
          </span>
          <button
            type="button"
            onClick={onEnd}
            disabled={busy}
            className="rounded-xl border-2 border-k-ink bg-red-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
          >
            {busy ? "…" : "Confirmer"}
          </button>
          <button
            type="button"
            onClick={() => setConfirm(false)}
            disabled={busy}
            className="rounded-xl px-3 py-2 text-sm font-bold text-k-body hover:bg-zinc-100"
          >
            Annuler
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="text-sm font-bold text-red-600 hover:underline"
        >
          Terminer la session
        </button>
      )}
    </div>
  );
}
