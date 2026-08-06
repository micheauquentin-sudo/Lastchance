// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invitationPasseport = vi.fn();
vi.mock("@/actions/loyalty", () => ({ invitationPasseport }));

const { ProposerPasseport } = await import(
  "@/components/loyalty/proposer-passeport"
);
const { RedeemCodeScreen } = await import("@/components/wheel/claim-form");

/**
 * LA PROPOSITION DE PASSEPORT EST NAVIGATIONNELLE, ET RIEN D'AUTRE.
 *
 * Trois propriétés sont gardées ici parce qu'aucune n'est visible au diff :
 *
 *  · le SILENCE par défaut — un refus (action qui rend `null`) ne doit rien
 *    laisser à l'écran, pas même un cadre vide ; c'est le cas de la MAJORITÉ
 *    des commerçants, qui n'ont pas de programme de fidélité ;
 *  · le LIEN est un vrai `<a>` vers `/passeport/<programId>` — jamais un
 *    bouton, jamais une écriture : ce composant ne tamponne rien ;
 *  · l'EXCLUSION des surfaces de fidélité. `RedeemCodeScreen` sert huit
 *    surfaces dont le tour offert DU PASSEPORT : sans `proposerPasseport`,
 *    le joueur se voyait proposer de découvrir la page d'où il venait.
 */

const INVITATION = { programId: "prog-1", programName: "Café des Sports" };

beforeEach(() => {
  invitationPasseport.mockReset();
});
afterEach(cleanup);

describe("ProposerPasseport", () => {
  it("ne rend RIEN quand l'action refuse", async () => {
    invitationPasseport.mockResolvedValue(null);
    const { container } = render(<ProposerPasseport organizationId="org-1" />);

    await waitFor(() => expect(invitationPasseport).toHaveBeenCalledTimes(1));
    // Aucune trace : ni cadre, ni titre, ni « chargement ».
    expect(container.innerHTML).toBe("");
  });

  it("ne rend RIEN quand l'action échoue (réseau coupé)", async () => {
    invitationPasseport.mockRejectedValue(new Error("offline"));
    const { container } = render(<ProposerPasseport organizationId="org-1" />);

    await waitFor(() => expect(invitationPasseport).toHaveBeenCalledTimes(1));
    expect(container.innerHTML).toBe("");
  });

  it("propose un LIEN vers le passeport du programme quand il existe", async () => {
    invitationPasseport.mockResolvedValue(INVITATION);
    render(<ProposerPasseport organizationId="org-1" />);

    const lien = await screen.findByRole("link", {
      name: /Mon Passeport de fidélité/,
    });
    expect(lien.getAttribute("href")).toBe("/passeport/prog-1");
    // Le nom du programme situe l'invitation ; le libellé du lien, lui, reste
    // NEUTRE — le composant ne peut pas savoir si le joueur a déjà un
    // passeport (cookie httpOnly par programme), il ne l'affirme donc pas.
    expect(screen.getByText(/Café des Sports/)).toBeDefined();
  });

  it("n'appelle l'action qu'avec l'organisation — aucune identité", async () => {
    invitationPasseport.mockResolvedValue(INVITATION);
    render(<ProposerPasseport organizationId="org-42" />);

    await waitFor(() => expect(invitationPasseport).toHaveBeenCalled());
    expect(invitationPasseport).toHaveBeenCalledWith({
      organizationId: "org-42",
    });
  });
});

const BASE = {
  redeemCode: "ABCD1234",
  emailSent: false,
  walletUrl: null,
  appleWalletUrl: null,
  ttlSeconds: 600 as number | null,
};

describe("RedeemCodeScreen — la proposition et son exclusion", () => {
  it("propose le passeport sur l'écran de gain", async () => {
    invitationPasseport.mockResolvedValue(INVITATION);
    render(<RedeemCodeScreen {...BASE} organizationId="org-1" />);

    expect(
      await screen.findByRole("link", { name: /Mon Passeport de fidélité/ }),
    ).toBeDefined();
  });

  it("propose aussi sur l'écran du code EXPIRÉ", async () => {
    invitationPasseport.mockResolvedValue(INVITATION);
    render(
      <RedeemCodeScreen {...BASE} ttlSeconds={0} organizationId="org-1" />,
    );

    expect(screen.getByText(/n'est plus valable/)).toBeDefined();
    expect(
      await screen.findByRole("link", { name: /Mon Passeport de fidélité/ }),
    ).toBeDefined();
  });

  it("NE propose RIEN sur une surface de fidélité (proposerPasseport=false)", async () => {
    invitationPasseport.mockResolvedValue(INVITATION);
    render(
      <RedeemCodeScreen
        {...BASE}
        organizationId="org-1"
        proposerPasseport={false}
      />,
    );

    // L'écran est bien rendu — sinon on prouverait l'absence sur du vide.
    expect(screen.getByText("ABCD1234")).toBeDefined();
    // Et l'action n'est même pas appelée : rien n'est demandé au serveur.
    await waitFor(() => expect(screen.getByText("ABCD1234")).toBeDefined());
    expect(invitationPasseport).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("link", { name: /Mon Passeport de fidélité/ }),
    ).toBeNull();
  });

  it("ne propose rien sans organisation connue", async () => {
    invitationPasseport.mockResolvedValue(INVITATION);
    render(<RedeemCodeScreen {...BASE} />);

    expect(screen.getByText("ABCD1234")).toBeDefined();
    expect(invitationPasseport).not.toHaveBeenCalled();
  });
});
