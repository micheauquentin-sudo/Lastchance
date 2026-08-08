"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { annoncerToast } from "@/lib/toast-bus";
import { DELAI_AUTO_SAVE_MS } from "@/lib/use-auto-save";

/**
 * ENREGISTREMENT AUTOMATIQUE D'UN BLOC QUI N'EST PAS UN `<form>`.
 *
 * `useAutoSave` écoute un formulaire et fait partir sa soumission par
 * `requestSubmit`. Une partie du produit ne peut pas l'utiliser, et ce n'est
 * pas un oubli : la dotation du quiz, le formulaire d'une question et une case
 * de calendrier postent un OBJET TYPÉ à leur action (pas une `FormData`),
 * depuis un `<button type="button">`. Il n'y a aucun `<form>` à soumettre.
 *
 * ── PILOTÉ PAR LA SIGNATURE, PAS PAR LES ÉVÉNEMENTS DOM ──
 *
 * La première version écoutait `input`/`change`/`click` en NATIF sur le
 * conteneur. C'était une course perdue d'avance contre React : sous WebKit,
 * le `setEnAttente` déclenché par l'écouteur natif re-rendait le composant
 * PENDANT que l'événement `input` cheminait encore vers la racine React — le
 * champ contrôlé était reverti à l'état d'AVANT la frappe, et le `onChange`
 * React ne voyait jamais la modification. Conséquence mesurée à la sonde :
 * `fill("")` laissait le DOM ET l'état sur l'ancien texte — vider une case de
 * calendrier ne s'enregistrait jamais sur Safari (et par éclats sur
 * mobile-chrome).
 *
 * La bonne source de vérité n'a jamais été le DOM : c'est l'ÉTAT du bloc. La
 * `signature` — sérialisation de ce que le bloc posterait — change à chaque
 * rendu utile. Un effet l'observe : signature différente de la dernière
 * enregistrée ⇒ le minuteur s'arme. Aucune écoute native de saisie, aucune
 * course avec la synthèse d'événements React, et les gestes sans saisie
 * (réordonner un classement, retirer une proposition — des boutons) sont
 * couverts par construction : ils changent l'état, donc la signature.
 *
 * ── LES MÊMES TROIS RÈGLES QUE `useAutoSave` ──
 *
 * 1. **Jamais au montage.** La signature d'ouverture est mémorisée comme déjà
 *    enregistrée ; l'effet ne voit donc aucune différence au premier passage —
 *    sans quoi ouvrir un calendrier posterait ses vingt-quatre cases.
 * 2. **Un silence qui se voit.** `valide()` peut refuser le départ, mais
 *    `bloqueParValidation` remonte au composant, qui DOIT l'afficher.
 * 3. **Quitter le bloc vide la file.** `focusout` (seul écouteur natif
 *    conservé — il ne précède aucune synthèse React porteuse de valeur) fait
 *    partir tout de suite ce qui attendait. Rien en attente, rien ne part.
 *
 * ── LA FILE D'UNE PLACE ──
 *
 * La soumission arrivée pendant une autre est REJOUÉE à l'atterrissage de la
 * première, jamais abandonnée. `enregistrer` et `signature` sont relus au
 * moment du départ (référence rafraîchie en `useLayoutEffect` — synchrone
 * après commit, fraîche pour tout événement suivant, sur tous les moteurs).
 *
 * ── LE BOUTON PASSE PAR ICI ──
 *
 * `declencher` est le même chemin, sans le délai, et FORCE : un commerçant qui
 * clique « Enregistrer » attend un accusé de réception, même s'il n'a rien
 * changé. Les blocs dont le bouton fait AUTRE CHOSE (recharger la page,
 * refermer le formulaire) gardent le leur.
 */
export interface EtatAutoSaveManuel {
  /** Une modification attend son enregistrement (délai en cours). */
  enAttente: boolean;
  /** La dernière tentative a été refusée par la validation du bloc. */
  bloqueParValidation: boolean;
  /** Enregistre maintenant, sans attendre le délai (le bouton du bloc). */
  declencher: () => void;
}

