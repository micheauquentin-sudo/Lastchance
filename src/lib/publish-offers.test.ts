import { describe, expect, it } from "vitest";
import { buildPublishOffers } from "@/lib/publish-offers";

describe("buildPublishOffers", () => {
  it("propose l'add-on seul, l'offre la moins chère et La Totale pour un module autonome (quiz)", () => {
    const offers = buildPublishOffers("quiz");
    expect(offers.moduleLabel).toBe("Quiz");
    expect(offers.standaloneAddon?.offer.entitlement).toBe("quiz");
    expect(offers.subscriptionLineAddon).toBeNull();
    expect(offers.cheapestTier?.tier.id).toBe("engagement");
    expect(offers.fullTier?.tier.id).toBe("full");
  });

  it("propose Sur Place et La Totale (plus la ligne d'abonnement) pour Vitrine", () => {
    const offers = buildPublishOffers("vitrine");
    expect(offers.moduleLabel).toBe("Vitrine");
    expect(offers.standaloneAddon).toBeNull();
    expect(offers.subscriptionLineAddon?.offer.entitlement).toBe("vitrine");
    expect(offers.cheapestTier?.tier.id).toBe("place");
    expect(offers.fullTier?.tier.id).toBe("full");
  });

  it("propose Coup d'envoi et La Totale pour le socle core sans add-on", () => {
    const offers = buildPublishOffers("core");
    expect(offers.moduleLabel).toBe("Jeux instantanés");
    expect(offers.standaloneAddon).toBeNull();
    expect(offers.subscriptionLineAddon).toBeNull();
    expect(offers.cheapestTier?.tier.id).toBe("core");
    expect(offers.fullTier?.tier.id).toBe("full");
  });
});
