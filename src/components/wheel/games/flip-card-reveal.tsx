"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { SpinOutcome } from "@/actions/play";

/** Durée de la bascule 3D (ms) — écourtée à 0 sous mouvement réduit. */
const FLIP_MS = 600;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * `prefers-reduced-motion` côté client, sûr à l'hydratation : le rendu
 * serveur suppose « pas de préférence », la vraie valeur s'applique dès
 * l'abonnement au media query après montage (même hook que les autres
 * expériences /play).
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

/**
 * Révélation « carte retournée » : une carte face cachée que le joueur
 * retourne d'un tap (ou Entrée/Espace via le bouton natif). La bascule 3D
 * dévoile `outcome` (gagné/perdu + libellé), puis appelle `onRevealed()`.
 *
 * Serveur-autoritatif : le résultat vient déjà de `spinWheel` (SpinOutcome).
 * Retourner la carte ne DÉCIDE rien — c'est une pure animation de révélation.
 * Sous `prefers-reduced-motion`, la rotation est instantanée (durée 0).
 */
export function FlipCardReveal({
  outcome,
  onRevealed,
  kermesse = false,
  buttonFrom = "#f97316",
  buttonTo = "#ec4899",
}: {
  outcome: SpinOutcome;
  onRevealed: () => void;
  /** Thème de page « kermesse » (crème + encre) — classes sombres sinon. */
  kermesse?: boolean;
  /** Couleurs marchandes de la face gagnante (défauts orange→rose). */
  buttonFrom?: string;
  buttonTo?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const flippedRef = useRef(false);

  // Toujours le dernier callback, sans redéclencher le timer de bascule.
  const onRevealedRef = useRef(onRevealed);
  useEffect(() => {
    onRevealedRef.current = onRevealed;
  }, [onRevealed]);

  const flip = useCallback(() => {
    if (flippedRef.current) return;
    flippedRef.current = true;
    setFlipped(true);
    // Laisse la bascule se jouer avant de passer à l'écran gagné/perdu.
    window.setTimeout(() => onRevealedRef.current(), reducedMotion ? 0 : FLIP_MS);
  }, [reducedMotion]);

  const { label, description, isLosing } = outcome;
  const duration = reducedMotion ? 0 : FLIP_MS;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={flip}
        aria-disabled={flipped || undefined}
        aria-label={flipped ? "Carte retournée" : "Retourner la carte"}
        style={{ perspective: "1000px" }}
        className={`mx-auto block w-full max-w-[320px] rounded-3xl outline-none focus-visible:ring-4 focus-visible:ring-offset-2 ${
          flipped ? "cursor-default" : "cursor-pointer"
        } ${
          kermesse
            ? "focus-visible:ring-k-ink/40 focus-visible:ring-offset-transparent"
            : "focus-visible:ring-white/50 focus-visible:ring-offset-transparent"
        }`}
      >
        <div
          className="relative aspect-[8/5] w-full transition-transform"
          style={{
            transformStyle: "preserve-3d",
            WebkitTransformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            transitionDuration: `${duration}ms`,
          }}
        >
          {/* Face cachée (recto) */}
          <div
            style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
            className={`absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden rounded-3xl border-2 shadow-2xl ${
              kermesse ? "border-k-ink/40 bg-white" : "border-white/20 bg-white/5"
            }`}
          >
            <span aria-hidden className="text-5xl">🃏</span>
            <span className={`text-sm font-semibold ${kermesse ? "text-k-body" : "text-white/70"}`}>
              Touchez pour retourner
            </span>
          </div>

          {/* Face révélée (verso) — dévoilée par la rotation */}
          <div
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              backgroundImage: isLosing
                ? "linear-gradient(135deg,#3f3f46,#18181b)"
                : `linear-gradient(135deg,${buttonFrom},${buttonTo})`,
            }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 overflow-hidden rounded-3xl px-6 text-center shadow-2xl"
          >
            <p aria-hidden className="text-3xl">{isLosing ? "🎲" : "🎁"}</p>
            <p className="text-lg font-extrabold text-white">{label}</p>
            {description && <p className="text-sm text-white/80">{description}</p>}
          </div>
        </div>
      </button>
    </div>
  );
}
