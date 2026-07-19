"use client";

import { useEffect, useRef, useState } from "react";
import { DeleteQrButton } from "@/components/dashboard/qr-forms";
import { QrDesigner } from "@/components/dashboard/qr-designer";
import { Card } from "@/components/ui/card";
import { renderQr } from "@/lib/qr-render";
import type { QrStyle } from "@/types/database";

/**
 * Carte d'un QR code : vignette fidèle au style enregistré, stats et
 * actions. « Personnaliser » ouvre le studio QR (fenêtre dédiée).
 */
export function QrCodeCard({
  id,
  slug,
  label,
  campaignName,
  url,
  scanCount,
  initialStyle,
  posterHref,
  testHref,
}: {
  id: string;
  slug: string;
  label: string;
  campaignName: string;
  url: string;
  scanCount: number;
  initialStyle: QrStyle;
  /** Lien vers l'éditeur d'affiche imprimable de ce QR. */
  posterHref?: string;
  /** Planche imprimable couvrant tous les styles à scanner physiquement. */
  testHref?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [style, setStyle] = useState<QrStyle>(initialStyle);
  const [designing, setDesigning] = useState(false);

  // Vignette redessinée quand le style change (enregistré via le studio).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderQr(canvas, url, style, 512).catch(() => {
      /* aperçu seulement — l'erreur ne bloque rien */
    });
  }, [url, style]);

  async function handleDownload() {
    const canvas = document.createElement("canvas");
    await renderQr(canvas, url, style, 1024);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-${slug}.png`;
    a.click();
  }

  return (
    <Card>
      <div className="flex gap-4">
        <canvas
          ref={canvasRef}
          className="h-auto w-28 shrink-0 self-start rounded-lg border-2 border-k-ink/15"
          aria-label={`QR code ${label || slug}`}
        />
        <div className="flex min-w-0 flex-col">
          <p className="truncate font-black text-k-ink">{label || "Sans libellé"}</p>
          <p className="truncate text-xs font-bold text-k-body">{campaignName}</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 truncate text-xs font-bold text-k-orange hover:underline"
          >
            {url}
          </a>
          <p className="mt-1 text-xs font-bold text-zinc-400">
            {scanCount} scan{scanCount > 1 ? "s" : ""}
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setDesigning(true)}
              className="k-btn-sm rounded-full border-2 border-k-ink bg-k-yellow px-3.5 py-1.5 text-sm font-black text-k-ink"
            >
              Personnaliser
            </button>
            {posterHref && (
              <a
                href={posterHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-bold text-k-orange hover:underline"
              >
                Créer l&apos;affiche
              </a>
            )}
            {testHref && (
              <a
                href={testHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-bold text-k-orange hover:underline"
              >
                Tester les styles
              </a>
            )}
            <button
              type="button"
              onClick={handleDownload}
              className="text-sm font-bold text-k-orange hover:underline"
            >
              Télécharger PNG
            </button>
            <DeleteQrButton id={id} />
          </div>
        </div>
      </div>

      {designing && (
        <QrDesigner
          id={id}
          slug={slug}
          url={url}
          initialStyle={style}
          onClose={() => setDesigning(false)}
          onSaved={(next) => setStyle(next)}
        />
      )}
    </Card>
  );
}
