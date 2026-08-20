import { describe, expect, it } from "vitest";

import {
  createVitrineCarteSchema,
  reorderVitrineFichesSchema,
  saveVitrineSettingsSchema,
  setVitrineSlugSchema,
  toggleVitrineFicheDisponibiliteSchema,
  updateVitrineCarteSchema,
  updateVitrineFicheSchema,
  vitrineLangSchema,
} from "./vitrine";

/**
 * Ce que ces schémas doivent faire, et où s'arrête leur autorité.
 *
 * Ils rendent un message utile AVANT l'aller-retour. La base reste juge : elle
 * refuse de toute façon. Ce qui est testé ici, ce sont les endroits où un
 * schéma trop tolérant ou trop strict change le COMPORTEMENT — un `null` lu
 * comme un zéro, un vocabulaire ouvert, un ordre qui s'efface.
 */

describe("le slug est normalisé AVANT d'être validé", () => {
  it("détoure et met en minuscules, comme set_vitrine_slug", () => {
    const res = setVitrineSlugSchema.safeParse({ slug: "  Le-Comptoir " });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.slug).toBe("le-comptoir");
  });

  it("refuse ce que la normalisation ne rattrape pas", () => {
    // Espaces internes et accents restent hors forme des DEUX côtés : les
    // « corriger » en silence aurait donné au commerçant une adresse qu'il n'a
    // pas choisie, sur un champ qu'il fera imprimer.
    for (const slug of ["le comptoir", "café", "ab", "a".repeat(61), "Le_Comptoir"]) {
      expect(setVitrineSlugSchema.safeParse({ slug }).success, slug).toBe(false);
    }
  });

  it("un slug RÉSERVÉ passe ici — c'est la base qui le nomme", () => {
    // Délibéré : `set_vitrine_slug` rend « reserved_slug », un état distinct que
    // l'écran affiche. Doubler la liste en zod aurait donné deux vocabulaires à
    // tenir d'accord pour un message identique.
    expect(setVitrineSlugSchema.safeParse({ slug: "dashboard" }).success).toBe(
      true,
    );
  });
});

