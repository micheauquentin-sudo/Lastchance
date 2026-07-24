"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { SpinOutcome } from "@/actions/play";

/** Durée du soulèvement du gobelet (ms) — instantané sous mouvement réduit. */
const LIFT_MS = 650;

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
 * Révélation « bonneteau » : trois gobelets, le joueur en choisit UN. Le
 * gobelet choisi se soulève et dévoile `outcome`, puis `onRevealed()`.
 *
 * Serveur-autoritatif : le lot vient déjà de `spinWheel` (SpinOutcome). Le
 * gobelet choisi NE CHANGE RIEN — quel qu'il soit, on révèle `outcome` (gagné
 * → lot dessous, perdu → vide). Habillage, pas jeu d'adresse. Aucun poids ne
 * part au client.
 */
export function CupsReveal({
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
  const [picked, setPicked] = useState<number | null>(null);
  const pickedRef = useRef(false);

  const onRevealedRef = useRef(onRevealed);
  useEffect(() => {
    onRevealedRef.current = onRevealed;
  }, [onRevealed]);

  const pick = useCallback(
    (i: number) => {
      if (pickedRef.current) return;
      pickedRef.current = true;
      setPicked(i);
      window.setTimeout(() => onRevealedRef.current(), reducedMotion ? 0 : LIFT_MS);
    },
    [reducedMotion],
  );

  const { label, description, isLosing } = outcome;
  const duration = reducedMotion ? 0 : LIFT_MS;

  return (
    <div className="w-full">
      <div className="flex items-end justify-center gap-3 sm:gap-5">
        {[0, 1, 2].map((i) => {
          const chosen = picked === i;
          const dimmed = picked !== null && !chosen;
          return (
            <button
              key={i}
              type="button"
              onClick={() => pick(i)}
              aria-disabled={picked !== null || undefined}
              aria-label={`Gobelet ${i + 1}`}
              style={{
                transform: chosen ? "translateY(-18px)" : "translateY(0)",
                transitionDuration: `${duration}ms`,
              }}
              className={`flex aspect-square w-20 items-center justify-center rounded-2xl border-2 outline-none transition-all focus-visible:ring-4 focus-visible:ring-offset-2 sm:w-24 ${
                picked === null ? "cursor-pointer" : "cursor-default"
              } ${
                kermesse
                  ? "border-k-ink/40 bg-white focus-visible:ring-k-ink/40 focus-visible:ring-offset-transparent"
                  : "border-white/20 bg-white/5 focus-visible:ring-white/50 focus-visible:ring-offset-transparent"
              } ${dimmed ? "opacity-40" : "opacity-100"}`}
            >
              <span aria-hidden className="text-5xl">🥤</span>
            </button>
          );
        })}
      </div>

      {picked === null ? (
        <p className={`mt-6 text-sm font-semibold ${kermesse ? "text-k-body" : "text-white/70"}`}>
          Touchez un gobelet
        </p>
      ) : (
        <div
          style={{
            backgroundImage: isLosing
              ? "linear-gradient(135deg,#3f3f46,#18181b)"
              : `linear-gradient(135deg,${buttonFrom},${buttonTo})`,
          }}
          className="play-in mx-auto mt-6 flex aspect-[8/5] w-full max-w-[320px] flex-col items-center justify-center gap-1 rounded-3xl px-6 text-center shadow-2xl"
        >
          <p aria-hidden className="text-3xl">{isLosing ? "🎲" : "🎁"}</p>
          <p className="text-lg font-extrabold text-white">{label}</p>
          {description && <p className="text-sm text-white/80">{description}</p>}
        </div>
      )}
    </div>
  );
}
