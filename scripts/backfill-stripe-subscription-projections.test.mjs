import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProductionSupabaseUrl,
  parseArgs,
  projectSubscriptionItems,
  reconcileSubscriptionProjections,
} from "./backfill-stripe-subscription-projections.mjs";

const item = {
  id: "si_test",
  quantity: 2,
  current_period_end: 1_800_000_000,
  price: {
    id: "price_test",
    product: "prod_test",
    nickname: "Option",
    currency: "eur",
    unit_amount: 2000,
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
  },
};

test("la confirmation explicite est obligatoire et le dry-run est accepté", () => {
  assert.deepEqual(parseArgs(["--confirm-production", "--dry-run"]), {
    confirmProduction: true,
    dryRun: true,
  });
  assert.throws(() => parseArgs(["--unsafe"]), /Argument inconnu/);
});

test("la cible Supabase doit être HTTPS et exactement la production", () => {
  assert.equal(
    assertProductionSupabaseUrl("https://drwzwvgxjknrgpfmthaf.supabase.co"),
    "https://drwzwvgxjknrgpfmthaf.supabase.co/",
  );
  assert.throws(
    () => assertProductionSupabaseUrl("http://drwzwvgxjknrgpfmthaf.supabase.co"),
    /Refus/,
  );
});

test("la projection reproduit le MRR mensuel sans montant partiel", () => {
  const projected = projectSubscriptionItems({ items: { data: [item] } });
  assert.equal(projected.mrrMonthlyCents, 4000);
  assert.equal(projected.items[0].monthly_amount_cents, 4000);
  assert.equal(projected.nextBillingAt, "2027-01-15T08:00:00.000Z");
});

test("le dry-run valide les prix et ne touche jamais Supabase", async () => {
  const subscription = {
    id: "sub_test",
    customer: "cus_test",
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    items: { data: [item], has_more: false },
  };
  const stripe = {
    prices: {
      retrieve: async (priceId) => ({
        active: true,
        livemode: true,
        currency: "eur",
        unit_amount: priceId === "price_vitrine" ? 2000 : 3000,
        recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
        product: { active: true },
      }),
    },
    subscriptions: {
      list: () => ({ async *[Symbol.asyncIterator]() { yield subscription; } }),
      retrieve: async () => subscription,
    },
  };
  const supabase = { rpc: async () => { throw new Error("ne doit pas être appelée"); } };
  const result = await reconcileSubscriptionProjections({
    stripe,
    supabase,
    priceIds: { vitrine: "price_vitrine", reserver: "price_reserver" },
    dryRun: true,
  });
  assert.deepEqual(result, {
    scanned: 1,
    applied: 0,
    unchanged: 1,
    unmatchedCustomer: 0,
    truncatedItems: 0,
    failed: 0,
  });
});

test("un prix test ou un montant non conforme arrête le rattrapage", async () => {
  const stripe = {
    prices: {
      retrieve: async () => ({
        active: true,
        livemode: false,
        currency: "eur",
        unit_amount: 2000,
        recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
        product: { active: true },
      }),
    },
    subscriptions: { list: () => ({ async *[Symbol.asyncIterator]() {} }) },
  };
  await assert.rejects(
    reconcileSubscriptionProjections({
      stripe,
      supabase: { rpc: async () => ({ data: null, error: null }) },
      priceIds: { vitrine: "price_vitrine", reserver: "price_reserver" },
      dryRun: true,
    }),
    /Configuration de prix/,
  );
});
