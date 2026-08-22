import { describe, expect, it } from "vitest";

import {
  construireVerificationVitrine,
  type CarteVerificationVitrine,
  type EntreeVerificationVitrine,
} from "@/lib/activation/vitrine";

function carte(
  active: boolean,
  ...tailles: number[]
): CarteVerificationVitrine {
  return {
    active,
    categories: tailles.map((n) => ({ fiches: Array.from({ length: n }) })),
  };
}

function verif(patch: Partial<EntreeVerificationVitrine> = {}) {
  return construireVerificationVitrine({
    settings: { slug: "chez-marcel", published: true },
    cartes: [carte(true, 3)],
    nbFichesDuo: 4,
    ...patch,
  });
}

const point = (etat: ReturnType<typeof verif>, cle: string) =>
  etat.controles.find((c) => c.cle === cle);

describe("l'adresse publique", () => {
  it("bloque tout le reste : sans elle, aucun autre point n'est émis", () => {
    const etat = construireVerificationVitrine({
      settings: null,
      cartes: [],
      nbFichesDuo: 0,
    });
    expect(etat.controles.map((c) => c.cle)).toEqual(["adresse"]);
    expect(etat.controles[0].ok).toBe(false);
    // Trois reproches pour un seul réglage manquant auraient fait chercher trois
    // corrections là où il n'y en a qu'une.
    expect(etat.toutPret).toBe(false);
  });

  it("cite l'adresse réelle une fois qu'elle est posée", () => {
    expect(point(verif(), "adresse")).toMatchObject({
      ok: true,
      detail: expect.stringContaining("/v/chez-marcel"),
    });
  });
});

describe("de quoi lire", () => {
  it("compte les fiches des cartes ACTIVES", () => {
    const etat = verif({ cartes: [carte(true, 2, 3), carte(true, 1)] });
    expect(point(etat, "catalogue")).toMatchObject({ ok: true });
    expect(point(etat, "catalogue")!.detail).toContain("6 fiches");
  });

  it("UNE CARTE COUPÉE VAUT ZÉRO FICHE POUR LE CLIENT", () => {
    // Le piège du module : rien ne masque une fiche, c'est sa CARTE qui sort ou
    // non de la RPC publique. Trente fiches sous une carte coupée donnent une
    // page publique vide, et l'écran de composition, lui, les montre toutes.
    const etat = verif({ cartes: [carte(false, 30)] });
    const controle = point(etat, "catalogue")!;
    expect(controle.ok).toBe(false);
    expect(controle.detail).toContain("cartes coupées");
    expect(controle.detail).toContain("30");
  });

  it("dit « page vide » quand il n'y a aucune fiche du tout", () => {
    const controle = point(verif({ cartes: [] }), "catalogue")!;
    expect(controle.ok).toBe(false);
    expect(controle.detail).toContain("page vide");
    // Et il ne parle PAS de cartes coupées : il n'y en a aucune à réactiver.
    expect(controle.detail).not.toContain("coupées");
  });
});

describe("la publication", () => {
  it("est verte dès que la vitrine répond", () => {
    expect(point(verif(), "publiee")).toMatchObject({ ok: true });
  });

  it("avertit avant l'impression, jamais avant l'ouverture", () => {
    const controle = point(
      verif({ settings: { slug: "chez-marcel", published: false } }),
      "publiee",
    )!;
    expect(controle.ok).toBe(false);
    expect(controle.detail).toContain("imprimeriez");
  });
});

describe("le plateau du Duo Miroir", () => {
  it("N'EST PAS ÉMIS quand rien n'est épinglé — ne pas y jouer est un choix", () => {
    // La porte du jeu n'apparaît alors pas sur la vitrine et personne ne manque
    // de rien. Un point rouge permanent chez tous ceux qui n'en veulent pas
    // aurait appris à ignorer la couleur.
    const etat = verif({ nbFichesDuo: 0 });
    expect(point(etat, "duo-plateau")).toBeUndefined();
    expect(etat.toutPret).toBe(true);
  });

  it("passe au vert à partir de trois fiches", () => {
    expect(point(verif({ nbFichesDuo: 3 }), "duo-plateau")).toMatchObject({
      ok: true,
    });
  });

  it("reste jouable à deux, en disant que l'écran en exigera trois", () => {
    // L'écart 2 (base) / 3 (écran) est voulu : on refuse de COMPOSER un plateau
    // de deux, on n'interdit pas d'en JOUER un qui a maigri tout seul.
    const controle = point(verif({ nbFichesDuo: 2 }), "duo-plateau")!;
    expect(controle.ok).toBe(true);
    expect(controle.detail).toContain("3");
  });

  it("PANNE MUETTE À UNE FICHE : le jeu disparaît de la vitrine", () => {
    // `duo_jouable` commande à la fois `duo_start` ET l'affichage de la porte
    // publique. Sous deux fiches, le Duo cesse d'exister pour les clients sans
    // qu'aucun écran ne le dise — et le cas se produit tout seul, par cascade de
    // suppression d'une fiche de la carte.
    const controle = point(verif({ nbFichesDuo: 1 }), "duo-plateau")!;
    expect(controle.ok).toBe(false);
    expect(controle.detail).toContain("disparu");
  });
});

describe("ce que ce module ne prétend pas vérifier", () => {
  it("n'émet AUCUN point sur « À la une », la traduction ou le pack de la Bande", () => {
    const cles = verif().controles.map((c) => c.cle);
    expect(cles).toEqual(["adresse", "catalogue", "publiee", "duo-plateau"]);
  });

  it("une vitrine complète est prête, sans réserve résiduelle", () => {
    const etat = verif();
    expect(etat.toutPret).toBe(true);
    expect(etat.ctaHref).toBe("/dashboard/vitrine");
  });
});
