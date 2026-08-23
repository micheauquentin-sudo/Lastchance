// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  mapMesuresVitrine,
  mesureRecevable,
  mesuresRecevables,
  mesuresVides,
  MESURE_REF_MAX,
} from "@/lib/vitrine-mesures";

/**
 * VIT-9 — ce qu'une route PUBLIQUE SANS JETON accepte d'écrire en base.
 *
 * C'est une frontière, pas une commodité. Sans le vocabulaire fermé et la
 * forme d'UUID, n'importe qui pourrait insérer des références arbitraires dans
 * une table indexée — une façon bon marché de la faire grossir, et de rendre
 * illisible le tableau du commerçant.
 */

const UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("mesureRecevable", () => {
  it("accepte les trois types de contenu avec un UUID", () => {
    for (const type of ["carte", "rubrique", "fiche"]) {
      expect(mesureRecevable({ type, ref: UUID })).toBe(true);
    }
  });

  it("refuse un contenu dont la référence n'est pas un UUID", () => {
    expect(mesureRecevable({ type: "fiche", ref: "libre" })).toBe(false);
    expect(mesureRecevable({ type: "fiche", ref: "a".repeat(MESURE_REF_MAX) })).toBe(
      false,
    );
  });

  it("accepte une action du vocabulaire fermé, et elle seule", () => {
    expect(mesureRecevable({ type: "action", ref: "reserver" })).toBe(true);
    // « experiences » est le nom d'une ANCRE, pas d'une porte : c'est
    // exactement le décalage que ce filtre a attrapé à l'écriture du lot.
    expect(mesureRecevable({ type: "action", ref: "experiences" })).toBe(false);
    expect(mesureRecevable({ type: "action", ref: UUID })).toBe(false);
  });

  it("refuse un type inconnu, y compris l'ouverture de page", () => {
    // `ouverture` est comptée par `module_page_opens` : l'accepter ici aurait
    // donné deux chiffres pour le même fait.
    expect(mesureRecevable({ type: "ouverture", ref: UUID })).toBe(false);
    expect(mesureRecevable({ type: "fiche" })).toBe(false);
    expect(mesureRecevable(null)).toBe(false);
    expect(mesureRecevable("fiche")).toBe(false);
  });
});

describe("mesuresRecevables", () => {
  it("dédoublonne — un aller-retour sur la carte n'est pas deux vues", () => {
    const retenues = mesuresRecevables([
      { type: "fiche", ref: UUID },
      { type: "fiche", ref: UUID },
      { type: "rubrique", ref: UUID },
    ]);
    expect(retenues).toEqual([
      { type: "fiche", ref: UUID },
      { type: "rubrique", ref: UUID },
    ]);
  });

  it("écarte les entrées irrecevables sans jeter les bonnes", () => {
    expect(
      mesuresRecevables([
        { type: "fiche", ref: "pas-un-uuid" },
        { type: "action", ref: "quiz" },
        42,
      ]),
    ).toEqual([{ type: "action", ref: "quiz" }]);
  });

  it("rend une liste vide pour une charge qui n'est pas un tableau", () => {
    expect(mesuresRecevables(null)).toEqual([]);
    expect(mesuresRecevables({ type: "fiche", ref: UUID })).toEqual([]);
  });
});

describe("mapMesuresVitrine", () => {
  it("lit un document conforme", () => {
    const vue = mapMesuresVitrine({
      jours: 30,
      langues: { fr: 80, en: 20 },
      contenus: [{ type: "fiche", ref: UUID, vues: 12 }],
      actions: [{ ref: "reserver", clics: 3 }],
    });
    expect(vue.jours).toBe(30);
    expect(vue.langues).toEqual({ fr: 80, en: 20 });
    expect(vue.contenus).toEqual([{ type: "fiche", ref: UUID, vues: 12 }]);
    expect(vue.actions).toEqual([{ ref: "reserver", clics: 3 }]);
  });

  it("rend une fenêtre vide plutôt qu'une erreur sur un document illisible", () => {
    // Le commerçant a le droit de voir cet écran ; il n'a rien à y lire.
    expect(mapMesuresVitrine(null)).toEqual(mesuresVides());
    expect(mapMesuresVitrine("…")).toEqual(mesuresVides());
  });

  it("écarte les lignes mal formées sans perdre les autres", () => {
    const vue = mapMesuresVitrine({
      jours: 7,
      langues: {},
      contenus: [
        { type: "inconnu", ref: UUID, vues: 5 },
        { type: "carte", ref: UUID, vues: 9 },
        null,
      ],
      actions: [{ clics: 2 }, { ref: "duo", clics: 1 }],
    });
    expect(vue.contenus).toEqual([{ type: "carte", ref: UUID, vues: 9 }]);
    expect(vue.actions).toEqual([{ ref: "duo", clics: 1 }]);
    expect(vue.langues).toEqual({ fr: 0, en: 0 });
  });

  it("refuse un compteur négatif ou non numérique", () => {
    const vue = mapMesuresVitrine({
      jours: 7,
      langues: { fr: -5, en: "beaucoup" },
      contenus: [{ type: "fiche", ref: UUID, vues: -3 }],
      actions: [],
    });
    expect(vue.langues).toEqual({ fr: 0, en: 0 });
    expect(vue.contenus[0].vues).toBe(0);
  });
});
