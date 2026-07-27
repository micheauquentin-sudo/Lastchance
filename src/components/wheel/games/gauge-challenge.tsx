"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SkillAttempt, SkillChallengePublic } from "@/lib/skill";
import { challengeButtonTone, playText } from "../play-theme";

/** Durée d'un aller du curseur (0 → 100 %), en ms. */
const SWEEP_MS = 1400;
/** Aller RALENTI sous `prefers-reduced-motion` : mode dégradé ÉQUITABLE —
 *  le défi reste jouable, le mouvement est simplement beaucoup plus doux. */
const SWEEP_REDUCED_MS = 3600;

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
 * Phase de DÉFI « jauge » : un curseur balaie la barre en continu ; le joueur
 * l'arrête d'un tap. Réussite si le curseur s'immobilise dans la zone cible
 * VISIBLE (centre ± tolerancePct), évaluée CLIENT (non vérifiable serveur —
 * bornée par l'économie du tirage, cf. skill.ts) : on envoie
 * `{ gameType: "gauge", succeeded }`, le shell affiche l'issue.
 *
 * Le curseur est animé par requestAnimationFrame et écrit directement dans le
 * DOM (ref) : aucun re-rendu par frame. Un seul arrêt possible (verrou).
 */
export function GaugeChallenge({
  challenge,
  onSubmit,
  pending,
  kermesse = false,
}: {
  /** Vue publique du défi (demi-largeur de la zone cible, en %). */
  challenge: Extract<SkillChallengePublic, { gameType: "gauge" }>;
  /** Transmet la tentative construite au shell (SkillGameShell.submit). */
  onSubmit: (attempt: SkillAttempt) => void;
  /** Soumission en cours (fourni par le shell). */
  pending: boolean;
  /** Thème de page « kermesse » (crème + encre) — classes sombres sinon. */
  kermesse?: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [stopped, setStopped] = useState(false);
  const [stoppedPct, setStoppedPct] = useState(0);
  // Position courante du curseur (0–100), lue au moment de l'arrêt.
  const posRef = useRef(0);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const locked = pending || stopped;

  // Balayage triangulaire continu (aller-retour), coupé à l'arrêt.
  useEffect(() => {
    if (stopped) return;
    const sweep = reducedMotion ? SWEEP_REDUCED_MS : SWEEP_MS;
    let raf = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const phase = ((now - startedAt) % (2 * sweep)) / sweep;
      const pct = phase <= 1 ? phase * 100 : (2 - phase) * 100;
      posRef.current = pct;
      if (cursorRef.current) cursorRef.current.style.left = `${pct}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stopped, reducedMotion]);

  function stop() {
    if (locked) return;
    const pct = posRef.current;
    setStopped(true);
    setStoppedPct(pct);
    onSubmit({
      gameType: "gauge",
      succeeded: Math.abs(pct - 50) <= challenge.tolerancePct,
    });
  }

  const zoneLeft = 50 - challenge.tolerancePct;
  const zoneWidth = challenge.tolerancePct * 2;

  return (
    <div className="w-full">
      <h1 className={`text-2xl font-extrabold mb-2 ${playText.title(kermesse)}`}>
        La jauge folle
      </h1>
      <p className={`mb-8 text-sm ${playText.body(kermesse)}`}>
        Arrêtez le curseur dans la zone verte au centre.
      </p>

      {/* Barre + zone cible + curseur — décor pur, décrit par le texte sr-only. */}
      <div aria-hidden className="mx-auto w-full max-w-[320px] px-1">
        <div
          className={`relative h-5 rounded-full border ${
            kermesse ? "border-k-ink/40 bg-k-ink/10" : "border-white/20 bg-white/10"
          }`}
        >
          <div
            className="absolute inset-y-0 rounded-sm bg-emerald-400/80"
            style={{ left: `${zoneLeft}%`, width: `${zoneWidth}%` }}
          />
          <div
            ref={cursorRef}
            className={`absolute -top-2 h-9 w-1.5 -translate-x-1/2 rounded-full ${
              kermesse ? "bg-k-ink" : "bg-white"
            }`}
            style={{ left: `${stopped ? stoppedPct : 0}%` }}
          />
        </div>
      </div>
      <p className="sr-only">
        Zone cible : de {zoneLeft} % à {50 + challenge.tolerancePct} % de la barre.
      </p>

      <button
        type="button"
        onClick={stop}
        disabled={locked}
        aria-label="Arrêter le curseur maintenant"
        className={`mt-9 w-full rounded-2xl border-2 px-6 py-4 text-lg font-extrabold uppercase tracking-wider transition-all duration-100 focus-visible:outline-none focus-visible:ring-4 disabled:cursor-default ${challengeButtonTone(kermesse, locked)}`}
      >
        Stop !
      </button>

      <p
        role="status"
        aria-live="polite"
        className={`mt-6 min-h-5 text-sm font-semibold ${kermesse ? "text-k-body" : "text-white/70"}`}
      >
        {pending
          ? "On vérifie votre arrêt…"
          : stopped
            ? `Curseur arrêté à ${Math.round(stoppedPct)} %.`
            : " "}
      </p>
    </div>
  );
}
