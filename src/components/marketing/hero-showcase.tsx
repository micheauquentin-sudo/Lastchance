"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PseudoQr } from "@/components/marketing/pseudo-qr";

/**
 * Vitrine du hero, fidèle à la maquette : roue de la fortune debout
 * (bezel sombre, ampoules lumineuses, moyeu « Last Chance. », pointeur
 * doré, socle) et téléphone droit affichant l'écran « Scannez et jouez ».
 * La roue tourne (rotation lente + lancer animé) et l'écran du téléphone
 * est interactif (on tape pour jouer). 100 % front. Respecte
 * `prefers-reduced-motion`.
 */

interface Segment {
  label: string;
  color: string;
}

const CORAL = "#ef6d7e";
const CREAM = "#fbf3ea";
const AMBER = "#f6a623";
const LABEL_COLOR = "#3a2418";

// 8 segments dans le sens horaire depuis le haut-droite (cf. maquette).
const SEGMENTS: Segment[] = [
  { label: "Dessert offert", color: CORAL },
  { label: "-10 %", color: CREAM },
  { label: "-10 %", color: AMBER },
  { label: "Mystère", color: CORAL },
  { label: "Boisson offerte", color: CREAM },
  { label: "-20 %", color: CORAL },
  { label: "-3pas", color: AMBER },
  { label: "-20 %", color: CREAM },
];

const VIEW = 400;
const C = VIEW / 2;
const R_SEG = 158;
const R_BEZEL = 194;
const R_BULB = 176;
const R_HUB = 62;
const R_LABEL = 110;
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

