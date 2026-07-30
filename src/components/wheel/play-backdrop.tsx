"use client";

import { useEffect } from "react";

/**
 * Pose la couleur de fond de /play sur le `<body>` lui-même.
 *
 * ── Ce que ça répare, MESURÉ ──
 *
 * Le shell de /play est `position: fixed` et porte toute la peinture. Dès
 * qu'un de ses descendants crée un contexte d'empilement — l'animation
 * d'entrée `.play-in`, mais aussi un simple `transform` ou une `opacity`
 * inférieure à 1 —, la remontée de la pile de fonds s'interrompt et retombe
 * sur le `<body>`, qui porte le CRÈME du site (`#fdf6e3`).
 *
 * Conséquence : tout lecteur de cette pile calcule le texte de /play sur du
 * crème. axe-core l'a fait en CI et a rendu `#ffffff sur #fdf6e3 = 1,07:1`
 * là où le joueur voit du blanc sur du noir à 21:1.
 *
 * ── Comment on le sait, et pourquoi ce correctif-là ──
 *
 * `scripts/axe-stack-probe.mjs` reproduit le mécanisme hors de l'application
 * et met quatre correctifs à l'épreuve. Un seul rend un VRAI vert :
 *
 *   body peint             → `passes`     : #ffffff sur #000000 = 21    ✅
 *   shell sorti de `fixed` → `incomplete` : vert par ABSTENTION
 *   z-index sur <main>     → `incomplete` : vert par ABSTENTION
 *   isolation / z-index sur le shell → aucun effet
 *
 * Les deux qui « passent » rendent le capteur MUET au lieu de le rendre juste
 * — c'est le vert qui ne vérifie rien, et ce projet l'a déjà payé une fois.
 *
 * ── Ce n'est pas qu'une affaire d'outil ──
 *
 * Le commentaire de `PlayShell` le notait déjà : le crème peut apparaître
 * pour de vrai « pendant un rebond de défilement ou un repaint ». Un joueur
 * qui tire l'écran vers le bas sur mobile voit alors du crème sous une page
 * noire. La couleur portée ici est celle du commerçant — jamais un noir
 * statique, qui trahirait les styles clairs.
 */
export function PlayBackdrop({ color }: { color: string }) {
  useEffect(() => {
    const precedent = document.body.style.background;
    document.body.style.background = color;
    return () => {
      document.body.style.background = precedent;
    };
  }, [color]);
  return null;
}
