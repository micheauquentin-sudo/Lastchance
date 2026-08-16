import { describe, expect, it } from "vitest";

import {
  MODULE_GRANT_PURCHASE,
  readModuleGrantPurchase,
} from "./octroi-achat";
import { ADDON_OFFERS } from "./plans";

const ORG = "aaaa0000-0000-4000-8000-000000000001";
const CREATED = 1_781_000_000; // secondes Stripe

function session(over: Record<string, unknown> = {}) {
  return {
    client_reference_id: ORG,
    payment_status: "paid",
    created: CREATED,
    metadata: {
      purchase: MODULE_GRANT_PURCHASE,
      organization_id: ORG,
      entitlement: "hunts",
    },
    ...over,
  };
}

describe("readModuleGrantPurchase — le cas nominal", () => {
  it("lit l'add-on, l'organisation et la date d'ACHAT", () => {
    const r = readModuleGrantPurchase(session());
    expect(r.kind).toBe("grant");
    if (r.kind !== "grant") return;
    expect(r.organizationId).toBe(ORG);
    expect(r.entitlement).toBe("hunts");
    // LA DATE VIENT DE LA SESSION, pas de l'horloge du webhook. Un webhook
    // rejoué le lendemain d'une panne offrirait sinon un jour de fenêtre en
    // plus, et un encaissement différé de cinq jours décalerait d'autant.
    expect(r.acheteA.toISOString()).toBe(new Date(CREATED * 1000).toISOString());
  });

  it("une session sans notre marqueur n'est pas notre affaire", () => {
    expect(readModuleGrantPurchase(session({ metadata: {} })).kind).toBe("none");
  });
});

describe("readModuleGrantPurchase — ce qui n'est pas encaissé n'octroie rien", () => {
  it("`unpaid` n'octroie pas, mais PORTE l'organisation", () => {
    // Sans l'organisation, un virement refusé cinq jours plus tard ne
    // laisserait aucune trace rattachable à qui que ce soit.
    const r = readModuleGrantPurchase(session({ payment_status: "unpaid" }));
    expect(r.kind).toBe("unpaid");
    if (r.kind === "unpaid") expect(r.organizationId).toBe(ORG);
  });

  it("tout statut autre que `paid` refuse l'octroi", () => {
    // Octroyer sur autre chose que `paid`, c'est ouvrir un module jamais payé
    // — et la pause étant dérivée d'une échéance, rien ne le refermerait.
    for (const statut of ["unpaid", "no_payment_required", "", null]) {
      expect(readModuleGrantPurchase(session({ payment_status: statut })).kind)
        .not.toBe("grant");
    }
  });
});

describe("readModuleGrantPurchase — les deux porteurs d'identité", () => {
  it("refuse quand ils se contredisent", () => {
    // Classe fermée d'avance : sur un Payment Link, `client_reference_id`
    // s'ajoute à l'URL par le payeur. Choisir l'un des deux serait choisir au
    // hasard à qui l'on offre un module.
    const r = readModuleGrantPurchase(
      session({ client_reference_id: "bbbb0000-0000-4000-8000-000000000002" }),
    );
    expect(r.kind).toBe("invalid");
    if (r.kind === "invalid") expect(r.reason).toContain("se contredisent");
  });

  it("refuse quand l'un des deux manque", () => {
    expect(readModuleGrantPurchase(session({ client_reference_id: null })).kind)
      .toBe("invalid");
    expect(
      readModuleGrantPurchase(
        session({ metadata: { purchase: MODULE_GRANT_PURCHASE, entitlement: "hunts" } }),
      ).kind,
    ).toBe("invalid");
  });
});

describe("readModuleGrantPurchase — l'add-on est RELU au catalogue", () => {
  it("refuse un add-on absent du catalogue", () => {
    // La metadata a transité par le navigateur : ce qu'on en accepte est une
    // CLÉ d'un vocabulaire fermé, jamais une durée ni un prix.
    const r = readModuleGrantPurchase(
      session({
        metadata: {
          purchase: MODULE_GRANT_PURCHASE,
          organization_id: ORG,
          entitlement: "core",
        },
      }),
    );
    expect(r.kind).toBe("invalid");
    if (r.kind === "invalid") expect(r.reason).toContain("catalogue");
  });

  it("accepte les huit add-ons réellement vendus", () => {
    // Garde DÉRIVÉE du catalogue : un neuvième add-on y entre et ce test le
    // couvre sans qu'on y touche.
    for (const offre of ADDON_OFFERS) {
      const capacity =
        offre.billing.model === "capacity-pass"
          ? String(offre.billing.steps[0].maxPlayers)
          : undefined;
      const r = readModuleGrantPurchase(
        session({
          metadata: {
            purchase: MODULE_GRANT_PURCHASE,
            organization_id: ORG,
            entitlement: offre.entitlement,
            ...(capacity ? { capacity } : {}),
          },
        }),
      );
      expect(r.kind, `${offre.entitlement}`).toBe("grant");
    }
  });
});

