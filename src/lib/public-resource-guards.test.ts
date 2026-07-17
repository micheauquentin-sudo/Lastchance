import { describe, expect, it } from "vitest";
import {
  isConsistentClaimResourceChain,
  isConsistentPlayResourceChain,
} from "./public-resource-guards";

describe("public resource guards", () => {
  const campaign = { id: "campaign-a", organization_id: "org-a" };
  const wheel = { id: "wheel-a", organization_id: "org-a", campaign_id: "campaign-a" };
  const prize = { id: "prize-a", organization_id: "org-a", wheel_id: "wheel-a" };

  it("accepte une chaîne de jeu appartenant au même tenant", () => {
    expect(isConsistentPlayResourceChain({
      qr: { id: "qr-a", organization_id: "org-a", campaign_id: "campaign-a" },
      campaign,
      wheel,
      prizes: [prize],
    })).toBe(true);
  });

  it("refuse un lot injecté depuis une autre organisation", () => {
    expect(isConsistentPlayResourceChain({
      qr: { id: "qr-a", organization_id: "org-a", campaign_id: "campaign-a" },
      campaign,
      wheel,
      prizes: [{ ...prize, organization_id: "org-b" }],
    })).toBe(false);
  });

  it("refuse un gain dont la roue ne correspond pas au spin", () => {
    expect(isConsistentClaimResourceChain({
      spin: {
        id: "spin-a",
        organization_id: "org-a",
        campaign_id: "campaign-a",
        wheel_id: "wheel-b",
        prize_id: "prize-a",
      },
      campaign,
      wheel,
      prize,
    })).toBe(false);
  });
});
