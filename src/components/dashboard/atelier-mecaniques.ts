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
  /** L'emoji que le joueur voit sur l'écran d'accueil de /play. */
  emoji: string;
}

export const MECANIQUES: readonly Mecanique[] = [
  { value: "wheel", label: "Roue", hint: "Le client tourne la roue", famille: "hasard", emoji: "🎡" },
  { value: "scratch", label: "Carte à gratter", hint: "Le client gratte l'écran", famille: "hasard", emoji: "🪙" },
  { value: "flip_card", label: "Carte retournée", hint: "Le client retourne une carte", famille: "hasard", emoji: "🃏" },
  { value: "cups", label: "Bonneteau (3 gobelets)", hint: "Le client choisit un gobelet", famille: "hasard", emoji: "🥤" },
  { value: "slot", label: "Machine à sous", hint: "Rouleaux qui s'alignent", famille: "hasard", emoji: "🎰" },
  { value: "memory", label: "Memory", hint: "Retrouver la paire", famille: "hasard", emoji: "🧠" },
  { value: "chest", label: "Coffre à choisir", hint: "Le client ouvre un coffre", famille: "hasard", emoji: "🎁" },
  { value: "dice", label: "Lancer de dé", hint: "Le client lance le dé", famille: "hasard", emoji: "🎲" },
  { value: "draw_card", label: "Tirage d'une carte", hint: "Le client pioche une carte", famille: "hasard", emoji: "🃏" },
  // Jeux de DÉFI *skill-gated* : réussir l'épreuve conditionne le tirage.
  { value: "rps", label: "Pierre-feuille-ciseaux", hint: "Battre la machine — l'égalité compte comme un échec", famille: "defi", emoji: "✊" },
  { value: "reflex", label: "Jeu de réflexe", hint: "Agir dans le temps imparti", famille: "defi", emoji: "⚡" },
  { value: "gauge", label: "Jauge à arrêter", hint: "Stopper la jauge sur la zone verte", famille: "defi", emoji: "🎯" },
  { value: "puzzle", label: "Puzzle simple", hint: "Remettre les fragments en ordre", famille: "defi", emoji: "🧩" },
  { value: "mystery_word", label: "Mot mystère", hint: "Deviner le mot caché", famille: "defi", emoji: "🔤" },
  { value: "estimate", label: "Estimation d'un nombre", hint: "Approcher le bon nombre", famille: "defi", emoji: "🔢" },
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
