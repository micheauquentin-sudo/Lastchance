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
 *
 * Depuis la migration 20260901120000 la description est gravée elle aussi : la
 * caisse affiche donc la BONNE plutôt que rien. Les tests de repli qui suivent
 * restent indispensables — un code antérieur au registre, un lot décrit après
 * coup et TOUTE la famille pronostics passent encore par la table parente.
 */
describe("descriptionDeCaisse", () => {
  it("affiche la description GRAVÉE, même si la courante a été réécrite", () => {
    // LE DÉFAUT D'ORIGINE, dans sa forme la plus vicieuse : le commerçant
    // réécrit la description SANS renommer. L'ancienne version ne pouvait pas
    // le détecter et affichait le texte réécrit ; ici la gravure tranche.
    expect(
      descriptionDeCaisse({
        detailsGraves: "un expresso au comptoir",
        nomGagne: "Café offert",
        labelCourant: "Café offert",
        descriptionCourante: "un croissant pur beurre, hors boissons",
      }),
    ).toBe("un expresso au comptoir");
  });

  it("la gravure fait foi même après un renommage", () => {
    // Avant, ce cas RETIRAIT la description faute de mieux. Il y a désormais
    // mieux : le texte sous lequel le client a gagné.
    expect(
      descriptionDeCaisse({
        detailsGraves: "un expresso au comptoir",
        nomGagne: "Café offert",
        labelCourant: "Croissant offert",
        descriptionCourante: "un croissant pur beurre, hors boissons",
      }),
    ).toBe("un expresso au comptoir");
  });

  it("garde la description quand rien n'a été renommé", () => {
    expect(
      descriptionDeCaisse({
        detailsGraves: null,
        nomGagne: "Café offert",
        labelCourant: "Café offert",
        descriptionCourante: "un expresso au comptoir",
      }),
    ).toBe("un expresso au comptoir");
  });

  it("RETIRE la description courante quand la récompense a été renommée depuis", () => {
    // Sans gravure — famille pronostics, lot décrit après coup — la garde
    // d'origine reste le meilleur choix disponible.
    expect(
      descriptionDeCaisse({
        detailsGraves: null,
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
        detailsGraves: null,
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
        detailsGraves: null,
        nomGagne: "Café offert",
        labelCourant: null,
        descriptionCourante: "un expresso au comptoir",
      }),
    ).toBe("un expresso au comptoir");
  });

  it("traite une description vide comme absente", () => {
    expect(
      descriptionDeCaisse({
        detailsGraves: null,
        nomGagne: "Café offert",
        labelCourant: "Café offert",
        descriptionCourante: "   ",
      }),
    ).toBeNull();
  });

  it("une gravure vide n'efface pas la table parente", () => {
    // Le gel n'écrase jamais une description gravée mais laisse REMPLIR une
    // absente : une chaîne vide au registre ne vaut pas mieux que rien, on ne
    // doit pas rendre la carte muette pour autant.
    expect(
      descriptionDeCaisse({
        detailsGraves: "  ",
        nomGagne: "Café offert",
        labelCourant: "Café offert",
        descriptionCourante: "un expresso au comptoir",
      }),
    ).toBe("un expresso au comptoir");
  });
});

/**
 * GARDE D'AFFICHAGE — les règles ci-dessus ne valent que si l'écran les appelle.
 *
 * DIX familles de codes partagent les mêmes deux pastilles depuis RES-5 (la
 * réservation de stock, `RESA-`) ; c'est un oubli sur une seule qui a produit le
 * défaut d'origine.
 *
 * ── POURQUOI DES COMPTES EN DUR, ET POURQUOI ILS SE METTENT À JOUR ──
 *
 * Le compte est ce qui rend l'oubli VISIBLE : une famille ajoutée sans sa
 * pastille ne fait pas rougir un test qui vérifierait seulement « au moins une
 * carte ». Le prix est celui-ci — chaque famille neuve fait échouer ce fichier
 * jusqu'à ce que quelqu'un ait REGARDÉ la nouvelle carte et compté. C'est le
 * geste attendu, pas une corvée : le rouge dit « une carte est arrivée »,
 * l'incrément dit « et elle porte bien les deux règles ».
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

  it("les dix cartes reçoivent le drapeau", () => {
    const passes = page.match(/remis=\{issuDuGeste\}/g) ?? [];
    expect(passes).toHaveLength(10);
    // `\s+` ET NON UNE ESPACE : la mise en forme décide seule si `remis` reste
    // sur la ligne de la balise ou passe à la suivante, et une carte
    // parfaitement câblée devenait invisible de ce compte au premier retour à
    // la ligne — un rouge qui accuse la carte alors que seul Prettier a bougé.
    const badges = page.match(/<RedeemedBadge\s+remis=\{remis\}/g) ?? [];
    expect(badges).toHaveLength(10);
  });

  it("aucune carte n'affiche une description non filtrée", () => {
    // Les neuf cartes porteuses d'une description passent toutes par la règle.
    // (Seule `contest` n'en a pas : elle n'écrit jamais `reward_details`.)
    const appels = page.match(/descriptionDeCaisse\(\{/g) ?? [];
    expect(appels).toHaveLength(9);
    expect(page).not.toMatch(/\{\w+\.reward_details && \(/);
    expect(page).not.toMatch(/\{participation\.prizes\?\.description && \(/);
  });

  it("les neuf cartes reçoivent la description GRAVÉE, pas seulement la courante", () => {
    // `detailsGraves` est un champ REQUIS du type, donc `tsc` attrape déjà une
    // carte qui l'oublierait. Ce qu'il ne peut pas attraper : une carte qui le
    // câblerait sur `null` en dur, ce qui la ferait retomber en silence sur la
    // table parente — l'oubli sur UNE famille est précisément le défaut
    // d'origine. On compte donc les câblages réels.
    const cables = page.match(/detailsGraves: descriptionGagnee,/g) ?? [];
    expect(cables).toHaveLength(9);
    // La valeur vient bien du registre, jamais d'une table parente.
    expect(page).toMatch(/lookup\.frozenDetails/);
  });

  it("les dix boutons de remise marquent leur geste dans l'URL", async () => {
    const { readdirSync } = await import("node:fs");
    const boutons = readdirSync("src/components/dashboard").filter((n) =>
      n.endsWith("redeem-button.tsx"),
    );
    expect(boutons).toHaveLength(10);
    for (const nom of boutons) {
      const src = readFileSync(`src/components/dashboard/${nom}`, "utf8");
      expect(src, nom).toMatch(/reloadWith: \{ remis: "1" \}/);
    }
  });
});
