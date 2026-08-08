"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
 * Ce hook rend le même service à ces blocs-là, avec les mêmes garde-fous, et
 * sans réécrire la règle dans trois composants.
 *
 * ── CE QUI ARME, ET POURQUOI LE CLIC EN FAIT PARTIE ──
 *
 * On écoute le CONTENEUR, comme `useAutoSave` écoute le formulaire :
 * `input`, `change` — et `click`, qui n'a pas d'équivalent là-bas. La raison
 * est concrète : dans le formulaire d'une question, réordonner un classement,
 * ajouter ou retirer une proposition ne produit AUCUN événement de saisie, ce
 * sont des boutons. Sans le clic, ces modifications-là cesseraient d'être
 * enregistrées, en silence — exactement le défaut que l'enregistrement
 * automatique est censé fermer.
 *
 * Le clic arme donc large, et c'est la SIGNATURE qui trie : au moment de
 * partir, on compare ce que le bloc posterait à ce qui a été posté la dernière
 * fois. Identique, on ne part pas — ni requête, ni « Enregistré. » pour un clic
 * qui n'a rien changé.
 *
 * ── LES MÊMES TROIS RÈGLES QUE `useAutoSave` ──
 *
 * 1. **Jamais au montage.** Rien ne part d'un effet : seul un geste de
 *    l'utilisateur arme le minuteur. La signature d'ouverture est mémorisée
 *    comme déjà enregistrée — sans quoi ouvrir un calendrier posterait ses
 *    vingt-quatre cases.
 * 2. **Un silence qui se voit.** `valide()` peut refuser le départ, mais
 *    `bloqueParValidation` remonte au composant, qui DOIT l'afficher. Un
 *    enregistrement automatique silencieusement inopérant est pire que pas
 *    d'enregistrement du tout : sans bouton, l'utilisateur n'a plus aucun autre
 *    signal et part en croyant son travail sauvé.
 * 3. **Quitter le bloc vide la file.** `focusout` fait partir tout de suite ce
 *    qui attendait. S'il n'y a rien en attente, il ne se passe RIEN.
 *
 * ── LA FILE D'UNE PLACE ──
 *
 * `useActionForm` a dû être corrigé pour ne plus JETER la soumission arrivée
 * pendant une autre : au debounce, la dernière frappe partait aux oubliettes
 * derrière un « Enregistré. » menteur. Le piège est déjà écrit dans ces trois
 * composants sous la forme `if (pending) return;`. Même réponse ici : la
 * soumission concurrente est REJOUÉE à l'atterrissage de la première, jamais
 * abandonnée. Une place suffit — ce qui compte est de finir sur la dernière
 * valeur, et `enregistrer` est relu au moment où il part.
 *
 * ── LE BOUTON PASSE PAR ICI ──
 *
 * `declencher` est le même chemin, sans le délai. Les blocs dont le bouton fait
 * exactement ce que fait l'enregistrement automatique le branchent dessus : un
 * seul verrou, une seule file, aucun vol parallèle entre un clic et un minuteur
 * qui arrive. Ceux dont le bouton fait AUTRE CHOSE (recharger la page, refermer
 * le formulaire) gardent le leur.
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
    /** Sérialisation de ce que le bloc posterait — sert à ne rien poster deux fois. */
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

  /**
   * Les fonctions et les valeurs du composant sont recréées à chaque rendu ;
   * les mettre en dépendance d'un effet réinstallerait les écouteurs à chaque
   * frappe. On garde donc la DERNIÈRE version dans une référence, lue au moment
   * où l'on part.
   */
  const dernier = useRef({ signature, enregistrer, valide, message });
  // `useLayoutEffect`, PAS `useEffect` : l'effet passif court APRÈS le paint,
  // et WebKit laisse un événement (le clic du bouton) s'intercaler AVANT.
  // Le bouton lisait alors la fermeture du RENDU PRÉCÉDENT : il postait
  // l'ancienne valeur et annulait le minuteur qui aurait poste la bonne —
  // vider une case de calendrier ne s'enregistrait jamais sur Safari
  // (prouvé 3/3 par le rejeu E2E mobile-safari, vert après ce correctif).
  // useLayoutEffect est synchrone après commit : la référence est fraîche
  // pour tout événement suivant, sur tous les moteurs.
  useLayoutEffect(() => {
    dernier.current = { signature, enregistrer, valide, message };
  });

  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVol = useRef(false);
  const rejouer = useRef(false);
  /** La dernière signature ENREGISTRÉE : au montage, celle d'ouverture. */
  const signatureEnregistree = useRef(signature);
  /** Le déclencheur courant, posé par l'effet ci-dessous pour le bouton. */
  const soumettreRef = useRef<(force?: boolean) => void>(() => {});

  useEffect(() => {
    const conteneur = conteneurRef.current;
    if (!actif || !conteneur) {
      soumettreRef.current = () => {};
      return;
    }

    const annuler = () => {
      if (minuteur.current !== null) {
        clearTimeout(minuteur.current);
        minuteur.current = null;
      }
    };

    const soumettre = (force = false) => {
      annuler();
      setEnAttente(false);
      // Rien n'a bougé depuis le dernier enregistrement : un clic sur une bulle
      // d'aide, une sortie de champ. On ne poste pas, et on n'annonce rien.
      //
      // Le BOUTON, lui, force : un commerçant qui clique « Enregistrer »
      // attend un accusé de réception, même s'il n'a rien changé. C'est le
      // comportement qu'avait ce bouton avant ce chantier, et il le garde.
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
    };
    soumettreRef.current = soumettre;

    const surGeste = () => {
      annuler();
      setEnAttente(true);
      minuteur.current = setTimeout(() => soumettre(), delai);
    };

    const surFocusOut = () => {
      // Rien en attente : quitter un bloc intact ne l'enregistre pas.
      if (minuteur.current === null) return;
      soumettre();
    };

    conteneur.addEventListener("input", surGeste);
    conteneur.addEventListener("change", surGeste);
    conteneur.addEventListener("click", surGeste);
    conteneur.addEventListener("focusout", surFocusOut);
    return () => {
      // Au démontage le minuteur est ANNULÉ, pas vidé : enregistrer pendant un
      // démontage part dans le vide et se déclencherait deux fois en
      // StrictMode. La fenêtre restante est couverte par `focusout` — on quitte
      // un champ avant de quitter une page.
      annuler();
      conteneur.removeEventListener("input", surGeste);
      conteneur.removeEventListener("change", surGeste);
      conteneur.removeEventListener("click", surGeste);
      conteneur.removeEventListener("focusout", surFocusOut);
    };
  }, [conteneurRef, actif, delai]);

  const declencher = useCallback(() => {
    soumettreRef.current(true);
  }, []);

  return { enAttente, bloqueParValidation, declencher };
}
