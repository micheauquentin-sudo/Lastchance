"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { SpinOutcome } from "@/actions/play";

/** Nombre de cartes de la grille (2×3). */
const CARD_COUNT = 6;
/** Temps d'affichage du résultat avant l'écran gagné/perdu. */
const HOLD_MS = 650;

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
 * Révélation « memory » : petite grille face cachée. Le joueur retourne deux
 * cartes ; la paire est TOUJOURS trouvable (jamais de blocage), puis on révèle
 * `outcome` et on appelle `onRevealed()`.
 *
 * Serveur-autoritatif : le lot vient déjà de `spinWheel` (SpinOutcome). Trouver
 * la paire NE DÉCIDE rien — pur habillage. Toutes les cartes portent le même
 * symbole : les deux premières retournées s'apparient forcément.
 */
export function MemoryReveal({
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
  const [flipped, setFlipped] = useState<number[]>([]);
  const matchedRef = useRef(false);

  const onRevealedRef = useRef(onRevealed);
  useEffect(() => {
    onRevealedRef.current = onRevealed;
  }, [onRevealed]);

  const timerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const flip = useCallback(
    (i: number) => {
      if (matchedRef.current) return;
      setFlipped((prev) => {
        if (prev.includes(i) || prev.length >= 2) return prev;
        const next = [...prev, i];
        if (next.length === 2) {
          // Paire trouvée (toutes identiques) : on révèle le résultat.
          matchedRef.current = true;
          timerRef.current = window.setTimeout(
            () => onRevealedRef.current(),
            reducedMotion ? 0 : HOLD_MS,
          );
        }
        return next;
      });
    },
    [reducedMotion],
  );

  const { label, description, isLosing } = outcome;
  const matched = flipped.length === 2;

  return (
    <div className="w-full">
      <div className="mx-auto grid max-w-[320px] grid-cols-3 gap-2 sm:gap-3">
        {Array.from({ length: CARD_COUNT }).map((_, i) => {
          const isUp = flipped.includes(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => flip(i)}
              aria-disabled={matched || isUp || undefined}
              aria-label={isUp ? `Carte ${i + 1}, retournée` : `Carte ${i + 1}`}
              className={`flex aspect-[3/4] items-center justify-center rounded-2xl border-2 text-3xl outline-none transition-all focus-visible:ring-4 focus-visible:ring-offset-2 ${
                matched || isUp ? "cursor-default" : "cursor-pointer"
              } ${
                kermesse
                  ? "border-k-ink/40 focus-visible:ring-k-ink/40 focus-visible:ring-offset-transparent"
                  : "border-white/20 focus-visible:ring-white/50 focus-visible:ring-offset-transparent"
              } ${
                isUp
                  ? kermesse
                    ? "bg-k-yellow/40"
                    : "bg-white/15"
                  : kermesse
                    ? "bg-white"
                    : "bg-white/5"
              }`}
            >
              <span aria-hidden>{isUp ? "✨" : "❓"}</span>
            </button>
          );
        })}
      </div>

      {!matched ? (
        <p className={`mt-6 text-sm font-semibold ${kermesse ? "text-k-body" : "text-white/70"}`}>
          Retournez deux cartes pour trouver la paire
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
