import type { GameType } from "@/types/database";

/**
 * L'ÉCRAN D'ACCUEIL DE CHAQUE MÉCANIQUE — module PUR, source unique.
 *
 * Ce que le joueur voit avant de jouer — l'emoji du visuel, le verbe du
 * bouton, l'accroche par défaut — était écrit à QUATRE endroits :
 *
 *   1. les treize wrappers `games/*-experience.tsx` (`idle={{ emoji, buttonLabel }}`) ;
 *   2. `scratch-experience.tsx`, en dur dans son propre écran d'accueil ;
 *   3. `play-experience.tsx`, en dur pour la roue ;
 *   4. `wheel-style-scope.ts`, qui redonnait un `libelleBouton` à l'aperçu
 *      de l'éditeur — et se contentait d'un « Jouer » générique pour les
 *      quatorze mécaniques non-roue, donc FAUX pour les quatorze.
 *
 * Le catalogue `atelier-mecaniques.ts` en portait une cinquième copie
 * partielle (le seul champ `emoji`), qui avait déjà divergé : il annonçait
 * 🪙 pour la carte à gratter là où le joueur voyait 🎟️.
 *
 * DIVERGENCE TRANCHÉE — 🎟️. La carte à gratter est un TICKET, et c'est déjà
 * ce que le joueur lit à deux endroits (l'accueil de `scratch-experience` et
 * la couche à gratter elle-même, « 🎟️ Grattez ici »). Le 🪙 n'existait que
 * dans le sélecteur du commerçant : c'est lui qui s'aligne, et
 * `atelier-mecaniques.ts` lit désormais cette table plutôt que d'en garder
 * une valeur à soi.
 *
 * ── Ce que la table NE décide PAS ──
 *
 * L'accroche du COMMERÇANT (`style.title`) prime toujours : `accroche` n'est
 * que le défaut quand il n'a rien écrit. La table ne connaît ni couleurs ni
 * police — tout l'habillage vient de `WheelStyle`.
 */
export interface GameIdle {
  /** Emoji du visuel d'accueil (carte, gobelet, coffre…). */
  emoji: string;
  /**
   * Verbe du bouton de lancement — aussi son `aria-label`.
   *
   * CES LIBELLÉS SONT DES SÉLECTEURS E2E (`e2e/player-win.spec.ts`,
   * `e2e/skill-games.spec.ts` visent `getByRole("button", { name })`).
   * Les changer casse le filet ; les changer sans mettre les specs à jour
   * le casse en silence sur la mécanique concernée seulement.
   */
  buttonLabel: string;
  /** Accroche par défaut, écrasée par `style.title` dès qu'il existe. */
  accroche: string;
  /**
   * LA RÈGLE DU JEU — une phrase, le geste et l'enjeu, à la deuxième personne.
   *
   * Elle existe parce que le joueur arrive par un QR code, debout, sur son
   * téléphone : il n'a lu aucune notice, et l'accroche du commerçant peut
   * dire tout autre chose (« Deux euros le lancer ! »). Seule cette phrase-ci
   * lui apprend ce qu'on attend de son doigt.
   *
   * Elle n'est PAS le `buttonLabel` : celui-ci est un verbe et un sélecteur
   * E2E, pas une explication. Les deux se rendent dans des éléments distincts.
   * Aucun emoji n'entre ici — un U+FE0F glissé dans un nom accessible a déjà
   * cassé un test de ce dépôt.
   *
   * Complétude gardée par `game-idle.test.ts` : la seizième mécanique ne
   * pourra pas arriver muette.
   */
  regle: string;
}

/**
 * Les quinze mécaniques du CHECK SQL `wheels_game_type_check`. `Record`
 * complet et non `Partial` : une seizième mécanique fait échouer le
 * typecheck ici plutôt que d'atterrir sur un écran d'accueil vide.
 */
