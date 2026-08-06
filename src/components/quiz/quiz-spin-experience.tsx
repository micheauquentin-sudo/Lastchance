"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { consumeQuizSpin, type QuizSpinOutcome } from "@/actions/quiz";
import { ClaimForm, type ClaimConfig } from "@/components/wheel/claim-form";
import { WheelPointer, WheelSvg, type WheelSegment } from "@/components/wheel/wheel-svg";
import type { WheelStyle } from "@/lib/wheel-style";

/**
 * Tour de roue offert par un quiz. Réutilise l'animation de la roue publique
 * (WheelSvg / WheelPointer) et le formulaire de gain (ClaimForm → claimPrize),
 * exactement comme le calendrier et le passeport de fidélité : le résultat est
 * décidé CÔTÉ SERVEUR par `consumeQuizSpin`, on ne fait qu'animer vers le segment
 * renvoyé puis brancher le claimToken sur le flux GAIN-… habituel. DA « Kermesse ».
 *
 * Miroir strict de CalendarSpinExperience (même moteur, même contrat de jeton).
 */

const SPIN_DURATION_MS = 4400;
/** Durée écourtée sous prefers-reduced-motion (comme la roue publique). */
const SPIN_DURATION_REDUCED_MS = 300;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** `prefers-reduced-motion` sûr à l'hydratation (serveur → false). */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

const SPIN_WHEEL_STYLE: Partial<WheelStyle> = {
  ring: "gold",
  ringColor: "#211d16",
  hub: "disc",
  hubColor: "#211d16",
  pointerColor: "#f5793b",
  labelColor: "auto",
};

/**
 * `kept` : la roue n'avait rien à tirer (`no_prize`). Ce n'est PAS une défaite —
 * `consume_quiz_spin_grant` sort sans consommer le grant, le tour reste offert.
 */
type Phase = "ready" | "spinning" | "won" | "lost" | "kept" | "error";

