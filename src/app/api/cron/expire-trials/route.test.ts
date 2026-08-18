// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════
 * GET /api/cron/expire-trials
 *
 * Ce qui est réellement en jeu ici, c'est l'argent et la confiance des
 * clients : le cron a le pouvoir de marquer des comptes comme résiliés. Les
 * tests sont donc écrits autour de ce qu'il ne doit JAMAIS faire, pas autour
 * de ce qu'il fait en régime nominal.
 * ════════════════════════════════════════════════════════════ */

const db = vi.hoisted(() => ({
  /** Organisations rendues par le SELECT (déjà filtrées côté « base »). */
  candidates: [] as Array<{ id: string; stripe_customer_id: string | null }>,
  selectError: null as { message: string } | null,
  updateError: null as { message: string } | null,
  /**
   * Organisations dont l'UPDATE conditionnel ne touche AUCUNE ligne : un
   * webhook a déplacé le statut entre la lecture et l'écriture.
   */
  movedByWebhook: new Set<string>(),
  /** Filtres réellement posés par le SELECT — le lot doit être borné. */
  selectFilters: {} as Record<string, unknown>,
  selectLimit: null as number | null,
  /** Écritures tentées : payload + filtres. */
  updates: [] as Array<{
    payload: Record<string, unknown>;
    filters: Record<string, unknown>;
  }>,
}));

const mocks = vi.hoisted(() => ({
  hasLiveStripeSubscription: vi.fn(),
  getStripe: vi.fn(() => ({ marker: "stripe-client" })),
  recordCounter: vi.fn(),
  reportError: vi.fn(),
  reportSecurityEvent: vi.fn(),
  startWorkerRunSafely: vi.fn(),
  finishWorkerRunSafely: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  optionalEnv: (name: string) => (name === "CRON_SECRET" ? "cron-secret" : undefined),
}));
vi.mock("@/lib/monitoring", () => ({
  recordCounter: (...args: unknown[]) => mocks.recordCounter(...args),
  reportError: (...args: unknown[]) => mocks.reportError(...args),
  reportSecurityEvent: (...args: unknown[]) => mocks.reportSecurityEvent(...args),
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => mocks.getStripe(),
  hasLiveStripeSubscription: (...args: unknown[]) =>
    mocks.hasLiveStripeSubscription(...args),
}));
vi.mock("@/lib/worker-health", () => ({
  startWorkerRunSafely: (...args: unknown[]) => mocks.startWorkerRunSafely(...args),
  finishWorkerRunSafely: (...args: unknown[]) => mocks.finishWorkerRunSafely(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const filters: Record<string, unknown> = {};
      let payload: Record<string, unknown> | null = null;
      let isUpdate = false;

      const runUpdate = () => {
        db.updates.push({ payload: payload ?? {}, filters: { ...filters } });
        if (db.updateError) return { data: null, error: db.updateError };
        // Sémantique de l'UPDATE conditionnel Postgres : zéro ligne touchée
        // quand le prédicat `subscription_status = 'trialing'` ne tient plus.
        if (db.movedByWebhook.has(String(filters.id))) {
          return { data: [], error: null };
        }
        return { data: [{ id: filters.id }], error: null };
      };

      const builder: Record<string, unknown> = {
        select: () => (isUpdate ? Promise.resolve(runUpdate()) : builder),
        update: (next: Record<string, unknown>) => {
          isUpdate = true;
          payload = next;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        lt: (column: string, value: unknown) => {
          filters[`${column}<`] = value;
          return builder;
        },
        order: () => builder,
        limit: (n: number) => {
          db.selectFilters = { ...filters };
          db.selectLimit = n;
          return Promise.resolve(
            db.selectError
              ? { data: null, error: db.selectError }
              : { data: db.candidates, error: null },
          );
        },
      };
      return builder;
    },
  }),
}));

import { GET } from "./route";
import { TRIAL_EXPIRY_GRACE_DAYS } from "@/lib/subscription";

