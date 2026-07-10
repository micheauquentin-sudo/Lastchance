"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { updateQrStyle } from "@/actions/qr-codes";
import { DeleteQrButton } from "@/components/dashboard/qr-forms";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import type { QrStyle } from "@/types/database";

const DEFAULT_DARK = "#18181b";
const DEFAULT_LIGHT = "#ffffff";
/** Taille max du logo normalisé (px) — garde la data URL légère. */
const LOGO_MAX_PX = 256;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

/**
 * Dessine le QR (couleurs personnalisées) puis le logo centré sur un
 * pavé arrondi de la couleur de fond. Correction d'erreur "H" quand un
 * logo masque le centre, "M" sinon (meilleure densité).
 */
async function drawQr(
  canvas: HTMLCanvasElement,
  url: string,
  style: Required<Pick<QrStyle, "dark" | "light">> & { logo: string | null },
  size: number,
) {
  await QRCode.toCanvas(canvas, url, {
    width: size,
    margin: 2,
    errorCorrectionLevel: style.logo ? "H" : "M",
    color: { dark: style.dark, light: style.light },
  });

  if (!style.logo) return;

  const img = await loadImage(style.logo);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const logoSize = size * 0.22;
  const pad = size * 0.035;
  const x = (size - logoSize) / 2;
  const box = logoSize + pad * 2;

  ctx.fillStyle = style.light;
  ctx.beginPath();
  ctx.roundRect(x - pad, x - pad, box, box, pad * 1.6);
  ctx.fill();

  // Logo en "contain" : on préserve les proportions de l'image.
  const ratio = img.width / img.height;
  const w = ratio >= 1 ? logoSize : logoSize * ratio;
  const h = ratio >= 1 ? logoSize / ratio : logoSize;
  ctx.drawImage(img, x + (logoSize - w) / 2, x + (logoSize - h) / 2, w, h);
}

/**
 * Normalise n'importe quel fichier image (JPEG, PNG, WebP, GIF, SVG…)
 * en data URL PNG ≤ 256px, prête à être stockée et dessinée.
 */
async function fileToLogoDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(
      1,
      LOGO_MAX_PX / Math.max(img.width || 1, img.height || 1),
    );
    const w = Math.max(1, Math.round((img.width || LOGO_MAX_PX) * scale));
    const h = Math.max(1, Math.round((img.height || LOGO_MAX_PX) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function QrCodeCard({
  id,
  slug,
  label,
  campaignName,
  url,
  scanCount,
  initialStyle,
  posterHref,
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
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dark, setDark] = useState(initialStyle.dark ?? DEFAULT_DARK);
  const [light, setLight] = useState(initialStyle.light ?? DEFAULT_LIGHT);
  const [logo, setLogo] = useState<string | null>(initialStyle.logo ?? null);
  const [customizing, setCustomizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // Aperçu redessiné à chaque changement de style.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawQr(canvas, url, { dark, light, logo }, 512).catch(() => {
      /* aperçu seulement — l'erreur ne bloque rien */
    });
  }, [url, dark, light, logo]);

  async function handleLogoFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    try {
      setLogo(await fileToLogoDataUrl(file));
    } catch {
      setMessage({
        ok: false,
        text: "Image non reconnue. Essayez un fichier JPEG, PNG ou WebP.",
      });
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const result = await updateQrStyle({ id, dark, light, logo });
    setSaving(false);
    setMessage(
      result.ok
        ? { ok: true, text: "Personnalisation enregistrée." }
        : { ok: false, text: result.error },
    );
  }

  async function handleDownload() {
    const canvas = document.createElement("canvas");
    await drawQr(canvas, url, { dark, light, logo }, 1024);
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
          className="h-28 w-28 shrink-0 rounded-lg border border-zinc-200"
          aria-label={`QR code ${label || slug}`}
        />
        <div className="min-w-0 flex flex-col">
          <p className="font-semibold truncate">{label || "Sans libellé"}</p>
          <p className="text-xs text-zinc-500 truncate">{campaignName}</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-violet-600 hover:underline truncate mt-1"
          >
            {url}
          </a>
          <p className="text-xs text-zinc-400 mt-1">
            {scanCount} scan{scanCount > 1 ? "s" : ""}
          </p>
          <div className="mt-auto pt-2 flex flex-wrap items-center gap-3">
            {posterHref && (
              <a
                href={posterHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-violet-600 hover:underline"
              >
                Créer l&apos;affiche
              </a>
            )}
            <button
              type="button"
              onClick={handleDownload}
              className="text-sm font-semibold text-violet-600 hover:underline"
            >
              Télécharger PNG
            </button>
            <button
              type="button"
              onClick={() => setCustomizing((v) => !v)}
              className="text-sm font-semibold text-zinc-600 hover:underline"
            >
              {customizing ? "Fermer" : "Personnaliser"}
            </button>
            <DeleteQrButton id={id} />
          </div>
        </div>
      </div>

      {customizing && (
        <div className="mt-4 border-t border-zinc-100 pt-4 space-y-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <Label htmlFor={`qr-dark-${id}`}>Couleur du QR</Label>
              <input
                id={`qr-dark-${id}`}
                type="color"
                value={dark}
                onChange={(e) => setDark(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1"
              />
            </div>
            <div>
              <Label htmlFor={`qr-light-${id}`}>Couleur de fond</Label>
              <input
                id={`qr-light-${id}`}
                type="color"
                value={light}
                onChange={(e) => setLight(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1"
              />
            </div>
            <div className="min-w-0">
              <Label htmlFor={`qr-logo-${id}`}>Logo (JPEG, PNG, WebP…)</Label>
              <div className="flex items-center gap-3">
                <input
                  id={`qr-logo-${id}`}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleLogoFile(e.target.files?.[0])}
                  className="text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-violet-700 hover:file:bg-violet-100"
                />
                {logo && (
                  <button
                    type="button"
                    onClick={() => setLogo(null)}
                    className="text-sm text-red-600 hover:underline shrink-0"
                  >
                    Retirer
                  </button>
                )}
              </div>
            </div>
          </div>

          <p className="text-xs text-zinc-400">
            Astuce : gardez une couleur foncée sur un fond clair pour que le
            QR reste lisible par tous les téléphones.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            {message && (
              <p
                className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}
              >
                {message.text}
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
