"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createLoyaltyOrderCodes } from "@/actions/loyalty";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { renderQr } from "@/lib/qr-render";
import type { QrStyle } from "@/types/database";

/**
 * CARTES DE COMMANDE — émission et impression, côté commerçant (cahier §7).
 *
 * Le commerçant émet un lot de jetons, télécharge leurs QR en PNG et en glisse
 * un dans chaque colis. Le client scanne : son passeport se crée ou se
 * continue, et le tampon est posé UNE FOIS. Le jeton contourne le cooldown du
 * programme — deux commandes le même jour valent deux tampons — parce que
 * l'anti-double est porté par la consommation du jeton, pas par une fenêtre de
 * temps (migration 20260915120000).
 *
 * Deux groupes, et la distinction est le cœur de l'écran : ce qui reste à
 * distribuer (avec son QR) et ce qui a déjà servi (sans QR — le réimprimer
 * n'aurait aucun effet, et laisserait croire le contraire).
 */

/** Bornes du formulaire d'émission (miroir de la validation serveur). */
const MIN_COUNT = 1;
const MAX_COUNT = 100;

// Style QR lisible et robuste au scan, identique aux affiches de chasse.
const CARD_QR_STYLE: QrStyle = {
  dark: "#211d16",
  light: "#ffffff",
  pattern: "square",
  eyeStyle: "square",
  frame: "banner",
  frameText: "SCANNEZ-MOI",
  frameColor: "#211d16",
};

export interface OrderCodeCard {
  /** Jeton public du QR. */
  token: string;
  /** Référence de commande du commerçant, jamais montrée au client. */
  label: string | null;
  /** URL absolue (`${APP_URL}/commande/{token}`), calculée côté serveur. */
  url: string;
  /** Horodatage de consommation, ou null si la carte est à distribuer. */
  consumedAt: string | null;
}

async function renderToDataUrl(url: string, size: number): Promise<string> {
  const canvas = document.createElement("canvas");
  await renderQr(canvas, url, CARD_QR_STYLE, size);
  return canvas.toDataURL("image/png");
}

