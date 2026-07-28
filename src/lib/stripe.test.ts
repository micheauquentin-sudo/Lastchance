import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

/**
 * Fausse base : reproduit la sémantique d'un UPDATE conditionnel Postgres
 * (`where stripe_customer_id is null`), seule garantie réelle contre deux
 * checkouts simultanés.
 */
const db = vi.hoisted(() => ({
  /** Ligne `organizations` en base, null si l'organisation n'existe pas. */
  row: null as { stripe_customer_id: string | null } | null,
  selectError: null as { message: string } | null,
  updateError: null as { message: string } | null,
  /** Écriture d'un appel concurrent, jouée juste avant notre UPDATE. */
  concurrentWriter: null as null | (() => void),
  updates: [] as Array<{
    payload: Record<string, unknown>;
    filters: Record<string, unknown>;
  }>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const filters: Record<string, unknown> = {};
      let payload: Record<string, unknown> | null = null;

      const runUpdate = () => {
        if (db.updateError) return { data: null, error: db.updateError };
        db.concurrentWriter?.();
        db.updates.push({ payload: payload ?? {}, filters: { ...filters } });
        if (!db.row) return { data: [], error: null };
        // `.is("stripe_customer_id", null)` : l'écriture est refusée dès
        // qu'une valeur est déjà posée.
        if (
          filters.stripe_customer_id === null
          && db.row.stripe_customer_id !== null
        ) {
          return { data: [], error: null };
        }
        db.row = { ...db.row, ...payload };
        return {
          data: [{ stripe_customer_id: db.row.stripe_customer_id }],
          error: null,
        };
      };

      const builder = {
        select: () => builder,
        update: (next: Record<string, unknown>) => {
          payload = next;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        is: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        maybeSingle: async () =>
          db.selectError
            ? { data: null, error: db.selectError }
            : { data: db.row, error: null },
        // Le chemin UPDATE s'attend directement sur le builder.
        then: (
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve(runUpdate()).then(resolve, reject),
      };
      return builder;
    },
  }),
}));

import {
  cancelCustomerSubscriptions,
  cancelCustomerSubscriptionsWithClient,
  ensureStripeCustomer,
  getPlan,
  getPlanPriceId,
  isPlanPurchasable,
  mapStripeStatus,
  PLANS,
  resolveCheckoutPlan,
  resolveStripeEntitlements,
} from "./stripe";
import { PLAN_TIERS } from "./plans";

afterEach(() => {
  vi.unstubAllEnvs();
});

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
    expect(getPlan("starter").id).toBe("core");
    expect(getPlan("live").id).toBe("live");
    expect(getPlan("plan-disparu")).toBe(PLANS[0]);
    expect(getPlan("")).toBe(PLANS[0]);
  });

  it("expose des prix et durées d'essai cohérents", () => {
    for (const plan of PLANS) {
      expect(plan.priceMonthly).toBeGreaterThan(0);
      expect(plan.trialDays).toBeGreaterThanOrEqual(0);
    }
  });

  it("dérive les offres du catalogue versionné, dans le même ordre", () => {
    expect(PLANS.map((plan) => plan.id)).toEqual(
      PLAN_TIERS.map((tier) => tier.id),
    );
    expect(PLANS.map((plan) => plan.priceMonthly)).toEqual(
      PLAN_TIERS.map((tier) => tier.priceMonthly),
    );
    expect(PLANS.map((plan) => plan.entitlements)).toEqual(
      PLAN_TIERS.map((tier) => tier.entitlements),
    );
  });
});

describe("prix Stripe par environnement", () => {
  it("laisse toute offre non configurée hors souscription en ligne", () => {
    for (const plan of PLANS) {
      expect(getPlanPriceId(plan.id)).toBeUndefined();
      expect(isPlanPurchasable(plan.id)).toBe(false);
    }
  });

  it("accepte l'ancienne variable STARTER pour l'offre Core", () => {
    vi.stubEnv("STRIPE_PRICE_ID_STARTER", "price_legacy");
    expect(getPlanPriceId("core")).toBe("price_legacy");

    // La variable dédiée prime dès qu'elle est posée : bascule sans coupure.
    vi.stubEnv("STRIPE_PRICE_ID_CORE", "price_core");
    expect(getPlanPriceId("core")).toBe("price_core");
    expect(isPlanPurchasable("core")).toBe(true);
  });

  it("n'attribue le price d'une offre à aucune autre", () => {
    vi.stubEnv("STRIPE_PRICE_ID_FULL", "price_full");
    expect(getPlanPriceId("full")).toBe("price_full");
    expect(getPlanPriceId("live")).toBeUndefined();
    expect(getPlanPriceId("engagement")).toBeUndefined();
  });
});

