"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PseudoQr } from "@/components/marketing/pseudo-qr";

/**
 * Vitrine interactive du hero : la roue tourne réellement (rotation
 * lente au repos + lancer animé jusqu'à un lot) et l'écran du téléphone
 * pilote la démo — bouton « Tourner la roue », état en cours, résultat.
 * 100 % front, aucune logique métier. Respecte `prefers-reduced-motion`.
 */

interface Segment {
  label: string;
  color: string;
  text: string;
}

// 8 segments — couleurs alternées sans répétition adjacente (bord inclus).
const SEGMENTS: Segment[] = [
  { label: "-20 %", color: "#f6836f", text: "#4a2118" },
  { label: "Dessert offert", color: "#fbeee0", text: "#7a3b2e" },
  { label: "-10 %", color: "#f6a623", text: "#4a2f05" },
  { label: "Café offert", color: "#ee5a6f", text: "#4a121f" },
  { label: "Mystère", color: "#fbeee0", text: "#7a3b2e" },
  { label: "Boisson offerte", color: "#f6a623", text: "#4a2f05" },
  { label: "-20 %", color: "#f6836f", text: "#4a2118" },
  { label: "Surprise", color: "#fbeee0", text: "#7a3b2e" },
];

const VIEW = 400;
const C = VIEW / 2;
const R_SEG = 158;
const R_BEZEL = 194;
const R_BULB = 176;
const R_HUB = 60;
const R_LABEL = 104;
const N = SEGMENTS.length;
const SPAN = 360 / N;
const SPIN_MS = 4600;

function pt(deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [C + r * Math.sin(rad), C - r * Math.cos(rad)];
}

function wedgePath(i: number): string {
  const start = i * SPAN;
  const end = start + SPAN;
  const [x1, y1] = pt(start, R_SEG);
  const [x2, y2] = pt(end, R_SEG);
  return `M${C} ${C} L${x1.toFixed(2)} ${y1.toFixed(2)} A${R_SEG} ${R_SEG} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

type Phase = "idle" | "spinning" | "result";

export function HeroShowcase() {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [prize, setPrize] = useState<Segment | null>(null);

  const rotationRef = useRef(0);
  const rafRef = useRef(0);
  const idleRef = useRef(true);
  const reducedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  // Rotation lente permanente au repos (la roue « tourne » toujours).
  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedRef.current) return;

    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (idleRef.current) {
        const next = rotationRef.current + dt * 0.006; // ~2°/s
        rotationRef.current = next;
        setRotation(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const spin = useCallback(() => {
    if (spinning) return;
    const k = Math.floor(Math.random() * N);
    const won = SEGMENTS[k];

    if (reducedRef.current) {
      setPrize(won);
      setPhase("result");
      return;
    }

    idleRef.current = false;
    setPhase("spinning");
    setPrize(null);

    // Angle final pour amener le centre du segment k sous le pointeur (haut).
    const targetMod = (360 - (k + 0.5) * SPAN) % 360;
    const current = rotationRef.current;
    const currentMod = ((current % 360) + 360) % 360;
    let delta = targetMod - currentMod;
    if (delta < 0) delta += 360;
    const next = current + 360 * 5 + delta;

    setSpinning(true);
    setRotation(next);
    rotationRef.current = next;

    timeoutRef.current = setTimeout(() => {
      setSpinning(false);
      setPrize(won);
      setPhase("result");
      idleRef.current = true; // reprend la rotation lente depuis l'angle final
    }, SPIN_MS + 60);
  }, [spinning]);

  const reset = useCallback(() => {
    setPhase("idle");
    setPrize(null);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      {/* Étincelles décoratives */}
      <Sparkle className="left-2 top-4 text-amber-400" size={26} delay="0s" />
      <Sparkle className="right-6 top-0 text-pink-400" size={18} delay="1.1s" />
      <Sparkle className="right-1 top-1/3 text-fuchsia-400" size={22} delay="2s" />

      <div className="relative flex items-end justify-center">
        {/* ── Roue ── */}
        <div className="relative w-[78%] max-w-[440px]">
          {/* Pointeur */}
          <div className="absolute -top-1 left-1/2 z-20 -translate-x-1/2">
            <svg width="40" height="46" viewBox="0 0 40 46" aria-hidden>
              <path
                d="M20 44 6 16a14 14 0 1 1 28 0L20 44Z"
                fill="#f6a623"
                stroke="#d97706"
                strokeWidth="2"
              />
              <circle cx="20" cy="15" r="5" fill="#fff8ec" />
            </svg>
          </div>

          <button
            type="button"
            onClick={spin}
            aria-label="Tourner la roue"
            className="group block w-full rounded-full outline-none focus-visible:ring-4 focus-visible:ring-orange-300/60"
          >
            <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="w-full drop-shadow-[0_24px_50px_rgba(120,40,20,0.28)]">
              {/* Bezel sombre */}
              <circle cx={C} cy={C} r={R_BEZEL} fill="#2b2622" />
              <circle cx={C} cy={C} r={R_BEZEL - 8} fill="none" stroke="#0f0d0b" strokeWidth="2" opacity="0.5" />

              {/* Ampoules */}
              {Array.from({ length: 16 }, (_, i) => {
                const [bx, by] = pt((i / 16) * 360, R_BULB);
                return (
                  <circle
                    key={i}
                    cx={bx.toFixed(1)}
                    cy={by.toFixed(1)}
                    r={4.4}
                    fill={i % 2 ? "#fff3d6" : "#f6a623"}
                    className="wheel-light"
                    style={{ animationDelay: `${(i * 0.09).toFixed(2)}s` }}
                  />
                );
              })}

              {/* Segments (groupe tournant) */}
              <g
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transformOrigin: `${C}px ${C}px`,
                  transformBox: "view-box" as never,
                  transition: spinning
                    ? `transform ${SPIN_MS}ms cubic-bezier(.15,.72,.12,1)`
                    : "none",
                }}
              >
                {SEGMENTS.map((seg, i) => {
                  const mid = i * SPAN + SPAN / 2;
                  const [tx, ty] = pt(mid, R_LABEL);
                  return (
                    <g key={i}>
                      <path d={wedgePath(i)} fill={seg.color} stroke="#00000018" strokeWidth="1" />
                      <text
                        x={tx.toFixed(2)}
                        y={ty.toFixed(2)}
                        fill={seg.text}
                        fontSize={seg.label.length > 8 ? 14 : 18}
                        fontWeight={700}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(${mid.toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)})`}
                        style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
                      >
                        {seg.label}
                      </text>
                    </g>
                  );
                })}
              </g>

              {/* Moyeu central fixe */}
              <circle cx={C} cy={C} r={R_HUB} fill="#fbf1e2" stroke="#e7d3b8" strokeWidth="2" />
              <circle cx={C} cy={C} r={R_HUB} fill="none" stroke="#00000010" strokeWidth="6" />
              <text
                x={C}
                y={C - 8}
                textAnchor="middle"
                fontSize="22"
                fontWeight={800}
                fill="#2b2622"
                style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
              >
                Last
              </text>
              <text
                x={C}
                y={C + 18}
                textAnchor="middle"
                fontSize="22"
                fontWeight={800}
                fill="#2b2622"
                style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
              >
                Chance
                <tspan fill="#ec4899">.</tspan>
              </text>
            </svg>
          </button>
        </div>

        {/* ── Téléphone interactif ── */}
        <div className="relative -ml-10 mb-2 w-[34%] max-w-[190px] shrink-0 sm:-ml-14">
          <PhoneScreen phase={phase} prize={prize} onSpin={spin} onReset={reset} />
        </div>
      </div>

      {/* Annotation manuscrite */}
      <div className="pointer-events-none mt-3 flex items-start justify-end gap-2 pr-2 sm:pr-6">
        <svg width="46" height="34" viewBox="0 0 46 34" aria-hidden className="mt-4 text-zinc-400">
          <path
            d="M44 3C30 2 8 6 4 22M4 22l-2-8M4 22l9-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p
          className="max-w-[180px] text-right text-[15px] leading-snug text-zinc-500"
          style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
        >
          Vos clients scannent, jouent, reviennent&nbsp;!
        </p>
      </div>
    </div>
  );
}

