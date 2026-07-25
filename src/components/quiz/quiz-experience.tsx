"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  finishQuiz,
  getQuizLeaderboard,
  getQuizState,
  joinQuiz,
  startQuizQuestion,
  submitQuizAnswer,
  type QuizSpinBundle,
} from "@/actions/quiz";
import {
  AVATAR_GROUPS,
  Avatar,
  avatarLabel,
  DEFAULT_AVATAR,
  type AvatarId,
} from "@/lib/avatars";
import type {
  QuizAnswerInput,
  QuizAnswerResult,
  QuizFinishResult,
  QuizLeaderboardEntry,
  QuizPlayableQuestion,
  QuizPublicState,
  QuizRewardView,
} from "@/lib/quiz";
import { QuizQuestionCard } from "./quiz-question-card";
import { QuizSpinExperience } from "./quiz-spin-experience";
import { quizPresetInfo } from "./quiz-presets";
import { quizThemeTokens } from "./quiz-theme";

/* Parcours joueur du Créateur de quiz — DA « Kermesse » (crème, encre, ombres
   dures), déclinée par habillage. MOBILE D'ABORD : le client scanne le QR au
   comptoir, souvent debout, et joue d'une main.

   NON-FUITE (invariant #2) : aucune bonne réponse ne transite avant que le joueur
   n'ait répondu. Ce composant ne reçoit QUE `QuizPublicState` (dont les questions
   non répondues n'ont ni vérité ni issue) et les résultats de `submitQuizAnswer`
   (qui ne portent la vérité que pour un état PROUVANT une réponse de ce joueur).
   Rien n'est reconstruit ni deviné côté client.

   UNE SEULE RÉPONSE PAR QUESTION : dès que le serveur a rendu son verdict,
   l'interface de saisie est verrouillée (cf. QuizQuestionCard) et la question ne
   revient jamais — le gel est de toute façon garanti en base. */

const emptySubscribe = () => () => {};
const useCanShare = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => typeof navigator !== "undefined" && "share" in navigator,
    () => false,
  );

const inputClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-base text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

