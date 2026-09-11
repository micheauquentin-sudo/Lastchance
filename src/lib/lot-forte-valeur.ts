/**
 * ── UN LOT DE FORTE VALEUR ADOSSÉ À LA SEULE `play_limit` ──────────
 *
 * Module PUR : ni `server-only`, ni accès base, aucun droit décidé ici. Il ne
 * connaît que deux formes — un lot et le `play_limit` de sa roue — et rend un
 * verdict. Il est écrit ici, une seule fois, parce que DEUX écrans du tableau
 * de bord posent la même question ; le recopier signerait pour deux
 * formulations qui divergent au premier ajustement du seuil, et donc pour deux
 * écrans qui se contredisent devant le commerçant.
 *
 * ── CE QUE CE MODULE REND MÉCANIQUE ───────────────────────────────
 *
 * `play_limit` (`once` / `daily` / `weekly`) est indexée sur `player_key`,
 * dérivée du cookie `lc-anonymous-player` que le joueur contrôle : l'effacer
 * rend une partie. Ce n'est PAS réparable en signant le cookie — on peut
 * toujours le supprimer (`src/lib/anonymous-player.ts`) — et compenser par un
 * seau bloquant sur une clé partagée est refusé depuis ADR-032 : un fail-closed
 * sur l'IP coupe le Wi-Fi de tout le commerce. C'est une limite STRUCTURELLE
 * assumée d'une identité par cookie côté public, pas une dette à corriger.
 *
 * La règle produit qui en découle existait déjà, mot pour mot : « ne pas
 * adosser un lot de valeur unitaire élevée à la seule garde `play_limit` ».
 * Elle ne vivait que dans un commentaire de `anonymous-player.ts` et une entrée
 * de `docs/bugs.md` — deux endroits qu'aucun commerçant n'ouvrira jamais. Ce
 * module est ce qui la fait exister ailleurs que dans une prose lue par les
 * seules personnes qui la connaissaient déjà.
 *
 * ── CE QU'IL NE FAIT PAS, ET C'EST DÉLIBÉRÉ ───────────────────────
 *
 * Il n'INTERDIT rien. Aucun `addIssue` ne s'appuie dessus, ni dans
 * `updateWheelSchema` ni ailleurs : des campagnes tournent aujourd'hui chez des
 * commerçants qui n'ont jamais vu cette règle, et un blocage rétroactif les
 * casserait sans préavis pour un risque que le stock des lots borne déjà. C'est
 * un AVERTISSEMENT — le commerçant reste seul juge de son économie.
 *
 * L'ancrage d'éligibilité que la règle appelle en creux existe par ailleurs :
 * le Ticket d'Or (`src/lib/ticket-or.ts`), remis au comptoir, tiré une fois,
 * `deja_tire` à toute reprise. Effacer un cookie n'y donne rien. C'est vers lui
 * qu'un lot à forte valeur doit aller — la phrase d'avertissement le dit.
 */

import type { PlayLimit } from "@/types/database";

/**
 * LE SEUIL — 2000 centimes, soit 20 €.
 *
 * AUCUN CHIFFRE N'EXISTAIT AVANT CELUI-CI : la règle produit parlait de « valeur
 * unitaire élevée » sans jamais dire où commençait « élevée », ce qui la rendait
 * inapplicable par un écran. C'est donc une valeur de DÉPART, décidée par le
 * propriétaire, et non une mesure : rien dans les données ne l'a produite, aucune
 * observation ne la justifie encore. Elle est explicitement AJUSTABLE — la
 * changer ici la change partout, ce qui est précisément pourquoi ce module
 * existe.
 *
 * Le seuil est INCLUSIF (`>=`) : un lot à exactement 20 € avertit. Un lot
 * calibré pile sur la limite est le cas le plus probable, pas le plus rare —
 * l'exclure viderait le seuil de la moitié de son effet.
 */
export const SEUIL_LOT_FORTE_VALEUR_CENTS = 2000;

/** Les deux colonnes de `prizes` dont dépend ce verdict, et elles seules. */
export interface LotValeurUnitaire {
  /**
   * `number | null` — la colonne est nullable (`prizes.value_cents`). Un lot
   * dont la valeur n'est pas renseignée n'est pas un lot « sans valeur » : c'est
   * un lot dont on NE SAIT RIEN. On n'avertit pas sur une inconnue, sous peine
   * de peindre en rouge la moitié des roues existantes, où la colonne n'a
   * jamais été remplie.
   */
  value_cents: number | null;
  is_losing: boolean;
}

/**
 * Un lot que l'identité publique par cookie n'est pas autorisée à distribuer.
 *
 * Une valeur absente ou non finie est traitée en défaut fermé : elle ne prouve
 * jamais que le lot est sous le seuil. Les lots perdants restent hors champ,
 * puisqu'ils ne créent aucune valeur à retirer.
 */
