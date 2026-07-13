"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  buttonFrom = "#f97316",
  buttonTo = "#ec4899",
  onRevealed,
}: {
  label: string;
  description: string;
  isLosing: boolean;
  buttonFrom?: string;
  buttonTo?: string;
  onRevealed: () => void;
}) {
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

    // Couche à gratter : dégradé « papier métallisé ».
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "#d4d4d8");
    grad.addColorStop(0.5, "#f4f4f5");
    grad.addColorStop(1, "#a1a1aa");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(24,24,27,0.55)";
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
  }, [reveal]);

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
          <p className="text-3xl">{isLosing ? "🎲" : "🎁"}</p>
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
        <button type="button" onClick={reveal} className="mx-auto mt-4 block text-sm font-medium text-zinc-400 underline decoration-dotted underline-offset-4 hover:text-zinc-200">
          Révéler directement
        </button>
      )}
    </div>
  );
}