const request = (token = "cron-secret") =>
  new Request("https://app.example.com/api/cron/expire-trials", {
    headers: { authorization: `Bearer ${token}` },
  });

/** Statut effectivement écrit, organisation par organisation. */
const written = () =>
  db.updates.map((u) => ({
    id: u.filters.id,
    status: u.payload.subscription_status,
    guard: u.filters.subscription_status,
  }));

beforeEach(() => {
  vi.clearAllMocks();
  db.candidates = [];
  db.selectError = null;
  db.updateError = null;
  db.movedByWebhook = new Set();
  db.selectFilters = {};
  db.selectLimit = null;
  db.updates = [];
  mocks.startWorkerRunSafely.mockResolvedValue({ id: "run-1", startedAt: Date.now() });
  mocks.finishWorkerRunSafely.mockResolvedValue(undefined);
  mocks.getStripe.mockReturnValue({ marker: "stripe-client" });
});

describe("garde d'accès", () => {
  it("refuse un secret invalide avant d'ouvrir un heartbeat", async () => {
    const response = await GET(request("wrong"));

    expect(response.status).toBe(401);
    expect(mocks.startWorkerRunSafely).not.toHaveBeenCalled();
    expect(db.updates).toEqual([]);
  });
});

describe("sélection du lot", () => {
  it("ne regarde que les `trialing` échus depuis le délai de grâce, et borne le lot", async () => {
    await GET(request());

    expect(db.selectFilters.subscription_status).toBe("trialing");
    const cutoff = new Date(String(db.selectFilters["trial_ends_at<"])).getTime();
    const attendu = Date.now() - TRIAL_EXPIRY_GRACE_DAYS * 86_400_000;
    // Le seuil est bien DANS LE PASSÉ d'exactement le délai de grâce (à la
    // seconde d'exécution près). Un seuil posé à `now` résilierait des essais
    // finis il y a une minute.
    expect(Math.abs(cutoff - attendu)).toBeLessThan(5_000);
    expect(db.selectLimit).toBeGreaterThan(0);
  });

  it("un compte déjà `canceled` n'est jamais relu, donc jamais retouché", async () => {
    // IDEMPOTENCE, propriété 4 : elle tient par le filtre du SELECT. Deux
    // passages consécutifs — le second sur un lot vide, ce que la base rend
    // après la première bascule — n'écrivent qu'une fois.
    db.candidates = [{ id: "org-1", stripe_customer_id: null }];
    await GET(request());
    expect(written()).toHaveLength(1);

    db.candidates = [];
    db.updates = [];
    await GET(request());
    expect(written()).toEqual([]);
  });
});

describe("PROPRIÉTÉ 1 — jamais de résiliation sans avoir demandé à Stripe", () => {
  it("aucun client Stripe : bascule directe, sans appel", async () => {
    // `ensureStripeCustomer` écrit l'identifiant AVANT d'ouvrir la page de
    // paiement : sans lui, aucune page n'a jamais été ouverte, donc aucun
    // abonnement ne peut exister. L'appel serait d'ailleurs impossible.
    db.candidates = [{ id: "org-1", stripe_customer_id: null }];

    const body = await (await GET(request())).json();

    expect(mocks.hasLiveStripeSubscription).not.toHaveBeenCalled();
    expect(written()).toEqual([
      { id: "org-1", status: "canceled", guard: "trialing" },
    ]);
    expect(body.canceled).toBe(1);
  });

  it("client Stripe présent : Stripe est interrogé avant CHAQUE bascule", async () => {
    db.candidates = [
      { id: "org-1", stripe_customer_id: "cus_1" },
      { id: "org-2", stripe_customer_id: "cus_2" },
    ];
    mocks.hasLiveStripeSubscription.mockResolvedValue(false);

    await GET(request());

    expect(mocks.hasLiveStripeSubscription).toHaveBeenCalledTimes(2);
    expect(mocks.hasLiveStripeSubscription).toHaveBeenCalledWith(
      { marker: "stripe-client" },
      "cus_1",
    );
    expect(written()).toHaveLength(2);
  });
});

