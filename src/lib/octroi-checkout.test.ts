import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addonAchetableEnLigne,
  modeCheckout,
  paliersDisponibles,
  resolveAddonCheckout,
} from "./octroi-checkout";
import { ADDON_OFFERS, findAddonOffer } from "./plans";

/**
 * CE QUE CE FICHIER DOIT PROUVER, dans l'ordre d'importance :
 *
 *   1. QU'ON NE VEND JAMAIS AUTRE CHOSE QUE CE QUI A ÉTÉ CLIQUÉ. Un repli sur
 *      un add-on ou un palier voisin ne produit pas d'erreur : il produit un
 *      débit correct pour un produit faux, que personne ne signale.
 *   2. QUE LE MODE DE CHECKOUT SUIT LE MODÈLE DE FACTURATION. Se tromper ici
 *      ne casse rien à l'écran — ça installe un prélèvement mensuel sur ce qui
 *      devait être payé une fois.
 *   3. QUE LES DEUX CHEMINS D'ADD-ON RESTENT ÉTANCHES. Le même module se vend
 *      comme ligne d'abonnement (`STRIPE_PRICE_ID_ADDON_*`) ou comme achat
 *      autonome (`STRIPE_PRICE_ID_PASS_*`). Les confondre vendrait l'un pour
 *      l'autre.
 */

// Sans ce nettoyage, la variable posée par un test fuit dans le suivant et
// rend « achetable » un add-on que le cas d'après veut voir refusé.
afterEach(() => {
  vi.unstubAllEnvs();
});

/** Nom de variable d'achat autonome, recopié depuis le module testé. */
function envPass(entitlement: string, jauge?: number): string {
  const base = `STRIPE_PRICE_ID_PASS_${entitlement.toUpperCase()}`;
  return jauge === undefined ? base : `${base}_${jauge}`;
}

const MENSUELS = ADDON_OFFERS.filter(
  (o) => o.billing.model === "recurring-monthly",
);
const ACHATS_UNIQUES = ADDON_OFFERS.filter(
  (o) => o.billing.model !== "recurring-monthly",
);

/** Première jauge vendue d'un pass, `null` pour les autres modèles. */
function premiereJauge(entitlement: string): number | null {
  const offre = findAddonOffer(entitlement as never);
  if (!offre || offre.billing.model !== "capacity-pass") return null;
  return offre.billing.steps[0].maxPlayers;
}

describe("resolveAddonCheckout — les huit add-ons du catalogue", () => {
  it("chaque add-on à achat unique sait produire un checkout dès que son prix existe", () => {
    // Garde DÉRIVÉE du catalogue, comme celle de `octroi-termes.test.ts` : un
    // neuvième add-on ajouté demain fait rougir ce test tant qu'il n'est pas
    // rattaché à une variable de prix. Sans elle, il apparaîtrait au catalogue
    // sans jamais devenir achetable, et le défaut ne se verrait qu'en vente.
    for (const offre of ACHATS_UNIQUES) {
      const jauge = premiereJauge(offre.entitlement);
      vi.stubEnv(envPass(offre.entitlement, jauge ?? undefined), "price_test");

      const v = resolveAddonCheckout(offre.entitlement, jauge);
      expect(v.ok, `${offre.entitlement} : ${v.ok ? "" : v.erreur}`).toBe(true);
      if (v.ok) expect(v.priceId).toBe("price_test");
    }
  });

  it("les six achats uniques du cahier sont exactement ceux qui sont vendables", () => {
    // Verrouille le compte. Si un modèle de facturation change au catalogue,
    // ce test dit lequel avant que la vente ne le découvre.
    expect(ACHATS_UNIQUES).toHaveLength(6);
    expect(MENSUELS.map((o) => o.entitlement).sort()).toEqual([
      "loyalty",
      "referral",
    ]);
  });

  it("un add-on absent du catalogue est refusé, jamais replié sur un voisin", () => {
    // Un repli ferait payer autre chose que ce qui a été cliqué.
    expect(resolveAddonCheckout("module-inexistant").ok).toBe(false);
    expect(resolveAddonCheckout(null).ok).toBe(false);
    expect(resolveAddonCheckout("").ok).toBe(false);
  });

  it("le socle `core` n'est pas un add-on achetable", () => {
    // `Entitlement` couvre `core`, qui n'a pas d'offre. Un appelant qui tente
    // de l'acheter comme un add-on doit être refusé, pas servi.
    expect(resolveAddonCheckout("core").ok).toBe(false);
  });

  it("un add-on sans prix configuré est refusé, et le message dit quoi faire", () => {
    vi.stubEnv(envPass("hunts"), "");

    const refus = resolveAddonCheckout("hunts");
    expect(refus.ok).toBe(false);
    if (!refus.ok) {
      expect(refus.erreur).toContain("Chasse au trésor");
      // Le commerçant n'a que faire de notre configuration : « price ID
      // absent » ne lui apprend rien et l'inquiète sur un service qu'il paie.
      expect(refus.erreur).not.toMatch(/price|env|STRIPE/i);
    }
  });
});