function download(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/** Nom de fichier stable et sans surprise : la référence si elle existe. */
function fileNameFor(card: OrderCodeCard): string {
  // Tout ce qui n'est pas ASCII sûr devient un tiret — accents compris. Un
  // nom de fichier voyage jusqu'à l'explorateur du commerçant puis, souvent,
  // jusqu'à une imprimante : on ne parie pas sur son encodage.
  const base = (card.label ?? card.token)
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `carte-commande-${base || card.token}.png`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

export function OrderCodeCards({
  programId,
  codes,
}: {
  programId: string;
  codes: OrderCodeCard[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  const aDistribuer = codes.filter((c) => c.consumedAt === null);
  const servies = codes.filter((c) => c.consumedAt !== null);

  async function emettre(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const count = Number(data.get("count") ?? 0);
    const label = String(data.get("label") ?? "").trim();

    setPending(true);
    setError(null);
    setCreated(null);
    try {
      const result = await createLoyaltyOrderCodes({
        programId,
        count,
        label: label || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // L'action rend le tableau des codes créés — pas un objet qui
      // l'enveloppe : seul son cardinal nous intéresse ici, les jetons
      // eux-mêmes reviennent par la relecture de page ci-dessous.
      setCreated(result.data.length);
      form.reset();
      // Les nouvelles cartes ne sont visibles qu'après relecture de la page :
      // sans ce rafraîchissement, le commerçant qui ne voit rien réémet, et
      // se retrouve avec deux lots pour une seule commande.
      router.refresh();
    } catch {
      setError("Émission impossible, réessayez.");
    } finally {
      setPending(false);
    }
  }

  async function downloadAll() {
    setDownloading(true);
    try {
      for (const card of aDistribuer) {
        const dataUrl = await renderToDataUrl(card.url, 1024);
        download(dataUrl, fileNameFor(card));
      }
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card>
      <h2 className="font-semibold mb-1">Cartes de commande</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Une carte = un tampon, à glisser dans le colis : votre client scanne le
        QR à la réception et son passeport se crée ou se poursuit.
      </p>

      <form onSubmit={emettre} className="flex flex-wrap items-end gap-3">
        <div className="w-28">
          <Label htmlFor="order-codes-count">Nombre</Label>
          <Input
            id="order-codes-count"
            name="count"
            type="number"
            min={MIN_COUNT}
            max={MAX_COUNT}
            step={1}
            defaultValue={10}
            required
          />
        </div>
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <Label htmlFor="order-codes-label">Référence (facultatif)</Label>
          <Input
            id="order-codes-label"
            name="label"
            maxLength={120}
            placeholder="CMD-2026-0412"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="k-btn-sm rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-bold text-k-ink disabled:opacity-60"
        >
          {pending ? "Émission…" : "Émettre les cartes"}
        </button>
      </form>
      <p className="mt-1.5 text-xs text-zinc-500">
        De {MIN_COUNT} à {MAX_COUNT} cartes par lot. La référence vous sert à
        retrouver l&apos;expédition : elle n&apos;est jamais montrée au client.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
      {created !== null && (
        <p role="status" className="mt-3 text-sm font-semibold text-emerald-700">
          {created} carte{created > 1 ? "s" : ""} émise{created > 1 ? "s" : ""}.
        </p>
      )}

      {codes.length === 0 ? (
        <p className="mt-5 text-sm text-zinc-500">
          Aucune carte émise pour l&apos;instant.
        </p>
      ) : (
        <>
          {aDistribuer.length > 0 && (
            <section className="mt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-black uppercase tracking-wide text-zinc-500">
                  À distribuer ({aDistribuer.length})
                </h3>
                <button
                  type="button"
                  onClick={downloadAll}
                  disabled={downloading}
                  className="rounded-xl border-2 border-k-ink bg-white px-4 py-2 text-sm font-bold text-k-ink hover:bg-k-yellow/30 disabled:opacity-60"
                >
                  {downloading
                    ? "Préparation…"
                    : `Télécharger les ${aDistribuer.length} cartes (PNG)`}
                </button>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2">
                {aDistribuer.map((card) => (
                  <OrderCard key={card.token} card={card} />
                ))}
              </ul>
            </section>
          )}

          {servies.length > 0 && (
            <section className="mt-6">
              <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-zinc-500">
                Déjà servies ({servies.length})
              </h3>
              {/* Pas de QR ici : une carte servie ne peut plus rien tamponner,
                  la réimprimer donnerait au client un QR mort. */}
              <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
                {servies.map((card) => (
                  <li
                    key={card.token}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-zinc-700">
                      {card.label ?? card.token}
                    </span>
                    <span className="text-xs font-bold text-zinc-500">
                      Servi{card.consumedAt ? ` le ${formatDate(card.consumedAt)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Card>
  );
}

function OrderCard({ card }: { card: OrderCodeCard }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderQr(canvas, card.url, CARD_QR_STYLE, 512).catch(() => {
      /* aperçu seulement — l'échec ne bloque pas le téléchargement */
    });
  }, [card.url]);

  async function downloadOne() {
    const dataUrl = await renderToDataUrl(card.url, 1024);
    download(dataUrl, fileNameFor(card));
  }

  return (
    <li className="flex flex-col items-center rounded-2xl border-2 border-k-ink bg-white p-5 text-center shadow-[4px_4px_0_rgba(33,29,22,0.9)]">
      <p className="text-xs font-black uppercase tracking-wide text-k-body">
        {card.label ?? "Carte de commande"}
      </p>
      <canvas
        ref={canvasRef}
        className="mx-auto mt-3 h-auto w-full max-w-[12rem]"
        aria-label={`QR code de la carte ${card.label ?? card.token}`}
      />
      <p className="mt-3 text-sm font-bold text-k-body">
        À glisser dans le colis : un scan, un tampon.
      </p>
      <button
        type="button"
        onClick={downloadOne}
        className="mt-2 text-sm font-bold text-k-orange hover:underline"
      >
        Télécharger cette carte (PNG)
      </button>
    </li>
  );
}
