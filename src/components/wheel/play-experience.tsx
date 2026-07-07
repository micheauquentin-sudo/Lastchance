"use client";

import { useRef, useState } from "react";
import { spinWheel, type SpinOutcome } from "@/actions/play";
import { capturePlayEvent } from "@/components/analytics";
import type { PublicEngagementAction } from "@/lib/engagement";
import { ClaimForm, type ClaimConfig } from "./claim-form";
import {
  EngagementGate,
  type ChosenEngagement,
} from "./engagement-gate";
import { WheelPointer, WheelSvg, type WheelSegment } from "./wheel-svg";

const SPIN_DURATION_MS = 4400;

type Phase = "engage" | "idle" | "spinning" | "won" | "lost" | "blocked";

/**
 * Parcours joueur : (action d'engagement) → roue → spin (résultat
 * serveur) → gagné / perdu. Le formulaire de réclamation du gain
 * (ClaimForm) est branché à l'étape suivante, dans l'écran "won".
 */
export function PlayExperience({
  slug,
  organizationName,
  segments,
  engagementActions = [],
  claimConfig = { collectEmail: true, collectPhone: false, codeTtlSeconds: null },
}: {
  slug: string;
  organizationName: string;
  segments: WheelSegment[];
  engagementActions?: PublicEngagementAction[];
  claimConfig?: ClaimConfig;
}) {
  const [phase, setPhase] = useState<Phase>(
    engagementActions.length > 0 ? "engage" : "idle",
  );
  const [rotation, setRotation] = useState(0);
  const [outcome, setOutcome] = useState<SpinOutcome | null>(null);
  const [engagement, setEngagement] = useState<ChosenEngagement | null>(null);
  const [error, setError] = useState("");
  const spinningRef = useRef(false);

  function handleUnlock(chosen: ChosenEngagement) {
    setEngagement(chosen);
    setPhase("idle");
    capturePlayEvent("engagement_completed", { action: chosen.action });
  }

  async function handleSpin() {
    if (spinningRef.current) return;
    spinningRef.current = true;
    setError("");

    const result = await spinWheel(slug, engagement);

    if (!result.ok) {
      spinningRef.current = false;
      setError(result.error);
      setPhase("blocked");
      return;
    }

    const data = result.data;
    setOutcome(data);
    setPhase("spinning");
    capturePlayEvent("wheel_spun", { won: !data.isLosing });

    // Vise le milieu du segment gagné (segments visuels égaux),
    // + 6 tours complets + léger aléa dans le segment.
    const span = 360 / Math.max(segments.length, 1);
    const mid = data.prizeIndex * span + span / 2;
    const jitter = (Math.random() - 0.5) * Math.min(span * 0.6, 26);
    setRotation((current) => {
      const base = current - (current % 360);
      return base + 360 * 6 + (360 - mid) + jitter;
    });

    window.setTimeout(() => {
      spinningRef.current = false;
      setPhase(data.isLosing ? "lost" : "won");
    }, SPIN_DURATION_MS + 200);
  }

  return (
    <div className="w-full max-w-sm mx-auto px-6 py-10 flex flex-col items-center min-h-dvh justify-center">
      {phase === "engage" && (
        <EngagementGate
          organizationName={organizationName}
          actions={engagementActions}
          onUnlock={handleUnlock}
        />
      )}

      {(phase === "idle" || phase === "spinning") && (
        <div className="play-in w-full text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-300 mb-2">
            {organizationName}
          </p>
          <h1 className="text-3xl font-extrabold text-white mb-8 leading-tight">
            Tournez la roue,
            <br />
            tentez votre chance !
          </h1>

          <div className="relative w-full play-float" style={{ animationPlayState: phase === "spinning" ? "paused" : "running" }}>
            <WheelPointer color="#a78bfa" />
            <WheelSvg
              segments={segments}
              rotation={rotation}
              spinning={phase === "spinning"}
              spinDurationMs={SPIN_DURATION_MS}
            />
          </div>

          <button
            onClick={handleSpin}
            disabled={phase === "spinning"}
            className="relative overflow-hidden w-full mt-9 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-6 py-4 text-lg font-extrabold uppercase tracking-wider text-white shadow-[0_12px_34px_rgba(139,92,246,.45)] disabled:opacity-70"
          >
            {phase === "spinning" ? (
              "La roue tourne…"
            ) : (
              <>
                <span
                  aria-hidden
                  className="play-shine absolute top-0 left-0 h-full w-2/5 bg-gradient-to-r from-transparent via-white/35 to-transparent"
                />
                Lancer la roue
              </>
            )}
          </button>
          <p className="mt-4 text-[11px] text-zinc-500 font-mono">
            Résultat calculé côté serveur · un jeu par personne
          </p>
        </div>
      )}

      {phase === "won" && outcome && (
        <div className="play-in w-full text-center">
          <p className="text-xs font-mono tracking-[0.3em] text-emerald-400 mb-3">
            ✦ GAGNÉ ✦
          </p>
          <h2 className="text-3xl font-extrabold text-white mb-2">
            {outcome.label}
          </h2>
          {outcome.description && (
            <p className="text-zinc-400 mb-6">{outcome.description}</p>
          )}
          {outcome.claimToken ? (
            <ClaimForm claimToken={outcome.claimToken} config={claimConfig} />
          ) : (
            <p className="text-zinc-500 text-sm">
              Présentez cet écran au comptoir pour récupérer votre gain.
            </p>
          )}
        </div>
      )}

      {phase === "lost" && (
        <div className="play-in w-full text-center">
          <div className="text-5xl mb-6">🎲</div>
          <h2 className="text-3xl font-extrabold text-white mb-3">
            Pas cette fois…
          </h2>
          <p className="text-zinc-400">
            La roue ne vous a rien donné aujourd&apos;hui. La chance tourne,
            revenez bientôt !
          </p>
        </div>
      )}

      {phase === "blocked" && (
        <div className="play-in w-full text-center">
          <div className="text-5xl mb-6">🔒</div>
          <h2 className="text-2xl font-extrabold text-white mb-3">
            Impossible de jouer
          </h2>
          <p className="text-zinc-400">{error}</p>
        </div>
      )}
    </div>
  );
}
