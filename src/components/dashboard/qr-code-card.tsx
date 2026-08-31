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
  const [copied, setCopied] = useState(false);
  const [rewardCount, setRewardCount] = useState<number | null>(null);
  const [rewardStatus, setRewardStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  // Les résultats sont un repère de suivi, pas une action cachée : chaque
  // carte les charge à son montage. La route compte un journal serveur après
  // ses gardes organisation/ressource ; aucun événement brut ne descend ici.
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ kind: "campaign", id });
    void fetch(`/api/dashboard/qr-distribution?${params}`, {
        cache: "no-store",
      })
      .then(async (response) => {
        if (!response.ok) {
          if (!cancelled) setRewardStatus("unavailable");
          return;
        }
        const data: unknown = await response.json();
        if (
          !cancelled &&
          typeof data === "object" &&
          data !== null &&
          "rewardCount" in data &&
          typeof data.rewardCount === "number"
        ) {
          setRewardCount(data.rewardCount);
          setRewardStatus("ready");
        } else if (!cancelled) {
          setRewardStatus("unavailable");
        }
      })
      .catch(() => {
        // Indicateur secondaire : l'outil QR reste utilisable si sa lecture tombe.
        if (!cancelled) setRewardStatus("unavailable");
      });

    return () => {
      cancelled = true;
    };
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

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : l'URL reste sélectionnable manuellement.
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <canvas
            ref={canvasRef}
            className="h-auto w-40 max-w-full rounded-lg border-2 border-k-ink/15"
            aria-label={`QR code ${label || slug}`}
          />
          <button
            type="button"
            onClick={handleDownload}
            className="k-btn-sm w-full rounded-xl border-2 border-k-ink bg-white px-4 py-2.5 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
          >
            Télécharger le QR (PNG)
          </button>
          <button
            type="button"
            onClick={() => setDesigning(true)}
            className="k-btn-sm w-full rounded-xl border-2 border-k-ink bg-white px-4 py-2.5 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
          >
            Personnaliser le QR
          </button>
          {posterHref && (
            <a
              href={posterHref}
              target="_blank"
              rel="noopener noreferrer"
              className="k-btn-sm w-full rounded-xl border-2 border-k-ink bg-white px-4 py-2.5 text-center text-sm font-bold text-k-ink hover:bg-k-yellow/30"
            >
              {posterConfigured ? "Éditer l'affiche" : "Créer l'affiche"}
            </a>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="truncate font-black text-k-ink">{label || "Sans libellé"}</p>
          <p className="truncate text-xs font-bold text-k-body">{campaignName}</p>
          <code className="block rounded-lg bg-zinc-100 px-3 py-2 text-sm text-k-ink break-all">
            {url}
          </code>
          {/* « scans » était un mensonge poli : le beacon compte chaque
              CHARGEMENT de la page, donc aussi un rechargement, un retour
              arrière ou un lien partagé. La colonne reste `scan_count` (elle
              est livrée), le mot affiché non — un commerçant qui lit « 40
              scans » croit à 40 personnes devant sa vitrine. */}
          <section aria-label="Résultats du QR" className="rounded-lg bg-k-yellow/20 px-3 py-2">
            <p className="text-xs font-black text-k-ink">Résultats</p>
            <p
              className="text-sm font-bold text-k-ink"
              title="Chaque chargement de la page compte, y compris un rechargement ou un lien partagé : ce n'est pas un nombre de visiteurs distincts."
            >
              {scanCount} ouverture{scanCount > 1 ? "s" : ""}
            </p>
            <p className="text-sm font-bold text-k-ink">
              {rewardStatus === "loading"
                ? "Chargement des gains…"
                : rewardStatus === "unavailable"
                  ? "Gains indisponibles"
                  : `${rewardCount ?? 0} gain${rewardCount === 1 ? "" : "s"} attribué${rewardCount === 1 ? "" : "s"}`}
            </p>
          </section>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={copyLink}
              className="text-sm font-bold text-k-orange-text hover:underline"
            >
              {copied ? "Copié !" : "Copier le lien"}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-bold text-k-orange-text hover:underline"
            >
              Ouvrir la page →
            </a>
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
