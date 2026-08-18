"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Les trois gestes qu'une boîte de dialogue doit au clavier.
 *
 * ── CE QU'IL MANQUAIT ───────────────────────────────────────────────
 *
 * Les deux modales du produit ouvraient leur contenu sans rien faire du
 * focus, ou presque :
 *
 *  • le Studio QR (`qr-designer.tsx`) laissait le focus sur la page derrière.
 *    Un utilisateur au clavier ouvrait la modale et continuait à tabuler dans
 *    le tableau qu'elle recouvrait — invisible, et sans jamais atteindre les
 *    contrôles qu'il venait d'ouvrir ;
 *  • la case révélée du calendrier de l'Avent (`calendar-tracker.tsx`)
 *    focalisait bien son bouton de fermeture, mais ne PIÉGEAIT pas Tab : trois
 *    tabulations plus loin on était ressorti dans la page, la modale toujours
 *    ouverte par-dessus.
 *
 * Aucune des deux ne rendait le focus au déclencheur à la fermeture : on
 * refermait le Studio et on repartait du haut du document.
 *
 * ── POURQUOI UN HOOK ET PAS DEUX CORRECTIFS ─────────────────────────
 *
 * Les trois gestes (focus initial, confinement, restitution) ne valent que
 * pris ENSEMBLE — le calendrier en avait un sur trois et son parcours clavier
 * était cassé quand même. Écrits une fois, ils s'appliquent à la troisième
 * modale sans que personne ait à se souvenir des deux autres.
 *
 * ── LE CONTENEUR PREND LE FOCUS, PAS LE PREMIER BOUTON ──────────────
 *
 * À défaut de `initial`, c'est le conteneur lui-même qui est focalisé — il
 * porte `role="dialog"` et son libellé, que le lecteur d'écran annonce alors
 * en entier. Focaliser le premier bouton ferait entrer directement dans un
 * contrôle, sans jamais dire où l'on vient d'arriver. L'appelant doit donc
 * poser `tabIndex={-1}` sur l'élément qui reçoit la ref.
 */

const FOCUSABLES = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusables(racine: HTMLElement): HTMLElement[] {
  return Array.from(racine.querySelectorAll<HTMLElement>(FOCUSABLES)).filter(
    (e) => e.offsetParent !== null || e.getClientRects().length > 0,
  );
}

export function useModalFocus<T extends HTMLElement = HTMLDivElement>(
  /** Élément à focaliser en priorité (le bouton de fermeture, par exemple). */
  initial?: RefObject<HTMLElement | null>,
): RefObject<T | null> {
  const conteneur = useRef<T | null>(null);

  useEffect(() => {
    const noeud = conteneur.current;
    if (!noeud) return;

    // Capturé AVANT le premier focus : c'est l'élément qui a ouvert la modale.
    const declencheur =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (initial?.current ?? noeud).focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const cibles = focusables(noeud);
      if (cibles.length === 0) {
        event.preventDefault();
        noeud.focus();
        return;
      }
      const premier = cibles[0];
      const dernier = cibles[cibles.length - 1];
      const actif = document.activeElement;
      // Le conteneur lui-même compte comme « avant le premier » : c'est là
      // qu'on se trouve juste après l'ouverture.
      if (event.shiftKey && (actif === premier || actif === noeud)) {
        event.preventDefault();
        dernier.focus();
      } else if (!event.shiftKey && actif === dernier) {
        event.preventDefault();
        premier.focus();
      }
    };

    // En phase de capture : le piège doit se refermer avant qu'un gestionnaire
    // de la page en dessous ne voie la touche.
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // La modale disparaît : sans ceci, le focus repart au début du document.
      declencheur?.focus();
    };
  }, [initial]);

  return conteneur;
}
