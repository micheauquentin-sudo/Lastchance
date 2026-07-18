import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  cancelCustomerSubscriptions,
  cancelCustomerSubscriptionsWithClient,
  getPlan,
  mapStripeStatus,
  PLANS,
} from "./stripe";

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

  it("les états transitoires retombent sur inactive", () => {
    expect(mapStripeStatus("incomplete")).toBe("inactive");
    expect(mapStripeStatus("paused")).toBe("inactive");
  });
});

describe("getPlan", () => {
  it("retourne l'offre demandée ou l'offre par défaut", () => {
    expect(getPlan("starter").id).toBe("starter");
    expect(getPlan("plan-disparu")).toBe(PLANS[0]);
    expect(getPlan("")).toBe(PLANS[0]);
  });

  it("expose des prix et durées d'essai cohérents", () => {
    for (const plan of PLANS) {
      expect(plan.priceMonthly).toBeGreaterThan(0);
      expect(plan.trialDays).toBeGreaterThanOrEqual(0);
    }
  });
});

function fakeStripe(subscriptions: Array<{ id: string; status: string }>) {
  const cancel = vi.fn(async () => undefined);
  const list = vi.fn(() => ({
    async *[Symbol.asyncIterator]() {
      for (const subscription of subscriptions) yield subscription;
    },
  }));
  return {
    stripe: { subscriptions: { list, cancel } } as unknown as Stripe,
    list,
    cancel,
  };
}

describe("cancelCustomerSubscriptionsWithClient", () => {
  it("parcourt toutes les pages et annule chaque abonnement encore actif", async () => {
    const subscriptions = Array.from({ length: 205 }, (_, index) => ({
      id: `sub_${index}`,
      status:
        index === 120
          ? "canceled"
          : index === 121
            ? "incomplete_expired"
            : "active",
    }));
    const { stripe, list, cancel } = fakeStripe(subscriptions);

    await cancelCustomerSubscriptionsWithClient(stripe, "cus_test");

    expect(list).toHaveBeenCalledWith({
      customer: "cus_test",
      status: "all",
      limit: 100,
    });
    expect(cancel).toHaveBeenCalledTimes(203);
    expect(cancel).not.toHaveBeenCalledWith("sub_120");
    expect(cancel).not.toHaveBeenCalledWith("sub_121");
    expect(cancel).toHaveBeenCalledWith("sub_204");
  });

  it("propage l'erreur Stripe pour bloquer la suppression locale", async () => {
    const stripe = {
      subscriptions: {
        list: () => ({
          async *[Symbol.asyncIterator]() {
            yield { id: "sub_active", status: "active" };
          },
        }),
        cancel: vi.fn(async () => {
          throw new Error("Stripe indisponible");
        }),
      },
    } as unknown as Stripe;

    await expect(
      cancelCustomerSubscriptionsWithClient(stripe, "cus_test"),
    ).rejects.toThrow("Stripe indisponible");
  });
});

describe("cancelCustomerSubscriptions", () => {
  it("échoue explicitement si Stripe n'est pas configuré", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    await expect(cancelCustomerSubscriptions("cus_test")).resolves.toEqual({
      ok: false,
      error: "Stripe n'est pas configuré.",
    });
    vi.unstubAllEnvs();
  });
});
