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
    /** Abonnements que Stripe déclare pour ce client. */
    subscriptions: [] as Array<{ id: string; status: string }>,
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
