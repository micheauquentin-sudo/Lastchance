"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QR_PRESETS, renderQr } from "@/lib/qr-render";
import type { QrEyeStyle, QrPattern, QrStyle } from "@/types/database";

const PATTERNS: QrPattern[] = [
  "square",
  "rounded",
  "dots",
  "diamond",
  "fluid",
  "lines-h",
  "lines-v",
  "classy",
];
const EYES: QrEyeStyle[] = ["square", "rounded", "circle", "leaf"];

const LABELS: Record<QrPattern | QrEyeStyle, string> = {
  square: "carré",
  rounded: "arrondi",
  dots: "points",
  diamond: "losange",
  fluid: "fluide",
  "lines-h": "barres",
  "lines-v": "colonnes",
  classy: "élégant",
  circle: "cercle",
  leaf: "feuille",
};

interface Variant {
  key: string;
  label: string;
  style: QrStyle;
}

function QrSample({ variant, url }: { variant: Variant; url: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    setRendered(false);
    renderQr(canvas, url, variant.style, 720)
      .then(() => setRendered(true))
      .catch(() => setRendered(false));
  }, [url, variant]);

  return (
    <article
      className="qr-qa-card rounded-lg border border-zinc-300 bg-white p-2 text-center"
      data-qr-variant={variant.key}
      data-rendered={rendered ? "true" : "false"}
    >
      <canvas ref={ref} className="mx-auto block h-auto w-full" />
      <p className="mt-1 text-[10px] font-semibold leading-tight text-zinc-700">
        {variant.label}
      </p>
      <p className="text-[8px] text-zinc-400">{variant.key}</p>
    </article>
  );
}

export function QrTestSheet({
  url,
  label,
  currentStyle,
}: {
  url: string;
  label: string;
  currentStyle: QrStyle;
}) {
  const variants = useMemo<Variant[]>(() => {
    const combinations = PATTERNS.flatMap((pattern) =>
      EYES.map((eyeStyle) => ({
        key: `${pattern}-${eyeStyle}`,
        label: `${LABELS[pattern]} / œil ${LABELS[eyeStyle]}`,
        style: {
          dark: "#18181b",
          light: "#ffffff",
          pattern,
          eyeStyle,
          gradientType: "none" as const,
          frame: "none" as const,
        },
      })),
    );
    const presets = QR_PRESETS.map((preset) => ({
      key: `preset-${preset.key}`,
      label: `préréglage ${preset.label}`,
      style: { ...preset.style, logo: null },
    }));
    return [
      ...combinations,
      ...presets,
      { key: "saved-style", label: "style actuellement enregistré", style: currentStyle },
    ];
  }, [currentStyle]);

  async function printSheet() {
    await document.fonts?.ready;
    window.print();
  }

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          .qr-qa-controls { display: none !important; }
          .qr-qa-grid { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; gap: 3mm !important; }
          .qr-qa-card { break-inside: avoid; border-color: #aaa !important; padding: 2mm !important; }
        }
      `}</style>
      <div className="qr-qa-controls mx-auto mb-6 flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Planche de validation QR</h1>
          <p className="text-sm text-zinc-600">
            {label || "QR sans libellé"} · {variants.length} variantes · même URL de test
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/dashboard/qr-codes" className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold">
            Retour
          </a>
          <button
            type="button"
            onClick={printSheet}
            className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white"
          >
            Imprimer en A4
          </button>
        </div>
      </div>
      <section className="qr-qa-grid mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {variants.map((variant) => (
          <QrSample key={variant.key} variant={variant} url={url} />
        ))}
      </section>
    </main>
  );
}
