import { gameIdle } from "@/lib/game-idle";
import type { GameType } from "@/types/database";

/**
 * CATALOGUE DES QUINZE MÉCANIQUES — module PUR.
 *
 * Il vivait dans `wheel-settings.tsx`, donc derrière un `"use client"` : la
 * page (Server Component) ne pouvait pas nommer la mécanique d'une roue sans
 * recopier ses libellés. Le dépôt en portait déjà trois copies divergentes
 * (`GAME_TYPES`, `GAME_LABELS` de campaign-template-preview, et le ternaire
 * scratch/Roue de campaign-wheels). Extraire ici ne crée pas une quatrième
 * source : c'est celle que l'étape « Le jeu » ET l'étape « La vérification »
 * lisent toutes les deux.
 *
 * `famille` porte le seul arbitrage qui change l'économie du jeu : les jeux
 * de DÉFI peuvent renvoyer un client bredouille, les autres non.
 */
export type FamilleMecanique = "hasard" | "defi";

export interface Mecanique {
  value: GameType;
  label: string;
  hint: string;
  famille: FamilleMecanique;
  /**
   * L'emoji que le joueur voit sur l'écran d'accueil de /play.
   *
   * LU DEPUIS `game-idle.ts`, jamais réécrit ici : cette table en portait sa
   * propre copie, et elle avait divergé — elle annonçait 🪙 au commerçant
   * pour la carte à gratter là où le joueur voyait 🎟️. Un emoji promis dans
   * le sélecteur doit être celui qui s'affiche après le scan.
   */
  emoji: string;
}

function mecanique(
  value: GameType,
  label: string,
  hint: string,
  famille: FamilleMecanique,
): Mecanique {
  return { value, label, hint, famille, emoji: gameIdle(value).emoji };
}

export const MECANIQUES: readonly Mecanique[] = [
  mecanique("wheel", "Roue", "Le client tourne la roue", "hasard"),
  mecanique("scratch", "Carte à gratter", "Le client gratte l'écran", "hasard"),
  mecanique("flip_card", "Carte retournée", "Le client retourne une carte", "hasard"),
  mecanique("cups", "Bonneteau (3 gobelets)", "Le client choisit un gobelet", "hasard"),
  mecanique("slot", "Machine à sous", "Rouleaux qui s'alignent", "hasard"),
  mecanique("memory", "Memory", "Retrouver la paire", "hasard"),
  mecanique("chest", "Coffre à choisir", "Le client ouvre un coffre", "hasard"),
  mecanique("dice", "Lancer de dé", "Le client lance le dé", "hasard"),
  mecanique("draw_card", "Tirage d'une carte", "Le client pioche une carte", "hasard"),
  // Jeux de DÉFI *skill-gated* : réussir l'épreuve conditionne le tirage.
  mecanique("rps", "Pierre-feuille-ciseaux", "Battre la machine — l'égalité compte comme un échec", "defi"),
  mecanique("reflex", "Jeu de réflexe", "Agir dans le temps imparti", "defi"),
  mecanique("gauge", "Jauge à arrêter", "Stopper la jauge sur la zone verte", "defi"),
  mecanique("puzzle", "Puzzle simple", "Remettre les fragments en ordre", "defi"),
  mecanique("mystery_word", "Mot mystère", "Deviner le mot caché", "defi"),
  mecanique("estimate", "Estimation d'un nombre", "Approcher le bon nombre", "defi"),
] as const;

export const MECANIQUES_HASARD = MECANIQUES.filter((m) => m.famille === "hasard");
export const MECANIQUES_DEFI = MECANIQUES.filter((m) => m.famille === "defi");

export function trouverMecanique(value: GameType | null | undefined): Mecanique {
  return MECANIQUES.find((m) => m.value === value) ?? MECANIQUES[0];
}

/** Le nom de la mécanique tel qu'on le dit au commerçant. */
export function libelleMecanique(value: GameType | null | undefined): string {
  return trouverMecanique(value).label;
}