function labelFontSize(label: string): number {
  if (label.length > 11) return 13;
  if (label.length > 6) return 15;
  return 18;
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
        const next = rotationRef.current + dt * 0.005;
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
      idleRef.current = true;
    }, SPIN_MS + 60);
  }, [spinning]);

  const reset = useCallback(() => {
    setPhase("idle");
    setPrize(null);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      {/* Étincelles décoratives */}
      <Sparkle className="left-2 top-6 text-amber-400" size={26} delay="0s" />
      <Sparkle className="right-8 top-1 text-pink-400" size={18} delay="1.1s" />
      <Sparkle className="right-2 top-1/3 text-fuchsia-400" size={22} delay="2s" />

      <div className="relative flex items-end justify-center">
        {/* ── Roue debout ── */}
        <div className="relative w-[80%] max-w-[460px]">
          {/* Halo lumineux chaud */}
          <div
            aria-hidden
            className="absolute inset-[-6%] rounded-full bg-[radial-gradient(circle,rgba(251,146,60,0.28),rgba(244,114,182,0.12)_45%,transparent_66%)] blur-2xl"
          />
          {/* Socle / pied */}
          <div
            aria-hidden
            className="absolute -bottom-[1%] left-1/2 z-0 h-[14%] w-[54%] -translate-x-1/2"
            style={{
              clipPath: "polygon(32% 0, 68% 0, 100% 100%, 0 100%)",
              background: "linear-gradient(180deg,#3a352f 0%,#14110d 100%)",
              boxShadow: "0 26px 30px -10px rgba(90,30,15,0.5)",
            }}
          />

          <div className="relative z-10">
            {/* Pointeur doré */}
            <div className="absolute -top-3 left-1/2 z-30 -translate-x-1/2 drop-shadow-[0_5px_5px_rgba(120,40,20,0.4)]">
              <svg width="56" height="50" viewBox="0 0 56 50" aria-hidden>
                <defs>
                  <linearGradient id="ptrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fcd34d" />
                    <stop offset="100%" stopColor="#dd8a10" />
                  </linearGradient>
                </defs>
                <path
                  d="M28 47 L7 11 A6 6 0 0 1 12 3 L44 3 A6 6 0 0 1 49 11 Z"
                  fill="url(#ptrGrad)"
                  stroke="#c2740a"
                  strokeWidth="1.5"
                />
                <path d="M28 47 L7 11 L28 13 Z" fill="rgba(0,0,0,0.14)" />
              </svg>
            </div>

            <button
              type="button"
              onClick={spin}
              aria-label="Tourner la roue"
              className="group block w-full rounded-full outline-none focus-visible:ring-4 focus-visible:ring-orange-300/60"
            >
              <svg
                viewBox={`0 0 ${VIEW} ${VIEW}`}
                className="w-full drop-shadow-[0_34px_60px_rgba(120,40,20,0.38)]"
              >
                <defs>
                  <radialGradient id="bezelGrad" cx="38%" cy="26%" r="80%">
                    <stop offset="0%" stopColor="#524a40" />
                    <stop offset="55%" stopColor="#2b2622" />
                    <stop offset="100%" stopColor="#151009" />
                  </radialGradient>
                  <radialGradient id="sheenGrad" cx="33%" cy="22%" r="72%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
                    <stop offset="42%" stopColor="#ffffff" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="hubGrad" cx="40%" cy="32%" r="72%">
                    <stop offset="0%" stopColor="#fffdf8" />
                    <stop offset="100%" stopColor="#efdcbe" />
                  </radialGradient>
                </defs>

                {/* Épaisseur (lèvre inférieure) */}
                <circle cx={C} cy={C + 11} r={R_BEZEL} fill="#120d08" />
                {/* Bezel dégradé */}
                <circle cx={C} cy={C} r={R_BEZEL} fill="url(#bezelGrad)" />
                <circle cx={C} cy={C} r={R_BEZEL - 9} fill="none" stroke="#0f0d0b" strokeWidth="2" opacity="0.5" />

                {/* Ampoules lumineuses */}
                {Array.from({ length: 18 }, (_, i) => {
                  const [bx, by] = pt((i / 18) * 360, R_BULB);
                  return (
                    <circle
                      key={i}
                      cx={bx.toFixed(1)}
                      cy={by.toFixed(1)}
                      r={5}
                      fill={i % 2 ? "#fff4d4" : "#ffd27a"}
                      className="wheel-light"
                      style={{
                        animationDelay: `${(i * 0.08).toFixed(2)}s`,
                        filter: "drop-shadow(0 0 5px rgba(255,196,84,0.95))",
                      }}
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
                    let rot = mid;
                    if (mid > 90 && mid < 270) rot = mid - 180;
                    const [tx, ty] = pt(mid, R_LABEL);
                    return (
                      <g key={i}>
                        <path d={wedgePath(i)} fill={seg.color} stroke="#0000000f" strokeWidth="1" />
                        <text
                          x={tx.toFixed(2)}
                          y={ty.toFixed(2)}
                          fill={LABEL_COLOR}
                          fontSize={labelFontSize(seg.label)}
                          fontWeight={700}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          transform={`rotate(${rot.toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)})`}
                          style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
                        >
                          {seg.label}
                        </text>
                      </g>
                    );
                  })}
                </g>

                {/* Reflet glossy (fixe) */}
                <circle cx={C} cy={C} r={R_SEG} fill="url(#sheenGrad)" style={{ pointerEvents: "none" }} />

                {/* Moyeu central « Last Chance. » (relief) */}
                <circle cx={C} cy={C + 3} r={R_HUB} fill="rgba(0,0,0,0.18)" />
                <circle cx={C} cy={C} r={R_HUB} fill="url(#hubGrad)" stroke="#e7d3b8" strokeWidth="2" />
                <text
                  x={C}
                  y={C - 9}
                  textAnchor="middle"
                  fontSize="23"
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
                  fontSize="23"
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
        </div>

        {/* ── Téléphone droit ── */}
        <div className="relative z-20 -ml-8 mb-1 w-[36%] max-w-[210px] shrink-0 sm:-ml-12">
          <PhoneScreen phase={phase} prize={prize} onSpin={spin} onReset={reset} />
        </div>
      </div>

      {/* Annotation manuscrite */}
      <div className="pointer-events-none mt-2 flex items-start justify-end gap-2 pr-2 sm:pr-4">
        <svg width="46" height="34" viewBox="0 0 46 34" aria-hidden className="mt-5 text-zinc-400">
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
          className="max-w-[170px] text-right text-[15px] leading-snug text-zinc-500"
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
    <div className="relative rounded-[2.2rem] border-[7px] border-zinc-900 bg-zinc-900 shadow-[0_36px_58px_-20px_rgba(120,40,20,0.5)]">
      <div className="relative h-[380px] overflow-hidden rounded-[1.7rem] bg-white">
        {/* Reflet d'écran */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-30 rounded-[1.7rem] bg-gradient-to-tr from-transparent via-transparent to-white/25"
        />
        {/* Haut-parleur */}
        <div className="absolute left-1/2 top-2.5 z-40 h-1.5 w-12 -translate-x-1/2 rounded-full bg-zinc-800" />

        {phase === "result" && prize ? (
          <div className="flex h-full flex-col items-center px-5 pb-5 pt-10 text-center">
            <p className="text-3xl">🎉</p>
            <p className="mt-1 text-sm font-semibold text-zinc-500">Bravo, vous gagnez</p>
            <p
              className="mt-1 bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-xl font-extrabold text-transparent"
              style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
            >
              {prize.label}
            </p>
            <div className="mt-4 rounded-xl border border-dashed border-orange-300 bg-orange-50/60 px-4 py-2">
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
          </div>
        ) : (
          <button
            type="button"
            onClick={onSpin}
            disabled={phase === "spinning"}
            aria-label="Tourner la roue"
            className="flex h-full w-full cursor-pointer flex-col items-center px-5 pb-6 pt-11 text-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-300 disabled:cursor-default"
          >
            <p
              className="text-lg font-bold text-zinc-900"
              style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}
            >
              Scannez et jouez
            </p>
            <p className="mt-0.5 text-sm text-zinc-500">
              {phase === "spinning" ? "La roue tourne…" : "Bonne chance !"}
            </p>
            <div className="mt-6 w-[64%] rounded-2xl bg-white p-2.5 shadow-[0_6px_16px_-4px_rgba(0,0,0,0.15)] ring-1 ring-zinc-100">
              <PseudoQr className="h-auto w-full" />
            </div>
            <p className="mt-auto text-[11px] font-medium uppercase tracking-wider text-zinc-300">
              Touchez pour jouer
            </p>
          </button>
        )}
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
