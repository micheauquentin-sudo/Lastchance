// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const createLoyaltyOrderCodes = vi.fn();
vi.mock("@/actions/loyalty", () => ({ createLoyaltyOrderCodes }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// happy-dom n'a pas de contexte 2D : le rendu QR est hors sujet ici.
vi.mock("@/lib/qr-render", () => ({ renderQr: vi.fn().mockResolvedValue(undefined) }));

const { OrderCodeCards } = await import(
  "@/components/dashboard/order-code-cards"
);

/**
 * CE QUE CE BLOC DOIT NE PAS FAIRE, ET C'EST LÀ QU'EST LE DÉFAUT.
 *
 *  · Un bouton « Télécharger les 0 cartes » sur un programme neuf : le
 *    commerçant clique, rien ne se passe, et il en conclut que la
 *    fonctionnalité est cassée. Sans carte à distribuer, PAS de bouton.
 *  · Une carte SERVIE réimprimée : son QR est mort (`consumed_at` est le
 *    verrou, il ne se relâche jamais). Elle est donc rangée à part, sans QR et
 *    sans téléchargement — la distinction est la seule information utile de la
 *    liste.
 */

const A_DISTRIBUER = {
  token: "AAAABBBB",
  label: "CMD-2026-0412",
  url: "https://app.lastchance.test/commande/AAAABBBB",
  consumedAt: null,
};
const SERVIE = {
  token: "CCCCDDDD",
  label: "CMD-2026-0411",
  url: "https://app.lastchance.test/commande/CCCCDDDD",
  consumedAt: "2026-08-04T10:00:00.000Z",
};

afterEach(cleanup);

describe("OrderCodeCards", () => {
  it("sans aucune carte : pas d'export, et un état vide explicite", () => {
    render(<OrderCodeCards programId="prog-1" codes={[]} />);

    expect(screen.queryByRole("button", { name: /Télécharger/ })).toBeNull();
    expect(screen.getByText(/Aucune carte émise/)).toBeTruthy();
    // Le formulaire d'émission, lui, reste offert : c'est par là qu'on commence.
    expect(screen.getByRole("button", { name: /Émettre les cartes/ })).toBeTruthy();
  });

  it("sans carte À DISTRIBUER : toujours pas d'export, même s'il en existe des servies", () => {
    render(<OrderCodeCards programId="prog-1" codes={[SERVIE]} />);

    expect(screen.queryByRole("button", { name: /Télécharger les/ })).toBeNull();
  });

  it("distingue une carte servie d'une carte à distribuer", () => {
    render(<OrderCodeCards programId="prog-1" codes={[A_DISTRIBUER, SERVIE]} />);

    expect(screen.getByText(/À distribuer \(1\)/)).toBeTruthy();
    expect(screen.getByText(/Déjà servies \(1\)/)).toBeTruthy();
    expect(screen.getByText(/^Servi le /)).toBeTruthy();

    // Un seul QR : celui de la carte encore vivante.
    expect(
      screen.getAllByLabelText(/QR code de la carte/).length,
    ).toBe(1);
    expect(
      screen.getByLabelText("QR code de la carte CMD-2026-0412"),
    ).toBeTruthy();
  });

  it("l'export par lot ne porte que les cartes à distribuer", () => {
    render(<OrderCodeCards programId="prog-1" codes={[A_DISTRIBUER, SERVIE]} />);

    expect(
      screen.getByRole("button", { name: /Télécharger les 1 cartes/ }),
    ).toBeTruthy();
  });

  it("rappelle la règle produit en une phrase", () => {
    render(<OrderCodeCards programId="prog-1" codes={[]} />);
    expect(screen.getByText(/Une carte = un tampon, à glisser dans le colis/)).toBeTruthy();
  });

  it("le formulaire est étiqueté et borné (1..100)", () => {
    render(<OrderCodeCards programId="prog-1" codes={[]} />);
    const nombre = screen.getByLabelText("Nombre") as HTMLInputElement;
    expect(nombre.getAttribute("min")).toBe("1");
    expect(nombre.getAttribute("max")).toBe("100");
    expect(screen.getByLabelText(/Référence/)).toBeTruthy();
  });
});
