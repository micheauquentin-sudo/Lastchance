"use client";

import { useEffect, useRef } from "react";
import type { ModulePageOpenKey } from "@/lib/module-page-opens";

/**
 * Signale une ouverture de page publique au compteur.
 *
 * Le comptage vivait dans le rendu serveur ; depuis que la page de la roue est
 * servie depuis le cache ISR, c'est le client qui signale sa visite.
 * `sendBeacon` n'attend pas de réponse et survit à une navigation immédiate ;
 * repli sur fetch keepalive si indisponible.
 *
 * Deux formes, parce que les identifiants publics ne sont pas de même nature :
 *   <ScanBeacon slug={slug} />                      → la roue
 *   <ScanBeacon module="quiz" publicId={slug} />    → les six modules à QR
 *
 * `publicId` porte ce que l'URL porte — un slug, un code de jonction ou un
 * identifiant. Ce n'est délibérément pas nommé `slug` : trois des six modules
 * n'en ont pas, et un nom qui ment sur son contenu est exactement le défaut
 * que ce lot corrige côté compteur.
 */
type ScanBeaconProps =
  | { slug: string; module?: undefined; publicId?: undefined }
  | { module: ModulePageOpenKey; publicId: string; slug?: undefined };

export function ScanBeacon(props: ScanBeaconProps) {
  const sent = useRef(false);
  const url =
    props.module === undefined
      ? `/api/scan?slug=${encodeURIComponent(props.slug)}`
      : `/api/scan?module=${encodeURIComponent(props.module)}&id=${encodeURIComponent(props.publicId)}`;

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(url);
    } else {
      fetch(url, { method: "POST", keepalive: true }).catch(() => {
        /* comptage best-effort */
      });
    }
  }, [url]);

  return null;
}