const NETWORK_ERROR = "Connexion perdue. Vérifiez votre réseau puis réessayez.";

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`;
}

/** Le mode de récompense expose-t-il un classement public au joueur ? */
function exposesLeaderboard(mode: string): boolean {
  return mode === "ranking" || mode === "draw";
}

export interface QuizExperienceProps {
  quizId: string;
  publicSlug: string;
  organizationName: string;
  logoUrl: string | null;
  /** État public initial (rendu serveur, déjà filtré). */
  initialState: QuizPublicState;
  /** Classement initial — vide si le mode ne l'expose pas. */
  initialLeaderboard: QuizLeaderboardEntry[];
  /** Roue d'un tour offert DÉJÀ acquis et non consommé (reprise de session). */
  initialSpinBundle: QuizSpinBundle | null;
}

export function QuizExperience({
  quizId,
  publicSlug,
  organizationName,
  logoUrl,
  initialState,
  initialLeaderboard,
  initialSpinBundle,
}: QuizExperienceProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<QuizPublicState>(initialState);
  const [leaderboard, setLeaderboard] =
    useState<QuizLeaderboardEntry[]>(initialLeaderboard);

  // Question en cours : présentée par le SERVEUR (start_quiz_question), qui pose
  // `started_at` et renvoie son horloge — seule référence du chronomètre.
  const [active, setActive] = useState<{
    question: QuizPlayableQuestion;
    startedAt: string | null;
    serverNow: string | null;
    receivedAt: number;
  } | null>(null);
  const [answerResult, setAnswerResult] = useState<QuizAnswerResult | null>(null);
  const [starting, setStarting] = useState(false);
  /** Enchaînement vers la question suivante (aller-retour serveur en cours). */
  const [advancing, setAdvancing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  /** Questions chronométrées abandonnées après expiration (session courante). */
  const [skipped, setSkipped] = useState<string[]>([]);

  const [finishData, setFinishData] = useState<QuizFinishResult | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [spinBundle, setSpinBundle] = useState<QuizSpinBundle | null>(
    initialSpinBundle,
  );
  const [activeSpin, setActiveSpin] = useState<{
    grantToken: string;
    bundle: QuizSpinBundle;
  } | null>(null);

  const startingRef = useRef(false);

  const quiz = snapshot.quiz;
  const tokens = quizThemeTokens(quiz?.theme ?? "neutre");
  const player = snapshot.player;

  const questions = useMemo(
    () => [...snapshot.questions].sort((a, b) => a.position - b.position),
    [snapshot.questions],
  );
  const answeredCount = questions.filter((q) => q.status === "answered").length;
  const total = quiz?.questionCount || questions.length;

  /** Prochaine question à jouer (les questions passées ne reviennent jamais). */
  const current = useMemo(
    () =>
      questions.find((q) => q.status !== "answered" && !skipped.includes(q.id)) ??
      null,
    [questions, skipped],
  );

  const finished = player?.finishedAt !== null && player?.finishedAt !== undefined;
  const reward: QuizRewardView | null = finishData?.reward ?? snapshot.reward;

  // ── Resynchronisation de l'état public (le serveur fait foi) ──
  const refresh = useCallback(async (): Promise<QuizPublicState | null> => {
    try {
      const fresh = await getQuizState({ quizId });
      // Photo SAINE uniquement : un `unavailable` passager (réseau, quiz fermé le
      // temps d'un appel) ne doit pas effacer l'écran déjà affiché.
      if (fresh.state === "ok") {
        setSnapshot(fresh);
        return fresh;
      }
    } catch {
      // Coupure réseau : on conserve la dernière photo saine.
    }
    return null;
  }, [quizId]);

  const refreshLeaderboard = useCallback(async () => {
    if (!quiz || !exposesLeaderboard(quiz.rewardMode)) return;
    try {
      setLeaderboard(await getQuizLeaderboard({ quizId, limit: 20 }));
    } catch {
      // Classement indisponible : on garde le précédent.
    }
  }, [quiz, quizId]);

  /**
   * Présente une question : c'est `start_quiz_question` qui pose `started_at` EN
   * BASE et renvoie l'horloge serveur. La bascule d'écran n'a lieu QU'APRÈS la
   * réponse du serveur — la carte précédente reste affichée pendant
   * l'aller-retour, sans état intermédiaire vide.
   *
   * Aucune présentation n'est déclenchée par un effet : elle naît toujours d'un
   * geste du joueur (rejoindre, « question suivante », « je suis prêt »), ce qui
   * garantit qu'un chronomètre ne part jamais à son insu.
   */
  const present = useCallback(
    async (questionId: string): Promise<boolean> => {
      if (startingRef.current) return false;
      startingRef.current = true;
      try {
        const res = await startQuizQuestion({ quizId, questionId });
        if (!res.ok) {
          setQuestionError(res.error);
          return false;
        }
        const data = res.data;
        if (data.state === "started" && data.question) {
          setActive({
            question: data.question,
            startedAt: data.startedAt,
            serverNow: data.serverNow,
            receivedAt: Date.now(),
          });
          setAnswerResult(null);
          setQuestionError(null);
          return true;
        }
        // already_answered / finished : notre photo était en retard, on resynchronise.
        if (data.state === "already_answered" || data.state === "finished") {
          await refresh();
          return false;
        }
        setQuestionError("Ce quiz n'est pas disponible pour le moment.");
        return false;
      } catch {
        setQuestionError(NETWORK_ERROR);
        return false;
      } finally {
        startingRef.current = false;
      }
    },
    [quizId, refresh],
  );

  /** Présentation demandée explicitement depuis le sas (bouton du joueur). */
  const startFromGate = useCallback(
    async (questionId: string) => {
      setStarting(true);
      setQuestionError(null);
      await present(questionId);
      setStarting(false);
    },
    [present],
  );

  /**
   * Enchaîne sur la question suivante. Une question CHRONOMÉTRÉE repasse par le
   * sas (le décompte doit partir au signal du joueur) ; les autres s'affichent
   * directement.
   */
  const advanceTo = useCallback(
    async (state: QuizPublicState | null, ignored: string[]) => {
      const next =
        (state ?? snapshot).questions
          .slice()
          .sort((a, b) => a.position - b.position)
          .find((q) => q.status !== "answered" && !ignored.includes(q.id)) ?? null;
      if (next && next.timeLimitSeconds === null) {
        await present(next.id);
        return;
      }
      setActive(null);
      setAnswerResult(null);
    },
    [present, snapshot],
  );

  // ── Envoi de LA réponse ──
  const submit = useCallback(
    async (answer: QuizAnswerInput) => {
      if (!active || submitting) return;
      setSubmitting(true);
      setQuestionError(null);
      try {
        const res = await submitQuizAnswer({
          quizId,
          questionId: active.question.id,
          answer,
        });
        if (!res.ok) {
          setQuestionError(res.error);
          return;
        }
        const data = res.data;
        if (
          data.state === "recorded" ||
          data.state === "too_late" ||
          data.state === "already_answered"
        ) {
          setAnswerResult(data);
          return;
        }
        if (data.state === "invalid_answer") {
          setQuestionError("Cette réponse n'a pas été acceptée — vérifiez votre saisie.");
          return;
        }
        if (data.state === "not_started") {
          setQuestionError("La question doit être réaffichée — réessayez.");
          setActive(null);
          return;
        }
        if (data.state === "finished") {
          await refresh();
          return;
        }
        setQuestionError("Envoi impossible pour le moment.");
      } catch {
        setQuestionError(NETWORK_ERROR);
      } finally {
        setSubmitting(false);
      }
    },
    [active, quizId, refresh, submitting],
  );

  const goNext = useCallback(async () => {
    if (advancing) return;
    setAdvancing(true);
    setQuestionError(null);
    const fresh = await refresh();
    await advanceTo(fresh, skipped);
    setAdvancing(false);
  }, [advanceTo, advancing, refresh, skipped]);

  /** Abandon d'une question chronométrée expirée : elle ne revient pas. */
  const skipCurrent = useCallback(async () => {
    if (!active || advancing) return;
    const ignored = [...skipped, active.question.id];
    setAdvancing(true);
    setSkipped(ignored);
    setQuestionError(null);
    await advanceTo(snapshot, ignored);
    setAdvancing(false);
  }, [active, advanceTo, advancing, skipped, snapshot]);

  // ── Clôture de la participation ──
  const close = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    setFinishError(null);
    try {
      const res = await finishQuiz({ quizId });
      if (!res.ok) {
        setFinishError(res.error);
        return;
      }
      const data = res.data;
      if (data.state === "finished" || data.state === "already_finished") {
        setFinishData(data);
        if (data.spinBundle) setSpinBundle(data.spinBundle);
        setActive(null);
        setAnswerResult(null);
        await refresh();
        await refreshLeaderboard();
        return;
      }
      setFinishError("Impossible de clore votre participation pour le moment.");
    } catch {
      setFinishError(NETWORK_ERROR);
    } finally {
      setFinishing(false);
    }
  }, [finishing, quizId, refresh, refreshLeaderboard]);

  if (!quiz) return null;

  // ── Tour de roue offert : prend tout l'écran ──
  if (activeSpin) {
    return (
      <QuizSpinExperience
        quizId={quizId}
        grantToken={activeSpin.grantToken}
        segments={activeSpin.bundle.segments}
        claimConfig={activeSpin.bundle.claimConfig}
        organizationName={organizationName}
        rewardLabel={quiz.rewardLabel || "Votre tour de roue offert"}
        onExit={() => {
          setActiveSpin(null);
          void refresh();
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <Header
        organizationName={organizationName}
        logoUrl={logoUrl}
        title={quiz.name}
        titleEmoji={tokens.titleEmoji}
        faceEmoji={tokens.faceEmoji}
      />

      {/* ── 1. Pas encore de joueur : inscription légère ── */}
      {!player && (
        <IntroPanel
          quiz={quiz}
          slug={publicSlug}
          onJoined={async () => {
            // Le joueur vient de dire « je joue » : on enchaîne sur la première
            // question (le sas ne réapparaît que si elle est chronométrée).
            const fresh = await refresh();
            await advanceTo(fresh, []);
            router.refresh();
          }}
        />
      )}

      {/* ── 2. Participation close : le résultat ── */}
      {player && finished && (
        <ResultPanel
          quiz={quiz}
          player={player}
          answeredCount={snapshot.progression.answeredCount}
          total={total}
          reward={reward}
          pendingDraw={finishData?.pendingDraw ?? quiz.drawState === "pending"}
          spinBundle={spinBundle}
          publicSlug={publicSlug}
          onSpin={(grantToken, bundle) => setActiveSpin({ grantToken, bundle })}
        />
      )}

      {/* ── 3. En cours de jeu ── */}
      {player && !finished && (
        <>
          <ProgressPanel
            answered={answeredCount}
            total={total}
            score={player.score}
            fillClass={tokens.progressFill}
          />

          {current ? (
            active ? (
              <QuizQuestionCard
                key={active.question.id}
                index={active.question.position}
                total={total}
                question={active.question}
                startedAt={active.startedAt}
                serverNow={active.serverNow}
                receivedAt={active.receivedAt}
                tokens={tokens}
                result={answerResult}
                submitting={submitting}
                nextPending={advancing}
                error={questionError}
                onSubmit={submit}
                onNext={goNext}
                onSkip={skipCurrent}
              />
            ) : (
              <QuestionGate
                index={current.position}
                total={total}
                timeLimitSeconds={current.timeLimitSeconds}
                preset={current.preset}
                accentChip={tokens.accentChip}
                starting={starting || advancing}
                error={questionError}
                onStart={() => void startFromGate(current.id)}
              />
            )
          ) : (
            <FinishPanel
              answered={answeredCount}
              total={total}
              rewardLabel={quiz.rewardLabel}
              rewardMode={quiz.rewardMode}
              pending={finishing}
              error={finishError}
              onFinish={close}
            />
          )}
        </>
      )}

      {exposesLeaderboard(quiz.rewardMode) && (!player || finished) && (
        <LeaderboardPanel
          entries={leaderboard}
          myPlayerId={player?.id ?? null}
        />
      )}

      <SharePanel publicSlug={publicSlug} quizName={quiz.name} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// En-tête commerce
// ────────────────────────────────────────────────────────────

function Header({
  organizationName,
  logoUrl,
  title,
  titleEmoji,
  faceEmoji,
}: {
  organizationName: string;
  logoUrl: string | null;
  title: string;
  titleEmoji: string;
  faceEmoji: string;
}) {
  return (
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
          {faceEmoji}
        </div>
      )}
      <p className="text-xs font-bold uppercase tracking-wide text-k-body">
        {organizationName}
      </p>
      <h1 className="mt-1 text-2xl font-black leading-tight text-k-ink">
        <span aria-hidden className="mr-1">
          {titleEmoji}
        </span>
        {title}
      </h1>
    </header>
  );
}

// ────────────────────────────────────────────────────────────
// Inscription légère (RGPD : rien n'est imposé, rien n'est pré-coché)
// ────────────────────────────────────────────────────────────

type QuizInfo = NonNullable<QuizPublicState["quiz"]>;

function AvatarPicker({
  value,
  onChange,
}: {
  value: AvatarId;
  onChange: (id: AvatarId) => void;
}) {
  const [groupKey, setGroupKey] = useState<string>(AVATAR_GROUPS[0].key);
  const group = AVATAR_GROUPS.find((g) => g.key === groupKey) ?? AVATAR_GROUPS[0];

  return (
    <div>
      <span className="mb-1.5 block text-sm font-bold text-k-ink">
        Votre avatar (facultatif)
      </span>
      <div
        className="mb-2 flex gap-1.5"
        role="tablist"
        aria-label="Familles d'avatars"
      >
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

function IntroPanel({
  quiz,
  slug,
  onJoined,
}: {
  quiz: QuizInfo;
  slug: string;
  onJoined: () => void | Promise<void>;
}) {
  const [firstName, setFirstName] = useState("");
  const [avatar, setAvatar] = useState<AvatarId>(DEFAULT_AVATAR);
  const [avatarPicked, setAvatarPicked] = useState(false);
  const [email, setEmail] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailGiven = email.trim() !== "";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    // Consentement EXPLICITE : un email ne part jamais sans case cochée.
    if (emailGiven && !marketingOptIn) {
      setError(
        "Cochez la case de consentement pour nous confier votre email — ou laissez le champ vide.",
      );
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await joinQuiz({
        slug,
        firstName: firstName.trim() || undefined,
        email: emailGiven ? email.trim() : undefined,
        avatar: avatarPicked ? avatar : undefined,
        marketingOptIn: emailGiven ? marketingOptIn : false,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.state !== "joined") {
        setError("Ce quiz n'est pas disponible pour le moment.");
        return;
      }
      await onJoined();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]">
      {quiz.introText && (
        <p className="mb-4 whitespace-pre-line text-sm font-medium leading-relaxed text-k-ink">
          {quiz.introText}
        </p>
      )}

      <ul className="mb-4 space-y-1 text-sm font-bold text-k-body">
        <li>
          🧠 {quiz.questionCount} question{quiz.questionCount > 1 ? "s" : ""}, une
          par une
        </li>
        <li>⚡ Correction immédiate après chaque réponse</li>
        {quiz.rewardMode !== "none" && quiz.rewardLabel && (
          <li>🎁 À gagner : {quiz.rewardLabel}</li>
        )}
        {quiz.rewardMode === "threshold" && quiz.rewardThreshold !== null && (
          <li>
            🎯 Le lot est remis à partir de {quiz.rewardThreshold} bonne
            {quiz.rewardThreshold > 1 ? "s" : ""} réponse
            {quiz.rewardThreshold > 1 ? "s" : ""}
          </li>
        )}
        {quiz.rewardMode === "draw" && quiz.drawTopN !== null && (
          <li>🎲 Tirage au sort parmi les {quiz.drawTopN} meilleurs</li>
        )}
        {quiz.rewardMode === "ranking" && (
          <li>🥇 Les meilleurs du classement sont récompensés</li>
        )}
      </ul>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label
            htmlFor="quiz-first-name"
            className="mb-1.5 block text-sm font-bold text-k-ink"
          >
            Votre prénom ou pseudo (facultatif)
          </label>
          <input
            id="quiz-first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={60}
            autoComplete="nickname"
            placeholder="Pour apparaître au classement"
            className={inputClass}
          />
        </div>

        <AvatarPicker
          value={avatar}
          onChange={(id) => {
            setAvatar(id);
            setAvatarPicked(true);
          }}
        />

        <div>
          <label
            htmlFor="quiz-email"
            className="mb-1.5 block text-sm font-bold text-k-ink"
          >
            Votre email (facultatif)
          </label>
          <input
            id="quiz-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={320}
            autoComplete="email"
            placeholder="vous@exemple.fr"
            className={inputClass}
            aria-describedby="quiz-email-help"
          />
          <p id="quiz-email-help" className="mt-1.5 text-xs text-k-body">
            Vous pouvez jouer sans le donner : rien n&apos;est obligatoire.
          </p>
        </div>

        {/* Opt-in EXPLICITE, JAMAIS pré-coché (RGPD). */}
        {emailGiven && (
          <label className="flex items-start gap-2.5 text-sm text-k-ink">
            <input
              type="checkbox"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
            />
            <span>
              J&apos;accepte de recevoir les <strong>offres et actualités</strong>{" "}
              de ce commerce. Voir la{" "}
              <Link href="/privacy" className="font-bold underline">
                politique de confidentialité
              </Link>
              .
            </span>
          </label>
        )}

        <button
          type="submit"
          disabled={pending}
          className="k-btn w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
        >
          {pending ? "Un instant…" : "🚀 Je joue !"}
        </button>
        {error && (
          <p role="alert" className="text-sm font-bold text-red-600">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Progression
// ────────────────────────────────────────────────────────────

function ProgressPanel({
  answered,
  total,
  score,
  fillClass,
}: {
  answered: number;
  total: number;
  score: number;
  fillClass: string;
}) {
  const ratio = total > 0 ? Math.min(1, answered / total) : 0;
  return (
    <section
      aria-label="Progression du quiz"
      className="k-border mb-4 rounded-2xl bg-white p-4 shadow-[4px_4px_0_var(--color-k-ink)]"
    >
      <div className="mb-1.5 flex items-center justify-between text-sm font-black text-k-ink">
        <span className="tabular-nums">
          {answered} / {total} répondue{answered > 1 ? "s" : ""}
        </span>
        <span className="tabular-nums">
          {score} point{score > 1 ? "s" : ""}
        </span>
      </div>
      <div
        className="h-3 overflow-hidden rounded-full border-2 border-k-ink bg-white"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-label="Questions répondues"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${fillClass}`}
          style={{ width: `${Math.max(3, ratio * 100)}%` }}
        />
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Sas d'entrée dans une question
//
// Il n'apparaît que dans deux cas : la question est CHRONOMÉTRÉE (le décompte ne
// doit partir qu'au signal du joueur, jamais pendant qu'il lit), ou le joueur
// arrive/revient sur la page en cours de quiz. Entre deux questions,
// l'enchaînement est direct.
// ────────────────────────────────────────────────────────────

