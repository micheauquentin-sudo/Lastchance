import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════
 * createAddonCheckoutSession — CE QUE LE NAVIGATEUR N'A PAS LE DROIT DE DIRE
 *
 * L'action est le seul endroit où une valeur venue du navigateur devient une
 * session de paiement. Tout ce qu'elle laisse passer, le webhook le croira :
 * `readModuleGrantPurchase` relit l'add-on au catalogue, mais il fait confiance
 * à l'organisation portée par la session et à la jauge qu'elle déclare.
 *
 * Les tests ci-dessous sont donc écrits par ordre de coût de l'erreur, et non
 * par ordre de lecture du code :
 *
 *   1. QU'AUCUNE SESSION NE SOIT CRÉÉE SUR UN REFUS. Un refus qui a déjà créé
 *      la session laisse un tunnel de paiement ouvert sur un produit qu'on
 *      vient de déclarer invendable.
 *   2. QUE LES DEUX PORTEURS D'IDENTITÉ CONCORDENT. Le webhook exige les deux
 *      et refuse s'ils divergent ; les poser d'ici est la seule façon qu'ils
 *      concordent.
 *   3. QUE NI PRIX NI DURÉE NE VOYAGENT. Les recopier en metadata créerait une
 *      seconde source de vérité, que le catalogue finirait par contredire.
 * ════════════════════════════════════════════════════════════ */

const ORG_ID = "40000000-0000-4000-8000-000000000002";

const { state } = vi.hoisted(() => ({
  state: {
    /** Sessions réellement créées — doit rester vide sur chaque refus. */
    created: [] as Array<Record<string, unknown>>,
    /** Le demandeur est-il propriétaire de l'organisation ? */
    estProprietaire: true,
    /** Ce que la base répond sur l'octroi récurrent déjà en cours. */
    recurrent: "aucun" as "actif" | "aucun" | "indetermine",
    /** Organisations interrogées, pour prouver que la question est posée. */
    interroge: [] as Array<{ organizationId: string; module: string }>,
  },
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/authorization", () => ({
  requireOrganizationOwner: vi.fn(async () => {
    // Le vrai lève pour un éditeur. Le simuler ici prouve que l'action
    // n'atteint jamais Stripe quand l'appelant n'a pas le droit d'acheter.
    if (!state.estProprietaire) throw new Error("FORBIDDEN");
    return {
      user: { id: "user-1", email: "owner@example.test" },
      organization: {
        id: ORG_ID,
        name: "Boulangerie du Coin",
        plan: "core",
        stripe_customer_id: "cus_existant",
        subscription_status: "active",
        trial_ends_at: null,
      },
    };
  }),
}));

vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));

/**
 * Le chargeur est remplacé, pas la base : ce fichier éprouve la CONDUITE de
 * l'action selon la réponse reçue, et la fidélité du prédicat à l'index unique
 * se prouve en SQL (`supabase/tests/module_grant_recurring.test.sql`). Le
 * simuler ici permet d'exercer les trois réponses, dont l'indécision — qu'aucun
 * jeu de données réel ne produit à la demande.
 */
vi.mock("@/lib/module-grants-loader", () => ({
  octroiRecurrentVivant: vi.fn(async (organizationId: string, module: string) => {
    state.interroge.push({ organizationId, module });
    return state.recurrent;
  }),
  chargerOctroisEnAttente: vi.fn(async () => []),
}));

// Partiel : `resolveAddonCheckout` et le catalogue restent les vrais. Stubber
// la résolution du prix reviendrait à tester le stub.
vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return {
    ...actual,
    ensureStripeCustomer: vi.fn(async () => "cus_existant"),
    getStripe: vi.fn(() => ({
      checkout: {
        sessions: {
          create: async (payload: Record<string, unknown>) => {
            state.created.push(payload);
            return { url: "https://checkout.stripe.test/addon" };
          },
        },
      },
    })),
  };
});

import { createAddonCheckoutSession } from "./billing";

