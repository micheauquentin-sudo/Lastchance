"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * ENREGISTREMENT AUTOMATIQUE D'UN FORMULAIRE — le debounce, et ses trois
 * garde-fous.
 *
 * S'utilise **À CÔTÉ** de `useActionForm`, jamais autour : le composant garde
 * son appel littéral `useActionForm(action, …)` (deux gardes mécaniques du
 * dépôt cherchent ce littéral dans les `.tsx` ; un enrobage les éteindrait sans
 * un mot), et ce hook se contente de faire partir la soumission à sa place.
 *
 *   const formRef = useRef<HTMLFormElement>(null);
 *   const { state, pending, onSubmit } = useActionForm(action, {
 *     toastOnSuccess: "Enregistré.",
 *   });
 *   const { enAttente, bloqueParValidation } = useAutoSave(formRef);
 *   …
 *   <form ref={formRef} onSubmit={onSubmit}>
 *
 * ── 1. JAMAIS AU MONTAGE ──
 *
 * Le minuteur n'est armé que depuis un événement `input`/`change`, c'est-à-dire
 * depuis un geste de l'utilisateur. Rien, jamais, ne part d'un effet de montage.
 *
 * Ce n'est pas une précaution théorique : le dépôt a déjà payé cet incident.
 * Dans `contest-settings.tsx`, un champ de date non contrôlé partait vide au
 * premier rendu, l'action traduisait ce vide en `null`, et la RPC écrivait sans
 * condition — « n'enregistrer que pour confirmer » EFFAÇAIT le verrouillage
 * d'un championnat et rouvrait toutes ses questions. Un enregistrement
 * automatique qui se déclencherait au montage rejouerait ce défaut sur chaque
 * formulaire du produit, en même temps.
 *
 * ── 2. UN SILENCE QUI SE VOIT ──
 *
 * Si le formulaire est invalide (`checkValidity()` faux), on ne soumet pas —
 * mais on ne se tait pas non plus. `bloqueParValidation` remonte au composant,
 * qui DOIT l'afficher (« Non enregistré : un champ requis est vide »). Un
 * enregistrement automatique silencieusement inopérant est pire que pas
 * d'enregistrement automatique du tout : sans bouton, l'utilisateur n'a plus
 * aucun autre signal, et il part en croyant son travail sauvé.
 *
 * ── 3. QUITTER UN CHAMP VIDE LA FILE ──
 *
 * Sortir d'un champ (`focusout`) ne fait pas attendre le délai restant : la
 * sauvegarde en attente part tout de suite. S'il n'y a rien en attente, il ne se
 * passe RIEN — quitter un formulaire qu'on n'a pas touché ne l'enregistre pas.
 *
 * On ne distingue PAS le passage à un autre champ du même formulaire d'une
 * sortie complète, et c'est délibéré. Le gain serait nul : le champ qu'on vient
 * de quitter porte de vraies modifications, qui seraient enregistrées de toute
 * façon au terme du délai. Le coût, lui, serait réel — répondre « suis-je encore
 * dans ce formulaire ? » demande une comparaison d'identité de nœuds que
 * `happy-dom` 20 ne tient pas pour un `<form>` inséré dans le document (il le
 * remplace par un proxy, et `contains` répond alors faux pour ses PROPRES
 * champs). On refuse d'inscrire dans le code de production un contournement
 * pour un défaut d'environnement de test, au profit d'une règle plus simple qui
 * enregistre plus tôt.
 *
 * ── Ce que ce hook ne fait PAS ──
 *
 * Au démontage, le minuteur en cours est ANNULÉ, pas vidé. Soumettre pendant un
 * démontage part dans le vide (le composant qui traiterait le résultat n'existe
 * plus) et se déclencherait deux fois en StrictMode. La fenêtre restante est
 * couverte par le point 3 : on quitte un champ avant de quitter une page.
 */

export interface EtatAutoSave {
  /** Une modification attend son enregistrement (délai en cours). */
  enAttente: boolean;
  /** La dernière tentative a été refusée par la validation du navigateur. */
  bloqueParValidation: boolean;
}

/**
 * Assez long pour ne pas poster à chaque touche, assez court pour que le
 * « Enregistré. » suive encore la frappe qui l'a causé.
 */
export const DELAI_AUTO_SAVE_MS = 800;

export function useAutoSave(
  formRef: RefObject<HTMLFormElement | null>,
  {
    delai = DELAI_AUTO_SAVE_MS,
    actif = true,
  }: { delai?: number; actif?: boolean } = {},
): EtatAutoSave {
  const [enAttente, setEnAttente] = useState(false);
  const [bloqueParValidation, setBloqueParValidation] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Remise à zéro quand `actif` bascule — pendant le RENDU, pas dans un effet.
   *
   * C'est le patron documenté par React pour ajuster un état sur un changement
   * de prop : le même travail fait dans un effet déclencherait un second rendu
   * en cascade (et l'ESLint du dépôt le refuse, à raison). Il évite surtout un
   * état fantôme : un formulaire désactivé pendant qu'une sauvegarde attendait
   * afficherait « en attente » à sa réactivation, alors qu'aucun minuteur ne
   * court plus — l'effet, lui, a annulé le sien en se démontant.
   */
  const [actifPrecedent, setActifPrecedent] = useState(actif);
  if (actifPrecedent !== actif) {
    setActifPrecedent(actif);
    setEnAttente(false);
    setBloqueParValidation(false);
  }

  useEffect(() => {
    // Inerte : aucun écouteur, aucun minuteur. L'état, lui, a déjà été remis à
    // zéro au rendu ci-dessus.
    if (!actif) return;
    const form = formRef.current;
    if (!form) return;

    const annuler = () => {
      if (minuteur.current !== null) {
        clearTimeout(minuteur.current);
        minuteur.current = null;
      }
    };

    const soumettre = () => {
      annuler();
      setEnAttente(false);
      if (!form.checkValidity()) {
        setBloqueParValidation(true);
        return;
      }
      setBloqueParValidation(false);
      // `requestSubmit` et non `submit` : il passe par le gestionnaire
      // `onSubmit` du formulaire — donc par `useActionForm` — au lieu de
      // court-circuiter React et de tenter une vraie navigation.
      form.requestSubmit();
    };

    const surSaisie = () => {
      annuler();
      setEnAttente(true);
      minuteur.current = setTimeout(soumettre, delai);
    };

    const surFocusOut = () => {
      // Rien en attente : quitter un formulaire intact ne l'enregistre pas.
      // C'est la moitié qui compte de cette règle — sans elle, un simple
      // passage du focus enregistrerait un formulaire que personne n'a touché.
      if (minuteur.current === null) return;
      soumettre();
    };

    form.addEventListener("input", surSaisie);
    form.addEventListener("change", surSaisie);
    form.addEventListener("focusout", surFocusOut);
    return () => {
      annuler();
      form.removeEventListener("input", surSaisie);
      form.removeEventListener("change", surSaisie);
      form.removeEventListener("focusout", surFocusOut);
    };
  }, [formRef, delai, actif]);

  return { enAttente, bloqueParValidation };
}
