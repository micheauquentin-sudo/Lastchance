// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LobbyStateView } from "@/lib/lobby";

const getLobbyState = vi.fn();
const leaveLobby = vi.fn();
const lockLobby = vi.fn();
vi.mock("@/actions/lobby", () => ({
  getLobbyState,
  leaveLobby,
  lockLobby,
  joinLobby: vi.fn(),
  kickLobbyMember: vi.fn(),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

/**
 * LE JEU EST REMPLACÉ PAR UN MARQUEUR, ET C'EST LE SUJET DE CE FICHIER.
 *
 * Depuis L18, `locked` et `closed` sur une salle « bande » ne mènent plus à
 * « la partie commence » mais au jeu, qui ouvre sa propre partie et tient son
 * propre scrutin. Ce que ces tests vérifient reste le ROUTAGE de `SalonLobby` —
 * quel écran pour quel statut — et non ce que le jeu peint ensuite : monter le
 * vrai composant ferait entrer sept RPC dans un fichier qui teste une salle
 * d'attente, et ses minuteries se mêleraient à celles du scrutin sous faux
 * temps. Le marqueur porte `statutSalle` parce que c'est la seule chose que le
 * branchement transmet et qu'il doit transmettre juste.
 */
vi.mock("@/components/bande/bande-experience", () => ({
  BandeExperience: ({ statutSalle }: { statutSalle: string }) => (
    <p>jeu de la bande ({statutSalle})</p>
  ),
}));

const { SalonLobby } = await import("@/components/lobby/salon-lobby");

/**
 * LA SALLE D'ATTENTE N'A PAS LE DROIT DE SURVIVRE À SA SALLE.
 *
 * `lobby_state` rend QUATRE statuts, pas deux : « locked » n'est pas la seule
 * fin. Le départ de l'HÔTE ferme la salle (`closed`) pour tout le monde, et
 * l'expiration se CONSTATE à la lecture (`expired`, ADR-111) sans qu'aucune
 * écriture ne la précède. Un écran qui ne basculerait que sur « locked »
 * laisserait les invités devant une liste de personnes qui n'est plus, sans
 * rien pour en sortir — et continuerait à la relire toutes les trois secondes.
 *
 * Ce test verrouille les deux moitiés de la propriété : l'écran de sortie
 * s'affiche sur CHAQUE état terminal, et le scrutin s'y arrête.
 */

const MEMBRES = [
  { pseudo: "Camille", rang: 1, estMoi: true },
  { pseudo: "Sacha", rang: 2, estMoi: false },
];

function salle(
  status: "lobby" | "locked" | "closed" | "expired",
  { expiresAt, joinCode }: { expiresAt?: string; joinCode?: string } = {},
): LobbyStateView {
  return {
    state: "ok",
    status,
    kind: "bande",
    capacite: 6,
    expiresAt: expiresAt ?? new Date(Date.now() + 10 * 60_000).toISOString(),
    // `joinCode` non nul = c'est l'HÔTE : la seule vue qui porte le bouton
    // « Verrouiller et commencer ».
    joinCode: joinCode ?? null,
    // SALON-1 : la salle d'attente ne peint aucun décor — c'est la coquille qui
    // le fait, un cran plus haut, à partir de la même clé. `null` est donc ici
    // la valeur juste ET celle qui n'a aucune influence sur ces tests.
    habillage: null,
    membres: MEMBRES,
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

function peindre() {
  render(<SalonLobby code="ABC123" lobbyId="lob-1" dejaMembre sortie={null} />);
}

/** Le titre de la salle d'attente — pas le texte d'aide de l'écran d'entrée. */
const titreSalle = () => screen.queryByRole("heading", { name: /dans le salon/i });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("SalonLobby — salle d'attente", () => {
  it("montre la liste tant que la salle attend", async () => {
    getLobbyState.mockResolvedValue(salle("lobby"));
    peindre();

    await waitFor(() => expect(titreSalle()).not.toBeNull());
    expect(screen.getByText("Sacha")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /quitter le salon/i }),
    ).toBeTruthy();
  });

  // LE VERROU N'EST PLUS UNE FIN, C'EST LE DÉPART (L18) : sur une salle
  // « bande », il monte le jeu. Ce que ce test garde est inchangé — la salle
  // d'attente ne survit pas au verrou.
  it("monte le jeu quand la salle est verrouillée", async () => {
    getLobbyState.mockResolvedValue(salle("locked"));
    peindre();

    await waitFor(() =>
      expect(screen.getByText(/jeu de la bande \(locked\)/i)).toBeTruthy(),
    );
    expect(titreSalle()).toBeNull();
  });

  // `closed` PASSE AUSSI PAR LE JEU, et le statut voyage avec : c'est le jeu qui
  // croise « salle refermée » avec l'état de sa partie — un récapitulatif ferme
  // la salle, et une partie terminée n'est pas une panne. Ce que ce test garde
  // est la même propriété qu'avant : plus de liste d'attente sur une salle close.
  it("ne laisse pas la salle d'attente peinte sur « closed »", async () => {
    getLobbyState.mockResolvedValue(salle("closed"));
    peindre();

    await waitFor(() =>
      expect(screen.getByText(/jeu de la bande \(closed\)/i)).toBeTruthy(),
    );
    expect(titreSalle()).toBeNull();
    expect(screen.queryByText("Sacha")).toBeNull();
  });

  it("dit la salle finie sur « expired », sans salle d'attente", async () => {
    getLobbyState.mockResolvedValue(salle("expired"));
    peindre();

    await waitFor(() =>
      expect(screen.getByText(/salon a pris fin/i)).toBeTruthy(),
    );
    expect(titreSalle()).toBeNull();
  });

  // L'EXPIRATION SE CONSTATE : une salle encore marquée « lobby » mais dont la
  // date de mort est passée est morte à l'écran aussi, sans attendre d'écriture.
  it("constate l'expiration même sur un statut « lobby » périmé", async () => {
    getLobbyState.mockResolvedValue(
      salle("lobby", { expiresAt: new Date(Date.now() - 1_000).toISOString() }),
    );
    peindre();

    await waitFor(() =>
      expect(screen.getByText(/salon a pris fin/i)).toBeTruthy(),
    );
    expect(titreSalle()).toBeNull();
  });

  it("cesse de relire une fois la salle close", async () => {
    vi.useFakeTimers();
    getLobbyState.mockResolvedValue(salle("closed"));
    peindre();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(getLobbyState).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/jeu de la bande \(closed\)/i)).toBeTruthy();
  });

  /**
   * DEUX LECTURES EN VOL, LA PLUS ANCIENNE RENDUE EN DERNIER.
   *
   * Le scénario exact du terrain : l'hôte clique « Verrouiller et commencer »
   * alors qu'un tic de scrutin est DÉJÀ PARTI. Ce tic a lu la salle avant le
   * verrou — il rapportera `lobby` — et rien ne l'oblige à revenir avant la
   * relecture déclenchée par le verrou, qui rapporte `locked`. Sans compteur de
   * génération, l'écran affichait « la partie commence » une demi-seconde puis
   * RETOMBAIT sur la liste d'attente, sur une salle verrouillée en base.
   *
   * Le test force l'ordre défavorable : la récente rentre d'abord, l'ancienne
   * après. La propriété est que l'écran ne bouge plus.
   */
  it("jette une lecture périmée revenue après une plus récente", async () => {
    vi.useFakeTimers();
    const scrutin = differe<LobbyStateView>();
    const apresVerrou = differe<LobbyStateView>();
    getLobbyState
      .mockResolvedValueOnce(salle("lobby", { joinCode: "ABC123" })) // montage
      .mockReturnValueOnce(scrutin.promesse) // tic parti AVANT le verrou
      .mockReturnValueOnce(apresVerrou.promesse); // relecture du verrou
    lockLobby.mockResolvedValue({ ok: true });

    peindre();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(titreSalle()).not.toBeNull();

    // Le tic de 3 s part, et reste en vol.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(getLobbyState).toHaveBeenCalledTimes(2);

    // L'hôte verrouille : troisième lecture, émise APRÈS la deuxième.
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /verrouiller et commencer/i }),
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getLobbyState).toHaveBeenCalledTimes(3);

    // La RÉCENTE rentre la première : l'écran de départ.
    await act(async () => {
      apresVerrou.resoudre(salle("locked", { joinCode: "ABC123" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/jeu de la bande \(locked\)/i)).toBeTruthy();

    // Puis l'ANCIENNE, avec son `lobby` périmé. Elle ne repeint rien…
    await act(async () => {
      scrutin.resoudre(salle("lobby", { joinCode: "ABC123" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/jeu de la bande \(locked\)/i)).toBeTruthy();
    expect(titreSalle()).toBeNull();

    // …et elle ne relance pas non plus le scrutin que l'état terminal a arrêté.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(getLobbyState).toHaveBeenCalledTimes(3);
  });

  // Le refus muet de `lobby_state` (cookie effacé, jeton non membre, salle
  // inconnue) ne laisse pas non plus la salle d'attente peinte.
  it("sort de la salle d'attente sur un refus muet", async () => {
    getLobbyState.mockResolvedValue({ state: "unavailable" });
    peindre();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /réessayer avec ce code/i }),
      ).toBeTruthy(),
    );
    expect(titreSalle()).toBeNull();
  });
});
