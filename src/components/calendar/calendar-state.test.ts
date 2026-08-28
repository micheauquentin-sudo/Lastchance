import { describe, expect, it } from "vitest";
import {
  calendarBoxState,
  calendarConsolation,
  calendarDaySansGain,
  calendarProgress,
  formatCalendarUnlock,
  prochaineOuverture,
} from "./calendar-state";
import {
  CALENDAR_THEME_ORDER,
  calendarThemeTokens,
} from "./calendar-theme";
import type { CalendarTheme } from "@/types/database";

const NOW = new Date("2026-12-05T12:00:00Z");

describe("calendarBoxState", () => {
  it("garde une case ouverte ouverte", () => {
    expect(
      calendarBoxState({ status: "opened", unlockAt: null }, NOW),
    ).toBe("opened");
  });

  it("garde une case ouvrable ouvrable", () => {
    expect(
      calendarBoxState({ status: "available", unlockAt: null }, NOW),
    ).toBe("available");
  });

  it("laisse verrouillée une case dont l'heure n'est pas atteinte", () => {
    expect(
      calendarBoxState(
        { status: "locked", unlockAt: "2026-12-06T00:00:00Z" },
        NOW,
      ),
    ).toBe("locked");
  });

  it("débloque une case verrouillée dont l'heure est franchie", () => {
    expect(
      calendarBoxState(
        { status: "locked", unlockAt: "2026-12-05T00:00:00Z" },
        NOW,
      ),
    ).toBe("available");
  });

  it("reste verrouillée sur un unlock_at absent ou illisible", () => {
    expect(calendarBoxState({ status: "locked", unlockAt: null }, NOW)).toBe(
      "locked",
    );
    expect(
      calendarBoxState({ status: "locked", unlockAt: "pas-une-date" }, NOW),
    ).toBe("locked");
  });
});

describe("calendarProgress", () => {
  it("calcule ratio, pourcentage et reste", () => {
    const p = calendarProgress(3, 12);
    expect(p.openedCount).toBe(3);
    expect(p.dayCount).toBe(12);
    expect(p.percent).toBe(25);
    expect(p.remaining).toBe(9);
    expect(p.complete).toBe(false);
  });

  it("signale la complétion quand tout est ouvert", () => {
    const p = calendarProgress(24, 24);
    expect(p.complete).toBe(true);
    expect(p.remaining).toBe(0);
    expect(p.percent).toBe(100);
  });

  it("tolère un total nul et des valeurs aberrantes (jamais NaN)", () => {
    const zero = calendarProgress(4, 0);
    expect(zero.ratio).toBe(0);
    expect(zero.complete).toBe(false);
    const over = calendarProgress(99, 10);
    expect(over.openedCount).toBe(10);
    expect(over.remaining).toBe(0);
    const neg = calendarProgress(-4, 10);
    expect(neg.openedCount).toBe(0);
  });
});

describe("calendarDaySansGain", () => {
  it("tient une case message sans texte pour un « pas de chance »", () => {
    expect(
      calendarDaySansGain({ contentType: "content", contentText: null }),
    ).toBe(true);
    expect(calendarDaySansGain({ contentType: "content", contentText: "" })).toBe(
      true,
    );
    // Des espaces ne sont pas un message : même règle que `caseVide` côté serveur.
    expect(
      calendarDaySansGain({ contentType: "content", contentText: "   \n " }),
    ).toBe(true);
  });

  it("laisse une case message GARNIE en « mot du jour »", () => {
    expect(
      calendarDaySansGain({
        contentType: "content",
        contentText: "Joyeuses fêtes !",
      }),
    ).toBe(false);
  });

  it("ne touche ni aux lots ni aux tours de roue, même sans texte", () => {
    expect(calendarDaySansGain({ contentType: "lot", contentText: null })).toBe(
      false,
    );
    expect(calendarDaySansGain({ contentType: "spin", contentText: null })).toBe(
      false,
    );
  });
});

