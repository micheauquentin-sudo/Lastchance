// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  compterFiches,
  donneesStructureesVitrine,
  etatIndexation,
  VITRINE_FICHES_MIN_INDEXATION,
} from "@/lib/vitrine-indexation";
import type { VitrineCarteView } from "@/lib/vitrine";

/**
 * VIT-12 — ce qui autorise une page de commerce à entrer dans un moteur.
 *
 * LES TROIS CONDITIONS SONT CUMULATIVES, et l'accord du commerçant en est une.
 * Une page indexée sans son accord publierait des prix et des horaires qu'il
 * n'a ouverts que pour le QR posé sur sa table.
 */

function cartes(nbFiches: number): VitrineCarteView[] {
  return [
    {
      id: "c1",
      nom: "Carte",
      ordre: 0,
      active: true,
      categories: [
        {
          id: "r1",
          nom: "Rubrique",
          ordre: 0,
          action: null,
          fiches: Array.from({ length: nbFiches }, (_, i) => ({
            id: `f${i}`,
            nom: `Plat ${i}`,
            description: null,
            prix_affiche: null,
            photo_path: null,
            photo_alt: null,
            facettes: [],
            action: null,
            badges: [],
            allergenes: [],
            disponible: true,
            ordre: i,
          })),
        },
      ],
    },
  ];
}

const COMPLETE = {
  published: true,
  indexable: true,
  accroche: "La meilleure pizza du quartier",
  cartes: cartes(VITRINE_FICHES_MIN_INDEXATION),
};

describe("etatIndexation", () => {
  it("indexe une vitrine publiée, accrochée, étoffée et autorisée", () => {
    expect(etatIndexation(COMPLETE)).toEqual({ indexee: true, manque: null });
  });

  it("refuse une vitrine non publiée, et le dit en premier", () => {
    // L'ORDRE DES REFUS EST CELUI DES GESTES : on ne demande pas d'étoffer une
    // carte avant de dire qu'elle n'est pas publiée.
    const etat = etatIndexation({ ...COMPLETE, published: false, accroche: null });
    expect(etat.indexee).toBe(false);
    expect(etat.manque).toContain("publiée");
  });

  it("refuse sans accroche — c'est ce que Google affiche sous le nom", () => {
    const etat = etatIndexation({ ...COMPLETE, accroche: "   " });
    expect(etat.indexee).toBe(false);
    expect(etat.manque).toContain("accroche");
  });

  it("refuse une carte trop maigre, et dit combien il en manque", () => {
    const etat = etatIndexation({ ...COMPLETE, cartes: cartes(1) });
    expect(etat.indexee).toBe(false);
    expect(etat.manque).toContain(String(VITRINE_FICHES_MIN_INDEXATION));
    expect(etat.manque).toContain("vous en avez 1");
  });

  it("refuse SANS L'ACCORD, même quand tout le reste est prêt", () => {
    const etat = etatIndexation({ ...COMPLETE, indexable: false });
    expect(etat.indexee).toBe(false);
    expect(etat.manque).toContain("votre accord");
  });
});

describe("compterFiches", () => {
  it("somme toutes les rubriques de toutes les cartes", () => {
    expect(compterFiches(cartes(4))).toBe(4);
    expect(compterFiches([])).toBe(0);
  });
});

describe("donneesStructureesVitrine", () => {
  it("décrit un lieu et sa carte, et rien de plus", () => {
    const doc = donneesStructureesVitrine({
      nom: "Chez Marcel",
      accroche: "Cuisine du marché",
      url: "https://exemple.fr/v/chez-marcel",
      image: "https://exemple.fr/photo.webp",
    });

    expect(doc["@type"]).toBe("LocalBusiness");
    expect(doc.name).toBe("Chez Marcel");
    expect(doc.hasMenu).toBe("https://exemple.fr/v/chez-marcel");

    // CE QUI NE DOIT JAMAIS Y ÊTRE : ces quatre-là changent plus vite que
    // l'index, et un prix périmé dans un résultat de recherche est une
    // promesse que le comptoir devra refuser.
    for (const interdit of [
      "aggregateRating",
      "review",
      "priceRange",
      "offers",
      "openingHours",
      "openingHoursSpecification",
    ]) {
      expect(doc).not.toHaveProperty(interdit);
    }
  });

  it("omet ce qui n'existe pas plutôt que de rendre une clé vide", () => {
    const doc = donneesStructureesVitrine({
      nom: "Chez Marcel",
      accroche: "  ",
      url: "https://exemple.fr/v/chez-marcel",
      image: null,
    });
    expect(doc).not.toHaveProperty("description");
    expect(doc).not.toHaveProperty("image");
  });
});