export function lotInterditAvecIdentiteFaible(lot: LotValeurUnitaire): boolean {
  if (lot.is_losing) return false;
  if (typeof lot.value_cents !== "number" || !Number.isFinite(lot.value_cents)) {
    return true;
  }
  return lot.value_cents >= SEUIL_LOT_FORTE_VALEUR_CENTS;
}

/** Message commerçant commun aux gardes de publication applicatives. */
export const LOT_IDENTITE_FAIBLE_INTERDIT =
  "Cette roue contient un lot gagnant de 20 € ou plus, ou dont la valeur n'est pas renseignée. " +
  "La participation publique repose sur une identité navigateur contournable : renseignez une valeur sous 20 € ou utilisez un parcours à identité vérifiée.";

/** Ce lot vaut-il assez cher pour que la question de sa garde se pose ? */
export function estLotForteValeur(lot: LotValeurUnitaire): boolean {
  // Un lot PERDANT ne fait rien gagner : sa valeur, si elle est renseignée, ne
  // décrit aucun préjudice possible. Rejouer cent fois pour retomber sur « perdu »
  // ne coûte rien au commerçant.
  if (lot.is_losing) return false;
  if (typeof lot.value_cents !== "number" || !Number.isFinite(lot.value_cents)) {
    return false;
  }
  return lot.value_cents >= SEUIL_LOT_FORTE_VALEUR_CENTS;
}

/**
 * Le verdict, en TROIS états et non deux.
 *
 * `sans_limite` et `limite_contournable` ont la même conséquence — un lot cher
 * qu'un joueur déterminé peut tenter plus souvent que prévu — mais PAS la même
 * cause, et surtout pas la même gravité. Sous `unlimited`, il n'y a aucune garde
 * à contourner : la roue est ouverte, personne n'a rien à effacer. Sous
 * `once` / `daily` / `weekly`, la garde est réelle et arrête tout le monde sauf
 * celui qui sait vider un cookie.
 *
 * Les FONDRE en un seul avertissement est exactement l'erreur que
 * `src/lib/validations/prizes.ts:209-244` documente sur ses deux interdits
 * `unlimited` : « conséquence identique, raisons différentes — les fondre est ce
 * qui avait fait oublier ces deux jeux-là ». Un commerçant à qui l'on dit « la
 * limite est contournable » alors qu'il n'en a posé AUCUNE cherchera longtemps
 * la limite en question.
 */
export type NiveauGardeLot =
  | "aucun"
  | "valeur_inconnue"
  | "limite_contournable"
  | "sans_limite";

export function niveauGardeLot(
  lot: LotValeurUnitaire,
  playLimit: PlayLimit,
): NiveauGardeLot {
  if (
    !lot.is_losing &&
    (typeof lot.value_cents !== "number" || !Number.isFinite(lot.value_cents))
  ) {
    return "valeur_inconnue";
  }
  if (!estLotForteValeur(lot)) return "aucun";
  return playLimit === "unlimited" ? "sans_limite" : "limite_contournable";
}

/**
 * LE PRÉDICAT — ce lot est-il adossé à une garde qui ne tient pas ?
 *
 * Vrai dans les deux cas de figure : pas de garde du tout, ou une garde qu'un
 * cookie effacé remet à zéro. C'est la question que pose un écran qui doit
 * décider s'il affiche quelque chose ; `niveauGardeLot` est celle qu'il pose
 * ensuite, pour décider QUOI.
 */
export function lotMalGarde(lot: LotValeurUnitaire, playLimit: PlayLimit): boolean {
  return niveauGardeLot(lot, playLimit) !== "aucun";
}

/**
 * Les phrases, une par niveau — `aucun` rend la chaîne vide, comme
 * `PHRASES_TIRAGE` : l'appelant teste le niveau, pas la phrase.
 *
 * Elles s'adressent au COMMERÇANT, dans son tableau de bord. Elles nomment donc
 * le geste qui répare (le Ticket d'Or, ou baisser la valeur du lot) plutôt que
 * la mécanique qui échoue — « `player_key` dérivée d'un cookie » ne lui dit rien
 * et ne lui laisse rien à faire.
 */
export const PHRASES_GARDE_LOT: Record<NiveauGardeLot, string> = {
  aucun: "",
  valeur_inconnue:
    "La valeur de ce lot gagnant n'est pas renseignée. Sans valeur connue, le serveur refuse de l'adosser à une participation publique fondée sur le navigateur. Renseignez une valeur sous 20 € ou utilisez un parcours à identité vérifiée.",
  limite_contournable:
    "Ce lot dépasse 20 € et n'est protégé que par la limite de participation. Cette limite repose sur le navigateur du joueur : en effaçant ses données, il peut rejouer. Pour un lot de cette valeur, préférez un Ticket d'Or remis au comptoir — il ne se joue qu'une fois, quoi que fasse le joueur.",
  sans_limite:
    "Ce lot dépasse 20 € et cette roue n'a AUCUNE limite de participation : le même joueur peut tenter sa chance autant de fois qu'il le souhaite. Posez une limite, baissez la valeur du lot, ou passez par un Ticket d'Or remis au comptoir.",
};
