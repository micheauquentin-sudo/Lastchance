// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const updateWheel = vi.fn();
vi.mock("@/actions/prizes", () => ({ updateWheel }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { WheelSettings } = await import("@/components/dashboard/wheel-settings");

import { gameIdle } from "@/lib/game-idle";
import type { Wheel } from "@/types/database";

/**
 * L'APERÇU DE L'ÉTAPE « LE JEU » EST VIVANT, ET C'EST TOUT L'ENJEU.
 *
 * Constat d'origine : « quand je sélectionne le jeu à gratter, dans l'aperçu
 * c'est toujours la roue ». L'étape n'avait AUCUN aperçu, et l'étape suivante
 * lit la valeur ENREGISTRÉE — naviguer au stepper sans enregistrer montrait
 * donc encore l'ancienne mécanique.
 *
 * Ce test tient l'invariant qui ferme ce défaut : cocher un radio change
 * l'aperçu IMMÉDIATEMENT, sans soumission (l'action est mockée et n'est jamais
 * appelée). Les textes attendus sont lus dans `game-idle.ts` — la source
 * unique — pour qu'une accroche réécrite là-bas ne laisse pas ce test vert sur
 * une chaîne périmée.
 */
afterEach(cleanup);

const ROUE = {
  id: "w1",
  campaign_id: "c1",
  name: "Roue principale",
  game_type: "wheel",
  play_limit: "once",
  style: {},
  position: 0,
  created_at: "2026-08-01T10:00:00.000Z",
  // unsafe-cast-justification: fixture de test partielle — seuls les champs lus par l'étape « Le jeu » sont posés
} as unknown as Wheel;

function monter(wheel: Wheel = ROUE) {
  return render(
    <WheelSettings wheel={wheel} campaignId="c1" organizationName="Café des Sports" />,
  );
}

describe("Étape « Le jeu » — l'aperçu vivant", () => {
  it("part sur la mécanique enregistrée : accroche et verbe de la roue", () => {
    monter();
    expect(screen.getByText(gameIdle("wheel").accroche)).toBeTruthy();
    expect(screen.getByText(gameIdle("wheel").buttonLabel)).toBeTruthy();
    expect(screen.getByText("Café des Sports")).toBeTruthy();
  });

  it("cocher « Carte à gratter » bascule l'aperçu AVANT tout enregistrement", () => {
    monter();
    const scratch = screen.getByRole("radio", { name: /Carte à gratter/ });
    fireEvent.click(scratch);

    expect(screen.getByText(gameIdle("scratch").accroche)).toBeTruthy();
    expect(screen.getByText(gameIdle("scratch").buttonLabel)).toBeTruthy();
    // L'accroche de la roue a disparu : l'aperçu a bel et bien changé.
    expect(screen.queryByText(gameIdle("wheel").accroche)).toBeNull();
    // Rien n'a été enregistré — l'aperçu ne dépend pas de la base.
    expect(updateWheel).not.toHaveBeenCalled();
  });

  it("suit aussi une mécanique de défi (memory, machine à sous, mot mystère)", () => {
    monter();
    fireEvent.click(screen.getByRole("radio", { name: /Machine à sous/ }));
    expect(screen.getByText(gameIdle("slot").accroche)).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /Mot mystère/ }));
    expect(screen.getByText(gameIdle("mystery_word").accroche)).toBeTruthy();
    expect(screen.getByText(gameIdle("mystery_word").buttonLabel)).toBeTruthy();
  });

  it("l'accroche du commerçant prime sur le défaut de la mécanique", () => {
    monter({
      ...ROUE,
      style: { title: "Un café offert vous attend" },
      // unsafe-cast-justification: même fixture partielle que ROUE, style surchargé
    } as unknown as Wheel);
    expect(screen.getByText("Un café offert vous attend")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Carte à gratter/ }));
    expect(screen.getByText("Un café offert vous attend")).toBeTruthy();
  });

  it("renvoie vers l'étape « L'habillage » plutôt que d'y prétendre", () => {
    monter();
    expect(
      screen.getByText(/L'habillage complet se règle à l'étape/),
    ).toBeTruthy();
  });
});
