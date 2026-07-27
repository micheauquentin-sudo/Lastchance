import { describe, expect, it } from "vitest";
import {
  endOfLocalDayToIso,
  isoToZonedDateTimeInput,
  isValidDateOnly,
  localDateKey,
  zonedDateTimeToIso,
} from "./date-time";

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

describe("dates-heures civiles par fuseau", () => {
  it("convertit Paris avec les offsets été et hiver", () => {
    expect(zonedDateTimeToIso("2026-07-18T18:00", "Europe/Paris")).toBe(
      "2026-07-18T16:00:00.000Z",
    );
    expect(zonedDateTimeToIso("2026-12-18T18:00", "Europe/Paris")).toBe(
      "2026-12-18T17:00:00.000Z",
    );
  });

  it("refuse une heure inexistante au passage à l'heure d'été", () => {
    expect(() =>
      zonedDateTimeToIso("2026-03-29T02:30", "Europe/Paris"),
    ).toThrow("n'existe pas");
  });

  it("refuse une heure ambiguë au retour à l'heure d'hiver", () => {
    expect(() =>
      zonedDateTimeToIso("2026-10-25T02:30", "Europe/Paris"),
    ).toThrow("ambiguë");
  });

  it("couvre Tahiti et Nouméa", () => {
    expect(zonedDateTimeToIso("2026-07-18T18:00", "Pacific/Tahiti")).toBe(
      "2026-07-19T04:00:00.000Z",
    );
    expect(zonedDateTimeToIso("2026-07-18T18:00", "Pacific/Noumea")).toBe(
      "2026-07-18T07:00:00.000Z",
    );
  });

  it("fait un aller-retour ISO vers datetime-local", () => {
    const iso = zonedDateTimeToIso("2026-07-18T18:05", "Europe/Paris");
    expect(isoToZonedDateTimeInput(iso, "Europe/Paris")).toBe(
      "2026-07-18T18:05",
    );
  });

  it("calcule la date civile et non la date UTC", () => {
    const instant = new Date("2026-07-18T10:30:00.000Z");
    expect(localDateKey(instant, "Pacific/Tahiti")).toBe("2026-07-18");
    expect(localDateKey(instant, "Pacific/Noumea")).toBe("2026-07-18");

    const boundary = new Date("2026-07-18T23:30:00.000Z");
    expect(localDateKey(boundary, "Pacific/Tahiti")).toBe("2026-07-18");
    expect(localDateKey(boundary, "Pacific/Noumea")).toBe("2026-07-19");
  });
});
