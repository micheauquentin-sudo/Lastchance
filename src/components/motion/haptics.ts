"use client";

import { useSyncExternalStore } from "react";

export type HapticKind = "tick" | "tension" | "stamp" | "win" | "loss";

const HAPTIC_PATTERNS: Record<HapticKind, number | number[]> = {
  tick: 12,
  tension: [16, 48, 20, 48, 28],
  stamp: [38],
  win: [28, 42, 65, 32, 90],
  loss: [20, 50, 16],
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Lit `prefers-reduced-motion: reduce` sans hydration mismatch SSR.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  );
}

/**
 * Retour haptique discret (Android / navigateurs compatibles).
 * Silencieux sur iOS, desktop et en mode `prefers-reduced-motion`.
 */
export function triggerHaptic(kind: HapticKind): void {
  if (typeof window === "undefined") return;
  if (getReducedMotionSnapshot()) return;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }
  try {
    navigator.vibrate(HAPTIC_PATTERNS[kind]);
  } catch {
    // Certains navigateurs bloquent vibrate() hors geste utilisateur — silencieux.
  }
}
