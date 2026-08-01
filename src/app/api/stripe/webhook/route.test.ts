// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieve: vi.fn(),
  rpc: vi.fn(),
  resolveStripeEntitlements: vi.fn(),
  reportError: vi.fn(),
  writeAuditLog: vi.fn(),
}));

/**
 * FAUSSE TABLE `stripe_events`, avec la seule propriété qui compte : sa clé
 * primaire. Un `upsert(..., { ignoreDuplicates: true })` sur un identifiant
 * déjà présent ne rend AUCUNE ligne — c'est exactement ce que fait
 * `on conflict (id) do nothing` en base, et c'est là-dessus que repose
 * l'idempotence du crédit.
 */
const events = vi.hoisted(() => ({
  rows: new Map<string, { processed_at: string | null }>(),
  upsertError: null as { message: string } | null,
  deleteError: null as { message: string } | null,
  deletes: [] as string[],
}));

/**
 * FAUX GRAND LIVRE, avec la seule propriété qui compte : l'index unique
 * partiel `sms_credit_entries_one_purchase_per_reference` (20260828120000).
 * Un `purchase` portant une référence déjà créditée pour l'organisation rend
 * LE mouvement existant — il n'en crée pas un second et ne lève pas.
 *
 * Compter les APPELS à `credit_sms_balance` ne dit donc plus rien sur l'argent
 * : c'est `entries.size` qui compte les mouvements réels. La distinction est
 * le sujet même de ce lot — la clé d'idempotence est le PAIEMENT, pas
 * l'événement Stripe, dont l'identifiant change au rejeu et diffère entre
 * `completed` et `async_payment_succeeded` d'une MÊME session.
 */
const ledger = vi.hoisted(() => ({
  entries: new Map<string, string>(),
  /**
   * Rend `[{ entry_id, created }]` et non un scalaire.
   *
   * `credit_sms_balance` est un `returns table(...)` depuis `20260829120000` :
   * PostgREST le livre en LIGNES. `created` est la seule information qui
   * distingue sans course un mouvement écrit d'un mouvement réutilisé — c'est
   * l'`on conflict … do nothing` qui la produit, dans la même instruction que
   * l'écriture. Un double qui rendrait encore un uuid nu laisserait le test
   * vert sur un appelant incapable de faire la différence.
   */
  credit(args: { p_organization_id: string; p_reason: string; p_reference: string | null }) {
    const key = `${args.p_organization_id}|${args.p_reference}`;
    if (args.p_reason === "purchase" && args.p_reference) {
      const existing = ledger.entries.get(key);
      if (existing) {
        return { data: [{ entry_id: existing, created: false }], error: null };
      }
    }
    const id = `entry-${ledger.entries.size + 1}`;
    ledger.entries.set(key, id);
    return { data: [{ entry_id: id, created: true }], error: null };
  },
}));

vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe")>(
    "@/lib/stripe",
  );
  return {
    // `readSmsCreditPurchase` N'EST PAS remplacée : c'est elle qui décide
    // qu'une session est un achat payé, et la remplacer ferait passer le test
    // à côté de la garde `payment_status`.
    readSmsCreditPurchase: actual.readSmsCreditPurchase,
    SMS_CREDIT_PURCHASE: actual.SMS_CREDIT_PURCHASE,
    getStripe: () => ({
      webhooks: { constructEvent: mocks.constructEvent },
      subscriptions: { retrieve: mocks.retrieve },
    }),
    mapStripeStatus: (status: string) => status,
    resolveStripeEntitlements: (...args: unknown[]) =>
      mocks.resolveStripeEntitlements(...args),
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table !== "stripe_events") throw new Error(`table inattendue : ${table}`);
      let filterId: string | null = null;
      const builder = {
        upsert: (
          row: { id: string },
          options?: { ignoreDuplicates?: boolean },
        ) => {
          const done = () => {
            if (events.upsertError) {
              return { data: null, error: events.upsertError };
            }
            if (events.rows.has(row.id) && options?.ignoreDuplicates) {
              return { data: [], error: null };
            }
            events.rows.set(row.id, { processed_at: null });
            return { data: [{ id: row.id }], error: null };
          };
          return { select: async () => done() };
        },
        update: (payload: { processed_at: string }) => {
          const done = () => {
            if (filterId && events.rows.has(filterId)) {
              events.rows.set(filterId, { processed_at: payload.processed_at });
            }
            return { data: null, error: null };
          };
          return {
            eq: (_column: string, value: string) => {
              filterId = value;
              return Promise.resolve(done());
            },
          };
        },
        delete: () => ({
          eq: async (_column: string, value: string) => {
            events.deletes.push(value);
            if (events.deleteError) return { data: null, error: events.deleteError };
            events.rows.delete(value);
            return { data: null, error: null };
          },
        }),
      };
      return builder;
    },
  }),
}));
vi.mock("@/lib/audit", () => ({
  writeAuditLog: (...args: unknown[]) => mocks.writeAuditLog(...args),
}));
vi.mock("@/lib/monitoring", () => ({
  monitored: (_name: string, fn: () => unknown) => fn(),
  reportError: (...args: unknown[]) => mocks.reportError(...args),
  reportSecurityEvent: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ requiredEnv: () => "webhook-secret" }));

