import { describe, expect, it } from "vitest";
import { getPlan, mapStripeStatus, PLANS } from "./stripe";

describe("mapStripeStatus — statut Stripe → statut interne", () => {
  it("mappe les statuts directs", () => {
    expect(mapStripeStatus("trialing")).toBe("trialing");
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("past_due")).toBe("past_due");
  });

  it("regroupe les fins d'abonnement sous canceled", () => {
    expect(mapStripeStatus("canceled")).toBe("canceled");
    expect(mapStripeStatus("unpaid")).toBe("canceled");
    expect(mapStripeStatus("incomplete_expired")).toBe("canceled");
  });

  it("les états transitoires ou inconnus retombent sur inactive", () => {
    expect(mapStripeStatus("incomplete")).toBe("inactive");
    expect(mapStripeStatus("paused")).toBe("inactive");
  });
});

describe("getPlan", () => {
  it("retourne l'offre demandée", () => {
    expect(getPlan("starter").id).toBe("starter");
  });

  it("retombe sur la première offre pour un plan inconnu (jamais de crash)", () => {
    expect(getPlan("plan-disparu")).toBe(PLANS[0]);
    expect(getPlan("")).toBe(PLANS[0]);
  });

  it("chaque offre expose prix et durée d'essai cohérents", () => {
    for (const plan of PLANS) {
      expect(plan.priceMonthly).toBeGreaterThan(0);
      expect(plan.trialDays).toBeGreaterThanOrEqual(0);
    }
  });
});
