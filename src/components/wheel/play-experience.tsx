"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
import {
  TurnstileWidget,
  turnstileClientEnabled,
} from "./turnstile-widget";
import { ShareInvite } from "./share-invite";
import { ReferralPanel, type PlayReferral } from "./referral-panel";
import { SPIN_BUTTON_KERMESSE, playText } from "./play-theme";
import { WheelPointer, WheelSvg, type WheelSegment } from "./wheel-svg";
import { CartoonBurst } from "./cartoon-burst";
import { fontFamily } from "@/lib/fonts";
import { readShareSource } from "@/lib/share-source";
import { resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";

const SPIN_DURATION_MS = 4400;
/** Durée écourtée quand l'utilisateur préfère réduire les animations. */
const SPIN_DURATION_REDUCED_MS = 300;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * `prefers-reduced-motion` côté client, sûr à l'hydratation : le rendu
 * serveur suppose « pas de préférence », la vraie valeur s'applique dès
 * l'abonnement au media query après montage.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

type Phase = "idle" | "spinning" | "won" | "lost" | "blocked";

/**
 * Parcours joueur anonyme : roue → spin (résultat
 * serveur) → gagné / perdu. Le formulaire de réclamation du gain
 * (ClaimForm) est branché à l'étape suivante, dans l'écran "won".
 */
export function PlayExperience({
  slug,
  organizationName,
  logoUrl = null,
  segments,
  claimConfig = { collectEmail: true, collectPhone: false, codeTtlSeconds: null },
  style: rawStyle,
  referral = null,
}: {
  slug: string;
  organizationName: string;
  /** Logo de l'établissement, affiché au-dessus de la roue. */
  logoUrl?: string | null;
  segments: WheelSegment[];
  claimConfig?: ClaimConfig;
  /** Personnalisation visuelle (roue, police, bouton) — défauts sinon. */
  style?: Partial<WheelStyle>;
  /** Parrainage ludique (config publique) — absent/false = section masquée. */
  referral?: PlayReferral | null;
}) {
  const style = resolveWheelStyle(rawStyle);
  const isCartoon = style.cartoonAnimations;
  // Réduction des animations : durée du spin écourtée À LA SOURCE pour
  // que la transition CSS (WheelSvg) et le timer de révélation du
  // résultat restent synchrones.
  const reducedMotion = usePrefersReducedMotion();
  const spinDurationMs = reducedMotion
    ? SPIN_DURATION_REDUCED_MS
    : SPIN_DURATION_MS;
  // Thème « kermesse » : la page adopte l'univers du site Lastchance
  // (crème + encre) — les classes de texte/bouton basculent en bloc.
  const kermesse = style.pageTheme === "kermesse";
  const showReferral = referral?.enabled === true;
  const [phase, setPhase] = useState<Phase>("idle");
  const [rotation, setRotation] = useState(0);
  const [outcome, setOutcome] = useState<SpinOutcome | null>(null);
  const [error, setError] = useState("");
  const [nextEligibleAt, setNextEligibleAt] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [returningName, setReturningName] = useState<string | null>(null);
  const spinningRef = useRef(false);

  // Retour personnalisé : lu après le montage (jamais côté serveur) pour
  // éviter tout écart d'hydratation entre rendu serveur et client.
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
      null,
      captchaToken ?? undefined,
      readShareSource(),
    );

    if (!result.ok) {
      spinningRef.current = false;
      setError(result.error);
      setNextEligibleAt(result.nextEligibleAt ?? null);
      setPhase("blocked");
      return;
    }

    const data = result.data;
    setOutcome(data);
    setPhase("spinning");
    capturePlayEvent("wheel_spun", { won: !data.isLosing });

    // Vise le milieu du segment gagné (segments visuels égaux),
    // + 6 tours complets + léger aléa dans le segment. En mouvement
    // réduit : un seul tour, toujours vers l'avant.
    const turns = reducedMotion ? 1 : 6;
    const span = 360 / Math.max(segments.length, 1);
    const mid = data.prizeIndex * span + span / 2;
    const jitter = (Math.random() - 0.5) * Math.min(span * 0.6, 26);
    setRotation((current) => {
      const base = current - (current % 360);
      return base + 360 * turns + (360 - mid) + jitter;
    });

    window.setTimeout(() => {
      spinningRef.current = false;
      setPhase(data.isLosing ? "lost" : "won");
    }, spinDurationMs + 200);
  }

  return (
    <div className="w-full max-w-sm mx-auto px-6 py-8 flex flex-col items-center min-h-full justify-center">
      {(phase === "idle" || phase === "spinning") && (
        <div
          className={`${isCartoon ? "cartoon-pop-in" : "play-in"} w-full text-center`}
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
                Tournez la roue,
                <br />
                tentez votre chance !
              </>
            )}
          </h1>

          <div className="relative w-full play-float" style={{ animationPlayState: phase === "spinning" ? "paused" : "running" }}>
            <WheelPointer color={style.pointerColor} variant={style.pointer} spinning={phase === "spinning"} />
            <WheelSvg
              segments={segments}
              rotation={rotation}
              spinning={phase === "spinning"}
              spinDurationMs={spinDurationMs}
              reducedMotion={reducedMotion}
              style={style}
            />
          </div>

          <button
            onClick={handleSpin}
            disabled={phase === "spinning"}
            aria-label={phase === "spinning" ? "La roue tourne" : "Lancer la roue"}
            style={
              isCartoon || kermesse
                ? { backgroundImage: `linear-gradient(to right, ${style.buttonFrom}, ${style.buttonTo})` }
                : {
                    backgroundImage: `linear-gradient(to right, ${style.buttonFrom}, ${style.buttonTo})`,
                    boxShadow: `0 12px 34px color-mix(in srgb, ${style.buttonFrom} 45%, transparent)`,
                  }
            }
            className={`relative overflow-hidden w-full mt-9 rounded-2xl px-6 py-4 text-lg font-extrabold uppercase tracking-wider transition-all duration-100 disabled:opacity-70 ${
              kermesse
                ? SPIN_BUTTON_KERMESSE
                : isCartoon
                  ? "text-white border-[3px] border-black shadow-[6px_6px_0_#000000] hover:animate-cartoon-wobble active:translate-x-[2px] active:translate-y-[2px] active:scale-95 active:shadow-[2px_2px_0_#000000]"
                  : "text-white active:scale-[0.98]"
            }`}
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

      {phase === "won" && outcome && (
        <div role="status" aria-live="polite" className={`${isCartoon ? "cartoon-pop-in" : "play-in"} relative w-full text-center`}>
          {isCartoon && <CartoonBurst />}
          <p className={`text-xs font-mono tracking-[0.3em] mb-3 ${kermesse ? "text-k-green font-bold" : "text-emerald-400"}`}>
            ✦ GAGNÉ ✦
          </p>
          <h2 className={`text-3xl font-extrabold mb-2 ${playText.title(kermesse)}`}>
            {outcome.label}
          </h2>
          {outcome.description && (
            <p className={`mb-6 ${playText.body(kermesse)}`}>{outcome.description}</p>
          )}
          {outcome.claimToken ? (
            <ClaimForm claimToken={outcome.claimToken} config={claimConfig} slug={slug} organizationName={organizationName} kermesse={kermesse} />
          ) : (
            <p className={`text-sm ${kermesse ? "text-k-body" : "text-zinc-500"}`}>
              Présentez cet écran au comptoir pour récupérer votre gain.
            </p>
          )}
          <ShareInvite slug={slug} organizationName={organizationName} kermesse={kermesse} />
          {showReferral && referral && (
            <ReferralPanel
              slug={slug}
              referral={referral}
              proofSpinId={outcome.spinId}
              segments={segments}
              claimConfig={claimConfig}
              organizationName={organizationName}
              kermesse={kermesse}
            />
          )}
          <DiscoverFooter kermesse={kermesse} />
        </div>
      )}

      {phase === "lost" && (
        <div role="status" aria-live="polite" className={`${isCartoon ? "cartoon-pop-in" : "play-in"} w-full text-center`}>
          <div aria-hidden className="text-5xl mb-6">🎲</div>
          <h2 className={`text-3xl font-extrabold mb-3 ${playText.title(kermesse)}`}>
            Pas cette fois…
          </h2>
          <p className={playText.body(kermesse)}>
            La roue ne vous a rien donné aujourd&apos;hui. La chance tourne,
            revenez bientôt !
          </p>
          <ShareInvite slug={slug} organizationName={organizationName} kermesse={kermesse} />
          {showReferral && referral && (
            <ReferralPanel
              slug={slug}
              referral={referral}
              proofSpinId={outcome?.spinId ?? null}
              segments={segments}
              claimConfig={claimConfig}
              organizationName={organizationName}
              kermesse={kermesse}
            />
          )}
          <DiscoverFooter kermesse={kermesse} />
        </div>
      )}

      {phase === "blocked" && (
        <div role="status" aria-live="polite" className={`${isCartoon ? "cartoon-pop-in" : "play-in"} w-full text-center`}>
          <div aria-hidden className="text-5xl mb-6">🔒</div>
          <h2 className={`text-2xl font-extrabold mb-3 ${playText.title(kermesse)}`}>
            Impossible de jouer
          </h2>
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