import { POST } from "./route";

const event = {
  id: "evt_1",
  type: "customer.subscription.updated",
  created: 1_700_000_000,
  data: { object: { id: "sub_1" } },
};

const request = () =>
  new Request("https://app.example.com/api/stripe/webhook", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "signed" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  events.rows.clear();
  events.upsertError = null;
  events.deleteError = null;
  events.deletes = [];
  mocks.constructEvent.mockReturnValue(event);
  mocks.retrieve.mockResolvedValue({
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    trial_end: null,
    items: {
      data: [
        { price: { id: "price_live" } },
        { price: { id: "price_hunts" } },
      ],
    },
  });
  mocks.resolveStripeEntitlements.mockReturnValue({
    planId: "live",
    entitlements: ["core", "events", "hunts"],
    unknownPriceIds: [],
  });
  mocks.rpc.mockResolvedValue({
    data: [
      {
        organization_id: "org-1",
        applied: true,
        duplicate: false,
      },
    ],
    error: null,
  });
});

describe("webhook Stripe — droits", () => {
  it("synchronise statut, plan et items dans une seule RPC V2", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_stripe_subscription_event_v2",
      expect.objectContaining({
        p_event_id: "evt_1",
        p_customer_id: "cus_1",
        p_subscription_id: "sub_1",
        p_plan_id: "live",
        p_entitlements: ["core", "events", "hunts"],
        p_price_ids: ["price_live", "price_hunts"],
      }),
    );
  });

  it("échoue plutôt que d'appliquer une liste d'items tronquée", async () => {
    mocks.retrieve.mockResolvedValue({
      id: "sub_1",
      status: "active",
      customer: "cus_1",
      trial_end: null,
      items: { has_more: true, data: [{ price: { id: "price_live" } }] },
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Abonnement non lisible en entier");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.reportError).toHaveBeenCalledWith(
      "stripe.items-truncated",
      expect.stringContaining("sub_1"),
    );
  });

  it("échoue pour que Stripe retente si un prix n'est pas configuré", async () => {
    mocks.resolveStripeEntitlements.mockReturnValue({
      planId: "core",
      entitlements: [],
      unknownPriceIds: ["price_unknown"],
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Prix Stripe non configuré");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.reportError).toHaveBeenCalledWith(
      "stripe.unknown-price",
      expect.stringContaining("1 prix Stripe"),
    );
  });
});

/* ════════════════════════════════════════════════════════════
 * ACHAT DE CRÉDITS SMS
 *
 * `sms_credit_entries` est append-only et `credit_sms_balance` n'a AUCUN
 * inverse : aucun débit administratif ne rattrape un double crédit. Un rejeu
 * — réessai Stripe après un 500, rejeu manuel depuis le tableau de bord —
 * doit donc être strictement sans effet.
 * ════════════════════════════════════════════════════════════ */

const CHECKOUT_EVENT_ID = "evt_checkout_1";

function checkoutEvent(
  session: Record<string, unknown>,
  eventId = CHECKOUT_EVENT_ID,
  type = "checkout.session.completed",
) {
  return {
    id: eventId,
    type,
    created: 1_700_000_500,
    data: {
      object: {
        id: "cs_test_1",
        customer: "cus_1",
        payment_status: "paid",
        client_reference_id: "org-1",
        metadata: {
          purchase: "sms_credits",
          organization_id: "org-1",
          sms_units: "500",
          sms_pack: "sms-500",
        },
        ...session,
      },
    },
  };
}

const creditCalls = () =>
  mocks.rpc.mock.calls.filter((call) => call[0] === "credit_sms_balance");

