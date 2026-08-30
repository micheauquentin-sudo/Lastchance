"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import type { QrDistributionKind } from "@/actions/qr-distribution";
import { renderQr } from "@/lib/qr-render";
import type { QrStyle } from "@/types/database";

const QrDesigner = dynamic(
  () => import("@/components/dashboard/qr-designer").then(({ QrDesigner }) => QrDesigner),
  { ssr: false },
);

/**
 * Partage d'une expérience joueur publiable : QR code imprimable + lien
 * absolu copiable. Un seul composant pour tous les modules — le cahier
 * produit (§4) exige « un QR et un lien » partout, et trois blocs recopiés
 * divergent. `url` est TOUJOURS absolue (calculée côté serveur avec
 * `APP_URL`) : un chemin relatif produit un QR qui ne mène nulle part.
 *
 * Ce composant ne confère aucun droit et ne porte aucun secret : il rend une
 * URL publique que l'appelant a déjà décidé d'exposer.
 */

// Même style que les affiches de chasse : encre franche sur blanc, bannière
// « SCANNEZ-MOI » — lisible collé sur une vitrine.
//
// EXPORTÉ, et non recopié : le hub QR (`jeu-lien-card.tsx`) rend l'aperçu du
// même lien public que ce composant. Deux littéraux jumeaux auraient divergé
// au premier changement de goût, et l'aperçu du hub n'aurait plus ressemblé au
// QR effectivement téléchargé depuis la page du module.
export const SHARE_QR_STYLE: QrStyle = {
  dark: "#211d16",
  light: "#ffffff",
  pattern: "square",
  eyeStyle: "square",
  frame: "banner",
  frameText: "SCANNEZ-MOI",
  frameColor: "#211d16",
};

export function PublicShare({
  url,
  fileName,
  qrLabel,
  openCount,
  resource,
  onStyleSaved,
}: {
  /** URL publique ABSOLUE (`${APP_URL}/…`). */
  url: string;
  /** Nom du PNG téléchargé, sans extension. */
  fileName: string;
  /** Texte alternatif du QR (nom de l'expérience). */
  qrLabel: string;
  /**
   * Nombre de CHARGEMENTS de la page publique, ou `undefined` si le module ne
   * compte pas encore. Ce n'est pas un nombre de scans distincts — le libellé
   * affiché le dit au commerçant plutôt que de le laisser croire à un nombre
   * de visiteurs.
   */
  openCount?: number;
  /** Ressource dont l'URL publique est dérivée côté serveur. */
  resource?: { kind: QrDistributionKind; id: string };
  /** Permet à une planche locale de redessiner ses exemplaires après édition. */
  onStyleSaved?: (style: QrStyle) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [asset, setAsset] = useState<{ id: string; style: QrStyle; poster: Record<string, unknown> } | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [designing, setDesigning] = useState(false);
  const [rewardCount, setRewardCount] = useState<number | null>(null);
  async function loadQrDetails() {
    if (!resource || rewardCount !== null) return;
    const params = new URLSearchParams({ kind: resource.kind, id: resource.id });
    try {
      const response = await fetch(`/api/dashboard/qr-distribution?${params}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json() as {
        asset: { id: string; style: QrStyle; poster: Record<string, unknown> } | null;
        rewardCount: number | null;
      };
      setAsset(data.asset);
      setRewardCount(data.rewardCount);
    } catch {
      // Les compteurs ne doivent jamais empêcher de copier ou télécharger le QR.
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      // Aperçu seulement : un échec de rendu ne doit pas casser la page.
      void renderQr(canvas, url, asset?.style ?? SHARE_QR_STYLE, 512).catch(() => {});
    } catch {
      /* canvas indisponible (environnement de test) */
    }
  }, [url, asset?.style]);

  async function downloadPng() {
    const canvas = document.createElement("canvas");
    try {
      await renderQr(canvas, url, asset?.style ?? SHARE_QR_STYLE, 1024);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${fileName}.png`;
      a.click();
    } catch {
      /* rendu impossible : le lien reste utilisable */
    }
  }

  async function openDesigner() {
    if (!resource) return;
    setAssetError(null);
    const { ensureQrDistributionAsset } = await import("@/actions/qr-distribution");
    const result = await ensureQrDistributionAsset({ resourceKind: resource.kind, resourceId: resource.id });
    if (!result.ok) {
      setAssetError(result.error);
      return;
    }
    setAsset(result.data);
    setDesigning(true);
  }

  async function openPoster() {
    if (!resource) return;
    setAssetError(null);
    const { ensureQrDistributionAsset } = await import("@/actions/qr-distribution");
    const result = await ensureQrDistributionAsset({ resourceKind: resource.kind, resourceId: resource.id });
    if (!result.ok) {
      setAssetError(result.error);
      return;
    }
    setAsset(result.data);
    window.open(`/poster/distribution/${result.data.id}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="flex shrink-0 flex-col items-center gap-2">
        <canvas
          ref={canvasRef}
          className="h-auto w-40 max-w-full"
          aria-label={`QR code de ${qrLabel}`}
          role="img"
        />
        <Button type="button" variant="secondary" onClick={downloadPng}>
          Télécharger le QR (PNG)
        </Button>
        {resource ? (
          <Button type="button" variant="secondary" onClick={openDesigner}>
            Personnaliser le QR
          </Button>
        ) : null}
        {resource ? (
          <Button type="button" variant="secondary" onClick={openPoster}>
            {asset && Object.keys(asset.poster).length > 0 ? "Éditer l'affiche" : "Créer l'affiche"}
          </Button>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <code className="block rounded-lg bg-zinc-100 px-3 py-2 text-sm text-k-ink break-all">
          {url}
        </code>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                // Presse-papiers indisponible : l'URL reste copiable à la main.
              }
            }}
          >
            {copied ? "Copié !" : "Copier le lien"}
          </Button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="k-btn-sm inline-flex items-center gap-2 rounded-xl border-2 border-k-ink bg-white px-4 py-2.5 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
          >
            Ouvrir la page →
          </a>
        </div>

        {openCount !== undefined ? (
          <p className="text-xs text-zinc-500">
            <span className="font-bold text-k-ink">
              {openCount} ouverture{openCount > 1 ? "s" : ""}
            </span>{" "}
            de la page — chaque chargement compte, y compris un rechargement ou
            un lien partagé. Ce n&apos;est donc pas un nombre de visiteurs
            distincts.
          </p>
        ) : null}
        {rewardCount !== null ? (
          <p className="text-xs text-zinc-500">
            <span className="font-bold text-k-ink">
              {rewardCount} gain{rewardCount > 1 ? "s" : ""}
            </span>{" "}
            attribué{rewardCount > 1 ? "s" : ""}
          </p>
        ) : resource ? (
          <button
            type="button"
            onClick={loadQrDetails}
            className="text-xs font-bold text-k-orange-text hover:underline"
          >
            Afficher les gains attribués
          </button>
        ) : null}
        {assetError ? <p role="alert" className="text-xs font-bold text-red-600">{assetError}</p> : null}
      </div>
      {designing && asset && resource ? (
        <QrDesigner
          id={asset.id}
          slug={fileName}
          url={url}
          initialStyle={asset.style}
          distribution={{ resourceKind: resource.kind, resourceId: resource.id }}
          onClose={() => setDesigning(false)}
          onSaved={(style) => {
            setAsset((current) => current ? { ...current, style } : current);
            onStyleSaved?.(style);
          }}
        />
      ) : null}
    </div>
  );
}
