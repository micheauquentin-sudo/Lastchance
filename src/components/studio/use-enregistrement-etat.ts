"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * ENREGISTREMENT AUTOMATIQUE PILOTÉ PAR L'ÉTAT — et pourquoi il ne remplace
 * pas `src/lib/use-auto-save.ts`.
 *
 * Le dépôt a DEUX enregistrements automatiques, et ce n'est pas un doublon.
 *
 *  - `useAutoSave` (lib) écoute les événements `input`/`change` DU FORMULAIRE.
 *    C'est le bon outil quand les champs visibles sont dans le `<form>` — le
 *    cas de tous les ateliers historiques.
 *  - Celui-ci écoute L'ÉTAT. C'est le seul qui fonctionne dans un studio,
 *    parce que le formulaire y est VIDE de mise en page : il ne contient que
 *    des champs cachés, et les contrôles visibles sont ses VOISINS, pas ses
 *    descendants. Aucun événement de saisie ne l'atteint jamais.
 *
 * Cette disposition n'est pas un choix de style : plusieurs blocs d'un studio
 * (le logo, la bannière, une carte, les liens) ont leur propre `<form>` et leur
 * propre action. Un `<form>` dans un `<form>` est du HTML invalide — le
 * navigateur déplie en silence et l'hydratation de toute la page meurt. Le
 * formulaire de réglages est donc posé en frère de la mise en page, et le
 * bouton s'y rattache par l'attribut `form=`.
 *
 * ── LES DEUX GARDES ──
 *
 * 1. JAMAIS AU MONTAGE. Sans elle, le simple fait d'ouvrir le studio écrirait
 *    en base l'état RÉSOLU — donc tous les défauts calculés — sur une
 *    animation à laquelle le commerçant n'a pas touché. C'est exactement le
 *    défaut que VIT-19 a passé un lot à défaire.
 * 2. JAMAIS SANS LE DROIT D'ÉCRIRE. `actif` gèle l'envoi pour un rôle qui
 *    n'édite pas, plutôt que de laisser l'action refuser après coup.
 *
 * ── LE DÉLAI EST CE QUI REND LA CHOSE TENABLE ──
 *
 * Un curseur émet une valeur par pixel parcouru : sans débours, traverser une
 * échelle enverrait vingt-quatre écritures. `useActionForm` sait déjà rejouer
 * une soumission arrivée pendant qu'une autre vole — le délai ne fait que
 * réduire le nombre de départs.
 */
export function useEnregistrementDepuisEtat({
  valeur,
  formulaire,
  actif,
  delaiMs = 1200,
}: {
  /** L'état complet du studio. Toute nouvelle référence relance le minuteur. */
  valeur: unknown;
  formulaire: RefObject<HTMLFormElement | null>;
  actif: boolean;
  delaiMs?: number;
}) {
  const premierRendu = useRef(true);

  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }
    if (!actif) return;

    const minuteur = setTimeout(() => {
      formulaire.current?.requestSubmit();
    }, delaiMs);
    return () => clearTimeout(minuteur);
  }, [valeur, actif, delaiMs, formulaire]);
}
