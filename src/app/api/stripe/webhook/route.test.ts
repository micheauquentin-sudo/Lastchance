// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieve: vi.fn(),
  /**
   * `checkout.sessions.list` — LA TRADUCTION QUI MANQUAIT (SD-2).
   *
   * Un `charge.refunded` porte une charge et un payment intent ; les deux RPC
   * de reprise s'apparient sur l'identifiant de SESSION. Sans cet appel, elles
   * rendraient zéro ligne — « rien à reprendre » — sur un remboursement bien
   * réel, en silence. Le stub existe donc pour que le test puisse prouver que
   * la traduction est faite, et non seulement que la route rend 200.
   */
  sessionsList: vi.fn(),
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
      checkout: {
        sessions: { list: (...args: unknown[]) => mocks.sessionsList(...args) },
      },
    }),
    mapStripeStatus: (status: string) => status,
    resolveStripeEntitlements: (...args: unknown[]) =>
      mocks.resolveStripeEntitlements(...args),
  };
});
/**
 * FAUSSE TABLE DES OCTROIS, avec la seule propriété qui compte pour ce
 * fichier : la révocation est un `update` FILTRÉ, et son idempotence tient au
 * filtre — `revoked_at is null` — et non à une prise d'événement. Un second
 * passage ne doit toucher AUCUNE ligne.
 *
 * Les filtres sont conservés tels quels et non normalisés : c'est sur eux que
 * portent les assertions les plus coûteuses du bloc (ne jamais révoquer un
 * octroi d'une autre organisation, d'un autre module, ni un octroi offert par
 * le back-office).
 */
const octrois = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown> & { id: string }>,
  updateError: null as { message: string } | null,
  selectError: null as { message: string } | null,
  filtresVus: [] as Array<Array<[string, unknown]>>,
  /** Les filtres des LECTURES, tenus à part de ceux des écritures. */
  selectsVus: [] as Array<Array<[string, unknown]>>,
}));