describe("webhook Stripe — crédit SMS", () => {
  beforeEach(() => {
    ledger.entries.clear();
    mocks.rpc.mockImplementation((name: string, args: Record<string, never>) =>
      name === "credit_sms_balance"
        ? ledger.credit(args as never)
        : { data: null, error: null },
    );
  });

  it("crédite le pack payé, une fois, avec la session en référence", async () => {
    mocks.constructEvent.mockReturnValue(checkoutEvent({}));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(creditCalls()).toHaveLength(1);
    expect(creditCalls()[0][1]).toEqual({
      p_organization_id: "org-1",
      p_units: 500,
      p_reason: "purchase",
      p_reference: "stripe:cs_test_1",
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actor: "stripe",
        action: "sms_credit.purchase",
      }),
    );
  });

  it("LE REJEU DU MÊME ÉVÉNEMENT NE CRÉDITE PAS UNE SECONDE FOIS", async () => {
    mocks.constructEvent.mockReturnValue(checkoutEvent({}));

    const first = await POST(request());
    const replay = await POST(request());
    const thirdTime = await POST(request());

    expect(first.status).toBe(200);
    expect(await replay.json()).toEqual({ received: true, duplicate: true });
    expect(await thirdTime.json()).toEqual({ received: true, duplicate: true });
    // LA propriété du lot : un seul mouvement au grand livre pour trois
    // livraisons du même événement.
    expect(creditCalls()).toHaveLength(1);
  });

  it("DEUX ÉVÉNEMENTS DIFFÉRENTS SUR LA MÊME SESSION NE CRÉDITENT QU'UNE FOIS", async () => {
    // ⚠️ CETTE ASSERTION AFFIRMAIT L'INVERSE. Elle exigeait qu'un autre
    // événement portant la MÊME session crédite une seconde fois, au motif que
    // la déduplication porte sur l'événement. La prémisse était fausse : la
    // même session, c'est le même paiement, donc un seul mouvement — et cette
    // ancienne exigence autorisait très exactement le double crédit que
    // l'encaissement différé rend maintenant systématique (`completed` puis
    // `async_payment_succeeded` portent deux identifiants d'événement pour un
    // seul achat).
    mocks.constructEvent.mockReturnValue(checkoutEvent({}));
    await POST(request());

    mocks.constructEvent.mockReturnValue(checkoutEvent({}, "evt_checkout_2"));
    const second = await POST(request());

    expect(second.status).toBe(200);
    // La prise sur `stripe_events` ne voit rien (deux événements distincts) :
    // les deux appels partent réellement vers la RPC…
    expect(creditCalls()).toHaveLength(2);
    // …et c'est la référence de PAIEMENT qui ne laisse qu'un mouvement.
    expect(creditCalls().map((call) => call[1].p_reference)).toEqual([
      "stripe:cs_test_1",
      "stripe:cs_test_1",
    ]);
    expect(ledger.entries.size).toBe(1);

    /* ── ET LE SECOND APPEL LE DIT ──────────────────────────
     *
     * Jusqu'ici les deux réponses étaient `{ received: true }`, mot pour mot,
     * et l'audit portait `sms_credit.purchase` dans les deux cas. Le second
     * appel EST un succès — l'idempotence fonctionne, et ce chemin est
     * légitimement emprunté par tout paiement différé — mais rien ne
     * permettait de le mesurer : un défaut de facturation Stripe se serait
     * caché dans cette indistinction. ROUGE SI : `created` cesse d'être lu.
     */
    expect(await second.json()).toEqual({ received: true, credited: false });
    expect(mocks.writeAuditLog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "sms_credit.purchase.replayed",
        metadata: expect.objectContaining({ credited: false, entry_id: "entry-1" }),
      }),
    );
    // Le premier, lui, reste un octroi plein.
    expect(mocks.writeAuditLog).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: "sms_credit.purchase",
        metadata: expect.objectContaining({ credited: true }),
      }),
    );
  });

  it("un SECOND ACHAT crédite bien (la garde ne gèle pas tout)", async () => {
    // Contrôle négatif de la garde : racheter des crédits est le geste normal
    // et répétable. Ce qui distingue les deux cas est la session, pas
    // l'événement.
    mocks.constructEvent.mockReturnValue(checkoutEvent({}));
    await POST(request());

    mocks.constructEvent.mockReturnValue(
      checkoutEvent({ id: "cs_test_2" }, "evt_checkout_2"),
    );
    await POST(request());

    expect(creditCalls()).toHaveLength(2);
    expect(ledger.entries.size).toBe(2);
  });

  it("UN PAIEMENT DIFFÉRÉ QUI ABOUTIT EST CRÉDITÉ", async () => {
    // Le scénario SEPA / virement, ordinaire sur un compte français : le
    // tunnel aboutit non payé, l'encaissement se tranche deux à cinq jours
    // plus tard. Sans cette route, le commerçant est débité et n'a jamais un
    // seul crédit.
    mocks.constructEvent.mockReturnValue(
      checkoutEvent({ payment_status: "unpaid" }),
    );
    const completed = await POST(request());

    expect(completed.status).toBe(200);
    expect(creditCalls()).toHaveLength(0);

    mocks.constructEvent.mockReturnValue(
      checkoutEvent(
        { payment_status: "paid" },
        "evt_async_1",
        "checkout.session.async_payment_succeeded",
      ),
    );
    const settled = await POST(request());

    expect(settled.status).toBe(200);
    expect(creditCalls()).toHaveLength(1);
    expect(creditCalls()[0][1]).toMatchObject({
      p_organization_id: "org-1",
      p_units: 500,
      p_reference: "stripe:cs_test_1",
    });
    expect(ledger.entries.size).toBe(1);
  });

  it("un encaissement différé RATÉ ne passe pas en silence", async () => {
    mocks.constructEvent.mockReturnValue(
      checkoutEvent(
        { payment_status: "unpaid" },
        "evt_async_ko",
        "checkout.session.async_payment_failed",
      ),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(creditCalls()).toHaveLength(0);
    expect(mocks.reportError).toHaveBeenCalledWith(
      "stripe.sms-credits-async-failed",
      expect.stringContaining("cs_test_1"),
    );
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        action: "sms_credit.purchase_failed",
      }),
    );
  });

  it("REFUSE une session dont les deux porteurs d'identité se contredisent", async () => {
    // Durcissement : `client_reference_id` est ajoutable à l'URL d'un Payment
    // Link par le payeur, la metadata non. Une divergence désigne deux
    // organisations différentes — créditer l'une ou l'autre serait choisir au
    // hasard.
    mocks.constructEvent.mockReturnValue(
      checkoutEvent({ client_reference_id: "org-victime" }),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(creditCalls()).toHaveLength(0);
    expect(ledger.entries.size).toBe(0);
    expect(mocks.reportError).toHaveBeenCalledWith(
      "stripe.sms-credits-metadata",
      expect.stringContaining("se contredisent"),
    );
  });

  it("NE CRÉDITE JAMAIS une session non payée", async () => {
    mocks.constructEvent.mockReturnValue(
      checkoutEvent({ payment_status: "unpaid" }),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(creditCalls()).toHaveLength(0);
    // L'événement n'est pas non plus consommé : le jour où le paiement
    // aboutit, rien n'a été gaspillé.
    expect(events.rows.has(CHECKOUT_EVENT_ID)).toBe(false);
  });

  it("relâche la prise quand la RPC échoue, pour que le rejeu agisse", async () => {
    mocks.constructEvent.mockReturnValue(checkoutEvent({}));
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "deadlock detected" },
    });

    const failed = await POST(request());
    expect(failed.status).toBe(500);
    expect(events.deletes).toEqual([CHECKOUT_EVENT_ID]);

    // Le rejeu que Stripe déclenche derrière ce 500 doit réellement créditer.
    const retry = await POST(request());

    expect(retry.status).toBe(200);
    expect(creditCalls()).toHaveLength(2);
    // Et une seule fois, même si la RPC en échec avait en réalité commité
    // avant de perdre sa réponse : le grand livre tranche sur la référence de
    // paiement, pas sur ce que l'appelant croit savoir.
    expect(ledger.entries.size).toBe(1);
  });

  it("ne crédite rien si la prise elle-même est illisible", async () => {
    mocks.constructEvent.mockReturnValue(checkoutEvent({}));
    events.upsertError = { message: "connection reset" };

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(creditCalls()).toHaveLength(0);
  });

  it("acquitte une metadata illisible au lieu de faire désactiver le point d'entrée", async () => {
    // La metadata est gelée sur la session : aucun rejeu ne la réparera, et
    // des échecs soutenus font désactiver le webhook par Stripe — ce qui
    // couperait aussi la synchronisation des abonnements.
    mocks.constructEvent.mockReturnValue(
      checkoutEvent({
        metadata: {
          purchase: "sms_credits",
          organization_id: "org-1",
          sms_units: "beaucoup",
        },
      }),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(creditCalls()).toHaveLength(0);
    expect(mocks.reportError).toHaveBeenCalledWith(
      "stripe.sms-credits-metadata",
      expect.stringContaining("unités"),
    );
  });

  it("une session d'abonnement passe sans toucher au crédit SMS", async () => {
    mocks.constructEvent.mockReturnValue(checkoutEvent({ metadata: {} }));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(creditCalls()).toHaveLength(0);
    expect(events.rows.size).toBe(0);
  });
});
