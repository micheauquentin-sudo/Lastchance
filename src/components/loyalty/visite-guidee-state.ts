"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A-T-ON DÉJÀ PRÉSENTÉ SA CARTE À CE CLIENT ? — sur SON téléphone, et nulle
 * part ailleurs.
 *
 * ── POURQUOI PAS UNE COLONNE ──
 *
 * « Cette personne a lu l'explication » n'est pas un fait du programme de
 * fidélité : c'est un fait de CE NAVIGATEUR. L'écrire en base aurait demandé
 * d'étendre `loyalty_members` — donc une migration, donc une écriture au
 * chargement d'une page qui n'en fait aucune aujourd'hui (`page.tsx` :
 * « Aucune écriture au chargement ») — pour une valeur qui ne sert qu'à
 * décider si une bande de trois lignes s'affiche. Le passeport se lit aussi
 * sans carte ouverte : il n'y a alors même pas de ligne membre où l'écrire.
 *
 * ── LA CLÉ PORTE LE programId ──
 *
 * Deux commerces partagent l'origine `app/passeport/…`. Une clé unique aurait
 * fait disparaître l'invitation chez le coiffeur parce qu'on avait lu celle du
 * boulanger — deux programmes, deux façons de gagner ses points (comptoir ou
 * code tournant), deux explications différentes.
 *
 * ── TOUT ACCÈS EST GARDÉ, Y COMPRIS LA LECTURE ──
 *
 * `localStorage` ne rend pas seulement `null` quand il est indisponible : il
 * LÈVE. Navigation privée, cookies tiers bloqués, « ne pas conserver les
 * données de site » — l'ACCESSEUR jette avant même la lecture. Non gardé, le
 * passeport entier — solde, cadeaux, carte à présenter — serait remplacé par
 * l'écran d'erreur parce qu'une bande d'aide n'a pas pu se souvenir d'elle.
 * Stockage muet ⇒ on retombe sur « jamais vue », c'est-à-dire le comportement
 * du tout premier passage : l'invitation revient, elle ne casse rien.
 *
 * ── `useSyncExternalStore`, ET NON UN `useState` + EFFET ──
 *
 * Même motif que `components/vitrine/favoris.ts`. L'instantané SERVEUR vaut
 * `true` (« déjà vue ») À DESSEIN : le HTML rendu ne porte donc JAMAIS
 * l'invitation, seulement le bouton discret. Rien ne bouge à l'hydratation
 * pour le client qui a déjà lu — le cas le plus fréquent — et rien n'apparaît
 * jamais du tout si le JavaScript ne s'exécute pas.
 */

const PREFIXE = "lastchance:passeport-visite-guidee:";

const cache = new Map<string, boolean>();
const abonnes = new Map<string, Set<() => void>>();

function cle(programId: string): string {
  return `${PREFIXE}${programId}`;
}

/** Lit le stockage. Toute indisponibilité vaut « jamais vue », sans bruit. */
function depuisLeStockage(programId: string): boolean {
  try {
    return window.localStorage.getItem(cle(programId)) === "1";
  } catch {
    return false;
  }
}

function instantane(programId: string): boolean {
  const connu = cache.get(programId);
  if (connu !== undefined) return connu;
  const lu = depuisLeStockage(programId);
  cache.set(programId, lu);
  return lu;
}

function prevenir(programId: string): void {
  for (const ecoute of abonnes.get(programId) ?? []) ecoute();
}

/**
 * Retient que la visite guidée a été proposée et traitée — ouverte, ou
 * écartée d'un geste.
 *
 * L'ÉCRAN SUIT MÊME SI L'ÉCRITURE ÉCHOUE : le cache est mis à jour et les
 * abonnés prévenus AVANT le `try`. Sur un téléphone dont le stockage est
 * refusé, la bande se referme quand même sous le doigt. Elle reviendra au
 * prochain chargement — c'est regrettable, mais une bande qui ne se ferme pas
 * quand on appuie sur sa croix se lit comme une page cassée, ce qui est pire
 * et se voit tout de suite.
 */
export function marquerVisiteGuideeVue(programId: string): void {
  cache.set(programId, true);
  prevenir(programId);
  try {
    window.localStorage.setItem(cle(programId), "1");
  } catch {
    // Stockage indisponible ou plein : l'écran est déjà à jour, et le client
    // n'a demandé qu'à refermer une bande d'aide.
  }
}

/**
 * L'abonnement — au niveau du module, jamais dans le composant :
 * `useSyncExternalStore` compare les fonctions par identité, et deux clôtures
 * recréées à chaque rendu le feraient se réabonner sans fin.
 *
 * L'événement `storage` ne se déclenche que dans les AUTRES onglets. Il sert
 * au client qui a ouvert son passeport deux fois — le QR scanné, puis l'icône
 * de l'écran d'accueil — et qui verrait sinon l'invitation persister d'un côté
 * après l'avoir lue de l'autre.
 */
function sAbonner(programId: string, onChange: () => void): () => void {
  let jeu = abonnes.get(programId);
  if (!jeu) {
    jeu = new Set();
    abonnes.set(programId, jeu);
  }
  jeu.add(onChange);

  const surStockage = (e: StorageEvent) => {
    // `e.key === null` : le stockage a été VIDÉ en entier (`clear()`), et
    // aucune clé n'est nommée. On invalide alors sans condition.
    if (e.key !== null && e.key !== cle(programId)) return;
    cache.delete(programId);
    prevenir(programId);
  };
  window.addEventListener("storage", surStockage);

  return () => {
    jeu.delete(onChange);
    if (jeu.size === 0) abonnes.delete(programId);
    window.removeEventListener("storage", surStockage);
  };
}

export interface EtatVisiteGuidee {
  /**
   * La visite guidée a-t-elle déjà été proposée à ce navigateur ? `true` côté
   * serveur, TOUJOURS — l'invitation ne naît qu'après hydratation.
   */
  vue: boolean;
  /** À appeler dès que le client ouvre la visite, ou écarte l'invitation. */
  marquerVue: () => void;
}

export function useVisiteGuideeVue(programId: string): EtatVisiteGuidee {
  const abonnement = useCallback(
    (onChange: () => void) => sAbonner(programId, onChange),
    [programId],
  );
  const lire = useCallback(() => instantane(programId), [programId]);
  const vue = useSyncExternalStore(abonnement, lire, () => true);
  const marquerVue = useCallback(
    () => marquerVisiteGuideeVue(programId),
    [programId],
  );

  return { vue, marquerVue };
}

/** Réservé aux tests : le cache de module survit sinon d'un cas à l'autre. */
export function _reinitialiserCacheVisiteGuidee(): void {
  cache.clear();
}
