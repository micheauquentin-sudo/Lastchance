"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { renderQr } from "@/lib/qr-render";
import type { QrStyle } from "@/types/database";

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
const SHARE_QR_STYLE: QrStyle = {
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
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      // Aperçu seulement : un échec de rendu ne doit pas casser la page.
      void renderQr(canvas, url, SHARE_QR_STYLE, 512).catch(() => {});
    } catch {
      /* canvas indisponible (environnement de test) */
    }
  }, [url]);

  async function downloadPng() {
    const canvas = document.createElement("canvas");
    try {
      await renderQr(canvas, url, SHARE_QR_STYLE, 1024);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${fileName}.png`;
      a.click();
    } catch {
      /* rendu impossible : le lien reste utilisable */
    }
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
      </div>
    </div>
  );
}
