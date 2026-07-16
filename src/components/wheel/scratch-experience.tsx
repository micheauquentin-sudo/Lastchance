"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { spinWheel, type SpinOutcome } from "@/actions/play";
import { capturePlayEvent } from "@/components/analytics";
import type { PublicEngagementAction } from "@/lib/engagement";
import { ClaimForm, type ClaimConfig } from "./claim-form";
import { Countdown } from "./countdown";
import { EngagementGate, type ChosenEngagement } from "./engagement-gate";
import { ScratchCard } from "./scratch-card";
import { ShareInvite } from "./share-invite";
import { TurnstileWidget, turnstileClientEnabled } from "./turnstile-widget";
import { fontFamily } from "@/lib/fonts";
import { readShareSource } from "@/lib/share-source";
import { resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";

type Phase = "engage" | "idle" | "scratching" | "won" | "lost" | "blocked";

/**
 * Parcours joueur pour la mécanique « carte à gratter » : même backend
 * que la roue (spinWheel détermine déjà le résultat côté serveur, voir
 * PlayExperience) — seule la présentation change. Le résultat est
 * révélé en grattant une carte au lieu de tourner une roue.
 */
export function ScratchExperience({
  slug,
  organizationName,
  logoUrl = null,
  engagementActions = [],
  claimConfig = { collectEmail: true, collectPhone: false, codeTtlSeconds: null },
  style: rawStyle,
}: {
  slug: string;
  organizationName: string;
  logoUrl?: string | null;
  engagementActions?: PublicEngagementAction[];
  claimConfig?: ClaimConfig;
  style?: Partial<WheelStyle>;
}) {
  const style = resolveWheelStyle(rawStyle);
  const [phase, setPhase] = useState<Phase>(
    engagementActions.length > 0 ? "engage" : "idle",
  );
  const [outcome, setOutcome] = useState<SpinOutcome | null>(null);
  const [engagement, setEngagement] = useState<ChosenEngagement | null>(null);
  const [error, setError] = useState("");
  const [nextEligibleAt, setNextEligibleAt] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [returningName, setReturningName] = useState<string | null>(null);
  const requestingRef = useRef(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`lastchance:name:${slug}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique post-montage, évite tout écart d'hydratation SSR/CSR.
      if (stored) setReturningName(stored);
    } catch {
      // Stockage indisponible — pas de retour personnalisé, sans gravité.
    }
  }, [slug]);

  const handleCaptchaToken = useCallback(
    (token: string | null) => setCaptchaToken(token),
    [],
  );

  function handleUnlock(chosen: ChosenEngagement) {
    setEngagement(chosen);
    setPhase("idle");
    capturePlayEvent("engagement_completed", { action: chosen.action });
  }

  async function handleStart() {
    if (requestingRef.current) return;

    if (turnstileClientEnabled() && !captchaToken) {
      setError("Merci de valider la vérification anti-robot avant de jouer.");
      return;
    }

    requestingRef.current = true;
    setError("");

    const result = await spinWheel(
      slug,
      engagement,
      captchaToken ?? undefined,
      readShareSource(),
    );
    requestingRef.current = false;

    if (!result.ok) {
      setError(result.error);
      setNextEligibleAt(result.nextEligibleAt ?? null);
      setPhase("blocked");
      return;
    }

    setOutcome(result.data);
    setPhase("scratching");
    // Événement générique "tirage effectué" — même nom que pour la roue
    // afin de garder un entonnoir d'analytics unique entre mécaniques.
    capturePlayEvent("wheel_spun", { won: !result.data.isLosing });
  }

  function handleRevealed() {
    if (!outcome) return;
    setPhase(outcome.isLosing ? "lost" : "won");
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

      {phase === "idle" && (
        <div className="play-in w-full text-center" style={{ fontFamily: fontFamily(style.font) }}>
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={organizationName}
              className="mx-auto mb-3 h-16 max-w-40 object-contain"
            />
          )}
          {returningName && (
            <p className="text-sm font-semibold text-emerald-400 mb-1">
              Bon retour, {returningName} ! 👋
            </p>
          )}
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60 mb-2">
            {organizationName}
          </p>
          <h1 className="text-3xl font-extrabold text-white mb-8 leading-tight">
            {style.title || (
              <>
                Grattez la carte,
                <br />
                tentez votre chance !
              </>
            )}
          </h1>

          <div className="mx-auto flex aspect-[8/5] w-full max-w-[320px] items-center justify-center rounded-3xl border-2 border-dashed border-white/20 bg-white/5">
            <span className="text-5xl">🎟️</span>
          </div>

          <button
            onClick={handleStart}
            aria-label="Gratter la carte"
            style={{
              backgroundImage: `linear-gradient(to right, ${style.buttonFrom}, ${style.buttonTo})`,
              boxShadow: `0 12px 34px color-mix(in srgb, ${style.buttonFrom} 45%, transparent)`,
            }}
            className="relative overflow-hidden w-full mt-9 rounded-2xl px-6 py-4 text-lg font-extrabold uppercase tracking-wider text-white"
          >
            <span
              aria-hidden
              className="play-shine absolute top-0 left-0 h-full w-2/5 bg-gradient-to-r from-transparent via-white/35 to-transparent"
            />
            Gratter la carte
          </button>
          <TurnstileWidget onToken={handleCaptchaToken} />

          {error && (
            <p role="alert" aria-live="assertive" className="mt-4 text-sm text-red-400">
              {error}
            </p>
          )}

          <p className="mt-4 text-[11px] text-zinc-500 font-mono">
            Résultat calculé côté serveur · un jeu par personne
          </p>
        </div>
      )}

      {phase === "scratching" && outcome && (
        <div className="play-in w-full text-center">
          <h1 className="text-2xl font-extrabold text-white mb-8">Grattez pour découvrir votre gain</h1>
          <ScratchCard
            label={outcome.label}
            description={outcome.description}
            isLosing={outcome.isLosing}
            buttonFrom={style.buttonFrom}
            buttonTo={style.buttonTo}
            onRevealed={handleRevealed}
          />
        </div>
      )}

      {phase === "won" && outcome && (
        <div role="status" aria-live="polite" className="play-in w-full text-center">
          <p className="text-xs font-mono tracking-[0.3em] text-emerald-400 mb-3">✦ GAGNÉ ✦</p>
          <h2 className="text-3xl font-extrabold text-white mb-2">{outcome.label}</h2>
          {outcome.description && <p className="text-zinc-400 mb-6">{outcome.description}</p>}
          {outcome.claimToken ? (
            <ClaimForm claimToken={outcome.claimToken} config={claimConfig} slug={slug} />
          ) : (
            <p className="text-zinc-500 text-sm">
              Présentez cet écran au comptoir pour récupérer votre gain.
            </p>
          )}
          <ShareInvite slug={slug} organizationName={organizationName} />
        </div>
      )}

      {phase === "lost" && (
        <div role="status" aria-live="polite" className="play-in w-full text-center">
          <div aria-hidden className="text-5xl mb-6">🎲</div>
          <h2 className="text-3xl font-extrabold text-white mb-3">Pas cette fois…</h2>
          <p className="text-zinc-400">
            La carte ne vous a rien donné aujourd&apos;hui. La chance tourne,
            revenez bientôt !
          </p>
          <ShareInvite slug={slug} organizationName={organizationName} />
        </div>
      )}

      {phase === "blocked" && (
        <div role="status" aria-live="polite" className="play-in w-full text-center">
          <div aria-hidden className="text-5xl mb-6">🔒</div>
          <h2 className="text-2xl font-extrabold text-white mb-3">Impossible de jouer</h2>
          <p className="text-zinc-400">{error}</p>
          {nextEligibleAt && (
            <p className="mt-4 text-sm font-mono text-amber-300">
              ⏱ Revenez dans <Countdown target={nextEligibleAt} />
            </p>
          )}
        </div>
      )}
    </div>
  );
}