function QuestionGate({
  index,
  total,
  timeLimitSeconds,
  preset,
  accentChip,
  starting,
  error,
  onStart,
}: {
  index: number;
  total: number;
  timeLimitSeconds: number | null;
  preset: string;
  accentChip: string;
  starting: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const info = quizPresetInfo(preset);
  const timed = timeLimitSeconds !== null;
  return (
    <section className="k-border rounded-2xl bg-white p-5 text-center shadow-[6px_6px_0_var(--color-k-ink)]">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-black ${accentChip}`}
      >
        Question {index + 1} / {total}
      </span>
      <h2 className="mt-4 text-xl font-black leading-tight text-k-ink">
        <span aria-hidden>{info.icon} </span>
        {timed ? "Question chronométrée" : "Prêt pour la suite ?"}
      </h2>
      <p className="mt-2 text-sm font-bold text-k-body">
        {timed
          ? `Vous aurez ${timeLimitSeconds} secondes dès que vous lancez.`
          : "Touchez le bouton pour afficher la question."}
      </p>
      {timed && (
        <p className="mt-1 text-xs text-k-body">
          L&apos;intitulé n&apos;apparaît qu&apos;au lancement — prenez le temps de
          vous installer.
        </p>
      )}
      <button
        type="button"
        onClick={onStart}
        disabled={starting}
        className="k-btn mt-5 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
      >
        {starting
          ? "Un instant…"
          : timed
            ? "Je suis prêt·e, on y va !"
            : "Afficher la question"}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm font-bold text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Clôture
// ────────────────────────────────────────────────────────────

function FinishPanel({
  answered,
  total,
  rewardLabel,
  rewardMode,
  pending,
  error,
  onFinish,
}: {
  answered: number;
  total: number;
  rewardLabel: string;
  rewardMode: string;
  pending: boolean;
  error: string | null;
  onFinish: () => void;
}) {
  return (
    <section className="k-border rounded-2xl bg-white p-5 text-center shadow-[6px_6px_0_var(--color-k-ink)]">
      <div aria-hidden className="mb-3 text-4xl">
        🏁
      </div>
      <h2 className="text-xl font-black leading-tight text-k-ink">
        C&apos;est terminé pour les questions !
      </h2>
      <p className="mt-2 text-sm font-bold text-k-body">
        {answered} réponse{answered > 1 ? "s" : ""} sur {total}. Validez pour
        connaître votre score
        {rewardMode !== "none" && rewardLabel ? ` et tenter « ${rewardLabel} »` : ""}
        .
      </p>
      <p className="mt-1 text-xs text-k-body">
        Attention : une fois validé, votre participation est close et ne peut plus
        être reprise.
      </p>
      <button
        type="button"
        onClick={onFinish}
        disabled={pending}
        className="k-btn mt-5 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
      >
        {pending ? "Calcul…" : "Voir mon résultat"}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm font-bold text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Résultat + récompense
// ────────────────────────────────────────────────────────────

function ResultPanel({
  quiz,
  player,
  answeredCount,
  total,
  reward,
  pendingDraw,
  spinBundle,
  publicSlug,
  onSpin,
}: {
  quiz: QuizInfo;
  player: NonNullable<QuizPublicState["player"]>;
  answeredCount: number;
  total: number;
  reward: QuizRewardView | null;
  pendingDraw: boolean;
  spinBundle: QuizSpinBundle | null;
  publicSlug: string;
  onSpin: (grantToken: string, bundle: QuizSpinBundle) => void;
}) {
  const canShare = useCanShare();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!reward?.code) return;
    try {
      await navigator.clipboard.writeText(reward.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : le code reste lisible à l'écran.
    }
  };
  const shareScore = async () => {
    try {
      await navigator.share({
        text: `J'ai fait ${player.score} point${player.score > 1 ? "s" : ""} au quiz « ${quiz.name} » !`,
        url: `${window.location.origin}/quiz/${publicSlug}`,
      });
    } catch {
      // Partage annulé : rien à faire.
    }
  };

  return (
    <>
      <section
        role="status"
        aria-live="polite"
        className="k-border mb-4 rounded-2xl bg-white p-5 text-center shadow-[6px_6px_0_var(--color-k-ink)]"
      >
        <p className="text-xs font-black uppercase tracking-[0.2em] text-k-body">
          Votre résultat
        </p>
        <p className="mt-2 font-mono text-5xl font-black tabular-nums text-k-ink">
          {player.score}
        </p>
        <p className="text-sm font-bold text-k-body">
          point{player.score > 1 ? "s" : ""}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl border-2 border-k-ink/15 bg-k-stripe px-3 py-2">
            <dt className="text-xs font-bold text-k-body">Bonnes réponses</dt>
            <dd className="font-black tabular-nums text-k-ink">
              {player.correctCount} / {total}
            </dd>
          </div>
          <div className="rounded-xl border-2 border-k-ink/15 bg-k-stripe px-3 py-2">
            <dt className="text-xs font-bold text-k-body">Temps total</dt>
            <dd className="font-black tabular-nums text-k-ink">
              {formatDuration(player.totalElapsedMs)}
            </dd>
          </div>
        </dl>
        {answeredCount < total && (
          <p className="mt-3 text-xs text-k-body">
            {total - answeredCount} question{total - answeredCount > 1 ? "s" : ""}{" "}
            sans réponse.
          </p>
        )}
        {canShare && (
          <button
            type="button"
            onClick={shareScore}
            className="mt-4 rounded-xl border-2 border-k-ink bg-white px-4 py-2 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
          >
            Partager mon score
          </button>
        )}
      </section>

      {/* ── Récompense selon le mode ── */}
      <RewardPanel
        quiz={quiz}
        player={player}
        reward={reward}
        pendingDraw={pendingDraw}
        spinBundle={spinBundle}
        copied={copied}
        canShare={canShare}
        onCopy={copy}
        onSpin={onSpin}
      />
    </>
  );
}

