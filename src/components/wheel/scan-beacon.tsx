"use client";

import { useEffect, useRef } from "react";

/**
 * Compte un scan à chaque chargement navigateur de la page /play.
 * Le comptage vivait dans le rendu serveur ; depuis que la page est
 * servie depuis le cache ISR, c'est le client qui signale sa visite.
 * `sendBeacon` n'attend pas de réponse et survit à une navigation
 * immédiate ; repli sur fetch keepalive si indisponible.
 */
export function ScanBeacon({ slug }: { slug: string }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    const url = `/api/scan?slug=${encodeURIComponent(slug)}`;
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(url);
    } else {
      fetch(url, { method: "POST", keepalive: true }).catch(() => {
        /* comptage best-effort */
      });
    }
  }, [slug]);

  return null;
}