describe("readModuleGrantPurchase — la jauge", () => {
  const passAJauge = ADDON_OFFERS.find((o) => o.billing.model === "capacity-pass");

  it("est transportée pour un pass à jauge", () => {
    if (!passAJauge || passAJauge.billing.model !== "capacity-pass") throw new Error("catalogue changé");
    const palier = passAJauge.billing.steps[0].maxPlayers;
    const r = readModuleGrantPurchase(
      session({
        metadata: {
          purchase: MODULE_GRANT_PURCHASE,
          organization_id: ORG,
          entitlement: passAJauge.entitlement,
          capacity: String(palier),
        },
      }),
    );
    expect(r.kind).toBe("grant");
    if (r.kind === "grant") expect(r.capacity).toBe(palier);
  });

  it("refuse une jauge illisible sur un pass à jauge", () => {
    if (!passAJauge) throw new Error("catalogue changé");
    for (const brut of ["", "zéro", "-3", "0"]) {
      const r = readModuleGrantPurchase(
        session({
          metadata: {
            purchase: MODULE_GRANT_PURCHASE,
            organization_id: ORG,
            entitlement: passAJauge.entitlement,
            capacity: brut,
          },
        }),
      );
      expect(r.kind, `jauge « ${brut} »`).toBe("invalid");
    }
  });

  it("reste nulle là où elle n'a pas de sens", () => {
    // Une jauge posée sur un add-on qui n'en vend pas serait un chiffre gelé en
    // base que rien ne lit — et que quelqu'un finirait par lire.
    const r = readModuleGrantPurchase(session());
    expect(r.kind).toBe("grant");
    if (r.kind === "grant") expect(r.capacity).toBeNull();
  });
});

describe("readModuleGrantPurchase — la date de création", () => {
  it("refuse une session sans date exploitable", () => {
    // `created` est en SECONDES chez Stripe. L'oublier donnerait 1970, donc
    // une fenêtre d'activation expirée depuis cinquante ans : le commerçant
    // paierait un pass déjà périmé.
    for (const cree of [undefined, null, 0, -1, Number.NaN]) {
      expect(readModuleGrantPurchase(session({ created: cree })).kind).toBe("invalid");
    }
  });
});

/* ════════════════════════════════════════════════════════════
 * SD-5 — LA RESSOURCE BORNANTE D'UNE SAISON DE PRONOSTICS
 *
 * « Une seule compétition identifiée, un seul contest_id » (catalogue). La
 * colonne `resource_id` existait depuis le lot 2 et n'était écrite par
 * personne : le webhook posait `p_resource_id: null` en dur, donc un pass à
 * 39 € vendu POUR une compétition ouvrait le module entier — toutes les
 * compétitions, pendant les douze mois du plafond dur.
 * ════════════════════════════════════════════════════════════ */
describe("readModuleGrantPurchase — la ressource bornante", () => {
  const CONTEST = "bbbb0000-0000-4000-8000-000000000009";

  function saison(resource?: string | null) {
    return session({
      metadata: {
        purchase: MODULE_GRANT_PURCHASE,
        organization_id: ORG,
        entitlement: "pronostics",
        ...(resource === undefined ? {} : { resource_id: resource }),
      },
    });
  }

  it("transporte le contest_id d'une Saison de pronostics", () => {
    const r = readModuleGrantPurchase(saison(CONTEST));
    expect(r.kind).toBe("grant");
    if (r.kind === "grant") expect(r.resourceId).toBe(CONTEST);
  });

  it("normalise la casse : un uuid est le même en majuscules", () => {
    const r = readModuleGrantPurchase(saison(CONTEST.toUpperCase()));
    if (r.kind === "grant") expect(r.resourceId).toBe(CONTEST);
  });

  it("REFUSE un identifiant malformé plutôt que de le passer à Postgres", () => {
    // Un cast raté dans `grant_module_from_payment` lèverait, donc 500 en
    // boucle sur un événement que rien ne réparera. `invalid` acquitte et crie.
    for (const brut of ["pas-un-uuid", "42", "'; drop table --"]) {
      expect(readModuleGrantPurchase(saison(brut)).kind, brut).toBe("invalid");
    }
  });

  it("SANS ressource : octroie quand même, module entier, comme avant", () => {
    // Ne peut venir que d'une session antérieure à ce lot ou d'un lien posé à
    // la main — l'action l'exige désormais. Rendre `invalid` encaisserait sans
    // rien ouvrir ; le webhook, lui, signale. La fenêtre se referme seule.
    for (const absente of [undefined, "", "   "]) {
      const r = readModuleGrantPurchase(saison(absente));
      expect(r.kind, String(absente)).toBe("grant");
      if (r.kind === "grant") expect(r.resourceId).toBeNull();
    }
  });

  it("les sept autres add-ons ne portent JAMAIS de ressource", () => {
    // Une ressource glissée sur un pass qui ouvre son module entier serait un
    // identifiant gelé en base que rien ne lit — et qui bornerait le droit le
    // jour où quelqu'un le lirait.
    const r = readModuleGrantPurchase(
      session({
        metadata: {
          purchase: MODULE_GRANT_PURCHASE,
          organization_id: ORG,
          entitlement: "hunts",
          resource_id: CONTEST,
        },
      }),
    );
    expect(r.kind).toBe("grant");
    if (r.kind === "grant") expect(r.resourceId).toBeNull();
  });
});
