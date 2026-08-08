import { describe, expect, it } from "vitest";
import { GAME_IDLE, gameIdle } from "./game-idle";
import { MECANIQUES } from "@/components/dashboard/atelier-mecaniques";
import type { GameType } from "@/types/database";

/**
 * Les quinze mécaniques, dans l'ordre du CHECK SQL `wheels_game_type_check`.
 * Recopiée VOLONTAIREMENT : une seizième doit faire échouer ce fichier sur
 * son compte plutôt que de recevoir en silence un écran d'accueil vide.
 */
const TOUTES: GameType[] = [
  "wheel",
  "scratch",
  "flip_card",
  "cups",
  "slot",
  "memory",
  "chest",
  "dice",
  "draw_card",
  "rps",
  "reflex",
  "gauge",
  "puzzle",
  "mystery_word",
  "estimate",
];

describe("GAME_IDLE — table complète", () => {
  it("couvre les quinze mécaniques, sans trou ni champ vide", () => {
    expect(Object.keys(GAME_IDLE)).toHaveLength(15);
    for (const g of TOUTES) {
      const idle = GAME_IDLE[g];
      expect(idle, g).toBeDefined();
      expect(idle.emoji.trim().length, g).toBeGreaterThan(0);
      expect(idle.buttonLabel.trim().length, g).toBeGreaterThan(0);
      expect(idle.accroche.trim().length, g).toBeGreaterThan(0);
    }
  });

  /**
   * CES LIBELLÉS SONT DES SÉLECTEURS E2E. `e2e/player-win.spec.ts` et
   * `e2e/skill-games.spec.ts` visent `getByRole("button", { name })` avec
   * exactement ces chaînes ; les changer ici casse le filet sur la mécanique
   * concernée SEULEMENT, donc en silence pour les quatorze autres. Ce test
   * fige les six réellement exercés par les specs.
   */
  it("fige les verbes de bouton exercés par les specs Playwright", () => {
    expect(GAME_IDLE.wheel.buttonLabel).toBe("Lancer la roue");
    expect(GAME_IDLE.scratch.buttonLabel).toBe("Gratter la carte");
    expect(GAME_IDLE.flip_card.buttonLabel).toBe("Retourner la carte");
    expect(GAME_IDLE.cups.buttonLabel).toBe("Choisir un gobelet");
    expect(GAME_IDLE.rps.buttonLabel).toBe("Jouer à pierre-feuille-ciseaux");
    expect(GAME_IDLE.mystery_word.buttonLabel).toBe("Deviner le mot");
  });

  it("aucun verbe n'est partagé par deux mécaniques", () => {
    const verbes = TOUTES.map((g) => GAME_IDLE[g].buttonLabel);
    expect(new Set(verbes).size).toBe(verbes.length);
  });

  /**
   * LA DIVERGENCE QUI A MOTIVÉ CETTE TABLE : le catalogue du commerçant
   * annonçait 🪙 pour la carte à gratter, le joueur voyait 🎟️. Le catalogue
   * lit désormais cette table — ce test échouerait s'il reprenait une copie.
   */
  it("le catalogue commerçant montre l'emoji que le joueur verra", () => {
    for (const m of MECANIQUES) {
      expect(m.emoji, m.value).toBe(GAME_IDLE[m.value].emoji);
    }
    expect(GAME_IDLE.scratch.emoji).toBe("🎟️");
  });
});

describe("gameIdle — résolution tolérante", () => {
  it("retombe sur la roue pour null, undefined ou une valeur inconnue", () => {
    expect(gameIdle(null)).toEqual(GAME_IDLE.wheel);
    expect(gameIdle(undefined)).toEqual(GAME_IDLE.wheel);
    expect(gameIdle("inexistant" as GameType)).toEqual(GAME_IDLE.wheel);
  });

  it("rend l'écran de la mécanique demandée", () => {
    expect(gameIdle("dice").emoji).toBe("🎲");
    expect(gameIdle("slot").buttonLabel).toBe("Lancer la machine");
  });
});
