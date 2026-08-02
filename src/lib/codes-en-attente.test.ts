// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  verdictCodesEnAttente,
  verdictCumule,
} from "@/lib/codes-en-attente";

// ────────────────────────────────────────────────────────────
// LES HUIT GARDES DE SUPPRESSION ÉCHOUAIENT **OUVERT**
//
// Toutes s'écrivaient `const { count } = await supabase…` puis
// `(count ?? 0) > 0`. `error` n'était jamais lu, et `count === null` — ce que
// PostgREST rend sur une coupure, un délai dépassé ou une policy absente le
// temps d'une migration — passait pour « zéro code en attente ». La
// suppression irréversible partait alors SANS confirmation et SANS trace.
//
// Une garde qui échoue ouvert protège exactement les jours où rien ne va mal.
// ────────────────────────────────────────────────────────────

describe("verdictCodesEnAttente", () => {
  it("une erreur de requête vaut INDISPONIBLE, jamais « aucun »", () => {
    expect(
      verdictCodesEnAttente({ count: null, error: { message: "timeout" } }),
    ).toEqual({ etat: "indisponible", motif: "timeout" });
  });

  it("un `count` null SANS erreur vaut aussi INDISPONIBLE", () => {
    // LE CŒUR DU DÉFAUT : c'est cette forme-là — muette, sans `error` à lire —
    // que `?? 0` transformait en feu vert. Elle n'a pas de message propre, d'où
    // le motif de repli : `reportError` doit avoir quelque chose à dire.
    expect(verdictCodesEnAttente({ count: null, error: null })).toEqual({
      etat: "indisponible",
      motif: "comptage sans résultat ni erreur",
    });
  });

  it("l'erreur PRIME sur un count présent : on ne compte pas un résultat douteux", () => {
    expect(
      verdictCodesEnAttente({ count: 3, error: { message: "boom" } }).etat,
    ).toBe("indisponible");
  });

  it("zéro code en attente laisse passer le geste d'entretien", () => {
    // CONTRÔLE NÉGATIF : si le cas nominal refusait, le commerçant apprendrait
    // à cocher la case sans la lire — ce qui la rendrait inutile le jour où
    // elle compte vraiment.
    expect(verdictCodesEnAttente({ count: 0, error: null })).toEqual({
      etat: "aucun",
    });
  });

  it("N codes en attente rendent le NOMBRE, pas un booléen", () => {
    // C'est ce chiffre qui fait arbitrer entre le ménage et le client : « des
    // lots » ne permet de décider de rien, « 7 » si.
    expect(verdictCodesEnAttente({ count: 7, error: null })).toEqual({
      etat: "en-attente",
      nombre: 7,
    });
  });
});

describe("verdictCumule — une suppression qui emporte plusieurs tables", () => {
  it("additionne les tables : le calendrier en a DEUX", () => {
    // `calendar_openings` (lot d'une case) ET `calendar_rewards` (récompense
    // d'assiduité) portent toutes deux un code CADEAU- encaissable et cascadent
    // depuis `calendars`. La garde d'origine ne comptait que la première.
    expect(
      verdictCumule([
        { count: 2, error: null },
        { count: 3, error: null },
      ]),
    ).toEqual({ etat: "en-attente", nombre: 5 });
  });

  it("UNE table muette rend le tout indisponible, sans afficher de total partiel", () => {
    // Additionner les autres donnerait un chiffre qu'on SAIT incomplet — pire
    // qu'aucun chiffre, parce qu'il aurait l'air d'en être un et que le
    // commerçant cocherait sur sa foi.
    expect(
      verdictCumule([
        { count: 4, error: null },
        { count: null, error: null },
      ]).etat,
    ).toBe("indisponible");
  });

  it("l'indisponibilité gagne même en DEUXIÈME position", () => {
    // Sabotage évident à éviter : sortir sur le premier verdict lu.
    expect(
      verdictCumule([
        { count: 0, error: null },
        { count: null, error: { message: "policy manquante" } },
      ]),
    ).toEqual({ etat: "indisponible", motif: "policy manquante" });
  });

  it("deux tables vides laissent passer", () => {
    expect(
      verdictCumule([
        { count: 0, error: null },
        { count: 0, error: null },
      ]),
    ).toEqual({ etat: "aucun" });
  });
});
