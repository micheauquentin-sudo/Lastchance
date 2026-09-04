// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * « TIRABLE » EST LE PRÉDICAT PARTAGÉ, ET PAS UNE COPIE (VIT-45).
 *
 * ── POURQUOI CETTE GARDE NE PEUT PAS ÊTRE TEXTUELLE ──
 *
 * Une garde qui lirait le fichier à la recherche de `poids > 0` prouverait
 * qu'un motif est absent — jamais que la fonction partagée est celle qui
 * DÉCIDE. Une reformulation équivalente (`lot.poids >= 1`, un `filter` extrait
 * dans un utilitaire local) passerait dessous sans un mot, et le jour où le SQL
 * bouge, l'écran annoncerait « prêt » sur une configuration que la base refuse.
 *
 * Ce fichier remplace donc `estLotTirable` par une fonction qui MENT, et
 * regarde l'écran changer d'avis. S'il ne change pas, c'est qu'il tranche
 * ailleurs — et la garde le dit.
 *
 * Elle vit à part parce que `vi.mock` est hissé au FICHIER : mêlée aux autres
 * gardes du studio, elle aurait faussé toutes celles qui vérifient ce que le
 * commerçant lit vraiment.
 */

const estLotTirable = vi.fn(() => false);

vi.mock("@/lib/ticket-or", async (importOriginal) => {
  // Le reste du module est INTACT : les bornes, les phrases et le mappage sont
  // lus par l'éditeur de lots et par la page joueur montée dans l'aperçu.
  const original = await importOriginal<typeof import("@/lib/ticket-or")>();
  return { ...original, estLotTirable };
});

vi.mock("@/actions/ticket-or", () => ({
  creerLotTicketOr: vi.fn(),
  modifierLotTicketOr: vi.fn(),
  supprimerLotTicketOr: vi.fn(),
  emettreTicketOr: vi.fn(),
  tirerTicketOr: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { TicketStudio } = await import("@/components/ticket/ticket-studio");

import {
  libelleEtapeStudioTicket,
} from "@/components/ticket/studio/etapes";
import type { LotTicketOrView } from "@/lib/ticket-or";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * PARFAITEMENT TIRABLE pour n'importe quelle copie du prédicat : coché, pesé,
 * stock illimité. Un écran qui aurait son propre test le déclarerait tirable
 * quoi qu'en dise la fonction partagée — c'est exactement ce qu'on mesure.
 */
const LOT: LotTicketOrView = {
  id: "lot-1",
  libelle: "Un café offert",
  poids: 5,
  stock: null,
  actif: true,
  ordre: 1,
};

function rendreVerification() {
  render(<TicketStudio lots={[LOT]} peutRegler />);
  fireEvent.click(
    screen.getByRole("button", {
      name: libelleEtapeStudioTicket("verification"),
    }),
  );
}

describe("l'étape de vérification n'a pas son propre prédicat", () => {
  it("elle demande son verdict à `estLotTirable`", () => {
    rendreVerification();
    expect(
      estLotTirable,
      "l'écran n'a jamais consulté le prédicat partagé : il tranche ailleurs",
    ).toHaveBeenCalled();
  });

  it("quand le prédicat dit NON, l'écran dit non — sur un lot pourtant parfait", () => {
    estLotTirable.mockReturnValue(false);
    rendreVerification();
    expect(screen.getByText(/Aucun lot ne peut sortir/)).toBeTruthy();
    expect(screen.getByText(/poids à zéro|décoché|stock épuisé/)).toBeTruthy();
  });

  it("quand le prédicat dit OUI, l'écran dit oui", () => {
    // L'autre sens, sans quoi un écran qui dirait TOUJOURS non passerait la
    // garde précédente.
    estLotTirable.mockReturnValue(true);
    rendreVerification();
    expect(
      screen.getByText("1 lot peut sortir. Vos tickets donneront quelque chose."),
    ).toBeTruthy();
  });
});

describe("l'aperçu choisit son lot d'exemple avec le même prédicat", () => {
  it("prédicat à NON : l'aperçu montre le refus, et non le lot", async () => {
    estLotTirable.mockReturnValue(false);
    render(<TicketStudio lots={[LOT]} peutRegler />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ouvrir mon ticket" }));
    });
    expect(
      screen.getByText(/Il n'y a plus rien à gagner pour le moment/),
    ).toBeTruthy();
  });

  it("prédicat à OUI : l'aperçu montre le lot", async () => {
    estLotTirable.mockReturnValue(true);
    render(<TicketStudio lots={[LOT]} peutRegler />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ouvrir mon ticket" }));
    });
    expect(screen.getByText("Un café offert")).toBeTruthy();
  });
});
