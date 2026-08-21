// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DuoStateView } from "@/lib/duo";

const startDuo = vi.fn();
const getDuoState = vi.fn();
const chooseDuo = vi.fn();
vi.mock("@/actions/duo", () => ({ startDuo, getDuoState, chooseDuo }));

const { DuoExperience } = await import("@/components/duo/duo-experience");

/**
 * DEUX STATUTS SE CROISENT ICI, ET LE MOT « closed » NE VEUT PAS DIRE LA MÊME
 * CHOSE DE CHAQUE CÔTÉ.
 *
 * Côté MANCHE, « revelee » est une fin heureuse : la partie s'est déroulée, et
 * la révélation ferme la salle au passage — d'où une salle `closed` sur un
 * écran de résultat parfaitement normal, la moitié du lot L17.
 *
 * Côté SALLE, `close_player_lobby_as_org` produit le MÊME `closed` alors que la
 * manche est encore `ouverte`. Sans le croisement, l'écran peignait un plateau
 * cliquable dont chaque carte tombait sur le refus générique de `duo_choose`,
 * en boucle : le joueur cherchait une panne de réseau, la salle avait été
 * refermée sous ses pieds.
 *
 * Ce test verrouille les QUATRE combinaisons, parce que corriger la mauvaise
 * casserait la bonne.
 */

const OPTIONS = [
  {
    item_id: "it-1",
    nom: "Le cookie",
    description: null,
    prix_affiche: null,
    photo_path: null,
    ordre: 1,
  },
  {
    item_id: "it-2",
    nom: "Le flan",
    description: null,
    prix_affiche: null,
    photo_path: null,
    ordre: 2,
  },
];

function mancheOuverte(): DuoStateView {
  return {
    state: "ok",
    status: "ouverte",
    monChoix: null,
    options: OPTIONS,
    autreAChoisi: false,
    autreChoix: null,
    suggestion: null,
    accord: null,
  };
}

function mancheRevelee(): DuoStateView {
  return {
    state: "ok",
    status: "revelee",
    monChoix: { item_id: "it-1", nom: "Le cookie" },
    options: OPTIONS,
    autreAChoisi: true,
    autreChoix: { item_id: "it-1", nom: "Le cookie" },
    suggestion: null,
    accord: true,
  };
}

function peindre(statutSalle: "locked" | "closed") {
  render(<DuoExperience lobbyId="lob-1" statutSalle={statutSalle} />);
}

/** Les fiches du plateau, telles qu'un pouce les trouve. */
const cartes = () => screen.queryAllByRole("button", { name: /le cookie|le flan/i });

const fermeture = () =>
  screen.queryByRole("heading", { name: /refermé avant la fin/i });

const revelation = () => screen.queryByRole("heading", { name: /la révélation/i });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DuoExperience — la manche et la salle se croisent", () => {
  // `duo_start` est idempotente et NE REGARDE PAS le lobby : elle rend la manche
  // existante même sur une salle close. C'est exactement ce qui rendait le bug
  // invisible — l'ouverture réussit, et seul le croisement le fait apparaître.
  beforeEach(() => {
    startDuo.mockResolvedValue({
      state: "ok",
      roundId: "rnd-1",
      options: OPTIONS,
    });
  });

  it("manche ouverte + salle verrouillée : le plateau, cliquable", async () => {
    getDuoState.mockResolvedValue(mancheOuverte());
    peindre("locked");

    await waitFor(() => expect(cartes()).toHaveLength(2));
    expect(cartes().every((carte) => !(carte as HTMLButtonElement).disabled)).toBe(
      true,
    );
    expect(fermeture()).toBeNull();
  });

  it("manche ouverte + salle close : l'écran de fermeture, et AUCUN plateau", async () => {
    getDuoState.mockResolvedValue(mancheOuverte());
    peindre("closed");

    await waitFor(() => expect(fermeture()).not.toBeNull());
    // La propriété qui compte : rien à toucher. Un plateau désactivé aurait
    // encore invité au clic, et un plateau cliquable aurait rejoué la boucle de
    // refus que ce lot corrige.
    expect(cartes()).toHaveLength(0);
    expect(revelation()).toBeNull();
    expect(
      screen.getByText(/les choix ne seront pas révélés/i),
    ).toBeTruthy();
  });

  it("manche révélée + salle close : le résultat, pas la fermeture", async () => {
    getDuoState.mockResolvedValue(mancheRevelee());
    peindre("closed");

    await waitFor(() => expect(revelation()).not.toBeNull());
    expect(fermeture()).toBeNull();
    expect(screen.getByText(/pensé à la même chose/i)).toBeTruthy();
  });

  it("manche révélée + salle verrouillée : le résultat aussi", async () => {
    getDuoState.mockResolvedValue(mancheRevelee());
    peindre("locked");

    await waitFor(() => expect(revelation()).not.toBeNull());
    expect(fermeture()).toBeNull();
  });
});
