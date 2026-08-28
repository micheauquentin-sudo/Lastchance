"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { renderQr } from "@/lib/qr-render";
import { SHARE_QR_STYLE } from "@/components/dashboard/public-share";

/**
 * LE TICKET D'OR DEVIENT UN QR (TKT-2).
 *
 * ── CE QUE ÇA CHANGE AU COMPTOIR ──
 *
 * Avant : le staff lisait dix caractères à voix haute, le client les tapait
 * dans son navigateur. Dix caractères d'un alphabet volontairement ambigu-safe
 * restent dix caractères à saisir dans le bruit d'un comptoir, et chaque faute
 * de frappe rendait « ce ticket ne mène nulle part ».
 *
 * Maintenant : le client scanne l'écran, tombe sur son ticket, et l'ouvre.
 *
 * ── LE CODE RESTE AFFICHÉ, ET CE N'EST PAS UN DOUBLON ──
 *
 * Un QR suppose un appareil photo qui marche, une main libre et assez de
 * lumière. Le code écrit est le chemin de secours — il se lit à voix haute,
 * s'écrit au dos d'un ticket de caisse, s'envoie par SMS. Le retirer aurait
 * rendu le jeu impraticable les jours où le scan échoue.
 *
 * ── AUCUN DROIT NOUVEAU ──
 *
 * Le QR ne transporte QUE l'URL publique du ticket, c'est-à-dire le code déjà
 * affiché juste en dessous. Il n'ouvre rien de plus qu'un code recopié à la
 * main, et l'usage unique reste tenu en base (`tire_le` sous verrou).
 */
export function TicketQr({
  /** URL publique ABSOLUE du ticket (`${APP_URL}/ticket/CODE`). */
  url,
  /** Le code, pour le nom du fichier téléchargé. */
  code,
}: {
  url: string;
  code: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      // Aperçu seulement : un échec de rendu ne doit pas casser l'écran —
      // le code écrit en dessous reste utilisable.
      void renderQr(canvas, url, SHARE_QR_STYLE, 512).catch(() => {});
    } catch {
      /* canvas indisponible (environnement de test) */
    }
  }, [url]);

  async function telecharger() {
    const canvas = document.createElement("canvas");
    try {
      await renderQr(canvas, url, SHARE_QR_STYLE, 1024);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `ticket-or-${code}.png`;
      a.click();
    } catch {
      /* rendu impossible : le code reste lisible */
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* GRAND, et pas une vignette : il est scanné depuis l'autre côté d'un
          comptoir, par un téléphone tenu à bout de bras. */}
      <canvas
        ref={canvasRef}
        className="h-auto w-56 max-w-full"
        aria-label="QR code du Ticket d'Or à faire scanner au client"
        role="img"
      />
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" variant="secondary" onClick={telecharger}>
          Télécharger (PNG)
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopie(true);
              setTimeout(() => setCopie(false), 2000);
            } catch {
              // Presse-papiers indisponible : le code reste lisible à l'écran.
            }
          }}
        >
          {copie ? "Lien copié !" : "Copier le lien"}
        </Button>
      </div>
    </div>
  );
}
