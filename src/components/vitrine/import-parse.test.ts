import { describe, expect, it } from "vitest";

import {
  analyserCarte,
  compterImport,
  construireImport,
  rubriquesHomonymes,
  RUBRIQUE_PAR_DEFAUT,
  type LigneImport,
} from "@/components/vitrine/import-parse";

/**
 * LE PARSEUR D'IMPORT, SUR DE VRAIES CARTES.
 *
 * Ces cas ne sont pas des chaînes minimales choisies pour passer : ce sont les
 * formes qu'un commerçant colle réellement — un bistrot dont les rubriques sont
 * en capitales, une pizzeria qui les termine par deux-points, des prix écrits
 * « 14 € », « 9,50 » et « à partir de 11 € » dans la même carte, et une ligne
 * de présentation qui n'est ni l'un ni l'autre.
 *
 * Ce que ces tests NE prétendent PAS prouver : que le classement est juste à
 * tous les coups. Il ne l'est pas, c'est une heuristique, et c'est précisément
 * pour cela que l'aperçu de `import-carte.tsx` est obligatoire. Ils prouvent que
 * RIEN NE SE PERD — chaque ligne non vide ressort classée, éditable — et que la
 * charge envoyée au serveur ne porte que les clés autorisées.
 */

/** Raccourci de lecture : « type|nom|description|prix » par ligne. */
function resume(lignes: LigneImport[]): string[] {
  return lignes.map((l) => `${l.type}|${l.nom}|${l.description}|${l.prix}`);
}

describe("analyserCarte — cartes réelles", () => {
  it("un bistrot : rubriques en capitales, prix en euros et en décimales", () => {
    const lignes = analyserCarte(
      [
        "ENTRÉES",
        "Tartare de bœuf — câpres et cornichons — 14 €",
        "Velouté de potiron — 8,50",
        "",
        "PLATS",
        "Risotto aux champignons — 18 €",
      ].join("\n"),
    );

    expect(resume(lignes)).toEqual([
      "rubrique|ENTRÉES||",
      "fiche|Tartare de bœuf|câpres et cornichons|14 €",
      "fiche|Velouté de potiron||8,50",
      "rubrique|PLATS||",
      "fiche|Risotto aux champignons||18 €",
    ]);
  });

  it("une pizzeria : rubrique en « : », prix collé et « à partir de »", () => {
    const lignes = analyserCarte(
      [
        "Nos pizzas :",
        "Margherita — tomate, mozzarella — 9,50",
        "Reine — à partir de 11 €",
        "Calzone 12,00",
      ].join("\n"),
    );

    expect(resume(lignes)).toEqual([
      "rubrique|Nos pizzas||",
      "fiche|Margherita|tomate, mozzarella|9,50",
      "fiche|Reine||à partir de 11 €",
      "fiche|Calzone||12,00",
    ]);
  });

  it("les trois écritures de prix d'une même carte", () => {
    const lignes = analyserCarte(
      [
        "Café gourmand — 12 €",
        "Assiette de fromages — 12,50",
        "Formule déjeuner — à partir de 8 €",
      ].join("\n"),
    );

    expect(lignes.map((l) => l.prix)).toEqual([
      "12 €",
      "12,50",
      "à partir de 8 €",
    ]);
    expect(lignes.every((l) => l.type === "fiche")).toBe(true);
  });

  it("un entier nu n'est PAS un prix — la ligne reste, sans prix", () => {
    // « Menu 3 plats » ou « Pizza 4 fromages » : accepter l'entier nu ferait
    // imprimer « 3 » comme prix sur la carte publique.
    const lignes = analyserCarte("Pizza 4 fromages\nMenu enfant 3 plats");
    expect(lignes.every((l) => l.prix === "")).toBe(true);
  });

  it("une phrase de présentation devient une fiche sans prix, jamais un silence", () => {
    const lignes = analyserCarte(
      [
        "Desserts",
        "Assiette de charcuterie corse avec pain de campagne et cornichons maison",
      ].join("\n"),
    );

    expect(lignes[0].type).toBe("rubrique");
    expect(lignes[0].nom).toBe("Desserts");
    // Longue et sans prix : classée en fiche plutôt que jetée. Le commerçant
    // la passera à « Ignorer » d'un clic s'il ne la veut pas — l'inverse, une
    // ligne disparue, ne se rattrape pas.
    expect(lignes[1].type).toBe("fiche");
    expect(lignes[1].nom).toContain("charcuterie corse");
  });

  it("les lignes vides disparaissent, tout le reste survit", () => {
    const lignes = analyserCarte("\n\n  \nBoissons\n\nCafé — 2 €\n   \n");
    expect(lignes).toHaveLength(2);
    expect(lignes.map((l) => l.type)).toEqual(["rubrique", "fiche"]);
  });
});

