import { describe, expect, it } from "vitest";
import {
  AUTO_TEXT_DARK,
  AUTO_TEXT_LIGHT,
  bestTextColor,
  contrastRatio,
  relativeLuminance,
} from "./contrast";

describe("relativeLuminance — WCAG 2.x", () => {
  it("noir = 0, blanc = 1", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("hex 3 caractères équivalent au hex 6", () => {
    expect(relativeLuminance("#fff")).toBe(relativeLuminance("#ffffff"));
    expect(relativeLuminance("#a1c")).toBe(relativeLuminance("#aa11cc"));
  });

  it("coefficients par canal : le vert pèse le plus, le bleu le moins", () => {
    expect(relativeLuminance("#ff0000")).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance("#00ff00")).toBeCloseTo(0.7152, 4);
    expect(relativeLuminance("#0000ff")).toBeCloseTo(0.0722, 4);
  });

  it("insensible à la casse et aux espaces", () => {
    expect(relativeLuminance("#A1B2C3")).toBe(relativeLuminance("#a1b2c3"));
    expect(relativeLuminance(" #ffffff ")).toBeCloseTo(1, 5);
  });

  it("couleur invalide : filet de sécurité → 0 (noir)", () => {
    expect(relativeLuminance("rouge")).toBe(0);
    expect(relativeLuminance("#ggg")).toBe(0);
    expect(relativeLuminance("")).toBe(0);
  });
});

describe("contrastRatio — ratio WCAG", () => {
  it("noir/blanc = 21, couleur identique = 1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 4);
    expect(contrastRatio("#7c3aed", "#7c3aed")).toBe(1);
  });

  it("symétrique (l'ordre des couleurs est indifférent)", () => {
    expect(contrastRatio("#f59e0b", "#211d16")).toBe(
      contrastRatio("#211d16", "#f59e0b"),
    );
  });

  it("valeur de référence connue : gris moyen sur blanc ≈ 3.95", () => {
    expect(contrastRatio("#808080", "#ffffff")).toBeCloseTo(3.95, 1);
  });
});

describe("bestTextColor — encre sombre ou blanc", () => {
  it("fond blanc → encre sombre, fond noir → blanc", () => {
    expect(bestTextColor("#ffffff")).toBe(AUTO_TEXT_DARK);
    expect(bestTextColor("#000000")).toBe(AUTO_TEXT_LIGHT);
    expect(bestTextColor("#fff")).toBe(AUTO_TEXT_DARK);
    expect(bestTextColor("#000")).toBe(AUTO_TEXT_LIGHT);
  });

  it("couleurs claires du projet → encre sombre", () => {
    expect(bestTextColor("#fcca59")).toBe(AUTO_TEXT_DARK); // jaune kermesse
    expect(bestTextColor("#f59e0b")).toBe(AUTO_TEXT_DARK); // ambre
    expect(bestTextColor("#fdf6e3")).toBe(AUTO_TEXT_DARK); // crème
  });

  it("couleurs sombres du projet → blanc", () => {
    expect(bestTextColor("#7c3aed")).toBe(AUTO_TEXT_LIGHT); // violet
    expect(bestTextColor("#3f3f46")).toBe(AUTO_TEXT_LIGHT); // « Perdu »
    expect(bestTextColor("#211d16")).toBe(AUTO_TEXT_LIGHT); // encre elle-même
  });

  it("gris moyen : l'encre sombre offre le meilleur ratio", () => {
    // #808080 : 4.25:1 avec l'encre contre 3.95:1 avec le blanc.
    expect(bestTextColor("#808080")).toBe(AUTO_TEXT_DARK);
  });

  it("la couleur retournée atteint toujours au moins 3:1 sur ces fonds", () => {
    for (const bg of ["#ffffff", "#000000", "#7c3aed", "#d946ef", "#f59e0b", "#808080"]) {
      expect(contrastRatio(bg, bestTextColor(bg))).toBeGreaterThanOrEqual(3);
    }
  });

  it("couleur invalide → blanc (l'ancien défaut de la roue)", () => {
    expect(bestTextColor("garbage")).toBe(AUTO_TEXT_LIGHT);
  });
});