function RewardPanel({
  quiz,
  player,
  reward,
  pendingDraw,
  spinBundle,
  copied,
  canShare,
  onCopy,
  onSpin,
}: {
  quiz: QuizInfo;
  player: NonNullable<QuizPublicState["player"]>;
  reward: QuizRewardView | null;
  pendingDraw: boolean;
  spinBundle: QuizSpinBundle | null;
  copied: boolean;
  canShare: boolean;
  onCopy: () => void;
  onSpin: (grantToken: string, bundle: QuizSpinBundle) => void;
}) {
  if (quiz.rewardMode === "none") return null;

  const shareCode = async () => {
    if (!reward?.code) return;
    try {
      await navigator.share({
        text: `Mon code à présenter en caisse : ${reward.code}`,
      });
    } catch {
      // Partage annulé : rien à faire.
    }
  };

  // ── Tour de roue offert ──
  if (reward?.spinGrantToken) {
    return (
      <section className="k-border mb-4 rounded-2xl bg-k-green/15 p-5 text-center shadow-[6px_6px_0_var(--color-k-ink)]">
        <p className="inline-flex rounded-full border-2 border-k-ink bg-white px-3 py-0.5 text-[11px] font-black uppercase text-k-ink">
          🎡 Tour de roue offert
        </p>
        <h2 className="mt-3 text-xl font-black leading-tight text-k-ink">
          {quiz.rewardLabel || "Vous avez gagné un tour de roue !"}
        </h2>
        {quiz.rewardDetails && (
          <p className="mt-1 text-sm font-bold text-k-body">{quiz.rewardDetails}</p>
        )}
        {spinBundle ? (
          <button
            type="button"
            onClick={() => onSpin(reward.spinGrantToken as string, spinBundle)}
            className="k-btn mt-4 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink"
          >
            🎡 Faire tourner la roue
          </button>
        ) : (
          <p className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
            La roue n&apos;est pas accessible pour le moment — présentez cet écran
            au comptoir.
          </p>
        )}
      </section>
    );
  }

  // ── Code de retrait en caisse ──
  if (reward?.code) {
    return (
      <section className="k-border mb-4 rounded-2xl bg-k-green/15 p-5 text-center shadow-[6px_6px_0_var(--color-k-ink)]">
        <p className="inline-flex rounded-full border-2 border-k-ink bg-white px-3 py-0.5 text-[11px] font-black uppercase text-k-ink">
          🏆 Gagné
          {reward.rank !== null ? ` · ${reward.rank}ᵉ place` : ""}
        </p>
        <h2 className="mt-3 text-xl font-black leading-tight text-k-ink">
          {quiz.rewardLabel || "Un lot vous attend"}
        </h2>
        {quiz.rewardDetails && (
          <p className="mt-1 text-sm font-bold text-k-body">{quiz.rewardDetails}</p>
        )}

        {reward.redeemedAt ? (
          <>
            <p className="mt-3 break-all font-mono text-2xl font-black tracking-wider text-k-ink/40 line-through">
              {reward.code}
            </p>
            <p className="mt-2 rounded-xl border-2 border-k-ink/20 bg-white px-3 py-2 text-sm font-bold text-k-body">
              ✓ Lot déjà récupéré en caisse.
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-[11px] font-mono uppercase tracking-[0.25em] text-k-body">
              Votre code
            </p>
            <p className="mt-1 break-all font-mono text-3xl font-black tracking-wider text-k-ink">
              {reward.code}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={onCopy}
                className="k-btn-sm rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink"
              >
                {copied ? "Copié !" : "Copier le code"}
              </button>
              {canShare && (
                <button
                  type="button"
                  onClick={shareCode}
                  className="rounded-xl border-2 border-k-ink bg-white px-4 py-2 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
                >
                  Partager
                </button>
              )}
            </div>
            <p className="mt-3 text-sm font-bold text-k-body">
              Présentez ce code en caisse pour récupérer votre lot.
            </p>
          </>
        )}
      </section>
    );
  }

  // ── Lot épuisé ──
  if (reward?.outOfStock) {
    return (
      <section className="k-border mb-4 rounded-2xl bg-white p-5 text-center shadow-[4px_4px_0_var(--color-k-ink)]">
        <p className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
          Bravo ! Mais le lot est momentanément épuisé — présentez-vous au
          comptoir, le commerçant saura vous accueillir.
        </p>
      </section>
    );
  }

  // ── Modes différés : le sort n'est pas encore tiré ──
  if (pendingDraw && (quiz.rewardMode === "draw" || quiz.rewardMode === "ranking")) {
    return (
      <section className="k-border mb-4 rounded-2xl bg-white p-5 text-center shadow-[4px_4px_0_var(--color-k-ink)]">
        <div aria-hidden className="mb-2 text-3xl">
          {quiz.rewardMode === "draw" ? "🎲" : "🥇"}
        </div>
        <h2 className="text-lg font-black text-k-ink">
          Votre participation est enregistrée
        </h2>
        <p className="mt-2 text-sm font-bold text-k-body">
          {quiz.rewardMode === "draw"
            ? `Le tirage au sort aura lieu parmi les ${quiz.drawTopN ?? 0} meilleurs scores. Revenez sur cette page : votre code s'affichera ici si le sort vous désigne.`
            : "Les meilleurs du classement seront récompensés. Revenez sur cette page : votre code s'affichera ici."}
        </p>
      </section>
    );
  }

  // ── Seuil non atteint ──
  if (quiz.rewardMode === "threshold" && quiz.rewardThreshold !== null) {
    return (
      <section className="k-border mb-4 rounded-2xl bg-white p-5 text-center shadow-[4px_4px_0_var(--color-k-ink)]">
        <div aria-hidden className="mb-2 text-3xl">
          🙂
        </div>
        <h2 className="text-lg font-black text-k-ink">Pas de lot cette fois</h2>
        <p className="mt-2 text-sm font-bold text-k-body">
          Il fallait {quiz.rewardThreshold} bonne
          {quiz.rewardThreshold > 1 ? "s" : ""} réponse
          {quiz.rewardThreshold > 1 ? "s" : ""} — vous en avez{" "}
          {player.correctCount}. Merci d&apos;avoir joué !
        </p>
      </section>
    );
  }

  // ── Tirage passé sans être désigné ──
  return (
    <section className="k-border mb-4 rounded-2xl bg-white p-5 text-center shadow-[4px_4px_0_var(--color-k-ink)]">
      <div aria-hidden className="mb-2 text-3xl">
        🙂
      </div>
      <h2 className="text-lg font-black text-k-ink">Pas de lot cette fois</h2>
      <p className="mt-2 text-sm font-bold text-k-body">
        Merci d&apos;avoir joué — à très vite pour le prochain quiz !
      </p>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Classement (ordre et rangs venus de SQL)
// ────────────────────────────────────────────────────────────

function LeaderboardPanel({
  entries,
  myPlayerId,
}: {
  entries: QuizLeaderboardEntry[];
  myPlayerId: string | null;
}) {
  return (
    <section className="k-border mb-4 rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]">
      <h2 className="mb-3 text-lg font-black text-k-ink">Classement</h2>
      {entries.length === 0 ? (
        <p className="text-center text-sm text-k-body">
          Le classement apparaîtra dès les premières participations terminées.
        </p>
      ) : (
        <>
          <ol className="space-y-1.5">
            {entries.map((entry) => {
              const isMe = myPlayerId === entry.playerId;
              return (
                <li
                  key={entry.playerId}
                  className={
                    isMe
                      ? "flex items-center gap-3 rounded-xl border-2 border-k-ink bg-k-yellow/50 px-3 py-2"
                      : "flex items-center gap-3 rounded-xl bg-k-stripe px-3 py-2"
                  }
                >
                  <span className="w-7 text-center font-black tabular-nums text-k-ink">
                    {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : entry.rank}
                  </span>
                  <Avatar id={entry.avatar} className="h-8 w-8 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-k-ink">
                    {entry.firstName ?? "Anonyme"}
                    {isMe && <span className="ml-1.5 text-xs">(vous)</span>}
                  </span>
                  <span className="shrink-0 text-right text-sm font-black tabular-nums text-k-ink">
                    {entry.score} pt{entry.score > 1 ? "s" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-center text-xs text-k-body/70">
            Score décroissant, puis rapidité. {entries[0].totalPlayers} joueur
            {entries[0].totalPlayers > 1 ? "s" : ""} classé
            {entries[0].totalPlayers > 1 ? "s" : ""}.
          </p>
        </>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Partage du quiz
// ────────────────────────────────────────────────────────────

function SharePanel({
  publicSlug,
  quizName,
}: {
  publicSlug: string;
  quizName: string;
}) {
  const canShare = useCanShare();
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/quiz/${publicSlug}`;
    try {
      if (canShare) {
        await navigator.share({ title: quizName, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Partage annulé ou presse-papiers indisponible : rien à faire.
    }
  };

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={share}
        className="rounded-xl border-2 border-k-ink bg-white px-4 py-2.5 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
      >
        {copied ? "Lien copié !" : "📣 Défier un ami"}
      </button>
    </div>
  );
}
