import { describe, expect, it } from "vitest";
import {
  ajouterRappelFerme,
  cleAccesOffert,
  cleEssai,
  cleRappelValide,
  estRappelFerme,
  PREFIXES_RAPPELS,
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
    expect(cleRappelValide(`essai:${"a".repeat(114)}`)).toBe(true);
    expect(cleRappelValide(`essai:${"a".repeat(115)}`)).toBe(false);
  });

  it("refuse un préfixe hors liste blanche, même parfaitement bien formé", () => {
    // LE POINT DE LA GARDE. `abonnement-inactif:<org>` respecte la grammaire au
    // caractère près — c'est pourtant le bandeau BLOQUANT, celui qui annonce que
    // le commerce ne peut plus jouer, et il n'a pas de croix. Sans liste blanche,
    // un copier-coller du bandeau d'essai le rendrait fermable six mois durant.
    for (const inconnue of [
      "abonnement-inactif:o",
      "essai-termine:o:j-0",
      "impaye:o",
      "j-3",
      "acces-offert",
    ]) {
      expect(cleRappelValide(inconnue), inconnue).toBe(false);
    }
    // Contrôle négatif : les trois familles autorisées passent toujours.
    expect(PREFIXES_RAPPELS.every((p) => cleRappelValide(`${p}o`))).toBe(true);
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

  it("ignore une famille hors liste blanche DÉJÀ présente dans le cookie", () => {
    // La garde vaut aussi à la LECTURE : un cookie posé avant elle, ou par une
    // version antérieure, ne doit pas pouvoir taire un bandeau bloquant. Les
    // deux côtés sont testés parce que l'un sans l'autre ne protège rien.
    const cookie = JSON.stringify(["abonnement-inactif:o", "essai:o:j-3"]);
    expect(estRappelFerme(cookie, "abonnement-inactif:o")).toBe(false);
    expect(estRappelFerme(cookie, "essai:o:j-3")).toBe(true);
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
    let cookie = ajouterRappelFerme(undefined, "essai:o:j-1");
    cookie = ajouterRappelFerme(cookie, "conseiller:o:2");
    cookie = ajouterRappelFerme(cookie, "essai:o:j-1");
    expect(JSON.parse(cookie)).toEqual(["conseiller:o:2", "essai:o:j-1"]);
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
    const cookie = ajouterRappelFerme(undefined, "essai:o:j-1");
    expect(ajouterRappelFerme(cookie, "PAS VALIDE")).toBe(cookie);
    // Y compris une clé bien formée mais d'une famille non fermable : rien ne
    // s'écrit, donc rien ne pourra se relire.
    expect(ajouterRappelFerme(cookie, "abonnement-inactif:o")).toBe(cookie);
  });

  it("repart d'une liste vide si le cookie reçu est corrompu", () => {
    expect(ajouterRappelFerme("pas du json", "essai:o:j-1")).toBe(
      JSON.stringify(["essai:o:j-1"]),
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

describe("cleAccesOffert / cleEssai — la clé n'est plus assemblée à la main", () => {
  const ORG = "8f14e45f-ceea-467a-9f9f-1f7c6b1c1a11";

  it("produit des clés que la grammaire ET la liste blanche acceptent", () => {
    expect(cleRappelValide(cleAccesOffert(ORG, new Date("2026-09-01T00:00:00Z")))).toBe(true);
    expect(cleRappelValide(cleAccesOffert(ORG, null))).toBe(true);
    expect(cleRappelValide(cleEssai(ORG, 12))).toBe(true);
  });

  it("versionne par l'échéance : une date qui bouge fait revenir le bandeau", () => {
    expect(cleAccesOffert(ORG, new Date("2026-09-01T00:00:00Z"))).not.toBe(
      cleAccesOffert(ORG, new Date("2026-09-02T00:00:00Z")),
    );
    expect(cleAccesOffert(ORG, null)).toBe(`acces-offert:${ORG}:sans-fin`);
  });

  it("versionne par les jours restants, et sépare les organisations", () => {
    expect(cleEssai(ORG, 12)).toBe(`essai:${ORG}:j-12`);
    expect(cleEssai(ORG, 12)).not.toBe(cleEssai(ORG, 11));
    expect(cleEssai(ORG, 12)).not.toBe(cleEssai("autre-org", 12));
  });

  it("une Date INVALIDE rend `inconnu`, jamais une clé bancale", () => {
    // Le défaut visé : `new Date(undefined).getTime()` vaut `NaN`, et
    // `${NaN}` se glissait dans la clé sans que rien ne proteste. La croix
    // paraissait marcher — et taisait la même entrée pour toute échéance
    // illisible, donc potentiellement pour un autre fait que celui affiché.
    const clef = cleAccesOffert(ORG, new Date("pas une date"));
    expect(clef).toBe(`acces-offert:${ORG}:inconnu`);
    expect(cleRappelValide(clef)).toBe(true);
    expect(cleEssai(ORG, Number.NaN)).toBe(`essai:${ORG}:j-inconnu`);
    expect(cleEssai(ORG, Number.POSITIVE_INFINITY)).toBe(`essai:${ORG}:j-inconnu`);
  });

  it("ramène chaque segment à la grammaire plutôt que de le supposer conforme", () => {
    // Même raison que `cleRappelConseils` : une clé refusée rendrait le bouton
    // silencieusement inopérant, sans erreur nulle part.
    const clef = cleEssai("ORG/../Étrange", 3);
    expect(cleRappelValide(clef)).toBe(true);
    expect(clef).toBe("essai:org..trange:j-3");
    // Un identifiant entièrement hors grammaire ne produit pas un segment vide.
    expect(cleAccesOffert("////", null)).toBe("acces-offert:inconnu:sans-fin");
  });

  it("rend une clé que `estRappelFerme` relit après un aller-retour cookie", () => {
    const clef = cleEssai(ORG, 12);
    expect(estRappelFerme(ajouterRappelFerme(undefined, clef), clef)).toBe(true);
  });
});

describe("RAPPELS_COOKIE", () => {
  it("porte un nom de cookie légal", () => {
    expect(RAPPELS_COOKIE).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
});
