import { describe, expect, it } from "vitest";
import {
  parseLocalStudioDraft,
  parseStudioModule,
  studioModuleDestination,
  studioModuleLabel,
} from "./studio-draft-import";

describe("studio-draft-import", () => {
  it("extrait le nom d'établissement et le module actif d'un brouillon Studio valide", () => {
    const raw = JSON.stringify({
      lastModule: "vitrine",
      vitrine: { nom: "  Boulangerie du Coin  " },
    });
    expect(parseLocalStudioDraft(raw, "roue")).toEqual({
      organizationName: "Boulangerie du Coin",
      activeModule: "roue",
    });
  });

  it("retombe sur lastModule si lc_active_module est absent ou invalide", () => {
    const raw = JSON.stringify({
      lastModule: "fidelite",
      vitrine: { nom: "Chez Léo" },
    });
    expect(parseLocalStudioDraft(raw, "inconnu")).toEqual({
      organizationName: "Chez Léo",
      activeModule: "fidelite",
    });
  });

  it("ignore proprement un JSON corrompu et ne rejette jamais", () => {
    expect(parseLocalStudioDraft("{not-json", null)).toBeNull();
    expect(parseLocalStudioDraft("{not-json", "pronostics")).toEqual({
      organizationName: null,
      activeModule: "pronostics",
    });
  });

  it("mappe chaque module autorisé vers sa route interne et rejette les valeurs arbitraires", () => {
    expect(parseStudioModule("vitrine")).toBe("vitrine");
    expect(parseStudioModule("../admin")).toBeNull();
    expect(studioModuleDestination("vitrine")).toBe("/vitrine-studio");
    expect(studioModuleDestination("roue")).toBe("/dashboard/campaigns");
    expect(studioModuleDestination("pronostics")).toBe("/dashboard/pronostics");
    expect(studioModuleDestination("fidelite")).toBe("/dashboard/loyalty");
    expect(studioModuleDestination("calendrier")).toBe("/dashboard/calendar");
    expect(studioModuleDestination(null)).toBe("/dashboard");
    expect(studioModuleLabel("roue")).toBe("Roue & jeux");
  });
});
