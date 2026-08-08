import { describe, expect, it } from "vitest";

import {
  CONTEST_THEME_ORDER,
  contestThemeTokens,
} from "@/components/pronos/contest-theme";
import type { SeasonalTheme } from "@/types/database";

/** Miroir des assertions de `calendar-state.test.ts` sur la table sœur. */
describe("contestThemeTokens", () => {
  it("expose les 11 thèmes avec des accents distincts", () => {
    const jauges = new Set(
      CONTEST_THEME_ORDER.map((t) => contestThemeTokens(t).progressFill),
    );
    const fonds = new Set(
      CONTEST_THEME_ORDER.map((t) =>
        JSON.stringify(contestThemeTokens(t).pageStyle),
      ),
    );
    // 11 depuis les fonds d'écran thématiques : les cinq nouveaux thèmes
    // (prairie, musique, football, restaurant, espace) sortent du même enum
    // SQL que les six saisons.
    expect(CONTEST_THEME_ORDER).toHaveLength(11);
    expect(jauges.size).toBe(11);
    expect(fonds.size).toBe(11);
  });

  it("renvoie la clé demandée et un libellé non vide", () => {
    for (const theme of CONTEST_THEME_ORDER) {
      const tokens = contestThemeTokens(theme);
      expect(tokens.key).toBe(theme);
      expect(tokens.label.length).toBeGreaterThan(0);
      expect(tokens.accentChip.length).toBeGreaterThan(0);
    }
  });

  it("retombe sur neutre pour un thème inconnu", () => {
    expect(contestThemeTokens("inconnu" as SeasonalTheme).key).toBe("neutre");
  });

  it("retombe sur neutre quand la colonne n'est pas servie", () => {
    // La page publique lit `contest.theme` d'un `select` qui peut ne pas
    // encore porter la colonne : `undefined` ne doit pas faire tomber la page
    // d'un joueur pour un fond d'écran.
    expect(contestThemeTokens(undefined).key).toBe("neutre");
    expect(contestThemeTokens(null).key).toBe("neutre");
  });
});
