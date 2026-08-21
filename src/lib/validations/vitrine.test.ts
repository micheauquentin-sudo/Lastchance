import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { VITRINE_BLOCS } from "@/lib/vitrine";

import {
  createVitrineCarteSchema,
  deleteVitrineContenuSchema,
  deleteVitrineTraductionSchema,
  importVitrineCarteSchema,
  setVitrineTraductionSchema,
  setVitrineContenuSchema,
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

describe("les contenus mis en avant — la place est une CLÉ (VIT-4)", () => {
  const BASE = {
    rang: "2",
    titre: "  Le reportage  ",
    url: "https://presse.test/nous",
  };

  it("détoure le titre et l'adresse, et rend la place en ENTIER", () => {
    const res = setVitrineContenuSchema.safeParse(BASE);
    expect(res.success).toBe(true);
    if (!res.success) return;
    // Le `check` SQL mesure `btrim(titre)` : détourer APRÈS aurait accepté ici
    // un titre de 81 caractères que la base refuse en 23514.
    expect(res.data.titre).toBe("Le reportage");
    expect(res.data.url).toBe("https://presse.test/nous");
    // Un entier, pas la chaîne du formulaire : c'est lui qui part en `.eq()`.
    expect(res.data.rang).toBe(2);
  });

  it.each([["0"], ["4"], ["-1"], ["1.5"], ["premier"], [""], [null]])(
    "refuse la place %s",
    (rang) => {
      expect(setVitrineContenuSchema.safeParse({ ...BASE, rang }).success).toBe(
        false,
      );
      expect(deleteVitrineContenuSchema.safeParse({ rang }).success).toBe(false);
    },
  );

  it("les trois places de la spécification passent, des deux côtés", () => {
    for (const rang of ["1", "2", "3"]) {
      expect(setVitrineContenuSchema.safeParse({ ...BASE, rang }).success).toBe(
        true,
      );
      expect(deleteVitrineContenuSchema.safeParse({ rang }).success).toBe(true);
    }
  });

  it.each([
    ["en clair", "http://presse.test/a"],
    ["en javascript:", "javascript:alert(1)"],
    ["en data:", "data:text/html,<b>"],
    ["relative", "/interne/page"],
    ["sans schéma", "presse.test/a"],
    ["portant un espace", "https://presse.test/a b"],
    ["portant un retour à la ligne", "https://presse.test/a\nb"],
    ["réduite au schéma", "https://"],
    ["vide", ""],
  ])("refuse une adresse %s — miroir du `check` SQL", (_cas, url) => {
    expect(setVitrineContenuSchema.safeParse({ ...BASE, url }).success).toBe(
      false,
    );
  });

  it("accepte une adresse ARBITRAIRE — aucune liste blanche d'hôtes", () => {
    // La différence de régime avec les trois liens sociaux d'`organizations` :
    // ceux-là désignent trois services connus d'avance, celui-ci ce que le
    // commerçant veut montrer. Une liste blanche aurait refusé en silence à peu
    // près tout ce que la fonctionnalité existe pour servir.
    for (const url of [
      "https://ouest-france.test/notre-bistrot",
      "https://presse.test:8443/nous",
      "https://www.instagram.com/p/xyz",
    ]) {
      expect(
        setVitrineContenuSchema.safeParse({ ...BASE, url }).success,
        url,
      ).toBe(true);
    }
  });

  it("borne le titre à 80 et l'adresse à 300, comme la base", () => {
    expect(
      setVitrineContenuSchema.safeParse({ ...BASE, titre: "a".repeat(80) })
        .success,
    ).toBe(true);
    expect(
      setVitrineContenuSchema.safeParse({ ...BASE, titre: "a".repeat(81) })
        .success,
    ).toBe(false);
    // Un titre réduit à des espaces est vide APRÈS détourage : le `check`
    // exige `between 1 and 80` sur `btrim(titre)`.
    expect(
      setVitrineContenuSchema.safeParse({ ...BASE, titre: "   " }).success,
    ).toBe(false);

    const url = (n: number) => `https://presse.test/${"a".repeat(n)}`;
    expect(
      setVitrineContenuSchema.safeParse({ ...BASE, url: url(280) }).success,
    ).toBe(true);
    expect(
      setVitrineContenuSchema.safeParse({ ...BASE, url: url(281) }).success,
    ).toBe(false);
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

  it("accepte la permutation COMPLÈTE des sept blocs, portes comprises", () => {
    // SEPT depuis VIT-3, et le SQL accepte exactement sept
    // (`jsonb_array_length(…) > 7`) : un schéma qui en amputerait un ferait
    // disparaître une porte que le commerçant vient de replacer.
    const sept = [...VITRINE_BLOCS];
    expect(sept).toHaveLength(7);
    expect(theme(JSON.stringify(sept))).toEqual(sept);
    expect(theme(JSON.stringify(["reserver", "experiences"]))).toEqual([
      "reserver",
      "experiences",
    ]);
  });

  it("un HUITIÈME bloc est écarté, et les sept passent quand même", () => {
    // Écarté et non refusé : le vocabulaire est fermé par construction (le
    // schéma dérive de `VITRINE_BLOCS`), et un refus enverrait le commerçant
    // corriger une liste qu'il n'a pas composée à la main. Ce qui compte, c'est
    // que l'intrus ne parte JAMAIS à la base — la migration le rejetterait en
    // 23514 et tout l'enregistrement de réglages échouerait avec lui.
    expect(theme(JSON.stringify([...VITRINE_BLOCS, "jackpot"]))).toEqual([
      ...VITRINE_BLOCS,
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


/**
 * La borne de la CHAÎNE brute (M2, revue L12) : refusée AVANT `JSON.parse`,
 * pas après une traversée d'un mégaoctet. Le message est le même
 * qu'un JSON illisible — un envoi hors gabarit n'apprend rien de plus.
 */
describe("importVitrineCarteSchema — borne de la chaîne brute", () => {
  it("une chaîne au-delà de 128 Ko est refusée sans être parsée", () => {
    const enorme = `{"pad":"${"x".repeat(140_000)}"}`;
    const verdict = importVitrineCarteSchema.safeParse({ import: enorme });
    expect(verdict.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// LES TRADUCTIONS (VIT-5, lot L15)
// ────────────────────────────────────────────────────────────

const CIBLE_ID = "00000000-0000-4000-8000-0000000000b1";
const VERSION = "2026-08-20T10:00:00+00:00";

function traductionValide() {
  return {
    cible_type: "item",
    cible_id: CIBLE_ID,
    champ: "description",
    texte: "Cream and hazelnuts.",
    version: VERSION,
  };
}

describe("setVitrineTraductionSchema — les vocabulaires sont FERMÉS", () => {
  it("accepte une traduction complète et détoure le texte", () => {
    const res = setVitrineTraductionSchema.safeParse({
      ...traductionValide(),
      texte: "  Cream and hazelnuts.  ",
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    // Détouré comme la RPC détoure : `char_length(btrim(texte))` est ce que le
    // `check` mesure, et mesurer autrement ferait refuser en base un texte
    // accepté ici.
    expect(res.data.texte).toBe("Cream and hazelnuts.");
  });

  it("refuse un `cible_type` ou un `champ` hors vocabulaire", () => {
    for (const cible of ["organisation", "", "ITEM", null, 42]) {
      const res = setVitrineTraductionSchema.safeParse({
        ...traductionValide(),
        cible_type: cible,
      });
      expect(res.success, String(cible)).toBe(false);
    }
    for (const champ of ["prix_affiche", "slug", "", null]) {
      const res = setVitrineTraductionSchema.safeParse({
        ...traductionValide(),
        champ,
      });
      expect(res.success, String(champ)).toBe(false);
    }
  });

  it("refuse un identifiant de cible qui n'est pas un uuid", () => {
    for (const id of ["i1", "", null, "00000000-0000-4000-8000"]) {
      const res = setVitrineTraductionSchema.safeParse({
        ...traductionValide(),
        cible_id: id,
      });
      expect(res.success, String(id)).toBe(false);
    }
  });

  it("refuse un texte VIDE — le vide ne vaut pas un retrait", () => {
    // Doctrine de la migration L15 : le retrait est une SECONDE PORTE, pour
    // qu'un texte perdu en chemin n'efface pas un contenu publié.
    for (const texte of ["", "   ", "\n\t", null, undefined]) {
      const res = setVitrineTraductionSchema.safeParse({
        ...traductionValide(),
        texte,
      });
      expect(res.success, JSON.stringify(texte)).toBe(false);
    }
  });

  it("refuse au-delà de 2000 caractères, accepte à 2000 pile", () => {
    const pile = setVitrineTraductionSchema.safeParse({
      ...traductionValide(),
      texte: "x".repeat(2000),
    });
    expect(pile.success).toBe(true);
    const trop = setVitrineTraductionSchema.safeParse({
      ...traductionValide(),
      texte: "x".repeat(2001),
    });
    expect(trop.success).toBe(false);
  });

  it("accepte les formes de version que Postgres écrit, et rien d'autre", () => {
    for (const version of [
      "2026-08-20T10:00:00+00:00",
      "2026-08-20T10:00:00Z",
      "2026-08-20T10:00:00.123456+02:00",
    ]) {
      const res = setVitrineTraductionSchema.safeParse({
        ...traductionValide(),
        version,
      });
      expect(res.success, version).toBe(true);
      if (!res.success) continue;
      // TELLE QUELLE : aucun reformatage, sous peine de faire comparer égaux
      // deux instants distants d'une microseconde.
      expect(res.data.version).toBe(version);
    }
    for (const version of ["", "hier", null, "x".repeat(65)]) {
      const res = setVitrineTraductionSchema.safeParse({
        ...traductionValide(),
        version,
      });
      expect(res.success, String(version)).toBe(false);
    }
  });

  it("une clé inconnue est REFUSÉE, elle n'est pas ignorée", () => {
    // `.strict()` garde le jour où quelqu'un recopie
    // `Object.fromEntries(formData)` : un `lang` ou un `organization_id` posté
    // passerait sinon en silence.
    for (const cle of ["lang", "organization_id", "deleted"]) {
      const res = setVitrineTraductionSchema.safeParse({
        ...traductionValide(),
        [cle]: "en",
      });
      expect(res.success, cle).toBe(false);
    }
  });
});

describe("deleteVitrineTraductionSchema — la cible, et rien de plus", () => {
  it("accepte les trois clés du retrait", () => {
    const res = deleteVitrineTraductionSchema.safeParse({
      cible_type: "settings",
      cible_id: CIBLE_ID,
      champ: "accroche",
    });
    expect(res.success).toBe(true);
  });

  it("REFUSE `texte` et `version` — le retrait n'en dépend pas", () => {
    // Les exiger aurait fait échouer le geste le jour où la source a bougé,
    // c'est-à-dire le jour où l'on veut retirer une traduction devenue fausse.
    const res = deleteVitrineTraductionSchema.safeParse({
      cible_type: "settings",
      cible_id: CIBLE_ID,
      champ: "accroche",
      texte: "Neighbourhood bistro",
      version: VERSION,
    });
    expect(res.success).toBe(false);
  });

  it("ferme les mêmes vocabulaires que la pose", () => {
    // Une divergence entre les deux portes serait un trou : ce qu'on ne peut
    // pas écrire, on ne doit pas pouvoir l'effacer.
    expect(
      deleteVitrineTraductionSchema.safeParse({
        cible_type: "quoi",
        cible_id: CIBLE_ID,
        champ: "nom",
      }).success,
    ).toBe(false);
    expect(
      deleteVitrineTraductionSchema.safeParse({
        cible_type: "item",
        cible_id: "i1",
        champ: "nom",
      }).success,
    ).toBe(false);
  });
});
