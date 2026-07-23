"use client";

import { useEffect, useState } from "react";

/**
 * QR géant de l'écran de salle (lobby) pointant vers la page de participation
 * `/event/[code]`. Généré côté client avec la même lib `qrcode` que les autres
 * parcours (voir wheel/redeem-qr, jackpot). Fond clair pour rester scannable sur
 * le panneau sombre plein écran. Taille pilotée par la classe passée.
 */
export function EventJoinQr({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(url, { width: 640, margin: 1 })
        .then((generated) => {
          if (!cancelled) setDataUrl(generated);
        })
        .catch(() => {
          // QR non généré : l'URL lisible affichée à côté reste utilisable.
        });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!dataUrl) {
    return (
      <div
        className={`flex items-center justify-center rounded-2xl border-2 border-dashed border-k-ink/30 bg-white/5 text-sm font-bold text-k-bg/60 ${className ?? ""}`}
        role="status"
      >
        Préparation du QR…
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt="QR code à scanner pour rejoindre l'événement avec votre téléphone"
      className={`rounded-2xl border-4 border-k-ink bg-white p-3 ${className ?? ""}`}
    />
  );
}
