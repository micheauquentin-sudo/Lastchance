import { describe, expect, it } from "vitest";
import {
  calendarBoxState,
  calendarProgress,
  formatCalendarUnlock,
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
  it("expose les 5 thèmes avec des accents distincts", () => {
    const fills = new Set(
      CALENDAR_THEME_ORDER.map((t) => calendarThemeTokens(t).progressFill),
    );
    expect(CALENDAR_THEME_ORDER).toHaveLength(5);
    expect(fills.size).toBe(5);
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
