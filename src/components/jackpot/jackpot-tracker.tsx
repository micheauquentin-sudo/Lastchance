"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import {
  getJackpotCheckinToken,
  participateJackpot,
  type JackpotParticipationActionResult,
} from "@/actions/jackpot";
import type { JackpotParticipationResult } from "@/lib/jackpot";
import type { JackpotDrawMode, JackpotValidationMode } from "@/types/database";
import {
  TurnstileWidget,
  turnstileClientEnabled,
} from "@/components/wheel/turnstile-widget";
import {
  formatJackpotAmount,
  jackpotProgress,
  messageForJackpotParticipation,
  type JackpotMessageTone,
} from "./jackpot-state";

/* Jackpot collectif côté joueur — DA « Kermesse » (crème, encre, jaune, ombres
   dures), même famille visuelle que le passeport de fidélité et la chasse. La
   jauge est PARTAGÉE : chaque participation la fait monter pour tout le monde.
   Mobile d'abord — le client arrive en scannant le QR du commerce, et peut
   ajouter la page à son écran d'accueil pour suivre l'évolution en direct. */

const TONE_BOX: Record<JackpotMessageTone, string> = {
  success: "border-k-ink bg-k-green/15 text-k-ink",
  info: "border-k-ink bg-k-blue/25 text-k-ink",
  warning: "border-k-ink bg-k-yellow/50 text-k-ink",
  error: "border-red-400 bg-red-50 text-red-700",
};

const codeInputClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-center text-2xl font-black tracking-[0.4em] text-k-ink tabular-nums placeholder:tracking-normal placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

/** Rafraîchissement doux de la jauge partagée (façon mode TV). */
const POLL_MS = 20_000;

/** Où en est le challenge anti-robot côté client (miroir passeport). */
type ChallengePhase = "loading" | "ready" | "expired" | "unavailable";

// Partage natif / hydratation détectés sans écart d'hydratation (serveur → false).
const emptySubscribe = () => () => {};
const useCanShare = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => typeof navigator !== "undefined" && "share" in navigator,
    () => false,
  );
const useHydrated = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

/** Gain remporté par le joueur (code de retrait présenté en caisse). */
export interface JackpotWinView {
  id: string;
  cycle: number;
  code: string;
  redeemedAt: string | null;
}

/** Jauge partagée telle que rendue côté serveur (loadJackpotContext). */
export interface JackpotGaugeProps {
  currentCount: number;
  threshold: number;
  cycle: number;
  displayAmountCents: number;
  drawAt: string | null;
  soldOut: boolean;
}

export interface JackpotTrackerProps {
  campaignId: string;
  organizationName: string;
  logoUrl: string | null;
  campaignName: string;
  validationMode: JackpotValidationMode;
  drawMode: JackpotDrawMode;
  rewardLabel: string;
  rewardDetails: string | null;
  merchantContent: string | null;
  gauge: JackpotGaugeProps;
  /** Gains déjà remportés par le joueur courant (lecture serveur). */
  wins: JackpotWinView[];
}

