// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LobbyStateView } from "@/lib/lobby";

const getLobbyState = vi.fn();
const leaveLobby = vi.fn();
vi.mock("@/actions/lobby", () => ({
  getLobbyState,
  leaveLobby,
  joinLobby: vi.fn(),
  kickLobbyMember: vi.fn(),
  lockLobby: vi.fn(),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

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
  { expiresAt }: { expiresAt?: string } = {},
): LobbyStateView {
  return {
    state: "ok",
    status,
    kind: "bande",
    capacite: 6,
    expiresAt: expiresAt ?? new Date(Date.now() + 10 * 60_000).toISOString(),
    joinCode: null,
    membres: MEMBRES,
  };
}

function peindre() {
  render(<SalonLobby code="ABC123" lobbyId="lob-1" dejaMembre />);
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

  it("bascule sur l'écran de départ quand la salle est verrouillée", async () => {
    getLobbyState.mockResolvedValue(salle("locked"));
    peindre();

    await waitFor(() =>
      expect(screen.getByText(/la partie commence/i)).toBeTruthy(),
    );
    expect(titreSalle()).toBeNull();
  });

  it("dit la salle refermée quand l'hôte est parti (closed), sans salle d'attente", async () => {
    getLobbyState.mockResolvedValue(salle("closed"));
    peindre();

    await waitFor(() =>
      expect(screen.getByText(/salon a été refermé/i)).toBeTruthy(),
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
    expect(screen.getByText(/salon a été refermé/i)).toBeTruthy();
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