describe("PROPRIÉTÉ 2 — une panne Stripe ne résilie PERSONNE", () => {
  it("échec de l'appel : l'organisation est sautée, pas basculée", async () => {
    db.candidates = [{ id: "org-1", stripe_customer_id: "cus_1" }];
    mocks.hasLiveStripeSubscription.mockRejectedValue(new Error("Stripe 503"));

    const response = await GET(request());
    const body = await response.json();

    // LE POINT CENTRAL : aucune écriture. Le compte reste `trialing`, exactement
    // l'état d'avant ce cron — le pire cas du filet est le statu quo.
    expect(db.updates).toEqual([]);
    expect(body.canceled).toBe(0);
    expect(body.stripeUnavailable).toBe(1);
    expect(response.status).toBe(200);
  });

  it("panne GÉNÉRALE : les 50 comptes du lot survivent, une seule remontée", async () => {
    db.candidates = Array.from({ length: 50 }, (_, i) => ({
      id: `org-${i}`,
      stripe_customer_id: `cus_${i}`,
    }));
    mocks.hasLiveStripeSubscription.mockRejectedValue(new Error("Stripe 503"));

    const body = await (await GET(request())).json();

    expect(db.updates).toEqual([]);
    expect(body.stripeUnavailable).toBe(50);
    // Une panne générale ne doit pas noyer Sentry sous 50 événements
    // identiques : c'est un incident, pas cinquante.
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
    // Le heartbeat le dit, sans faire échouer le passage : le travail a bien eu
    // lieu, il n'a simplement rien pu conclure.
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "degraded",
      expect.objectContaining({ canceled: 0, stripeUnavailable: 50 }),
      "stripe_or_write_unavailable",
    );
  });

  it("STRIPE NON CONFIGURÉ : même refus, aucune bascule", async () => {
    // `getStripe()` lève sur `STRIPE_SECRET_KEY` absent. Traiter cette absence
    // comme « aucun abonnement » résilierait tout le parc au premier
    // environnement mal configuré.
    db.candidates = [{ id: "org-1", stripe_customer_id: "cus_1" }];
    mocks.getStripe.mockImplementation(() => {
      throw new Error("STRIPE_SECRET_KEY manquante");
    });

    const body = await (await GET(request())).json();

    expect(db.updates).toEqual([]);
    expect(body.stripeUnavailable).toBe(1);
  });

  it("une panne isolée n'arrête pas le lot : les autres comptes sont traités", async () => {
    // TÉMOIN de la précédente. Un cron qui s'arrêterait à la première erreur
    // passerait tous les tests ci-dessus tout en ne finissant jamais son
    // travail sur un client Stripe supprimé.
    db.candidates = [
      { id: "org-1", stripe_customer_id: "cus_absent" },
      { id: "org-2", stripe_customer_id: "cus_2" },
    ];
    mocks.hasLiveStripeSubscription.mockImplementation(
      async (_stripe: unknown, customerId: string) => {
        if (customerId === "cus_absent") throw new Error("No such customer");
        return false;
      },
    );

    const body = await (await GET(request())).json();

    expect(written()).toEqual([
      { id: "org-2", status: "canceled", guard: "trialing" },
    ]);
    expect(body).toMatchObject({ canceled: 1, stripeUnavailable: 1 });
  });
});

