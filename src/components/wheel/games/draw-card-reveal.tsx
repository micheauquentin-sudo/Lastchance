"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { SpinOutcome } from "@/actions/play";

/** Durée du tirage + retournement (ms) — instantané sous mouvement réduit. */
const DRAW_MS = 700;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** `prefers-reduced-motion` sûr à l'hydratation (même hook que FlipCardReveal). */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

/**
 * Révélation « tirage d'une carte » : un paquet ; d'un tap, une carte se détache
 * et se retourne pour dévoiler `outcome`, puis `onRevealed()`.
 *
 * Serveur-autoritatif : le lot vient déjà de `spinWheel` (SpinOutcome). Piocher
 * NE DÉCIDE rien — pure animation de révélation. Sous mouvement réduit, la carte
 * se retourne instantanément.
 */
export function DrawCardReveal({
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
  const [drawn, setDrawn] = useState(false);
  const drawnRef = useRef(false);

  const onRevealedRef = useRef(onRevealed);
  useEffect(() => {
    onRevealedRef.current = onRevealed;
  }, [onRevealed]);

  const draw = useCallback(() => {
    if (drawnRef.current) return;
    drawnRef.current = true;
    setDrawn(true);
    window.setTimeout(() => onRevealedRef.current(), reducedMotion ? 0 : DRAW_MS);
  }, [reducedMotion]);

  const { label, description, isLosing } = outcome;
  const duration = reducedMotion ? 0 : DRAW_MS;

  return (
    <div className="w-full">
      <div className="relative mx-auto h-52 w-full max-w-[320px]">
        {/* Paquet décoratif, en arrière-plan (cartes légèrement décalées). */}
        {[0, 1, 2].map((n) => (
          <div
            key={n}
            aria-hidden
            style={{ transform: `translate(${n * 5}px, ${n * 5}px)` }}
            className={`absolute inset-x-6 bottom-0 top-8 rounded-2xl border-2 ${
              kermesse ? "border-k-ink/30 bg-white" : "border-white/15 bg-white/5"
            }`}
          />
        ))}

        {/* Carte tirée : se soulève et se retourne pour révéler `outcome`. */}
        <button
          type="button"
          onClick={draw}
          aria-disabled={drawn || undefined}
          aria-label={drawn ? "Carte piochée" : "Piocher une carte"}
          style={{ perspective: "1000px" }}
          className={`absolute inset-x-6 bottom-0 top-8 outline-none focus-visible:rounded-2xl focus-visible:ring-4 focus-visible:ring-offset-2 ${
            drawn ? "cursor-default" : "cursor-pointer"
          } ${
            kermesse
              ? "focus-visible:ring-k-ink/40 focus-visible:ring-offset-transparent"
              : "focus-visible:ring-white/50 focus-visible:ring-offset-transparent"
          }`}
        >
          <div
            className="relative h-full w-full transition-transform"
            style={{
              transformStyle: "preserve-3d",
              WebkitTransformStyle: "preserve-3d",
              transform: drawn
                ? "translateY(-24px) rotateY(180deg)"
                : "translateY(0) rotateY(0deg)",
              transitionDuration: `${duration}ms`,
            }}
          >
            {/* Dos de la carte */}
            <div
              style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
              className={`absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 shadow-2xl ${
                kermesse ? "border-k-ink/40 bg-white" : "border-white/20 bg-white/5"
              }`}
            >
              <span aria-hidden className="text-5xl">🂠</span>
              <span className={`text-sm font-semibold ${kermesse ? "text-k-body" : "text-white/70"}`}>
                Touchez pour piocher
              </span>
            </div>

            {/* Face révélée */}
            <div
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                backgroundImage: isLosing
                  ? "linear-gradient(135deg,#3f3f46,#18181b)"
                  : `linear-gradient(135deg,${buttonFrom},${buttonTo})`,
              }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl px-6 text-center shadow-2xl"
            >
              <p aria-hidden className="text-3xl">{isLosing ? "🎲" : "🎁"}</p>
              <p className="text-lg font-extrabold text-white">{label}</p>
              {description && <p className="text-sm text-white/80">{description}</p>}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
