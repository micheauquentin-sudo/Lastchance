"use client";

import { useEffect, useRef } from "react";
import {
  contrastText,
  posterFontFamily,
  type PosterConfig,
  type PosterElement,
  type ShapeKind,
} from "@/lib/poster";
import { renderQr } from "@/lib/qr-render";
import type { QrStyle } from "@/types/database";

/**
 * Rendu de l'affiche : page A4 en unités conteneur (cqw), éléments
 * positionnés en % (centre) — identique dans l'éditeur, à l'aperçu et
 * à l'impression. Les interactions (drag, sélection) sont injectées
 * par l'éditeur via les props optionnelles.
 */

/* ── Formes (viewBox 0 0 100 100, étirées selon `ratio`) ── */

const SHAPE_PATHS: Record<ShapeKind, React.ReactNode> = {
  circle: <circle cx="50" cy="50" r="50" />,
  oval: <ellipse cx="50" cy="50" rx="50" ry="50" />,
  bar: <rect x="0" y="0" width="100" height="100" />,
  half: <path d="M0 100 A50 100 0 0 1 100 100 Z" />,
  cross: <path d="M35 0h30v35h35v30H65v35H35V65H0V35h35Z" />,
  ring: (
    <path
      fillRule="evenodd"
      d="M50 0a50 50 0 1 1 0 100A50 50 0 0 1 50 0Zm0 26a24 24 0 1 0 0 48 24 24 0 0 0 0-48Z"
    />
  ),
  square: <rect x="0" y="0" width="100" height="100" rx="14" />,
  pill: <rect x="0" y="0" width="100" height="100" rx="50" ry="50" />,
  triangle: <path d="M50 4 98 92H2Z" />,
  diamond: <path d="M50 0 100 50 50 100 0 50Z" />,
  star: (
    <path d="M50 2l13.5 30.1L96 36l-24 22.2L78.4 90 50 73.4 21.6 90 28 58.2 4 36l32.5-3.9Z" />
  ),
  heart: (
    <path d="M50 92C24 72 6 56 6 34 6 18 18 8 31 8c8 0 15 4 19 11C54 12 61 8 69 8c13 0 25 10 25 26 0 22-18 38-44 58Z" />
  ),
  clover: (
    <path d="M48 50c-10-1.6-18-4-22-10a12.6 12.6 0 1 1 17.7-17.7C49.7 26.3 52 34.2 51.6 44.5 53.6 34.2 56 26.3 62.3 22.3A12.6 12.6 0 1 1 80 40c-6 4-14 6.5-24.3 6.3C66 48 74 50.4 78 56.4a12.6 12.6 0 1 1-17.7 17.7c-4-6-6.4-14-6.3-24.2-1.6 10.2-4 18.1-10 22.1A12.6 12.6 0 1 1 26.3 54.3c6-4 14-6.4 24.1-6.2Zm4.5 8.5L47 92h11l-5.5-33.5Z" />
  ),
  sparkle: (
    <path d="M50 0c4.2 27 19 41.8 46 46-27 4.2-41.8 19-46 46-4.2-27-19-41.8-46-46 27-4.2 41.8-19 46-46Z" />
  ),
  burst: (
    <path d="M50 0l9.7 13.9L76 8.7l2.6 16.7L95.3 28 88 43.2 100 55l-14.6 8.6 4.4 16.3-16.9.6L68 97.3 53.3 88.9 40.7 100l-7.4-15.2-16.8 2.4 1.6-16.8L2 63.6l11.1-12.7L4.7 36.6l16.4-4.2L22.7 15.6l16.7 3.2Z" />
  ),
  arrow: <path d="M0 38h55V16l45 34-45 34V62H0Z" />,
  squiggle: (
    <path
      d="M2 60 C 14 20, 30 20, 42 60 C 54 100, 70 100, 82 60 C 88 40, 94 36, 98 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="14"
      strokeLinecap="round"
    />
  ),
  moon: <path d="M74 6A50 50 0 1 0 94 62 40 40 0 0 1 74 6Z" />,
};

function ShapeSvg({
  kind,
  color,
  ratio,
}: {
  kind: ShapeKind;
  color: string;
  ratio: number;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="block w-full"
      style={{ aspectRatio: `1 / ${ratio}`, color }}
      fill="currentColor"
      aria-hidden
    >
      {SHAPE_PATHS[kind]}
    </svg>
  );
}

/* ── QR rendu avec le style du Studio ── */

function PosterQr({ playUrl, qrStyle }: { playUrl: string; qrStyle: QrStyle }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    renderQr(canvas, playUrl, qrStyle, 640).catch(() => {});
  }, [playUrl, qrStyle]);
  return <canvas ref={ref} className="block h-auto w-full" aria-label="QR code du jeu" />;
}