describe("construireImport — la charge envoyée", () => {
  it("ne porte que les clés autorisées par l'action serveur", () => {
    const lignes = analyserCarte(
      [
        "Entrées",
        "Houmous — pois chiches — 7 €",
        "Assiette de crudités de saison du marché",
      ].join("\n"),
    );
    const carte = construireImport("Carte du midi", lignes);

    expect(Object.keys(carte)).toEqual(["nom", "rubriques"]);
    expect(Object.keys(carte.rubriques[0])).toEqual(["nom", "fiches"]);
    expect(Object.keys(carte.rubriques[0].fiches[0])).toEqual([
      "nom",
      "description",
      "prix_affiche",
    ]);
    // Une fiche sans description ni prix ne porte AUCUNE clé vide : l'action
    // refuse les clés inconnues, et une chaîne vide n'est pas une absence.
    expect(Object.keys(carte.rubriques[0].fiches[1])).toEqual(["nom"]);
    expect(carte.rubriques[0].fiches[1].nom).toBe(
      "Assiette de crudités de saison du marché",
    );
  });

  it("une fiche avant toute rubrique ouvre une rubrique nommée", () => {
    const carte = construireImport(
      "Ardoise",
      analyserCarte("Soupe du jour — 6 €"),
    );
    expect(carte.rubriques).toHaveLength(1);
    expect(carte.rubriques[0].nom).toBe(RUBRIQUE_PAR_DEFAUT);
    expect(carte.rubriques[0].fiches).toHaveLength(1);
  });

  it("« Ignorer » retire la ligne de la charge, pas de l'écran", () => {
    const lignes = analyserCarte(
      ["Entrées", "Houmous — 7 €", "Suivez-nous sur Instagram"].join("\n"),
    );
    const revues = lignes.map((l, i) =>
      i === 2 ? { ...l, type: "ignorer" as const } : l,
    );

    // La ligne reste dans l'aperçu…
    expect(revues).toHaveLength(3);
    // …mais ne part pas.
    const carte = construireImport("Carte", revues);
    expect(carte.rubriques[0].fiches.map((f) => f.nom)).toEqual(["Houmous"]);
  });

  it("un reclassement change les comptes affichés", () => {
    const lignes = analyserCarte(
      ["ENTRÉES", "Houmous — 7 €", "Tapenade — 6 €"].join("\n"),
    );
    expect(compterImport("Carte", lignes)).toEqual({
      rubriques: 1,
      fiches: 2,
    });

    // Le commerçant décide que « Tapenade » est en fait une rubrique.
    const revues = lignes.map((l, i) =>
      i === 2 ? { ...l, type: "rubrique" as const } : l,
    );
    expect(compterImport("Carte", revues)).toEqual({
      rubriques: 2,
      fiches: 1,
    });
  });
});

describe("rubriquesHomonymes", () => {
  it("désigne le refus que le schéma serveur opposerait", () => {
    const lignes = analyserCarte(
      ["ENTRÉES", "Houmous — 7 €", "ENTRÉES", "Tapenade — 6 €"].join("\n"),
    );
    expect(rubriquesHomonymes("Carte", lignes)).toEqual(["ENTRÉES"]);
  });

  it("se tait quand les rubriques sont distinctes", () => {
    const lignes = analyserCarte(
      ["ENTRÉES", "Houmous — 7 €", "PLATS", "Risotto — 18 €"].join("\n"),
    );
    expect(rubriquesHomonymes("Carte", lignes)).toEqual([]);
  });
});
