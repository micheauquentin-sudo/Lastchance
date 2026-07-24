"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { SpinOutcome } from "@/actions/play";

/** Symboles cosmétiques des rouleaux — aucune valeur, pur habillage. */
const SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "🍀", "💎"];
/** Instant d'arrêt (ms) de chaque rouleau — arrêt échelonné, gauche→droite. */
const REEL_STOP_MS = [800, 1150, 1500];
/** Pas de défilement (ms). */
const TICK_MS = 90;
/** Temps d'affichage du résultat avant de passer à l'écran gagné/perdu. */
const HOLD_MS = 550;

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
 * Révélation « machine à sous » : trois rouleaux défilent puis s'arrêtent —
 * alignés si `outcome` est gagnant, dépareillés sinon — puis on révèle
 * `outcome` et on appelle `onRevealed()`.
 *
 * Serveur-autoritatif : le lot vient déjà de `spinWheel` (SpinOutcome). Les
 * symboles ne sont QUE cosmétiques (dérivés de `isLosing`), aucun tirage
 * client ne décide quoi que ce soit. Sous mouvement réduit, arrêt instantané.
 */
export function SlotReveal({
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
  const [reels, setReels] = useState<string[]>(["🍒", "🍋", "🔔"]);
  const [spinning, setSpinning] = useState(false);
  const [done, setDone] = useState(false);
  const startedRef = useRef(false);

  const onRevealedRef = useRef(onRevealed);
  useEffect(() => {
    onRevealedRef.current = onRevealed;
  }, [onRevealed]);

  const intervalRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  useEffect(
    () => () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      timersRef.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const { label, description, isLosing } = outcome;

  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // Symboles finaux cosmétiques : alignés = gagné, dépareillés = perdu.
    const final = isLosing ? ["🍒", "🍋", "🔔"] : ["🍒", "🍒", "🍒"];

    if (reducedMotion) {
      setReels(final);
      setDone(true);
      onRevealedRef.current();
      return;
    }

    setSpinning(true);
    const stopped = [false, false, false];
    intervalRef.current = window.setInterval(() => {
      setReels((prev) =>
        prev.map((s, i) =>
          stopped[i] ? s : SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        ),
      );
    }, TICK_MS);

    REEL_STOP_MS.forEach((ms, i) => {
      const t = window.setTimeout(() => {
        stopped[i] = true;
        setReels((prev) => prev.map((s, j) => (j === i ? final[i] : s)));
        if (i === REEL_STOP_MS.length - 1) {
          if (intervalRef.current) window.clearInterval(intervalRef.current);
          setSpinning(false);
          setDone(true);
          const hold = window.setTimeout(() => onRevealedRef.current(), HOLD_MS);
          timersRef.current.push(hold);
        }
      }, ms);
      timersRef.current.push(t);
    });
  }, [reducedMotion, isLosing]);

  const busy = spinning || done;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={start}
        aria-disabled={busy || undefined}
        aria-label="Lancer les rouleaux"
        className={`mx-auto block w-full max-w-[320px] rounded-3xl border-2 p-5 outline-none transition-all focus-visible:ring-4 focus-visible:ring-offset-2 ${
          busy ? "cursor-default" : "cursor-pointer"
        } ${
          kermesse
            ? "border-k-ink/40 bg-white focus-visible:ring-k-ink/40 focus-visible:ring-offset-transparent"
            : "border-white/20 bg-white/5 focus-visible:ring-white/50 focus-visible:ring-offset-transparent"
        }`}
      >
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          {reels.map((s, i) => (
            <div
              key={i}
              aria-hidden
              className={`flex aspect-square w-20 items-center justify-center rounded-2xl border-2 text-4xl transition-transform sm:w-24 ${
                kermesse ? "border-k-ink/30 bg-k-bg" : "border-white/15 bg-black/30"
              } ${spinning ? "scale-95" : "scale-100"}`}
            >
              {s}
            </div>
          ))}
        </div>
      </button>

      {!busy && (
        <p className={`mt-6 text-sm font-semibold ${kermesse ? "text-k-body" : "text-white/70"}`}>
          Touchez pour lancer
        </p>
      )}

      {done && (
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
