"use client";

import { useEffect, useState } from "react";

/**
 * QR du code de retrait, généré côté client (mêmes lib/rendu que les
 * QR de campagne, voir lib poster côté serveur). Permet au staff de
 * scanner le gain à la caisse plutôt que de taper le code à la main
 * (voir /dashboard/redeem).
 */
export function RedeemQr({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(value, { width: 176, margin: 1 })
        .then((url) => {
          if (!cancelled) setDataUrl(url);
        })
        .catch(() => {
          // QR non généré : le code texte reste lisible/utilisable.
        });
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!dataUrl) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt={`QR code du gain ${value}, à scanner en caisse`}
      width={88}
      height={88}
      className="mx-auto mt-4 rounded-lg bg-white p-1.5"
    />
  );
}
