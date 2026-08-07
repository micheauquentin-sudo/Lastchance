import { describe, expect, it } from "vitest";

import {
  DEFAULT_SEASONAL_THEME,
  SEASONAL_THEMES,
  asSeasonalTheme,
} from "./seasonal-theme";
import { calendarThemeSchema } from "./validations/calendar";
import { updateContestSchema } from "./validations/pronostics";

const ID = "00000000-0000-4000-8000-0000000000cc";

/** Le formulaire tel que l'action le lit : `FormData.get` rend `null`. */
function champs(theme: unknown) {
  return { id: ID, name: null, status: null, reason: null, theme };
}

describe("SEASONAL_THEMES — une palette, plusieurs recopies", () => {
  it("porte les six clés du CHECK SQL (contests + calendars)", () => {
    expect([...SEASONAL_THEMES]).toEqual([
      "noel",
      "saint_valentin",
      "anniversaire",
      "soldes",
      "festival",
      "neutre",
    ]);
  });

  /**
   * La garde qui compte : `calendarThemeSchema` énumère la palette de son côté
   * depuis avant ce module. Une clé ajoutée ici et pas là (ou l'inverse) veut
   * dire qu'un des deux modules proposera un thème que l'autre refuse — le
   * défaut exact que le partage de palette existe pour empêcher.
   */
  it("ne diverge pas de l'énumération du calendrier", () => {
    expect([...SEASONAL_THEMES].sort()).toEqual([...calendarThemeSchema.options].sort());
  });

  it("le défaut fait partie de la palette", () => {
    expect(SEASONAL_THEMES).toContain(DEFAULT_SEASONAL_THEME);
  });
});

describe("asSeasonalTheme — repli de LECTURE", () => {
  it("laisse passer les six clés telles quelles", () => {
    for (const theme of SEASONAL_THEMES) {
      expect(asSeasonalTheme(theme)).toBe(theme);
    }
  });

  it("replie sur « neutre » ce qui n'est pas de la palette", () => {
    // `halloween` : le cas réaliste — une clé ajoutée au CHECK SQL sans que ce
    // code le sache. Les autres couvrent une colonne absente de la sélection.
    for (const valeur of ["halloween", "", null, undefined, 3, {}, ["noel"]]) {
      expect(asSeasonalTheme(valeur)).toBe("neutre");
    }
  });
});

/**
 * LE POINT DE LA CLASSE — `updateContestSchema` est posté par TROIS formulaires
 * distincts, dont un seul rend le sélecteur de thème. Si l'absence valait
 * « neutre », enregistrer le nom du championnat rendrait sa décoration au
 * commerçant. C'est mot pour mot ce que `default_locks_at` a coûté en V1.47 ;
 * la différence est qu'ici la garantie est dans le schéma, donc elle vaut pour
 * le quatrième formulaire écrit demain.
 */
describe("updateContestSchema.theme — optionnel-préservant", () => {
  it("champ non rendu (null) : ABSENT de la sortie, colonne intacte", () => {
    const parsed = updateContestSchema.parse(champs(null));
    expect(parsed.theme).toBeUndefined();
    // Ce qui atteint réellement PostgREST : `JSON.stringify` élague `undefined`.
    expect(JSON.parse(JSON.stringify(parsed))).not.toHaveProperty("theme");
  });

  it("clé absente de l'objet (undefined) : même résultat que null", () => {
    const sansCle = updateContestSchema.parse({ id: ID });
    expect(sansCle.theme).toBeUndefined();
    expect(sansCle.theme).toBe(updateContestSchema.parse(champs(null)).theme);
  });

  it("les six valeurs de la palette passent", () => {
    for (const theme of SEASONAL_THEMES) {
      expect(updateContestSchema.parse(champs(theme)).theme).toBe(theme);
    }
  });

  it("valeur hors palette : REFUS, jamais un repli silencieux", () => {
    for (const valeur of ["halloween", "NOEL", "", "gourmand", 3]) {
      expect(updateContestSchema.safeParse(champs(valeur)).success).toBe(false);
    }
  });
});