beforeEach(() => {
  state.created = [];
  state.estProprietaire = true;
  state.recurrent = "aucun";
  state.interroge = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Joue l'action et rend soit son refus, soit l'URL de redirection. */
async function acheter(
  addon: string | null,
  capacity?: string,
): Promise<{ refus: string } | { versUrl: string }> {
  const formData = new FormData();
  if (addon !== null) formData.set("addon", addon);
  if (capacity !== undefined) formData.set("capacity", capacity);

  try {
    const result = await createAddonCheckoutSession(undefined, formData);
    if (result && !result.ok) return { refus: result.error };
    throw new Error("l'action a rendu un succès sans rediriger");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("NEXT_REDIRECT:")) {
      return { versUrl: message.slice("NEXT_REDIRECT:".length) };
    }
    throw err;
  }
}

/** Unique session créée, ou l'échec du test si le compte n'est pas de un. */
function seuleSession(): Record<string, unknown> {
  expect(state.created).toHaveLength(1);
  return state.created[0];
}

describe("un achat unique valide part chez Stripe tel qu'il a été cliqué", () => {
  it("crée une session de paiement au prix du catalogue et redirige", () => {
    vi.stubEnv("STRIPE_PRICE_ID_PASS_HUNTS", "price_pass_hunts");

    return acheter("hunts").then((issue) => {
      expect(issue).toEqual({ versUrl: "https://checkout.stripe.test/addon" });

      const session = seuleSession();
      expect(session.mode).toBe("payment");
      expect(session.line_items).toEqual([
        { price: "price_pass_hunts", quantity: 1 },
      ]);
    });
  });

  it("les deux porteurs d'identité concordent, sinon le webhook refusera", () => {
    vi.stubEnv("STRIPE_PRICE_ID_PASS_HUNTS", "price_pass_hunts");

    return acheter("hunts").then(() => {
      const session = seuleSession();
      const metadata = session.metadata as Record<string, string>;

      expect(session.client_reference_id).toBe(ORG_ID);
      expect(metadata.organization_id).toBe(ORG_ID);
      // `readModuleGrantPurchase` exige les deux ET leur égalité : il rend
      // `invalid` si l'un manque ou s'ils divergent.
      expect(metadata.organization_id).toBe(session.client_reference_id);
    });
  });

  it("la metadata porte une CLÉ, jamais un prix ni une durée", () => {
    vi.stubEnv("STRIPE_PRICE_ID_PASS_QUIZ", "price_pass_quiz");

    return acheter("quiz").then(() => {
      const metadata = seuleSession().metadata as Record<string, string>;

      expect(metadata.purchase).toBe("module_grant");
      expect(metadata.entitlement).toBe("quiz");
      // « 15 EUR / 7 jours » est au catalogue et relu côté webhook. Le
      // recopier ici en ferait une seconde source, que le catalogue
      // contredirait au premier changement de tarif.
      expect(Object.keys(metadata).sort()).toEqual([
        "entitlement",
        "organization_id",
        "purchase",
      ]);
    });
  });

  it("un add-on sans jauge n'emporte pas de capacité", () => {
    vi.stubEnv("STRIPE_PRICE_ID_PASS_HUNTS", "price_pass_hunts");

    return acheter("hunts", "30").then(() => {
      const metadata = seuleSession().metadata as Record<string, string>;
      // La jauge postée est ignorée, pas retenue : `readModuleGrantPurchase`
      // ne la lit que pour un pass à jauge, et l'écrire ici laisserait croire
      // qu'elle a été payée.
      expect(metadata.capacity).toBeUndefined();
    });
  });
});

describe("pass à jauge — le palier payé est celui qui part chez Stripe", () => {
  it("porte le prix du palier ET sa capacité en metadata", () => {
    vi.stubEnv("STRIPE_PRICE_ID_PASS_EVENTS_30", "price_events_30");

    return acheter("events", "30").then(() => {
      const session = seuleSession();
      const metadata = session.metadata as Record<string, string>;

      expect(session.line_items).toEqual([
        { price: "price_events_30", quantity: 1 },
      ]);
      // Chaîne, pas nombre : Stripe refuse une metadata non textuelle, et
      // l'échec surviendrait à la vente, pas au test.
      expect(metadata.capacity).toBe("30");
    });
  });

  it("une jauge hors des paliers vendus ne crée AUCUNE session", () => {
    vi.stubEnv("STRIPE_PRICE_ID_PASS_EVENTS_30", "price_events_30");

    return acheter("events", "500").then((issue) => {
      expect(issue).toHaveProperty("refus");
      expect(state.created).toHaveLength(0);
    });
  });

  it("une jauge illisible est refusée, jamais repliée sur un palier", () => {
    vi.stubEnv("STRIPE_PRICE_ID_PASS_EVENTS_10", "price_events_10");

    return Promise.all([
      acheter("events", "trente"),
      acheter("events"),
    ]).then(() => {
      // Un repli sur le premier palier vendrait 10 joueurs à qui en demandait
      // trente — l'erreur va contre le client, celle-là se signale, mais elle
      // reste un débit pour un produit faux.
      expect(state.created).toHaveLength(0);
    });
  });
});

describe("aucun refus ne laisse un tunnel de paiement ouvert", () => {
  it("un add-on sans prix configuré est refusé sans session", () => {
    vi.stubEnv("STRIPE_PRICE_ID_PASS_HUNTS", "");

    return acheter("hunts").then((issue) => {
      expect(issue).toHaveProperty("refus");
      expect(state.created).toHaveLength(0);
    });
  });

  it("un add-on inconnu ou absent est refusé sans session", () => {
    return Promise.all([acheter("module-inexistant"), acheter(null)]).then(
      (issues) => {
        for (const issue of issues) expect(issue).toHaveProperty("refus");
        expect(state.created).toHaveLength(0);
      },
    );
  });

  it("le doute sur l'octroi en cours ne laisse pas partir un mensuel", () => {
    // Vendre sans savoir s'il l'a déjà, c'est risquer le second prélèvement
    // qu'on vient d'interdire. Une panne de lecture refuse la VENTE.
    vi.stubEnv("STRIPE_PRICE_ID_PASS_LOYALTY", "price_pass_loyalty");
    state.recurrent = "indetermine";

    return acheter("loyalty").then((issue) => {
      expect(issue).toHaveProperty("refus");
      expect(state.created).toHaveLength(0);
    });
  });

  it("un éditeur n'atteint jamais Stripe", () => {
    vi.stubEnv("STRIPE_PRICE_ID_PASS_HUNTS", "price_pass_hunts");
    state.estProprietaire = false;

    // Le §3 du cahier : « un propriétaire peut acheter ; un éditeur voit le
    // catalogue mais reçoit "Demander au propriétaire", jamais un contrôle
    // Stripe ». L'écran cache le bouton ; c'est cette garde qui le tient
    // quand le formulaire est posté à la main.
    return expect(acheter("hunts")).rejects.toThrow("FORBIDDEN").then(() => {
      expect(state.created).toHaveLength(0);
    });
  });
});

/* ════════════════════════════════════════════════════════════
 * LES ADD-ONS MENSUELS (P0.5) — VENDABLES, MAIS PAS DEUX FOIS
 *
 * Ce bloc remplace le refus que `venteEnLigneOuverte` tenait ici (ADR-079). La
 * vente est ouverte ; ce qui la borne n'est plus le modèle de facturation mais
 * l'état du commerçant, et l'ordre des assertions suit le coût de l'erreur :
 *
 *   1. QU'UN MENSUEL DÉJÀ ACTIF NE PARTE PAS CHEZ STRIPE. Le laisser partir,
 *      c'est un second prélèvement mensuel pour un droit déjà détenu — et, à la
 *      résiliation de l'un des deux abonnements, plus rien ne dirait quel
 *      octroi refermer.
 *   2. QUE LE REFUS DISE CE QU'IL A. « Achat impossible » ferait réessayer ;
 *      « vous l'avez déjà » ferme la question.
 *   3. QUE L'ABONNEMENT PORTE SON ORGANISATION. Sans elle, la révocation à la
 *      résiliation dépend d'une seule colonne mutable.
 * ════════════════════════════════════════════════════════════ */
describe("un add-on mensuel se vend en abonnement, une fois", () => {
  it("crée une session d'ABONNEMENT quand rien n'est encore actif", () => {
    vi.stubEnv("STRIPE_PRICE_ID_PASS_LOYALTY", "price_pass_loyalty");

    return acheter("loyalty").then((issue) => {
      expect(issue).toEqual({ versUrl: "https://checkout.stripe.test/addon" });

      const session = seuleSession();
      // Se tromper de mode ne casse rien à l'écran : ça installe un paiement
      // unique là où le catalogue vend un abonnement, ou l'inverse.
      expect(session.mode).toBe("subscription");
      expect(session.line_items).toEqual([
        { price: "price_pass_loyalty", quantity: 1 },
      ]);
    });
  });

  it("l'abonnement créé porte son organisation, pour la révocation à venir", () => {
    vi.stubEnv("STRIPE_PRICE_ID_PASS_LOYALTY", "price_pass_loyalty");

    return acheter("loyalty").then(() => {
      const session = seuleSession();
      const subscriptionData = session.subscription_data as {
        metadata: Record<string, string>;
      };

      // L'abonnement d'un pass ne portait NI marqueur NI organisation : le
      // webhook n'avait que `organizations.stripe_customer_id`, colonne
      // mutable, pour retrouver à qui refermer le module.
      expect(subscriptionData.metadata.organization_id).toBe(ORG_ID);
      expect(subscriptionData.metadata.entitlement).toBe("loyalty");
    });
  });

  it("un achat unique n'emporte AUCUN subscription_data", () => {
    // Stripe refuse `subscription_data` sur une session `mode: payment` : la
    // faute se paierait à la vente, pas au test.
    vi.stubEnv("STRIPE_PRICE_ID_PASS_HUNTS", "price_pass_hunts");

    return acheter("hunts").then(() => {
      expect(seuleSession().subscription_data).toBeUndefined();
    });
  });

  it("un mensuel DÉJÀ ACTIF ne crée aucune session, et le refus dit ce qu'il a", () => {
    vi.stubEnv("STRIPE_PRICE_ID_PASS_LOYALTY", "price_pass_loyalty");
    state.recurrent = "actif";

    return acheter("loyalty").then((issue) => {
      expect(state.created).toHaveLength(0);
      expect(issue).toHaveProperty("refus");
      const refus = (issue as { refus: string }).refus;
      // Le message dit une bonne nouvelle — c'est en service — et le geste qui
      // reste ouvert. Pas un échec, qui ferait réessayer.
      expect(refus).toContain("Passeport des habitués");
      expect(refus).toMatch(/déjà actif/i);
      expect(refus).toContain("Gérer mon abonnement");
      expect(refus).not.toMatch(/erreur|échec|impossible/i);
    });
  });

  it("la question est posée sur LE module et SUR l'organisation du demandeur", () => {
    vi.stubEnv("STRIPE_PRICE_ID_PASS_REFERRAL", "price_pass_referral");

    return acheter("referral").then(() => {
      // Interroger un autre module rendrait le refus inopérant ; interroger une
      // autre organisation le rendrait faux dans les deux sens.
      expect(state.interroge).toEqual([
        { organizationId: ORG_ID, module: "referral" },
      ]);
    });
  });

  it("un ACHAT UNIQUE n'est jamais soumis à cette question", () => {
    // Le rachat d'un pass consommé est le geste normal — c'est même le motif
    // pour lequel il n'y a aucune garde « déjà acheté » sur les six autres.
    // Étendre le refus les rendrait invendables après le premier achat.
    vi.stubEnv("STRIPE_PRICE_ID_PASS_HUNTS", "price_pass_hunts");
    state.recurrent = "actif";

    return acheter("hunts").then((issue) => {
      expect(issue).toEqual({ versUrl: "https://checkout.stripe.test/addon" });
      expect(state.interroge).toEqual([]);
    });
  });
});
