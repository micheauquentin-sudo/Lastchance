"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  prepareAnonymousPlayer,
  recoverPendingWin,
  spinWheel,
  type SpinOutcome,
} from "@/actions/play";
import { capturePlayEvent } from "@/components/analytics";
import { ClaimForm, type ClaimConfig } from "./claim-form";
import { Countdown } from "./countdown";
import { DiscoverFooter } from "./discover-footer";
import { SPIN_BUTTON_KERMESSE, playText } from "./play-theme";
import { ScratchCard } from "./scratch-card";
import { ShareInvite } from "./share-invite";
import { TurnstileWidget, turnstileClientEnabled } from "./turnstile-widget";
import { fontFamily } from "@/lib/fonts";
import { readShareSource } from "@/lib/share-source";
import { resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";

type Phase = "idle" | "scratching" | "won" | "lost" | "blocked";

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
  claimConfig = { collectEmail: true, collectPhone: false, codeTtlSeconds: null },
  style: rawStyle,
}: {
  slug: string;
  organizationName: string;
  logoUrl?: string | null;
  claimConfig?: ClaimConfig;
  style?: Partial<WheelStyle>;
}) {
  const style = resolveWheelStyle(rawStyle);
  // Thème « kermesse » : même bascule de classes que PlayExperience.
  const kermesse = style.pageTheme === "kermesse";
  const [phase, setPhase] = useState<Phase>("idle");
  const [outcome, setOutcome] = useState<SpinOutcome | null>(null);
  const [error, setError] = useState("");
  const [nextEligibleAt, setNextEligibleAt] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [returningName, setReturningName] = useState<string | null>(null);
  const requestingRef = useRef(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`lastchance:name:${slug}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique post-montage, évite tout écart d'hydratation SSR/CSR.
      if (stored) setReturningName(stored);
    } catch {
      // Stockage indisponible — pas de retour personnalisé, sans gravité.
    }
  }, [slug]);

  useEffect(() => {
    let active = true;
    prepareAnonymousPlayer()
      .then(() => recoverPendingWin(slug))
      .then((pending) => {
        if (!active || !pending) return;
        setOutcome(pending);
        setPhase("won");
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [slug]);

  const handleCaptchaToken = useCallback(
    (token: string | null) => setCaptchaToken(token),
    [],
  );

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
      null,
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
    <div className="w-full max-w-sm mx-auto px-6 py-8 flex flex-col items-center min-h-full justify-center">
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
            <p className={`text-sm font-semibold mb-1 ${kermesse ? "text-k-green" : "text-emerald-400"}`}>
              Bon retour, {returningName} ! 👋
            </p>
          )}
          <p className={`text-xs font-semibold uppercase tracking-[0.25em] mb-2 ${playText.kicker(kermesse)}`}>
            {organizationName}
          </p>
          <h1 className={`text-3xl font-extrabold mb-8 leading-tight ${playText.title(kermesse)}`}>
            {style.title || (
              <>
                Grattez la carte,
                <br />
                tentez votre chance !
              </>
            )}
          </h1>

          <div
            className={
              kermesse
                ? "mx-auto flex aspect-[8/5] w-full max-w-[320px] items-center justify-center rounded-3xl border-2 border-dashed border-k-ink/40 bg-white"
                : "mx-auto flex aspect-[8/5] w-full max-w-[320px] items-center justify-center rounded-3xl border-2 border-dashed border-white/20 bg-white/5"
            }
          >
            <span className="text-5xl">🎟️</span>
          </div>

          <button
            onClick={handleStart}
            aria-label="Gratter la carte"
            style={
              kermesse
                ? { backgroundImage: `linear-gradient(to right, ${style.buttonFrom}, ${style.buttonTo})` }
                : {
                    backgroundImage: `linear-gradient(to right, ${style.buttonFrom}, ${style.buttonTo})`,
                    boxShadow: `0 12px 34px color-mix(in srgb, ${style.buttonFrom} 45%, transparent)`,
                  }
            }
            className={`relative overflow-hidden w-full mt-9 rounded-2xl px-6 py-4 text-lg font-extrabold uppercase tracking-wider transition-all duration-100 ${
              kermesse ? SPIN_BUTTON_KERMESSE : "text-white"
            }`}
          >
            <span
              aria-hidden
              className="play-shine absolute top-0 left-0 h-full w-2/5 bg-gradient-to-r from-transparent via-white/35 to-transparent"
            />
            Gratter la carte
          </button>
          <TurnstileWidget onToken={handleCaptchaToken} />

          {error && (
            <p role="alert" aria-live="assertive" className={`mt-4 text-sm ${kermesse ? "text-red-600 font-semibold" : "text-red-400"}`}>
              {error}
            </p>
          )}

          <p className={`mt-4 text-[11px] font-mono ${kermesse ? "text-k-body/70" : "text-zinc-500"}`}>
            Résultat calculé côté serveur · un jeu par personne
          </p>
          <DiscoverFooter kermesse={kermesse} />
        </div>
      )}

      {phase === "scratching" && outcome && (
        <div className="play-in w-full text-center">
          <h1 className={`text-2xl font-extrabold mb-8 ${playText.title(kermesse)}`}>Grattez pour découvrir votre gain</h1>
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
          <p className={`text-xs font-mono tracking-[0.3em] mb-3 ${kermesse ? "text-k-green font-bold" : "text-emerald-400"}`}>✦ GAGNÉ ✦</p>
          <h2 className={`text-3xl font-extrabold mb-2 ${playText.title(kermesse)}`}>{outcome.label}</h2>
          {outcome.description && <p className={`mb-6 ${playText.body(kermesse)}`}>{outcome.description}</p>}
          {outcome.claimToken ? (
            <ClaimForm claimToken={outcome.claimToken} config={claimConfig} slug={slug} kermesse={kermesse} />
          ) : (
            <p className={`text-sm ${kermesse ? "text-k-body" : "text-zinc-500"}`}>
              Présentez cet écran au comptoir pour récupérer votre gain.
            </p>
          )}
          <ShareInvite slug={slug} organizationName={organizationName} kermesse={kermesse} />
          <DiscoverFooter kermesse={kermesse} />
        </div>
      )}

      {phase === "lost" && (
        <div role="status" aria-live="polite" className="play-in w-full text-center">
          <div aria-hidden className="text-5xl mb-6">🎲</div>
          <h2 className={`text-3xl font-extrabold mb-3 ${playText.title(kermesse)}`}>Pas cette fois…</h2>
          <p className={playText.body(kermesse)}>
            La carte ne vous a rien donné aujourd&apos;hui. La chance tourne,
            revenez bientôt !
          </p>
          <ShareInvite slug={slug} organizationName={organizationName} kermesse={kermesse} />
          <DiscoverFooter kermesse={kermesse} />
        </div>
      )}

      {phase === "blocked" && (
        <div role="status" aria-live="polite" className="play-in w-full text-center">
          <div aria-hidden className="text-5xl mb-6">🔒</div>
          <h2 className={`text-2xl font-extrabold mb-3 ${playText.title(kermesse)}`}>Impossible de jouer</h2>
          <p className={playText.body(kermesse)}>{error}</p>
          {nextEligibleAt && (
            <p className={`mt-4 text-sm font-mono ${kermesse ? "text-k-orange font-bold" : "text-amber-300"}`}>
              ⏱ Revenez dans <Countdown target={nextEligibleAt} />
            </p>
          )}
          <DiscoverFooter kermesse={kermesse} />
        </div>
      )}
    </div>
  );
}
