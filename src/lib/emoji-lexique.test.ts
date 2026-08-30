import { describe, expect, it } from "vitest";
import { emojisPour, LEXIQUE_EMOJI, motsDe } from "./emoji-lexique";

describe("emojisPour — les deux exemples du propriétaire", () => {
  it("« vin » propose la bouteille de vin", () => {
    expect(emojisPour("vin")).toEqual(["🍷"]);
  });

  it("« fromage » propose le fromage", () => {
    expect(emojisPour("fromage")).toEqual(["🧀"]);
  });
});

describe("emojisPour — mot ENTIER, jamais sous-chaîne", () => {
  /**
   * LE TÉMOIN QUI COMPTE.
   *
   * Un `includes("vin")` rendrait 🍷 ici. Une suggestion absurde apprend au
   * commerçant à ignorer la rangée entière : ce test garde la recherche par
   * mot, et c'est lui qui casse en premier si quelqu'un « simplifie ».
   */
  it("« vintage » ne propose rien : ce n'est pas le mot « vin »", () => {
    expect(emojisPour("Article vintage")).toEqual([]);
  });

  it("« divin » non plus", () => {
    // « sac » est bien reconnu ; « divin » ne doit PAS ramener le vin.
    expect(emojisPour("Sac en cuir divin")).toEqual(["👜"]);
  });

  it("« paintball » ne propose pas le pain", () => {
    expect(emojisPour("paintball")).toEqual([]);
  });
});

describe("emojisPour — ordre, doublons, plafond", () => {
  it("« Bouteille de vin rouge » ne propose le vin qu'une fois", () => {
    const emojis = emojisPour("Bouteille de vin rouge");
    expect(emojis.filter((e) => e === "🍷")).toHaveLength(1);
  });

  it("« Vin, vins et grands vins » reste une seule suggestion", () => {
    expect(emojisPour("Vin, vins et grands vins")).toEqual(["🍷"]);
  });

  it("suit l'ordre des mots du texte, pas l'ordre du lexique", () => {
    expect(emojisPour("Fromage et vin")).toEqual(["🧀", "🍷"]);
    expect(emojisPour("Vin et fromage")).toEqual(["🍷", "🧀"]);
  });

  it("respecte `max`", () => {
    const texte = "vin fromage cafe pizza gateau";
    expect(emojisPour(texte)).toHaveLength(4); // défaut
    expect(emojisPour(texte, 2)).toEqual(["🍷", "🧀"]);
    expect(emojisPour(texte, 1)).toEqual(["🍷"]);
    expect(emojisPour(texte, 0)).toEqual([]);
  });
});

describe("emojisPour — casse, accents, ponctuation, pluriel", () => {
  it("ignore la casse et les accents", () => {
    expect(emojisPour("CAFÉ")).toEqual(["☕"]);
    expect(emojisPour("Café offert")).toEqual(["☕", "💰"]);
  });

  it("déplie les ligatures : « cœur » n'est pas décomposé par NFD", () => {
    expect(emojisPour("Coup de cœur")).toEqual(["💖"]);
  });

  it("traite apostrophes et traits d'union comme des séparateurs", () => {
    expect(emojisPour("Bon d'achat")).toEqual(["💰"]);
    expect(emojisPour("pain-surprise")).toEqual(["🥖", "🎁"]);
  });

  it("gère le pluriel simple", () => {
    expect(emojisPour("2 bijoux")).toEqual(["💍"]);
    expect(emojisPour("Fleurs fraîches")).toEqual(["💐"]);
    expect(emojisPour("Journaux")).toEqual(["📰"]);
  });

  it("rend [] sur un texte vide ou sans mot connu", () => {
    expect(emojisPour("")).toEqual([]);
    expect(emojisPour("   ")).toEqual([]);
    expect(emojisPour("Lot n°3")).toEqual([]);
  });
});

describe("motsDe", () => {
  it("découpe, minusculise et déaccentue", () => {
    expect(motsDe("Crêpe & Café  (offert) !")).toEqual([
      "crepe",
      "cafe",
      "offert",
    ]);
  });
});

describe("LEXIQUE_EMOJI — invariants de la table", () => {
  /**
   * AUCUN SÉLECTEUR DE VARIATION.
   *
   * Un `U+FE0F` invisible dans un nom accessible a déjà fait expirer un test
   * Playwright de ce dépôt sans nom de locator (voir
   * `e2e/event-remote-cycle.spec.ts`). Le lexique alimente des `aria-label` :
   * il ne doit contenir ni VS16 ni séquence ZWJ.
   */
  it("aucun emoji ne porte U+FE0F ni ZWJ", () => {
    const fautifs = LEXIQUE_EMOJI.filter(
      (e) => e.emoji.includes("️") || e.emoji.includes("‍"),
    ).map((e) => e.mots[0]);
    expect(fautifs).toEqual([]);
  });

  it("aucun mot-clé n'appartient à deux entrées", () => {
    const vus = new Map<string, string>();
    const collisions: string[] = [];
    for (const entree of LEXIQUE_EMOJI) {
      for (const mot of entree.mots) {
        if (vus.has(mot)) collisions.push(`${mot} (${vus.get(mot)} / ${entree.emoji})`);
        vus.set(mot, entree.emoji);
      }
    }
    expect(collisions).toEqual([]);
  });

  it("aucun emoji n'apparaît dans deux entrées", () => {
    const emojis = LEXIQUE_EMOJI.map((e) => e.emoji);
    expect(new Set(emojis).size).toBe(emojis.length);
  });

  /**
   * Un mot-clé accentué ou majuscule serait INATTEIGNABLE : la recherche
   * compare des mots déjà normalisés. Le défaut serait entièrement muet —
   * l'entrée existe, elle ne sort jamais.
   */
  it("tous les mots-clés sont déjà normalisés", () => {
    const fautifs = LEXIQUE_EMOJI.flatMap((e) => e.mots).filter(
      (mot) => motsDe(mot).join(" ") !== mot,
    );
    expect(fautifs).toEqual([]);
  });

  it("chaque mot-clé du lexique rend bien son emoji", () => {
    for (const entree of LEXIQUE_EMOJI) {
      for (const mot of entree.mots) {
        expect(emojisPour(mot), mot).toEqual([entree.emoji]);
      }
    }
  });

  it("couvre le commerce de proximité — au moins 150 entrées", () => {
    expect(LEXIQUE_EMOJI.length).toBeGreaterThanOrEqual(150);
  });
});
