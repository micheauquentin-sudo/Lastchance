import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════
 * createCheckoutSession — LE REFUS QUI PROTÈGE L'ARGENT
 *
 * Masquer le bouton « Démarrer mon abonnement » ne garantit rien : il se
 * décide sur `organizations.subscription_status`, et `mapStripeStatus` y
 * replie `unpaid` sur le même `canceled` qu'un `incomplete_expired`. Or
 * `unpaid` laisse un abonnement VIVANT chez Stripe, réactivable depuis le
 * portail. Le commerçant en impayé se voyait donc offrir les deux boutons, et
 * le checkout lui ouvrait un SECOND abonnement facturé en parallèle du
 * premier.
 *
 * L'information manquante n'existe nulle part en base — le statut interne n'a
 * que cinq valeurs autorisées, et le repli est délibéré côté accès. La garde
 * demande donc à Stripe, et vit dans l'ACTION : elle couvre du même geste la
 * page laissée ouverte, le POST rejoué et le retour arrière après paiement,
 * qu'un bouton caché n'a jamais arrêtés.
 * ════════════════════════════════════════════════════════════ */

const ORG_ID = "40000000-0000-4000-8000-000000000001";

const { state } = vi.hoisted(() => ({
  state: {
    /**
     * Abonnements que Stripe déclare pour ce client.
     *
     * `items` est OPTIONNEL et son absence a un sens testé : elle décrit une
     * photographie qu'on ne sait pas lire, sur laquelle la garde se ferme.
     */
    subscriptions: [] as Array<{
      id: string;
      status: string;
      items?: { data: Array<{ price: { id: string } }>; has_more?: boolean };
    }>,
    /** Panne de l'API Stripe au moment de lister. */
    listFails: false,
    /** Sessions de paiement réellement créées — doit rester vide sur refus. */
    created: [] as Array<Record<string, unknown>>,
    /** Statut interne de l'organisation. */
    subscriptionStatus: "canceled" as string,
    /** Client Stripe déjà associé. */
    customerId: "cus_existant" as string,
  },
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/authorization", () => ({
  requireOrganizationOwner: vi.fn(async () => ({
    user: { id: "user-1", email: "owner@example.test" },
    organization: {
      id: ORG_ID,
      name: "Boulangerie du Coin",
      plan: "core",
      stripe_customer_id: state.customerId,
      subscription_status: state.subscriptionStatus,
      trial_ends_at: "2026-01-01T00:00:00Z",
    },
  })),
}));

vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));

// Partiel et NON total : `hasLiveStripeSubscription` et `resolveCheckoutPlan`
// restent les vrais. Stubber la garde reviendrait à tester le stub.
vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return {
    ...actual,
    ensureStripeCustomer: vi.fn(async () => state.customerId),
    getStripe: vi.fn(() => ({
      subscriptions: {
        list: () => ({
          async *[Symbol.asyncIterator]() {
            if (state.listFails) throw new Error("Stripe indisponible");
            for (const subscription of state.subscriptions) yield subscription;
          },
        }),
      },
      checkout: {
        sessions: {
          create: async (payload: Record<string, unknown>) => {
            state.created.push(payload);
            return { url: "https://checkout.stripe.test/session" };
          },
        },
      },
    })),
  };
});

import { createCheckoutSession } from "./billing";

