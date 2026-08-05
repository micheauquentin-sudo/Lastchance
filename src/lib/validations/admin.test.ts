import { describe, expect, it } from "vitest";
import {
  merchantCompAccessSchema,
  merchantModuleGrantSchema,
} from "./admin";

const BASE = {
  organizationId: "20000000-0000-4000-8000-000000000001",
  enabled: "true",
  note: "Partenaire",
  includePronostics: "false",
};

describe("merchantCompAccessSchema", () => {
  it("conserve une date calendrier sans conversion UTC implicite", () => {
    const parsed = merchantCompAccessSchema.parse({ ...BASE, until: "2026-07-18" });
    expect(parsed.until).toBe("2026-07-18");
  });

  it("rejette une date impossible", () => {
    expect(
      merchantCompAccessSchema.safeParse({ ...BASE, until: "2026-02-30" }).success,
    ).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════
 * merchantModuleGrantSchema — UN CHAMP NON RENDU N'EST PAS UN CHAMP VIDE
 *
 * `FormData.get` rend `null` — pas `undefined` — pour un champ absent du
 * formulaire soumis, et le panneau d'octrois ne rend « durée » que pour un pass
 * immédiat, « délai » que pour un pass différé. Tant que le schéma reposait sur
 * un `.default()` seul, AUCUN octroi `recurring` n'était créable depuis le
 * back-office : la validation échouait sur « expected string, received null »
 * avant toute règle métier.
 *
 * Ces cas parsent le SCHÉMA DIRECTEMENT, sans passer par l'action. C'est le
 * point : l'action ne normalise plus rien, et si quelqu'un retire la tolérance
 * du schéma en croyant qu'un `??` la couvre ailleurs, ces tests rougissent.
 * ════════════════════════════════════════════════════════════ */

const OCTROI = {
  organizationId: "20000000-0000-4000-8000-000000000001",
  module: "loyalty",
  kind: "recurring",
  demarrage: "maintenant",
};

describe("merchantModuleGrantSchema — tolérance au champ absent", () => {
  it("accepte les quatre champs facultatifs à null, comme les rend FormData", () => {
    const r = merchantModuleGrantSchema.safeParse({
      ...OCTROI,
      dureeJours: null,
      delaiActivationJours: null,
      jauge: null,
      reference: null,
    });

    expect(r.success, r.success ? "" : r.error.issues[0]?.message).toBe(true);
    if (r.success) {
      expect(r.data.dureeJours).toBeNull();
      expect(r.data.delaiActivationJours).toBeNull();
      expect(r.data.jauge).toBeNull();
      // `reference` retombe sur la chaîne vide et non sur `null` : elle part en
      // base dans une colonne texte, et un `null` y dirait autre chose.
      expect(r.data.reference).toBe("");
    }
  });

  it("le cas qui était cassé : un récurrent, sans durée ni délai à l'écran", () => {
    // Reproduction exacte du parcours back-office. Avant correction, ce parse
    // échouait — donc aucun add-on mensuel ne pouvait être accordé à la main.
    expect(
      merchantModuleGrantSchema.safeParse({
        ...OCTROI,
        dureeJours: null,
        delaiActivationJours: null,
        jauge: null,
        reference: "",
      }).success,
    ).toBe(true);
  });

  it("un champ omis (undefined) reste accepté, comme avant", () => {
    // La tolérance au `null` ne doit pas retirer celle à l'absence : les deux
    // arrivent selon que l'appelant lit `FormData` ou construit un objet.
    expect(merchantModuleGrantSchema.safeParse(OCTROI).success).toBe(true);
  });

  it("une valeur INVALIDE reste refusée — la tolérance ne vaut que pour l'absence", () => {
    // Sans ce cas, on aurait pu satisfaire les précédents avec un `.catch()`
    // qui avale tout, y compris une vraie faute de saisie.
    for (const mauvais of ["0", "-3", "3.5", "abc"]) {
      expect(
        merchantModuleGrantSchema.safeParse({ ...OCTROI, dureeJours: mauvais })
          .success,
        `dureeJours = ${mauvais}`,
      ).toBe(false);
    }
  });
});
