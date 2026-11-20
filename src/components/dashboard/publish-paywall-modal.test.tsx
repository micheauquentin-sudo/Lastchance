// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublishPaywallModal } from "@/components/dashboard/publish-paywall-modal";

vi.mock("@/actions/billing", () => ({
  createCheckoutSession: vi.fn(),
  createAddonCheckoutSession: vi.fn(),
  activateAddonGrant: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe("PublishPaywallModal", () => {
  it("affiche les options ciblées pour un propriétaire (add-on, offre incluse, La Totale)", () => {
    render(
      <PublishPaywallModal
        open
        onClose={vi.fn()}
        entitlement="quiz"
        peutAcheter
      />,
    );

    expect(screen.getByText(/Publier « Quiz »/)).toBeTruthy();
    expect(screen.getByText("Quiz express")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choisir Le Club" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choisir La Totale" })).toBeTruthy();
  });

  it("n'affiche aucun bouton de paiement si l'utilisateur n'est pas propriétaire", () => {
    render(
      <PublishPaywallModal
        open
        onClose={vi.fn()}
        entitlement="quiz"
        peutAcheter={false}
      />,
    );

    expect(screen.getByText(/Seul le propriétaire du compte/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Choisir/ })).toBeNull();
  });

  it("se ferme sur clic du bouton Fermer", () => {
    const onClose = vi.fn();
    render(
      <PublishPaywallModal
        open
        onClose={onClose}
        entitlement="core"
        peutAcheter
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
