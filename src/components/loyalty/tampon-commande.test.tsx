// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stampLoyaltyOrder = vi.fn();
vi.mock("@/actions/loyalty", () => ({ stampLoyaltyOrder }));
// Le widget Turnstile va chercher un script chez Cloudflare : hors sujet ici,
// et impossible en test. Seule sa PRÉSENCE nous intéresse.
vi.mock("@/components/wheel/turnstile-widget", () => ({
  TurnstileWidget: () => <div data-testid="turnstile" />,
  turnstileClientEnabled: () => true,
}));

const { TamponCommande } = await import(
  "@/components/loyalty/tampon-commande"
);

/**
 * LES QUATRE PROPRIÉTÉS DU QR DE COMMANDE, CÔTÉ CLIENT.
 *
 *  1. RIEN NE PART AU CHARGEMENT. Le jeton est à usage unique : un tampon posé
 *     par le simple rendu de la page serait dépensé par un préchargement de
 *     lien ou un aperçu de messagerie, sans que le client n'ait rien demandé.
 *  2. UNE CARTE DÉJÀ SERVIE N'OFFRE PAS DE BOUTON — cliquer ne pourrait que
 *     produire un refus, et le refus se lirait comme une panne.
 *  3. LE LIEN VERS LE PASSEPORT SURVIT À TOUTES LES ISSUES. C'est la règle
 *     produit : le client a droit à son écran même si la carte a servi.
 *  4. UN ÉTAT INATTENDU PRODUIT UNE PHRASE, pas un écran muet — `too_soon`
 *     n'arrive jamais par ce chemin (le jeton contourne le cooldown), mais s'il
 *     arrivait, le repli parlerait.
 */

const PROPS = {
  programId: "prog-1",
  programName: "Carte du Café des Sports",
  organizationName: "Café des Sports",
  logoUrl: null,
  alreadyConsumed: false,
};

const bouton = () => screen.getByRole("button", { name: /Ajouter mon tampon/ });

beforeEach(() => {
  stampLoyaltyOrder.mockReset();
  // Le jeton n'est PLUS une prop : il vit dans l'adresse, et l'écran l'y relit
  // au moment du POST (une prop serveur → client serait recopiée en clair dans
  // le payload RSC, donc dans le HTML).
  window.history.replaceState({}, "", "/commande/CMD-TOKEN-1");
});
afterEach(cleanup);

describe("TamponCommande", () => {
  it("ne tamponne RIEN au chargement", () => {
    render(<TamponCommande {...PROPS} />);
    expect(stampLoyaltyOrder).not.toHaveBeenCalled();
    expect(bouton()).toBeTruthy();
  });

  it("envoie le jeton LU DE L'ADRESSE, pas une prop", async () => {
    // Le défaut gardé : reprendre une prop `token`. Elle traverserait la
    // frontière serveur → client, donc serait sérialisée en clair dans le HTML
    // (`self.__next_f.push`) — pour un jeton à usage unique qui pose un tampon.
    stampLoyaltyOrder.mockResolvedValue({
      ok: true,
      data: { state: "stamped", visitCount: 1, tier: "bronze", milestonesReached: [] },
    });
    window.history.replaceState({}, "", "/commande/CMD-DE-L-URL");
    render(<TamponCommande {...PROPS} />);
    bouton().click();

    await waitFor(() =>
      expect(stampLoyaltyOrder).toHaveBeenCalledWith({
        orderToken: "CMD-DE-L-URL",
        turnstileToken: null,
      }),
    );
  });

  it("succès : annonce le tampon, retire le bouton, offre le passeport", async () => {
    stampLoyaltyOrder.mockResolvedValue({
      ok: true,
      data: { state: "stamped", visitCount: 3, tier: "bronze", milestonesReached: [] },
    });
    render(<TamponCommande {...PROPS} />);
    bouton().click();

    expect(await screen.findByText("Tampon ajouté !")).toBeTruthy();
    // Le jeton est dépensé : reproposer le bouton inviterait à un second clic
    // qui ne pourrait que refuser.
    expect(screen.queryByRole("button", { name: /Ajouter mon tampon/ })).toBeNull();
    expect(
      screen.getByRole("link", { name: /Mon Passeport/ }).getAttribute("href"),
    ).toBe("/passeport/prog-1");
  });

  it("déjà servi À LA RÉPONSE : message calme (pas d'alerte) et passeport offert", async () => {
    stampLoyaltyOrder.mockResolvedValue({
      ok: true,
      data: { state: "order_invalid" },
    });
    render(<TamponCommande {...PROPS} />);
    bouton().click();

    expect(await screen.findByText("Carte déjà servie")).toBeTruthy();
    // Ton calme : aucune région `alert` — le client n'a rien fait de mal.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: /Mon Passeport/ })).toBeTruthy();
  });

  it("déjà servi AU CHARGEMENT : aucun bouton, et le passeport quand même", () => {
    render(<TamponCommande {...PROPS} alreadyConsumed />);

    expect(screen.queryByRole("button", { name: /Ajouter mon tampon/ })).toBeNull();
    expect(stampLoyaltyOrder).not.toHaveBeenCalled();
    expect(screen.getByText("Carte déjà servie")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Mon Passeport/ }).getAttribute("href"),
    ).toBe("/passeport/prog-1");
  });

  it("programme fermé : message générique, sans oracle sur le motif", async () => {
    stampLoyaltyOrder.mockResolvedValue({
      ok: true,
      data: { state: "unavailable" },
    });
    render(<TamponCommande {...PROPS} />);
    bouton().click();

    expect(await screen.findByText("Passeport indisponible")).toBeTruthy();
  });

  it("refus « challenge requis » : le contrôle s'affiche, pas un message d'erreur brut", async () => {
    stampLoyaltyOrder.mockResolvedValue({
      ok: false,
      error: "Contrôle anti-robot requis.",
      challengeRequired: true,
    });
    render(<TamponCommande {...PROPS} />);
    bouton().click();

    expect(await screen.findByTestId("turnstile")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("réseau coupé : le dit, et laisse le bouton pour réessayer", async () => {
    stampLoyaltyOrder.mockRejectedValue(new Error("offline"));
    render(<TamponCommande {...PROPS} />);
    bouton().click();

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Connexion perdue");
    expect(bouton()).toBeTruthy();
  });
});
