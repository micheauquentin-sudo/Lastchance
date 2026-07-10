import { describe, expect, it } from "vitest";
import { randomCode, sanitizeSearchTerm, slugify } from "./utils";

describe("sanitizeSearchTerm — recherche participations", () => {
  it("laisse un terme simple intact", () => {
    expect(sanitizeSearchTerm("GAIN-A2B3")).toBe("GAIN-A2B3");
    expect(sanitizeSearchTerm("marco@exemple.fr")).toBe("marco@exemple.fr");
  });

  it("retire les espaces autour du terme", () => {
    expect(sanitizeSearchTerm("  Marco  ")).toBe("Marco");
  });

  it("neutralise la syntaxe des filtres PostgREST .or()", () => {
    // Une virgule injecterait une condition supplémentaire dans .or()
    expect(sanitizeSearchTerm("a,or.id.eq.x")).toBe("aor.id.eq.x");
    expect(sanitizeSearchTerm("a(b)c")).toBe("abc");
    expect(sanitizeSearchTerm("100%")).toBe("100");
    expect(sanitizeSearchTerm("a\\b")).toBe("ab");
  });

  it("retourne une chaîne vide si rien d'exploitable ne reste", () => {
    expect(sanitizeSearchTerm("   ")).toBe("");
    expect(sanitizeSearchTerm("%()")).toBe("");
  });

  it("tronque les termes anormalement longs", () => {
    expect(sanitizeSearchTerm("x".repeat(200))).toHaveLength(80);
  });
});

describe("slugify", () => {
  it("retire accents et caractères spéciaux", () => {
    expect(slugify("Chez Marco")).toBe("chez-marco");
    expect(slugify("Café de l'Été !")).toBe("cafe-de-l-ete");
  });

  it("borne la longueur à 48 caractères", () => {
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(48);
  });
});

describe("randomCode", () => {
  it("respecte longueur et préfixe", () => {
    const code = randomCode(6, "GAIN");
    expect(code).toMatch(/^GAIN-[A-HJ-NP-Z2-9]{6}$/);
  });

  it("évite les caractères ambigus (I, O, 0, 1)", () => {
    for (let i = 0; i < 50; i++) {
      expect(randomCode(8)).not.toMatch(/[IO01]/);
    }
  });
});
