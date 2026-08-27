import { describe, expect, it } from "vitest";
import {
  definitionEtape,
  etapeVoisine,
  hrefEtape,
  numeroEtape,
  parseEtape,
  type EtapeAtelier,
} from "@/components/dashboard/atelier-etapes";
import {
  ETAPES_ROUE,
  hrefEtapeRoue,
} from "@/components/dashboard/atelier-roue-etapes";

const ETAPES: readonly EtapeAtelier[] = [
  { cle: "un", titre: "Un" },
  { cle: "deux", titre: "Deux", resume: "Le milieu." },
  { cle: "trois", titre: "Trois" },
];

describe("parseEtape", () => {
  it("rend la clé demandée quand elle existe", () => {
    expect(parseEtape(ETAPES, "deux")).toBe("deux");
    expect(parseEtape(ETAPES, "deux", "nulle")).toBe("deux");
  });

  it("retombe sur la première étape pour une valeur inconnue, quelle que soit la politique", () => {
    expect(parseEtape(ETAPES, "n-importe-quoi")).toBe("un");
    expect(parseEtape(ETAPES, "n-importe-quoi", "nulle")).toBe("un");
  });

  it("absence : politique « premiere » rend la première étape", () => {
    expect(parseEtape(ETAPES, undefined)).toBe("un");
    expect(parseEtape(ETAPES, "", "premiere")).toBe("un");
  });

  it("absence : politique « nulle » rend null — c'est la vue suivi", () => {
    expect(parseEtape(ETAPES, undefined, "nulle")).toBeNull();
    expect(parseEtape(ETAPES, "", "nulle")).toBeNull();
  });

  it("liste vide : null dans les deux politiques", () => {
    expect(parseEtape([], undefined)).toBeNull();
    expect(parseEtape([], "deux")).toBeNull();
  });
});

describe("hrefEtape", () => {
  it("pose `?etape=` sur la base, sans porteur", () => {
    expect(hrefEtape("/dashboard/quiz/42", "reglages")).toBe(
      "/dashboard/quiz/42?etape=reglages",
    );
  });

  it("reconduit les porteurs APRÈS l'étape", () => {
    expect(hrefEtape("/base", "a", { wheel: "w1", page: "3" })).toBe(
      "/base?etape=a&wheel=w1&page=3",
    );
  });

  it("omet les porteurs vides, nuls ou absents", () => {
    expect(hrefEtape("/base", "a", { wheel: null })).toBe("/base?etape=a");
    expect(hrefEtape("/base", "a", { wheel: undefined })).toBe("/base?etape=a");
    expect(hrefEtape("/base", "a", { wheel: "" })).toBe("/base?etape=a");
  });

  it("encode les valeurs de porteur", () => {
    expect(hrefEtape("/base", "a", { q: "un deux&trois" })).toBe(
      "/base?etape=a&q=un%20deux%26trois",
    );
  });
});

describe("etapeVoisine", () => {
  it("rend la voisine dans le sens demandé", () => {
    expect(etapeVoisine(ETAPES, "deux", -1)?.cle).toBe("un");
    expect(etapeVoisine(ETAPES, "deux", 1)?.cle).toBe("trois");
  });

  it("rend null aux deux bouts", () => {
    expect(etapeVoisine(ETAPES, "un", -1)).toBeNull();
    expect(etapeVoisine(ETAPES, "trois", 1)).toBeNull();
  });

  it("rend null pour une clé inconnue", () => {
    expect(etapeVoisine(ETAPES, "inconnue", 1)).toBeNull();
    expect(etapeVoisine(ETAPES, "inconnue", -1)).toBeNull();
  });
});

describe("numeroEtape / definitionEtape", () => {
  it("numérote à partir de 1, 0 si inconnue", () => {
    expect(numeroEtape(ETAPES, "un")).toBe(1);
    expect(numeroEtape(ETAPES, "trois")).toBe(3);
    expect(numeroEtape(ETAPES, "inconnue")).toBe(0);
  });

  it("rend la définition, ou la première si la clé est inconnue", () => {
    expect(definitionEtape(ETAPES, "deux")?.titre).toBe("Deux");
    expect(definitionEtape(ETAPES, "inconnue")?.cle).toBe("un");
    expect(definitionEtape([], "un")).toBeNull();
  });
});

/**
 * L'atelier du jeu est la PREMIÈRE déclinaison des primitives : ces assertions
 * pinnent ses URLs telles qu'elles étaient avant la généralisation
 * (`e2e/wheel-wizard.spec.ts` les visite, et six `revalidatePath` en dépendent).
 */
describe("déclinaison roue", () => {
  it("garde ses étapes dans l'ordre, la vérification en dernier", () => {
    // L'ORDRE EST LE PARCOURS, et « verification » ferme la marche : elle juge
    // ce que les précédentes ont posé. Deux étapes se sont intercalées avant
    // elle — « Le parcours joueur » et « Le partage » — parce qu'elles se
    // règlent AVANT d'ouvrir aux joueurs, pas après avoir vérifié.
    expect(ETAPES_ROUE.map((e) => e.cle)).toEqual([
      "jeu",
      "lots",
      "habillage",
      "creneau",
      "parcours",
      "partage",
      "verification",
    ]);
  });

  it("donne une URL à chaque étape, sans en oublier une", () => {
    // Une étape déclarée mais sans URL serait injoignable depuis le fil ;
    // `wheel-wizard.spec.ts` compte les pastilles, ce test compte les portes.
    for (const etape of ETAPES_ROUE) {
      expect(hrefEtapeRoue("c1", etape.cle)).toBe(
        `/dashboard/campaigns/c1/wheel?etape=${etape.cle}`,
      );
    }
  });

  it("construit les mêmes URLs qu'avant, avec et sans `?wheel=`", () => {
    expect(hrefEtapeRoue("c1", "lots")).toBe(
      "/dashboard/campaigns/c1/wheel?etape=lots",
    );
    expect(hrefEtapeRoue("c1", "lots", "w1")).toBe(
      "/dashboard/campaigns/c1/wheel?etape=lots&wheel=w1",
    );
    expect(hrefEtapeRoue("c1", "verification", null)).toBe(
      "/dashboard/campaigns/c1/wheel?etape=verification",
    );
  });

  it("l'absence de `?etape=` rend « jeu » — la roue n'a pas de vue suivi", () => {
    expect(parseEtape(ETAPES_ROUE, undefined, "premiere")).toBe("jeu");
    expect(parseEtape(ETAPES_ROUE, "n-importe-quoi", "premiere")).toBe("jeu");
  });
});