/** Correspondance client Stripe → organisation, celle que fait la RPC V2. */
const organisations = vi.hoisted(() => ({
  parClient: new Map<string, string>(),
  selectError: null as { message: string } | null,
  /**
   * Date du premier impayé — que le webhook NE LIT PLUS, et c'est le sujet du
   * correctif : elle n'est écrite que par `apply_stripe_subscription_event_v2`,
   * qu'un abonnement de pass PUR ne traverse jamais. La garder ici avec son
   * compteur de lectures est ce qui permet d'affirmer par un test que l'ancre
   * de la grâce est bien l'événement, et non plus l'organisation.
   */
  pastDueSince: null as string | null,
  lecturesPastDue: 0,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table === "organizations") {
        return {
          select: (colonnes?: string) => ({
            eq: (_column: string, value: string) => ({
              maybeSingle: async () => {
                if (organisations.selectError) {
                  return { data: null, error: organisations.selectError };
                }
                // DEUX LECTURES DISTINCTES SUR LA MÊME TABLE : la résolution
                // du client Stripe (`select("id")` par `stripe_customer_id`)
                // et la date d'impayé (`select("past_due_since")` par `id`).
                // Les distinguer par les colonnes demandées évite de rendre à
                // l'une le résultat de l'autre — un `id` là où le code attend
                // une date le ferait renoncer en silence.
                if (colonnes?.includes("past_due_since")) {
                  organisations.lecturesPastDue += 1;
                  return {
                    data: { past_due_since: organisations.pastDueSince },
                    error: null,
                  };
                }
                const id = organisations.parClient.get(value) ?? null;
                return { data: id ? { id } : null, error: null };
              },
            }),
          }),
        };
      }

      if (table === "organization_module_grants") {
        /**
         * `in` pousse un TABLEAU de valeurs admissibles ; `eq` et `is`
         * poussent une valeur scalaire. Les confondre ferait échouer tout
         * filtre `in` en silence, donc ne toucher aucune ligne — un test vert
         * sur une écriture jamais faite.
         */
        const correspond = (
          row: Record<string, unknown>,
          filtres: Array<[string, unknown]>,
        ) =>
          filtres.every(([column, value]) =>
            Array.isArray(value) ? value.includes(row[column]) : row[column] === value,
          );

        return {
          /**
           * LECTURE — celle que l'échéance d'impayé fait désormais avant
           * d'écrire. Elle ne sert pas au confort : sans les `starts_at` et les
           * échéances déjà posées, le webhook ne peut pas distinguer un rejeu
           * (« déjà daté ») d'un calcul aberrant (« fin antérieure au début »),
           * et le second se tairait.
           */
          // Les colonnes demandées ne servent à rien ici : la fausse table rend
          // la ligne entière, et le code testé n'en lit que ce qu'il a demandé.
          select: () => {
            const filtres: Array<[string, unknown]> = [];
            const lecteur = {
              eq(column: string, value: unknown) {
                filtres.push([column, value]);
                return lecteur;
              },
              is(column: string, value: unknown) {
                filtres.push([column, value]);
                return lecteur;
              },
              in(column: string, values: unknown[]) {
                filtres.push([column, values]);
                return lecteur;
              },
              then(
                resolve: (v: { data: unknown; error: unknown }) => unknown,
                reject?: (e: unknown) => unknown,
              ) {
                octrois.selectsVus.push(filtres);
                const resultat = octrois.selectError
                  ? { data: null, error: octrois.selectError }
                  : {
                      // COPIES, jamais les lignes elles-mêmes : une lecture ne
                      // doit pas offrir au code testé une poignée sur la table.
                      data: octrois.rows
                        .filter((row) => correspond(row, filtres))
                        .map((row) => ({ ...row })),
                      error: null,
                    };
                return Promise.resolve(resultat).then(resolve, reject);
              },
            };
            return lecteur;
          },
          update: (payload: Record<string, unknown>) => {
            const filtres: Array<[string, unknown]> = [];
            const builder = {
              eq(column: string, value: unknown) {
                filtres.push([column, value]);
                return builder;
              },
              is(column: string, value: unknown) {
                filtres.push([column, value]);
                return builder;
              },
              // `in` sert à l'échéance d'impayé, qui vise tous les modules
              // portés par le même abonnement de pass.
              in(column: string, values: unknown[]) {
                filtres.push([column, values]);
                return builder;
              },
              // AWAITABLE SANS `.select()`. L'échéance d'impayé n'a pas besoin
              // des lignes touchées : elle pose une valeur. Sans ce `then`, un
              // `await` sur le builder rendait l'objet lui-même et le code
              // lisait `error: undefined` — un succès silencieux qui aurait
              // fait passer le test quoi qu'il arrive.
              then(
                resolve: (v: { data: unknown; error: unknown }) => unknown,
                reject?: (e: unknown) => unknown,
              ) {
                return builder.select().then(resolve, reject);
              },
              async select() {
                octrois.filtresVus.push(filtres);
                if (octrois.updateError) {
                  return { data: null, error: octrois.updateError };
                }
                const touchees = octrois.rows.filter((row) =>
                  correspond(row, filtres),
                );

                /* ── LA FAUSSE TABLE REFUSE CE QUE LA VRAIE REFUSE ──
                 *
                 * `grant_fin_apres_debut` (20260907120000) exige
                 * `ends_at > starts_at`, et `starts_at is not null` avec elle.
                 * Sans cette garde, une fin calculée AVANT le début s'écrirait
                 * tranquillement ici alors qu'en production elle rend un `error`
                 * — donc un 500 rejoué trois jours par Stripe, puis le point
                 * d'entrée désactivé. Un test qui ignore la contrainte
                 * verrouillerait l'inverse de ce qu'il croit vérifier.
                 */
                if ("ends_at" in payload && payload.ends_at !== null) {
                  const finMs = Date.parse(String(payload.ends_at));
                  const violante = touchees.find((row) => {
                    const debut =
                      row.starts_at == null
                        ? NaN
                        : Date.parse(String(row.starts_at));
                    return !(Number.isFinite(debut) && finMs > debut);
                  });
                  if (violante) {
                    return {
                      data: null,
                      error: {
                        message:
                          'new row for relation "organization_module_grants" ' +
                          'violates check constraint "grant_fin_apres_debut" ' +
                          `(octroi ${violante.id})`,
                      },
                    };
                  }
                }

                for (const row of touchees) Object.assign(row, payload);
                return { data: touchees.map((row) => ({ id: row.id })), error: null };
              },
            };
            return builder;
          },
        };
      }

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
// `optionalEnv` DOIT être fourni, et pas seulement `requiredEnv` : depuis P0.5
// la route importe `partitionnerPrix`, qui lit les variables de prix de pass à
// travers ce module. Le remplacer en entier sans cette fonction ferait sauter
// l'import à l'exécution, et pas au typecheck. Recopié tel quel de `env.ts` —
// le `|| undefined` compte : il replie la chaîne vide sur « non configuré ».
vi.mock("@/lib/env", () => ({
  requiredEnv: () => "webhook-secret",
  optionalEnv: (name: string) => process.env[name] || undefined,
}));

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
  octrois.rows = [];
  octrois.updateError = null;
  octrois.selectError = null;
  octrois.filtresVus = [];
  octrois.selectsVus = [];
  organisations.parClient = new Map([["cus_1", "org-1"]]);
  organisations.selectError = null;
  organisations.pastDueSince = null;
  organisations.lecturesPastDue = 0;
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
  mocks.sessionsList.mockResolvedValue({ data: [] });
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

// ============================================================
// ACHAT D'ADD-ON AUTONOME (P0.4)
//
// Ce bloc éprouve le seul chemin par lequel un paiement devient un DROIT. Ce
// qu'il doit prouver, dans l'ordre d'importance :
//
//   1. que les termes envoyés à la base viennent du CATALOGUE et de la date de
//      la SESSION, jamais de la metadata ni de l'horloge du webhook ;
//   2. que rien n'est octroyé tant que le paiement n'est pas encaissé ;
//   3. qu'un rejeu ne réclame rien de plus et s'acquitte en 200 ;
//   4. qu'une panne de la RPC rend 500 — et que c'est SAIN ici, parce que
//      l'idempotence vit en base : le rejeu que le 500 provoque est inoffensif.
// ============================================================

/** Session d'achat d'add-on. La Chasse au trésor : un pass à fenêtre. */
function achatAddonEvent(
  session: Record<string, unknown> = {},
  eventId = "evt_addon_1",
  type = "checkout.session.completed",
) {
  return {
    id: eventId,
    type,
    created: 1_700_000_500,
    data: {
      object: {
        id: "cs_addon_1",
        customer: "cus_1",
        payment_status: "paid",
        client_reference_id: "org-1",
        // `created` de la SESSION, distinct de celui de l'événement : c'est
        // toute la question du point 1.
        created: 1_781_000_000,
        metadata: {
          purchase: "module_grant",
          organization_id: "org-1",
          entitlement: "hunts",
        },
        ...session,
      },
    },
  };
}

const octroiCalls = () =>
  mocks.rpc.mock.calls.filter((call) => call[0] === "grant_module_from_payment");

describe("webhook Stripe — achat d'add-on autonome", () => {
  beforeEach(() => {
    mocks.rpc.mockImplementation((name: string) =>
      name === "grant_module_from_payment"
        ? { data: [{ grant_id: "grant-1", outcome: "created" }], error: null }
        : { data: null, error: null },
    );
  });

  it("octroie le module avec les termes du CATALOGUE et la date de la SESSION", async () => {
    mocks.constructEvent.mockReturnValue(achatAddonEvent());

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(octroiCalls()).toHaveLength(1);
    const args = octroiCalls()[0][1] as Record<string, unknown>;
    expect(args.p_organization_id).toBe("org-1");
    expect(args.p_module).toBe("hunts");
    expect(args.p_kind).toBe("pass");
    // LA RÉFÉRENCE EST LE PAIEMENT, PAS L'ÉVÉNEMENT. Une même session traverse
    // ce chemin sous deux identifiants d'événement (`completed` puis
    // `async_payment_succeeded`) : écrire l'événement rendrait le double octroi
    // systématique sur tout paiement différé.
    expect(args.p_source_reference).toBe("cs_addon_1");
    // Un achat à fenêtre n'ouvre RIEN à l'achat : ni début, ni fin. Sinon les
    // 30 jours payés s'écouleraient pendant que le commerçant prépare.
    expect(args.p_starts_at).toBeNull();
    expect(args.p_ends_at).toBeNull();
    // Et la date limite de démarrage court depuis la SESSION (1_781_000_000),
    // jamais depuis l'événement (1_700_000_500) ni depuis l'horloge du test.
    const activateBy = new Date(String(args.p_activate_by)).getTime();
    expect(activateBy).toBeGreaterThan(1_781_000_000 * 1000);
    expect(activateBy).toBeLessThan(1_781_000_000 * 1000 + 200 * 86_400_000);
  });

  it("n'octroie RIEN tant que le paiement n'est pas encaissé", async () => {
    // `checkout.session.completed` est émis dès la fin du tunnel, y compris
    // pour un virement dont l'encaissement échouera des jours plus tard.
    // Octroyer ici ouvrirait un module jamais payé — et la pause étant dérivée
    // d'une échéance, rien ne le refermerait avant elle.
    mocks.constructEvent.mockReturnValue(
      achatAddonEvent({ payment_status: "unpaid" }),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(octroiCalls()).toHaveLength(0);
  });

  it("un rejeu s'acquitte en 200 et se journalise comme tel", async () => {
    mocks.rpc.mockImplementation((name: string) =>
      name === "grant_module_from_payment"
        ? { data: [{ grant_id: "grant-1", outcome: "replayed" }], error: null }
        : { data: null, error: null },
    );
    mocks.constructEvent.mockReturnValue(achatAddonEvent());

    const response = await POST(request());

    expect(response.status).toBe(200);
    // `outcome: replayed` distingue un rejeu d'un premier octroi. Sans cette
    // distinction dans l'audit, une double livraison serait indiscernable d'un
    // second achat volontaire.
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "module_grant.replayed" }),
    );
  });

  /* ── L'ISSUE QUE L'ANCIEN ENCODAGE NE POUVAIT PAS AVOIR ──────
   *
   * `created` étant un booléen, tout ce qui n'était pas `true` retombait sur
   * « rejeu » — y compris une ligne absente ou une quatrième issue ajoutée un
   * jour en base. Le pire des silences pour ce chemin : « déjà octroyé » écrit
   * dans l'audit sur un cas que personne n'a prévu.
   *
   * Depuis que la distinction est un MOT (20260913120000), les deux issues
   * nominales sont nommées et tout le reste crie. Ce test est ce qui remplace
   * la garde textuelle `nullabilite-grant-id.test.ts` : il éprouve un
   * comportement à l'exécution là où elle surveillait la présence d'un cast.
   */
  it("une issue INCONNUE crie au lieu de passer pour un rejeu", async () => {
    mocks.rpc.mockImplementation((name: string) =>
      name === "grant_module_from_payment"
        ? { data: [{ grant_id: null, outcome: "quelque_chose" }], error: null }
        : { data: null, error: null },
    );
    mocks.constructEvent.mockReturnValue(achatAddonEvent());

    const response = await POST(request());

    // Acquitté : la RPC a fait son travail, seul son verdict nous échappe, et
    // un 500 ferait retenter Stripe pour rien.
    expect(response.status).toBe(200);
    expect(mocks.reportError).toHaveBeenCalledWith(
      "stripe.module-grant-outcome",
      expect.stringContaining("quelque_chose"),
    );
    // Et surtout : rien n'est journalisé comme un octroi ordinaire.
    expect(mocks.writeAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "module_grant.replayed" }),
    );
    expect(mocks.writeAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "module_grant.granted" }),
    );
  });

  it("une metadata défaillante est REMONTÉE puis acquittée, jamais retentée", async () => {
    // La metadata est gelée sur la session : aucun rejeu ne la réparera. Un
    // 500 ferait retenter Stripe trois jours avant de désactiver le point
    // d'entrée — ce qui couperait aussi la synchronisation des abonnements.
    mocks.constructEvent.mockReturnValue(
      achatAddonEvent({ client_reference_id: "org-INTRUS" }),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(octroiCalls()).toHaveLength(0);
    expect(mocks.reportError).toHaveBeenCalledWith(
      "stripe.module-grant-metadata",
      expect.stringContaining("contredisent"),
    );
  });

  it("une panne de la RPC rend 500, et c'est sain", async () => {
    // On peut échouer franchement parce que l'idempotence vit en base : le
    // rejeu que ce 500 provoque est sans effet si la première tentative avait
    // en réalité commité. C'est exactement ce que l'index unique achète.
    mocks.rpc.mockImplementation((name: string) =>
      name === "grant_module_from_payment"
        ? { data: null, error: { message: "pooler indisponible" } }
        : { data: null, error: null },
    );
    mocks.constructEvent.mockReturnValue(achatAddonEvent());

    const response = await POST(request());

    expect(response.status).toBe(500);
  });

  it("une session d'achat de crédits SMS ne passe PAS par ce chemin", async () => {
    // Les deux marqueurs de metadata sont disjoints. Contre-exemple sans
    // lequel un lecteur trop permissif transformerait un achat de SMS en
    // octroi de module.
    mocks.constructEvent.mockReturnValue(checkoutEvent({}));

    await POST(request());

    expect(octroiCalls()).toHaveLength(0);
  });
});

