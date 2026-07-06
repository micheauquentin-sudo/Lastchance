/**
 * Roue SVG pure (sans état) — partagée entre l'aperçu admin et la page
 * publique. Segments visuels égaux : les probabilités réelles (weights)
 * restent côté serveur, invisibles pour le joueur.
 */

export interface WheelSegment {
  id: string;
  label: string;
  color: string;
}

const SIZE = 330;
const CENTER = SIZE / 2;
const RADIUS = 148;

function point(deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CENTER + r * Math.sin(rad), CENTER - r * Math.cos(rad)];
}

export function WheelSvg({
  segments,
  rotation = 0,
  spinning = false,
  spinDurationMs = 4400,
}: {
  segments: WheelSegment[];
  /** Angle courant de la roue en degrés. */
  rotation?: number;
  /** Active la transition CSS vers `rotation`. */
  spinning?: boolean;
  spinDurationMs?: number;
}) {
  const n = Math.max(segments.length, 1);
  const span = 360 / n;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width="100%"
      height="100%"
      style={{ display: "block", filter: "drop-shadow(0 14px 40px rgba(0,0,0,.45))" }}
      role="img"
      aria-label="Roue de la fortune"
    >
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS + 6}
        fill="none"
        stroke="rgba(255,255,255,.14)"
        strokeWidth={6}
      />
      {Array.from({ length: 24 }, (_, i) => {
        const [lx, ly] = point((i / 24) * 360, RADIUS + 12);
        return (
          <circle
            key={i}
            cx={lx.toFixed(1)}
            cy={ly.toFixed(1)}
            r={3.4}
            fill={i % 2 ? "#ffffff" : "#ffd34d"}
            className="wheel-light"
            style={{ animationDelay: `${(i * 0.06).toFixed(2)}s` }}
          />
        );
      })}
      <g
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: `${CENTER}px ${CENTER}px`,
          transformBox: "view-box" as never,
          transition: spinning
            ? `transform ${spinDurationMs}ms cubic-bezier(.12,.72,.13,1)`
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
              <path d={d} fill={seg.color} stroke="rgba(0,0,0,.4)" strokeWidth={2} />
              <text
                x={tx.toFixed(2)}
                y={ty.toFixed(2)}
                fill="#fff"
                fontSize={span < 25 ? 10 : 13.5}
                fontWeight={700}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${mid.toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)})`}
                style={{
                  paintOrder: "stroke",
                  stroke: "rgba(0,0,0,.35)",
                  strokeWidth: 2,
                }}
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
    </svg>
  );
}

/** Pointeur fixe au-dessus de la roue. */
export function WheelPointer({ color = "#7c3aed" }: { color?: string }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: -4,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 3,
        width: 0,
        height: 0,
        borderLeft: "15px solid transparent",
        borderRight: "15px solid transparent",
        borderTop: `28px solid ${color}`,
        filter: "drop-shadow(0 3px 7px rgba(0,0,0,.55))",
      }}
    />
  );
}
