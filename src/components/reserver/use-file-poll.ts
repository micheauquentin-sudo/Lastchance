"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * LE RAFRAÎCHISSEMENT DES DEUX ÉCRANS DE LA FILE D'ACCUEIL — joueur et comptoir.
 *
 * ── POURQUOI PAS `useEventPoll` ──
 *
 * `src/components/event/use-event-poll.ts` est le même geste, mais il porte en
 * plus le canal Supabase Broadcast, la révision de session et le bandeau de
 * désynchronisation : trois pièces qui n'existent que parce qu'une soirée live
 * doit basculer de question en question en moins d'une seconde pour toute une
 * salle. Une file d'accueil ne bascule que sur DEUX événements — mon rang
 * descend, on m'appelle — et le second est déjà annoncé de vive voix au
 * comptoir. Y brancher Realtime aurait ouvert un canal par téléphone en
 * boutique pour gagner deux secondes sur un écran qu'on regarde à la main.
 *
 * Ce qui EST repris, en revanche, et c'est le motif du dépôt : la cadence
 * ADAPTATIVE, la pause quand l'onglet est caché, le rattrapage immédiat au
 * retour de visibilité, le recul progressif sur échec, et l'absence totale de
 * requêtes concurrentes (`inFlight`). Même forme que la carte de check-in du
 * jackpot (`jackpot-tracker.tsx`), en hook parce qu'ici deux écrans s'en
 * servent.
 *
 * ── CE QU'IL NE FAIT PAS, ET C'EST LE CRITÈRE DUR DE RES-3 ──
 *
 * Il ne mesure aucune durée entre deux tics, il n'en dérive aucune moyenne, il
 * n'expose aucun compte à rebours. Le seul temps qu'il connaît est celui de sa
 * propre cadence. Un ETA ne peut donc pas naître ici par accident.
 */

/** Ce que rend `charger` : l'état frais, ou `null` si la lecture a échoué. */
export type ChargeurFile<T> = () => Promise<T | null>;

export function useFilePoll<T>(
  initial: T,
  charger: ChargeurFile<T>,
  /**
   * La cadence, décidée par l'appelant À PARTIR DE L'ÉTAT COURANT.
   *
   * C'est le seul endroit où les deux écrans diffèrent : le joueur en tête de
   * file veut savoir vite, celui qui est douzième n'a rien à guetter, et le
   * comptoir bat un rythme constant. Passer la fonction plutôt qu'un nombre
   * évite deux hooks pour une seule mécanique.
   */
  cadenceMs: (etat: T) => number,
  /**
   * Lire TOUT DE SUITE au montage, sans attendre le premier tic.
   *
   * Faux par défaut : l'état initial vient alors du rendu serveur de la page, il
   * a quelques millisecondes, et une lecture immédiate ne ferait que doubler la
   * requête que la page vient de payer. Vrai là où le composant est monté par
   * un geste client — la console d'une file qu'on vient de choisir — et n'a donc
   * aucun état de départ : sans cela, l'écran resterait vide le temps d'un tic.
   */
  immediatAuMontage = false,
): { etat: T; rafraichir: () => void } {
  const [etat, setEtat] = useState<T>(initial);
  const etatRef = useRef(initial);
  const monteRef = useRef(false);
  const enVolRef = useRef(false);
  const echecsRef = useRef(0);
  const minuteurRef = useRef<number | null>(null);
  const planifierRef = useRef<(immediat?: boolean) => void>(() => undefined);
  // Les deux fonctions de l'appelant sont relues à chaque tic depuis un `ref` :
  // sans cela, une identité de fonction qui change à chaque rendu relancerait
  // l'effet — donc redémarrerait le minuteur — à chaque rafraîchissement, et la
  // cadence effective deviendrait celle des rendus, pas celle qu'on a écrite.
  const chargerRef = useRef(charger);
  const cadenceRef = useRef(cadenceMs);
  // Mise à jour dans un EFFET et non pendant le rendu : écrire un `ref` en
  // plein rendu est refusé par `react-hooks/refs`, et à raison — le rendu peut
  // être rejoué ou abandonné. Cet effet-ci n'a pas de tableau de dépendances :
  // il doit s'exécuter après CHAQUE rendu, puisque c'est exactement l'identité
  // des deux fonctions qu'il rattrape.
  useEffect(() => {
    chargerRef.current = charger;
    cadenceRef.current = cadenceMs;
  });

  const lireUneFois = useCallback(async () => {
    if (enVolRef.current) return;
    enVolRef.current = true;
    try {
      const suivant = await chargerRef.current();
      if (suivant === null) {
        echecsRef.current = Math.min(echecsRef.current + 1, 4);
        return;
      }
      echecsRef.current = 0;
      etatRef.current = suivant;
      if (monteRef.current) setEtat(suivant);
    } catch {
      echecsRef.current = Math.min(echecsRef.current + 1, 4);
    } finally {
      enVolRef.current = false;
    }
  }, []);

  useEffect(() => {
    monteRef.current = true;
    let arrete = false;

    const planifier = (immediat = false) => {
      if (minuteurRef.current !== null) {
        window.clearTimeout(minuteurRef.current);
        minuteurRef.current = null;
      }
      if (arrete) return;

      const base = cadenceRef.current(etatRef.current);
      // Le recul sur échec est MULTIPLICATIF et borné à 30 s : un téléphone en
      // boutique perd le réseau, et marteler la pile pendant ce temps ne
      // ramène pas la 4G. Le retour de visibilité, lui, rattrape tout de suite.
      const delai = immediat
        ? 0
        : Math.min(30_000, base * (1 + echecsRef.current));

      minuteurRef.current = window.setTimeout(async () => {
        minuteurRef.current = null;
        if (!document.hidden) await lireUneFois();
        planifier();
      }, delai);
    };

    planifierRef.current = planifier;
    planifier(immediatAuMontage);

    const surVisibilite = () => {
      if (!document.hidden) void lireUneFois().finally(() => planifier());
    };
    document.addEventListener("visibilitychange", surVisibilite);

    return () => {
      arrete = true;
      monteRef.current = false;
      planifierRef.current = () => undefined;
      if (minuteurRef.current !== null) {
        window.clearTimeout(minuteurRef.current);
        minuteurRef.current = null;
      }
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [immediatAuMontage, lireUneFois]);

  const rafraichir = useCallback(() => {
    void lireUneFois().finally(() => planifierRef.current());
  }, [lireUneFois]);

  return { etat, rafraichir };
}