function PhoneScreen({
  phase,
  prize,
  onSpin,
  onReset,
}: {
  phase: Phase;
  prize: Segment | null;
  onSpin: () => void;
  onReset: () => void;
}) {
  return (
    <div className="rotate-[4deg] rounded-[2rem] border-[6px] border-zinc-900 bg-zinc-900 shadow-2xl shadow-orange-950/25">
      <div className="relative h-[360px] overflow-hidden rounded-[1.6rem] bg-gradient-to-b from-rose-50 to-orange-50">
        {/* Encoche */}
        <div className="absolute left-1/2 top-2 h-4 w-16 -translate-x-1/2 rounded-full bg-zinc-900" />

        <div className="flex h-full flex-col items-center px-4 pb-4 pt-9 text-center">
          {phase === "result" && prize ? (
            <>
              <p className="text-3xl">🎉</p>
              <p className="mt-1 text-sm font-semibold text-zinc-500">Bravo, vous gagnez</p>
              <p
                className="mt-1 bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-xl font-extrabold text-transparent"
                style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
              >
                {prize.label}
              </p>
              <div className="mt-3 rounded-xl border border-dashed border-orange-300 bg-white/70 px-4 py-2">
                <p className="font-mono text-xs tracking-widest text-zinc-500">GAIN-7F3K</p>
              </div>
              <p className="mt-3 px-2 text-xs leading-relaxed text-zinc-500">
                À présenter en caisse pour récupérer votre lot.
              </p>
              <button
                type="button"
                onClick={onReset}
                className="mt-auto w-full rounded-full border border-orange-200 bg-white py-2.5 text-sm font-semibold text-orange-600 transition-colors hover:bg-orange-50"
              >
                Rejouer
              </button>
            </>
          ) : (
            <>
              <p
                className="text-lg font-bold text-zinc-800"
                style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
              >
                Scannez et jouez
              </p>
              <p className="text-sm text-zinc-500">
                {phase === "spinning" ? "La roue tourne…" : "Bonne chance !"}
              </p>
              <div className="mt-3 w-[62%] rounded-xl bg-white p-2 shadow-sm">
                <PseudoQr className="h-auto w-full" />
              </div>
              <button
                type="button"
                onClick={onSpin}
                disabled={phase === "spinning"}
                className="mt-auto w-full rounded-full bg-gradient-to-r from-orange-500 to-pink-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {phase === "spinning" ? "En cours…" : "Tourner la roue"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Sparkle({
  className = "",
  size = 20,
  delay = "0s",
}: {
  className?: string;
  size?: number;
  delay?: string;
}) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`sparkle pointer-events-none absolute z-20 ${className}`}
      style={{ animationDelay: delay }}
    >
      <path
        d="M12 0c1 6.5 5.5 11 11 12-5.5 1-10 5.5-11 12-1-6.5-5.5-11-11-12C6.5 11 11 6.5 12 0Z"
        fill="currentColor"
      />
    </svg>
  );
}
