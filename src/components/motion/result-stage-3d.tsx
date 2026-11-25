"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./haptics";
import type {
  MountedScene3D,
  Scene3DKind,
  Scene3DPhase,
  Scene3DRarity,
} from "./scenes-3d";

let prefetched = false;

/**
 * Précharge le chunk Three.js en arrière-plan dès le clic de jeu
 * (zéro impact sur le First Contentful Paint de la page).
 */
export function prefetchResult3D(): void {
  if (prefetched || typeof window === "undefined") return;
  prefetched = true;
  void import("./scenes-3d").catch(() => {
    prefetched = false;
  });
}

function hasWebGLSupport(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl")),
    );
  } catch {
    return false;
  }
}

const FALLBACK_GLYPH: Record<Scene3DKind, string> = {
  trophy: "★",
  diamond: "◆",
  "golden-ticket": "🎟",
  "gift-box": "🎁",
  chest: "💎",
  "passport-seal": "✓",
  "clover-miss": "🍀",
  "spinner-seal": "✦",
};

/**
 * Repli visuel soigné (Kermesse 3D-feel) si WebGL est absent, le contexte
 * perdu, ou le temps de l'import dynamique (~30 ms).
 */
function FallbackEmblem({
  kind,
  phase,
  kermesse,
  badgeText,
  compact,
}: {
  kind: Scene3DKind;
  phase: Scene3DPhase;
  kermesse: boolean;
  badgeText?: string;
  compact: boolean;
}) {
  const isWin = phase === "win" || phase === "stamp";
  const isTension = phase === "tension";
  const sizeClass = compact ? "h-16 w-16 text-2xl" : "h-24 w-24 text-4xl";
  const animClass = isTension
    ? "lc-tension-pulse"
    : isWin
      ? "lc-stage-pop"
      : "lc-miss-tilt";

  const surfaceClass =
    kind === "clover-miss"
      ? kermesse
        ? "bg-emerald-100 border-k-ink text-k-green shadow-[4px_4px_0_var(--color-k-ink)]"
        : "bg-emerald-500/20 border-emerald-300/60 text-emerald-200 shadow-lg shadow-emerald-950/40"
      : kermesse
        ? "bg-k-yellow border-k-ink text-k-ink shadow-[4px_4px_0_var(--color-k-ink)]"
        : "bg-amber-400/20 border-amber-300/70 text-amber-200 shadow-lg shadow-amber-950/40";

  return (
    <div
      aria-hidden="true"
      className="flex h-full w-full items-center justify-center"
    >
      <div
        className={`flex items-center justify-center rounded-3xl border-[3px] font-black select-none ${sizeClass} ${surfaceClass} ${animClass}`}
      >
        <span>{badgeText || FALLBACK_GLYPH[kind]}</span>
      </div>
    </div>
  );
}

export interface ResultStage3DProps {
  scene: Scene3DKind;
  phase: Scene3DPhase;
  accentColor?: string;
  rarity?: Scene3DRarity;
  badgeText?: string;
  compact?: boolean;
  kermesse?: boolean;
  className?: string;
}

/**
 * Scène 3D WebGL (Three.js chargé en lazy) partagée par tous les jeux joueur.
 * Reprend la DA Pixar × Kermesse du site principal (`NoToneMapping`, studio
 * sombre à 5 softboxes, matériaux vernis, confettis 3D physiques).
 */
export function ResultStage3D({
  scene,
  phase,
  accentColor,
  rarity = "common",
  badgeText,
  compact = false,
  kermesse = false,
  className = "",
}: ResultStage3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef<MountedScene3D | null>(null);
  const initialPhaseRef = useRef<Scene3DPhase>(phase);
  const reducedMotion = usePrefersReducedMotion();
  const [webglReady, setWebglReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    initialPhaseRef.current = phase;
    mountedRef.current?.setPhase(phase);
  }, [phase]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasWebGLSupport()) return;

    let cancelled = false;

    import("./scenes-3d")
      .then(({ mountResultScene3D }) => {
        if (cancelled || !containerRef.current) return;
        const mounted = mountResultScene3D({
          container: containerRef.current,
          kind: scene,
          phase: initialPhaseRef.current,
          accentColor,
          rarity,
          badgeText,
          reducedMotion,
          onFallback: () => {
            if (!cancelled) {
              setWebglReady(false);
              setFailed(true);
            }
          },
        });
        mountedRef.current = mounted;
        setWebglReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      mountedRef.current?.destroy();
      mountedRef.current = null;
      setWebglReady(false);
    };
  }, [scene, accentColor, rarity, badgeText, reducedMotion]);

  const heightClass = compact
    ? "h-24 sm:h-28"
    : "h-44 sm:h-52";

  return (
    <div
      className={`relative mx-auto w-full max-w-[280px] transition-[height] duration-500 ease-out motion-reduce:transition-none ${heightClass} ${className}`}
    >
      {(!webglReady || failed) && (
        <div className="absolute inset-0">
          <FallbackEmblem
            kind={scene}
            phase={phase}
            kermesse={kermesse}
            badgeText={badgeText}
            compact={compact}
          />
        </div>
      )}
      {!failed && (
        <div
          ref={containerRef}
          className={`h-full w-full touch-pan-y ${webglReady ? "visible" : "invisible"}`}
        />
      )}
    </div>
  );
}
