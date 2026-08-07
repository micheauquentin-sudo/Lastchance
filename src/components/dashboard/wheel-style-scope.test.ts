import { describe, expect, it } from "vitest";
import { porteeHabillage } from "@/components/dashboard/wheel-style-scope";
import type { GameType } from "@/types/database";

/**
 * Les quinze mécaniques, dans l'ordre du CHECK SQL `wheels_game_type_check`.
 * La liste est recopiée VOLONTAIREMENT : si une seizième arrive, ce test doit
 * échouer sur son compte plutôt que l'absorber en silence — les questions
 * « quel écran d'accueil ce jeu montre-t-il ? » et « a-t-il un réglage qui
 * lui est propre ? » se tranchent à la main.
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

  /**
   * Le défaut que ces trois tests ferment : l'aperçu montrait le MÊME carton
   * (🎁 + « Jouer ») pour quatorze mécaniques sur quinze, sous une phrase qui
   * promet « exactement ce que verront vos clients ».
   */
  it("chaque mécanique porte SON écran d'accueil — jamais un carton générique", () => {
    const emojis = new Map<GameType, string>();
    const verbes = new Map<GameType, string>();
    for (const g of TOUTES) {
      const p = porteeHabillage(g);
      expect(p.emoji, g).not.toBe("");
      expect(p.libelleBouton, g).not.toBe("Jouer");
      expect(p.accroche.length, g).toBeGreaterThan(0);
      emojis.set(g, p.emoji);
      verbes.set(g, p.libelleBouton);
    }
    // Les verbes sont TOUS distincts : c'est ce qui rend l'aperçu reconnaissable
    // — et ce sont les sélecteurs des specs Playwright de /play.
    expect(new Set(verbes.values()).size).toBe(15);
    // Les emojis, eux, peuvent se répéter (deux mécaniques de carte partagent
    // 🃏) : c'est le verbe qui les sépare, pas l'image.
    expect(emojis.get("scratch")).toBe("🎟️");
    expect(emojis.get("dice")).toBe("🎲");
  });

  it("huit mécaniques ont un réglage propre ; la roue et les six défis n'en ont pas", () => {
    const avec = TOUTES.filter((g) => porteeHabillage(g).reglagesDuJeu !== null);
    expect(avec).toEqual([
      "scratch",
      "flip_card",
      "cups",
      "slot",
      "memory",
      "chest",
      "dice",
      "draw_card",
    ]);
    // La section « Ce jeu » disparaît entièrement pour les sept autres plutôt
    // que d'afficher une rubrique vide.
    expect(porteeHabillage("wheel").reglagesDuJeu).toBeNull();
    expect(porteeHabillage("rps").reglagesDuJeu).toBeNull();
  });

  it("le réglage propre est TOUJOURS celui de la mécanique en cours", () => {
    // Le contrôle affiché ne peut pas écrire dans la clé d'un autre jeu : la
    // section est nommée par la mécanique elle-même.
    for (const g of TOUTES) {
      const r = porteeHabillage(g).reglagesDuJeu;
      if (r !== null) expect(r, g).toBe(g);
    }
  });
});
