// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/hunts", () => ({
  claimHuntReward: vi.fn(),
  stampHuntStep: vi.fn(),
}));
vi.mock("@/components/wheel/redeem-qr", () => ({
  RedeemQr: ({ value }: { value: string }) => (
    <output data-testid="redeem-qr">{value}</output>
  ),
}));
vi.mock("@/components/loyalty/proposer-passeport", () => ({
  ProposerPasseport: ({ organizationId }: { organizationId: string }) => (
    <output data-testid="passport-invitation">{organizationId}</output>
  ),
}));
vi.mock("@/components/wallet/lien-portefeuille", () => ({
  LienPortefeuille: () => null,
}));

import { HuntJourney, type HuntJourneyProps } from "@/components/hunts/hunt-journey";

afterEach(cleanup);

const baseProps: HuntJourneyProps = {
  organizationName: "Café des Sports",
  organizationId: "org-1",
  logoUrl: null,
  huntName: "Le parcours du marché",
  orderMode: "free",
  step: { position: 2, label: "Le comptoir" },
  reward: { label: "Un café", details: null },
  initial: {
    total: 2,
    done: 2,
    stamped: [1, 2],
    completedCode: "CHASSE-ABC123",
    rewardSoldOut: false,
  },
  revealedHint: null,
};

describe("HuntJourney — gain de Chasse au QR", () => {
  it("rend le QR du code CHASSE et la proposition de Passeport après un gain", () => {
    render(<HuntJourney {...baseProps} />);

    expect(screen.getByTestId("redeem-qr").textContent).toBe("CHASSE-ABC123");
    expect(screen.getByTestId("passport-invitation").textContent).toBe("org-1");
    expect(screen.getByText("Chasse au QR terminée — bravo !")).toBeTruthy();
    expect(screen.getByText(/code ou faites scanner le QR/i)).toBeTruthy();
  });

  it("ne propose ni QR ni Passeport sans code de gain", () => {
    render(
      <HuntJourney
        {...baseProps}
        initial={{ ...baseProps.initial, completedCode: null, rewardSoldOut: true }}
      />,
    );

    expect(screen.queryByTestId("redeem-qr")).toBeNull();
    expect(screen.queryByTestId("passport-invitation")).toBeNull();
  });
});