describe("PROPRIÉTÉ 3 — un abonnement vivant est un WEBHOOK PERDU", () => {
  it("ne résilie pas, compte, et remonte", async () => {
    db.candidates = [
      { id: "org-1", stripe_customer_id: "cus_1" },
      { id: "org-2", stripe_customer_id: "cus_2" },
    ];
    mocks.hasLiveStripeSubscription.mockResolvedValue(true);

    const body = await (await GET(request())).json();

    expect(db.updates).toEqual([]);
    expect(body.liveSubscription).toBe(2);
    // UNE LIGNE PAR ORGANISATION : `ops_metrics_summary` compte les appels, le
    // back-office lit donc un NOMBRE de webhooks perdus, pas un booléen.
    expect(mocks.recordCounter).toHaveBeenCalledTimes(2);
    expect(mocks.recordCounter).toHaveBeenCalledWith("billing.trial_status_desync");
    expect(mocks.reportSecurityEvent).toHaveBeenCalledWith(
      "stripe_trial_status_desync",
      { organizations: 2 },
    );
  });

  it("aucun désaccord : rien n'est remonté", async () => {
    // TÉMOIN. Une remontée inconditionnelle rendrait le signal inutile.
    db.candidates = [{ id: "org-1", stripe_customer_id: "cus_1" }];
    mocks.hasLiveStripeSubscription.mockResolvedValue(false);

    await GET(request());

    expect(mocks.recordCounter).not.toHaveBeenCalled();
    expect(mocks.reportSecurityEvent).not.toHaveBeenCalled();
  });

  it("le désaccord ne fait pas virer le heartbeat : il n'est pas de son fait", async () => {
    db.candidates = [{ id: "org-1", stripe_customer_id: "cus_1" }];
    mocks.hasLiveStripeSubscription.mockResolvedValue(true);

    await GET(request());

    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "succeeded",
      expect.objectContaining({ liveSubscription: 1 }),
      undefined,
    );
  });
});

describe("PROPRIÉTÉ 4 — idempotence et événements hors ordre", () => {
  it("l'écriture est CONDITIONNELLE au statut `trialing`", async () => {
    db.candidates = [{ id: "org-1", stripe_customer_id: null }];

    await GET(request());

    expect(db.updates[0].filters).toEqual({
      id: "org-1",
      subscription_status: "trialing",
    });
    expect(db.updates[0].payload).toEqual({ subscription_status: "canceled" });
  });

  it("un webhook arrivé entre la lecture et l'écriture GARDE la main", async () => {
    // L'événement hors ordre : le commerçant souscrit pendant le passage du
    // cron. Le prédicat de l'UPDATE ne tient plus, zéro ligne touchée — et le
    // cron ne compte surtout pas cette non-écriture comme une résiliation.
    db.candidates = [{ id: "org-1", stripe_customer_id: null }];
    db.movedByWebhook.add("org-1");

    const body = await (await GET(request())).json();

    expect(body).toMatchObject({ canceled: 0, alreadyMoved: 1 });
  });

  it("le payload ne touche QUE le statut", async () => {
    // `plan` et les colonnes `addon_*` sont gouvernées par Stripe et gardées
    // par un trigger (`protect_stripe_managed_entitlements`) : les écrire ici
    // ferait lever un 42501 et casserait la bascule.
    db.candidates = [{ id: "org-1", stripe_customer_id: null }];

    await GET(request());

    expect(Object.keys(db.updates[0].payload)).toEqual(["subscription_status"]);
  });
});

describe("pannes locales", () => {
  it("SELECT en échec : 500, aucune écriture, heartbeat `failed`", async () => {
    db.selectError = { message: "connection reset" };

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(db.updates).toEqual([]);
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "failed",
      { canceled: 0 },
      "read_failed",
    );
  });

  it("UPDATE en échec : compté, jamais compté comme résilié", async () => {
    db.candidates = [{ id: "org-1", stripe_customer_id: null }];
    db.updateError = { message: "deadlock detected" };

    const body = await (await GET(request())).json();

    expect(body).toMatchObject({ canceled: 0, writeFailed: 1 });
  });

  it("travaille sans journal de santé", async () => {
    // Même règle que les huit autres crons quotidiens : la supervision ne
    // gouverne pas le travail métier.
    mocks.startWorkerRunSafely.mockResolvedValue(null);
    db.candidates = [{ id: "org-1", stripe_customer_id: null }];

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(written()).toHaveLength(1);
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      null,
      "succeeded",
      expect.objectContaining({ canceled: 1 }),
      undefined,
    );
  });
});