describe("les add-ons mensuels ne sont pas vendables tant que le webhook ne sait pas les recevoir", () => {
  it("un mensuel est refusé MÊME si son prix est configuré", () => {
    // CE TEST EST UNE GARDE, pas une description d'un manque. Le vendre
    // aujourd'hui créerait chez Stripe un abonnement séparé dont le prix est
    // inconnu de `resolveStripeEntitlements` : le webhook répondrait 500 en
    // boucle. Poser le prix en variable d'environnement ne doit donc PAS
    // suffire à ouvrir la vente — sinon la garde se lèverait toute seule le
    // jour où quelqu'un configure Stripe.
    for (const offre of MENSUELS) {
      vi.stubEnv(envPass(offre.entitlement), "price_configure");

      const v = resolveAddonCheckout(offre.entitlement);
      expect(v.ok, offre.entitlement).toBe(false);
      expect(addonAchetableEnLigne(offre.entitlement), offre.entitlement).toBe(
        false,
      );
    }
  });

  it("le refus dit au commerçant quoi faire, sans exposer la raison technique", () => {
    vi.stubEnv(envPass("loyalty"), "price_configure");

    const refus = resolveAddonCheckout("loyalty");
    expect(refus.ok).toBe(false);
    if (!refus.ok) {
      expect(refus.erreur).toContain("Passeport des habitués");
      expect(refus.erreur).not.toMatch(/webhook|500|abonnement Stripe/i);
    }
  });
});

describe("modeCheckout — un récurrent est un abonnement, tout le reste un paiement", () => {
  it("seuls les add-ons mensuels partent en abonnement", () => {
    for (const offre of ADDON_OFFERS) {
      const attendu =
        offre.billing.model === "recurring-monthly" ? "subscription" : "payment";
      expect(modeCheckout(offre), offre.entitlement).toBe(attendu);
    }
  });

  it("les deux mensuels du cahier sont bien les seuls abonnements", () => {
    // Verrouille le §2 du cahier : « Passeport des habitués » et
    // « Bouche-à-oreille » sont mensuels, les six autres sont des achats
    // uniques. Basculer un achat unique en `subscription` prélèverait tous
    // les mois un client qui a payé une fois.
    const abonnements = ADDON_OFFERS.filter(
      (o) => modeCheckout(o) === "subscription",
    ).map((o) => o.entitlement);
    expect(abonnements.sort()).toEqual(["loyalty", "referral"]);
  });
});

describe("pass à jauge — la jauge est choisie avant paiement et payée à son prix", () => {
  it("une jauge absente est refusée plutôt que devinée", () => {
    vi.stubEnv(envPass("events", 10), "price_events_10");

    const refus = resolveAddonCheckout("events", null);
    expect(refus.ok).toBe(false);
  });

  it("une jauge hors des paliers vendus est refusée", () => {
    vi.stubEnv(envPass("events", 10), "price_events_10");

    // 500 n'est pas un palier. Sans ce refus, un appelant obtiendrait une
    // jauge arbitraire au prix du palier trouvé — ou au prix d'aucun.
    expect(resolveAddonCheckout("events", 500).ok).toBe(false);
    expect(resolveAddonCheckout("events", 0).ok).toBe(false);
    expect(resolveAddonCheckout("events", -30).ok).toBe(false);
  });

  it("chaque palier porte SON prix, jamais celui d'un autre", () => {
    // LE défaut coûteux du modèle à jauge : vendre la jauge 50 au prix du
    // palier 10. L'erreur va dans le sens du client, donc personne ne la
    // signale — exactement le motif du rejeu d'octroi.
    vi.stubEnv(envPass("events", 10), "price_events_10");
    vi.stubEnv(envPass("events", 30), "price_events_30");
    vi.stubEnv(envPass("events", 50), "price_events_50");

    for (const jauge of [10, 30, 50]) {
      const v = resolveAddonCheckout("events", jauge);
      expect(v.ok, `jauge ${jauge}`).toBe(true);
      if (v.ok) {
        expect(v.priceId).toBe(`price_events_${jauge}`);
        expect(v.capacity).toBe(jauge);
        expect(v.mode).toBe("payment");
      }
    }
  });

  it("un palier sans prix est refusé même si ses voisins en ont un", () => {
    vi.stubEnv(envPass("events", 10), "price_events_10");
    vi.stubEnv(envPass("events", 30), "");
    vi.stubEnv(envPass("events", 50), "price_events_50");

    expect(resolveAddonCheckout("events", 30).ok).toBe(false);
    expect(resolveAddonCheckout("events", 50).ok).toBe(true);
  });

  it("hors pass à jauge, la capacité reste nulle et la jauge est ignorée", () => {
    vi.stubEnv(envPass("quiz"), "price_quiz");

    // Poster une jauge sur un add-on qui n'en a pas ne doit ni la retenir ni
    // faire échouer l'achat : elle n'a simplement aucun sens ici.
    const v = resolveAddonCheckout("quiz", 30);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.capacity).toBeNull();
  });
});

