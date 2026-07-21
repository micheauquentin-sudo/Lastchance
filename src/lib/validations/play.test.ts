// @vitest-environment node
import { describe, expect, it } from "vitest";
import { claimSchema, isPlausibleBirthDate } from "./play";

const NOW = new Date("2026-07-21T12:00:00Z");

describe("isPlausibleBirthDate — âge 13..120, date calendaire réelle", () => {
  it("accepte une date de naissance plausible", () => {
    expect(isPlausibleBirthDate("1990-05-12", NOW)).toBe(true);
    expect(isPlausibleBirthDate("2010-01-01", NOW)).toBe(true);
    expect(isPlausibleBirthDate("1907-01-01", NOW)).toBe(true);
  });

  it("refuse un âge hors bornes (trop jeune, trop vieux)", () => {
    expect(isPlausibleBirthDate("2015-01-01", NOW)).toBe(false); // ~11 ans
    expect(isPlausibleBirthDate("2025-06-01", NOW)).toBe(false); // ~1 an
    expect(isPlausibleBirthDate("1900-01-01", NOW)).toBe(false); // ~126 ans
  });

  it("refuse une date inexistante ou un mauvais format", () => {
    expect(isPlausibleBirthDate("2000-02-31", NOW)).toBe(false);
    expect(isPlausibleBirthDate("2000-13-01", NOW)).toBe(false);
    expect(isPlausibleBirthDate("12/05/1990", NOW)).toBe(false);
    expect(isPlausibleBirthDate("naissance", NOW)).toBe(false);
    expect(isPlausibleBirthDate("", NOW)).toBe(false);
  });

  it("refuse une date future", () => {
    expect(isPlausibleBirthDate("2030-01-01", NOW)).toBe(false);
  });
});

describe("claimSchema — champs anniversaire facultatifs", () => {
  const base = { claimToken: "jeton-valide-assez-long" };

  it("défauts : pas d'opt-in anniversaire, pas de date", () => {
    const parsed = claimSchema.parse(base);
    expect(parsed.birthdayOptIn).toBe(false);
    expect(parsed.birthDate).toBeNull();
  });

  it("date vide → null, date plausible conservée", () => {
    expect(claimSchema.parse({ ...base, birthDate: "" }).birthDate).toBeNull();
    expect(
      claimSchema.parse({ ...base, birthdayOptIn: true, birthDate: "1990-05-12" })
        .birthDate,
    ).toBe("1990-05-12");
  });

  it("date implausible refusée avec un message clair", () => {
    const result = claimSchema.safeParse({ ...base, birthDate: "2020-01-01" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Date de naissance invalide");
    }
  });
});