describe("PROPRIÉTÉ 5 — le budget d'horloge sort proprement (JOB-6)", () => {
  /**
   * Fait avancer l'horloge de `pasMs` à CHAQUE appel Stripe, sans rien
   * attendre réellement : c'est le seul moyen d'atteindre un budget de 45 s
   * dans un test qui doit durer une milliseconde.
   */
  function horlogeQuiAvanceAChaqueAppelStripe(pasMs: number) {
    let maintenant = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => maintenant);
    mocks.hasLiveStripeSubscription.mockImplementation(async () => {
      maintenant += pasMs;
      return false;
    });
  }

  // `clearAllMocks` vide les appels mais ne DÉFAIT pas un `spyOn` : sans ceci,
  // l'horloge figée de ces tests suivrait dans tout le reste du fichier.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("s'arrête avant la limite Vercel et compte le reliquat", async () => {
    // LE DÉFAUT QUE CE TEST FERME. `BATCH_SIZE` borne le NOMBRE de lignes, pas
    // le TEMPS : 200 appels Stripe lents dépassaient la minute et la fonction
    // était TUÉE en plein milieu — heartbeat laissé ouvert en `running`,
    // indistinguable d'un worker au travail, reliquat invisible.
    db.candidates = Array.from({ length: 20 }, (_, i) => ({
      id: `org-${i}`,
      stripe_customer_id: `cus_${i}`,
    }));
    // 10 s par organisation : la cinquième franchit les 45 s de budget.
    horlogeQuiAvanceAChaqueAppelStripe(10_000);

    const body = await (await GET(request())).json();

    expect(body.candidates).toBe(20);
    expect(body.canceled).toBe(5);
    expect(body.deferred).toBe(15);
    // Et surtout : le reste n'a PAS été touché.
    expect(written()).toHaveLength(5);
  });

  it("clôt en `degraded` avec le code du reliquat, pas celui d'une panne", async () => {
    db.candidates = Array.from({ length: 10 }, (_, i) => ({
      id: `org-${i}`,
      stripe_customer_id: `cus_${i}`,
    }));
    horlogeQuiAvanceAChaqueAppelStripe(50_000);

    await GET(request());

    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "degraded",
      expect.objectContaining({ deferred: 9 }),
      "organizations_deferred",
    );
  });

  it("une panne Stripe garde la priorité sur le reliquat dans le code de sortie", async () => {
    // Les deux causes coexistent ; celle qui demande un REGARD doit gagner —
    // un reliquat se rattrape demain tout seul, pas une panne.
    db.candidates = Array.from({ length: 10 }, (_, i) => ({
      id: `org-${i}`,
      stripe_customer_id: `cus_${i}`,
    }));
    let maintenant = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => maintenant);
    mocks.hasLiveStripeSubscription.mockImplementation(async () => {
      maintenant += 50_000;
      throw new Error("stripe down");
    });

    await GET(request());

    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "degraded",
      expect.objectContaining({ deferred: 9, stripeUnavailable: 1 }),
      "stripe_or_write_unavailable",
    );
  });

  it("un lot qui tient dans le budget ne différe rien et reste `succeeded`", async () => {
    db.candidates = [
      { id: "org-1", stripe_customer_id: null },
      { id: "org-2", stripe_customer_id: null },
    ];

    const body = await (await GET(request())).json();

    expect(body.deferred).toBe(0);
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "succeeded",
      expect.objectContaining({ deferred: 0, canceled: 2 }),
      undefined,
    );
  });
});

describe("discrétion", () => {
  it("aucun identifiant d'organisation ni de client Stripe dans la supervision", async () => {
    db.candidates = [{ id: "org-secret", stripe_customer_id: "cus_secret" }];
    mocks.hasLiveStripeSubscription.mockResolvedValue(true);

    await GET(request());

    const trace = JSON.stringify([
      mocks.finishWorkerRunSafely.mock.calls,
      mocks.recordCounter.mock.calls,
      mocks.reportSecurityEvent.mock.calls,
    ]);
    expect(trace).not.toContain("org-secret");
    expect(trace).not.toContain("cus_secret");
  });
});
