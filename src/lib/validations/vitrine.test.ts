import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createVitrineCarteSchema,
  importVitrineCarteSchema,
  reorderVitrineFichesSchema,
  saveVitrineSettingsSchema,
  setVitrineSlugSchema,
  toggleVitrineFicheDisponibiliteSchema,
  updateVitrineCarteSchema,
  updateVitrineFicheSchema,
  vitrineLangSchema,
  VITRINE_IMPORT_FICHES_MAX,
  VITRINE_IMPORT_RUBRIQUES_MAX,
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

// ────────────────────────────────────────────────────────────
// L'IMPORT D'UNE CARTE EN LOT (VIT-2, lot L12)
// ────────────────────────────────────────────────────────────

/** Le payload minimal valide : une carte, une rubrique, une fiche. */
function importOk(payload: unknown) {
  return importVitrineCarteSchema.safeParse({
    import: JSON.stringify(payload),
  });
}

function rubriques(combien: number, fichesParRubrique = 0) {
  return Array.from({ length: combien }, (_, index) => ({
    nom: `Rubrique ${index}`,
    fiches: Array.from({ length: fichesParRubrique }, (_, rang) => ({
      nom: `Fiche ${index}-${rang}`,
    })),
  }));
}

describe("l'import mire le contrat FERMÉ de la RPC", () => {
  it("lit une carte complète, détourée, dédoublonnée", () => {
    const res = importOk({
      nom: "  Carte du midi  ",
      rubriques: [
        {
          nom: " Entrées ",
          fiches: [
            {
              nom: " Velouté ",
              description: "  Crème légère.  ",
              prix_affiche: "  8 €  ",
              badges: ["vegetarien", "vegetarien"],
              allergenes: ["lait"],
            },
          ],
        },
      ],
    });

    expect(res.success).toBe(true);
    if (!res.success) return;
    const carte = res.data.import;
    // Détouré ICI comme en SQL : `check (prix_affiche = btrim(prix_affiche))`
    // ferait échouer TOUT l'import sur un espace copié d'un tableur.
    expect(carte.nom).toBe("Carte du midi");
    expect(carte.rubriques[0].nom).toBe("Entrées");
    expect(carte.rubriques[0].fiches?.[0].prix_affiche).toBe("8 €");
    // Doublon ÉCARTÉ, comme au formulaire : `is_valid_vitrine_vocabulaire`
    // l'aurait refusé en 23514 pour une répétition qui n'ajoute rien.
    expect(carte.rubriques[0].fiches?.[0].badges).toEqual(["vegetarien"]);
  });

  it("`rubriques` absent vaut la liste vide — une simple création de carte", () => {
    const res = importOk({ nom: "Boissons" });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.import.rubriques).toEqual([]);
  });

  it("REFUSE une clé inconnue aux TROIS rangs", () => {
    // Le mode d'échec que la RPC ferme en toutes lettres : `"prix"` au lieu de
    // `"prix_affiche"`, dépouillé en silence, produirait une carte de soixante
    // plats sans aucun prix — un échec qui ressemble à un succès.
    const cas: Array<[string, unknown]> = [
      ["carte", { nom: "Midi", published: true }],
      ["rubrique", { nom: "Midi", rubriques: [{ nom: "Entrées", ordre: 2 }] }],
      [
        "fiche",
        {
          nom: "Midi",
          rubriques: [{ nom: "Entrées", fiches: [{ nom: "Soupe", prix: "8" }] }],
        },
      ],
    ];
    for (const [rang, payload] of cas) {
      expect(importOk(payload).success, rang).toBe(false);
    }
  });

  it("REFUSE nommément `photo_path` et `disponible`", () => {
    // Ils existent en base, ils ne sont PAS dans le payload : la photo suppose
    // un fichier déjà déposé, la disponibilité naît à `true`.
    for (const champ of ["photo_path", "disponible"]) {
      const res = importOk({
        nom: "Midi",
        rubriques: [
          { nom: "Entrées", fiches: [{ nom: "Soupe", [champ]: "x" }] },
        ],
      });
      expect(res.success, champ).toBe(false);
    }
  });

  it("aucun message de refus ne recopie le fichier", () => {
    const res = importOk({ nom: "Midi", secret_du_commercant: "42" });
    expect(res.success).toBe(false);
    if (res.success) return;
    // Zod nomme la clé fautive dans son message PAR DÉFAUT ; ce message part
    // vers un écran ET un journal, exactement ce que la RPC s'interdit de faire
    // du texte du payload. Le paramètre `error` de chaque rang le remplace.
    expect(res.error.issues[0].message).toBe("Le fichier porte un champ inconnu");
    for (const issue of res.error.issues) {
      expect(issue.message).not.toContain("secret_du_commercant");
    }
  });

  it("aucun message ne retombe sur le défaut ANGLAIS de Zod", () => {
    // Le défaut (« Invalid input: expected string, received number ») ne recopie
    // pas le fichier, mais il arrive à l'écran d'un commerçant francophone. Ce
    // test tient l'invariant sur les formes qu'un fichier écrit à la main
    // produit vraiment : mauvais type à chacun des trois rangs.
    const cas: unknown[] = [
      { nom: 42 },
      { nom: "Midi", rubriques: "pas une liste" },
      { nom: "Midi", rubriques: [{ nom: 42 }] },
      { nom: "Midi", rubriques: [{ nom: "E", fiches: "pas une liste" }] },
      { nom: "Midi", rubriques: [{ nom: "E", fiches: [{ nom: 42 }] }] },
      {
        nom: "Midi",
        rubriques: [{ nom: "E", fiches: [{ nom: "S", description: 7 }] }],
      },
      {
        nom: "Midi",
        rubriques: [{ nom: "E", fiches: [{ nom: "S", badges: "vegan" }] }],
      },
    ];
    for (const payload of cas) {
      const res = importOk(payload);
      expect(res.success, JSON.stringify(payload)).toBe(false);
      if (res.success) continue;
      expect(res.error.issues[0].message, JSON.stringify(payload)).not.toContain(
        "Invalid",
      );
    }
  });
});

