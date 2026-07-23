"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { joinEvent, submitEventAnswer } from "@/actions/events";
import {
  AVATAR_GROUPS,
  Avatar,
  avatarLabel,
  DEFAULT_AVATAR,
  type AvatarId,
} from "@/lib/avatars";
import type { EventPublicState } from "@/lib/event";
import type { EventSubmitState } from "@/types/database";
import {
  computeCountdown,
  eventQuestionTypeMeta,
  viewForPhase,
} from "./event-view-state";
import { useEventPoll } from "./use-event-poll";

/**
 * Parcours joueur (téléphone) du Mode événement en direct — mobile-first : le
 * client arrive en scannant le QR du commerce. Écran de saisie pseudo + avatar,
 * puis suivi des phases par polling (aucune dépendance Realtime). Le scoring est
 * serveur : ce composant n'affiche JAMAIS la justesse avant la révélation.
 *
 * DA « Kermesse » (crème/encre/jaune), même famille que le passeport et le
 * jackpot. Boutons de réponse larges et tactiles, focus visibles, régions vivantes
 * annoncées aux lecteurs d'écran.
 */
export function EventPlayer({
  sessionId,
  joinCode,
  organizationName,
  logoUrl,
  title,
  initial,
  hasIdentity,
}: {
  sessionId: string;
  joinCode: string;
  organizationName: string;
  logoUrl: string | null;
  title: string;
  initial: EventPublicState;
  hasIdentity: boolean;
}) {
  const { state, refresh } = useEventPoll(sessionId, initial);
  const [joined, setJoined] = useState(hasIdentity);

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <header className="mb-6 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={organizationName}
            width={56}
            height={56}
            className="mx-auto mb-3 h-14 w-14 rounded-full border-2 border-k-ink bg-white object-cover"
          />
        ) : (
          <div className="mx-auto mb-3 text-4xl" aria-hidden>
            🎬
          </div>
        )}
        <p className="text-xs font-bold uppercase tracking-wide text-k-body">
          {organizationName}
        </p>
        <h1 className="mt-1 text-2xl font-black leading-tight text-k-ink">{title}</h1>
      </header>

      {joined ? (
        <PlayingArea sessionId={sessionId} state={state} onAfterAction={refresh} />
      ) : (
        <JoinForm
          joinCode={joinCode}
          onJoined={() => {
            setJoined(true);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Écran de saisie (pseudo + avatar)
// ────────────────────────────────────────────────────────────

function JoinForm({
  joinCode,
  onJoined,
}: {
  joinCode: string;
  onJoined: () => void;
}) {
  const [pseudo, setPseudo] = useState("");
  const [avatar, setAvatar] = useState<AvatarId>(DEFAULT_AVATAR);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await joinEvent({ joinCode, pseudo, avatar });
      if (result.ok && result.data.state === "joined") {
        onJoined();
        return;
      }
      setError(
        result.ok && result.data.state === "invalid_pseudo"
          ? "Choisissez un pseudo (1 à 24 caractères)."
          : result.ok
            ? "Cet événement n'est pas ouvert aux inscriptions pour le moment."
            : result.error,
      );
    } catch {
      setError("Connexion perdue. Vérifiez votre réseau puis réessayez.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]"
    >
      <h2 className="mb-1 text-lg font-black text-k-ink">Rejoindre la partie</h2>
      <p className="mb-4 text-sm text-k-body">
        Choisissez votre pseudo et votre avatar : ils apparaîtront à l&apos;écran.
      </p>

      <div className="mb-4">
        <label htmlFor="event-pseudo" className="mb-1.5 block text-sm font-bold text-k-ink">
          Votre pseudo
        </label>
        <input
          id="event-pseudo"
          name="pseudo"
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value.slice(0, 24))}
          maxLength={24}
          required
          autoComplete="off"
          autoCapitalize="words"
          placeholder="Ex : Team Zinzin"
          className="w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-base font-bold text-k-ink placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
        />
      </div>

      <AvatarPicker value={avatar} onChange={setAvatar} />

      <button
        type="submit"
        disabled={pending}
        className="k-btn mt-5 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
      >
        {pending ? "Connexion…" : "C'est parti !"}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-center text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}

type AvatarGroupKey = (typeof AVATAR_GROUPS)[number]["key"];

/** Sélecteur d'avatar (miroir du module Pronostics). */
function AvatarPicker({
  value,
  onChange,
}: {
  value: AvatarId;
  onChange: (id: AvatarId) => void;
}) {
  const [groupKey, setGroupKey] = useState<AvatarGroupKey>(
    () =>
      AVATAR_GROUPS.find((g) => (g.ids as readonly AvatarId[]).includes(value))
        ?.key ?? AVATAR_GROUPS[0].key,
  );
  const group = AVATAR_GROUPS.find((g) => g.key === groupKey) ?? AVATAR_GROUPS[0];

  return (
    <div>
      <span className="mb-1.5 block text-sm font-bold text-k-ink">Votre avatar</span>
      <div className="mb-2 flex gap-1.5" role="tablist" aria-label="Familles d'avatars">
        {AVATAR_GROUPS.map((g) => {
          const active = g.key === groupKey;
          return (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setGroupKey(g.key)}
              className={
                active
                  ? "rounded-full border-2 border-k-ink bg-k-yellow px-3 py-1 text-xs font-black text-k-ink"
                  : "rounded-full border-2 border-transparent bg-zinc-100 px-3 py-1 text-xs font-bold text-k-body hover:bg-zinc-200"
              }
            >
              {g.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-6 gap-2">
        {group.ids.map((id) => {
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-pressed={active}
              aria-label={avatarLabel(id)}
              title={avatarLabel(id)}
              className={
                active
                  ? "rounded-full ring-2 ring-k-ink ring-offset-2 ring-offset-white transition"
                  : "rounded-full opacity-70 transition hover:opacity-100"
              }
            >
              <Avatar id={id} className="h-full w-full" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Zone de jeu (suit les phases)
// ────────────────────────────────────────────────────────────

function PlayingArea({
  sessionId,
  state,
  onAfterAction,
}: {
  sessionId: string;
  state: EventPublicState;
  onAfterAction: () => void;
}) {
  const view = viewForPhase(state.session?.phase ?? "lobby");
  const me = state.you;

  // Mémoire locale de l'option choisie pour la QUESTION courante : sert au retour
  // « tu as répondu » puis à la comparaison au reveal. Réinitialisée dès que la
  // question change (nouvelle question lancée).
  const questionId = state.question?.id ?? null;
  const [answeredFor, setAnsweredFor] = useState<{
    questionId: string;
    optionId: string;
  } | null>(null);

  const myAnswerForCurrent =
    answeredFor && answeredFor.questionId === questionId ? answeredFor.optionId : null;

  return (
    <div>
      <MyBadge me={me} />

      {view === "lobby" && <LobbyWait />}
      {(view === "question" || view === "locked") && (
        <QuestionPlay
          sessionId={sessionId}
          state={state}
          locked={view === "locked"}
          myAnswer={myAnswerForCurrent}
          onAnswered={(optionId) => {
            if (questionId) setAnsweredFor({ questionId, optionId });
            onAfterAction();
          }}
        />
      )}
      {view === "reveal" && (
        <RevealPlay state={state} myAnswer={myAnswerForCurrent} />
      )}
      {view === "leaderboard" && <LeaderboardPlay me={me} />}
      {view === "ended" && <EndedPlay state={state} />}
    </div>
  );
}

function MyBadge({ me }: { me: EventPublicState["you"] }) {
  if (!me) return null;
  return (
    <div className="mb-4 flex items-center justify-center gap-2 text-sm font-bold text-k-body">
      <span className="tabular-nums">Score : {me.score}</span>
      {me.rank > 0 && (
        <>
          <span aria-hidden>·</span>
          <span className="tabular-nums">
            Rang {me.rank}
          </span>
        </>
      )}
    </div>
  );
}

function LobbyWait() {
  return (
    <div
      role="status"
      className="k-border rounded-2xl bg-white p-6 text-center shadow-[6px_6px_0_var(--color-k-ink)]"
    >
      <p className="text-4xl motion-safe:animate-pulse" aria-hidden>
        ⏳
      </p>
      <h2 className="mt-3 text-lg font-black text-k-ink">
        Vous êtes dans la place !
      </h2>
      <p className="mt-1 text-sm font-bold text-k-body">
        En attente du lancement par l&apos;animateur… Gardez cet écran ouvert.
      </p>
    </div>
  );
}

// ── Question : boutons de réponse tactiles ──

/** Horloge locale rafraîchie ~2×/s pour le chrono joueur (arrêtée si inutile). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

const SUBMIT_ERROR: Partial<Record<EventSubmitState, string>> = {
  locked: "Trop tard : les réponses sont closes.",
  already_answered: "Vous avez déjà répondu à cette question.",
  not_joined: "Vous n'êtes plus inscrit à cette partie.",
  invalid_option: "Cette réponse n'est plus valide.",
  unavailable: "Réponse indisponible pour le moment.",
};

function QuestionPlay({
  sessionId,
  state,
  locked,
  myAnswer,
  onAnswered,
}: {
  sessionId: string;
  state: EventPublicState;
  locked: boolean;
  myAnswer: string | null;
  onAnswered: (optionId: string) => void;
}) {
  const question = state.question;
  const now = useNow(!locked && Boolean(question) && !myAnswer);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!question) {
    return (
      <div className="k-border rounded-2xl bg-white p-6 text-center shadow-[6px_6px_0_var(--color-k-ink)]">
        <p className="font-bold text-k-body">Préparation de la question…</p>
      </div>
    );
  }

  const meta = eventQuestionTypeMeta(question.questionType);
  const countdown = computeCountdown(question.startedAt, question.timeLimitSeconds, now);
  const answered = Boolean(myAnswer);
  const disabled = locked || answered || countdown.expired;

  const choose = async (optionId: string) => {
    if (disabled || pending) return;
    setPending(optionId);
    setError(null);
    try {
      const result = await submitEventAnswer({
        sessionId,
        questionId: question.id,
        optionId,
      });
      if (result.ok && result.data.state === "recorded") {
        onAnswered(optionId);
      } else if (result.ok && result.data.state === "already_answered") {
        // Déjà pris en compte (double tap / reprise) : on considère répondu.
        onAnswered(optionId);
      } else {
        setError(
          result.ok
            ? (SUBMIT_ERROR[result.data.state] ?? "Réponse non enregistrée.")
            : result.error,
        );
      }
    } catch {
      setError("Connexion perdue. Réessayez.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]">
      <p className="text-xs font-black uppercase tracking-wide text-k-body">
        {meta.emoji} {meta.label}
      </p>
      <h2 className="mt-1 mb-3 text-xl font-black leading-tight text-k-ink">
        {question.prompt}
      </h2>

      {!disabled && (
        <div aria-hidden className="mb-4">
          <div className="h-2 overflow-hidden rounded-full border-2 border-k-ink bg-white">
            <div
              className="h-full rounded-full bg-k-yellow transition-[width] duration-500 ease-linear"
              style={{ width: `${Math.max(0, countdown.remainingRatio * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-center text-xs font-bold text-k-body tabular-nums">
            {countdown.secondsLeft} s
          </p>
        </div>
      )}

      <ul className="space-y-2.5">
        {question.options.map((opt) => {
          const mine = myAnswer === opt.id;
          return (
            <li key={opt.id}>
              <button
                type="button"
                onClick={() => choose(opt.id)}
                disabled={disabled || pending !== null}
                aria-pressed={mine}
                className={`w-full rounded-2xl border-2 border-k-ink px-4 py-4 text-left text-base font-black transition disabled:cursor-not-allowed ${
                  mine
                    ? "bg-k-green/25 text-k-ink"
                    : disabled
                      ? "bg-zinc-50 text-k-body opacity-70"
                      : "bg-white text-k-ink hover:bg-k-yellow/30"
                }`}
              >
                {mine && "✓ "}
                {opt.label}
                {pending === opt.id && " …"}
              </button>
            </li>
          );
        })}
      </ul>

      <div aria-live="polite" className="mt-3 text-center">
        {answered ? (
          <p className="rounded-xl border-2 border-k-ink bg-k-blue/20 px-3 py-2 text-sm font-black text-k-ink">
            ✅ Réponse enregistrée — attendez la suite !
          </p>
        ) : locked ? (
          <p className="text-sm font-bold text-k-body">⏹ Les réponses sont closes.</p>
        ) : countdown.expired ? (
          <p className="text-sm font-bold text-k-body">⏱ Temps écoulé.</p>
        ) : null}
        {error && (
          <p role="alert" className="mt-2 text-sm font-semibold text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Révélation : as-tu eu juste ? ──

function RevealPlay({
  state,
  myAnswer,
}: {
  state: EventPublicState;
  myAnswer: string | null;
}) {
  const question = state.question;
  const isPoll = question?.questionType === "poll";
  const correctId = state.correctOptionId;
  const correctOption = question?.options.find((o) => o.id === correctId) ?? null;

  // Justesse connue uniquement si l'on a mémorisé la réponse de CE téléphone.
  const outcome =
    isPoll || !myAnswer || !correctId
      ? "unknown"
      : myAnswer === correctId
        ? "correct"
        : "wrong";

  return (
    <div
      role="status"
      className="k-border rounded-2xl bg-white p-6 text-center shadow-[6px_6px_0_var(--color-k-ink)]"
    >
      {isPoll ? (
        <>
          <p className="text-4xl" aria-hidden>
            📊
          </p>
          <h2 className="mt-2 text-lg font-black text-k-ink">Résultats du sondage</h2>
          <p className="mt-1 text-sm font-bold text-k-body">
            Regardez l&apos;écran : la répartition des votes s&apos;affiche en direct.
          </p>
        </>
      ) : outcome === "correct" ? (
        <>
          <p className="text-4xl" aria-hidden>
            🎉
          </p>
          <h2 className="mt-2 text-lg font-black text-k-ink">Bonne réponse !</h2>
          <p className="mt-1 text-sm font-bold text-k-body">
            Bien joué — vous marquez des points.
          </p>
        </>
      ) : outcome === "wrong" ? (
        <>
          <p className="text-4xl" aria-hidden>
            😬
          </p>
          <h2 className="mt-2 text-lg font-black text-k-ink">Pas cette fois…</h2>
          {correctOption && (
            <p className="mt-1 text-sm font-bold text-k-body">
              La bonne réponse était :{" "}
              <span className="text-k-ink">{correctOption.label}</span>
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-4xl" aria-hidden>
            👀
          </p>
          <h2 className="mt-2 text-lg font-black text-k-ink">Révélation</h2>
          {correctOption ? (
            <p className="mt-1 text-sm font-bold text-k-body">
              La bonne réponse : <span className="text-k-ink">{correctOption.label}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm font-bold text-k-body">
              Regardez l&apos;écran pour la bonne réponse.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Classement : ton rang ──

function LeaderboardPlay({ me }: { me: EventPublicState["you"] }) {
  return (
    <div
      role="status"
      className="k-border rounded-2xl bg-white p-6 text-center shadow-[6px_6px_0_var(--color-k-ink)]"
    >
      <p className="text-4xl" aria-hidden>
        🏆
      </p>
      <h2 className="mt-2 text-lg font-black text-k-ink">Classement</h2>
      {me && me.rank > 0 ? (
        <p className="mt-2 text-sm font-bold text-k-body">
          Vous êtes{" "}
          <span className="text-2xl font-black text-k-ink tabular-nums">{me.rank}ᵉ</span>{" "}
          avec <span className="font-black text-k-ink tabular-nums">{me.score}</span> pt
          {me.score > 1 ? "s" : ""}.
        </p>
      ) : (
        <p className="mt-2 text-sm font-bold text-k-body">
          Le classement s&apos;affiche sur l&apos;écran de la salle.
        </p>
      )}
    </div>
  );
}

// ── Fin : classement final + code de retrait ──

// Partage natif / hydratation sans écart d'hydratation (serveur → false).
const emptySubscribe = () => () => {};
const useCanShare = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => typeof navigator !== "undefined" && "share" in navigator,
    () => false,
  );

function EndedPlay({ state }: { state: EventPublicState }) {
  const me = state.you;
  const win = me?.win ?? null;

  return (
    <div className="space-y-4">
      <div
        role="status"
        className="k-border rounded-2xl bg-white p-6 text-center shadow-[6px_6px_0_var(--color-k-ink)]"
      >
        <p className="text-4xl" aria-hidden>
          🎬
        </p>
        <h2 className="mt-2 text-lg font-black text-k-ink">C&apos;est terminé !</h2>
        {me && me.rank > 0 ? (
          <p className="mt-2 text-sm font-bold text-k-body">
            Classement final :{" "}
            <span className="text-2xl font-black text-k-ink tabular-nums">
              {me.rank}ᵉ
            </span>{" "}
            · <span className="font-black text-k-ink tabular-nums">{me.score}</span> pt
            {me.score > 1 ? "s" : ""}
          </p>
        ) : (
          <p className="mt-2 text-sm font-bold text-k-body">
            Merci d&apos;avoir joué !
          </p>
        )}
      </div>

      {win && <WinCard rank={win.rank} code={win.code} />}
    </div>
  );
}

function WinCard({ rank, code }: { rank: number; code: string }) {
  const canShare = useCanShare();
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (resetRef.current) clearTimeout(resetRef.current);
      resetRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : le code reste lisible.
    }
  }, [code]);

  const share = useCallback(async () => {
    try {
      await navigator.share({
        text: `J'ai gagné à l'événement ! Mon code à présenter en caisse : ${code}`,
      });
    } catch {
      // Partage annulé : rien à faire.
    }
  }, [code]);

  useEffect(
    () => () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    },
    [],
  );

  return (
    <div className="k-border rounded-2xl bg-white p-6 text-center shadow-[6px_6px_0_var(--color-k-ink)]">
      <p className="inline-flex rounded-full border-2 border-k-ink bg-k-green/20 px-3 py-0.5 text-[11px] font-black uppercase text-k-ink">
        🏆 {rank}ᵉ place — lot gagné
      </p>
      <p className="mt-3 text-[11px] font-mono uppercase tracking-[0.25em] text-k-body">
        Votre code de retrait
      </p>
      <p className="mt-1 break-all font-mono text-3xl font-black tracking-wider text-k-ink">
        {code}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="k-btn-sm rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink"
        >
          {copied ? "Copié !" : "Copier le code"}
        </button>
        {canShare && (
          <button
            type="button"
            onClick={share}
            className="rounded-xl border-2 border-k-ink bg-white px-4 py-2 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
          >
            Partager
          </button>
        )}
      </div>
      <p className="mt-3 text-sm font-bold text-k-body">
        Présentez ce code en caisse pour récupérer votre lot.
      </p>
    </div>
  );
}
