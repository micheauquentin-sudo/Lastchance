// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  gameTypeToWinScene3D,
  LossReboundShell,
  WinCelebrationShell,
} from "./game-result-celebration";

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? matches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe("game-result-celebration", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("associe chaque mécanique de jeu à sa scène 3D signature", () => {
    expect(gameTypeToWinScene3D("slot")).toBe("diamond");
    expect(gameTypeToWinScene3D("scratch")).toBe("diamond");
    expect(gameTypeToWinScene3D("chest")).toBe("chest");
    expect(gameTypeToWinScene3D("wheel")).toBe("trophy");
    expect(gameTypeToWinScene3D("rps")).toBe("trophy");
  });

  it("célèbre 1,3 s plein cadre puis déploie automatiquement le formulaire", () => {
    vi.useFakeTimers();
    mockReducedMotion(false);

    render(
      <WinCelebrationShell
        title="Un café offert"
        choregraphieFormulaire
        kermesse
      >
        <form aria-label="Formulaire de retrait">
          <input name="firstName" />
        </form>
      </WinCelebrationShell>,
    );

    expect(screen.getByText("✦ GAGNÉ ✦")).toBeTruthy();
    expect(screen.getByText("Un café offert")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1300);
    });

    expect(screen.getByRole("form")).toBeTruthy();
  });

  it("permet au joueur pressé de déployer le formulaire d'un tap immédiat", () => {
    vi.useFakeTimers();
    mockReducedMotion(false);

    render(
      <WinCelebrationShell
        title="Dessert maison"
        choregraphieFormulaire
        kermesse
      >
        <form aria-label="Formulaire de retrait">
          <input name="email" />
        </form>
      </WinCelebrationShell>,
    );

    expect(screen.queryByRole("form")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /Récupérer mon lot tout de suite/i }),
    );
    expect(screen.getByRole("form")).toBeTruthy();
  });

  it("déploie immédiatement le formulaire sous prefers-reduced-motion", () => {
    mockReducedMotion(true);

    render(
      <WinCelebrationShell
        title="Viennoiserie offerte"
        choregraphieFormulaire
        kermesse
      >
        <form aria-label="Formulaire de retrait">
          <input name="firstName" />
        </form>
      </WinCelebrationShell>,
    );

    expect(screen.getByRole("form")).toBeTruthy();
  });

  it("rend l'écran de rebond sur perte avec accroche prochaine chance", () => {
    mockReducedMotion(true);

    render(
      <LossReboundShell
        kicker="C'ÉTAIT À UN CRAN !"
        title="Pas cette fois…"
        message="La chance tourne vite."
        nextChanceHint="Revenez demain pour une nouvelle tentative !"
        kermesse
      />,
    );

    expect(screen.getByText("C'ÉTAIT À UN CRAN !")).toBeTruthy();
    expect(screen.getByText("Pas cette fois…")).toBeTruthy();
    expect(
      screen.getByText("Revenez demain pour une nouvelle tentative !"),
    ).toBeTruthy();
  });
});
