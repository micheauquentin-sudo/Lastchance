"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bestTextColor } from "@/lib/contrast";
import { SCRATCH_COVER_DEFAULT } from "@/lib/wheel-style";
import { playText } from "./play-theme";

const REVEAL_THRESHOLD = 0.5; // 50% de surface grattée = révélation auto
const SAMPLE_STEP = 6; // échantillonnage alpha (perf) sur la grille de pixels

/**
 * Carte à gratter : le résultat (déjà déterminé côté serveur, voir
 * ScratchCardExperience) est affiché en dessous d'une couche opaque que
 * le joueur efface au doigt/souris (canvas, composite "destination-out").
 * Un bouton « Révéler » couvre l'accessibilité (clavier, pas de geste).
 */
export function ScratchCard({
  label,
  description,
  isLosing,
  emoji,
  buttonFrom = "#f97316",
  buttonTo = "#ec4899",
  cover = SCRATCH_COVER_DEFAULT,
  kermesse,
  onRevealed,
}: {
  label: string;
  description: string;
  isLosing: boolean;
  /** Icône choisie par le commerçant pour ce lot (null : le 🎁 générique). */
  emoji?: string | null;
  buttonFrom?: string;
  buttonTo?: string;
  /**
   * Les trois arrêts du dégradé de la couche à gratter (voir
   * `scratchCover`). Les défauts reproduisent le « papier métallisé »
   * historique — la carte à gratter d'un style jamais personnalisé ne bouge
   * pas d'un pixel.
   */
  cover?: readonly [string, string, string];
  /**
   * Surface claire (thème « kermesse ») ou sombre (thème « nuit »).
   *
   * Le bouton « Révéler directement » portait `text-zinc-300` en dur — juste
   * sur le dégradé nuit, illisible sur le crème de la kermesse (1,7:1), et
   * c'est la SEULE porte d'entrée au clavier de ce jeu : sans lui, une carte
   * à gratter ne se gratte qu'au doigt ou à la souris.
   */
  kermesse: boolean;
  onRevealed: () => void;
}) {
  // DÉSTRUCTURÉ EN PRIMITIVES avant l'effet canvas : `cover` est un tableau
  // reconstruit à chaque rendu du parent (`scratchCover(style)`). Le mettre
  // tel quel dans les dépendances repeindrait la couche à chaque frame — donc
  // effacerait le grattage en cours, en boucle.
  const [coverFrom, coverMid, coverTo] = cover;
  const coverInk = bestTextColor(coverMid);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const scratchingRef = useRef(false);
  const revealedRef = useRef(false);

  // Toujours le dernier callback, sans faire dépendre l'effet canvas
  // (monté une fois) de son identité entre deux rendus du parent.
  const onRevealedRef = useRef(onRevealed);
  useEffect(() => {
    onRevealedRef.current = onRevealed;
  }, [onRevealed]);

  const reveal = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    setRevealed(true);
    onRevealedRef.current();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Couche à gratter : dégradé « papier métallisé » par défaut, recolorable
    // par le commerçant (trois arrêts).
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, coverFrom);
    grad.addColorStop(0.5, coverMid);
    grad.addColorStop(1, coverTo);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Encre de la consigne : choisie CONTRE la couche, pas figée. Une couche
    // sombre laissait autrement un « Grattez ici » gris sur gris.
    ctx.fillStyle = coverInk;
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🎟️ Grattez ici", width / 2, height / 2 - 10);
    ctx.font = "400 12px system-ui, sans-serif";
    ctx.fillText("avec le doigt ou la souris", width / 2, height / 2 + 14);

    function posFromEvent(e: PointerEvent): { x: number; y: number } {
      const rect = canvas!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function scratchAt(x: number, y: number) {
      if (!ctx) return;
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.fill();
    }

    function scratchedRatio(): number {
      if (!ctx) return 0;
      // Lit le canvas au ratio de périphérique réel (pas la taille CSS).
      const data = ctx.getImageData(0, 0, canvas!.width, canvas!.height).data;
      let cleared = 0;
      let total = 0;
      for (let i = 3; i < data.length; i += 4 * SAMPLE_STEP) {
        total++;
        if (data[i] < 40) cleared++;
      }
      return total > 0 ? cleared / total : 0;
    }

    function onPointerDown(e: PointerEvent) {
      if (revealedRef.current) return;
      scratchingRef.current = true;
      canvas!.setPointerCapture(e.pointerId);
      const { x, y } = posFromEvent(e);
      scratchAt(x, y);
    }
    function onPointerMove(e: PointerEvent) {
      if (!scratchingRef.current || revealedRef.current) return;
      const { x, y } = posFromEvent(e);
      scratchAt(x, y);
      if (scratchedRatio() >= REVEAL_THRESHOLD) reveal();
    }
    function onPointerUp() {
      scratchingRef.current = false;
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  }, [reveal, coverFrom, coverMid, coverTo, coverInk]);

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className="relative mx-auto aspect-[8/5] w-full max-w-[320px] overflow-hidden rounded-3xl shadow-2xl"
      >
        {/* Résultat, révélé sous la couche grattable */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center"
          style={{
            backgroundImage: isLosing
              ? "linear-gradient(135deg,#3f3f46,#18181b)"
              : `linear-gradient(135deg,${buttonFrom},${buttonTo})`,
          }}
        >
          <p aria-hidden className="text-3xl">{isLosing ? "🙁" : (emoji ?? "🎁")}</p>
          <p className="text-lg font-extrabold text-white">{label}</p>
          {description && <p className="text-sm text-white/80">{description}</p>}
        </div>

        {!revealed && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full cursor-pointer touch-none"
            aria-hidden="true"
          />
        )}
      </div>

      {!revealed && (
        <button type="button" onClick={reveal} className={`mx-auto mt-4 block text-sm font-medium underline decoration-dotted underline-offset-4 ${playText.body(kermesse)}`}>
          Révéler directement
        </button>
      )}
    </div>
  );
}