describe("calendarConsolation", () => {
  it("salue l'assiduité quand tout est ouvert", () => {
    expect(calendarConsolation(calendarProgress(24, 24))).toContain(
      "assiduité",
    );
  });

  it("accorde le singulier sur la dernière case", () => {
    const texte = calendarConsolation(calendarProgress(23, 24));
    expect(texte).toContain("1 case");
    expect(texte).not.toContain("1 cases");
  });

  it("chiffre les cases restantes au pluriel", () => {
    expect(calendarConsolation(calendarProgress(20, 24))).toContain("4 cases");
  });

  it("reste dicible sur une grille vide (jamais « 0 cases »)", () => {
    expect(calendarConsolation(calendarProgress(0, 0))).toBe(
      "Revenez ouvrir la prochaine case !",
    );
  });

  /**
   * « DEMAIN » EST UNE PROMESSE QUE LA GRILLE NE TIENT PAS TOUJOURS.
   *
   * La consolation disait « revenez demain ». C'est vrai d'un calendrier de
   * l'Avent et faux de tout le reste : la grille se règle en date de départ
   * ET en nombre de cases, rien n'impose un pas d'un jour. Le rendez-vous
   * exact est désormais rendu à part (`prochaineOuverture`), qui le NOMME au
   * lieu de le supposer — cette phrase-ci ne doit donc plus le supposer non
   * plus.
   */
  it("ne promet plus « demain », que la grille ne garantit pas", () => {
    for (const progres of [
      calendarProgress(0, 0),
      calendarProgress(23, 24),
      calendarProgress(20, 24),
    ]) {
      expect(calendarConsolation(progres)).not.toContain("demain");
    }
  });
});

describe("prochaineOuverture", () => {
  const T = (h: number) => new Date(Date.UTC(2026, 0, 1, h)).toISOString();
  const maintenant = new Date(Date.UTC(2026, 0, 1, 12));

  it("retient la PLUS PROCHE des cases encore à venir, pas la première", () => {
    expect(
      prochaineOuverture(
        [
          { status: "locked", unlockAt: T(20) },
          { status: "locked", unlockAt: T(14) },
          { status: "locked", unlockAt: T(18) },
        ],
        maintenant,
      ),
    ).toBe(T(14));
  });

  /**
   * Une case DÉJÀ ouvrable n'est pas un rendez-vous : le joueur peut
   * l'ouvrir maintenant. L'annoncer pour plus tard serait faux, et l'annoncer
   * au passé serait absurde.
   */
  it("ignore ce qui est déjà ouvert ou déjà ouvrable", () => {
    expect(
      prochaineOuverture(
        [
          { status: "opened", unlockAt: T(2) },
          { status: "available", unlockAt: T(9) },
          { status: "locked", unlockAt: T(9) },
          { status: "locked", unlockAt: T(16) },
        ],
        maintenant,
      ),
    ).toBe(T(16));
  });

  it("rend null quand il ne reste rien à venir, et ne lève jamais", () => {
    expect(prochaineOuverture([], maintenant)).toBeNull();
    expect(
      prochaineOuverture(
        [{ status: "opened", unlockAt: T(2) }, { status: "locked", unlockAt: null }],
        maintenant,
      ),
    ).toBeNull();
    expect(
      prochaineOuverture(
        [{ status: "locked", unlockAt: "pas-une-date" }],
        maintenant,
      ),
    ).toBeNull();
  });
});

describe("formatCalendarUnlock", () => {
  it("renvoie null pour une entrée absente ou invalide", () => {
    expect(formatCalendarUnlock(null)).toBeNull();
    expect(formatCalendarUnlock("pas-une-date")).toBeNull();
  });

  it("formate une date valide en une chaîne non vide", () => {
    const label = formatCalendarUnlock("2026-12-06T00:00:00Z");
    expect(typeof label).toBe("string");
    expect((label ?? "").length).toBeGreaterThan(0);
  });

  it("inclut l'heure quand demandé", () => {
    const withTime = formatCalendarUnlock("2026-12-06T08:30:00Z", true) ?? "";
    expect(withTime).toMatch(/\d{2}[:h]\d{2}/);
  });
});

describe("calendarThemeTokens", () => {
  it("expose les 11 thèmes avec des accents distincts", () => {
    const fills = new Set(
      CALENDAR_THEME_ORDER.map((t) => calendarThemeTokens(t).progressFill),
    );
    // 11 depuis les fonds d'écran thématiques (prairie, musique, football,
    // restaurant, espace). La jauge reste la pièce colorée que le joueur
    // regarde en continu : deux thèmes ne peuvent pas la partager.
    expect(CALENDAR_THEME_ORDER).toHaveLength(11);
    expect(fills.size).toBe(11);
  });

  it("renvoie la clé demandée et un libellé non vide", () => {
    for (const theme of CALENDAR_THEME_ORDER) {
      const tokens = calendarThemeTokens(theme);
      expect(tokens.key).toBe(theme);
      expect(tokens.label.length).toBeGreaterThan(0);
      expect(tokens.availableCell.length).toBeGreaterThan(0);
    }
  });

  it("retombe sur neutre pour un thème inconnu", () => {
    const tokens = calendarThemeTokens("inconnu" as CalendarTheme);
    expect(tokens.key).toBe("neutre");
  });
});
