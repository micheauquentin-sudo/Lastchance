import { describe, expect, it } from "vitest";
import {
  endOfLocalDayToIso,
  isoToZonedDateTimeInput,
  isValidDateOnly,
  localDateKey,
  startOfLocalDayToIso,
  zonedDateTimeToIso,
} from "./date-time";

describe("startOfLocalDayToIso", () => {
  it("prend le minuit du fuseau, pas celui d'UTC", () => {
    expect(startOfLocalDayToIso("2026-08-01", "Europe/Paris")).toBe(
      "2026-07-31T22:00:00.000Z",
    );
    expect(startOfLocalDayToIso("2026-01-15", "Europe/Paris")).toBe(
      "2026-01-14T23:00:00.000Z",
    );
    expect(startOfLocalDayToIso("2026-08-01", "Pacific/Noumea")).toBe(
      "2026-07-31T13:00:00.000Z",
    );
  });

  it("encadre exactement une journée avec endOfLocalDayToIso", () => {
    const debut = new Date(startOfLocalDayToIso("2026-08-01", "Europe/Paris"));
    const fin = new Date(endOfLocalDayToIso("2026-08-01", "Europe/Paris"));
    // 24 h moins la milliseconde que `endOfLocalDayToIso` retranche.
    expect(fin.getTime() - debut.getTime()).toBe(24 * 3_600_000 - 1);
  });

  it("couvre le jour du passage à l'heure d'été (23 h de long)", () => {
    const debut = new Date(startOfLocalDayToIso("2026-03-29", "Europe/Paris"));
    const fin = new Date(endOfLocalDayToIso("2026-03-29", "Europe/Paris"));
    expect(debut.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(fin.getTime() - debut.getTime()).toBe(23 * 3_600_000 - 1);
  });

  it("rejette une date de calendrier impossible", () => {
    expect(() => startOfLocalDayToIso("2026-02-31", "Europe/Paris")).toThrow();
  });
});

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
