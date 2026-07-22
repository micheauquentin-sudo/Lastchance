"use client";

import { useRouter } from "next/navigation";
import { QrScanner } from "./qr-scanner";

/**
 * Scan caméra du QR affiché sur l'écran de gain du client (voir RedeemQr) :
 * évite de taper le code à la main en caisse. Fine surcouche du scanner
 * générique (QrScanner) — le décodage caméra vit dans ce composant partagé.
 */
export function RedeemScanner() {
  const router = useRouter();

  return (
    <div className="mb-6">
      <QrScanner
        label="📷 Scanner le QR du client"
        videoLabel="Aperçu caméra pour scanner le code de gain"
        onResult={(raw) => {
          // Le payload du QR/pass porte déjà son préfixe (GAIN-… pour la roue,
          // CHASSE-… pour la chasse, FIDELITE-… pour la fidélité) : on le
          // transmet TEL QUEL. Le routage et toute normalisation sont faits
          // côté serveur par lookupRedeemCode. Pré-normaliser ici forcerait le
          // préfixe GAIN- et casserait les autres codes.
          router.push(`/dashboard/redeem?code=${encodeURIComponent(raw)}`);
        }}
      />
    </div>
  );
}