// ============================================================
// L'ABONNEMENT D'UN ADD-ON MENSUEL (P0.5)
//
// Ce bloc éprouve l'isolation qu'ADR-079 exigeait avant d'ouvrir la vente des
// deux mensuels. Ce qu'il doit prouver, dans l'ordre du coût de l'erreur :
//
//   1. QU'UN ABONNEMENT DE PASS N'ATTEIGNE JAMAIS
//      `apply_stripe_subscription_event_v2`. C'est l'assertion qui protège
//      l'argent : la RPC y écrirait le plan de l'organisation à partir d'un
//      prix qui ne décrit aucune offre, donc `PLANS[0]` — un client à jour de
//      ses paiements déclassé sans un bruit.
//   2. QUE LA RÉSILIATION REFERME. Les termes d'un mensuel posent
//      `ends_at: null` et la pause du lot 2 est dérivée d'une échéance : sans
//      révocation, un add-on résilié resterait ouvert POUR TOUJOURS.
//   3. QUE LA RÉVOCATION NE MORDE QUE SUR CE QU'ELLE DOIT. Un autre module,
//      une autre organisation, un octroi OFFERT par le back-office : chacun de
//      ces trois débordements referme un droit que personne n'a résilié.
//   4. QUE LE CAS MIXTE NE PERDE AUCUNE DES DEUX MOITIÉS.
// ============================================================