describe("les deux bornes de CARDINALITÉ, aux deux bords", () => {
  it(`accepte ${VITRINE_IMPORT_RUBRIQUES_MAX} rubriques et refuse la suivante`, () => {
    expect(
      importOk({ nom: "Midi", rubriques: rubriques(VITRINE_IMPORT_RUBRIQUES_MAX) })
        .success,
    ).toBe(true);
    expect(
      importOk({
        nom: "Midi",
        rubriques: rubriques(VITRINE_IMPORT_RUBRIQUES_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it(`accepte ${VITRINE_IMPORT_FICHES_MAX} fiches AU TOTAL et refuse la suivante`, () => {
    // SUR LE LOT ENTIER et non par rubrique : douze rubriques de cent fiches
    // passeraient douze bornes locales et resteraient mille deux cents lignes.
    const dix = VITRINE_IMPORT_FICHES_MAX / 10;
    expect(importOk({ nom: "Midi", rubriques: rubriques(10, dix) }).success).toBe(
      true,
    );
    const trop = rubriques(10, dix);
    trop[0].fiches.push({ nom: "Une de trop" });
    expect(importOk({ nom: "Midi", rubriques: trop }).success).toBe(false);
  });

  it("les deux bornes sont celles de la MIGRATION, et non des chiffres recopiés", () => {
    // Motif `vitrine-parity.test.ts` : le miroir applicatif est comparé au
    // fichier SQL, sans quoi les deux divergent à la première correction. Ces
    // deux bornes-là ne portent sur aucune colonne — elles ne vivent que dans le
    // corps de `import_vitrine_carte`, que la garde de parité ne lit pas.
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase",
        "migrations",
        "20261013120000_vitrine_import.sql",
      ),
      "utf8",
    ).replace(/\r\n/g, "\n");

    const lire = (nom: string): number => {
      const trouve = new RegExp(
        `${nom}\\s+constant\\s+integer\\s*:=\\s*(\\d+);`,
      ).exec(sql);
      // LÈVE quand l'ancre ne trouve rien : une regex devenue muette rendrait
      // une comparaison qui ne compare plus rien, donc un test vert qui ment.
      if (!trouve) throw new Error(`borne ${nom} introuvable dans la migration`);
      return Number(trouve[1]);
    };

    expect(lire("c_max_rubriques")).toBe(VITRINE_IMPORT_RUBRIQUES_MAX);
    expect(lire("c_max_fiches")).toBe(VITRINE_IMPORT_FICHES_MAX);
  });
});

describe("l'import réutilise les bornes et les vocabulaires du catalogue", () => {
  it("refuse les longueurs que le CHECK refuserait", () => {
    const cas: Array<[string, unknown]> = [
      ["nom de carte", { nom: "a".repeat(81) }],
      ["nom de rubrique", { nom: "Midi", rubriques: [{ nom: "a".repeat(81) }] }],
      [
        "nom de fiche",
        {
          nom: "Midi",
          rubriques: [{ nom: "Entrées", fiches: [{ nom: "a".repeat(121) }] }],
        },
      ],
      [
        "description",
        {
          nom: "Midi",
          rubriques: [
            {
              nom: "Entrées",
              fiches: [{ nom: "Soupe", description: "a".repeat(401) }],
            },
          ],
        },
      ],
      [
        "prix",
        {
          nom: "Midi",
          rubriques: [
            {
              nom: "Entrées",
              fiches: [{ nom: "Soupe", prix_affiche: "€".repeat(41) }],
            },
          ],
        },
      ],
    ];
    for (const [quoi, payload] of cas) {
      expect(importOk(payload).success, quoi).toBe(false);
    }
  });

  it("refuse un mot hors vocabulaire, accepte l'absence des deux listes", () => {
    expect(
      importOk({
        nom: "Midi",
        rubriques: [
          { nom: "Entrées", fiches: [{ nom: "Soupe", badges: ["licorne"] }] },
        ],
      }).success,
    ).toBe(false);
    expect(
      importOk({
        nom: "Midi",
        rubriques: [{ nom: "Entrées", fiches: [{ nom: "Soupe" }] }],
      }).success,
    ).toBe(true);
  });

  it("les champs facultatifs acceptent `null` comme l'absence", () => {
    const res = importOk({
      nom: "Midi",
      rubriques: [
        {
          nom: "Entrées",
          fiches: [{ nom: "Soupe", description: null, prix_affiche: null }],
        },
      ],
    });
    // La RPC fait retomber absent / null / « trois espaces » sur le même `null`.
    expect(res.success).toBe(true);
  });
});

describe("les refus que l'action ne saurait pas distinguer sans la base", () => {
  it("deux rubriques homonymes sont nommées ICI", () => {
    // La RPC les refuse en 22023, sous le même code que quatre autres causes :
    // les distinguer à l'écran aurait demandé de lire son texte, ce que
    // l'action s'interdit. Le refus vaut donc mieux en amont.
    const res = importOk({
      nom: "Midi",
      rubriques: [{ nom: "Entrées" }, { nom: " Entrées " }],
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.issues[0].message).toContain("même nom");
  });

  it("un JSON illisible rend une ISSUE, jamais une exception", () => {
    // Motif `ordreIdsSchema` : une action serveur qui lève sur un champ posté
    // rend une erreur de rendu là où le commerçant attend une phrase.
    for (const brut of ["{pas du json", "[]", '"une chaîne"', "null", "42"]) {
      const res = importVitrineCarteSchema.safeParse({ import: brut });
      expect(res.success, brut).toBe(false);
    }
    expect(
      importVitrineCarteSchema.safeParse({ import: "{pas du json" }).error
        ?.issues[0].message,
    ).toBe("Import illisible");
  });

  it("un champ absent est refusé, il n'est pas lu comme un import vide", () => {
    expect(importVitrineCarteSchema.safeParse({ import: null }).success).toBe(
      false,
    );
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
