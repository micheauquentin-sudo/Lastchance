"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/lib/avatars";
import type { EventPublicState } from "@/lib/event";
import { EventJoinQr } from "./event-qr";
import {
  computeCountdown,
  computeDistribution,
  eventQuestionTypeMeta,
  sortLeaderboard,
  viewForPhase,
  type EventDistributionBar,
} from "./event-view-state";
import { useEventPoll } from "./use-event-poll";

/**
 * Écran de salle du Mode événement en direct — pensé pour un téléviseur / vidéo-
 * projecteur : fond sombre, très grande typographie, aucune interaction requise.
 * Toutes les phases sont pilotées par le polling de l'état public (aucune
 * dépendance Realtime). Le chrono est purement visuel (le scoring est serveur).
 *
 * Accessibilité : palette encre/crème à fort contraste, animations sous
 * motion-safe uniquement (les routes publiques sont scannées par axe), curseur
 * masqué après inactivité.
 */
export function EventScreen({
  sessionId,
  joinCode,
  joinUrl,
  organizationName,
  logoUrl,
  title,
  initial,
}: {
  sessionId: string;
  joinCode: string;
  joinUrl: string;
  organizationName: string;
  logoUrl: string | null;
  title: string;
  initial: EventPublicState;
}) {
  const { state } = useEventPoll(sessionId, initial);
  const phase = state.session?.phase ?? "lobby";
  const view = viewForPhase(phase);

  // Curseur masqué après inactivité (écran d'affichage pur).
  const [cursorHidden, setCursorHidden] = useState(false);
  useEffect(() => {
    let timer = window.setTimeout(() => setCursorHidden(true), 4000);
    const wake = () => {
      setCursorHidden(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setCursorHidden(true), 4000);
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  return (
    <div
      className={`flex min-h-dvh flex-col overflow-hidden bg-k-ink text-k-bg ${
        cursorHidden ? "cursor-none" : ""
      }`}
    >
      <header className="flex items-center gap-[2vw] border-b-4 border-k-yellow px-[4vw] py-[2vh]">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="h-[7vh] w-[7vh] shrink-0 rounded-full border-4 border-k-yellow bg-white object-cover"
          />
        ) : (
          <span aria-hidden className="text-[5vh] leading-none">
            🎬
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[clamp(0.8rem,2.2vh,1.4rem)] font-bold uppercase tracking-[0.2em] text-k-bg/70">
            {organizationName}
          </p>
          <h1 className="truncate text-[clamp(1.4rem,4.6vh,3.4rem)] font-black leading-tight">
            {title}
          </h1>
        </div>
        <PhaseChip view={view} />
      </header>

      <main className="flex flex-1 flex-col px-[4vw] py-[2.5vh]">
        {view === "lobby" && (
          <LobbyView state={state} joinCode={joinCode} joinUrl={joinUrl} />
        )}
        {(view === "question" || view === "locked") && (
          <QuestionView state={state} locked={view === "locked"} />
        )}
        {view === "reveal" && <RevealView state={state} />}
        {view === "leaderboard" && <LeaderboardView state={state} />}
        {view === "ended" && <EndedView state={state} />}
      </main>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Bandeau de phase
// ────────────────────────────────────────────────────────────

function PhaseChip({ view }: { view: string }) {
  const label =
    view === "lobby"
      ? "Salon d'attente"
      : view === "question"
        ? "Question en cours"
        : view === "locked"
          ? "Réponses closes"
          : view === "reveal"
            ? "Révélation"
            : view === "leaderboard"
              ? "Classement"
              : "Terminé";
  return (
    <span className="hidden shrink-0 rounded-full border-2 border-k-yellow px-[1.2vw] py-[0.6vh] text-[clamp(0.8rem,2vh,1.3rem)] font-black text-k-yellow sm:inline-block">
      {label}
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// Lobby : QR géant + joueurs connectés
// ────────────────────────────────────────────────────────────

function LobbyView({
  state,
  joinCode,
  joinUrl,
}: {
  state: EventPublicState;
  joinCode: string;
  joinUrl: string;
}) {
  const players = sortLeaderboard(state.leaderboard);
  const displayUrl = joinUrl.replace(/^https?:\/\//, "");

  return (
    <div className="grid flex-1 grid-cols-1 gap-[3vh] lg:grid-cols-[auto_1fr] lg:items-center lg:gap-[4vw]">
      <div className="flex flex-col items-center gap-[2vh] text-center">
        <p className="text-[clamp(1.2rem,4vh,3rem)] font-black">
          Rejoignez avec votre téléphone !
        </p>
        <EventJoinQr url={joinUrl} className="h-[38vh] w-[38vh] max-h-[52vw] max-w-[52vw]" />
        <div className="rounded-2xl border-2 border-k-yellow px-[2vw] py-[1.2vh]">
          <p className="text-[clamp(0.8rem,2vh,1.2rem)] font-bold uppercase tracking-[0.2em] text-k-bg/70">
            Ou entrez le code
          </p>
          <p className="font-mono text-[clamp(2rem,8vh,5rem)] font-black leading-none tracking-[0.15em]">
            {joinCode}
          </p>
        </div>
        <p className="text-[clamp(0.75rem,1.8vh,1.1rem)] font-bold text-k-bg/50">
          {displayUrl}
        </p>
      </div>

      <div className="min-w-0">
        <p className="mb-[1.5vh] text-[clamp(1rem,3vh,2rem)] font-black text-k-yellow">
          {players.length > 0
            ? `${players.length} joueur${players.length > 1 ? "s" : ""} dans la place`
            : "En attente des premiers joueurs…"}
        </p>
        {players.length > 0 ? (
          <ul className="flex flex-wrap gap-[1.2vh]">
            {players.map((p, i) => (
              <li
                key={`${p.pseudo}-${i}`}
                className="flex items-center gap-[0.8vw] rounded-2xl border-2 border-k-bg/15 bg-white/5 px-[1.2vw] py-[0.8vh] motion-safe:animate-[event-pop_400ms_ease-out]"
              >
                <Avatar id={p.avatar} className="h-[4.5vh] w-[4.5vh] shrink-0" />
                <span className="max-w-[16vw] truncate text-[clamp(0.9rem,2.4vh,1.6rem)] font-black">
                  {p.pseudo}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[clamp(0.9rem,2.4vh,1.5rem)] font-bold text-k-bg/50">
            Scannez le QR code pour apparaître ici.
          </p>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Question : intitulé + options + chrono + réponses
// ────────────────────────────────────────────────────────────

/** Horloge locale rafraîchie ~4×/s pour animer le chrono (arrêtée si inutile). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

function QuestionView({
  state,
  locked,
}: {
  state: EventPublicState;
  locked: boolean;
}) {
  const question = state.question;
  const now = useNow(!locked && Boolean(question));

  if (!question) {
    return (
      <Centered>
        <p className="text-[clamp(1.4rem,5vh,3.5rem)] font-black">
          Préparation de la question…
        </p>
      </Centered>
    );
  }

  const meta = eventQuestionTypeMeta(question.questionType);
  const countdown = computeCountdown(question.startedAt, question.timeLimitSeconds, now);
  const answered = computeDistribution(state.distribution).totalVotes;

  return (
    <div className="flex flex-1 flex-col gap-[2.5vh]">
      <div className="text-center">
        <p className="text-[clamp(0.8rem,2.2vh,1.4rem)] font-black uppercase tracking-[0.2em] text-k-yellow">
          {meta.emoji} {meta.label}
        </p>
        <h2 className="mt-[1vh] text-[clamp(1.6rem,6vh,4.5rem)] font-black leading-tight">
          {question.prompt}
        </h2>
      </div>

      {/* Chrono visuel (non autoritatif). */}
      <div aria-hidden>
        <div className="mx-auto h-[1.6vh] min-h-[10px] max-w-4xl overflow-hidden rounded-full bg-k-bg/15">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-linear ${
              locked || countdown.expired ? "bg-red-400" : "bg-k-yellow"
            }`}
            style={{ width: `${Math.max(0, countdown.remainingRatio * 100)}%` }}
          />
        </div>
        <p className="mt-[1vh] text-center text-[clamp(1rem,3vh,2rem)] font-black tabular-nums">
          {locked
            ? "⏹ Réponses closes"
            : countdown.expired
              ? "⏱ Temps écoulé"
              : `${countdown.secondsLeft} s`}
        </p>
      </div>

      <ul className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 content-center gap-[1.6vh] sm:grid-cols-2">
        {question.options.map((opt, i) => (
          <li
            key={opt.id}
            className="flex items-center gap-[1.4vw] rounded-2xl border-2 border-k-bg/20 bg-white/5 px-[2vw] py-[1.6vh]"
          >
            <span className="flex h-[6vh] w-[6vh] shrink-0 items-center justify-center rounded-xl border-2 border-k-yellow text-[clamp(1.2rem,3.5vh,2.5rem)] font-black text-k-yellow">
              {OPTION_LETTERS[i] ?? i + 1}
            </span>
            <span className="min-w-0 text-[clamp(1.1rem,3.4vh,2.4rem)] font-black">
              {opt.label}
            </span>
          </li>
        ))}
      </ul>

      <p
        role="status"
        className="text-center text-[clamp(0.9rem,2.4vh,1.5rem)] font-bold text-k-bg/60"
      >
        {locked || answered > 0
          ? `${answered} réponse${answered > 1 ? "s" : ""} reçue${answered > 1 ? "s" : ""}`
          : "Les réponses arrivent…"}
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Révélation : bonne réponse + répartition
// ────────────────────────────────────────────────────────────

function RevealView({ state }: { state: EventPublicState }) {
  const question = state.question;
  if (!question) {
    return (
      <Centered>
        <p className="text-[clamp(1.4rem,5vh,3.5rem)] font-black">Révélation…</p>
      </Centered>
    );
  }

  const meta = eventQuestionTypeMeta(question.questionType);
  const { bars, totalVotes } = computeDistribution(state.distribution);
  const barById = new Map(bars.map((b) => [b.optionId, b]));
  const correctId = state.correctOptionId;
  const isPoll = question.questionType === "poll";

  return (
    <div className="flex flex-1 flex-col gap-[2.5vh]">
      <div className="text-center">
        <p className="text-[clamp(0.8rem,2.2vh,1.4rem)] font-black uppercase tracking-[0.2em] text-k-yellow">
          {meta.emoji} {isPoll ? "Résultats du sondage" : "La bonne réponse"}
        </p>
        <h2 className="mt-[1vh] text-[clamp(1.4rem,5vh,3.8rem)] font-black leading-tight">
          {question.prompt}
        </h2>
      </div>

      <ul className="mx-auto flex w-full max-w-4xl flex-1 flex-col content-center justify-center gap-[1.4vh]">
        {question.options.map((opt, i) => {
          const bar = barById.get(opt.id);
          const isCorrect = !isPoll && correctId === opt.id;
          return (
            <RevealBar
              key={opt.id}
              letter={OPTION_LETTERS[i] ?? String(i + 1)}
              label={opt.label}
              bar={bar}
              isCorrect={isCorrect}
              isPoll={isPoll}
              hasCorrect={!isPoll && Boolean(correctId)}
            />
          );
        })}
      </ul>

      <p className="text-center text-[clamp(0.9rem,2.4vh,1.5rem)] font-bold text-k-bg/60">
        {totalVotes} vote{totalVotes > 1 ? "s" : ""} au total
      </p>
    </div>
  );
}

function RevealBar({
  letter,
  label,
  bar,
  isCorrect,
  isPoll,
  hasCorrect,
}: {
  letter: string;
  label: string;
  bar: EventDistributionBar | undefined;
  isCorrect: boolean;
  isPoll: boolean;
  hasCorrect: boolean;
}) {
  const percent = bar?.percent ?? 0;
  // Sur un quiz/prono : la bonne réponse est mise en avant, les autres estompées.
  // Sur un sondage : l'option majoritaire est soulignée, sans notion de « juste ».
  const highlight = isCorrect || (isPoll && bar?.isTop);
  const dim = hasCorrect && !isCorrect;

  return (
    <li
      className={`relative overflow-hidden rounded-2xl border-2 px-[2vw] py-[1.4vh] ${
        highlight
          ? "border-k-yellow bg-k-yellow/15"
          : dim
            ? "border-k-bg/10 bg-white/[0.03] opacity-70"
            : "border-k-bg/20 bg-white/5"
      }`}
    >
      <div
        aria-hidden
        className={`absolute inset-y-0 left-0 transition-[width] duration-700 ${
          highlight ? "bg-k-yellow/25" : "bg-white/10"
        }`}
        style={{ width: `${percent}%` }}
      />
      <div className="relative flex items-center gap-[1.4vw]">
        <span className="flex h-[5.5vh] w-[5.5vh] shrink-0 items-center justify-center rounded-xl border-2 border-k-yellow text-[clamp(1.1rem,3.2vh,2.2rem)] font-black text-k-yellow">
          {letter}
        </span>
        <span className="min-w-0 flex-1 truncate text-[clamp(1.1rem,3.2vh,2.2rem)] font-black">
          {isCorrect && "✅ "}
          {label}
        </span>
        <span className="shrink-0 text-[clamp(1.1rem,3.2vh,2.2rem)] font-black tabular-nums">
          {percent}%
        </span>
      </div>
    </li>
  );
}

// ────────────────────────────────────────────────────────────
// Classement live
// ────────────────────────────────────────────────────────────

const PODIUM_MEDALS = ["🥇", "🥈", "🥉"];
const PODIUM_ROW: Record<number, string> = {
  1: "border-k-yellow bg-k-yellow/15",
  2: "border-k-bg/25 bg-white/10",
  3: "border-[#d99e6b] bg-[#d99e6b]/15",
};

function LeaderboardView({ state }: { state: EventPublicState }) {
  const entries = sortLeaderboard(state.leaderboard).slice(0, 10);

  if (entries.length === 0) {
    return (
      <Centered>
        <span aria-hidden className="text-[10vh] leading-none">
          🏁
        </span>
        <p className="text-[clamp(1.4rem,5vh,3.5rem)] font-black">
          Le classement arrive…
        </p>
      </Centered>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <p className="mb-[2vh] text-center text-[clamp(1.2rem,4vh,3rem)] font-black text-k-yellow">
        🏆 Classement
      </p>
      <ol className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-[1.2vh]">
        {entries.map((entry) => (
          <li
            key={`${entry.rank}-${entry.pseudo}`}
            className={`flex items-center gap-[1.6vw] rounded-2xl border-2 px-[1.8vw] py-[1vh] motion-safe:animate-[event-pop_400ms_ease-out] ${
              PODIUM_ROW[entry.rank] ?? "border-k-bg/15 bg-white/5"
            }`}
          >
            <span className="w-[4vw] shrink-0 text-center text-[clamp(1.2rem,3.8vh,2.6rem)] font-black tabular-nums">
              {entry.rank <= 3 ? PODIUM_MEDALS[entry.rank - 1] : entry.rank}
            </span>
            <Avatar id={entry.avatar} className="h-[5vh] w-[5vh] shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[clamp(1.1rem,3.6vh,2.4rem)] font-black">
              {entry.pseudo}
            </span>
            <span className="shrink-0 text-[clamp(1.1rem,3.6vh,2.4rem)] font-black tabular-nums">
              {entry.score}{" "}
              <span className="text-[clamp(0.75rem,2vh,1.3rem)] font-bold opacity-70">
                pt{entry.score > 1 ? "s" : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Fin : podium + confettis discrets (désactivés en reduced-motion)
// ────────────────────────────────────────────────────────────

function EndedView({ state }: { state: EventPublicState }) {
  const podium = sortLeaderboard(state.leaderboard).slice(0, 3);
  // Ordre visuel du podium : 2 · 1 · 3 (le vainqueur au centre, surélevé).
  const order = [podium[1], podium[0], podium[2]];
  const heights = ["h-[26vh]", "h-[36vh]", "h-[20vh]"];
  const medals = ["🥈", "🥇", "🥉"];

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-[3vh]">
      <Confetti />
      <p className="text-[clamp(1.6rem,6vh,4.5rem)] font-black text-k-yellow">
        🎉 C&apos;est terminé, bravo !
      </p>

      {podium.length > 0 ? (
        <div className="flex items-end justify-center gap-[2vw]">
          {order.map((entry, i) =>
            entry ? (
              <div key={`${entry.rank}-${entry.pseudo}`} className="flex flex-col items-center">
                <span aria-hidden className="text-[clamp(2rem,7vh,5rem)] leading-none">
                  {medals[i]}
                </span>
                <Avatar id={entry.avatar} className="my-[1vh] h-[8vh] w-[8vh]" />
                <span className="max-w-[22vw] truncate text-[clamp(1rem,3vh,2rem)] font-black">
                  {entry.pseudo}
                </span>
                <span className="text-[clamp(0.9rem,2.4vh,1.6rem)] font-black text-k-yellow tabular-nums">
                  {entry.score} pt{entry.score > 1 ? "s" : ""}
                </span>
                <div
                  className={`mt-[1vh] flex w-[16vw] min-w-[80px] items-start justify-center rounded-t-2xl border-2 border-k-yellow bg-k-yellow/15 pt-[1vh] ${heights[i]}`}
                >
                  <span className="text-[clamp(1.4rem,5vh,3.5rem)] font-black tabular-nums">
                    {entry.rank}
                  </span>
                </div>
              </div>
            ) : (
              <div key={`empty-${i}`} aria-hidden />
            ),
          )}
        </div>
      ) : (
        <p className="text-[clamp(1rem,3vh,2rem)] font-bold text-k-bg/60">
          Merci à toutes et tous d&apos;avoir joué !
        </p>
      )}

      <p className="text-[clamp(0.85rem,2.2vh,1.4rem)] font-bold text-k-bg/60">
        Les gagnants récupèrent leur lot en caisse avec le code affiché sur leur
        téléphone.
      </p>
    </div>
  );
}

/** Confettis CSS discrets, entièrement désactivés en reduced-motion. */
function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 8) * 0.35,
        color: ["#f0b02c", "#2e8c7f", "#c34f5f", "#56719e"][i % 4],
      })),
    [],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {bits.map((b, i) => (
        <span
          key={i}
          className="absolute top-[-5vh] hidden h-[1.4vh] w-[1.4vh] rounded-sm motion-safe:block motion-safe:animate-[event-confetti_3s_linear_infinite]"
          style={{
            left: `${b.left}%`,
            animationDelay: `${b.delay}s`,
            backgroundColor: b.color,
          }}
        />
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Utilitaire de mise en page
// ────────────────────────────────────────────────────────────

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[2.5vh] text-center">
      {children}
    </div>
  );
}