export const GAME_IDLE: Record<GameType, GameIdle> = {
  wheel: {
    emoji: "🎡",
    buttonLabel: "Lancer la roue",
    accroche: "Tournez la roue, tentez votre chance !",
    regle: "Touchez le bouton pour lancer la roue : elle s'arrête toute seule sur le lot qui vous revient.",
  },
  scratch: {
    emoji: "🎟️",
    buttonLabel: "Gratter la carte",
    accroche: "Grattez la carte, tentez votre chance !",
    regle: "Grattez la carte avec le doigt jusqu'à faire apparaître ce que vous avez gagné en dessous.",
  },
  flip_card: {
    emoji: "🃏",
    buttonLabel: "Retourner la carte",
    accroche: "Retournez la carte, tentez votre chance !",
    regle: "Touchez la carte pour la retourner : votre résultat est écrit au dos.",
  },
  cups: {
    emoji: "🥤",
    buttonLabel: "Choisir un gobelet",
    accroche: "Trouvez le bon gobelet !",
    regle: "Touchez le gobelet de votre choix : il se soulève et vous annonce votre résultat.",
  },
  slot: {
    emoji: "🎰",
    buttonLabel: "Lancer la machine",
    accroche: "Alignez les rouleaux, tentez votre chance !",
    regle: "Touchez pour lancer les rouleaux, puis regardez-les s'arrêter sur votre résultat.",
  },
  memory: {
    emoji: "🧠",
    buttonLabel: "Jouer au memory",
    accroche: "Retrouvez la paire, tentez votre chance !",
    regle: "Retournez les cartes deux par deux jusqu'à trouver la paire : c'est elle qui révèle votre résultat.",
  },
  chest: {
    emoji: "🎁",
    buttonLabel: "Ouvrir un coffre",
    accroche: "Choisissez votre coffre !",
    regle: "Touchez le coffre de votre choix : il s'ouvre et vous annonce votre résultat.",
  },
  dice: {
    emoji: "🎲",
    buttonLabel: "Lancer le dé",
    accroche: "Lancez le dé, tentez votre chance !",
    regle: "Touchez pour lancer le dé, puis laissez-le rouler jusqu'à votre résultat.",
  },
  draw_card: {
    emoji: "🃏",
    buttonLabel: "Piocher une carte",
    accroche: "Piochez une carte, tentez votre chance !",
    regle: "Touchez le paquet pour piocher une carte : c'est elle qui porte votre résultat.",
  },
  // Jeux de DÉFI : réussir l'épreuve conditionne le tirage — l'accroche le dit.
  rps: {
    emoji: "✊",
    buttonLabel: "Jouer à pierre-feuille-ciseaux",
    accroche: "Battez la machine !",
    regle: "Choisissez pierre, feuille ou ciseaux, en un seul coup : battez la machine et vous tentez un lot.",
  },
  reflex: {
    emoji: "⚡",
    buttonLabel: "Tester tes réflexes",
    accroche: "Testez vos réflexes !",
    regle: "Touchez l'écran dès qu'il s'allume, sans partir avant le signal — réussissez et vous tentez un lot.",
  },
  gauge: {
    emoji: "🎯",
    buttonLabel: "Arrêter la jauge",
    accroche: "Arrêtez la jauge sur la zone verte !",
    regle: "Le curseur balaie la barre : touchez « Stop » pile sur la zone verte et vous tentez un lot.",
  },
  puzzle: {
    emoji: "🧩",
    buttonLabel: "Reconstituer le puzzle",
    accroche: "Reconstituez le puzzle !",
    regle: "Remettez l'image dans l'ordre en échangeant les fragments deux par deux, puis validez pour tenter votre lot.",
  },
  mystery_word: {
    emoji: "🔤",
    buttonLabel: "Deviner le mot",
    accroche: "Devinez le mot mystère !",
    regle: "Devinez le mot caché grâce à l'indice : une seule proposition, et vous tentez un lot.",
  },
  estimate: {
    emoji: "🔢",
    buttonLabel: "Faire une estimation",
    accroche: "Approchez le bon nombre !",
    regle: "Donnez votre estimation en un seul nombre : approchez la bonne valeur et vous tentez un lot.",
  },
};

/**
 * Écran d'accueil d'une mécanique. `null`/`undefined`/valeur inconnue
 * retombent sur la roue — même convention que `trouverMecanique`.
 */
export function gameIdle(gameType?: GameType | null): GameIdle {
  return (gameType && GAME_IDLE[gameType]) || GAME_IDLE.wheel;
}
