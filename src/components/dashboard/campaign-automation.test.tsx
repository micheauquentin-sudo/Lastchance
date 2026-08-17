// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/campaigns", () => ({
  resumeCampaignAfterBudget: vi.fn(),
  updateCampaignAutomation: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { CampaignStateBanner } = await import(
  "@/components/dashboard/campaign-automation"
);

import type { Campaign } from "@/types/database";

/**
 * LA BANNIÈRE MENTAIT QUAND LE DROIT EXPIRAIT (constat SD-9).
 *
 * `droit_expire` n'avait pas de branche : après le cas `schedule_end`, tout
 * tombait sur le repli budget. Un commerçant dont le pass venait de se
 * terminer lisait donc « budget de gains atteint (0,00 €) » — un plafond qu'il
 * n'a jamais posé, sur une campagne qu'aucun réglage de budget ne rouvrira.
 * Il allait chercher au mauvais endroit, et l'écran l'y envoyait.
 *
 * Ce que ces tests gravent, et qui ne peut pas se relire à l'œil : le texte
 * budget est ABSENT de cette pause-là. Un futur repli mal ordonné le
 * réintroduirait sans rien casser d'autre.
 */

afterEach(cleanup);

function campagne(
  paused_reason: Campaign["paused_reason"],
): Parameters<typeof CampaignStateBanner>[0]["campaign"] {
  return {
    id: "camp-1",
    status: "paused",
    paused_reason,
    budget_cents: null,
    budget_spent_cents: 0,
    starts_at: null,
    ends_at: null,
  };
}

describe("CampaignStateBanner — pause pour droit expiré", () => {
  it("dit que l'option qui ouvre la roue est terminée", () => {
    render(<CampaignStateBanner campaign={campagne("droit_expire")} />);
    expect(
      screen.getByText(/l'option qui ouvre la roue est terminée/),
    ).toBeTruthy();
  });

  it("ne parle JAMAIS de budget de gains", () => {
    render(<CampaignStateBanner campaign={campagne("droit_expire")} interactive />);
    expect(screen.queryByText(/budget de gains atteint/)).toBeNull();
    expect(screen.queryByText(/0 €/)).toBeNull();
  });

  /**
   * Pas de bouton « Reprendre » : le cron rouvre la campagne au rachat, et un
   * geste manuel serait refusé en base. La bannière l'annonce au lieu de
   * l'offrir.
   */
  it("annonce la réouverture automatique, sans bouton de relance", () => {
    render(<CampaignStateBanner campaign={campagne("droit_expire")} interactive />);
    expect(screen.getByText(/rouvre la campagne d'elle-même/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Reprendre la campagne/ }),
    ).toBeNull();
  });

  it("mène aux offres", () => {
    render(<CampaignStateBanner campaign={campagne("droit_expire")} />);
    const lien = screen.getByRole("link", { name: "Voir les offres" });
    expect(lien.getAttribute("href")).toBe("/dashboard/settings/modules");
  });
});

describe("CampaignStateBanner — les autres pauses sont intactes", () => {
  it("garde la bannière budget pour budget_reached", () => {
    render(<CampaignStateBanner campaign={campagne("budget_reached")} />);
    expect(screen.getByText(/budget de gains atteint/)).toBeTruthy();
  });

  it("garde la bannière de fin de programmation", () => {
    render(<CampaignStateBanner campaign={campagne("schedule_end")} />);
    expect(screen.getByText(/Campagne terminée/)).toBeTruthy();
    expect(screen.queryByText(/budget de gains atteint/)).toBeNull();
  });
});