export function useAutoSaveManuel(
  conteneurRef: RefObject<HTMLElement | null>,
  {
    signature,
    enregistrer,
    valide,
    actif = true,
    delai = DELAI_AUTO_SAVE_MS,
    message = "Enregistré.",
  }: {
    /** Sérialisation de ce que le bloc posterait — l'observer EST le déclencheur. */
    signature: string;
    /** Enregistre pour de bon ; rend `true` si l'action a réussi. */
    enregistrer: () => Promise<boolean>;
    /** Refuse le départ quand le bloc est incomplet (défaut : toujours prêt). */
    valide?: () => boolean;
    actif?: boolean;
    delai?: number;
    /** Message du bandeau global après un succès. */
    message?: string;
  },
): EtatAutoSaveManuel {
  const [enAttente, setEnAttente] = useState(false);
  const [bloqueParValidation, setBloqueParValidation] = useState(false);

  const dernier = useRef({ signature, enregistrer, valide, message });
  useLayoutEffect(() => {
    dernier.current = { signature, enregistrer, valide, message };
  });

  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVol = useRef(false);
  const rejouer = useRef(false);
  /** La dernière signature ENREGISTRÉE : au montage, celle d'ouverture. */
  const signatureEnregistree = useRef(signature);

  const annuler = useCallback(() => {
    if (minuteur.current !== null) {
      clearTimeout(minuteur.current);
      minuteur.current = null;
    }
  }, []);

  const soumettre = useCallback(
    (force = false) => {
      annuler();
      setEnAttente(false);
      // Rien n'a bougé depuis le dernier enregistrement. On ne poste pas, et
      // on n'annonce rien — sauf pour le BOUTON, qui force (voir en-tête).
      if (!force && dernier.current.signature === signatureEnregistree.current) {
        return;
      }
      const valider = dernier.current.valide;
      if (valider && !valider()) {
        setBloqueParValidation(true);
        return;
      }
      setBloqueParValidation(false);
      if (enVol.current) {
        rejouer.current = true;
        return;
      }
      enVol.current = true;
      const partie = dernier.current.signature;
      const messagePartie = dernier.current.message;
      void (async () => {
        let ok = false;
        try {
          ok = await dernier.current.enregistrer();
        } finally {
          enVol.current = false;
        }
        if (ok) {
          signatureEnregistree.current = partie;
          annoncerToast({ message: messagePartie, ton: "succes" });
        }
        if (rejouer.current) {
          rejouer.current = false;
          soumettre();
        }
      })();
    },
    [annuler],
  );

  /**
   * LE DÉCLENCHEUR : la signature a changé depuis le dernier enregistrement.
   * L'effet court après chaque rendu où `signature` bouge ; au montage,
   * `signatureEnregistree` vaut la signature d'ouverture — aucune différence,
   * donc rien ne part (règle 1).
   */
  useEffect(() => {
    if (!actif) return;
    if (signature === signatureEnregistree.current) return;
    annuler();
    setEnAttente(true);
    minuteur.current = setTimeout(() => soumettre(), delai);
    return annuler;
  }, [signature, actif, delai, annuler, soumettre]);

  /** `focusout` = flush de ce qui attend. Seul écouteur natif conservé. */
  useEffect(() => {
    const conteneur = conteneurRef.current;
    if (!actif || !conteneur) return;
    const surFocusOut = () => {
      if (minuteur.current === null) return;
      soumettre();
    };
    conteneur.addEventListener("focusout", surFocusOut);
    return () => {
      // Au démontage le minuteur est ANNULÉ, pas vidé : enregistrer pendant
      // un démontage part dans le vide et se déclencherait deux fois en
      // StrictMode. La fenêtre restante est couverte par `focusout` — on
      // quitte un champ avant de quitter une page.
      annuler();
      conteneur.removeEventListener("focusout", surFocusOut);
    };
  }, [conteneurRef, actif, annuler, soumettre]);

  const declencher = useCallback(() => {
    soumettre(true);
  }, [soumettre]);

  return { enAttente, bloqueParValidation, declencher };
}