describe("resolveCheckoutPlan", () => {
  it("facture l'offre de l'organisation en l'absence de demande", () => {
    vi.stubEnv("STRIPE_PRICE_ID_STARTER", "price_core");
    const result = resolveCheckoutPlan({
      requestedPlanId: null,
      organizationPlanId: "starter",
    });
    expect(result).toMatchObject({ ok: true, priceId: "price_core" });
  });

  it("honore l'offre demandée par un CTA d'upgrade", () => {
    vi.stubEnv("STRIPE_PRICE_ID_STARTER", "price_core");
    vi.stubEnv("STRIPE_PRICE_ID_FULL", "price_full");
    const result = resolveCheckoutPlan({
      requestedPlanId: "full",
      organizationPlanId: "starter",
    });
    expect(result).toMatchObject({ ok: true, priceId: "price_full" });
  });

  it("refuse une offre inconnue au lieu de facturer l'offre d'entrée", () => {
    vi.stubEnv("STRIPE_PRICE_ID_STARTER", "price_core");
    expect(
      resolveCheckoutPlan({
        requestedPlanId: "premium-inexistant",
        organizationPlanId: "starter",
      }),
    ).toEqual({ ok: false, error: "Offre inconnue." });
  });

  it("échoue proprement, sans appel Stripe, si le price manque", () => {
    // Message exact attendu par e2e/stripe-webhook.spec.ts.
    expect(
      resolveCheckoutPlan({
        requestedPlanId: null,
        organizationPlanId: "starter",
      }),
    ).toEqual({
      ok: false,
      error: "La facturation de l'offre Core n'est pas encore configurée.",
    });
  });
});

describe("resolveStripeEntitlements", () => {
  it("dérive les droits du plan et de ses items additionnels", () => {
    vi.stubEnv("STRIPE_PRICE_ID_LIVE", "price_live");
    vi.stubEnv("STRIPE_PRICE_ID_ADDON_HUNTS", "price_hunts");

    expect(
      resolveStripeEntitlements(["price_live", "price_hunts"]),
    ).toEqual({
      planId: "live",
      entitlements: [
        "core",
        "events",
        "pronostics",
        "jackpot",
        "quiz",
        "hunts",
      ],
      unknownPriceIds: [],
    });
  });

  it("signale tout prix inconnu au lieu de retirer silencieusement les droits", () => {
    expect(resolveStripeEntitlements(["price_unknown"])).toEqual({
      planId: "core",
      entitlements: [],
      unknownPriceIds: ["price_unknown"],
    });
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
    // unsafe-cast-justification: mock Stripe limite au sous-ensemble teste.
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
      // unsafe-cast-justification: mock Stripe limite au sous-ensemble teste.
    } as unknown as Stripe;

    await expect(
      cancelCustomerSubscriptionsWithClient(stripe, "cus_test"),
    ).rejects.toThrow("Stripe indisponible");
  });
});