const PRIX_PASS_LOYALTY = "price_pass_loyalty";

function abonnementDePass(
  type = "customer.subscription.deleted",
  items: string[] = [PRIX_PASS_LOYALTY],
  metadata: Record<string, string> | null = null,
) {
  mocks.constructEvent.mockReturnValue({
    id: "evt_pass_1",
    type,
    created: 1_700_000_900,
    data: { object: { id: "sub_pass_1" } },
  });
  mocks.retrieve.mockResolvedValue({
    id: "sub_pass_1",
    status: type === "customer.subscription.deleted" ? "canceled" : "active",
    customer: "cus_1",
    trial_end: null,
    metadata,
    items: { data: items.map((id) => ({ price: { id } })) },
  });
}

/**
 * L'octroi récurrent vivant qu'une résiliation doit refermer.
 *
 * `starts_at` et `resource_id` ne sont pas décoratifs. Le premier est ce que
 * `grant_fin_apres_debut` compare à toute échéance posée — une ligne sans début
 * fait REFUSER l'écriture, en base comme dans la fausse table. Le second est le
 * filtre d'`org_has_live_module_grant` : les omettre ferait passer les lignes à
 * côté des filtres du webhook, donc des tests verts sur des écritures jamais
 * faites. En base, les deux colonnes existent toujours.
 */
const DEBUT_OCTROI = "2023-11-01T00:00:00.000Z";
/** `event.created` des événements de pass (1 700 000 900) + 14 jours de grâce. */
const FIN_DE_GRACE = "2023-11-28T22:28:20.000Z";

function octroiVivant(over: Record<string, unknown> = {}) {
  return {
    id: "grant-loyalty",
    organization_id: "org-1",
    module: "loyalty",
    kind: "recurring",
    source: "stripe",
    resource_id: null,
    starts_at: DEBUT_OCTROI,
    revoked_at: null,
    ends_at: null,
    ...over,
  };
}

const syncCalls = () =>
  mocks.rpc.mock.calls.filter(
    (call) => call[0] === "apply_stripe_subscription_event_v2",
  );

describe("webhook Stripe — abonnement d'un add-on mensuel", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_ID_PASS_LOYALTY", PRIX_PASS_LOYALTY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ne synchronise AUCUN abonnement — le plan payé n'est pas touché", async () => {
    abonnementDePass("customer.subscription.created");

    const response = await POST(request());

    expect(response.status).toBe(200);
    // L'assertion centrale du lot. Si elle tombe, ce n'est pas un webhook qui
    // casse : c'est le plan d'une organisation réécrit sur l'offre d'entrée.
    expect(syncCalls()).toHaveLength(0);
  });

  it("ne crée aucun octroi non plus : c'est la session de checkout qui l'a fait", async () => {
    // Deux créateurs poseraient DEUX octrois pour un seul paiement — l'un
    // référencé par la session, l'autre par l'abonnement, donc invisibles l'un
    // à l'autre pour l'index d'idempotence du lot 4.
    abonnementDePass("customer.subscription.created");

    await POST(request());

    expect(
      mocks.rpc.mock.calls.filter((c) => c[0] === "grant_module_from_payment"),
    ).toHaveLength(0);
  });

  it("la résiliation RÉVOQUE l'octroi récurrent, sinon il reste ouvert à jamais", async () => {
    octrois.rows = [octroiVivant()];
    abonnementDePass();

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(octrois.rows[0].revoked_at).not.toBeNull();
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "module_grant.revoked",
        organizationId: "org-1",
      }),
    );
  });

  it("un `updated` qui rapporte `canceled` révoque aussi", async () => {
    // Stripe ne garantit pas l'ordre : la route relit l'objet courant et replie
    // `canceled` quel que soit le type d'événement. S'appuyer sur le seul
    // `deleted` laisserait un module payé ouvert sur une annulation vue
    // autrement.
    octrois.rows = [octroiVivant()];
    abonnementDePass("customer.subscription.updated");
    mocks.retrieve.mockResolvedValue({
      id: "sub_pass_1",
      status: "canceled",
      customer: "cus_1",
      trial_end: null,
      metadata: null,
      items: { data: [{ price: { id: PRIX_PASS_LOYALTY } }] },
    });

    await POST(request());

    expect(octrois.rows[0].revoked_at).not.toBeNull();
  });

  it("un impayé ne RÉVOQUE rien — il DATE, et la grâce court", async () => {
    octrois.rows = [octroiVivant()];
    abonnementDePass("customer.subscription.updated");
    mocks.retrieve.mockResolvedValue({
      id: "sub_pass_1",
      status: "past_due",
      customer: "cus_1",
      trial_end: null,
      metadata: null,
      items: { data: [{ price: { id: PRIX_PASS_LOYALTY } }] },
    });

    await POST(request());

    expect(octrois.rows[0].revoked_at).toBeNull();
    // Ne rien révoquer n'est pas ne rien faire : le terme est posé, et c'est ce
    // qui referme le module tout seul si le commerçant ne régularise pas.
    expect(octrois.rows[0].ends_at).toBe(FIN_DE_GRACE);
  });

  it("le rejeu d'une résiliation ne touche plus rien, et s'acquitte", async () => {
    // L'idempotence vit dans le FILTRE (`revoked_at is null`), pas dans une
    // prise d'événement : la seconde passe ne trouve aucune ligne.
    octrois.rows = [octroiVivant({ revoked_at: "2026-01-01T00:00:00.000Z" })];
    abonnementDePass();

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(octrois.rows[0].revoked_at).toBe("2026-01-01T00:00:00.000Z");
    expect(mocks.writeAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "module_grant.revoked" }),
    );
  });

  it("la révocation est bornée à l'organisation, au module, et à Stripe", async () => {
    octrois.rows = [octroiVivant()];
    abonnementDePass();

    await POST(request());

    // Les six bornes, lues sur les filtres réellement posés. Chacune manquante
    // referme un droit que personne n'a résilié : celui d'un autre commerçant,
    // d'un autre module, ou un accès OFFERT par le back-office que Stripe n'a
    // jamais gouverné.
    expect(octrois.filtresVus[0]).toEqual(
      expect.arrayContaining([
        ["organization_id", "org-1"],
        ["module", "loyalty"],
        ["kind", "recurring"],
        ["source", "stripe"],
        ["revoked_at", null],
        ["ends_at", null],
      ]),
    );
  });

  it("un client Stripe inconnu est CRIÉ puis acquitté, jamais retenté", async () => {
    // Aucun rejeu ne fera apparaître l'organisation. Un 500 ferait retenter
    // trois jours puis désactiver le point d'entrée, ce qui couperait aussi la
    // synchronisation des abonnements principaux — on remplacerait un droit
    // resté ouvert par une facturation entière hors service.
    organisations.parClient = new Map();
    octrois.rows = [octroiVivant()];
    abonnementDePass();

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(octrois.rows[0].revoked_at).toBeNull();
    expect(mocks.reportError).toHaveBeenCalledWith(
      "stripe.abonnement-pass-org",
      expect.stringContaining("cus_1"),
    );
  });

  it("la metadata de l'abonnement sert de REPLI quand le client n'est plus référencé", async () => {
    // Le cas réel : le client Stripe d'une organisation est recréé, la colonne
    // ne pointe plus sur l'ancien, et l'abonnement en cours y reste attaché.
    // Sans ce repli, la résiliation ne refermerait rien.
    organisations.parClient = new Map();
    octrois.rows = [octroiVivant()];
    abonnementDePass("customer.subscription.deleted", [PRIX_PASS_LOYALTY], {
      organization_id: "org-1",
    });

    await POST(request());

    expect(octrois.rows[0].revoked_at).not.toBeNull();
  });

  it("une panne d'écriture rend 500 — le rejeu est inoffensif", async () => {
    octrois.rows = [octroiVivant()];
    octrois.updateError = { message: "pooler indisponible" };
    abonnementDePass();

    const response = await POST(request());

    expect(response.status).toBe(500);
  });

  it("MIXTE : l'offre est synchronisée, le pass est révoqué, et c'est signalé", async () => {
    // Inatteignable depuis l'application ; ne peut naître que d'un geste manuel
    // dans le tableau de bord Stripe. Ce que ce test verrouille est qu'aucune
    // des deux moitiés ne soit perdue — et que le prix de pass ne parte JAMAIS
    // en résolution d'offre, où il sortirait « inconnu ».
    octrois.rows = [octroiVivant()];
    abonnementDePass("customer.subscription.deleted", [
      "price_live",
      PRIX_PASS_LOYALTY,
    ]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(syncCalls()).toHaveLength(1);
    expect(syncCalls()[0][1]).toMatchObject({ p_price_ids: ["price_live"] });
    expect(octrois.rows[0].revoked_at).not.toBeNull();
    expect(mocks.reportError).toHaveBeenCalledWith(
      "stripe.abonnement-mixte",
      expect.stringContaining("sub_pass_1"),
    );
  });

  it("sans prix de pass, le chemin historique est intact", async () => {
    // Le contre-exemple qui empêche la partition de tout détourner : un
    // abonnement d'offre ordinaire doit continuer de passer par la RPC V2.
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(syncCalls()).toHaveLength(1);
    expect(octrois.filtresVus).toHaveLength(0);
  });
});

