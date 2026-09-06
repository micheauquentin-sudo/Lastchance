// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChampLimite } from "@/components/dashboard/atelier-roue-champs";
import {
  CLIENT_REPORTED_SKILL_GAME_TYPES,
  SECRET_SKILL_GAME_TYPES,
} from "@/lib/validations/skill";
import type { GameType } from "@/types/database";

/**
 * L'ÉCRAN NE DOIT PLUS PROPOSER CE QUE L'ENVOI REFUSERA.
 *
 * `play_limit = 'unlimited'` est interdit pour DEUX familles, et la validation
 * d'écriture le refuse déjà : les jeux à secret (force brute sur la réponse) et
 * ceux dont la réussite est rapportée par l'appareil du joueur (réflexe, jauge
 * — la limite de participation est la seule borne). L'interface ne connaissait
 * que la première : le commerçant pouvait donc CHOISIR la combinaison et se la
 * voir refuser à l'envoi, sur un formulaire qu'il croyait fini.
 *
 * Le test se dérive des LISTES du module de validation, pas d'une copie des
 * noms : ajouter un jeu à l'une des deux familles doit couvrir l'interface
 * sans qu'on y pense.
 */

afterEach(cleanup);

function optionIllimite(): HTMLOptionElement {
  return screen.getByRole("option", { name: "Illimité (démo)" }) as HTMLOptionElement;
}

function monter(gameType: GameType) {
  render(
    <ChampLimite gameType={gameType} playLimit="once" onChange={() => undefined} />,
  );
}

describe("ChampLimite — « Illimité » n'est pas offert là où il sera refusé", () => {
  it.each([...SECRET_SKILL_GAME_TYPES])(
    "jeu à secret « %s » : l'option est grisée et la note parle du secret",
    (gameType) => {
      monter(gameType);
      expect(optionIllimite().disabled).toBe(true);
      expect(screen.getByText(/la bonne réponse est\s+secrète/)).toBeTruthy();
      cleanup();
    },
  );

  it.each([...CLIENT_REPORTED_SKILL_GAME_TYPES])(
    "défi jugé par l'appareil « %s » : l'option est grisée, et la note dit POURQUOI",
    (gameType) => {
      monter(gameType);
      expect(optionIllimite().disabled).toBe(true);
      // Deux notes distinctes, pas une formulation moyenne : recopier ici la
      // phrase du secret dirait au commerçant une chose fausse sur son jeu.
      expect(
        screen.getByText(/c'est l'appareil\s+du joueur qui mesure le geste/),
      ).toBeTruthy();
      expect(screen.queryByText(/la bonne réponse est\s+secrète/)).toBeNull();
      cleanup();
    },
  );

  it("CONTRE-ÉPREUVE : sur la roue, « Illimité » reste offert et sans note", () => {
    monter("wheel");
    expect(optionIllimite().disabled).toBe(false);
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByText(/Illimité » est indisponible/)).toBeNull();
  });
});