export function QuizSpinExperience({
  quizId,
  grantToken,
  segments,
  claimConfig,
  organizationName,
  organizationId = null,
  rewardLabel,
  onExit,
}: {
  quizId: string;
  grantToken: string;
  /** Segments de la roue cible (ordre = index serveur du tirage). */
  segments: WheelSegment[];
  /** Config de collecte réelle de la campagne cible (source serveur). */
  claimConfig: ClaimConfig;
  organizationName: string;
  /** Organisation du jeu — clé de la proposition de Passeport. */
  organizationId?: string | null;
  /** Libellé du lot du quiz, pour l'en-tête. */
  rewardLabel: string;
  /** Retour à l'écran de fin du quiz. */
  onExit: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const spinDurationMs = reducedMotion
    ? SPIN_DURATION_REDUCED_MS
    : SPIN_DURATION_MS;

  const [phase, setPhase] = useState<Phase>("ready");
  const [rotation, setRotation] = useState(0);
  const [outcome, setOutcome] = useState<QuizSpinOutcome | null>(null);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  async function launch() {
    if (busyRef.current) return;
    busyRef.current = true;
    setError("");

    const result = await consumeQuizSpin({ quizId, grantToken });
    if (!result.ok) {
      busyRef.current = false;
      setError(result.error);
      setPhase("error");
      return;
    }

    const data = result.data;
    setOutcome(data);

    // Rien de tirable sur la roue : le grant N'A PAS été consommé.
    if (data.state === "no_prize") {
      busyRef.current = false;
      setPhase("kept");
      return;
    }

    const losing = data.isLosing;

    // Roue indisponible (lot introuvable, roue supprimée) : on révèle le
    // résultat sans animation plutôt que de tourner à vide.
    if (data.prizeIndex === null || segments.length === 0) {
      busyRef.current = false;
      setPhase(losing ? "lost" : "won");
      return;
    }

    setPhase("spinning");
    const turns = reducedMotion ? 1 : 6;
    const span = 360 / Math.max(segments.length, 1);
    const mid = data.prizeIndex * span + span / 2;
    const jitter = (Math.random() - 0.5) * Math.min(span * 0.6, 26);
    setRotation((current) => {
      const base = current - (current % 360);
      return base + 360 * turns + (360 - mid) + jitter;
    });

    window.setTimeout(() => {
      busyRef.current = false;
      setPhase(losing ? "lost" : "won");
    }, spinDurationMs + 200);
  }

  return (
    <section className="mx-auto max-w-md px-4 py-8 text-center">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-k-body">
        {organizationName}
      </p>
      <h1 className="mt-1 text-2xl font-black leading-tight text-k-ink">
        {rewardLabel || "Votre tour de roue offert"}
      </h1>

      {(phase === "ready" || phase === "spinning") && (
        <div className="mt-6">
          <div className="relative mx-auto w-full max-w-[20rem]">
            <WheelPointer
              color={SPIN_WHEEL_STYLE.pointerColor}
              variant="triangle"
              spinning={phase === "spinning"}
            />
            <WheelSvg
              segments={segments}
              rotation={rotation}
              spinning={phase === "spinning"}
              spinDurationMs={spinDurationMs}
              reducedMotion={reducedMotion}
              style={SPIN_WHEEL_STYLE}
            />
          </div>

          <button
            type="button"
            onClick={launch}
            disabled={phase === "spinning"}
            aria-label={phase === "spinning" ? "La roue tourne" : "Lancer la roue offerte"}
            className="k-btn mt-8 w-full rounded-2xl border-2 border-k-ink bg-k-yellow px-6 py-4 text-base font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-70"
          >
            {phase === "spinning" ? "La roue tourne…" : "🎡 Lancer la roue"}
          </button>
          <p className="mt-4 text-[11px] font-mono text-k-body/70">
            Résultat calculé côté serveur · tour unique
          </p>
        </div>
      )}

      {phase === "won" && outcome && (
        <div role="status" aria-live="polite" className="mt-6">
          <p className="mb-3 text-xs font-mono font-bold tracking-[0.3em] text-k-green">
            ✦ GAGNÉ ✦
          </p>
          <h2 className="mb-2 text-3xl font-black text-k-ink">
            {outcome.label ?? "Un lot vous attend"}
          </h2>
          {outcome.description && (
            <p className="mb-6 text-k-body">{outcome.description}</p>
          )}
          {outcome.claimToken ? (
            <ClaimForm
              claimToken={outcome.claimToken}
              config={claimConfig}
              slug={quizId}
              organizationName={organizationName}
              organizationId={organizationId}
              kermesse
            />
          ) : (
            <p className="text-sm text-k-body">
              Présentez cet écran au comptoir pour récupérer votre gain.
            </p>
          )}
          <BackButton onExit={onExit} />
        </div>
      )}

      {phase === "lost" && (
        <div role="status" aria-live="polite" className="mt-6">
          <div aria-hidden className="mb-6 text-5xl">
            🎲
          </div>
          <h2 className="mb-3 text-3xl font-black text-k-ink">
            Pas de gain cette fois…
          </h2>
          <p className="text-k-body">
            La roue ne vous a rien donné — merci d&apos;avoir joué, et bravo pour
            votre score !
          </p>
          <BackButton onExit={onExit} />
        </div>
      )}

      {phase === "kept" && (
        <div role="status" aria-live="polite" className="mt-6">
          <div aria-hidden className="mb-6 text-5xl">
            ⏳
          </div>
          <h2 className="mb-3 text-2xl font-black text-k-ink">
            Aucun lot à distribuer pour l&apos;instant
          </h2>
          <p className="text-k-body">
            La roue n&apos;a rien à donner en ce moment — pas d&apos;inquiétude,
            votre tour reste offert : réessayez plus tard.
          </p>
          <BackButton onExit={onExit} />
        </div>
      )}

      {phase === "error" && (
        <div role="alert" className="mt-6">
          <div aria-hidden className="mb-4 text-4xl">
            🙃
          </div>
          {/* Aucun refus de `consumeQuizSpin` ne consomme le grant (cadence, quiz
              fermé, réseau, erreur serveur) : le tour reste acquis. */}
          <h2 className="mb-2 text-xl font-black text-k-ink">
            Le tour n&apos;a pas pu se lancer
          </h2>
          <p className="text-sm font-bold text-k-body">{error}</p>
          <p className="mt-2 text-sm text-k-body">
            Votre tour reste offert — réessayez.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setError("");
                setPhase("ready");
              }}
              className="k-btn-sm rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink"
            >
              Réessayer
            </button>
            <BackButton onExit={onExit} inline />
          </div>
        </div>
      )}
    </section>
  );
}

function BackButton({ onExit, inline = false }: { onExit: () => void; inline?: boolean }) {
  return (
    <button
      type="button"
      onClick={onExit}
      className={
        inline
          ? "rounded-xl border-2 border-k-ink bg-white px-4 py-2 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
          : "mt-8 rounded-xl border-2 border-k-ink bg-white px-5 py-2.5 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
      }
    >
      Retour à mon résultat
    </button>
  );
}
