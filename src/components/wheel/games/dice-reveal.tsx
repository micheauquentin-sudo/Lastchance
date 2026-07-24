"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { SpinOutcome } from "@/actions/play";

/** Faces cosmétiques du dé (1→6). */
const FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
/** Durée du roulement (ms). */
const ROLL_MS = 1100;
/** Pas de changement de face (ms). */
const TICK_MS = 90;
/** Temps d'affichage du résultat avant l'écran gagné/perdu. */
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
 * Révélation « lancer de dé » : un tap fait rouler le dé, qui s'immobilise sur
 * une face COSMÉTIQUE, puis on révèle `outcome` et on appelle `onRevealed()`.
 *
 * Serveur-autoritatif : le lot vient déjà de `spinWheel` (SpinOutcome). La face
 * du dé ne DÉCIDE rien — pur habillage. Sous mouvement réduit, arrêt instantané.
 */
export function DiceReveal({
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
  const [face, setFace] = useState(FACES[4]);
  const [rolling, setRolling] = useState(false);
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

    if (reducedMotion) {
      setDone(true);
      onRevealedRef.current();
      return;
    }

    setRolling(true);
    intervalRef.current = window.setInterval(() => {
      setFace(FACES[Math.floor(Math.random() * FACES.length)]);
    }, TICK_MS);

    const stop = window.setTimeout(() => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      setFace(FACES[4]);
      setRolling(false);
      setDone(true);
      const hold = window.setTimeout(() => onRevealedRef.current(), HOLD_MS);
      timersRef.current.push(hold);
    }, ROLL_MS);
    timersRef.current.push(stop);
  }, [reducedMotion]);

  const busy = rolling || done;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={start}
        aria-disabled={busy || undefined}
        aria-label="Lancer le dé"
        className={`mx-auto flex aspect-square w-32 items-center justify-center rounded-3xl border-2 outline-none focus-visible:ring-4 focus-visible:ring-offset-2 ${
          busy ? "cursor-default" : "cursor-pointer"
        } ${
          kermesse
            ? "border-k-ink/40 bg-white focus-visible:ring-k-ink/40 focus-visible:ring-offset-transparent"
            : "border-white/20 bg-white/5 focus-visible:ring-white/50 focus-visible:ring-offset-transparent"
        }`}
      >
        <span
          aria-hidden
          className={`text-6xl leading-none transition-transform ${
            rolling ? "animate-spin" : ""
          } ${kermesse ? "text-k-ink" : "text-white"}`}
          style={{ animationDuration: "0.6s" }}
        >
          {face}
        </span>
      </button>

      {!busy && (
        <p className={`mt-6 text-sm font-semibold ${kermesse ? "text-k-body" : "text-white/70"}`}>
          Touchez pour lancer le dé
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
