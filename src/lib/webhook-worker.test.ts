// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deliver: vi.fn(async () => undefined),
  reportError: vi.fn(),
}));

vi.mock("@/lib/webhooks", () => ({
  deliverWebhookEvent: () => mocks.deliver(),
}));
vi.mock("@/lib/monitoring", () => ({
  reportError: (...args: unknown[]) => mocks.reportError(...args),
}));

import { drainWebhookDeliveries, WEBHOOK_MAX_ATTEMPTS } from "./webhook-worker";
import type { createAdminClient } from "@/lib/supabase/admin";

interface Ecriture {
  op: "update" | "delete";
  values?: Record<string, unknown>;
  ids?: string[];
}

interface FakeOptions {
  /** Livraisons rendues par claim_webhook_deliveries. */
  claimed?: Array<{ id: string; attempts?: number }>;
  claimError?: string;
  /** Organisation lue pour chaque livraison (null = webhook désactivé). */
  webhookUrl?: string | null;
  /** Erreur rendue par la Nième écriture (1-indexé). */
  echecEcriture?: (ecriture: Ecriture, rang: number) => string | null;
}

function fakeAdmin(options: FakeOptions = {}) {
  const ecritures: Ecriture[] = [];
  const rpc: Array<{ fn: string; args: unknown }> = [];

  const resultat = (ecriture: Ecriture) => {
    ecritures.push(ecriture);
    const message = options.echecEcriture?.(ecriture, ecritures.length) ?? null;
    return Promise.resolve({ error: message ? { message } : null });
  };

  const admin = {
    rpc: async (fn: string, args: unknown) => {
      rpc.push({ fn, args });
      if (options.claimError) return { data: null, error: { message: options.claimError } };
      return {
        data: (options.claimed ?? []).map((d) => ({
          id: d.id,
          organization_id: "org-1",
          event: "spin.completed",
          data: {},
          created_at: new Date().toISOString(),
          attempts: d.attempts ?? 1,
        })),
        error: null,
      };
    },
    from(table: string) {
      if (table === "organizations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data:
                  options.webhookUrl === null
                    ? { webhook_url: null, webhook_secret: null }
                    : {
                        webhook_url: options.webhookUrl ?? "https://client.example.com/hook",
                        webhook_secret: "secret",
                      },
              }),
            }),
          }),
        };
      }
      return {
        update: (values: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => resultat({ op: "update", values, ids: [id] }),
          in: (_col: string, ids: string[]) => resultat({ op: "update", values, ids }),
        }),
        delete: () => {
          const chain = {
            not: () => chain,
            lt: () => resultat({ op: "delete" }),
          };
          return chain;
        },
      };
    },
  };

  // unsafe-cast-justification: bouchon minimal de client Supabase.
  return { admin: admin as unknown as ReturnType<typeof createAdminClient>, ecritures, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deliver.mockImplementation(async () => undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("drainWebhookDeliveries — taille du lot", () => {
  it("réclame 8 livraisons par défaut, et non 50", async () => {
    // Le facteur limitant n'est pas la base mais le temps de réponse des
    // endpoints tiers : un lot de 50 lents ne tient pas dans la fonction.
    const { admin, rpc } = fakeAdmin();
    await drainWebhookDeliveries(admin);
    expect(rpc[0]).toEqual({
      fn: "claim_webhook_deliveries",
      args: { p_limit: 8 },
    });
  });

  it("respecte un plafond explicite", async () => {
    const { admin, rpc } = fakeAdmin();
    await drainWebhookDeliveries(admin, { limit: 3 });
    expect(rpc[0]?.args).toEqual({ p_limit: 3 });
  });
});

describe("drainWebhookDeliveries — budget temps", () => {
  it("relâche le reliquat au lieu de se faire couper par la fonction", async () => {
    vi.useFakeTimers();
    // Chaque livraison consomme 30 s : la troisième dépasse le budget.
    mocks.deliver.mockImplementation(async () => {
      vi.advanceTimersByTime(30_000);
    });
    const { admin, ecritures } = fakeAdmin({
      claimed: [{ id: "a" }, { id: "b" }, { id: "c" }],
    });

    const summary = await drainWebhookDeliveries(admin, {
      budgetMs: 45_000,
      startedAt: Date.now(),
    });

    expect(summary.delivered).toBe(2);
    expect(summary.deferred).toBe(1);
    expect(mocks.deliver).toHaveBeenCalledTimes(2);

    // Sortie PROPRE : la livraison différée n'est ni délivrée ni en échec, et
    // son verrou est rendu — elle repart au passage suivant, pas dans 2 min.
    const relache = ecritures.find((e) => e.ids?.length === 1 && e.ids[0] === "c");
    expect(relache?.values).toEqual({ locked_until: null });
    expect(relache?.values).not.toHaveProperty("delivered_at");
    expect(relache?.values).not.toHaveProperty("failed_at");
  });

  it("ne tente rien quand le budget est déjà épuisé à l'entrée", async () => {
    const { admin, ecritures } = fakeAdmin({ claimed: [{ id: "a" }, { id: "b" }] });

    const summary = await drainWebhookDeliveries(admin, {
      budgetMs: 0,
      startedAt: Date.now(),
    });

    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ claimed: 2, delivered: 0, deferred: 2 });
    expect(ecritures[0]).toMatchObject({
      op: "update",
      values: { locked_until: null },
      ids: ["a", "b"],
    });
  });

  it("sans budget, traite tout le lot (comportement historique)", async () => {
    const { admin } = fakeAdmin({ claimed: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    const summary = await drainWebhookDeliveries(admin);
    expect(summary).toMatchObject({ claimed: 3, delivered: 3, deferred: 0 });
  });
});

describe("drainWebhookDeliveries — clôtures muettes", () => {
  it("compte et remonte une écriture de clôture refusée SANS tuer le drain", async () => {
    // La première clôture échoue ; les deux livraisons suivantes doivent tout
    // de même partir — lever ici abandonnerait le reste du lot.
    const { admin } = fakeAdmin({
      claimed: [{ id: "a" }, { id: "b" }, { id: "c" }],
      echecEcriture: (_e, rang) => (rang === 1 ? "conflit d'écriture" : null),
    });

    const summary = await drainWebhookDeliveries(admin);

    expect(summary.delivered).toBe(3);
    expect(summary.settleFailed).toBe(1);
    expect(mocks.reportError).toHaveBeenCalledWith(
      "webhooks.settle",
      expect.stringContaining("conflit d'écriture"),
    );
  });

  it("compte la purge des accusés quand elle échoue", async () => {
    const { admin } = fakeAdmin({
      echecEcriture: (e) => (e.op === "delete" ? "purge refusée" : null),
    });

    const summary = await drainWebhookDeliveries(admin);

    expect(summary.settleFailed).toBe(1);
    expect(mocks.reportError).toHaveBeenCalledWith(
      "webhooks.settle",
      expect.stringContaining("purge refusée"),
    );
  });

  it("compte la remise en file du reliquat quand elle échoue", async () => {
    const { admin } = fakeAdmin({
      claimed: [{ id: "a" }],
      echecEcriture: (e) => (e.ids?.length === 1 && e.op === "update" ? "verrou" : null),
    });

    const summary = await drainWebhookDeliveries(admin, {
      budgetMs: 0,
      startedAt: Date.now(),
    });

    expect(summary.deferred).toBe(1);
    expect(summary.settleFailed).toBe(1);
  });
});

describe("drainWebhookDeliveries — issues de livraison", () => {
  it("marque livré et purge sans compter d'échec", async () => {
    const { admin } = fakeAdmin({ claimed: [{ id: "a" }] });
    const summary = await drainWebhookDeliveries(admin);
    expect(summary).toEqual({
      claimed: 1,
      delivered: 1,
      deadLettered: 0,
      deferred: 0,
      settleFailed: 0,
    });
  });

  it("clôt sans livrer quand l'organisation n'a plus de webhook", async () => {
    const { admin, ecritures } = fakeAdmin({
      claimed: [{ id: "a" }],
      webhookUrl: null,
    });

    const summary = await drainWebhookDeliveries(admin);

    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(summary.delivered).toBe(0);
    expect(ecritures[0]?.values).toMatchObject({ last_error: "webhook disabled" });
  });

  it("passe en dead-letter à l'épuisement des tentatives", async () => {
    mocks.deliver.mockRejectedValue(new Error("503 chez le client"));
    const { admin, ecritures } = fakeAdmin({
      claimed: [{ id: "a", attempts: WEBHOOK_MAX_ATTEMPTS }],
    });

    const summary = await drainWebhookDeliveries(admin);

    expect(summary.deadLettered).toBe(1);
    expect(ecritures[0]?.values).toHaveProperty("failed_at");
  });

  it("rend un sommaire vide et remonte quand la réclamation échoue", async () => {
    const { admin } = fakeAdmin({ claimError: "rpc indisponible" });
    const summary = await drainWebhookDeliveries(admin);
    expect(summary).toEqual({
      claimed: 0,
      delivered: 0,
      deadLettered: 0,
      deferred: 0,
      settleFailed: 0,
    });
    expect(mocks.reportError).toHaveBeenCalledWith("webhooks.claim", "rpc indisponible");
  });
});