describe("ce que l'écran a le droit de proposer", () => {
  it("un add-on sans prix n'est pas proposé", () => {
    vi.stubEnv(envPass("hunts"), "");
    expect(addonAchetableEnLigne("hunts")).toBe(false);
  });

  it("un pass à jauge est achetable dès qu'UN palier est vendu", () => {
    vi.stubEnv(envPass("events", 10), "");
    vi.stubEnv(envPass("events", 30), "price_events_30");
    vi.stubEnv(envPass("events", 50), "");

    expect(addonAchetableEnLigne("events")).toBe(true);
    // …mais l'écran ne montre QUE le palier réellement vendu, sinon il
    // afficherait un bouton qui n'aboutit pas.
    expect(paliersDisponibles("events")).toEqual([{ maxPlayers: 30, price: 19 }]);
  });

  it("aucun palier vendu : ni achetable, ni palier à afficher", () => {
    vi.stubEnv(envPass("events", 10), "");
    vi.stubEnv(envPass("events", 30), "");
    vi.stubEnv(envPass("events", 50), "");

    expect(addonAchetableEnLigne("events")).toBe(false);
    expect(paliersDisponibles("events")).toEqual([]);
  });

  it("les paliers sortent dans l'ordre du catalogue, du moins cher au plus cher", () => {
    vi.stubEnv(envPass("events", 10), "price_events_10");
    vi.stubEnv(envPass("events", 30), "price_events_30");
    vi.stubEnv(envPass("events", 50), "price_events_50");

    expect(paliersDisponibles("events").map((p) => p.maxPlayers)).toEqual([
      10, 30, 50,
    ]);
  });

  it("un add-on qui n'est pas un pass n'a pas de palier", () => {
    expect(paliersDisponibles("quiz")).toEqual([]);
  });
});

describe("les deux chemins d'add-on restent étanches", () => {
  it("le prix d'ABONNEMENT n'ouvre pas l'achat autonome", () => {
    // `STRIPE_PRICE_ID_ADDON_HUNTS` vend « Chasse au trésor » comme LIGNE d'un
    // abonnement ; l'achat autonome lit une autre variable. Si les deux se
    // confondaient, un commerçant sans abonnement paierait une ligne qui ne
    // s'attache à rien — et l'écran proposerait un bouton bâti sur la
    // configuration de l'autre produit.
    //
    // Éprouvé sur un ACHAT UNIQUE délibérément : sur un mensuel, le refus
    // viendrait de `venteEnLigneOuverte` et ce test passerait sans rien
    // prouver de l'étanchéité qu'il prétend vérifier.
    vi.stubEnv("STRIPE_PRICE_ID_ADDON_HUNTS", "price_addon_hunts");
    vi.stubEnv(envPass("hunts"), "");

    expect(addonAchetableEnLigne("hunts")).toBe(false);
    expect(resolveAddonCheckout("hunts").ok).toBe(false);
  });

  it("le prix d'achat autonome n'a pas besoin d'un prix d'abonnement", () => {
    // La réciproque, et c'est la décision du §2 : « tout add-on peut être
    // acheté seul ». Exiger les deux variables rendrait l'add-on autonome
    // dépendant d'une configuration d'abonnement qu'il n'utilise pas.
    //
    // Éprouvé sur « Chasse au trésor » et non sur « Passeport des habitués » :
    // ce dernier est mensuel, donc fermé en amont par `venteEnLigneOuverte`,
    // et le test ne prouverait plus l'étanchéité mais la garde.
    vi.stubEnv("STRIPE_PRICE_ID_ADDON_HUNTS", "");
    vi.stubEnv(envPass("hunts"), "price_pass_hunts");

    const v = resolveAddonCheckout("hunts");
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.priceId).toBe("price_pass_hunts");
      expect(v.mode).toBe("payment");
    }
  });
});