/* ── Élément ── */

function ElementView({
  el,
  playUrl,
  qrStyle,
}: {
  el: PosterElement;
  playUrl: string;
  qrStyle: QrStyle;
}) {
  if (el.type === "text") {
    return (
      <div
        className="w-full whitespace-pre-wrap"
        style={{
          fontFamily: posterFontFamily(el.font ?? "nunito"),
          fontSize: `${el.size ?? 3}cqw`,
          fontWeight: el.weight ?? 700,
          color: el.color ?? "#211d16",
          textAlign: el.align ?? "center",
          lineHeight: 1.15,
        }}
      >
        {el.text ?? ""}
      </div>
    );
  }
  if (el.type === "shape") {
    return (
      <ShapeSvg
        kind={(el.kind ?? "circle") as ShapeKind}
        color={el.color ?? "#f5793b"}
        ratio={el.ratio ?? 1}
      />
    );
  }
  if (el.type === "image") {
    if (!el.src) return null;
    const cropL = el.cropL ?? 0;
    const cropR = el.cropR ?? 0;
    const cropT = el.cropT ?? 0;
    const cropB = el.cropB ?? 0;
    const cropped = cropL + cropR + cropT + cropB > 0;
    // Data URL locale : next/image n'apporterait rien ici.
    if (!cropped) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={el.src} alt="" className="block h-auto w-full" draggable={false} />;
    }
    // Fenêtre de rognage : le cadre montre la zone conservée, l'image
    // est agrandie et décalée derrière (translate % = % de l'image).
    const fw = Math.max(0.05, (100 - cropL - cropR) / 100);
    const fh = Math.max(0.05, (100 - cropT - cropB) / 100);
    const nat = el.natRatio ?? 1;
    return (
      <div
        className="w-full overflow-hidden"
        style={{ aspectRatio: `${nat * fw} / ${fh}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={el.src}
          alt=""
          draggable={false}
          className="block h-auto"
          style={{
            width: `${100 / fw}%`,
            maxWidth: "none",
            transform: `translate(-${cropL}%, -${cropT}%)`,
          }}
        />
      </div>
    );
  }
  return <PosterQr playUrl={playUrl} qrStyle={qrStyle} />;
}

/* ── Affiche ── */

export function PosterCanvas({
  config,
  playUrl,
  qrStyle,
  selectedId = null,
  onElementPointerDown,
  onResizePointerDown,
  className = "",
}: {
  config: PosterConfig;
  playUrl: string;
  qrStyle: QrStyle;
  selectedId?: string | null;
  onElementPointerDown?: (id: string, e: React.PointerEvent) => void;
  onResizePointerDown?: (id: string, e: React.PointerEvent) => void;
  className?: string;
}) {
  const patternInk = contrastText(config.bg) === "#18181b"
    ? "rgba(33,29,22,0.07)"
    : "rgba(253,246,227,0.10)";
  const pattern =
    config.bgPattern === "dots"
      ? `radial-gradient(${patternInk} 1cqw, transparent 1.05cqw)`
      : config.bgPattern === "stripes"
        ? `repeating-linear-gradient(-45deg, ${patternInk} 0 2cqw, transparent 2cqw 6cqw)`
        : undefined;

  const sorted = [...config.elements].sort((a, b) => a.z - b.z);
  const interactive = Boolean(onElementPointerDown);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        aspectRatio: "210 / 297",
        background: config.bg,
        backgroundImage: pattern,
        backgroundSize: config.bgPattern === "dots" ? "5cqw 5cqw" : undefined,
        containerType: "inline-size",
      }}
    >
      {sorted.map((el) => {
        const selected = el.id === selectedId;
        return (
          <div
            key={el.id}
            data-poster-element={el.id}
            onPointerDown={
              onElementPointerDown
                ? (e) => {
                    e.stopPropagation();
                    onElementPointerDown(el.id, e);
                  }
                : undefined
            }
            className={interactive ? "absolute touch-none select-none" : "absolute"}
            style={{
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: `${el.w}%`,
              transform: `translate(-50%, -50%) rotate(${el.rot}deg)`,
              zIndex: el.z,
              cursor: interactive ? (selected ? "grabbing" : "grab") : undefined,
            }}
          >
            <ElementView el={el} playUrl={playUrl} qrStyle={qrStyle} />
            {selected && (
              <>
                <div
                  aria-hidden
                  className="pointer-events-none absolute -inset-1 rounded border-2 border-dashed border-[#f5793b]"
                />
                {onResizePointerDown && (
                  <button
                    type="button"
                    aria-label="Redimensionner"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onResizePointerDown(el.id, e);
                    }}
                    className="absolute -bottom-2.5 -right-2.5 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-[#211d16] bg-[#fcca59]"
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
