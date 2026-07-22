"use client";

import { useEffect, useRef, useState } from "react";
import { getLoyaltyCounterCode } from "@/actions/loyalty";

/**
 * Écran comptoir du code tournant (mode rotating_code) : affiche EN GRAND le
 * code courant que les clients saisissent sur leur passeport pour valider leur
 * visite. Le code est rafraîchi à l'approche de chaque rotation (poll léger
 * aligné sur la période, tolérant aux coupures : la dernière valeur reste
 * affichée). Plein écran facultatif, façon mode TV des pronostics.
 *
 * Le secret ne circule jamais : seul le code courant est renvoyé par la
 * Server Action authentifiée getLoyaltyCounterCode.
 */
export function LoyaltyCounterScreen({
  programId,
  programName,
  periodSeconds,
  initialCode,
}: {
  programId: string;
  programName: string;
  periodSeconds: number;
  initialCode: string | null;
}) {
  const [code, setCode] = useState<string | null>(initialCode);
  const [secondsLeft, setSecondsLeft] = useState(periodSeconds);
  const [period, setPeriod] = useState(periodSeconds > 0 ? periodSeconds : 60);
  const [isFull, setIsFull] = useState(false);
  // Miroir de `period` pour les effets (planification/décompte) sans stale
  // closure ; le rendu, lui, lit l'état `period`.
  const periodRef = useRef(periodSeconds > 0 ? periodSeconds : 60);
  const rootRef = useRef<HTMLDivElement>(null);

  // ── Rafraîchissement du code : immédiat au montage puis calé sur la fin de
  // chaque période (epoch-aligné, comme la génération TOTP côté serveur).
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const tick = async () => {
      const res = await getLoyaltyCounterCode(programId).catch(() => null);
      if (cancelled) return;
      if (res) {
        setCode(res.code);
        if (res.periodSeconds > 0) {
          periodRef.current = res.periodSeconds;
          setPeriod(res.periodSeconds);
        }
      }
      const periodMs = periodRef.current * 1000;
      const msToNext = periodMs - (Date.now() % periodMs) + 800;
      timer = window.setTimeout(tick, Math.max(2000, msToNext));
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [programId]);

  // ── Compte à rebours affiché (barre) — recalculé sur l'horloge locale.
  useEffect(() => {
    const id = window.setInterval(() => {
      const periodMs = periodRef.current * 1000;
      const left = Math.ceil((periodMs - (Date.now() % periodMs)) / 1000);
      setSecondsLeft(Math.max(0, Math.min(periodRef.current, left)));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // ── Plein écran (API navigateur) sur le panneau sombre.
  useEffect(() => {
    const onChange = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else {
      void rootRef.current?.requestFullscreen?.();
    }
  };

  const ratio = period > 0 ? secondsLeft / period : 0;
  const grouped = code ? `${code.slice(0, 3)} ${code.slice(3)}` : "— — —";

  return (
    <div
      ref={rootRef}
      className={`relative flex flex-col items-center justify-center gap-[3vh] rounded-2xl border-2 border-k-ink bg-k-ink px-6 py-12 text-center text-k-bg ${
        isFull ? "min-h-dvh cursor-none rounded-none" : ""
      }`}
    >
      <button
        type="button"
        onClick={toggleFull}
        className="absolute right-4 top-4 rounded-lg border-2 border-k-bg/30 px-3 py-1.5 text-xs font-bold text-k-bg/80 hover:border-k-yellow hover:text-k-yellow"
      >
        {isFull ? "Quitter le plein écran" : "⛶ Plein écran"}
      </button>

      <div>
        <p className="text-[clamp(0.8rem,2.5vh,1.4rem)] font-bold uppercase tracking-[0.25em] text-k-bg/60">
          {programName}
        </p>
        <p className="mt-1 text-[clamp(0.9rem,2.6vh,1.5rem)] font-black text-k-yellow">
          Code de fidélité
        </p>
      </div>

      <p
        aria-live="off"
        className="font-mono text-[clamp(3.5rem,22vh,14rem)] font-black leading-none tracking-[0.08em] tabular-nums"
      >
        {grouped}
      </p>

      {/* Barre de temps restant avant la prochaine rotation. */}
      <div className="w-full max-w-2xl">
        <div className="h-[1.4vh] min-h-[8px] overflow-hidden rounded-full bg-k-bg/15">
          <div
            className="h-full rounded-full bg-k-yellow transition-[width] duration-1000 ease-linear"
            style={{ width: `${Math.max(2, ratio * 100)}%` }}
          />
        </div>
        <p className="mt-[1.5vh] text-[clamp(1rem,3vh,2rem)] font-black">
          Saisissez ce code sur votre passeport
        </p>
        <p className="mt-1 text-[clamp(0.8rem,2vh,1.2rem)] font-bold text-k-bg/60">
          Nouveau code dans {secondsLeft} s
        </p>
      </div>
    </div>
  );
}