describe("ensureStripeCustomer — l'association org ↔ client est idempotente", () => {
  const ORG_ID = "30000000-0000-4000-8000-000000000001";

  const IDEMPOTENCY_KEY = `lc-customer-${ORG_ID}`;

  function fakeCustomers(id = "cus_new") {
  const create = vi.fn(async () => ({ id }));
  return {
    // unsafe-cast-justification: mock Stripe limite au sous-ensemble teste.
    stripe: { customers: { create } } as unknown as Stripe,
      create,
    };
  }

  /** Client Stripe qui refuse la création avec une erreur donnée. */
  function failingCustomers(error: unknown) {
    const create = vi.fn(async () => {
      throw error;
  });
  return {
    // unsafe-cast-justification: mock Stripe limite au sous-ensemble teste.
    stripe: { customers: { create } } as unknown as Stripe,
      create,
    };
  }

  /**
   * 409 : requête identique encore en vol. Le SDK ne la classe PAS en
   * StripeIdempotencyError (réservée aux 400/404), seul `rawType` la trahit.
   */
  const inFlightConflict = () =>
    new Stripe.errors.StripeAPIError({
      type: "idempotency_error",
      statusCode: 409,
      message: "There is currently another in-progress request using this key",
    });

  /** 400 : même clé rejouée avec d'autres paramètres (autre owner, autre email). */
  const replayedWithOtherParams = () =>
    new Stripe.errors.StripeIdempotencyError({
      type: "idempotency_error",
      statusCode: 400,
      message: "Keys for idempotent requests can only be used with the same parameters",
    });

  const ensure = (stripe: Stripe, existingCustomerId: string | null = null) =>
    ensureStripeCustomer(stripe, {
      organizationId: ORG_ID,
      organizationName: "Le Comptoir",
      email: "owner@example.com",
      existingCustomerId,
    });

  let logs: string[] = [];

  beforeEach(() => {
    db.row = { stripe_customer_id: null };
    db.selectError = null;
    db.updateError = null;
    db.concurrentWriter = null;
    db.updates = [];
    // Les chemins d'échec journalisent volontairement : on capture au lieu de
    // polluer la sortie, et on vérifie plus bas ce qui y transite.
    logs = [];
    const capture = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    vi.spyOn(console, "error").mockImplementation(capture);
    vi.spyOn(console, "warn").mockImplementation(capture);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("réutilise l'identifiant connu de l'appelant sans toucher à Stripe", async () => {
    const { stripe, create } = fakeCustomers();

    await expect(ensure(stripe, "cus_known")).resolves.toBe("cus_known");
    expect(create).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
  });

  it("relit la base : un instantané périmé ne crée pas un second client", async () => {
    db.row = { stripe_customer_id: "cus_enregistre" };
    const { stripe, create } = fakeCustomers();

    await expect(ensure(stripe, null)).resolves.toBe("cus_enregistre");
    expect(create).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
  });

  it("crée le client et l'associe quand l'organisation n'en a aucun", async () => {
    const { stripe, create } = fakeCustomers("cus_new");

    await expect(ensure(stripe)).resolves.toBe("cus_new");
    // La clé d'idempotence est ce qui interdit à Stripe de créer un doublon.
    expect(create).toHaveBeenCalledWith(
      {
        email: "owner@example.com",
        name: "Le Comptoir",
        metadata: { organization_id: ORG_ID },
      },
      { idempotencyKey: IDEMPOTENCY_KEY },
    );
    expect(db.row).toEqual({ stripe_customer_id: "cus_new" });
    // L'écriture reste conditionnée à l'absence d'association.
    expect(db.updates).toEqual([
      {
        payload: { stripe_customer_id: "cus_new" },
        filters: { id: ORG_ID, stripe_customer_id: null },
      },
    ]);
  });

  it("la clé d'idempotence est déterministe et stable d'un appel à l'autre", async () => {
    const first = fakeCustomers("cus_new");
    await ensure(first.stripe);
    db.row = { stripe_customer_id: null };
    const second = fakeCustomers("cus_new");
    await ensure(second.stripe);

    const keyOf = (create: ReturnType<typeof vi.fn>) =>
      (create.mock.calls[0]?.[1] as { idempotencyKey: string }).idempotencyKey;
    expect(keyOf(first.create)).toBe(keyOf(second.create));
    expect(keyOf(first.create)).toContain(ORG_ID);
  });

  it("course perdue : conserve l'identifiant du gagnant, n'écrase rien", async () => {
    // Un checkout concurrent associe son client entre notre lecture et notre
    // écriture — exactement le double-clic sur le bouton d'abonnement. La clé
    // d'idempotence fait rejouer la MÊME réponse Stripe aux deux appels.
    db.concurrentWriter = () => {
      db.row = { stripe_customer_id: "cus_gagnant" };
    };
    const { stripe } = fakeCustomers("cus_gagnant");

    await expect(ensure(stripe)).resolves.toBe("cus_gagnant");
    expect(db.row).toEqual({ stripe_customer_id: "cus_gagnant" });
  });

  it("course perdue hors fenêtre d'idempotence : n'écrase pas l'association", async () => {
    // Au-delà de 24 h la clé Stripe a expiré : un second client PEUT naître.
    // L'UPDATE conditionnel reste alors le dernier filet.
    db.concurrentWriter = () => {
      db.row = { stripe_customer_id: "cus_gagnant" };
    };
    const { stripe } = fakeCustomers("cus_perdant");

    await expect(ensure(stripe)).resolves.toBe("cus_gagnant");
    expect(db.row).toEqual({ stripe_customer_id: "cus_gagnant" });
  });

  it("conflit 409 (requête concurrente en vol) : réutilise le client déjà associé", async () => {
    db.row = { stripe_customer_id: null };
    const { stripe } = failingCustomers(inFlightConflict());
    // Le gagnant a fini d'écrire pendant que Stripe nous refusait la clé.
    db.row = { stripe_customer_id: "cus_gagnant" };

    await expect(ensure(stripe, null)).resolves.toBe("cus_gagnant");
  });

  it("conflit 400 (clé rejouée par un autre owner) : réutilise le client associé", async () => {
    const { stripe } = failingCustomers(replayedWithOtherParams());
    db.row = { stripe_customer_id: "cus_premier_owner" };

    await expect(ensure(stripe, null)).resolves.toBe("cus_premier_owner");
  });

  it("conflit d'idempotence sans association encore écrite : échoue sans créer de doublon", async () => {
    const { stripe } = failingCustomers(inFlightConflict());

    await expect(ensure(stripe)).rejects.toThrow(
      "Impossible d'associer le client Stripe",
    );
    expect(db.row).toEqual({ stripe_customer_id: null });
  });

  it("toute autre panne Stripe remonte telle quelle", async () => {
    const { stripe } = failingCustomers(
      new Stripe.errors.StripeAPIError({
        type: "api_error",
        statusCode: 500,
        message: "Stripe indisponible",
      }),
    );

    await expect(ensure(stripe)).rejects.toThrow("Stripe indisponible");
    expect(db.row).toEqual({ stripe_customer_id: null });
  });

  it("échec d'association : remonte l'erreur sans rendre un id non enregistré", async () => {
    db.updateError = { message: "deadlock detected" };
    const { stripe } = fakeCustomers();

    await expect(ensure(stripe)).rejects.toThrow(
      "Impossible d'associer le client Stripe",
    );
    expect(db.row).toEqual({ stripe_customer_id: null });
  });

  it("échec de lecture : remonte l'erreur avant tout appel à Stripe", async () => {
    db.selectError = { message: "connection reset" };
    const { stripe, create } = fakeCustomers();

    await expect(ensure(stripe)).rejects.toThrow(
      "Impossible d'associer le client Stripe",
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("organisation introuvable : échoue au lieu de rendre un id orphelin", async () => {
    db.row = null;
    const { stripe } = fakeCustomers();

    await expect(ensure(stripe)).rejects.toThrow(
      "Impossible d'associer le client Stripe",
    );
  });

  it("ne journalise aucun identifiant Stripe ni organisation", async () => {
    // Course perdue puis organisation introuvable : les deux chemins bavards.
    db.concurrentWriter = () => {
      db.row = { stripe_customer_id: "cus_gagnant" };
    };
    await ensure(fakeCustomers("cus_perdant").stripe);

    db.concurrentWriter = null;
    db.row = null;
    await expect(ensure(fakeCustomers().stripe)).rejects.toThrow();

    db.row = { stripe_customer_id: null };
    await expect(
      ensure(failingCustomers(inFlightConflict()).stripe),
    ).rejects.toThrow();

    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toContain(ORG_ID);
      expect(line).not.toContain("cus_");
      expect(line).not.toContain(IDEMPOTENCY_KEY);
    }
  });
});

describe("cancelCustomerSubscriptions", () => {
  it("échoue explicitement si Stripe n'est pas configuré", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    await expect(cancelCustomerSubscriptions("cus_test")).resolves.toEqual({
      ok: false,
      error: "Stripe n'est pas configuré.",
    });
  });
});
