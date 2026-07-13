"use client";

import { useState } from "react";
import { capturePlayEvent } from "@/components/analytics";

/**
 * Invitation au partage affichée après une partie. Propose au joueur de
 * partager le jeu à ses proches — le lien porte `?ref=share`, ce qui
 * permet de mesurer les parties issues d'un partage (colonne
 * spins.source côté serveur).
 *
 * Utilise l'API Web Share native quand elle existe (mobile), avec repli
 * WhatsApp + copie de lien sur desktop.
 */
export function ShareInvite({
  slug,
  organizationName,
}: {
  slug: string;
  organizationName: string;
}) {
  const [copied, setCopied] = useState(false);

  // Construit le lien de partage à partir de l'origine courante : évite
  // de dépendre d'une variable d'env côté client et reste juste en prod
  // comme en préproduction.
  function shareUrl(): string {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/play/${slug}?ref=share`;
  }

  const shareText = `🎁 Tente ta chance chez ${organizationName} !`;

  async function handleNativeShare() {
    const url = shareUrl();
    capturePlayEvent("shared", { channel: "native" });
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: organizationName, text: shareText, url });
      } catch {
        // Partage annulé par l'utilisateur — rien à faire.
      }
    } else {
      await handleCopy();
    }
  }

  async function handleCopy() {
    const url = shareUrl();
    capturePlayEvent("shared", { channel: "copy" });
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible — l'utilisateur peut toujours WhatsApp.
    }
  }

  const canNativeShare =
    typeof navigator !== "undefined" && "share" in navigator;

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(
    `${shareText} ${shareUrl()}`,
  )}`;

  return (
    <div className="mt-8 w-full rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
      <p className="text-sm font-semibold text-white">
        Faites gagner vos proches 🎉
      </p>
      <p className="mt-1 text-xs text-zinc-400">
        Partagez le jeu, ils tenteront leur chance à leur tour.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {canNativeShare ? (
          <button
            onClick={handleNativeShare}
            className="w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-zinc-900"
          >
            Partager le jeu
          </button>
        ) : (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => capturePlayEvent("shared", { channel: "whatsapp" })}
            className="w-full rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white"
          >
            Partager sur WhatsApp
          </a>
        )}
        <button
          onClick={handleCopy}
          className="w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white"
        >
          {copied ? "Lien copié ✓" : "Copier le lien"}
        </button>
      </div>
    </div>
  );
}
