"use client";

import { useSyncExternalStore } from "react";

/**
 * Roue SVG pure (sans état de jeu) — partagée entre l'aperçu admin et la page
 * publique. Segments visuels égaux : les probabilités réelles (weights)
 * restent côté serveur, invisibles pour le joueur.
 *
 * L'apparence (anneau, lumières, bordures, moyeu, pointeur, police) est
 * pilotée par un `WheelStyle` résolu — voir src/lib/wheel-style.ts.
 */

import { bestTextColor } from "@/lib/contrast";
import { fontFamily } from "@/lib/fonts";
import type { WheelStyle } from "@/lib/wheel-style";

export interface WheelSegment {
  id: string;
  label: string;
  color: string;
}

const SIZE = 330;
const CENTER = SIZE / 2;
const RADIUS = 148;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * `prefers-reduced-motion` LU ICI, ET PAS SEULEMENT CHEZ L'APPELANT.
 *
 * La transition de la roue est un STYLE INLINE : le bloc
 * `@media (prefers-reduced-motion: reduce)` de `globals.css` ne peut pas
 * l'atteindre, il ne coupe que des animations portées par des CLASSES. Tant
 * que la neutralisation dépendait des cinq appelants, elle dépendait aussi du
 * suivant : chacun devait penser à passer `reducedMotion` ET à écourter
 * `spinDurationMs`, et le mieux qu'ils obtenaient restait un TOUR COMPLET en
 * 300 ms — plus violent, pas plus calme.
 *
 * Le composant pose donc la question lui-même : sous cette préférence, la roue
 * ne tourne pas, elle se place. Le résultat s'affiche exactement comme avant,
 * les minuteries des appelants sont inchangées.
 *
 * (Même hook que `GaugeChallenge` et les treize révélations — dupliqué comme
 * eux plutôt que factorisé : la mutualisation touche quatorze fichiers hors
 * du périmètre de ce lot.)
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

function point(deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CENTER + r * Math.sin(rad), CENTER - r * Math.cos(rad)];
}

function Ring({ style }: { style: WheelStyle }) {
  if (style.ring === "none") return null;

  const color =
    style.ringColor ??
    { classic: "rgba(255,255,255,.14)", gold: "#ca8a04", neon: "#22d3ee", minimal: "#ffffff" }[
      style.ring
    ];

  if (style.ring === "gold") {
    return (
      <>
        <circle cx={CENTER} cy={CENTER} r={RADIUS + 8} fill="none" stroke={color} strokeWidth={7} />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS + 2}
          fill="none"
          stroke="rgba(255,255,255,.35)"
          strokeWidth={1.5}
        />
      </>
    );
  }

  if (style.ring === "neon") {
    return (
      <>
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS + 7}
          fill="none"
          stroke={color}
          strokeWidth={3}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS + 12}
          fill="none"
          stroke={color}
          strokeWidth={1}
          opacity={0.5}
        />
      </>
    );
  }

  // classic / minimal : simple cercle
  return (
    <circle
      cx={CENTER}
      cy={CENTER}
      r={RADIUS + 6}
      fill="none"
      stroke={color}
      strokeWidth={style.ring === "minimal" ? 4 : 6}
    />
  );
}

function Lights({ style }: { style: WheelStyle }) {
  if (!style.lights) return null;
  return (
    <>
      {Array.from({ length: 24 }, (_, i) => {
        const [lx, ly] = point((i / 24) * 360, RADIUS + 12);
        return (
          <circle
            key={i}
            cx={lx.toFixed(1)}
            cy={ly.toFixed(1)}
            r={3.4}
            fill={i % 2 ? style.lightColorA : style.lightColorB}
            className="wheel-light"
            style={{ animationDelay: `${(i * 0.06).toFixed(2)}s` }}
          />
        );
      })}
    </>
  );
}

function Hub({ style }: { style: WheelStyle }) {
  if (style.hub === "none") return null;
  if (style.hub === "dot") {
    return <circle cx={CENTER} cy={CENTER} r={9} fill={style.hubColor} />;
  }
  if (style.hub === "target") {
    return (
      <>
        <circle cx={CENTER} cy={CENTER} r={22} fill={style.hubColor} />
        <circle cx={CENTER} cy={CENTER} r={14} fill="rgba(0,0,0,.25)" />
        <circle cx={CENTER} cy={CENTER} r={7} fill={style.hubColor} />
      </>
    );
  }
  // disc
  return (
    <>
      <circle cx={CENTER} cy={CENTER} r={24} fill={style.hubColor} />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={24}
        fill="none"
        stroke="rgba(0,0,0,.2)"
        strokeWidth={2}
      />
    </>
  );
}

