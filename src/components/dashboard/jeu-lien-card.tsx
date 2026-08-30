"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatusBadge, type EtatAnimation } from "@/components/ui/status-badge";
import { emojiExperience } from "@/components/dashboard/nav";
import { SHARE_QR_STYLE } from "@/components/dashboard/public-share";
import { PublicShare } from "@/components/dashboard/public-share";
import type { QrDistributionKind } from "@/actions/qr-distribution";
import { renderQr } from "@/lib/qr-render";
import type { ExperienceKind } from "@/platform/experiences/contract";

/**
 * LA CARTE D'UN JEU DANS LE HUB QR — la contrepartie légère de `QrCodeCard`.
 *
 * Une campagne a des `qr_codes` : autant d'affiches que le commerçant en a
 * fabriquées, chacune avec son style, son studio et son éditeur d'affiche.
 * C'est `QrCodeCard`, et elle ne bouge pas.
 *
 * Les sept autres modules n'ont pas d'affiche en base : ils ont UNE adresse
 * publique, celle que `PublicShare` rend déjà sur la page du module. Cette
 * carte est donc volontairement pauvre — un aperçu, le lien, deux boutons —
 * plutôt qu'un second studio QR qui n'aurait rien à personnaliser. L'aperçu
 * reprend `SHARE_QR_STYLE` pour que ce qui est vu ici soit exactement ce qui
 * sera téléchargé là-bas.
 *
 * Elle porte aussi le cas « il n'y a rien à imprimer » — un module en
 * brouillon, une chasse dont les affiches sont par étape — et le dit en toutes
 * lettres au lieu d'afficher un QR vide ou un lien mort.
 */
export function JeuLienCard({
  kind,
  itemId,
  kindLabel,
  name,
  etat,
  url,
  moduleHref,
  openCount,
  extraCount,
}: {
  kind: ExperienceKind;
  /** Identifiant de la ressource publique : jamais déduit de l'URL cliente. */
  itemId: string;
  /** Libellé commerçant du type, lu sur `EXPERIENCE_CATALOG`. */
  kindLabel: string;
  name: string;
  etat: EtatAnimation;
  /**
   * URL publique ABSOLUE (`${APP_URL}/…`), ou `null` quand il n'y a rien à
   * imprimer : module non publié, ou chasse au trésor (affiches par étape).
   */
  url: string | null;
  /** Page du module dans le dashboard — pour une chasse, l'étape « Affiches ». */
  moduleHref: string;
  /** Chargements de la page publique, ou `null` si le module ne compte pas. */
  openCount: number | null;
  /** Sessions (événement) ou étapes (chasse) — `null` pour les autres. */
  extraCount: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const emoji = emojiExperience(kind);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !url) return;
    // Aperçu seulement : un échec de rendu ne doit pas casser la page.
    renderQr(canvas, url, SHARE_QR_STYLE, 512).catch(() => {});
  }, [url]);

  const etapes = kind === "hunt" ? (extraCount ?? 0) : 0;
  const salles = kind === "event" ? (extraCount ?? 0) : 0;
  const distributionKind: QrDistributionKind | null = (
    ["quiz", "calendar", "pronostics", "jackpot", "loyalty", "event"] as readonly string[]
  ).includes(kind) ? kind as QrDistributionKind : null;

  return (
    <Card className="h-full">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-k-ink bg-white px-3 py-1 text-xs font-black text-k-ink">
          {emoji ? <span aria-hidden>{emoji}</span> : null}
          {kindLabel}
        </span>
        <StatusBadge etat={etat} />
      </div>

      <p className="mb-3 font-black text-k-ink break-words">{name}</p>

      {url ? (
        distributionKind ? (
          <PublicShare
            url={url}
            fileName={`${kind}-${itemId}`}
            qrLabel={name}
            openCount={openCount ?? undefined}
            resource={{ kind: distributionKind, id: itemId }}
          />
        ) : (
        <div className="flex gap-4">
          <canvas
            ref={canvasRef}
            className="h-auto w-24 shrink-0 self-start rounded-lg border-2 border-k-ink/15"
            aria-label={`QR code de ${name}`}
            role="img"
          />
          <div className="min-w-0 flex-1">
            <code className="mb-2 block rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs text-k-ink break-all">
              {url}
            </code>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    // Presse-papiers indisponible : l'URL reste copiable à la main.
                  }
                }}
                className="rounded-lg border-2 border-k-ink bg-white px-3 py-1.5 text-xs font-bold text-k-ink hover:bg-k-yellow/30"
              >
                {copied ? "Copié !" : "Copier le lien"}
              </button>
              <Link
                href={moduleHref}
                className="rounded-lg border-2 border-k-ink bg-white px-3 py-1.5 text-xs font-bold text-k-ink hover:bg-k-yellow/30"
              >
                Ouvrir le jeu →
              </Link>
            </div>
          </div>
        </div>
        )
      ) : kind === "hunt" ? (
        <div>
          <p className="mb-2 text-sm font-bold text-k-body">
            {etapes} étape{etapes > 1 ? "s" : ""} — le QR est par affiche, pas
            par chasse.
          </p>
          <Link
            href={moduleHref}
            className="inline-block rounded-lg border-2 border-k-ink bg-white px-3 py-1.5 text-xs font-bold text-k-ink hover:bg-k-yellow/30"
          >
            {etapes} affiche{etapes > 1 ? "s" : ""} à imprimer →
          </Link>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-sm font-bold text-k-body">
            Pas encore de lien : ce jeu n&apos;est pas ouvert aux joueurs.
            Publiez-le pour obtenir son QR.
          </p>
          <Link
            href={moduleHref}
            className="inline-block rounded-lg border-2 border-k-ink bg-white px-3 py-1.5 text-xs font-bold text-k-ink hover:bg-k-yellow/30"
          >
            Ouvrir le jeu →
          </Link>
        </div>
      )}

      {(!url || !distributionKind || salles > 1) && <p className="mt-3 text-xs text-zinc-500">
        {openCount !== null ? (
          <span className="font-bold text-k-ink">
            {openCount} ouverture{openCount > 1 ? "s" : ""}
          </span>
        ) : null}
        {openCount !== null && salles > 1 ? " · " : null}
        {salles > 1 ? `${salles} salles` : null}
      </p>}
    </Card>
  );
}
