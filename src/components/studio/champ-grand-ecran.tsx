"use client";

import { useEffect, useRef } from "react";

import { CHAMP_GRAND_ECRAN, RUPTURE_LG } from "@/lib/atterrissage-studio";

/**
 * LE FORMULAIRE DIT AU SERVEUR SUR QUEL ÉCRAN IL EST (VIT-51).
 *
 * Posé dans un formulaire de création, ce champ permet à l'action de rediriger
 * vers le studio sur un ordinateur et vers l'atelier sur un téléphone — un
 * arbitrage que le serveur ne peut pas faire seul.
 *
 * ── LA VALEUR EST POSÉE APRÈS L'HYDRATATION, ET C'EST NÉCESSAIRE ──
 *
 * Elle ne peut pas être rendue côté serveur : il n'y a pas de fenêtre. La
 * mettre dans le HTML initial produirait une valeur inventée, puis un écart
 * d'hydratation quand le client la corrigerait.
 *
 * Le champ part donc VIDE et sa valeur est écrite sur le nœud du DOM après le
 * montage. React ne compare pas les propriétés qu'il n'a pas rendues : aucun
 * écart n'est possible.
 *
 * ── L'ABSENCE DE RÉPONSE EST UNE RÉPONSE ──
 *
 * Si le montage n'a pas lieu — JavaScript coupé — le champ reste vide et
 * `destinationApresCreation` retombe sur l'atelier, qui fonctionne partout.
 * C'est le repli le moins coûteux : un clic de plus sur un ordinateur, contre
 * un écran à deux colonnes servi à un téléphone dans l'autre sens.
 *
 * ── POURQUOI PAS UNE MEDIA QUERY CSS ──
 *
 * Un `<input>` ne se lit pas en CSS. On aurait pu poser deux champs et en
 * masquer un, mais un champ masqué EST POSTÉ quand même : les deux seraient
 * partis, et le serveur aurait dû arbitrer entre deux réponses contradictoires.
 */
export function ChampGrandEcran() {
  const champ = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!champ.current) return;
    champ.current.value = window.innerWidth >= RUPTURE_LG ? "1" : "0";
  }, []);

  return <input ref={champ} type="hidden" name={CHAMP_GRAND_ECRAN} />;
}
