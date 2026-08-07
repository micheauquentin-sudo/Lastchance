import { describe, expect, it } from "vitest";
import { porteeHabillage } from "@/components/dashboard/wheel-style-scope";
import type { GameType } from "@/types/database";

/**
 * Les quinze mécaniques, dans l'ordre du CHECK SQL `wheels_game_type_check`.
 * La liste est recopiée VOLONTAIREMENT : si une seizième arrive, ce test doit
 * échouer sur son compte plutôt que l'absorber en silence — la question
 * « cette mécanique dessine-t-elle une roue ? » se tranche à la main.
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

describe("porteeHabillage", () => {
  it("la roue seule reçoit les réglages de roue et l'aperçu de roue", () => {
    const p = porteeHabillage("wheel");
    expect(p.reglagesRoue).toBe(true);
    expect(p.apercuRoue).toBe(true);
    expect(p.note).toBeNull();
    expect(p.libelleBouton).toBe("Lancer la roue");
  });

  it("les quatorze autres mécaniques ne voient ni réglages de roue ni aperçu de roue", () => {
    const autres = TOUTES.filter((g) => g !== "wheel");
    expect(autres).toHaveLength(14);
    for (const g of autres) {
      const p = porteeHabillage(g);
      expect(p.reglagesRoue, g).toBe(false);
      expect(p.apercuRoue, g).toBe(false);
      expect(p.libelleBouton, g).not.toBe("Lancer la roue");
    }
  });

  it("la note explique la réduction, et ne parle jamais d'un réglage perdu", () => {
    const note = porteeHabillage("cups").note ?? "";
    expect(note).toContain("n'affiche pas de roue");
    // Le style COMPLET part quand même dans le champ caché : la note ne doit
    // pas laisser croire que masquer un contrôle efface sa valeur.
    expect(note).toContain("restent enregistrés");
  });

  it("sans mécanique connue, la portée reste complète (comportement historique)", () => {
    for (const valeur of [undefined, null]) {
      const p = porteeHabillage(valeur);
      expect(p.reglagesRoue).toBe(true);
      expect(p.apercuRoue).toBe(true);
      expect(p.note).toBeNull();
    }
  });
});
