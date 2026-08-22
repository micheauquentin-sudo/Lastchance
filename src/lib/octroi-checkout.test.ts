import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addonAchetableEnLigne,
  modeCheckout,
  paliersDisponibles,
  partitionnerPrix,
  passDepuisPrix,
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

/**
 * Les mensuels VENDABLES PAR CE TUNNEL. Depuis le 2026-08-22, « mensuel » et
 * « achetable seul » ont cessé d'être la même chose : Vitrine et Réserver sont
 * des récurrents qui ne se vendent qu'en LIGNE d'un abonnement en cours, donc
 * jamais par `resolveAddonCheckout`. Les confondre ferait passer ce tunnel
 * pour un chemin d'achat de la Vitrine — c'est-à-dire un second abonnement.
 */
const MENSUELS = ADDON_OFFERS.filter(
  (o) => o.billing.model === "recurring-monthly" && o.soldStandalone,
);
/** Les récurrents qui ne passent PAS par ici, et dont le refus est prouvé plus bas. */
const MENSUELS_DE_LIGNE = ADDON_OFFERS.filter(
  (o) => o.billing.model === "recurring-monthly" && !o.soldStandalone,
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
    // Et les deux récurrents qui ne sont PAS de ce tunnel.
    expect(MENSUELS_DE_LIGNE.map((o) => o.entitlement).sort()).toEqual([
      "reserver",
      "vitrine",
    ]);
  });

  /**
   * LE REFUS QUI FERME LE SECOND PRÉLÈVEMENT.
   *
   * Sans lui, `modeCheckout` rendrait `"subscription"` pour la Vitrine — c'est
   * un récurrent — et Stripe ouvrirait un abonnement SÉPARÉ du sien. Le
   * commerçant paierait deux fois, à deux dates, et résilierait deux fois.
   */
  it("refuse les options de ligne, même avec un prix de pass configuré", () => {
    for (const offre of MENSUELS_DE_LIGNE) {
      // Le prix est posé exprès : le refus doit tenir au MODÈLE DE VENTE, pas
      // à une variable manquante. Une garde qui ne tient qu'à l'absence de
      // configuration cède le jour où quelqu'un configure.
      vi.stubEnv(envPass(offre.entitlement), "price_pose_par_erreur");

      const v = resolveAddonCheckout(offre.entitlement);
      expect(v.ok, offre.entitlement).toBe(false);
      if (!v.ok) expect(v.erreur).toContain("offre en cours");
    }
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

/* ════════════════════════════════════════════════════════════
 * LES DEUX MENSUELS SONT VENDABLES (P0.5)
 *
 * Ce bloc a été RETOURNÉ, pas supprimé, et il faut savoir ce qu'il prouvait.
 * Il tenait la garde `venteEnLigneOuverte` d'ADR-079 : tant que le webhook ne
 * savait pas isoler un abonnement de pass, poser le prix en variable
 * d'environnement ne devait PAS suffire à ouvrir la vente — sinon la garde se
 * serait levée toute seule le jour où quelqu'un configurait Stripe.
 *
 * Le webhook sait, désormais : il reconnaît ces prix (`partitionnerPrix`), ne
 * les envoie jamais à `apply_stripe_subscription_event_v2`, et révoque l'octroi
 * récurrent à la résiliation. La garde est levée, et ces tests prouvent
 * l'inverse de ce qu'ils prouvaient — que la vente est ouverte.
 *
 * ⚠️ CE QU'ILS NE PROUVENT PAS, ET OÙ ÇA SE PROUVE. Le refus de RACHAT d'un
 * mensuel déjà actif n'est pas ici : il demande l'organisation, donc la base.
 * Il vit dans `createAddonCheckoutSession` et se prouve dans
 * `src/actions/billing-addon.test.ts`. Chercher ici « pourquoi rien n'empêche
 * d'acheter deux fois » mènerait à croire le refus absent.
 * ════════════════════════════════════════════════════════════ */
describe("les add-ons mensuels sont vendables depuis P0.5", () => {
  it("un mensuel dont le prix est configuré part en ABONNEMENT", () => {
    for (const offre of MENSUELS) {
      vi.stubEnv(envPass(offre.entitlement), "price_configure");

      const v = resolveAddonCheckout(offre.entitlement);
      expect(v.ok, offre.entitlement).toBe(true);
      if (v.ok) {
        expect(v.priceId).toBe("price_configure");
        // Le mode est ce qui distingue un prélèvement mensuel d'un paiement
        // unique : s'y tromper installerait l'un pour l'autre.
        expect(v.mode, offre.entitlement).toBe("subscription");
        expect(v.capacity).toBeNull();
      }
      expect(addonAchetableEnLigne(offre.entitlement), offre.entitlement).toBe(
        true,
      );
    }
  });

  it("mais un mensuel SANS prix reste invendable, comme n'importe quel add-on", () => {
    // La levée de la garde ne doit pas se confondre avec « toujours vendable ».
    // La règle du dépôt est inchangée : un add-on sans variable n'est pas
    // proposé, et le message dit au commerçant quoi faire.
    vi.stubEnv(envPass("loyalty"), "");

    const refus = resolveAddonCheckout("loyalty");
    expect(refus.ok).toBe(false);
    if (!refus.ok) {
      expect(refus.erreur).toContain("Passeport des habitués");
      expect(refus.erreur).not.toMatch(/price|env|STRIPE/i);
    }
    expect(addonAchetableEnLigne("loyalty")).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════
 * RECONNAÎTRE UN PRIX DE PASS
 *
 * C'est la pièce dont dépend TOUT le reste du lot : un prix de pass non
 * reconnu retombe dans la synchronisation d'abonnement, où il produit soit un
 * 500 en boucle, soit — pire — un déclassement silencieux du plan payé sur
 * `PLANS[0]`. Les assertions ci-dessous sont donc écrites par coût de l'erreur.
 * ════════════════════════════════════════════════════════════ */
describe("passDepuisPrix — le renversement priceId → add-on", () => {
  it("reconnaît le prix d'un add-on simple et rend son add-on", () => {
    vi.stubEnv(envPass("loyalty"), "price_pass_loyalty");

    expect(passDepuisPrix("price_pass_loyalty")).toMatchObject({
      entitlement: "loyalty",
      capacity: null,
    });
  });

  it("reconnaît le PALIER exact d'un pass à jauge, pas seulement l'add-on", () => {
    // Rendre l'add-on sans son palier ferait perdre la jauge payée : le webhook
    // octroierait une capacité indéterminée sur un produit qui n'existe qu'en
    // paliers.
    vi.stubEnv(envPass("events", 10), "price_events_10");
    vi.stubEnv(envPass("events", 50), "price_events_50");

    expect(passDepuisPrix("price_events_10")).toMatchObject({ capacity: 10 });
    expect(passDepuisPrix("price_events_50")).toMatchObject({ capacity: 50 });
  });

  it("un prix d'ABONNEMENT n'est PAS un prix de pass", () => {
    // L'étanchéité, vue depuis la réception. Si `ADDON_PRICE_ENV` et
    // `STRIPE_PRICE_ID_PASS_*` se confondaient ici, une ligne d'add-on d'un
    // abonnement d'offre serait détournée du chemin de synchronisation — et le
    // plan de l'organisation cesserait d'être mis à jour.
    vi.stubEnv("STRIPE_PRICE_ID_ADDON_LOYALTY", "price_addon_loyalty");

    expect(passDepuisPrix("price_addon_loyalty")).toBeNull();
  });

  it("un prix inconnu, vide ou d'offre rend null", () => {
    expect(passDepuisPrix("price_offre_live")).toBeNull();
    expect(passDepuisPrix("")).toBeNull();
  });

  it("une variable posée à la chaîne VIDE ne reconnaît pas un prix vide", () => {
    // Le piège : `optionalEnv` rend `""` pour une variable posée vide, et
    // `"" === ""` ferait reconnaître comme pass n'importe quelle photographie
    // Stripe portant un identifiant vide.
    vi.stubEnv(envPass("loyalty"), "");

    expect(passDepuisPrix("")).toBeNull();
  });
});

describe("partitionnerPrix — chaque moitié suit son chemin", () => {
  it("aucun pass : tout est « autre », et le chemin historique est intact", () => {
    const { passes, autres } = partitionnerPrix(["price_live", "price_addon"]);

    expect(passes).toHaveLength(0);
    expect(autres).toEqual(["price_live", "price_addon"]);
  });

  it("que des pass : rien ne part vers la synchronisation d'abonnement", () => {
    vi.stubEnv(envPass("loyalty"), "price_pass_loyalty");
    vi.stubEnv(envPass("referral"), "price_pass_referral");

    const { passes, autres } = partitionnerPrix([
      "price_pass_loyalty",
      "price_pass_referral",
    ]);

    expect(passes.map((p) => p.entitlement)).toEqual(["loyalty", "referral"]);
    expect(autres).toEqual([]);
  });

  it("MIXTE : les deux moitiés sont rendues séparément, aucune n'est perdue", () => {
    // Inatteignable depuis l'application (un seul `line_items` par session,
    // aucun `update` d'abonnement côté code) : ce cas ne peut naître que d'un
    // geste manuel dans le tableau de bord Stripe. Ce que ce test verrouille
    // est qu'il ne soit ni deviné ni écrasé — un `some()` aurait fait sauter la
    // synchro de l'offre, un `every()` aurait envoyé le prix de pass en
    // résolution, donc 500 en boucle.
    vi.stubEnv(envPass("loyalty"), "price_pass_loyalty");

    const { passes, autres } = partitionnerPrix([
      "price_offre_live",
      "price_pass_loyalty",
    ]);

    expect(passes.map((p) => p.entitlement)).toEqual(["loyalty"]);
    expect(autres).toEqual(["price_offre_live"]);
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
    // QUATRE récurrents au catalogue depuis le 2026-08-22, et `modeCheckout`
    // dit vrai sur les quatre : ce sont bien des abonnements. Ce qui les
    // sépare n'est pas le mode mais le CHEMIN — deux passent par ce tunnel,
    // deux par `toggleSubscriptionOption`.
    expect(abonnements.sort()).toEqual([
      "loyalty",
      "referral",
      "reserver",
      "vitrine",
    ]);
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
    // Éprouvé sur « Chasse au trésor » pour une raison devenue HISTORIQUE :
    // `venteEnLigneOuverte` fermait les mensuels, donc le test posé sur
    // `loyalty` aurait mesuré la garde et non l'étanchéité (ADR-079). La garde
    // est levée depuis P0.5 ; le choix reste, parce qu'un achat unique éprouve
    // les deux familles de variables sans rien devoir à un modèle de
    // facturation.
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
    // Même raison historique qu'au test précédent, et même conclusion : le
    // choix de « Chasse au trésor » reste, la garde qui l'imposait n'existe
    // plus.
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
