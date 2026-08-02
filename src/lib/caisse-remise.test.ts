import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  badgeDeRemise,
  descriptionDeCaisse,
  FENETRE_CONFIRMATION_MS,
} from "@/lib/caisse-remise";

const REMIS_A = "2026-08-02T10:00:00.000Z";
const T = (ms: number) => Date.parse(REMIS_A) + ms;

/**
 * LA PASTILLE VERTE EST UN ORDRE : « remettez le lot au client ».
 *
 * Elle ne doit donc jamais s'afficher pour quelqu'un qui n'a pas déclenché la
 * remise. Le défaut : la confirmation ne comparait que `Date.now()` à
 * `redeemed_at`, sans savoir de qui venait la page. Un ami du premier client —
 * capture d'écran, e-mail transféré — présentant le MÊME code dans les 90 s
 * obtenait le feu vert, sur les neuf familles.
 */
describe("badgeDeRemise", () => {
  it("confirme au caissier qui vient de remettre", () => {
    expect(
      badgeDeRemise({ remisA: REMIS_A, issuDuGeste: true, maintenant: T(2_000) }),
    ).toBe("confirmation");
  });

  it("REFUSE le feu vert à un second porteur du même code", () => {
    // Même code, même minute — mais la page vient d'une recherche, pas de la
    // remise. C'est exactement le geste du comptoir qui donnait un second lot.
    expect(
      badgeDeRemise({ remisA: REMIS_A, issuDuGeste: false, maintenant: T(2_000) }),
    ).toBe("historique");
  });

  it("retombe en historique une fois la fenêtre passée", () => {
    expect(
      badgeDeRemise({
        remisA: REMIS_A,
        issuDuGeste: true,
        maintenant: T(FENETRE_CONFIRMATION_MS),
      }),
    ).toBe("historique");
  });

  it("ne confirme pas une remise située dans le futur", () => {
    // Horloge de l'hôte en retard sur la base : un écart négatif ne doit pas
    // passer pour « à l'instant ».
    expect(
      badgeDeRemise({ remisA: REMIS_A, issuDuGeste: true, maintenant: T(-5_000) }),
    ).toBe("historique");
  });

  it("ne confirme pas sur un horodatage illisible", () => {
    expect(
      badgeDeRemise({ remisA: "pas une date", issuDuGeste: true, maintenant: T(0) }),
    ).toBe("historique");
  });
});

/**
 * LES DEUX LIGNES DE LA CARTE NE DOIVENT PAS SE CONTREDIRE.
 *
 * Le titre porte le libellé gravé à l'émission ; la ligne du dessous lisait la
 * description COURANTE. Après un renommage, la caisse affichait « Café offert »
 * surmontant « un croissant pur beurre, hors boissons » — et c'est la seconde
 * qui porte les conditions appliquées au client.
 */
describe("descriptionDeCaisse", () => {
  it("garde la description quand rien n'a été renommé", () => {
    expect(
      descriptionDeCaisse({
        nomGagne: "Café offert",
        labelCourant: "Café offert",
        descriptionCourante: "un expresso au comptoir",
      }),
    ).toBe("un expresso au comptoir");
  });

  it("RETIRE la description quand la récompense a été renommée depuis", () => {
    expect(
      descriptionDeCaisse({
        nomGagne: "Café offert",
        labelCourant: "Croissant offert",
        descriptionCourante: "un croissant pur beurre, hors boissons",
      }),
    ).toBeNull();
  });

  it("garde l'ancien comportement pour un code antérieur au registre", () => {
    // Sans libellé gravé, la comparaison est impossible : mieux vaut la
    // description courante qu'un blanc.
    expect(
      descriptionDeCaisse({
        nomGagne: null,
        labelCourant: "Croissant offert",
        descriptionCourante: "un croissant pur beurre",
      }),
    ).toBe("un croissant pur beurre");
  });

  it("ne retire rien quand la table parente n'a plus de libellé", () => {
    // Lot supprimé : le titre retombe sur le gravé, la description reste la
    // meilleure information disponible.
    expect(
      descriptionDeCaisse({
        nomGagne: "Café offert",
        labelCourant: null,
        descriptionCourante: "un expresso au comptoir",
      }),
    ).toBe("un expresso au comptoir");
  });

  it("traite une description vide comme absente", () => {
    expect(
      descriptionDeCaisse({
        nomGagne: "Café offert",
        labelCourant: "Café offert",
        descriptionCourante: "   ",
      }),
    ).toBeNull();
  });
});

/**
 * GARDE D'AFFICHAGE — les règles ci-dessus ne valent que si l'écran les appelle.
 *
 * Neuf familles de codes partagent les mêmes deux pastilles ; c'est un oubli sur
 * une seule qui a produit le défaut d'origine.
 */
describe("la caisse consomme bien les deux règles", () => {
  const page = readFileSync("src/app/dashboard/redeem/page.tsx", "utf8");

  it("la pastille verte exige le geste, jamais la seule horloge", () => {
    expect(page).toMatch(/badgeDeRemise\(\{/);
    expect(page).toMatch(/issuDuGeste: remis,/);
    // Le drapeau ne peut venir que du rechargement de la remise elle-même.
    expect(page).toMatch(/const issuDuGeste = remis === "1";/);
    // La comparaison d'horloge nue ne doit plus exister dans la page.
    expect(page).not.toMatch(/90_000/);
  });

  it("les neuf cartes reçoivent le drapeau", () => {
    const passes = page.match(/remis=\{issuDuGeste\}/g) ?? [];
    expect(passes).toHaveLength(9);
    const badges = page.match(/<RedeemedBadge remis=\{remis\}/g) ?? [];
    expect(badges).toHaveLength(9);
  });

  it("aucune carte n'affiche une description non filtrée", () => {
    // Les huit cartes porteuses d'une description passent toutes par la règle.
    const appels = page.match(/descriptionDeCaisse\(\{/g) ?? [];
    expect(appels).toHaveLength(8);
    expect(page).not.toMatch(/\{\w+\.reward_details && \(/);
    expect(page).not.toMatch(/\{participation\.prizes\?\.description && \(/);
  });

  it("les neuf boutons de remise marquent leur geste dans l'URL", async () => {
    const { readdirSync } = await import("node:fs");
    const boutons = readdirSync("src/components/dashboard").filter((n) =>
      n.endsWith("redeem-button.tsx"),
    );
    expect(boutons).toHaveLength(9);
    for (const nom of boutons) {
      const src = readFileSync(`src/components/dashboard/${nom}`, "utf8");
      expect(src, nom).toMatch(/reloadWith: \{ remis: "1" \}/);
    }
  });
});
