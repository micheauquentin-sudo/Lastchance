import { describe, expect, it } from "vitest";
import { codeTtlDaysSchema } from "./reward-expiry";

// ────────────────────────────────────────────────────────────
// codeTtlDaysSchema — l'échéance PARTAGÉE par les sept familles
//
// Miroir applicatif du CHECK SQL de la migration 20260904120000
// (`code_ttl_days is null or code_ttl_days between 1 and 365`), posé sur
// `hunts`, `loyalty_programs`, `jackpot_campaigns`, `event_sessions`,
// `calendars`, `referral_programs` et `quizzes`.
//
// Le point central : `''` n'est PAS un champ vide à ignorer, c'est le
// réglage « sans limite » → `null`. Toute la garde `has` des sept actions
// n'existe que parce que cette valeur-là est légitime ; si le schéma la
// refusait, le piège n'aurait pas lieu d'être.
// ────────────────────────────────────────────────────────────

describe("codeTtlDaysSchema", () => {
  it("accepte '' et le rend null — « sans limite » est un réglage, pas un vide", () => {
    const r = codeTtlDaysSchema.safeParse("");
    expect(r.success).toBe(true);
    expect(r.success && r.data).toBeNull();
  });

  it("accepte null tel quel (colonne nullable)", () => {
    const r = codeTtlDaysSchema.safeParse(null);
    expect(r.success).toBe(true);
    expect(r.success && r.data).toBeNull();
  });

  it.each([
    ["1", 1],
    ["365", 365],
    ["30", 30],
  ])("accepte la borne/valeur %s et la coerce en nombre", (saisi, attendu) => {
    const r = codeTtlDaysSchema.safeParse(saisi);
    expect(r.success).toBe(true);
    expect(r.success && r.data).toBe(attendu);
  });

  it("refuse 0 (hors borne basse) en nommant le minimum", () => {
    const r = codeTtlDaysSchema.safeParse("0");
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].message).toBe("Minimum 1 jour");
  });

  it("refuse 366 (hors borne haute) en nommant le maximum", () => {
    const r = codeTtlDaysSchema.safeParse("366");
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].message).toBe("Maximum 365 jours");
  });

  it.each(["3.5", "abc", "-1", "1e3"])(
    "refuse la saisie non entière ou non numérique %s",
    (saisi) => {
      expect(codeTtlDaysSchema.safeParse(saisi).success).toBe(false);
    },
  );

  it("refuse `undefined` — c'est `.optional()`, posé par chaque schéma parent, qui porte l'absence", () => {
    // Distinction structurante : le schéma NU exige une valeur ; c'est le
    // `.optional()` des sept schémas de mise à jour qui autorise l'absence.
    // Rendre le schéma nu tolérant à `undefined` effacerait la frontière entre
    // « le commerçant a vidé le champ » et « le formulaire ne le portait pas ».
    expect(codeTtlDaysSchema.safeParse(undefined).success).toBe(false);
  });
});