export function JackpotTracker({
  campaignId,
  organizationName,
  logoUrl,
  campaignName,
  validationMode,
  drawMode,
  rewardLabel,
  rewardDetails,
  merchantContent,
  gauge,
  wins,
}: JackpotTrackerProps) {
  const router = useRouter();

  // ── Challenge anti-robot (mode rotating_code) — miroir EXACT du passeport :
  // le serveur l'exige quand une participation CRÉERAIT une identité (tout
  // premier passage). Le code saisi survit au refus, la participation est
  // rejouée dès que le jeton arrive, et aucune impasse muette n'est laissée.
  const [code, setCode] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [challengeRequired, setChallengeRequired] = useState(false);
  const [challengeNonce, setChallengeNonce] = useState(0);
  const [challengePhase, setChallengePhase] = useState<ChallengePhase>("loading");
  const formRef = useRef<HTMLFormElement | null>(null);
  const replayRef = useRef<string | null>(null);
  const replayedRef = useRef(false);

  const [state, formAction, pending] = useActionState<
    JackpotParticipationActionResult | null,
    FormData
  >(async (_prev, formData) => {
    const submitted = String(formData.get("code") ?? "");
    const usedToken = String(formData.get("captcha") ?? "") || null;
    const wasReplay = replayedRef.current;
    replayedRef.current = false;

    let result: JackpotParticipationActionResult;
    try {
      result = await participateJackpot({
        campaignId,
        code: submitted,
        turnstileToken: usedToken ?? undefined,
      });
    } catch {
      // Server Action injoignable (réseau coupé au comptoir) : sans ce filet
      // l'exception effacerait toute la page au lieu d'un message.
      return {
        ok: false,
        error: "Connexion perdue. Vérifiez votre réseau puis réessayez.",
      };
    }

    if (usedToken) {
      setCaptchaToken(null);
      setChallengePhase("loading");
      setChallengeNonce((n) => n + 1);
    }
    if (result.ok && result.data.state === "recorded") {
      setChallengeRequired(false);
      replayRef.current = null;
      setCode("");
      // La jauge partagée a bougé : on rafraîchit la lecture serveur en fond.
      router.refresh();
    } else if (!result.ok && result.challengeRequired) {
      setChallengeRequired(true);
      if (!wasReplay) replayRef.current = submitted;
    }
    return result;
  }, null);

  const scan = state?.ok ? state.data : null;
  const participateError = state && !state.ok ? state.error : null;

  const handleCaptchaToken = useCallback((token: string | null) => {
    setCaptchaToken(token);
    setChallengePhase(token ? "ready" : "expired");
  }, []);
  const handleCaptchaUnavailable = useCallback(() => {
    setCaptchaToken(null);
    setChallengePhase("unavailable");
  }, []);
  const restartChallenge = useCallback(() => {
    setCaptchaToken(null);
    setChallengePhase("loading");
    setChallengeNonce((n) => n + 1);
  }, []);

  // Rejeu automatique : code saisi, challenge réclamé, jeton reçu → on renvoie
  // le MÊME code sans rien redemander (un seul rejeu, jamais en boucle).
  useEffect(() => {
    const wanted = replayRef.current;
    const form = formRef.current;
    if (!wanted || !captchaToken || pending || !form) return;
    replayRef.current = null;
    if (wanted !== code || !form.checkValidity()) return;
    replayedRef.current = true;
    form.requestSubmit();
  }, [captchaToken, code, pending]);

  // ── Gains remportés durant la session (rescan_win peut gagner à un passage
  // ultérieur) : accumulés et dédupliqués par code, en tête de l'historique.
  const [freshWins, setFreshWins] = useState<JackpotWinView[]>([]);
  useEffect(() => {
    if (!scan || !scan.isWinner || !scan.code) return;
    const winCode = scan.code;
    const winCycle = scan.cycle;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- accumulation idempotente (dédup par code) à chaque nouveau gain.
    setFreshWins((prev) =>
      prev.some((w) => w.code === winCode)
        ? prev
        : [{ id: `fresh-${winCode}`, cycle: winCycle, code: winCode, redeemedAt: null }, ...prev],
    );
  }, [scan]);

  // ── Rafraîchissement doux de la jauge partagée : router.refresh() re-exécute
  // le composant serveur (force-dynamic) et repasse une jauge fraîche en props,
  // sans perdre l'état client (saisie, gains). Tolérant : suspendu onglet
  // masqué ou pendant une participation, relancé au retour.
  useEffect(() => {
    const tick = () => {
      if (!document.hidden && !pending) router.refresh();
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pending, router]);

  // Jauge affichée : la lecture serveur fait foi, mais la dernière participation
  // du joueur (même cycle) donne un retour immédiat avant le prochain poll.
  const sameCycle = scan && scan.state === "recorded" && scan.cycle === gauge.cycle;
  const liveCount = sameCycle
    ? Math.max(gauge.currentCount, scan.currentCount)
    : gauge.currentCount;
  const liveAmount = sameCycle
    ? Math.max(gauge.displayAmountCents, scan.displayAmountCents)
    : gauge.displayAmountCents;

  const allWins = dedupeWins([...freshWins, ...wins]);

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      {/* ── En-tête commerce ── */}
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
            💰
          </div>
        )}
        <p className="text-xs font-bold uppercase tracking-wide text-k-body">
          {organizationName}
        </p>
        <h1 className="mt-1 text-2xl font-black leading-tight text-k-ink">
          {campaignName}
        </h1>
      </header>

      {/* ── Jauge partagée + montant croissant ── */}
      <GaugePanel
        currentCount={liveCount}
        threshold={gauge.threshold}
        displayAmountCents={liveAmount}
        cycle={gauge.cycle}
        drawMode={drawMode}
        drawAt={gauge.drawAt}
        soldOut={gauge.soldOut}
        rewardLabel={rewardLabel}
        rewardDetails={rewardDetails}
      />

      {/* ── Contenu commerçant (offres, soirées) ── */}
      <MerchantContent content={merchantContent} />

      {/* ── Gains du joueur ── */}
      <WinsSection wins={allWins} drawMode={drawMode} drawAt={gauge.drawAt} />

      {/* ── Zone de participation selon le mode ── */}
      {validationMode === "rotating_code" ? (
        <RotatingParticipateForm
          formRef={formRef}
          formAction={formAction}
          pending={pending}
          code={code}
          onCodeChange={setCode}
          captchaToken={captchaToken}
          scan={scan}
          error={participateError}
          challengeVisible={challengeRequired}
          challengeAsked={challengeRequired}
          challengePhase={challengePhase}
          challengeNonce={challengeNonce}
          onCaptchaToken={handleCaptchaToken}
          onCaptchaUnavailable={handleCaptchaUnavailable}
          onRestartChallenge={restartChallenge}
        />
      ) : (
        <StaffCheckinCard campaignId={campaignId} />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Jauge partagée : le grand chiffre du produit
// ────────────────────────────────────────────────────────────

function GaugePanel({
  currentCount,
  threshold,
  displayAmountCents,
  cycle,
  drawMode,
  drawAt,
  soldOut,
  rewardLabel,
  rewardDetails,
}: {
  currentCount: number;
  threshold: number;
  displayAmountCents: number;
  cycle: number;
  drawMode: JackpotDrawMode;
  drawAt: string | null;
  soldOut: boolean;
  rewardLabel: string;
  rewardDetails: string | null;
}) {
  const progress = jackpotProgress(currentCount, threshold);

  return (
    <section
      aria-label="Jackpot collectif"
      className="k-border mb-4 rounded-2xl bg-white p-5 text-center shadow-[6px_6px_0_var(--color-k-ink)]"
    >
      {cycle > 1 && (
        <p className="mb-1 text-xs font-black uppercase tracking-wide text-k-body">
          Cagnotte n°{cycle}
        </p>
      )}
      <p className="text-xs font-bold uppercase tracking-wide text-k-body">
        Le jackpot monte à
      </p>
      <p className="mt-1 text-5xl font-black leading-none tabular-nums text-k-ink">
        {formatJackpotAmount(displayAmountCents)}
      </p>
      {rewardLabel && (
        <p className="mt-2 text-base font-black text-k-ink">🎁 {rewardLabel}</p>
      )}
      {rewardDetails && (
        <p className="mt-0.5 text-sm text-k-body">{rewardDetails}</p>
      )}

      {/* Jauge partagée : participations vers l'objectif. */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-sm font-black text-k-ink">
          <span>
            {currentCount} / {threshold}
          </span>
          <span className="text-k-body">participation{threshold > 1 ? "s" : ""}</span>
        </div>
        <div
          className="h-4 overflow-hidden rounded-full border-2 border-k-ink bg-white"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          aria-label="Progression du jackpot collectif"
        >
          <div
            className="h-full rounded-full bg-k-yellow transition-[width] duration-700"
            style={{ width: `${Math.max(3, progress.ratio * 100)}%` }}
          />
        </div>
        <p className="mt-3 text-sm font-bold text-k-body">
          {progress.reached ? (
            <span className="font-black text-k-ink">
              🎯 Objectif atteint !
            </span>
          ) : (
            <>
              Plus que{" "}
              <span className="font-black text-k-ink tabular-nums">
                {progress.remaining}
              </span>{" "}
              participation{progress.remaining > 1 ? "s" : ""} pour débloquer le
              jackpot !
            </>
          )}
        </p>
      </div>

      <DrawModeHint drawMode={drawMode} drawAt={drawAt} soldOut={soldOut} />
    </section>
  );
}

/** Explique comment le jackpot se remporte, et l'échéance en mode date. */
function DrawModeHint({
  drawMode,
  drawAt,
  soldOut,
}: {
  drawMode: JackpotDrawMode;
  drawAt: string | null;
  soldOut: boolean;
}) {
  if (soldOut) {
    return (
      <p className="mt-4 rounded-xl border-2 border-k-ink bg-k-yellow/40 px-3 py-2 text-sm font-black text-k-ink">
        Tous les lots de ce jackpot sont partis — rendez-vous au comptoir pour la
        suite !
      </p>
    );
  }

  if (drawMode === "date_draw") {
    return (
      <div className="mt-4 rounded-xl border-2 border-k-ink bg-k-blue/20 px-3 py-2">
        <p className="text-sm font-black text-k-ink">🗓️ Tirage au sort à date</p>
        {drawAt && <DrawCountdown drawAt={drawAt} />}
      </div>
    );
  }

  return (
    <p className="mt-4 text-xs font-bold text-k-body">
      {drawMode === "rescan_win"
        ? "Une fois l'objectif atteint, chaque participation peut remporter le lot instantanément."
        : "Une fois l'objectif atteint, un gagnant est tiré au sort parmi les participants."}
    </p>
  );
}

/** Compte à rebours vers la date de tirage (formaté côté client). */
function DrawCountdown({ drawAt }: { drawAt: string }) {
  const label = useClientDateLabel(drawAt);
  return (
    <p className="mt-0.5 text-sm font-bold text-k-body">
      {label ? <>Rendez-vous le {label}</> : "Tirage à venir"}
    </p>
  );
}

// ────────────────────────────────────────────────────────────
// Contenu commerçant
// ────────────────────────────────────────────────────────────

function MerchantContent({ content }: { content: string | null }) {
  if (!content || !content.trim()) return null;
  return (
    <section
      aria-label="Actualités du commerce"
      className="k-border mb-6 rounded-2xl bg-k-stripe p-5 shadow-[4px_4px_0_var(--color-k-ink)]"
    >
      <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-k-body">
        📣 À ne pas manquer
      </h2>
      <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-k-ink">
        {content}
      </p>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Gains remportés
// ────────────────────────────────────────────────────────────

function dedupeWins(wins: JackpotWinView[]): JackpotWinView[] {
  const seen = new Set<string>();
  const out: JackpotWinView[] = [];
  for (const w of wins) {
    if (seen.has(w.code)) continue;
    seen.add(w.code);
    out.push(w);
  }
  return out;
}

function WinsSection({
  wins,
  drawMode,
  drawAt,
}: {
  wins: JackpotWinView[];
  drawMode: JackpotDrawMode;
  drawAt: string | null;
}) {
  if (wins.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-k-body">
        🏆 {wins.length > 1 ? "Mes jackpots" : "Mon jackpot"}
      </h2>
      <ul className="space-y-3">
        {wins.map((win) => (
          <li key={win.id}>
            <WinCard win={win} drawMode={drawMode} drawAt={drawAt} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function WinCard({
  win,
  drawMode,
  drawAt,
}: {
  win: JackpotWinView;
  drawMode: JackpotDrawMode;
  drawAt: string | null;
}) {
  const canShare = useCanShare();
  const [copied, setCopied] = useState(false);
  const drawLabel = useClientDateLabel(drawMode === "date_draw" ? drawAt : null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(win.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : le code reste lisible et recopiable.
    }
  };
  const share = async () => {
    try {
      await navigator.share({
        text: `J'ai gagné le jackpot ! Mon code à présenter en caisse : ${win.code}`,
      });
    } catch {
      // Partage annulé : rien à faire.
    }
  };

  return (
    <div className="k-border rounded-2xl bg-white p-5 text-center shadow-[6px_6px_0_var(--color-k-ink)]">
      <p className="inline-flex rounded-full border-2 border-k-ink bg-k-green/20 px-3 py-0.5 text-[11px] font-black uppercase text-k-ink">
        🎉 Jackpot remporté
      </p>

      {win.redeemedAt ? (
        <>
          <p className="mt-3 break-all font-mono text-2xl font-black tracking-wider text-k-ink/40 line-through">
            {win.code}
          </p>
          <p className="mt-2 rounded-xl border-2 border-k-ink/20 bg-zinc-50 px-3 py-2 text-sm font-bold text-k-body">
            ✓ Lot déjà récupéré en caisse.
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 text-[11px] font-mono uppercase tracking-[0.25em] text-k-body">
            Votre code de retrait
          </p>
          <p className="mt-1 break-all font-mono text-3xl font-black tracking-wider text-k-ink">
            {win.code}
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
            {drawLabel
              ? `Présentez ce code en caisse à partir du ${drawLabel}.`
              : "Présentez ce code en caisse pour récupérer votre lot."}
          </p>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Mode rotating_code : saisie du code affiché au comptoir
// ────────────────────────────────────────────────────────────

function RotatingParticipateForm({
  formRef,
  formAction,
  pending,
  code,
  onCodeChange,
  captchaToken,
  scan,
  error,
  challengeVisible,
  challengeAsked,
  challengePhase,
  challengeNonce,
  onCaptchaToken,
  onCaptchaUnavailable,
  onRestartChallenge,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  formAction: (formData: FormData) => void;
  pending: boolean;
  code: string;
  onCodeChange: (code: string) => void;
  captchaToken: string | null;
  scan: JackpotParticipationResult | null;
  error: string | null;
  challengeVisible: boolean;
  challengeAsked: boolean;
  challengePhase: ChallengePhase;
  challengeNonce: number;
  onCaptchaToken: (token: string | null) => void;
  onCaptchaUnavailable: () => void;
  onRestartChallenge: () => void;
}) {
  return (
    <section className="mb-6">
      <div className="k-border rounded-2xl bg-white p-5 shadow-[6px_6px_0_var(--color-k-ink)]">
        <h2 className="text-base font-black text-k-ink">Participer au jackpot</h2>
        <p className="mt-0.5 mb-3 text-sm text-k-body">
          Saisissez le code à 6 chiffres affiché à l&apos;écran du comptoir.
        </p>

        <form action={formAction} ref={formRef}>
          <label htmlFor="jackpot-code" className="sr-only">
            Code affiché au comptoir (6 chiffres)
          </label>
          <input
            id="jackpot-code"
            name="code"
            value={code}
            onChange={(e) =>
              onCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            maxLength={6}
            required
            placeholder="000000"
            aria-describedby="jackpot-code-help"
            className={codeInputClass}
          />
          <p id="jackpot-code-help" className="mt-1.5 text-center text-xs text-k-body/70">
            Le code change régulièrement — demandez-le au comptoir.
          </p>
          <input type="hidden" name="captcha" value={captchaToken ?? ""} />

          {/* Région vivante montée en permanence : un lecteur d'écran annonce
              l'apparition du bloc de challenge. */}
          <div aria-live="polite">
            {challengeVisible && (
              <ParticipateChallenge
                asked={challengeAsked}
                phase={challengePhase}
                nonce={challengeNonce}
                onToken={onCaptchaToken}
                onUnavailable={onCaptchaUnavailable}
                onRestart={onRestartChallenge}
              />
            )}
          </div>

          <button
            type="submit"
            disabled={pending}
            className="k-btn mt-4 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
          >
            {pending ? "Participation…" : "Je participe !"}
          </button>
        </form>

        {scan && (
          <div className="mt-4">
            <StateBox result={scan} />
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-center text-sm font-semibold text-red-600">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Bloc de challenge anti-robot de la participation. Il n'apparaît qu'à la
 * première participation d'un client (création d'identité) et doit rester
 * ACTIONNABLE en toutes circonstances : chaque issue a son message et sa sortie.
 * Aucune animation hors motion-safe (la page est scannée par axe).
 */
function ParticipateChallenge({
  asked,
  phase,
  nonce,
  onToken,
  onUnavailable,
  onRestart,
}: {
  asked: boolean;
  phase: ChallengePhase;
  nonce: number;
  onToken: (token: string | null) => void;
  onUnavailable: () => void;
  onRestart: () => void;
}) {
  const canRender = turnstileClientEnabled();

  return (
    <div
      role="group"
      aria-labelledby="jackpot-challenge-title"
      className="mt-4 rounded-xl border-2 border-k-ink bg-k-blue/20 px-4 py-3"
    >
      <p id="jackpot-challenge-title" className="text-sm font-black text-k-ink">
        Première participation : confirmez que vous n&apos;êtes pas un robot
      </p>
      <p className="mt-0.5 text-xs font-bold text-k-body">
        {asked
          ? "Ce contrôle n'a lieu qu'à votre première participation. Inutile de ressaisir votre code : il repart tout seul dès qu'il est validé."
          : "Une seule fois, le temps de vous enregistrer. Vos prochaines participations partiront directement."}
      </p>

      {canRender ? (
        <>
          <TurnstileWidget
            key={nonce}
            action="jackpot-participate"
            onToken={onToken}
            onUnavailable={onUnavailable}
          />
          {phase === "loading" && (
            <p className="mt-2 text-center text-xs font-bold text-k-body motion-safe:animate-pulse">
              Contrôle en cours…
            </p>
          )}
          {phase === "ready" && (
            <p className="mt-2 text-center text-xs font-bold text-k-ink">
              ✓ Contrôle validé.
            </p>
          )}
          {(phase === "expired" || phase === "unavailable") && (
            <div className="mt-2 text-center">
              <p className="text-xs font-bold text-red-700">
                {phase === "expired"
                  ? "Le contrôle a expiré avant l'envoi."
                  : "Le contrôle n'a pas pu se charger (connexion instable ou bloqueur de publicités)."}
              </p>
              <button
                type="button"
                onClick={onRestart}
                className="mt-2 rounded-xl border-2 border-k-ink bg-white px-4 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/30"
              >
                Recommencer le contrôle
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="mt-2 text-xs font-bold text-red-700">
          Le contrôle anti-robot n&apos;est pas disponible sur cet appareil.
          Rechargez la page ; si le message revient, signalez-le au comptoir.
        </p>
      )}
    </div>
  );
}

function StateBox({ result }: { result: JackpotParticipationResult }) {
  const message = messageForJackpotParticipation(result);
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-xl border-2 px-4 py-3 ${TONE_BOX[message.tone]}`}
    >
      <p className="text-sm font-black">{message.title}</p>
      {message.body && <p className="mt-0.5 text-sm font-bold">{message.body}</p>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Mode staff : QR de check-in présenté au comptoir
// ────────────────────────────────────────────────────────────

const CHECKIN_OFFLINE = "Connexion perdue.";

/**
 * Carte présentée au comptoir en mode staff : elle affiche un QR portant un
 * jeton de check-in signé et éphémère (~3 min). Miroir du StaffPassportCard du
 * passeport — le jeton d'identité du joueur ne quitte jamais le serveur.
 */
function StaffCheckinCard({ campaignId }: { campaignId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let failures = 0;

    const schedule = (delayMs: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), delayMs);
    };
    const fail = (message: string) => {
      failures += 1;
      setProblem(message);
      schedule(Math.min(30_000, 3_000 * failures));
    };
    const load = async () => {
      if (!active || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const result = await getJackpotCheckinToken({ campaignId });
        if (!active) return;
        if (!result.ok) {
          fail(result.error);
          return;
        }
        failures = 0;
        setProblem(null);
        setToken(result.data.token);
        schedule(Math.max(15_000, result.data.expiresAt - Date.now() - 30_000));
      } catch {
        if (!active) return;
        fail(CHECKIN_OFFLINE);
      } finally {
        inFlight = false;
      }
    };
    const onVisibility = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    void load();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [campaignId]);

  return (
    <section className="mb-6">
      <div className="k-border rounded-2xl bg-white p-5 text-center shadow-[6px_6px_0_var(--color-k-ink)]">
        <h2 className="text-base font-black text-k-ink">Participer en caisse</h2>
        <p className="mt-0.5 mb-4 text-sm text-k-body">
          Montrez ce code au comptoir : le commerçant le scanne pour enregistrer
          votre participation au jackpot.
        </p>

        {token ? (
          <>
            <CheckinQr value={token} />
            <p className="mt-3 text-xs text-k-body/70">
              Ce code se renouvelle automatiquement : gardez simplement cet écran
              ouvert, inutile de le photographier.
            </p>
            {problem && (
              <p role="status" className="mt-2 text-xs font-bold text-amber-700">
                {problem} Si le scan échoue, rechargez la page.
              </p>
            )}
          </>
        ) : problem ? (
          <p role="alert" className="rounded-xl border-2 border-red-300 bg-red-50 px-3 py-4 text-sm font-bold text-red-700">
            {problem} Nouvelle tentative en cours — vous pouvez aussi recharger la
            page.
          </p>
        ) : (
          <div
            className="mx-auto flex h-44 w-44 items-center justify-center rounded-xl border-2 border-dashed border-k-ink/30 text-sm font-bold text-k-body"
            role="status"
          >
            Préparation…
          </div>
        )}
      </div>
    </section>
  );
}

/** QR du jeton de check-in, généré côté client (même lib que les gains). */
function CheckinQr({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(value, { width: 320, margin: 1 })
        .then((url) => {
          if (!cancelled) setDataUrl(url);
        })
        .catch(() => {
          // QR non généré : le staff peut aussi saisir le jeton à la main.
        });
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!dataUrl) {
    return (
      <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-xl border-2 border-dashed border-k-ink/30 text-sm font-bold text-k-body">
        Préparation…
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt="QR de votre participation au jackpot, à faire scanner au comptoir"
      width={176}
      height={176}
      className="mx-auto h-44 w-44 rounded-xl border-2 border-k-ink bg-white p-2"
    />
  );
}

// ────────────────────────────────────────────────────────────
// Formatage de date côté client (le fuseau du serveur diffère)
// ────────────────────────────────────────────────────────────

/** Date lisible fr-FR, formatée côté client uniquement (pas de mismatch SSR). */
function useClientDateLabel(iso: string | null): string | null {
  const hydrated = useHydrated();
  if (!hydrated || !iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}
