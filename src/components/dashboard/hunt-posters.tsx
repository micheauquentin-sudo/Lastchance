"use client";

import { useEffect, useRef, useState } from "react";
import { renderQr } from "@/lib/qr-render";
import {
  ensureQrDistributionAsset,
  getQrDistributionAsset,
} from "@/actions/qr-distribution";
import { QrDesigner } from "@/components/dashboard/qr-designer";
import type { QrStyle } from "@/types/database";

/**
 * Affiches imprimables des étapes d'une chasse — une par étape, avec son QR
 * code (URL /hunt/{token}) et son libellé. Réutilise le moteur de rendu QR
 * du studio (lib/qr-render). Impression A4 : une affiche par page.
 */

export interface HuntPosterStep {
  id: string;
  position: number;
  label: string;
  token: string;
  /** URL absolue de l'étape (${APP_URL}/hunt/{token}), calculée côté serveur. */
  url: string;
  /**
   * Nombre de CHARGEMENTS de la page de CETTE étape — pas de scans distincts.
   * C'est le chiffre par affiche : il répond à « laquelle de mes deux affiches
   * travaille ? », que le total de la chasse ne dirait pas.
   */
  opens: number;
}

// Style QR lisible et robuste au scan : encre franche sur blanc, cadre
// « SCANNEZ-MOI » (mêmes options que le studio).
const POSTER_QR_STYLE: QrStyle = {
  dark: "#211d16",
  light: "#ffffff",
  pattern: "square",
  eyeStyle: "square",
  frame: "banner",
  frameText: "SCANNEZ-MOI",
  frameColor: "#211d16",
};

async function renderToDataUrl(url: string, size: number): Promise<string> {
  const canvas = document.createElement("canvas");
  await renderQr(canvas, url, POSTER_QR_STYLE, size);
  return canvas.toDataURL("image/png");
}

function download(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function HuntPosters({
  huntName,
  steps,
}: {
  huntName: string;
  steps: HuntPosterStep[];
}) {
  const [downloading, setDownloading] = useState(false);

  if (steps.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Ajoutez des étapes pour générer leurs affiches QR.
      </p>
    );
  }

  async function printPosters() {
    await document.fonts?.ready;
    window.print();
  }

  async function downloadAll() {
    setDownloading(true);
    try {
      for (const step of steps) {
        const dataUrl = await renderToDataUrl(step.url, 1024);
        download(dataUrl, `chasse-etape-${step.position}.png`);
      }
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body { background: #fff !important; }
          .hunt-posters-controls { display: none !important; }
          .hunt-poster {
            break-after: page;
            break-inside: avoid;
            border: none !important;
            box-shadow: none !important;
            min-height: 90vh;
            justify-content: center;
          }
          .hunt-poster:last-child { break-after: auto; }
        }
      `}</style>

      <div className="hunt-posters-controls mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={printPosters}
          className="k-btn-sm rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink"
        >
          🖨️ Imprimer les {steps.length} affiches
        </button>
        <button
          type="button"
          onClick={downloadAll}
          disabled={downloading}
          className="rounded-xl border-2 border-k-ink bg-white px-4 py-2 text-sm font-bold text-k-ink hover:bg-k-yellow/30 disabled:opacity-60"
        >
          {downloading ? "Préparation…" : "Télécharger tout (PNG)"}
        </button>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {steps.map((step) => (
          <HuntPosterCard key={step.token} huntName={huntName} step={step} />
        ))}
      </ul>
    </div>
  );
}

function HuntPosterCard({
  huntName,
  step,
}: {
  huntName: string;
  step: HuntPosterStep;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [asset, setAsset] = useState<{ id: string; style: QrStyle; poster: Record<string, unknown> } | null>(null);
  const [designing, setDesigning] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getQrDistributionAsset({ resourceKind: "hunt_step", resourceId: step.id }).then((result) => {
      if (active && result.ok) setAsset(result.data);
    });
    return () => { active = false; };
  }, [step.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderQr(canvas, step.url, asset?.style ?? POSTER_QR_STYLE, 640).catch(() => {
      /* aperçu seulement — l'échec ne bloque rien */
    });
  }, [step.url, asset?.style]);

  async function ensureAsset() {
    const result = await ensureQrDistributionAsset({ resourceKind: "hunt_step", resourceId: step.id });
    if (!result.ok) {
      setAssetError(result.error);
      return null;
    }
    setAsset(result.data);
    return result.data;
  }

  async function downloadOne() {
    const dataUrl = await renderToDataUrl(step.url, 1024);
    download(dataUrl, `chasse-etape-${step.position}.png`);
  }

  return (
    <li className="hunt-poster flex flex-col items-center rounded-2xl border-2 border-k-ink bg-white p-6 text-center shadow-[4px_4px_0_rgba(33,29,22,0.9)]">
      <p className="text-xs font-black uppercase tracking-wide text-k-body">
        {huntName}
      </p>
      <p className="mt-1 text-lg font-black text-k-ink">
        Étape {step.position} · {step.label}
      </p>
      <canvas
        ref={canvasRef}
        className="mx-auto mt-4 h-auto w-full max-w-[16rem]"
        aria-label={`QR code de l'étape ${step.position} : ${step.label}`}
      />
      <p className="mt-4 text-sm font-bold text-k-body">
        Scannez ce QR code pour valider votre passage à cette étape.
      </p>
      {/*
        Le compteur porte `hunt-posters-controls` : il DOIT disparaître à
        l'impression. Une affiche collée en vitrine avec « 12 ouvertures »
        imprimé dessus donnerait au client un chiffre de gestion du commerçant.
      */}
      <p className="hunt-posters-controls mt-4 text-xs text-zinc-500">
        <span className="font-bold text-k-ink">
          {step.opens} ouverture{step.opens > 1 ? "s" : ""}
        </span>{" "}
        de cette étape
      </p>
      <button
        type="button"
        onClick={downloadOne}
        className="hunt-posters-controls mt-2 text-sm font-bold text-k-orange-text hover:underline"
      >
        Télécharger cette affiche (PNG)
      </button>
      <div className="hunt-posters-controls mt-3 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => { void ensureAsset().then((next) => next && setDesigning(true)); }}
          className="text-sm font-bold text-k-orange-text hover:underline"
        >
          Personnaliser ce QR
        </button>
        <button
          type="button"
          onClick={() => { void ensureAsset().then((next) => next && window.open(`/poster/distribution/${next.id}`, "_blank", "noopener,noreferrer")); }}
          className="text-sm font-bold text-k-orange-text hover:underline"
        >
          {asset && Object.keys(asset.poster).length > 0 ? "Éditer l'affiche" : "Créer l'affiche"}
        </button>
      </div>
      {assetError ? <p role="alert" className="hunt-posters-controls mt-2 text-xs font-bold text-red-600">{assetError}</p> : null}
      {designing && asset ? (
        <QrDesigner
          id={asset.id}
          slug={`chasse-etape-${step.position}`}
          url={step.url}
          initialStyle={asset.style}
          distribution={{ resourceKind: "hunt_step", resourceId: step.id }}
          onClose={() => setDesigning(false)}
          onSaved={(style) => setAsset((current) => current ? { ...current, style } : current)}
        />
      ) : null}
    </li>
  );
}