// ============================================================
// LE REFUS DE CUMUL (P0.5) — un double clic, deux débits, un seul droit
// ============================================================
describe("webhook Stripe — un second paiement du même mensuel est CRIÉ", () => {
  it("acquitte mais signale, plutôt que de faire passer un double débit pour un rejeu", async () => {
    // `outcome: refused` est la troisième issue de `grant_module_from_payment` :
    // un AUTRE paiement tient déjà ce module en récurrent, l'index unique du
    // lot 5 a refusé le second octroi. Le confondre avec un rejeu écrirait
    // « déjà octroyé » dans l'audit, et personne ne saurait qu'un remboursement
    // est dû. La distinction ne repose plus sur une nullité que les types
    // générés effacent (20260913120000), mais sur un mot que le webhook lit.
    mocks.rpc.mockImplementation((name: string) =>
      name === "grant_module_from_payment"
        ? { data: [{ grant_id: null, outcome: "refused" }], error: null }
        : { data: null, error: null },
    );
    mocks.constructEvent.mockReturnValue(
      achatAddonEvent({
        metadata: {
          purchase: "module_grant",
          organization_id: "org-1",
          entitlement: "loyalty",
        },
      }),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.reportError).toHaveBeenCalledWith(
      "stripe.module-grant-cumul",
      expect.stringContaining("remboursement"),
    );
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "module_grant.refused_duplicate" }),
    );
    // Et surtout PAS l'inverse : un rejeu et un double débit ne se journalisent
    // pas sous le même nom.
    expect(mocks.writeAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "module_grant.replayed" }),
    );
  });
});

/* ════════════════════════════════════════════════════════════
 * L'IMPAYÉ D'UN ADD-ON MENSUEL — une échéance, pas une révocation
 *
 * Le défaut fermé ici : ce chemin ne refermait QUE sur `canceled`, si bien
 * qu'un add-on mensuel impayé restait ouvert INDÉFINIMENT. `hasActiveAccess`
 * teste `live_module_grants` AVANT le statut d'abonnement — un octroi vivant
 * court-circuitait donc la grâce bornée de l'abonnement principal, et le
 * commerçant qui cessait de payer gardait son module jusqu'à ce que Stripe
 * finisse par annuler, ce qui peut ne jamais arriver.
 * ════════════════════════════════════════════════════════════ */

