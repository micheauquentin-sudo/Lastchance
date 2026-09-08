// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { PlayLimit } from "@/types/database";
import {
  estLotForteValeur,
  lotMalGarde,
  niveauGardeLot,
  PHRASES_GARDE_LOT,
  SEUIL_LOT_FORTE_VALEUR_CENTS,
  type LotValeurUnitaire,
} from "@/lib/lot-forte-valeur";

/**
 * TROIS PROPRIÉTÉS PORTENT CE FICHIER.
 *
 * Une valeur ABSENTE (`value_cents === null`) n'avertit jamais — la confondre
 * avec 0 ou avec « à vérifier » peindrait en rouge toutes les roues où la
 * colonne n'a jamais été remplie. Le seuil est INCLUSIF, le cas le plus probable
 * étant un lot calibré pile dessus. Et `unlimited` ne rend PAS la même phrase
 * que `once` / `daily` / `weekly` : les fondre dirait à un commerçant sans
 * limite que sa limite est contournable.
 */

const LIMITES_REELLES: PlayLimit[] = ["once", "daily", "weekly"];
const TOUTES_LIMITES: PlayLimit[] = [...LIMITES_REELLES, "unlimited"];

function lot(partiel: Partial<LotValeurUnitaire> = {}): LotValeurUnitaire {
  return { value_cents: null, is_losing: false, ...partiel };
}

describe("SEUIL_LOT_FORTE_VALEUR_CENTS", () => {
  it("vaut 2000 centimes — 20 €, valeur de départ ajustable", () => {
    expect(SEUIL_LOT_FORTE_VALEUR_CENTS).toBe(2000);
  });
});

describe("estLotForteValeur", () => {
  it("ignore un lot dont la valeur n'est pas renseignée", () => {
    // `null` = on ne sait rien, pas « ne vaut rien ».
    expect(estLotForteValeur(lot({ value_cents: null }))).toBe(false);
  });

  it("ignore un lot sous le seuil", () => {
    expect(estLotForteValeur(lot({ value_cents: 0 }))).toBe(false);
    expect(estLotForteValeur(lot({ value_cents: 1999 }))).toBe(false);
  });

  it("retient un lot AU seuil exact — la borne est inclusive", () => {
    expect(estLotForteValeur(lot({ value_cents: 2000 }))).toBe(true);
  });

  it("retient un lot au-dessus du seuil", () => {
    expect(estLotForteValeur(lot({ value_cents: 5000 }))).toBe(true);
  });

  it("ignore un lot PERDANT, même valorisé au-dessus du seuil", () => {
    // Rejouer cent fois pour retomber sur « perdu » ne coûte rien au commerçant.
    expect(estLotForteValeur(lot({ value_cents: 9900, is_losing: true }))).toBe(false);
  });
});

describe("niveauGardeLot", () => {
  it("ne dit rien d'un lot sans valeur, quelle que soit la limite", () => {
    for (const limite of TOUTES_LIMITES) {
      expect(niveauGardeLot(lot({ value_cents: null }), limite)).toBe("aucun");
      expect(lotMalGarde(lot({ value_cents: null }), limite)).toBe(false);
    }
  });

  it("ne dit rien d'un lot sous le seuil, quelle que soit la limite", () => {
    for (const limite of TOUTES_LIMITES) {
      expect(niveauGardeLot(lot({ value_cents: 1999 }), limite)).toBe("aucun");
      expect(lotMalGarde(lot({ value_cents: 1999 }), limite)).toBe(false);
    }
  });

  it("ne dit rien d'un lot perdant, quelle que soit la limite", () => {
    for (const limite of TOUTES_LIMITES) {
      expect(niveauGardeLot(lot({ value_cents: 9900, is_losing: true }), limite)).toBe(
        "aucun",
      );
    }
  });

  it("signale une limite RÉELLE mais contournable sous once / daily / weekly", () => {
    for (const limite of LIMITES_REELLES) {
      expect(niveauGardeLot(lot({ value_cents: 2000 }), limite)).toBe(
        "limite_contournable",
      );
      expect(lotMalGarde(lot({ value_cents: 5000 }), limite)).toBe(true);
    }
  });

  it("distingue `unlimited` — aucune garde à contourner, pas une garde faible", () => {
    expect(niveauGardeLot(lot({ value_cents: 2000 }), "unlimited")).toBe("sans_limite");
    expect(lotMalGarde(lot({ value_cents: 2000 }), "unlimited")).toBe(true);
    // La séparation est le point du module : deux niveaux distincts, jamais fondus.
    expect(niveauGardeLot(lot({ value_cents: 2000 }), "unlimited")).not.toBe(
      niveauGardeLot(lot({ value_cents: 2000 }), "once"),
    );
  });
});

describe("PHRASES_GARDE_LOT", () => {
  it("laisse `aucun` vide et rédige les deux autres différemment", () => {
    expect(PHRASES_GARDE_LOT.aucun).toBe("");
    expect(PHRASES_GARDE_LOT.limite_contournable).not.toBe("");
    expect(PHRASES_GARDE_LOT.sans_limite).not.toBe("");
    expect(PHRASES_GARDE_LOT.sans_limite).not.toBe(PHRASES_GARDE_LOT.limite_contournable);
  });

  it("oriente vers le Ticket d'Or, seul ancrage qu'un cookie effacé ne rend pas", () => {
    for (const niveau of ["limite_contournable", "sans_limite"] as const) {
      expect(PHRASES_GARDE_LOT[niveau]).toContain("Ticket d'Or");
    }
  });
});
