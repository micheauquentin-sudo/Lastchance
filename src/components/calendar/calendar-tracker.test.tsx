// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/calendar", () => ({
  getCalendarState: vi.fn(),
  joinCalendar: vi.fn(),
  openCalendarBox: vi.fn(),
}));
vi.mock("@/actions/loyalty", () => ({ invitationPasseport: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const { CalendarTracker } = await import("./calendar-tracker");

import type { CalendarPublicDay, CalendarPublicState } from "@/lib/calendar";

/**
 * « CASE VIDE = PERDU » DOIT SE VOIR, ET SE VOIR COMME UNE DÉFAITE.
 *
 * Une case `content` sans texte est LÉGALE depuis que la publication ne
 * l'exige plus : le commerçant n'a plus à garnir 24 cases pour ouvrir. Le
 * joueur, lui, lisait alors « 💬 Le mot du jour » suivi d'un « Bonne
 * journée ! » que PERSONNE n'avait écrit — un message de remplissage
 * indiscernable d'un vrai, qui faisait passer une case sans gain pour une
 * attention du commerçant.
 *
 * Rien d'autre dans la suite ne regarde ce rendu : le module d'activation
 * (`src/lib/activation/calendar.ts`) prouve que la case ne bloque plus, l'E2E
 * n'ouvre que des cases AVEC texte (le seed les garnit). L'issue perdante
 * n'existe donc qu'ici.
 */

afterEach(cleanup);

function jour(over: Partial<CalendarPublicDay> = {}): CalendarPublicDay {
  return {
    dayIndex: 1,
    unlockAt: null,
    status: "opened",
    isSpecial: false,
    contentType: "content",
    contentText: null,
    rewardLabel: null,
    rewardDetails: null,
    code: null,
    spinGrantToken: null,
    targetWheelId: null,
    resultingSpinId: null,
    outOfStock: false,
    ...over,
  };
}

function etat(days: CalendarPublicDay[], openedCount = 1): CalendarPublicState {
  return {
    state: "ok",
    calendar: {
      id: "cal-1",
      name: "Calendrier de test",
      theme: "noel",
      status: "active",
      dayCount: 4,
      merchantContent: null,
      completionRewardLabel: "",
      completionRewardDetails: null,
    },
    days,
    progression: { openedCount, dayCount: 4 },
    completionReward: null,
  };
}

function rendre(state: CalendarPublicState) {
  return render(
    <CalendarTracker
      calendarId="cal-1"
      publicSlug="test"
      organizationName="Café des Sports"
      logoUrl={null}
      theme="noel"
      merchantContent={null}
      initialState={state}
      dayIds={{ 1: "day-1" }}
      spinBundles={{}}
    />,
  );
}

describe("CalendarTracker — case sans gain", () => {
  it("révèle une DÉFAITE, jamais un « mot du jour » de remplissage", () => {
    rendre(etat([jour({ contentText: null })]));
    fireEvent.click(screen.getByRole("button", { name: "Revoir la case 1" }));

    const dialog = screen.getByRole("dialog");
    expect(
      screen.getByRole("heading", { name: /Pas de chance aujourd'hui/ }),
    ).toBeTruthy();
    // Le fallback menteur a disparu, et le titre du « mot du jour » avec lui.
    expect(dialog.textContent).not.toContain("Bonne journée");
    expect(dialog.textContent).not.toContain("Le mot du jour");
  });

  it("consolle avec l'assiduité RESTANTE, chiffrée", () => {
    // 1 case ouverte sur 4 → il en reste 3 à découvrir.
    rendre(etat([jour({ contentText: "   " })], 1));
    fireEvent.click(screen.getByRole("button", { name: "Revoir la case 1" }));

    expect(screen.getByRole("dialog").textContent).toContain(
      "Il reste 3 cases à ouvrir",
    );
  });

  it("laisse INTACTE une case message garnie", () => {
    rendre(etat([jour({ contentText: "Joyeuses fêtes !" })]));
    fireEvent.click(screen.getByRole("button", { name: "Revoir la case 1" }));

    const dialog = screen.getByRole("dialog");
    expect(
      screen.getByRole("heading", { name: "Le mot du jour" }),
    ).toBeTruthy();
    expect(dialog.textContent).toContain("Joyeuses fêtes !");
    expect(dialog.textContent).not.toContain("Pas de chance");
  });

  it("distingue les deux cases dans la GRILLE, avant même de les rouvrir", () => {
    const { container } = rendre(etat([jour({ contentText: null })]));
    // 🍂 (pas de chance) plutôt que 💬 (mot du jour) sur la tuile ouverte.
    expect(container.textContent).toContain("🍂");
    expect(container.textContent).not.toContain("💬");
  });
});
