/**
 * LA PHRASE QUI DIT AU JOUEUR CE QUE LA LIMITE LIMITE — et rien d'autre.
 *
 * ── POURQUOI CE MODULE EXISTE ──
 *
 * Quatre écrans de jeu (roue, grattage, socle des jeux de révélation, socle des
 * jeux de défi) affichaient la MÊME chaîne écrite en dur : « un jeu par
 * personne ». Elle était fausse deux fois.
 *
 *  1. Elle était INCONDITIONNELLE. Une roue réglée sur « illimité » la montrait
 *     quand même, alors que rien ne borne la partie. Une roue quotidienne la
 *     montrait aussi, alors que le joueur revient demain.
 *  2. Elle promettait « par personne ». La limite (`play_limit`) est appliquée
 *     par `perform_atomic_spin` sur `player_key`, dérivée du seul cookie
 *     `lc-anonymous-player` (`src/lib/anonymous-player.ts`). Ce qui est borné
 *     est donc un NAVIGATEUR, pas une personne : changer d'appareil ou effacer
 *     ses données rend une participation.
 *
 * Le mécanisme, lui, n'est PAS à corriger : borner par IP couperait le Wi-Fi
 * partagé d'un commerce entier (ADR-032, ADR-175, ADR-178). C'est la PHRASE qui
 * doit dire ce que le code fait — « navigateur », et seulement quand une limite
 * existe.
 *
 * Et « navigateur », PAS « appareil » : un cookie est de portée navigateur. Un
 * second navigateur, une fenêtre privée ou un second profil du MÊME téléphone
 * portent des identités différentes. Dire « par appareil » surpromettrait donc
 * exactement comme « par personne », en plus petit.
 *
 * ── MODULE PUR, SANS IMPORT DE VALEUR ──
 *
 * Il ne connaît qu'une `play_limit` et rend une chaîne. Servi dans des
 * composants client du parcours joueur (mobile, après un scan en boutique) : il
 * n'importe qu'un TYPE, donc rien à l'exécution.
 */

import type { PlayLimit } from "@/types/database";

/**
 * L'AVERTISSEMENT COMMERÇANT, mot pour mot.
 *
 * Copie VOLONTAIRE et VERROUILLÉE de la phrase centrale de
 * `PHRASES_GARDE_LOT.limite_contournable` (`src/lib/lot-forte-valeur.ts`), qui
 * la porte enchâssée dans un paragraphe plus long et ne peut donc pas l'exporter
 * telle quelle. `limite-participation.test.ts` échoue si les deux divergent :
 * le commerçant ne doit pas lire deux descriptions différentes de la même
 * limite selon l'écran où il se trouve.
 */
export const PHRASE_LIMITE_PAR_NAVIGATEUR =
  "Cette limite repose sur le navigateur du joueur : en effaçant ses données, il peut rejouer.";

/**
 * Ce que chaque réglage borne RÉELLEMENT, dit au joueur.
 *
 * `unlimited` rend `null` — pas une phrase vide à trous, pas « rejouable à
 * volonté » : AUCUNE promesse. Le commerçant n'a posé aucune borne, mais il
 * garde un stock de lots, une date de fin et un statut de campagne ; annoncer
 * « rejouable à volonté » remplacerait une surpromesse par une autre. La
 * mention disparaît, et la ligne se referme sur ce qui reste vrai.
 */
const PHRASES: Record<PlayLimit, string | null> = {
  once: "un seul jeu par navigateur",
  daily: "un jeu par jour et par navigateur",
  weekly: "un jeu par semaine et par navigateur",
  unlimited: null,
};

/**
 * La phrase de limite, ou `null` s'il n'y a rien à promettre.
 *
 * Une valeur inconnue (colonne absente d'une base en retard de migration,
 * réglage ajouté plus tard) retombe sur `null` : le repli ne promet JAMAIS une
 * limite qu'on n'a pas vérifiée.
 */
export function phraseLimiteParticipation(limit: PlayLimit | null | undefined): string | null {
  if (!limit) return null;
  return PHRASES[limit] ?? null;
}

/**
 * La ligne complète du pied d'écran de jeu : le préfixe propre à la mécanique
 * (« Résultat calculé côté serveur », « Réussissez le défi pour tenter un
 * lot »), puis la limite si elle existe. Sans limite, le préfixe est rendu
 * seul — pas de séparateur orphelin.
 */
export function mentionJeu(prefixe: string, limit: PlayLimit | null | undefined): string {
  const phrase = phraseLimiteParticipation(limit);
  return phrase ? `${prefixe} · ${phrase}` : prefixe;
}
