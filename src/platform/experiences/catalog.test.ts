import { describe, expect, it } from "vitest";
import {
  activeExperienceKinds,
  EXPERIENCE_CATALOG,
  isExperienceActive,
} from "./catalog";

const addons = {
  addon_pronostics: false,
  addon_hunts: true,
  addon_loyalty: false,
  addon_jackpot: false,
  addon_events: true,
  addon_calendar: false,
  addon_referral: false,
  addon_quiz: false,
};

describe("experience catalog", () => {
  it("possède des kinds et droits uniques", () => {
    expect(new Set(EXPERIENCE_CATALOG.map((item) => item.kind)).size).toBe(
      EXPERIENCE_CATALOG.length,
    );
    expect(new Set(EXPERIENCE_CATALOG.map((item) => item.entitlement)).size).toBe(
      EXPERIENCE_CATALOG.length,
    );
  });

  it("n'affiche dans la navigation que le cœur et les modules actifs", () => {
    expect(activeExperienceKinds(addons)).toEqual(["campaign", "event", "hunt"]);
    expect(isExperienceActive(addons, "pronostics")).toBe(false);
  });

  it("rend tout le catalogue actif pour un accès offert complet", () => {
    expect(activeExperienceKinds(addons, true)).toHaveLength(
      EXPERIENCE_CATALOG.length,
    );
  });
});
