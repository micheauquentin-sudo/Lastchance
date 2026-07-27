import { describe, expect, it } from "vitest";
import {
  formatPlayerAlias,
  isAllowedPlayerAlias,
  normalizePlayerAlias,
} from "./player-alias";

describe("player alias", () => {
  it("normalise Unicode et les espaces sans dégrader l'affichage", () => {
    expect(formatPlayerAlias("  Team\u00a0\u00a0Éclair  ")).toBe("Team Éclair");
    expect(normalizePlayerAlias("Team Éclair")).toBe("team eclair");
  });

  it("refuse les contrôles, le bidi et les injures obfusquées", () => {
    expect(isAllowedPlayerAlias("Alice\u202eBob")).toBe(false);
    expect(isAllowedPlayerAlias("c o n n a r d")).toBe(false);
    expect(isAllowedPlayerAlias("Team Nazi")).toBe(false);
  });

  it("évite les faux positifs par sous-chaîne", () => {
    expect(isAllowedPlayerAlias("Dominique")).toBe(true);
    expect(isAllowedPlayerAlias("Constance")).toBe(true);
    expect(isAllowedPlayerAlias("Les Éclairs")).toBe(true);
  });
});
