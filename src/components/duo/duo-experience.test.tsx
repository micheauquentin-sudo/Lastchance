// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

/** La moitié LISIBLE de `DuoStateView` — `mancheScellee` part de là. */
type VueDuo = Extract<DuoStateView, { state: "ok" }>;

function mancheOuverte(): VueDuo {
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

/** La même manche, une fois le sceau posé — ce que la relecture doit peindre. */
function mancheScellee(): VueDuo {
  return {
    ...mancheOuverte(),
    monChoix: { item_id: "it-1", nom: "Le cookie" },
  };
}

/** Une promesse dont le test décide l'instant de retour. */
function differe<T>() {
  let resoudre!: (valeur: T) => void;
  const promesse = new Promise<T>((r) => {
    resoudre = r;
  });
  return { promesse, resoudre };
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
  vi.useRealTimers();
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

  /**
   * DEUX LECTURES EN VOL, LA PLUS ANCIENNE RENDUE EN DERNIER — même course que
   * `SalleAttente`, même correctif.
   *
   * Le joueur touche une fiche pendant qu'un tic de scrutin est déjà parti. Ce
   * tic a lu la manche AVANT le sceau : il rapportera `monChoix: null`. S'il
   * revient après la relecture de `chooseDuo`, l'écran défait le sceau — les
   * cartes redeviennent cliquables sur une manche que `duo_choose` refusera
   * désormais, et le joueur croit son choix perdu.
   */
  it("jette une lecture périmée revenue après une plus récente", async () => {
    vi.useFakeTimers();
    const scrutin = differe<DuoStateView>();
    const apresChoix = differe<DuoStateView>();
    getDuoState
      .mockResolvedValueOnce(mancheOuverte()) // ouverture
      .mockReturnValueOnce(scrutin.promesse) // tic parti AVANT le sceau
      .mockReturnValueOnce(apresChoix.promesse); // relecture du choix
    chooseDuo.mockResolvedValue({ ok: true, data: { etat: "scelle" } });

    peindre("locked");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(cartes()).toHaveLength(2);

    // Le tic de 3 s part, et reste en vol.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(getDuoState).toHaveBeenCalledTimes(2);

    // Le doigt tombe : troisième lecture, émise APRÈS la deuxième.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /le cookie/i }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getDuoState).toHaveBeenCalledTimes(3);

    // La RÉCENTE rentre la première : le sceau est posé.
    await act(async () => {
      apresChoix.resoudre(mancheScellee());
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/votre choix est scellé/i)).toBeTruthy();

    // Puis l'ANCIENNE, sans choix. Elle ne défait pas le sceau.
    await act(async () => {
      scrutin.resoudre(mancheOuverte());
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/votre choix est scellé/i)).toBeTruthy();
    expect(
      cartes().every((carte) => (carte as HTMLButtonElement).disabled),
    ).toBe(true);
  });
});
