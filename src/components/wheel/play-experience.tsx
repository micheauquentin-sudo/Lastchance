"use client";

import { useCallback, useRef, useState } from "react";
import { spinWheel, type SpinOutcome } from "@/actions/play";
import { capturePlayEvent } from "@/components/analytics";
import type { PublicEngagementAction } from "@/lib/engagement";
import { ClaimForm, type ClaimConfig } from "./claim-form";
import {
  EngagementGate,
  type ChosenEngagement,
} from "./engagement-gate";
import {
  TurnstileWidget,
  turnstileClientEnabled,
} from "./turnstile-widget";
import { ShareInvite } from "./share-invite";
import { WheelPointer, WheelSvg, type WheelSegment } from "./wheel-svg";
import { fontFamily } from "@/lib/fonts";
import { readShareSource } from "@/lib/share-source";
import { resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";

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
  logoUrl = null,
  segments,
  engagementActions = [],
  claimConfig = { collectEmail: true, collectPhone: false, codeTtlSeconds: null },
  style: rawStyle,
}: {
  slug: string;
  organizationName: string;
  /** Logo de l'établissement, affiché au-dessus de la roue. */
  logoUrl?: string | null;
  segments: WheelSegment[];
  engagementActions?: PublicEngagementAction[];
  claimConfig?: ClaimConfig;
  /** Personnalisation visuelle (roue, police, bouton) — défauts sinon. */
  style?: Partial<WheelStyle>;
}) {
  const style = resolveWheelStyle(rawStyle);
  const [phase, setPhase] = useState<Phase>(
    engagementActions.length > 0 ? "engage" : "idle",
  );
  const [rotation, setRotation] = useState(0);
  const [outcome, setOutcome] = useState<SpinOutcome | null>(null);
  const [engagement, setEngagement] = useState<ChosenEngagement | null>(null);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const spinningRef = useRef(false);

  const handleCaptchaToken = useCallback(
    (token: string | null) => setCaptchaToken(token),
    [],
  );

  function handleUnlock(chosen: ChosenEngagement) {
    setEngagement(chosen);
    setPhase("idle");
    capturePlayEvent("engagement_completed", { action: chosen.action });
  }

  async function handleSpin() {
    if (spinningRef.current) return;

    // Si Turnstile est activé, exiger le jeton avant d'appeler le serveur.
    if (turnstileClientEnabled() && !captchaToken) {
      setError("Merci de valider la vérification anti-robot avant de jouer.");
      return;
    }

    spinningRef.current = true;
    setError("");

    const result = await spinWheel(
      slug,
      engagement,
      captchaToken ?? undefined,
      readShareSource(),
    );

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
        <div
          className="play-in w-full text-center"
          style={{ fontFamily: fontFamily(style.font) }}
        >
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={organizationName}
              className="mx-auto mb-3 h-16 max-w-40 object-contain"
            />
          )}
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60 mb-2">
            {organizationName}
          </p>
          <h1 className="text-3xl font-extrabold text-white mb-8 leading-tight">
            {style.title || (
              <>
                Tournez la roue,
                <br />
                tentez votre chance !
              </>
            )}
          </h1>

          <div className="relative w-full play-float" style={{ animationPlayState: phase === "spinning" ? "paused" : "running" }}>
            <WheelPointer color={style.pointerColor} variant={style.pointer} />
            <WheelSvg
              segments={segments}
              rotation={rotation}
              spinning={phase === "spinning"}
              spinDurationMs={SPIN_DURATION_MS}
              style={style}
            />
          </div>

          <button
            onClick={handleSpin}
            disabled={phase === "spinning"}
            style={{
              backgroundImage: `linear-gradient(to right, ${style.buttonFrom}, ${style.buttonTo})`,
              boxShadow: `0 12px 34px color-mix(in srgb, ${style.buttonFrom} 45%, transparent)`,
            }}
            className="relative overflow-hidden w-full mt-9 rounded-2xl px-6 py-4 text-lg font-extrabold uppercase tracking-wider text-white disabled:opacity-70"
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
          <TurnstileWidget onToken={handleCaptchaToken} />

          {error && phase !== "spinning" && (
            <p className="mt-4 text-sm text-red-400">{error}</p>
          )}

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
          <ShareInvite slug={slug} organizationName={organizationName} />
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
          <ShareInvite slug={slug} organizationName={organizationName} />
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