describe("les cases à cocher — deux formes, deux lectures", () => {
  it("une case NATIVE absente vaut « décochée »", () => {
    // Un navigateur n'envoie pas une case décochée : l'absence EST la valeur.
    const res = updateVitrineCarteSchema.safeParse({
      id: "00000000-0000-4000-8000-0000000000b1",
      nom: "Midi",
      active: null,
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.active).toBe(false);
  });

  it("une case native cochée vaut vrai, quelle que soit sa valeur", () => {
    const res = updateVitrineCarteSchema.safeParse({
      id: "00000000-0000-4000-8000-0000000000b1",
      nom: "Midi",
      active: "on",
    });
    expect(res.success && res.data.active).toBe(true);
  });

  it("la bascule rapide lit un état VOULU, pas une présence", () => {
    // Champ caché « true » / « false » : un bouton n'a rien à décocher, et
    // poster l'état voulu rend le geste idempotent.
    const eteint = toggleVitrineFicheDisponibiliteSchema.safeParse({
      id: "00000000-0000-4000-8000-0000000000d1",
      disponible: "false",
    });
    expect(eteint.success && eteint.data.disponible).toBe(false);

    const rallume = toggleVitrineFicheDisponibiliteSchema.safeParse({
      id: "00000000-0000-4000-8000-0000000000d1",
      disponible: "true",
    });
    expect(rallume.success && rallume.data.disponible).toBe(true);
  });
});

describe("les vocabulaires fermés d'une fiche", () => {
  const base = { id: "00000000-0000-4000-8000-0000000000d1", nom: "Soupe" };

  it("écarte les doublons plutôt que de refuser le formulaire", () => {
    // La base les refuse (23514) ; un formulaire à cases n'en produit pas. Un
    // refus enverrait le commerçant corriger un défaut qui n'est pas le sien.
    const res = updateVitrineFicheSchema.safeParse({
      ...base,
      badges: ["vegan", "vegan"],
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.badges).toEqual(["vegan"]);
  });

  it("REFUSE un mot hors vocabulaire", () => {
    // Ici on refuse au lieu d'écarter : une valeur inventée ne peut pas venir
    // d'une case à cocher, donc elle vient d'un POST direct.
    const res = updateVitrineFicheSchema.safeParse({
      ...base,
      allergenes: ["gluten", "licorne"],
    });
    expect(res.success).toBe(false);
  });

  it("aucune case cochée vaut la liste vide, jamais une erreur", () => {
    const res = updateVitrineFicheSchema.safeParse(base);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.badges).toEqual([]);
    expect(res.data.allergenes).toEqual([]);
  });

  it("le prix est détouré AVANT d'être mesuré", () => {
    // `check (prix_affiche = btrim(prix_affiche))` : un prix accepté ici mais
    // refusé en base rendrait un 23514 que l'écran ne sait pas traduire.
    const res = updateVitrineFicheSchema.safeParse({
      ...base,
      prix_affiche: "  12 €  ",
    });
    expect(res.success && res.data.prix_affiche).toBe("12 €");
  });

  it("borne le prix à 40 caractères, comme le CHECK", () => {
    const res = updateVitrineFicheSchema.safeParse({
      ...base,
      prix_affiche: "€".repeat(41),
    });
    expect(res.success).toBe(false);
  });
});

describe("l'ordre des blocs — écarter, jamais refuser", () => {
  function theme(ordre_blocs: unknown) {
    const res = saveVitrineSettingsSchema.safeParse({ ordre_blocs });
    if (!res.success) throw new Error("le formulaire n'aurait pas dû être refusé");
    return res.data.ordre_blocs;
  }

  it("lit une permutation partielle", () => {
    expect(theme(JSON.stringify(["cartes", "accroche"]))).toEqual([
      "cartes",
      "accroche",
    ]);
  });

  it("écarte inconnus et doublons sans rougir", () => {
    expect(theme(JSON.stringify(["accroche", "licorne", "accroche"]))).toEqual([
      "accroche",
    ]);
  });

  it("un champ absent, vide ou illisible vaut « ordre par défaut »", () => {
    // Et non « tout masqué » : `resoudreThemeVitrine` retombe sur l'ordre
    // naturel pour une liste vide, et l'action omet alors la clé.
    expect(theme(null)).toEqual([]);
    expect(theme("")).toEqual([]);
    expect(theme("{pas du json")).toEqual([]);
    expect(theme(JSON.stringify({ accroche: true }))).toEqual([]);
  });
});

describe("le thème refuse les valeurs que la base refuserait", () => {
  it("la couleur courte #abc est refusée, comme en SQL", () => {
    expect(
      saveVitrineSettingsSchema.safeParse({ couleur_primary: "#abc" }).success,
    ).toBe(false);
  });

  it("le vide est accepté partout — c'est « pas de réglage »", () => {
    const res = saveVitrineSettingsSchema.safeParse({
      couleur_primary: "",
      police_heading: "",
      style_cartes: "",
    });
    expect(res.success).toBe(true);
  });

  it("une police hors catalogue est refusée", () => {
    expect(
      saveVitrineSettingsSchema.safeParse({ police_body: "comic" }).success,
    ).toBe(false);
  });
});

describe("le réordonnancement", () => {
  const rubrique = "00000000-0000-4000-8000-0000000000c1";
  const fiche = "00000000-0000-4000-8000-0000000000d1";

  it("lit la liste ordonnée d'identifiants", () => {
    const res = reorderVitrineFichesSchema.safeParse({
      categorie_id: rubrique,
      order: JSON.stringify([fiche]),
    });
    expect(res.success && res.data.order).toEqual([fiche]);
  });

  it("refuse un ordre illisible, une liste vide ou des non-UUID", () => {
    for (const order of ["pas du json", "[]", JSON.stringify(["x"]), '{"a":1}']) {
      expect(
        reorderVitrineFichesSchema.safeParse({ categorie_id: rubrique, order })
          .success,
        order,
      ).toBe(false);
    }
  });

  it("refuse au-delà de la borne d'écran", () => {
    const trop = JSON.stringify(Array.from({ length: 101 }, () => fiche));
    expect(
      reorderVitrineFichesSchema.safeParse({
        categorie_id: rubrique,
        order: trop,
      }).success,
    ).toBe(false);
  });
});

describe("les noms sont requis, et un champ non rendu les refuse", () => {
  it("le nom d'une carte ne peut pas être vide", () => {
    expect(createVitrineCarteSchema.safeParse({ nom: "   " }).success).toBe(
      false,
    );
    // INVARIANT B de `champ-formulaire` : un champ requis REFUSE `null`, il ne
    // le lit pas comme une valeur.
    expect(createVitrineCarteSchema.safeParse({ nom: null }).success).toBe(
      false,
    );
  });

  it("le nom d'une carte est borné à 80, celui d'une fiche à 120", () => {
    expect(
      createVitrineCarteSchema.safeParse({ nom: "a".repeat(81) }).success,
    ).toBe(false);
    expect(
      updateVitrineFicheSchema.safeParse({
        id: "00000000-0000-4000-8000-0000000000d1",
        nom: "a".repeat(121),
      }).success,
    ).toBe(false);
  });
});

describe("la langue demandée — `en`, ou rien (VIT-1b)", () => {
  it("`en` est la seule valeur qui passe", () => {
    const res = vitrineLangSchema.safeParse("en");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toBe("en");
  });

  it("l'absence de demande est valide, et vaut le français", () => {
    const res = vitrineLangSchema.safeParse(undefined);
    expect(res.success).toBe(true);
    if (!res.success) return;
    // `undefined` et non `"fr"` : le français est l'ABSENCE de demande, et le
    // chemin qui n'a pas de segment de langue. Deux façons de l'écrire auraient
    // fait deux états à replier au même endroit.
    expect(res.data).toBeUndefined();
  });

  it("une langue inconnue échoue ICI, et l'appelant la lit comme « rien »", () => {
    // Elle ne devient jamais une page d'erreur : `getVitrinePublicState` fait
    // `safeParse` et n'ajoute `p_lang` que sur un succès. Refuser aurait donné
    // au visiteur un moyen de distinguer les langues configurées des autres.
    for (const brut of ["fr", "EN", "de", "", "en-GB", 42, null]) {
      expect(vitrineLangSchema.safeParse(brut).success, String(brut)).toBe(
        false,
      );
    }
  });
});