export function WheelSvg({
  segments,
  rotation = 0,
  spinning = false,
  spinDurationMs = 4400,
  reducedMotion = false,
  style: s,
}: {
  segments: WheelSegment[];
  /** Angle courant de la roue en degrés. */
  rotation?: number;
  /** Active la transition CSS vers `rotation`. */
  spinning?: boolean;
  spinDurationMs?: number;
  /**
   * FORCE le mode réduit même si le navigateur ne le demande pas.
   *
   * La préférence RÉELLE est lue par le composant (voir
   * `usePrefersReducedMotion` plus haut) : cette prop ne fait que s'y ajouter.
   * Les appelants la passent encore parce qu'ils écourtent aussi leurs propres
   * minuteries de révélation à partir de la même valeur.
   */
  reducedMotion?: boolean;
  /**
   * Style DÉJÀ RÉSOLU — obligatoire, et c'est le point de la prop.
   *
   * Elle acceptait un `Partial` et appelait `resolveWheelStyle` ici, comme le
   * faisaient seize autres composants client de la roue. `resolveWheelStyle`
   * est un `safeParse` zod : accepter un style partiel côté client, c'est
   * embarquer zod et le schéma complet de la roue dans le lot de départ des
   * pages joueur — celles qu'on ouvre au QR code, en boutique, sur réseau
   * mobile — pour refaire une validation que le serveur a DÉJÀ faite
   * (`/play` la fait en page.tsx). Rendre la prop obligatoire déplace la
   * résolution une fois côté serveur et fait tomber les dix-sept appels.
   */
  style: WheelStyle;
}) {
  const n = Math.max(segments.length, 1);
  const span = 360 / n;
  const labelFont = fontFamily(s.font);
  // La préférence du navigateur SUFFIT : la prop ne peut que la renforcer.
  const sansMouvement = usePrefersReducedMotion() || reducedMotion;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width="100%"
      height="100%"
      style={{ display: "block", filter: "drop-shadow(0 14px 40px rgba(0,0,0,.45))" }}
      role="img"
      aria-label="Roue de la fortune"
    >
      <Ring style={s} />
      <Lights style={s} />
      <g
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: `${CENTER}px ${CENTER}px`,
          transformBox: "view-box" as never,
          // Sous `prefers-reduced-motion` : AUCUNE transition. La roue se
          // place sur son angle final, sans le tour complet à 300 ms qui
          // subsistait — un mouvement écourté reste un mouvement.
          transition:
            spinning && !sansMouvement
              ? `transform ${spinDurationMs}ms ${
                  s.cartoonAnimations
                    ? "cubic-bezier(0.175, 0.885, 0.32, 1.275)"
                    : "cubic-bezier(.12,.72,.13,1)"
                }`
              : "none",
        }}
      >
        {segments.map((seg, i) => {
          const start = i * span;
          const end = start + span;
          const [x1, y1] = point(start, RADIUS);
          const [x2, y2] = point(end, RADIUS);
          const largeArc = span > 180 ? 1 : 0;
          const d = `M${CENTER} ${CENTER} L${x1.toFixed(2)} ${y1.toFixed(2)} A${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
          const mid = (start + end) / 2;
          const [tx, ty] = point(mid, RADIUS * 0.62);
          return (
            <g key={seg.id}>
              <path
                d={d}
                fill={seg.color}
                stroke={s.segmentBorderColor}
                strokeWidth={s.segmentBorderWidth}
              />
              <text
                x={tx.toFixed(2)}
                y={ty.toFixed(2)}
                // « auto » : encre sombre ou blanc selon le fond du
                // segment (contraste WCAG maximal) ; un hex explicite
                // du commerçant est appliqué tel quel.
                fill={s.labelColor === "auto" ? bestTextColor(seg.color) : s.labelColor}
                fontSize={span < 25 ? 10 : 13.5}
                fontWeight={700}
                fontFamily={labelFont}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${mid.toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)})`}
                style={
                  s.labelOutline
                    ? {
                        paintOrder: "stroke",
                        stroke: "rgba(0,0,0,.35)",
                        strokeWidth: 2,
                      }
                    : undefined
                }
              >
                {seg.label.length > 16 ? `${seg.label.slice(0, 15)}…` : seg.label}
              </text>
            </g>
          );
        })}
        {segments.length === 0 && (
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#3f3f46" />
        )}
      </g>
      <Hub style={s} />
    </svg>
  );
}

/** Pointeur fixe au-dessus de la roue. */
export function WheelPointer({
  color = "#7c3aed",
  variant = "triangle",
  spinning = false,
}: {
  color?: string;
  variant?: WheelStyle["pointer"];
  spinning?: boolean;
}) {
  const spinClass = spinning ? "animate-pointer-tick" : "";
  const base: React.CSSProperties = {
    position: "absolute",
    top: -4,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 3,
    filter: "drop-shadow(0 3px 7px rgba(0,0,0,.55))",
  };

  if (variant === "pin") {
    return (
      <svg aria-hidden width={26} height={34} viewBox="0 0 26 34" style={base} className={spinClass}>
        <path
          d="M13 33C13 33 24 19.5 24 12A11 11 0 1 0 2 12C2 19.5 13 33 13 33Z"
          fill={color}
        />
        <circle cx={13} cy={12} r={4.5} fill="rgba(255,255,255,.85)" />
      </svg>
    );
  }

  if (variant === "arrow") {
    return (
      <svg aria-hidden width={30} height={34} viewBox="0 0 30 34" style={base} className={spinClass}>
        <path
          d="M15 34 3 14h7V0h10v14h7Z"
          fill={color}
          stroke="rgba(0,0,0,.3)"
          strokeWidth={1}
        />
      </svg>
    );
  }

  // triangle (défaut)
  return (
    <div
      aria-hidden
      className={spinClass}
      style={{
        ...base,
        width: 0,
        height: 0,
        borderLeft: "15px solid transparent",
        borderRight: "15px solid transparent",
        borderTop: `28px solid ${color}`,
      }}
    />
  );
}
