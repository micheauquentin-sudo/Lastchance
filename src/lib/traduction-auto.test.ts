// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  champsATraduire,
  decouperEnLots,
  messageCompteRendu,
} from "@/lib/traduction-auto";
import {
  desechapperGoogle,
  lireReponseGoogle,
} from "@/lib/traduction-fournisseur";
import type { TraductionEtatView } from "@/lib/vitrine";

/**
 * VIT-6 — ce qui part chez un fournisseur facturé au caractère.
 *
 * Les deux propriétés qui coûtent de l'argent si on les casse : un champ FRAIS
 * ne repart jamais, et une réponse mal formée ne s'écrit jamais. La seconde
 * coûte pire que de l'argent — une réponse plus courte que la demande, écrite
 * sans vérification, décalerait les traductions d'un cran et donnerait à un
 * plat la description du précédent.
 */

function etat(
  cibles: TraductionEtatView["cibles"],
): TraductionEtatView {
  return {
    resume: { total: 0, frais: 0, perimes: 0, manquants: 0 },
    cibles,
  };
}

const VERSION = "2026-08-20T10:00:00.000Z";

describe("champsATraduire", () => {
  it("ne renvoie jamais un champ déjà frais", () => {
    const selection = champsATraduire(
      etat([
        {
          cibleType: "item",
          cibleId: "i1",
          libelle: "Velouté",
          version: VERSION,
          champs: [
            { champ: "nom", etat: "frais", texteSource: "Velouté", texteTraduit: "Soup" },
            {
              champ: "description",
              etat: "absent",
              texteSource: "Crème légère",
              texteTraduit: null,
            },
          ],
        },
      ]),
    );

    expect(selection.retenus).toHaveLength(1);
    expect(selection.retenus[0]).toMatchObject({
      champ: "description",
      texte: "Crème légère",
      version: VERSION,
    });
    expect(selection.caracteres).toBe("Crème légère".length);
  });

  it("reprend un champ périmé — c'est la moitié du sujet", () => {
    const selection = champsATraduire(
      etat([
        {
          cibleType: "menu",
          cibleId: "m1",
          libelle: "Carte du soir",
          version: VERSION,
          champs: [
            {
              champ: "nom",
              etat: "perime",
              texteSource: "Carte du soir",
              texteTraduit: "Evening menu",
            },
          ],
        },
      ]),
    );
    expect(selection.retenus.map((c) => c.champ)).toEqual(["nom"]);
  });

  it("écarte un champ source vide plutôt que de traduire du vide", () => {
    const selection = champsATraduire(
      etat([
        {
          cibleType: "settings",
          cibleId: "s1",
          libelle: "Réglages",
          version: VERSION,
          champs: [
            { champ: "accroche", etat: "absent", texteSource: "   ", texteTraduit: null },
          ],
        },
      ]),
    );
    expect(selection.retenus).toHaveLength(0);
    expect(selection.caracteres).toBe(0);
  });

  it("compte les champs sans version au lieu de les envoyer pour rien", () => {
    // Sans version, `upsert_vitrine_translation` refuserait l'écriture : payer
    // la traduction avant le refus serait payer deux fois pour rien.
    const selection = champsATraduire(
      etat([
        {
          cibleType: "item",
          cibleId: "i1",
          libelle: "Velouté",
          version: "",
          champs: [
            { champ: "nom", etat: "absent", texteSource: "Velouté", texteTraduit: null },
          ],
        },
      ]),
    );
    expect(selection.retenus).toHaveLength(0);
    expect(selection.sansVersion).toBe(1);
  });

  it("s'arrête à la borne de caractères et le DIT", () => {
    const selection = champsATraduire(
      etat([
        {
          cibleType: "item",
          cibleId: "i1",
          libelle: "Plat",
          version: VERSION,
          champs: [
            { champ: "nom", etat: "absent", texteSource: "abcde", texteTraduit: null },
            {
              champ: "description",
              etat: "absent",
              texteSource: "fghij",
              texteTraduit: null,
            },
          ],
        },
      ]),
      { caracteresMax: 5, champsMax: 50 },
    );

    expect(selection.retenus).toHaveLength(1);
    expect(selection.tronquee).toBe(true);
  });

  it("s'arrête aussi à la borne de champs", () => {
    const selection = champsATraduire(
      etat([
        {
          cibleType: "item",
          cibleId: "i1",
          libelle: "Plat",
          version: VERSION,
          champs: [
            { champ: "nom", etat: "absent", texteSource: "a", texteTraduit: null },
            { champ: "description", etat: "absent", texteSource: "b", texteTraduit: null },
          ],
        },
      ]),
      { caracteresMax: 10_000, champsMax: 1 },
    );

    expect(selection.retenus).toHaveLength(1);
    expect(selection.tronquee).toBe(true);
  });
});

describe("decouperEnLots", () => {
  it("découpe sans perdre ni dupliquer", () => {
    expect(decouperEnLots([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("rend une liste vide pour rien à découper", () => {
    expect(decouperEnLots([], 3)).toEqual([]);
  });
});

describe("messageCompteRendu", () => {
  it("dit les caractères, parce que c'est l'unité facturée", () => {
    // `toLocaleString("fr-FR")` sépare les milliers par une espace fine
    // INSÉCABLE (U+202F) — la typographie française, pas une espace ordinaire.
    // Le test normalise les blancs plutôt que d'imposer au message d'être moins
    // correct qu'il ne l'est.
    const message = messageCompteRendu(3, 1234, false).replace(/\s/g, " ");
    expect(message).toContain("1 234 caractères");
  });

  it("invite à relancer quand une borne a coupé", () => {
    expect(messageCompteRendu(3, 10, true)).toContain("relancez");
  });

  it("ne promet rien quand il n'y avait rien à faire", () => {
    expect(messageCompteRendu(0, 0, false)).toBe(
      "Rien à traduire : tout est déjà à jour en anglais.",
    );
  });
});

describe("lireReponseGoogle", () => {
  it("lit une réponse conforme", () => {
    expect(
      lireReponseGoogle(
        { data: { translations: [{ translatedText: "Soup" }, { translatedText: "Beef" }] } },
        2,
      ),
    ).toEqual(["Soup", "Beef"]);
  });

  it("REFUSE une réponse plus courte que la demande", () => {
    // Le décalage silencieux est le pire mode d'échec : le plat suivant
    // recevrait la traduction du précédent, et rien ne le dirait.
    expect(
      lireReponseGoogle({ data: { translations: [{ translatedText: "Soup" }] } }, 2),
    ).toBeNull();
  });

  it("refuse une forme inattendue plutôt que d'écrire n'importe quoi", () => {
    expect(lireReponseGoogle(null, 1)).toBeNull();
    expect(lireReponseGoogle({ data: {} }, 1)).toBeNull();
    expect(lireReponseGoogle({ data: { translations: [{}] } }, 1)).toBeNull();
    expect(
      lireReponseGoogle({ data: { translations: [{ translatedText: 7 }] } }, 1),
    ).toBeNull();
  });

  it("désamorce les entités que Google renvoie même en mode texte", () => {
    expect(desechapperGoogle("l&#39;entr&#xe9;e &amp; le plat")).toBe(
      "l'entrée & le plat",
    );
  });
});
