import { describe, expect, it } from "vitest";
import { clampTvPage, tvPages, TV_ROWS_PER_PAGE } from "./tv-paging";

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("tvPages", () => {
  it("classement vide → aucune page", () => {
    expect(tvPages([], 12)).toEqual([]);
  });

  it("un écran exactement → une seule page", () => {
    const pages = tvPages(range(12), 12);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toEqual(range(12));
  });

  it("déborde d'une ligne → deuxième page d'une ligne", () => {
    const pages = tvPages(range(13), 12);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(12);
    expect(pages[1]).toEqual([13]);
  });

  it("conserve l'ordre des rangs à travers les pages", () => {
    const pages = tvPages(range(30), 12);
    expect(pages.flat()).toEqual(range(30));
  });

  it("taille de page invalide → bornée à 1 (jamais de boucle infinie)", () => {
    expect(tvPages(range(3), 0)).toHaveLength(3);
    expect(tvPages(range(3), -5)).toHaveLength(3);
  });

  it("taille par défaut : top 30 de l'API → 3 pages", () => {
    expect(TV_ROWS_PER_PAGE).toBe(12);
    expect(tvPages(range(30))).toHaveLength(3);
  });
});

describe("clampTvPage", () => {
  it("rotation modulo sur le nombre de pages", () => {
    expect(clampTvPage(0, 3)).toBe(0);
    expect(clampTvPage(2, 3)).toBe(2);
    expect(clampTvPage(3, 3)).toBe(0);
    expect(clampTvPage(7, 3)).toBe(1);
  });

  it("classement rétréci (plus aucune page) → première page", () => {
    expect(clampTvPage(5, 0)).toBe(0);
  });

  it("valeur négative → ramenée dans les bornes", () => {
    expect(clampTvPage(-1, 3)).toBe(2);
  });
});
