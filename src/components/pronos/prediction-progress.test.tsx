// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PredictionProgress } from "./prediction-progress";

/**
 * LA BARRE MESURE UN GESTE, PAS UN INVENTAIRE.
 *
 * Elle a suivi `matches.length` (irremplissable pour un joueur arrivé en cours
 * de saison), puis la grille entière — ce qui donnait « 0/201 · 0 % » dès
 * qu'un commerçant importait son année. Exact, et sans rapport avec ce que le
 * joueur venait faire : remplir son week-end le faisait passer à 4 %.
 *
 * Elle suit désormais la PROCHAINE JOURNÉE, celle du bloc de tête de la
 * grille. Ces tests tiennent les deux moitiés de cette promesse : ce que la
 * barre mesure, et le fait que la saison reste lisible sans redevenir
 * l'objectif.
 */

afterEach(cleanup);

describe("PredictionProgress", () => {
  it("LA RÉGRESSION : la barre mesure la journée, pas la saison", () => {
    render(
      <PredictionProgress
        done={0}
        total={9}
        libelle="3e journée"
        saison={{ done: 0, total: 201 }}
      />,
    );

    // Avant : « 0/201 · 0 % ». Le joueur doit lire sa journée.
    expect(screen.getByText(/0\/9 pronostic/)).toBeTruthy();
    expect(screen.queryByText(/0\/201 pronostic/)).toBeNull();

    const barre = screen.getByRole("progressbar");
    expect(barre.getAttribute("aria-valuemax")).toBe("9");
    expect(barre.getAttribute("aria-valuetext")).toContain("3e journée");
  });

  it("la journée remplie affiche 100 %, ce qui arrive vraiment", () => {
    render(
      <PredictionProgress
        done={9}
        total={9}
        libelle="3e journée"
        saison={{ done: 9, total: 201 }}
      />,
    );

    expect(screen.getByText(/3e journée complète/)).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    // Et l'écran renvoie vers la suite plutôt que de féliciter à tort.
    expect(screen.getByText(/journées suivantes vous attendent/)).toBeTruthy();
  });

  it("la saison reste lisible, en seconde ligne et sans barre", () => {
    render(
      <PredictionProgress
        done={4}
        total={9}
        libelle="3e journée"
        saison={{ done: 12, total: 201 }}
      />,
    );

    expect(screen.getByText(/Sur toute la saison : 12\/201/)).toBeTruthy();
    // Une seule barre : la saison est une information, pas un objectif.
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });

  /**
   * Sur un championnat d'une seule journée, la saison EST la journée. Répéter
   * « 3/9 » deux fois n'apprendrait rien.
   */
  it("ne répète pas la saison quand elle ne dépasse pas la journée", () => {
    render(
      <PredictionProgress
        done={3}
        total={9}
        libelle="1re journée"
        saison={{ done: 3, total: 9 }}
      />,
    );

    expect(screen.queryByText(/Sur toute la saison/)).toBeNull();
  });

  it("sans journée nommée, la barre reste lisible", () => {
    render(<PredictionProgress done={2} total={5} />);

    expect(screen.getByText(/2\/5 pronostic/)).toBeTruthy();
    expect(screen.queryByText(/Sur toute la saison/)).toBeNull();
  });

  it("rien à pronostiquer : aucun cadre vide", () => {
    const { container } = render(<PredictionProgress done={0} total={0} />);
    expect(container.firstChild).toBeNull();
  });
});
