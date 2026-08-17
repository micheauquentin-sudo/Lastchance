"use client";

import { useState } from "react";

/**
 * LE CODE DE CHECK-IN EN TEXTE, SOUS UN PLI — ET SEULEMENT QUAND IL EST OUVERT.
 *
 * ── Pourquoi ce repli existe ────────────────────────────────────────
 *
 * Toutes les caisses n'ont pas de caméra utilisable (téléphone d'appoint,
 * objectif rayé, autorisation refusée) et l'écran de caisse offre justement une
 * saisie manuelle. Sans ce repli, le client n'avait RIEN à dicter : le jeton
 * n'existait qu'en pixels dans le QR.
 *
 * ── Pourquoi le contenu est CONDITIONNEL et non simplement replié ────
 *
 * Un `<details>` fermé garde son contenu dans le DOM : le jeton y serait lisible
 * par une extension, un traducteur de page ou un enregistreur de session, alors
 * que le QR ne vivait qu'en dataURL d'image. Le pli ne le monte donc qu'à
 * l'ouverture (état local sur `onToggle`) et le retire à la fermeture — le geste
 * de l'ouvrir reste natif, donc le texte apparaît dès le clic.
 *
 * Le jeton partage le secret et la durée de vie (~3 min) du QR : rien de plus
 * n'est exposé ici, seulement plus longtemps si le client laisse le pli ouvert.
 */
export function CheckinTokenReveal({ token }: { token: string }) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <details
      className="mt-3 text-left"
      // UN SEUL ÉCOUTEUR, ET C'EST `onToggle`. Il suit l'état RÉEL du pli, d'où
      // qu'il vienne : souris, tactile, Entrée au clavier, ouverture par la
      // recherche dans la page. Doubler d'un `onClick` sur le résumé — essayé —
      // casse le geste au lieu de le sécuriser : l'événement natif `toggle`
      // arrive AVANT le clic délégué de React, si bien qu'un inverseur
      // `(o) => !o` défaisait l'ouverture que `toggle` venait d'enregistrer.
      onToggle={(e) => setOuvert(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-center text-xs font-bold text-k-body underline decoration-2 underline-offset-2">
        Afficher le code (si le scan ne marche pas)
      </summary>
      {ouvert && (
        <>
          <p className="mt-2 break-all rounded-xl border-2 border-dashed border-k-ink/30 bg-k-bg px-3 py-2 font-mono text-[11px] leading-relaxed text-k-ink select-all">
            {token}
          </p>
          <p className="mt-1 text-center text-[11px] text-k-body/70">
            Montrez cette suite au comptoir : elle se saisit à la main.
          </p>
        </>
      )}
    </details>
  );
}
