"use client";

import { useEffect, useRef, useState } from "react";
import { DeleteQrButton } from "@/components/dashboard/qr-forms";
import { QrDesigner } from "@/components/dashboard/qr-designer";
import { getCampaignQrRewardCount } from "@/actions/qr-distribution";
import { Card } from "@/components/ui/card";
import { renderQr } from "@/lib/qr-render";
import type { QrStyle } from "@/types/database";

/**
 * Carte d'un QR code : vignette fidèle au style enregistré, stats et
 * actions. « Personnaliser » ouvre le studio QR (fenêtre dédiée).
 *
 * LES ORANGES SONT DES `k-orange-text`, PAS DES `k-orange` — le premier scan
 * axe de cette page (spec `qr-hub`) a levé 40 nœuds `color-contrast` en
 * `serious`, tous ici : `#f5793b` sur blanc plafonne à ~2,5:1 et
 * `text-zinc-400` à ~2,3:1. Le token `--color-k-orange-text` (#b45309) existe
 * dans `globals.css` depuis longtemps pour exactement ce cas, et le reste du
 * dashboard l'emploie déjà ; cette carte était simplement restée en arrière,
 * jamais scannée parce que la page qui la porte ne l'était pas.
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
  posterConfigured = false,
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
  /** Une affiche déjà enregistrée doit se rouvrir, pas être présentée comme neuve. */
  posterConfigured?: boolean;
  /** Planche imprimable couvrant tous les styles à scanner physiquement. */
  testHref?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [style, setStyle] = useState<QrStyle>(initialStyle);
  const [designing, setDesigning] = useState(false);
  const [rewardCount, setRewardCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void getCampaignQrRewardCount(id).then((result) => {
      if (active && result.ok) setRewardCount(result.data);
    });
    return () => { active = false; };
  }, [id]);

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
            className="mt-1 truncate text-xs font-bold text-k-orange-text hover:underline"
          >
            {url}
          </a>
          {/* « scans » était un mensonge poli : le beacon compte chaque
              CHARGEMENT de la page, donc aussi un rechargement, un retour
              arrière ou un lien partagé. La colonne reste `scan_count` (elle
              est livrée), le mot affiché non — un commerçant qui lit « 40
              scans » croit à 40 personnes devant sa vitrine. */}
          <p
            className="mt-1 text-xs font-bold text-zinc-500"
            title="Chaque chargement de la page compte, y compris un rechargement ou un lien partagé : ce n'est pas un nombre de visiteurs distincts."
          >
            {scanCount} ouverture{scanCount > 1 ? "s" : ""}
          </p>
          {rewardCount !== null ? (
            <p className="text-xs font-bold text-zinc-500">
              {rewardCount} gain{rewardCount > 1 ? "s" : ""} attribué{rewardCount > 1 ? "s" : ""}
            </p>
          ) : null}
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
                className="text-sm font-bold text-k-orange-text hover:underline"
              >
                {posterConfigured ? "Éditer l'affiche" : "Créer l'affiche"}
              </a>
            )}
            {testHref && (
              <a
                href={testHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-bold text-k-orange-text hover:underline"
              >
                Tester les styles
              </a>
            )}
            <button
              type="button"
              onClick={handleDownload}
              className="text-sm font-bold text-k-orange-text hover:underline"
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