beforeEach(() => {
  state.subscriptions = [];
  state.listFails = false;
  state.created = [];
  state.subscriptionStatus = "canceled";
  state.customerId = "cus_existant";
  vi.stubEnv("STRIPE_PRICE_ID_CORE", "price_core_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Joue l'action et rend soit son refus, soit l'URL de redirection. */
async function checkout(): Promise<
  { refused: string } | { redirectedTo: string }
> {
  try {
    const result = await createCheckoutSession();
    if (result && !result.ok) return { refused: result.error };
    throw new Error("l'action a rendu un succès sans rediriger");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("NEXT_REDIRECT:")) {
      return { redirectedTo: message.slice("NEXT_REDIRECT:".length) };
    }
    throw err;
  }
}

describe("createCheckoutSession — garde anti-double abonnement", () => {
  it("IMPAYÉ : le statut interne dit `canceled`, Stripe dit `unpaid` → REFUS", async () => {
    // LE FINDING, joué de bout en bout. Rien dans l'organisation ne distingue
    // cet impayé d'une résiliation : c'est Stripe qui tranche.
    state.subscriptionStatus = "canceled";
    state.subscriptions = [{ id: "sub_impaye", status: "unpaid" }];

    const outcome = await checkout();

    expect(outcome).toHaveProperty("refused");
    expect(state.created).toEqual([]);
    // Le message doit renvoyer au portail : c'est par là qu'un impayé se
    // régularise, et `canManage` y laisse justement le bouton ouvert.
    expect("refused" in outcome && outcome.refused).toContain(
      "Gérer mon abonnement",
    );
  });

  it("RÉSILIÉ POUR DE BON : la porte reste ouverte, un checkout part", async () => {
    // TÉMOIN. Sans lui, une garde qui refuserait TOUT passerait le test
    // précédent — et rétablirait l'impasse commerciale qu'on vient de fermer.
    state.subscriptionStatus = "canceled";
    state.subscriptions = [
      { id: "sub_1", status: "canceled" },
      { id: "sub_2", status: "incomplete_expired" },
    ];

    const outcome = await checkout();

    expect(outcome).toEqual({
      redirectedTo: "https://checkout.stripe.test/session",
    });
    expect(state.created).toHaveLength(1);
  });

  it("ESSAI RÉSILIÉ PAR LE CRON : la porte du réabonnement reste ouverte", async () => {
    // LA QUESTION QUI DÉCIDE SI LE CORRECTIF EST TENABLE. Le cron
    // `expire-trials` fait passer un essai jamais converti de `trialing` à
    // `canceled`. Si ce statut fermait le checkout, on transformerait une
    // correction cosmétique — un statut qui dit enfin la vérité — en IMPASSE
    // COMMERCIALE : le commerçant qui revient un mois plus tard ne pourrait
    // plus s'abonner du tout.
    //
    // Ce qui le garantit : `billingActions` rouvre `canCheckout` sur
    // `canceled`, et `everSubscribed` reste faux (le cron n'écrit PAS
    // `stripe_event_created_at`, seul `apply_stripe_subscription_event_v2`
    // le fait). La garde serveur, elle, ne voit aucun abonnement vivant.
    state.subscriptionStatus = "canceled";
    state.subscriptions = [];

    const outcome = await checkout();

    expect(outcome).toEqual({
      redirectedTo: "https://checkout.stripe.test/session",
    });
    expect(state.created).toHaveLength(1);
    // ET AUCUN ESSAI NEUF N'EST RÉARMÉ : `trialDaysLeft` rend 0 hors
    // `trialing`, donc `trial_period_days` est absent. Un essai qui se
    // réarmerait à chaque bascule offrirait le produit indéfiniment.
    const subscriptionData = state.created[0].subscription_data as Record<
      string,
      unknown
    >;
    expect(subscriptionData).not.toHaveProperty("trial_period_days");
  });

  it("PREMIÈRE SOUSCRIPTION : aucun abonnement chez Stripe, checkout normal", async () => {
    state.subscriptionStatus = "trialing";
    state.subscriptions = [];

    const outcome = await checkout();

    expect(outcome).toHaveProperty("redirectedTo");
    expect(state.created).toHaveLength(1);
  });

  it("PAGE LAISSÉE OUVERTE : un abonné actif qui rejoue le POST est refusé", async () => {
    // Ce cas ne passait par AUCUNE garde auparavant : `canCheckout` masquait
    // le bouton, mais l'action, elle, acceptait tout ce qu'on lui postait.
    state.subscriptionStatus = "active";
    state.subscriptions = [{ id: "sub_actif", status: "active" }];

    const outcome = await checkout();

    expect(outcome).toHaveProperty("refused");
    expect(state.created).toEqual([]);
  });

  it("INCOMPLET / EN PAUSE : refusés aussi, ils se reprennent au portail", async () => {
    for (const status of ["incomplete", "paused", "past_due"]) {
      state.created = [];
      state.subscriptionStatus = "inactive";
      state.subscriptions = [{ id: `sub_${status}`, status }];

      const outcome = await checkout();

      expect(outcome, status).toHaveProperty("refused");
      expect(state.created, status).toEqual([]);
    }
  });

  it("STRIPE INJOIGNABLE : fermé par défaut, aucune session créée", async () => {
    // ROUGE SI : la garde avale sa propre panne et répond « aucun abonnement ».
    // Elle rouvrirait le doublon précisément quand plus rien ne le rattrape.
    state.listFails = true;
    state.subscriptions = [{ id: "sub_impaye", status: "unpaid" }];

    const outcome = await checkout();

    expect(outcome).toHaveProperty("refused");
    expect(state.created).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════
 * SD-3 — UN PASS MENSUEL NE DOIT PAS FERMER LA VENTE DE L'OFFRE
 *
 * Depuis le lot P0.5, un add-on mensuel acheté seul (Passeport 19 €,
 * Parrainage 12 €) crée chez Stripe un abonnement SÉPARÉ. La garde comptait
 * TOUS les abonnements du client : le commerçant qui prenait un pass avant de
 * s'abonner se retrouvait enfermé — bouton « Démarrer mon abonnement » affiché,
 * refus à chaque clic, et renvoi vers un portail qui ne sait pas créer
 * d'abonnement. Un produit à 12 € fermait le seul chemin de vente de l'offre.
 * ════════════════════════════════════════════════════════════ */
describe("createCheckoutSession — le pass mensuel n'est pas une offre", () => {
  const PRIX_PASS = "price_pass_loyalty_test";

  beforeEach(() => {
    // Le prix DOIT être configuré pour que `passDepuisPrix` le reconnaisse :
    // c'est la variable d'environnement qui fait exister le produit.
    vi.stubEnv("STRIPE_PRICE_ID_PASS_LOYALTY", PRIX_PASS);
  });

  it("ABONNEMENT 100 % PASS : le checkout d'offre reste ouvert", async () => {
    // LE FINDING. Rouge avant le correctif : la garde voyait « un abonnement
    // vivant » et refusait.
    state.subscriptionStatus = "canceled";
    state.subscriptions = [
      {
        id: "sub_pass",
        status: "active",
        items: { data: [{ price: { id: PRIX_PASS } }], has_more: false },
      },
    ];

    const outcome = await checkout();

    expect(outcome).toEqual({
      redirectedTo: "https://checkout.stripe.test/session",
    });
    expect(state.created).toHaveLength(1);
  });

  it("ABONNEMENT D'OFFRE : refusé comme avant", async () => {
    // TÉMOIN INDISPENSABLE. Sans lui, une garde qui laisserait TOUT passer
    // rendrait le test précédent vert en rouvrant le double prélèvement.
    state.subscriptionStatus = "active";
    state.subscriptions = [
      {
        id: "sub_offre",
        status: "active",
        items: { data: [{ price: { id: "price_core_test" } }], has_more: false },
      },
    ];

    const outcome = await checkout();

    expect(outcome).toHaveProperty("refused");
    expect(state.created).toEqual([]);
  });

  it("ABONNEMENT MIXTE : un seul item d'offre suffit à refuser", async () => {
    state.subscriptionStatus = "active";
    state.subscriptions = [
      {
        id: "sub_mixte",
        status: "active",
        items: {
          data: [{ price: { id: PRIX_PASS } }, { price: { id: "price_core_test" } }],
          has_more: false,
        },
      },
    ];

    const outcome = await checkout();

    expect(outcome).toHaveProperty("refused");
    expect(state.created).toEqual([]);
  });

  it("PHOTOGRAPHIE TRONQUÉE OU VIDE : fermé par défaut", async () => {
    // Une liste d'items paginée, ou absente, ne prouve PAS « pur pass ». On ne
    // conclut pas sur ce qu'on n'a pas lu — même sens que la panne Stripe.
    for (const items of [
      { data: [{ price: { id: PRIX_PASS } }], has_more: true },
      { data: [] },
      undefined,
    ]) {
      state.created = [];
      state.subscriptionStatus = "canceled";
      state.subscriptions = [{ id: "sub_tronque", status: "active", items }];

      const outcome = await checkout();

      expect(outcome, JSON.stringify(items)).toHaveProperty("refused");
      expect(state.created).toEqual([]);
    }
  });

  it("UN PASS VIVANT ET UNE OFFRE RÉSILIÉE : le réabonnement reste ouvert", async () => {
    // Le cas réel du commerçant qui a arrêté son offre mais garde son
    // Parrainage. L'abonnement mort est ignoré (statut terminal), celui qui
    // reste est un pass : rien ne doit l'empêcher de revenir.
    state.subscriptionStatus = "canceled";
    state.subscriptions = [
      {
        id: "sub_offre_morte",
        status: "canceled",
        items: { data: [{ price: { id: "price_core_test" } }] },
      },
      {
        id: "sub_pass",
        status: "active",
        items: { data: [{ price: { id: PRIX_PASS } }] },
      },
    ];

    const outcome = await checkout();

    expect(outcome).toEqual({
      redirectedTo: "https://checkout.stripe.test/session",
    });
    expect(state.created).toHaveLength(1);
  });
});
