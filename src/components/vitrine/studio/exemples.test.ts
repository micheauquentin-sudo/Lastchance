import { describe, expect, it } from "vitest";
import { VITRINE_SECTEURS, type SecteurVitrine } from "@/lib/vitrine";
import { PREFIXE_EXEMPLE, cartesExemple } from "./exemples";

/**
 * CE QUE CES GARDES PROTÈGENT.
 *
 * Ces cartes ne passent par AUCUNE relecture serveur : elles entrent directement
 * dans `CatalogueVitrine`, qui fait confiance à la forme. Une fiche orpheline,
 * un ordre en double ou un identifiant manquant ne rougirait donc nulle part —
 * il casserait l'aperçu chez le commerçant, au moment précis où il juge son
 * style. C'est le seul filet.
 */

/** Toutes les fiches, tous secteurs confondus, avec leur secteur d'origine. */
function toutesLesFiches(secteur: SecteurVitrine) {
  return cartesExemple(secteur).flatMap((c) =>
    c.categories.flatMap((r) => r.fiches),
  );
}

describe("cartesExemple", () => {
  it("rend un jeu non vide pour les sept secteurs", () => {
    for (const secteur of VITRINE_SECTEURS) {
      const cartes = cartesExemple(secteur);
      expect(cartes.length, secteur).toBeGreaterThanOrEqual(2);
      for (const carte of cartes) {
        expect(carte.categories.length, `${secteur}/${carte.nom}`).toBeGreaterThanOrEqual(2);
        for (const rub of carte.categories) {
          // Une rubrique vide affiche un titre suivi de rien : c'est
          // exactement ce que l'exemple est censé éviter de montrer.
          expect(rub.fiches.length, `${secteur}/${rub.nom}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("n'a aucun identifiant en double, tous secteurs confondus", () => {
    const vus = new Set<string>();
    for (const secteur of VITRINE_SECTEURS) {
      for (const carte of cartesExemple(secteur)) {
        expect(vus.has(carte.id), carte.id).toBe(false);
        vus.add(carte.id);
        for (const rub of carte.categories) {
          expect(vus.has(rub.id), rub.id).toBe(false);
          vus.add(rub.id);
          for (const f of rub.fiches) {
            expect(vus.has(f.id), f.id).toBe(false);
            vus.add(f.id);
          }
        }
      }
    }
  });

  it("pose des ordres contigus depuis zéro à chaque rang", () => {
    for (const secteur of VITRINE_SECTEURS) {
      const cartes = cartesExemple(secteur);
      expect(cartes.map((c) => c.ordre), secteur).toEqual(cartes.map((_, i) => i));
      for (const carte of cartes) {
        expect(
          carte.categories.map((r) => r.ordre),
          `${secteur}/${carte.nom}`,
        ).toEqual(carte.categories.map((_, i) => i));
        for (const rub of carte.categories) {
          expect(
            rub.fiches.map((f) => f.ordre),
            `${secteur}/${rub.nom}`,
          ).toEqual(rub.fiches.map((_, i) => i));
        }
      }
    }
  });

  it("remplit toute fiche : nom, description, prix, et jamais de photo", () => {
    for (const secteur of VITRINE_SECTEURS) {
      for (const f of toutesLesFiches(secteur)) {
        expect(f.nom.trim(), f.id).not.toBe("");
        expect(f.description?.trim(), f.id).toBeTruthy();
        expect(f.prix_affiche?.trim(), f.id).toBeTruthy();
        // Aucune image d'exemple n'existe : un chemin ici donnerait une
        // vignette cassée dans l'aperçu.
        expect(f.photo_path, f.id).toBeNull();
        expect(f.photo_alt, f.id).toBeNull();
        expect(f.disponible, f.id).toBe(true);
      }
    }
  });

  it("porte des identifiants impossibles à confondre avec un UUID", () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const secteur of VITRINE_SECTEURS) {
      const ids = cartesExemple(secteur).flatMap((c) => [
        c.id,
        ...c.categories.flatMap((r) => [r.id, ...r.fiches.map((f) => f.id)]),
      ]);
      for (const id of ids) {
        expect(id.startsWith(PREFIXE_EXEMPLE), id).toBe(true);
        expect(uuid.test(id), id).toBe(false);
      }
    }
  });

  it("ne laisse pas le vocabulaire d'un métier fuir dans un autre", () => {
    // Un mot ne vaut interdiction que là où il trahit un AUTRE métier : « plat »
    // chez un fleuriste est la faute qui fait refermer l'aperçu.
    const interdits: Partial<Record<SecteurVitrine, RegExp>> = {
      fleuriste: /\bplats?\b|\bcoupes?\b|\bchambres?\b|\bcocktails?\b/i,
      coiffeur: /\bplats?\b|\bbouquets?\b|\bchambres?\b|\bcocktails?\b/i,
      hotel: /\bbouquets?\b|\bcoupes?\b/i,
      spa: /\bplats?\b|\bbouquets?\b|\bcocktails?\b/i,
      bar: /\bbouquets?\b|\bcoupes?\b|\bchambres?\b/i,
      restaurant: /\bbouquets?\b|\bcoupes?\b|\bchambres?\b/i,
      // Le neutre ne nomme AUCUN métier : il doit rester lisible pour les sept.
      commerce: /\bplats?\b|\bbouquets?\b|\bcoupes?\b|\bchambres?\b|\bcocktails?\b|\bsoins?\b/i,
    };
    for (const secteur of VITRINE_SECTEURS) {
      const motif = interdits[secteur];
      if (!motif) continue;
      const texte = cartesExemple(secteur)
        .flatMap((c) => [
          c.nom,
          ...c.categories.flatMap((r) => [
            r.nom,
            ...r.fiches.flatMap((f) => [f.nom, f.description ?? ""]),
          ]),
        ])
        .join(" | ");
      expect(motif.test(texte), `${secteur} : ${texte.match(motif)?.[0]}`).toBe(false);
    }
  });

  it("rend une copie : muter le résultat ne contamine pas l'appel suivant", () => {
    const premier = cartesExemple("restaurant");
    premier[0].categories[0].fiches[0].nom = "MUTÉ";
    expect(cartesExemple("restaurant")[0].categories[0].fiches[0].nom).not.toBe("MUTÉ");
  });
});
