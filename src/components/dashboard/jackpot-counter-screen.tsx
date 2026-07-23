"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getJackpotCounterCode } from "@/actions/jackpot";
import type { JackpotValidationMode } from "@/types/database";
import { formatJackpotAmount, jackpotProgress } from "@/components/jackpot/jackpot-state";

/**
 * Écran comptoir du jackpot collectif : jauge GÉANTE temps réel (montant
 * croissant + progression partagée) et, en mode code tournant, le code courant
 * à afficher face aux clients. Miroir du comptoir fidélité + du mode TV des
 * pronostics : fond sombre, très grande typographie, plein écran facultatif.
 *
 * Le code tournant est renvoyé par la Server Action authentifiée
 * getJackpotCounterCode (le secret ne quitte jamais le serveur) ; la jauge est
 * rafraîchie par router.refresh() (la page serveur relit la campagne), tolérant
 * aux coupures — la dernière photo reste à l'écran.
 */
export function JackpotCounterScreen({
  campaignId,
  campaignName,
  validationMode,
  periodSeconds,
  initialCode,
  gauge,
}: {
  campaignId: string;
  campaignName: string;
  validationMode: JackpotValidationMode;
  periodSeconds: number;
  initialCode: string | null;
  gauge: { currentCount: number; threshold: number; displayAmountCents: number };
}) {
  const router = useRouter();
  const isRotating = validationMode === "rotating_code";

  const [code, setCode] = useState<string | null>(initialCode);
  const [secondsLeft, setSecondsLeft] = useState(periodSeconds);
  const [period, setPeriod] = useState(periodSeconds > 0 ? periodSeconds : 60);
  const [isFull, setIsFull] = useState(false);
  const periodRef = useRef(periodSeconds > 0 ? periodSeconds : 60);
  const rootRef = useRef<HTMLDivElement>(null);

  // ── Code tournant : immédiat au montage puis calé sur la fin de chaque
  // période (epoch-aligné, comme la génération TOTP côté serveur). Uniquement
  // en mode code tournant (le mode staff n'affiche aucun code).
  useEffect(() => {
    if (!isRotating) return;
    let cancelled = false;
    let timer = 0;
    const tick = async () => {
      const res = await getJackpotCounterCode(campaignId).catch(() => null);
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
  }, [campaignId, isRotating]);

  // ── Compte à rebours affiché (barre) — recalculé sur l'horloge locale.
  useEffect(() => {
    if (!isRotating) return;
    const id = window.setInterval(() => {
      const periodMs = periodRef.current * 1000;
      const left = Math.ceil((periodMs - (Date.now() % periodMs)) / 1000);
      setSecondsLeft(Math.max(0, Math.min(periodRef.current, left)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [isRotating]);

  // ── Jauge temps réel : la page serveur relit la campagne et repasse la jauge
  // en props. Suspendu onglet masqué, relancé au retour.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) router.refresh();
    }, 15_000);
    const onVisible = () => {
      if (!document.hidden) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

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

  const progress = jackpotProgress(gauge.currentCount, gauge.threshold);
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
          {campaignName}
        </p>
        <p className="mt-1 text-[clamp(0.9rem,2.6vh,1.5rem)] font-black text-k-yellow">
          🎰 Jackpot collectif
        </p>
      </div>

      {/* Montant croissant — le grand chiffre de la salle. */}
      <p
        aria-live="off"
        className="font-black leading-none tabular-nums text-[clamp(3rem,18vh,12rem)]"
      >
        {formatJackpotAmount(gauge.displayAmountCents)}
      </p>

      {/* Jauge partagée. */}
      <div className="w-full max-w-3xl">
        <div className="mb-[1vh] flex items-baseline justify-between text-[clamp(1rem,3vh,2rem)] font-black">
          <span className="tabular-nums">
            {gauge.currentCount} / {gauge.threshold}
          </span>
          <span className="text-k-bg/60">participations</span>
        </div>
        <div className="h-[2vh] min-h-[12px] overflow-hidden rounded-full border-2 border-k-bg/20 bg-k-bg/10">
          <div
            className="h-full rounded-full bg-k-yellow transition-[width] duration-700"
            style={{ width: `${Math.max(2, progress.ratio * 100)}%` }}
          />
        </div>
        <p className="mt-[1.5vh] text-[clamp(1rem,3vh,2rem)] font-black">
          {progress.reached
            ? "🎯 Objectif atteint !"
            : `Plus que ${progress.remaining} pour débloquer le jackpot !`}
        </p>
      </div>

      {/* Mode code tournant : le code à saisir pour participer. */}
      {isRotating ? (
        <div className="w-full max-w-3xl border-t-2 border-k-bg/15 pt-[3vh]">
          <p className="text-[clamp(0.9rem,2.4vh,1.4rem)] font-black text-k-yellow">
            Participez avec ce code
          </p>
          <p className="mt-[1vh] font-mono text-[clamp(2.5rem,14vh,9rem)] font-black leading-none tracking-[0.08em] tabular-nums">
            {grouped}
          </p>
          <div className="mx-auto mt-[1.5vh] h-[1.2vh] min-h-[8px] max-w-2xl overflow-hidden rounded-full bg-k-bg/15">
            <div
              className="h-full rounded-full bg-k-yellow transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.max(2, ratio * 100)}%` }}
            />
          </div>
          <p className="mt-[1vh] text-[clamp(0.8rem,2vh,1.2rem)] font-bold text-k-bg/60">
            Nouveau code dans {secondsLeft} s
          </p>
        </div>
      ) : (
        <div className="w-full max-w-3xl border-t-2 border-k-bg/15 pt-[3vh]">
          <p className="text-[clamp(1rem,3vh,2rem)] font-black">
            Participez en caisse : présentez le QR de votre écran
          </p>
        </div>
      )}
    </div>
  );
}
