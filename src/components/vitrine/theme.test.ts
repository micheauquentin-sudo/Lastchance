import { describe, expect, it } from "vitest";

import { VITRINE_BLOCS, VITRINE_BLOCS_DEFAUT } from "@/lib/vitrine";
import { resoudreThemeVitrine } from "./theme";

// ────────────────────────────────────────────────────────────
// LE REPLI DE L'ORDRE DES BLOCS — la publication des portes est OPT-IN
//
// `theme.ordre_blocs` est facultatif : `mapThemeVitrine` ne pose la clé que si
// la base la portait. Le repli décide donc de ce que rend une vitrine dont le
// commerçant n'a JAMAIS touché l'ordre des blocs — c'est-à-dire la très grande
// majorité d'entre elles au lendemain d'un déploiement.
//
// Il portait le vocabulaire COMPLET, et la conséquence était un geste que
// personne n'avait fait : VIT-3 ayant ajouté `reserver` et `experiences` au
// vocabulaire, toutes ces vitrines se seraient mises à annoncer publiquement
// leurs activités, leurs files et leurs quiz — sous des libellés écrits pour un
// écran de comptoir, sur une page indexable, sans que le commerçant l'apprenne
// autrement qu'en la regardant.
//
// Ces tests épinglent les deux moitiés de la décision : rien de publié sans
// geste, et TOUT publiable dès que le geste est fait.
// ────────────────────────────────────────────────────────────

describe("resoudreThemeVitrine — le repli n'ouvre AUCUNE porte", () => {
  it("sans ordre du tout : les cinq blocs de VIT-1a, et pas un de plus", () => {
    expect(resoudreThemeVitrine({}).blocs).toEqual([...VITRINE_BLOCS_DEFAUT]);
    expect(resoudreThemeVitrine(null).blocs).not.toContain("reserver");
    expect(resoudreThemeVitrine(undefined).blocs).not.toContain("experiences");
  });

  it("une liste VIDE retombe sur le même défaut, sans portes", () => {
    // `[]` rendrait une page sans rien : c'est le second cas qui n'est pas un
    // choix du commerçant, et il ne doit pas ouvrir davantage que l'absence.
    const blocs = resoudreThemeVitrine({ ordre_blocs: [] }).blocs;
    expect(blocs).toEqual([...VITRINE_BLOCS_DEFAUT]);
    expect(blocs).toHaveLength(5);
  });

  it("un ordre EXPLICITE à sept rend les portes — le geste est le consentement", () => {
    // La contrepartie : le commerçant qui a remonté `reserver` et `experiences`
    // depuis « Masqués » obtient exactement ce qu'il a demandé, dans son ordre.
    const blocs = resoudreThemeVitrine({ ordre_blocs: [...VITRINE_BLOCS] }).blocs;
    expect(blocs).toEqual([...VITRINE_BLOCS]);
    expect(blocs).toContain("reserver");
    expect(blocs).toContain("experiences");
  });

  it("un ordre PARTIEL qui ne contient qu'une porte ne rend que celle-là", () => {
    // Omettre reste le réglage : ce qui a changé est le point de départ, pas la
    // règle. Un commerçant peut annoncer ses files sans annoncer ses quiz.
    const blocs = resoudreThemeVitrine({
      ordre_blocs: ["reserver", "cartes"],
    }).blocs;
    expect(blocs).toEqual(["reserver", "cartes"]);
    expect(blocs).not.toContain("experiences");
  });
});
