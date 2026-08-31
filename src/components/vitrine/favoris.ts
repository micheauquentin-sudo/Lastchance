"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * LES FAVORIS DU VISITEUR — sur SON téléphone, et nulle part ailleurs.
 *
 * ── AUCUNE DONNÉE NE PART AU SERVEUR, ET C'EST UNE DÉCISION ──
 *
 * Un cœur sur un plat est une note personnelle prise pendant un repas. La faire
 * remonter aurait demandé un identifiant de visiteur sur une page PUBLIQUE et
 * ANONYME — donc un cookie, donc une bannière, donc une base de préférences
 * alimentaires nominatives chez chaque commerçant. Pour un geste dont toute la
 * valeur est de tenir dix minutes entre l'apéritif et la commande.
 *
 * `localStorage` donne exactement le bon périmètre : le même téléphone, la même
 * vitrine, et rien qui traverse.
 *
 * ── LA CLÉ PORTE LE SLUG ──
 *
 * Les vitrines de deux commerçants partagent le même ORIGINE (`app/v/…`) : une
 * clé unique aurait fait apparaître les favoris du restaurant d'hier sur la
 * carte du coiffeur d'aujourd'hui.
 *
 * ── TOUT ACCÈS EST GARDÉ, Y COMPRIS LA LECTURE ──
 *
 * `localStorage` ne renvoie pas seulement `null` quand il est indisponible : il
 * LÈVE. Navigation privée sur Safari, cookies tiers bloqués, réglage « ne pas
 * conserver les données de site », capture de vignette — dans tous ces cas
 * l'ACCESSEUR lui-même jette, avant même la lecture. Un `try` autour du seul
 * `JSON.parse` aurait laissé passer l'exception qui compte, et la vitrine
 * entière serait remplacée par l'écran d'erreur pour un cœur.
 *
 * ── `useSyncExternalStore`, ET NON UN `useState` + EFFET ──
 *
 * `localStorage` est un système EXTERNE à React. Le lire dans un état initial
 * donnerait un rendu client différent du HTML servi (erreur d'hydratation) ; le
 * lire dans un effet qui appelle `setState` déclenche le rendu en cascade que
 * `react-hooks/set-state-in-effect` interdit. Ce hook existe pour ce cas
 * précis : instantané SERVEUR vide, instantané CLIENT réel, et React fait
 * lui-même le second rendu après l'hydratation.
 *
 * Même motif que la lecture du fragment dans `catalogue-vitrine.tsx`.
 */

const PREFIXE = "lastchance:vitrine-favoris:";

/**
 * L'ensemble VIDE, partagé — et la raison d'être du cache ci-dessous.
 *
 * `useSyncExternalStore` compare les instantanés PAR IDENTITÉ : rendre un `new
 * Set()` à chaque appel ferait boucler React à l'infini avec « getSnapshot
 * should be cached ». Il n'existe donc qu'un seul ensemble vide, et un seul
 * ensemble par slug, remplacé uniquement quand le contenu change.
 */
const VIDE: ReadonlySet<string> = new Set<string>();

const cache = new Map<string, ReadonlySet<string>>();
const abonnes = new Map<string, Set<() => void>>();

function cle(slug: string): string {
  return `${PREFIXE}${slug}`;
}

/** Lit le stockage. Toute indisponibilité rend l'ensemble vide, sans bruit. */
function depuisLeStockage(slug: string): ReadonlySet<string> {
  try {
    const brut = window.localStorage.getItem(cle(slug));
    if (!brut) return VIDE;
    const parse: unknown = JSON.parse(brut);
    // Une valeur écrite par une version antérieure, ou trafiquée à la main
    // depuis la console : on ne garde que des chaînes, et un document d'une
    // autre forme rend l'ensemble vide plutôt que de faire tomber la page.
    if (!Array.isArray(parse)) return VIDE;
    const ids = parse.filter((v): v is string => typeof v === "string");
    return ids.length > 0 ? new Set(ids) : VIDE;
  } catch {
    return VIDE;
  }
}

function instantane(slug: string): ReadonlySet<string> {
  const connu = cache.get(slug);
  if (connu) return connu;
  const lu = depuisLeStockage(slug);
  cache.set(slug, lu);
  return lu;
}

function prevenir(slug: string): void {
  for (const ecoute of abonnes.get(slug) ?? []) ecoute();
}

/**
 * Bascule un favori. L'ÉCRAN SUIT MÊME SI L'ÉCRITURE ÉCHOUE.
 *
 * Le cache est mis à jour et les abonnés prévenus AVANT le `try` d'écriture :
 * sur un téléphone dont le quota est plein ou le stockage refusé, le cœur doit
 * quand même se remplir. Le visiteur perdrait sa liste en rechargeant — c'est
 * regrettable — mais un cœur qui ne réagit pas au doigt se lit comme une page
 * cassée, ce qui est pire et se voit tout de suite.
 */
export function basculerFavori(slug: string, id: string): void {
  const actuel = instantane(slug);
  const suivant = new Set(actuel);
  if (suivant.has(id)) suivant.delete(id);
  else suivant.add(id);

  cache.set(slug, suivant.size > 0 ? suivant : VIDE);
  prevenir(slug);

  try {
    if (suivant.size === 0) window.localStorage.removeItem(cle(slug));
    else window.localStorage.setItem(cle(slug), JSON.stringify([...suivant]));
  } catch {
    // Stockage indisponible ou plein : l'écran est déjà à jour, il n'y a rien
    // à rattraper et rien à dire au visiteur, qui n'a demandé qu'un cœur.
  }
}

/**
 * L'abonnement — au niveau du module, jamais dans le composant :
 * `useSyncExternalStore` compare les fonctions par identité, et deux clôtures
 * recréées à chaque rendu le feraient se réabonner sans fin.
 *
 * L'événement `storage` ne se déclenche que dans les AUTRES onglets. Il ne sert
 * donc pas au cœur qu'on vient de toucher (déjà traité ci-dessus) mais au cas
 * réel du visiteur qui a ouvert la carte deux fois — le QR scanné, puis un lien
 * partagé — et qui verrait sinon deux listes divergentes sur le même téléphone.
 */
function sAbonner(slug: string, onChange: () => void): () => void {
  let jeu = abonnes.get(slug);
  if (!jeu) {
    jeu = new Set();
    abonnes.set(slug, jeu);
  }
  jeu.add(onChange);

  const surStockage = (e: StorageEvent) => {
    // `e.key === null` : le stockage a été VIDÉ en entier (`clear()`), et
    // aucune clé n'est nommée. On invalide alors sans condition.
    if (e.key !== null && e.key !== cle(slug)) return;
    cache.delete(slug);
    prevenir(slug);
  };
  window.addEventListener("storage", surStockage);

  return () => {
    jeu.delete(onChange);
    if (jeu.size === 0) abonnes.delete(slug);
    window.removeEventListener("storage", surStockage);
  };
}

export interface Favoris {
  /** Les identifiants de fiches marquées. Vide côté serveur, toujours. */
  ids: ReadonlySet<string>;
  /** Le compte, pour la barre basse. */
  nombre: number;
  basculer: (id: string) => void;
}

export function useFavoris(slug: string): Favoris {
  const abonnement = useCallback(
    (onChange: () => void) => sAbonner(slug, onChange),
    [slug],
  );
  const lire = useCallback(() => instantane(slug), [slug]);
  const ids = useSyncExternalStore(abonnement, lire, () => VIDE);
  const basculer = useCallback((id: string) => basculerFavori(slug, id), [slug]);

  return { ids, nombre: ids.size, basculer };
}
