import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fake = vi.hoisted(() => ({
  tablesRead: [] as string[],
  projections: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/admin/db", () => ({
  createAdminBackofficeClient: () => ({
    from: (table: string) => {
      fake.tablesRead.push(table);
      const builder = {
        select: () => builder,
        order: () => builder,
        range: () => builder,
        eq: () => builder,
        is: () => builder,
        not: () => builder,
        or: () => builder,
        in: () => builder,
        then: (
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve(
          table === "organizations"
            ? {
                data: [{
                  id: "org-1",
                  name: "Commerce",
                  slug: "commerce",
                  subscription_status: "active",
                  stripe_event_created_at: "2026-08-23T10:00:00Z",
                  plan: "place",
                  trial_ends_at: "2026-08-30T10:00:00Z",
                  created_at: "2026-08-01T10:00:00Z",
                }],
                count: 1,
              }
            : { data: fake.projections, count: fake.projections.length },
        ).then(resolve, reject),
      };
      return builder;
    },
  }),
}));

import { listMerchants } from "./data";

describe("listMerchants billing RBAC", () => {
  beforeEach(() => {
    fake.tablesRead = [];
    fake.projections = [{
      organization_id: "org-1",
      subscription_id: "sub-1",
      stripe_status: "active",
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      next_billing_at: "2026-09-23T10:00:00Z",
      items: [],
      mrr_monthly_cents: 7_900,
      projection_version: 1,
      synced_at: "2026-08-23T10:00:00Z",
    }];
  });

  it("ne lit aucune donnee Stripe sans opt-in stripe.view", async () => {
    const result = await listMerchants({});

    expect(fake.tablesRead).toEqual(["organizations"]);
    expect(result.rows[0]?.billing).toBeUndefined();
  });

  it("lit et resume la projection avec opt-in explicite", async () => {
    const result = await listMerchants({ includeBilling: true });

    expect(fake.tablesRead).toContain("stripe_subscription_projections");
    expect(result.rows[0]?.billing).toEqual(expect.objectContaining({
      mrrMonthlyCents: 7_900,
      activeSubscriptionCount: 1,
    }));
  });
});
