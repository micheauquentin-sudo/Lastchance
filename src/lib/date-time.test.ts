import { describe, expect, it } from "vitest";
import { endOfLocalDayToIso, isValidDateOnly } from "./date-time";

describe("dates locales d'accès offert", () => {
  it("rejette les dates calendaires impossibles", () => {
    expect(isValidDateOnly("2026-02-29")).toBe(false);
    expect(isValidDateOnly("2026-07-18")).toBe(true);
    expect(isValidDateOnly("18/07/2026")).toBe(false);
  });

  it("expire à la fin du jour choisi en heure d'été à Paris", () => {
    expect(endOfLocalDayToIso("2026-07-18", "Europe/Paris")).toBe(
      "2026-07-18T21:59:59.999Z",
    );
  });

  it("tient compte du changement d'heure d'hiver", () => {
    expect(endOfLocalDayToIso("2026-12-18", "Europe/Paris")).toBe(
      "2026-12-18T22:59:59.999Z",
    );
  });
});
