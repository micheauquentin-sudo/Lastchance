import { describe, expect, it } from "vitest";
import {
  ajouterRappelFerme,
  cleRappelValide,
  estRappelFerme,
  RAPPELS_COOKIE,
  RAPPELS_MAX,
} from "./rappels";

describe("cleRappelValide", () => {
  it("accepte les clés que le produit fabrique", () => {
    expect(cleRappelValide("essai:8f14e45f-ceea-467a-9f9f-1f7c6b1c1a11:j-12")).toBe(true);
    expect(cleRappelValide("acces-offert:8f14e45f:sans-fin")).toBe(true);
    expect(cleRappelValide("acces-offert:8f14e45f:2026-09-01t00.00.00z")).toBe(true);
  });

  it("refuse ce qui n'est pas une chaîne, ou est vide", () => {
    expect(cleRappelValide(undefined)).toBe(false);
    expect(cleRappelValide(null)).toBe(false);
    expect(cleRappelValide(42)).toBe(false);
    expect(cleRappelValide("")).toBe(false);
  });

  it("refuse tout caractère hors grammaire — la valeur vient du réseau", () => {
    // Espace, majuscule, guillemet, chevrons, accolade JSON, saut de ligne :
    // aucun n'a de raison d'apparaître, et chacun ouvrirait une porte
    // (injection dans le JSON du cookie, en-tête `Set-Cookie` coupé).
    for (const mauvaise of [
      "essai j-1",
      "Essai:j-1",
      'essai:"j-1"',
      "essai:<b>",
      "essai:{}",
      "essai\nj-1",
      "essai;path=/",
    ]) {
      expect(cleRappelValide(mauvaise), mauvaise).toBe(false);
    }
  });

  it("refuse une clé trop longue", () => {
    expect(cleRappelValide("a".repeat(120))).toBe(true);
    expect(cleRappelValide("a".repeat(121))).toBe(false);
  });
});

describe("estRappelFerme", () => {
  it("dit non quand aucun cookie n'existe", () => {
    expect(estRappelFerme(undefined, "essai:o:j-3")).toBe(false);
    expect(estRappelFerme("", "essai:o:j-3")).toBe(false);
  });

  it("dit oui pour une clé présente, non pour une voisine", () => {
    const cookie = JSON.stringify(["essai:o:j-3", "acces-offert:o:sans-fin"]);
    expect(estRappelFerme(cookie, "essai:o:j-3")).toBe(true);
    // La clé est VERSIONNÉE : fermer le rappel de J-3 ne tait pas celui de J-2.
    expect(estRappelFerme(cookie, "essai:o:j-2")).toBe(false);
    // Ni celui d'une autre organisation.
    expect(estRappelFerme(cookie, "essai:autre:j-3")).toBe(false);
  });

  it("ne lève JAMAIS sur un cookie corrompu — il rend `false`", () => {
    // Un cookie tronqué par un proxy ou réécrit à la main ne doit pas faire
    // tomber le tableau de bord : le pire admissible est qu'un rappel revienne.
    for (const corrompu of [
      "pas du json",
      '["essai:o:j-3"',
      '{"essai:o:j-3":true}',
      "null",
      "42",
      '"essai:o:j-3"',
      "[[]]",
    ]) {
      expect(() => estRappelFerme(corrompu, "essai:o:j-3")).not.toThrow();
      expect(estRappelFerme(corrompu, "essai:o:j-3"), corrompu).toBe(false);
    }
  });

  it("ignore les entrées non conformes mêlées aux bonnes", () => {
    const cookie = JSON.stringify([null, 7, "ESSAI", "essai:o:j-3"]);
    expect(estRappelFerme(cookie, "essai:o:j-3")).toBe(true);
  });

  it("refuse d'interroger avec une clé invalide", () => {
    const cookie = JSON.stringify(["essai:o:j-3"]);
    expect(estRappelFerme(cookie, "ESSAI:o:j-3")).toBe(false);
  });
});

describe("ajouterRappelFerme", () => {
  it("crée la liste quand il n'y a pas encore de cookie", () => {
    expect(ajouterRappelFerme(undefined, "essai:o:j-3")).toBe(
      JSON.stringify(["essai:o:j-3"]),
    );
  });

  it("rend une valeur que `estRappelFerme` relit", () => {
    const cookie = ajouterRappelFerme(undefined, "essai:o:j-3");
    expect(estRappelFerme(cookie, "essai:o:j-3")).toBe(true);
  });

  it("dédoublonne : re-fermer ne consomme pas une place", () => {
    let cookie = ajouterRappelFerme(undefined, "a:1");
    cookie = ajouterRappelFerme(cookie, "b:2");
    cookie = ajouterRappelFerme(cookie, "a:1");
    expect(JSON.parse(cookie)).toEqual(["b:2", "a:1"]);
  });

  it("plafonne à RAPPELS_MAX en éjectant la plus ancienne", () => {
    let cookie: string | undefined;
    for (let i = 0; i < RAPPELS_MAX + 5; i += 1) {
      cookie = ajouterRappelFerme(cookie, `essai:o:j-${i}`);
    }
    const liste = JSON.parse(cookie as string) as string[];
    expect(liste).toHaveLength(RAPPELS_MAX);
    // Les cinq plus anciennes sont parties, la dernière posée est en queue.
    expect(liste[0]).toBe("essai:o:j-5");
    expect(liste.at(-1)).toBe(`essai:o:j-${RAPPELS_MAX + 4}`);
  });

  it("laisse la liste intacte sur une clé invalide", () => {
    const cookie = ajouterRappelFerme(undefined, "a:1");
    expect(ajouterRappelFerme(cookie, "PAS VALIDE")).toBe(cookie);
  });

  it("repart d'une liste vide si le cookie reçu est corrompu", () => {
    expect(ajouterRappelFerme("pas du json", "a:1")).toBe(
      JSON.stringify(["a:1"]),
    );
  });

  it("ne produit jamais de valeur qui casserait l'en-tête Set-Cookie", () => {
    let cookie: string | undefined;
    for (let i = 0; i < RAPPELS_MAX + 3; i += 1) {
      cookie = ajouterRappelFerme(cookie, `essai:o:j-${i}`);
    }
    expect(cookie).not.toMatch(/[\r\n;]/);
  });
});

describe("RAPPELS_COOKIE", () => {
  it("porte un nom de cookie légal", () => {
    expect(RAPPELS_COOKIE).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
});
