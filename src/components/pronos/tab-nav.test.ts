import { describe, expect, it } from "vitest";
import { nextTabIndex } from "./tab-nav";

describe("nextTabIndex", () => {
  it("ArrowRight avance d'un onglet", () => {
    expect(nextTabIndex(0, "ArrowRight", 4)).toBe(1);
    expect(nextTabIndex(2, "ArrowRight", 4)).toBe(3);
  });

  it("ArrowRight boucle du dernier au premier", () => {
    expect(nextTabIndex(3, "ArrowRight", 4)).toBe(0);
  });

  it("ArrowLeft recule d'un onglet", () => {
    expect(nextTabIndex(2, "ArrowLeft", 4)).toBe(1);
  });

  it("ArrowLeft boucle du premier au dernier", () => {
    expect(nextTabIndex(0, "ArrowLeft", 4)).toBe(3);
  });

  it("Home et End vont aux extrémités", () => {
    expect(nextTabIndex(2, "Home", 4)).toBe(0);
    expect(nextTabIndex(0, "End", 4)).toBe(3);
  });

  it("touche hors navigation → null (comportement natif conservé)", () => {
    expect(nextTabIndex(1, "Tab", 4)).toBeNull();
    expect(nextTabIndex(1, "Enter", 4)).toBeNull();
    expect(nextTabIndex(1, "ArrowDown", 4)).toBeNull();
  });

  it("tablist à 3 onglets (sans ligues) : le wrap suit le compte réel", () => {
    expect(nextTabIndex(2, "ArrowRight", 3)).toBe(0);
    expect(nextTabIndex(0, "ArrowLeft", 3)).toBe(2);
  });

  it("tablist vide → null (jamais d'index hors bornes)", () => {
    expect(nextTabIndex(0, "ArrowRight", 0)).toBeNull();
  });
});