describe("échéance d'un add-on mensuel impayé", () => {
  // SANS CE STUB, `partitionnerPrix` ne reconnaît aucun prix de pass : le
  // chemin testé n'est jamais emprunté et les quatre cas passent au vert sans
  // avoir rien éprouvé. C'est exactement ce qui est arrivé au premier montage.
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_ID_PASS_LOYALTY", PRIX_PASS_LOYALTY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * La ligne visée, par son IDENTIFIANT et non par son module.
   *
   * Chercher par `module` renverrait la première ligne `loyalty` trouvée — et
   * comme chaque cas pousse la sienne, on lirait celle d'un test précédent.
   * Le premier montage de ce bloc est tombé exactement là : un test attendait
   * `null` et recevait la date posée par son voisin.
   */
  function ligne(id: string) {
    return octrois.rows.find((r) => r.id === id);
  }

  /** L'abonnement de pass passé en impayé, dans l'état où Stripe le rend. */
  function passEnImpaye(items: string[] = [PRIX_PASS_LOYALTY]) {
    abonnementDePass("customer.subscription.updated", items);
    mocks.retrieve.mockResolvedValue({
      id: "sub_pass_1",
      status: "past_due",
      customer: "cus_1",
      trial_end: null,
      metadata: null,
      items: { data: items.map((id) => ({ price: { id } })) },
    });
  }

  function octroi(over: Record<string, unknown> = {}) {
    octrois.rows.push(octroiVivant(over));
  }

  it("PASS SEUL : la fin de grâce est posée, datée de l'abonnement du pass", async () => {
    /* ── LE CAS QUE CE CHEMIN NE TRAITAIT PAS DU TOUT ──
     *
     * Un pass PUR ne traverse jamais `apply_stripe_subscription_event_v2`,
     * seule écrivaine d'`organizations.past_due_since`. Le webhook lisait donc
     * `null`, renonçait, et le module restait ouvert INDÉFINIMENT tant que le
     * recouvrement Stripe laissait l'abonnement en `past_due` — ce qui peut ne
     * jamais s'arrêter selon la configuration des relances.
     */
    organisations.pastDueSince = null;
    octroi({ id: "g1" });
    passEnImpaye();

    expect((await POST(request())).status).toBe(200);

    expect(ligne("g1")?.ends_at).toBe(FIN_DE_GRACE);
    // Une échéance, pas une révocation : le commerçant garde son module le
    // temps de régulariser, exactement comme l'abonnement principal.
    expect(ligne("g1")?.revoked_at).toBeNull();
  });

  it("l'ancre est l'ÉVÉNEMENT : l'organisation n'est plus lue du tout", async () => {
    // Le corollaire du cas précédent. Tant que `past_due_since` décidait, la
    // grâce d'un pass dépendait d'un champ que personne n'écrit pour lui.
    organisations.pastDueSince = "2023-01-01T00:00:00.000Z";
    octroi({ id: "g2" });
    passEnImpaye();

    await POST(request());

    expect(ligne("g2")?.ends_at).toBe(FIN_DE_GRACE);
    expect(organisations.lecturesPastDue).toBe(0);
  });

  it("MIXTE, offre en impayé ANCIEN : aucun 500, et ends_at reste après starts_at", async () => {
    /* ── LE 500 QUI DÉSACTIVAIT LE POINT D'ENTRÉE ──
     *
     * C'est le seul cas où `past_due_since` était réellement écrit : un
     * abonnement qui porte l'offre ET un pass. Impayée depuis des mois, l'offre
     * rendait une fin de grâce ANTÉRIEURE au `starts_at` de l'octroi du pass,
     * donc une violation de `grant_fin_apres_debut` — que la fausse table
     * refuse comme la vraie. Stripe rejoue un 500 pendant trois jours puis
     * DÉSACTIVE le point d'entrée, ce qui coupe aussi la synchronisation des
     * abonnements : un impayé de pass finissait par casser la facturation.
     */
    organisations.pastDueSince = "2023-01-01T00:00:00.000Z";
    octroi({ id: "g3" });
    passEnImpaye(["price_live", PRIX_PASS_LOYALTY]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    const finPosee = ligne("g3")?.ends_at as string;
    expect(finPosee).toBe(FIN_DE_GRACE);
    expect(Date.parse(finPosee)).toBeGreaterThan(Date.parse(DEBUT_OCTROI));
  });

  it("MONOTONE : un second impayé ne repousse pas l'échéance déjà posée", async () => {
    // `event.created` bouge à chaque relance de recouvrement, et Stripe en émet
    // plusieurs. Redater à chaque passage rallongerait la grâce sans fin —
    // exactement le défaut que la lecture de `past_due_since` évitait, et qu'il
    // ne s'agissait pas de réintroduire en changeant d'ancre.
    octroi({ id: "g4", ends_at: "2023-11-20T00:00:00.000Z" });
    passEnImpaye();
    mocks.constructEvent.mockReturnValue({
      id: "evt_pass_2",
      type: "customer.subscription.updated",
      created: 1_700_000_900 + 5 * 24 * 60 * 60,
      data: { object: { id: "sub_pass_1" } },
    });

    expect((await POST(request())).status).toBe(200);
    expect(ligne("g4")?.ends_at).toBe("2023-11-20T00:00:00.000Z");
  });

  it("un octroi JAMAIS DÉMARRÉ est signalé, jamais écrit", async () => {
    // `grant_fin_apres_debut` exige aussi `starts_at is not null`. Écrire quand
    // même rendrait une erreur, donc un 500 qu'aucun rejeu ne répare. Et un
    // octroi non démarré n'ouvre aucun accès : il n'y a rien à fermer.
    octroi({ id: "g5", starts_at: null });
    passEnImpaye();

    expect((await POST(request())).status).toBe(200);
    expect(ligne("g5")?.ends_at).toBeNull();
    expect(mocks.reportError).toHaveBeenCalledWith(
      "stripe.echeance-impaye-borne",
      expect.stringContaining("sub_pass_1"),
    );
  });

  it("un octroi BORNÉ À UNE RESSOURCE n'est ni daté ni levé", async () => {
    // Le filtre d'`org_has_live_module_grant`, qui manquait ici. Une Saison de
    // pronostics vendue pour UNE compétition n'est pas gouvernée par
    // l'abonnement d'un module entier : la dater ou la lever déciderait de la
    // vie d'un droit que cet abonnement n'a jamais vendu.
    octroi({ id: "g6-entier" });
    octroi({ id: "g6-borne", resource_id: "contest-1" });
    passEnImpaye();

    expect((await POST(request())).status).toBe(200);
    expect(ligne("g6-entier")?.ends_at).toBe(FIN_DE_GRACE);
    expect(ligne("g6-borne")?.ends_at).toBeNull();
  });

  it("le retour en active LÈVE l'échéance — régulariser suffit, et RIEN d'autre", async () => {
    // La moitié qui rend la branche `reactivated` (SD-6) joignable : sans
    // échéance posée, aucun rachat ne peut en lever une. Et la levée est bornée
    // aux mêmes lignes que la pose — un octroi de ressource garde la sienne.
    octroi({ id: "g7", ends_at: FIN_DE_GRACE });
    octroi({
      id: "g7-borne",
      resource_id: "contest-1",
      ends_at: "2023-12-31T00:00:00.000Z",
    });
    abonnementDePass("customer.subscription.updated");

    expect((await POST(request())).status).toBe(200);
    expect(ligne("g7")?.ends_at).toBeNull();
    expect(ligne("g7-borne")?.ends_at).toBe("2023-12-31T00:00:00.000Z");
  });

  it("une panne de LECTURE rend 500 : le rejeu reprendra le même terme", async () => {
    // `event.created` ne bouge pas d'un rejeu à l'autre, à la différence de
    // `now()` : échouer franchement ici ne rallonge aucune grâce.
    octroi({ id: "g8" });
    octrois.selectError = { message: "pooler indisponible" };
    passEnImpaye();

    expect((await POST(request())).status).toBe(500);
    expect(ligne("g8")?.ends_at).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════
 * SD-6 — LA QUATRIÈME ISSUE : `reactivated`
 *
 * La migration 20260925120000 fait lever la grâce d'un octroi récurrent au
 * lieu d'en créer un second que la levée ferait ensuite violer l'index
 * d'unicité. Le webhook, lui, ne connaissait que trois issues : un rachat
 * parfaitement réussi sortait par le chemin d'alerte et n'écrivait AUCUNE trace
 * d'audit — le droit rouvert n'aurait figuré nulle part.
 * ════════════════════════════════════════════════════════════ */
describe("webhook Stripe — rachat pendant la grâce d'impayé", () => {
  beforeEach(() => {
    mocks.rpc.mockImplementation((name: string) =>
      name === "grant_module_from_payment"
        ? { data: [{ grant_id: "grant-9", outcome: "reactivated" }], error: null }
        : { data: null, error: null },
    );
    mocks.constructEvent.mockReturnValue(
      achatAddonEvent({
        metadata: {
          purchase: "module_grant",
          organization_id: "org-1",
          entitlement: "loyalty",
        },
      }),
    );
  });

  it("journalise la réactivation au lieu de crier à l'issue inconnue", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "module_grant.reactivated",
        metadata: expect.objectContaining({ grant_id: "grant-9" }),
      }),
    );
    // ROUGE AVANT LE CORRECTIF, et c'est l'assertion qui compte : la route
    // sortait par `stripe.module-grant-outcome` sans écrire d'audit.
    expect(mocks.reportError).not.toHaveBeenCalledWith(
      "stripe.module-grant-outcome",
      expect.anything(),
    );
  });

  it("TÉMOIN : une issue vraiment inconnue crie toujours et n'écrit rien", async () => {
    // Sans lui, accepter n'importe quel mot passerait le test précédent — et
    // rouvrirait le silence que ce garde-fou existe pour fermer.
    mocks.rpc.mockImplementation((name: string) =>
      name === "grant_module_from_payment"
        ? { data: [{ grant_id: "grant-9", outcome: "teleporte" }], error: null }
        : { data: null, error: null },
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.reportError).toHaveBeenCalledWith(
      "stripe.module-grant-outcome",
      expect.stringContaining("teleporte"),
    );
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════
 * SD-5 — LE PASS DE PRONOSTICS EST BORNÉ À SA COMPÉTITION
 *
 * `p_resource_id` était `null` EN DUR : un pass à 39 € vendu pour une
 * compétition ouvrait le module entier, douze mois durant.
 * ════════════════════════════════════════════════════════════ */
describe("webhook Stripe — la compétition d'une Saison de pronostics", () => {
  const CONTEST = "bbbb0000-0000-4000-8000-000000000009";

  beforeEach(() => {
    mocks.rpc.mockImplementation((name: string) =>
      name === "grant_module_from_payment"
        ? { data: [{ grant_id: "grant-p", outcome: "created" }], error: null }
        : { data: null, error: null },
    );
  });

  it("transmet le contest_id à la RPC d'octroi", async () => {
    mocks.constructEvent.mockReturnValue(
      achatAddonEvent({
        metadata: {
          purchase: "module_grant",
          organization_id: "org-1",
          entitlement: "pronostics",
          resource_id: CONTEST,
        },
      }),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    const args = octroiCalls()[0][1] as Record<string, unknown>;
    expect(args.p_module).toBe("pronostics");
    expect(args.p_resource_id).toBe(CONTEST);
  });

  it("les autres add-ons continuent d'ouvrir leur module ENTIER", async () => {
    // TÉMOIN. Borner un pass Chasse à une ressource le rendrait inopérant :
    // `org_has_live_module_grant` exige désormais `resource_id is null`.
    mocks.constructEvent.mockReturnValue(achatAddonEvent());

    await POST(request());

    const args = octroiCalls()[0][1] as Record<string, unknown>;
    expect(args.p_resource_id).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════
 * SD-2 — REPRENDRE CE QUI A ÉTÉ REMBOURSÉ OU CONTESTÉ
 *
 * Le piège central, et la raison d'être de la moitié de ces assertions : les
 * deux RPC s'apparient sur la référence D'ACHAT (identifiant de session, et
 * `stripe:<session>` pour le grand livre SMS), alors qu'un `charge.refunded`
 * porte une charge et un payment intent. Leur passer l'identifiant de charge
 * ne lèverait AUCUNE erreur — elles rendraient zéro ligne, donc « rien à
 * reprendre », et le module resterait ouvert. Le défaut serait silencieux.
 * ════════════════════════════════════════════════════════════ */
describe("webhook Stripe — remboursements et litiges", () => {
  const SESSION = "cs_rembourse_1";

  function remboursementEvent(over: Record<string, unknown> = {}) {
    return {
      id: "evt_refund_1",
      type: "charge.refunded",
      created: 1_700_000_900,
      data: {
        object: {
          id: "ch_1",
          payment_intent: "pi_1",
          amount: 3900,
          amount_refunded: 3900,
          ...over,
        },
      },
    };
  }

  const appels = (nom: string) =>
    mocks.rpc.mock.calls.filter((call) => call[0] === nom);

  beforeEach(() => {
    mocks.sessionsList.mockResolvedValue({
      data: [{ id: SESSION, client_reference_id: "org-1", metadata: {} }],
    });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "revoke_grant_for_refund") {
        return {
          data: [{ grant_id: "grant-r", grant_module: "hunts", revoked: true }],
          error: null,
        };
      }
      if (name === "debit_sms_balance_for_refund") {
        return {
          data: [{ org_id: "org-1", debited_units: 100, entry_id: "entry-9" }],
          error: null,
        };
      }
      return { data: null, error: null };
    });
  });

  it("traduit la charge en SESSION avant d'appeler les deux reprises", async () => {
    mocks.constructEvent.mockReturnValue(remboursementEvent());

    const response = await POST(request());

    expect(response.status).toBe(200);
    // La traduction elle-même : c'est le payment intent qui est interrogé.
    expect(mocks.sessionsList).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_1" }),
    );
    // L'OCTROI s'apparie sur la référence NUE de la session…
    expect(appels("revoke_grant_for_refund")[0][1]).toMatchObject({
      p_source_reference: SESSION,
      // …BORNÉ À L'ORGANISATION que la session nomme (MOYEN 1 de la revue).
      // Sans elle, les deux RPC ne connaissaient que la référence de paiement :
      // une référence venue d'ailleurs pouvait leur faire reprendre un droit
      // chez un autre tenant.
      p_organization_id: "org-1",
    });
    // …et le grand livre SMS sur la même référence PRÉFIXÉE, celle que
    // `creditSmsPack` a écrite. La passer nue rendrait zéro ligne en silence.
    expect(appels("debit_sms_balance_for_refund")[0][1]).toMatchObject({
      p_source_reference: `stripe:${SESSION}`,
      p_organization_id: "org-1",
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "module_grant.revoked" }),
    );
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sms_credit.refunded" }),
    );
  });

  it("la metadata de session sert de REPLI pour l'organisation", async () => {
    // Un Payment Link, ou une session antérieure au `client_reference_id` :
    // l'organisation reste lisible, et la reprise doit rester possible.
    mocks.sessionsList.mockResolvedValue({
      data: [
        {
          id: SESSION,
          client_reference_id: null,
          metadata: { organization_id: "org-7" },
        },
      ],
    });
    mocks.constructEvent.mockReturnValue(remboursementEvent());

    expect((await POST(request())).status).toBe(200);
    expect(appels("revoke_grant_for_refund")[0][1]).toMatchObject({
      p_organization_id: "org-7",
    });
  });

  it("SESSION SANS ORGANISATION : criée et acquittée, aucune RPC à l'aveugle", async () => {
    // Le paramètre est devenu REQUIS : sans organisation, il n'y a plus d'appel
    // possible. Acquitter plutôt que rendre 500 — la metadata est gelée sur la
    // session, aucun rejeu ne la réparera, et trois jours de rejeux finissent
    // par désactiver le point d'entrée, donc par couper la synchro des
    // abonnements. Aucun achat ayant ouvert un droit ne tombe ici : nos propres
    // sessions portent l'organisation deux fois.
    mocks.sessionsList.mockResolvedValue({
      data: [{ id: SESSION, client_reference_id: null, metadata: {} }],
    });
    mocks.constructEvent.mockReturnValue(remboursementEvent());

    expect((await POST(request())).status).toBe(200);
    expect(appels("revoke_grant_for_refund")).toHaveLength(0);
    expect(appels("debit_sms_balance_for_refund")).toHaveLength(0);
    expect(mocks.reportError).toHaveBeenCalledWith(
      "stripe.remboursement-organisation",
      expect.stringContaining(SESSION),
    );
  });

  it("un litige emprunte le même chemin, en entier", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_dispute_1",
      type: "charge.dispute.created",
      created: 1_700_000_950,
      data: { object: { id: "dp_1", charge: "ch_1", payment_intent: "pi_1" } },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(appels("revoke_grant_for_refund")).toHaveLength(1);
  });

  it("REJEU : les RPC sont rappelées et ne rendent plus rien — 200, sans audit", async () => {
    // L'idempotence vit ENTIÈREMENT dans les deux RPC (octroi déjà révoqué non
    // retouché, index de débit unique). Le webhook n'a donc pas à se souvenir :
    // il rappelle, et zéro ligne veut dire « déjà fait », jamais « échec ».
    mocks.rpc.mockImplementation(() => ({ data: [], error: null }));
    mocks.constructEvent.mockReturnValue(remboursementEvent());

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ revoked: 0, sms_debited: 0 });
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("REMBOURSEMENT PARTIEL : signalé, RIEN n'est repris", async () => {
    // Rembourser 10 € sur un pass à 39 € ne dit pas si le droit doit tomber.
    // Le deviner couperait un client servi ; on acquitte et un humain tranche.
    mocks.constructEvent.mockReturnValue(
      remboursementEvent({ amount: 3900, amount_refunded: 1000 }),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(appels("revoke_grant_for_refund")).toHaveLength(0);
    expect(appels("debit_sms_balance_for_refund")).toHaveLength(0);
    expect(mocks.reportError).toHaveBeenCalledWith(
      "stripe.remboursement-partiel",
      expect.stringContaining("ch_1"),
    );
  });

  it("AUCUNE SESSION : rien à reprendre, et surtout aucune RPC à l'aveugle", async () => {
    // Facture d'abonnement, paiement hors tunnel. Appeler les RPC avec une
    // référence qu'elles ne connaissent pas ne casserait rien — c'est bien le
    // problème : ça classerait l'événement traité sans rien avoir fait.
    mocks.sessionsList.mockResolvedValue({ data: [] });
    mocks.constructEvent.mockReturnValue(remboursementEvent());

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(appels("revoke_grant_for_refund")).toHaveLength(0);
  });

  it("STRIPE INJOIGNABLE pendant la traduction : 500, pour que le rejeu reprenne", async () => {
    mocks.sessionsList.mockRejectedValue(new Error("Stripe indisponible"));
    mocks.constructEvent.mockReturnValue(remboursementEvent());

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(appels("revoke_grant_for_refund")).toHaveLength(0);
  });

  it("PANNE DE LA RPC : 500 assumé, le rejeu ne reprend rien deux fois", async () => {
    mocks.rpc.mockImplementation((name: string) =>
      name === "revoke_grant_for_refund"
        ? { data: null, error: { message: "boom" } }
        : { data: [], error: null },
    );
    mocks.constructEvent.mockReturnValue(remboursementEvent());

    const response = await POST(request());

    expect(response.status).toBe(500);
  });
});
