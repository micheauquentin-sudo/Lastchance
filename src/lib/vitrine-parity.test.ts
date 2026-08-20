import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FONT_KEYS } from "./fonts";
import {
  ALLERGENES_EN,
  ALLERGENES_FR,
  BADGES_EN,
  BADGES_FR,
  VITRINE_ACCROCHE_MAX,
  VITRINE_ALLERGENES,
  VITRINE_BADGES,
  VITRINE_CARTE_NOM_MAX,
  VITRINE_CHEMIN_IMAGE_MAX,
  VITRINE_FICHE_DESCRIPTION_MAX,
  VITRINE_FICHE_NOM_MAX,
  VITRINE_HISTOIRE_MAX,
  VITRINE_HORAIRES_MAX,
  VITRINE_BLOCS,
  VITRINE_ORDRE_MAX,
  VITRINE_ORDRE_MIN,
  VITRINE_PRIX_AFFICHE_MAX,
  VITRINE_RUBRIQUE_NOM_MAX,
  VITRINE_SLUG_MAX,
  VITRINE_SLUG_MIN,
  VITRINE_SLUGS_RESERVES,
  VITRINE_STYLES_CARTES,
  VITRINE_THEME_POLICES,
} from "./vitrine";

/**
 * GARDE DE PARITÉ — les vocabulaires de la Vitrine, des DEUX côtés.
 *
 * ── LE DÉFAUT QU'ELLE FERME, ET IL EXISTAIT VRAIMENT ──
 *
 * La migration `20261011120000_vitrine_catalogue.sql` écrit noir sur blanc que
 * ses sept polices sont « EXACTEMENT `FONT_KEYS` de src/lib/fonts.ts », recopiées
 * parce qu'un `check` ne peut pas lire un fichier TypeScript, et elle renvoie la
 * surveillance de l'écart « à la garde de parité à écrire côté application ».
 * Cette garde-là n'existait pas : le SQL n'avait AUCUN filet côté TS le jour de
 * sa livraison. Elle est écrite ici, et elle couvre les six vocabulaires plutôt
 * que les seules polices — badges, allergènes, styles, blocs, slugs réservés et
 * bornes divergeraient exactement de la même façon.
 *
 * ── CE FICHIER NE CONTIENT AUCUNE LISTE, IL LES LIT ──
 *
 * Motif exact de `module-access-parity.test.ts` : il PARSE la migration et
 * compare à `src/lib/vitrine.ts`. Il n'y a donc pas de troisième exemplaire à
 * tenir synchronisé — modifier le SQL fait rougir ce test tant que le miroir ne
 * suit pas, et l'inverse aussi. C'est une garde TEXTUELLE au sens d'ADR-074 :
 * elle lit un fichier, elle ne fait rien exécuter.
 *
 * ── LA GARDE DE LA GARDE ──
 *
 * Chaque extracteur LÈVE quand il ne trouve pas sa forme, et chaque liste est
 * comptée avant d'être comparée. Sans cela, une regex devenue muette rendrait
 * une liste vide et toutes les comparaisons passeraient en ne comparant rien —
 * le défaut « le détecteur ment », déjà payé douze fois sur ce dépôt.
 */

const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261011120000_vitrine_catalogue.sql",
);

/**
 * FINS DE LIGNE NORMALISÉES À LA LECTURE, et non gérées ancre par ancre.
 *
 * Ce dépôt est cloné sous Windows : la migration porte des CRLF, et une ancre
 * écrite `"badges,\n      array["` n'y trouve rien. Le piège a déjà été payé
 * deux fois (`module-access-parité`, « échéance des lots »), et il est
 * particulièrement traître ici parce qu'une ancre muette rendrait une liste
 * VIDE — donc un test vert qui ne compare rien. On le ferme une fois, à la
 * source, plutôt que d'écrire `\r?\n` dans chaque ancre.
 */
const SOURCE = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");

/** Les chaînes SQL simples quotées d'un fragment, dans l'ordre du fichier. */
function motsQuotes(fragment: string): string[] {
  return [...fragment.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
}

/**
 * Le fragment compris entre une ancre et un terminateur, terminateur exclu.
 *
 * `\r?\n` nulle part ici : les ancres sont choisies sur une seule ligne, ce qui
 * évite le piège CRLF que ce dépôt paie à chaque garde textuelle écrite sous
 * Windows (cf. `module-access-parity.test.ts`).
 */
function fragment(ancre: string, fin: string, depuis = 0): string {
  const debut = SOURCE.indexOf(ancre, depuis);
  if (debut < 0) {
    throw new Error(
      `Ancre introuvable dans la migration Vitrine : « ${ancre} ». La garde ne ` +
        "mesure plus rien — corriger l'ancre, jamais la contourner.",
    );
  }
  const apres = SOURCE.indexOf(fin, debut + ancre.length);
  if (apres < 0) {
    throw new Error(
      `Terminateur « ${fin} » introuvable après « ${ancre} » : forme du SQL ` +
        "changée, garde à réécrire.",
    );
  }
  return SOURCE.slice(debut + ancre.length, apres);
}

/** Un nombre nommé par une regex, ou une erreur — jamais un `undefined` muet. */
function nombre(motif: RegExp, quoi: string): number {
  const trouve = motif.exec(SOURCE);
  if (!trouve) {
    throw new Error(
      `Borne « ${quoi} » introuvable dans la migration Vitrine : la garde ne ` +
        "mesure plus cette borne.",
    );
  }
  return Number(trouve[1]);
}

const BADGES_SQL = motsQuotes(fragment("badges,\n      array[", "]::text[]"));
const ALLERGENES_SQL = motsQuotes(
  fragment("allergenes,\n      array[", "]::text[]"),
);
const STYLES_SQL = motsQuotes(fragment("->> 'style_cartes') not in (", ")"));
const BLOCS_SQL = motsQuotes(fragment("(e.value #>> '{}') not in", ")"));
const POLICES_SQL = motsQuotes(fragment("(v_polices ->> e.key) not in", ")"));
const RESERVES_SQL = motsQuotes(
  fragment(
    "return lower(btrim(p_slug)) = any (array[",
    "]);",
  ),
);

describe("parité Vitrine — les vocabulaires du SQL et leur miroir TypeScript", () => {
  it("le parsing a effectivement trouvé quelque chose (garde de la garde)", () => {
    // ROUGE SI un extracteur devient muet : sans ces comptes, les `toEqual`
    // ci-dessous compareraient deux listes vides et passeraient.
    expect(BADGES_SQL.length).toBe(8);
    expect(ALLERGENES_SQL.length).toBe(14);
    expect(STYLES_SQL.length).toBe(3);
    expect(BLOCS_SQL.length).toBe(5);
    expect(POLICES_SQL.length).toBe(7);
    expect(RESERVES_SQL.length).toBeGreaterThan(40);
  });

  it("les huit badges de régime sont les mêmes des deux côtés", () => {
    expect(BADGES_SQL.slice().sort()).toEqual([...VITRINE_BADGES].sort());
  });

  it("les quatorze allergènes UE-14 sont les mêmes des deux côtés", () => {
    expect(ALLERGENES_SQL.slice().sort()).toEqual(
      [...VITRINE_ALLERGENES].sort(),
    );
  });

  it("l'annexe II compte QUATORZE allergènes, et pas un de plus", () => {
    // Épinglé à part du test de parité : les deux listes pourraient dériver
    // ENSEMBLE — un quinzième allergène ajouté des deux côtés serait vert
    // ci-dessus et faux au regard du règlement UE 1169/2011, qui est la seule
    // autorité sur ce vocabulaire-là.
    expect(VITRINE_ALLERGENES).toHaveLength(14);
  });

  it("les trois styles de cartes sont les mêmes des deux côtés", () => {
    expect(STYLES_SQL.slice().sort()).toEqual([...VITRINE_STYLES_CARTES].sort());
  });

  it("les cinq blocs de la page d'accueil sont les mêmes des deux côtés", () => {
    expect(BLOCS_SQL.slice().sort()).toEqual([...VITRINE_BLOCS].sort());
  });

  it("le vocabulaire réservé des slugs est le même des deux côtés", () => {
    // ORDRE COMPRIS ici, contrairement aux autres : les deux listes sont écrites
    // dans les mêmes quatre groupes commentés, et un tri masquerait qu'une
    // addition a été rangée au mauvais endroit — c'est-à-dire qu'elle sera
    // oubliée à la prochaine relecture.
    expect(RESERVES_SQL).toEqual([...VITRINE_SLUGS_RESERVES]);
  });
});

describe("parité Vitrine — le vocabulaire de plateforme EN FRANÇAIS ET EN ANGLAIS", () => {
  /**
   * Le texte d'un libellé, émoji de tête retiré.
   *
   * Les badges portent un pictogramme, les allergènes non : cette fonction rend
   * la partie qu'on peut comparer d'une langue à l'autre.
   */
  const texteSeul = (libelle: string): string =>
    libelle.replace(/^\P{L}+\s/u, "");

  it("les deux catalogues de badges couvrent EXACTEMENT le vocabulaire SQL", () => {
    // La garde que L11 ajoute : un neuvième badge ajouté en base et en français
    // sans passer par l'anglais afficherait un SLUG nu sur la page anglaise —
    // une case que le visiteur ne sait pas lire, exactement le défaut que
    // `libelleBadge` évite en français.
    expect(Object.keys(BADGES_FR).sort()).toEqual(BADGES_SQL.slice().sort());
    expect(Object.keys(BADGES_EN).sort()).toEqual(BADGES_SQL.slice().sort());
  });

  it("les deux catalogues d'allergènes couvrent EXACTEMENT les quatorze", () => {
    expect(Object.keys(ALLERGENES_FR).sort()).toEqual(
      ALLERGENES_SQL.slice().sort(),
    );
    expect(Object.keys(ALLERGENES_EN).sort()).toEqual(
      ALLERGENES_SQL.slice().sort(),
    );
  });

  it("aucun libellé vide, dans aucune des deux langues", () => {
    // Une chaîne vide est PIRE qu'un slug : elle rend une case que personne ne
    // sait expliquer. Le détourage est testé aussi — « ␣Vegan » se voit à
    // l'écran et pas dans une revue.
    for (const catalogue of [BADGES_FR, BADGES_EN, ALLERGENES_FR, ALLERGENES_EN]) {
      for (const [cle, libelle] of Object.entries(catalogue)) {
        expect(libelle.trim(), cle).not.toBe("");
        expect(libelle, cle).toBe(libelle.trim());
      }
    }
  });

  it("le pictogramme d'un badge est le MÊME dans les deux langues", () => {
    // Un émoji n'a pas de langue. En changer avec la langue aurait laissé croire
    // à un autre régime, et déplacé le badge dans la grille.
    for (const cle of Object.keys(BADGES_FR) as Array<keyof typeof BADGES_FR>) {
      const emojiFr = BADGES_FR[cle].slice(0, BADGES_FR[cle].indexOf(" "));
      const emojiEn = BADGES_EN[cle].slice(0, BADGES_EN[cle].indexOf(" "));
      expect(emojiEn, cle).toBe(emojiFr);
      // AUCUNE assertion « les deux textes diffèrent » : « Vegan » s'écrit
      // pareil dans les deux langues, et l'exiger aurait poussé à inventer une
      // différence là où le mot juste est le même. C'est la garde d'accent
      // ci-dessous qui attrape le copier-coller.
      expect(texteSeul(BADGES_EN[cle]), cle).not.toBe("");
    }
  });

  it("l'anglais ne porte AUCUN caractère accentué", () => {
    // Le filet qui attrape un libellé oublié en français : « Épicé », « Œufs »
    // et « Crustacés » ne passent pas. Il ne prouve pas la qualité de la
    // traduction — c'est une relecture humaine qui l'a faite — mais il attrape
    // le copier-coller.
    const accentue = /[À-ÖØ-öø-ÿŒœ]/;
    for (const libelle of [
      ...Object.values(BADGES_EN),
      ...Object.values(ALLERGENES_EN),
    ]) {
      expect(accentue.test(libelle), libelle).toBe(false);
    }
  });

  it("aucun émoji sur un allergène, dans aucune des deux langues", () => {
    // Un allergène n'est pas un argument de vente, et un pictogramme fantaisiste
    // sur « fruits à coque » serait lu comme une nuance.
    for (const libelle of [
      ...Object.values(ALLERGENES_FR),
      ...Object.values(ALLERGENES_EN),
    ]) {
      expect(/\p{Extended_Pictographic}/u.test(libelle), libelle).toBe(false);
    }
  });
});

describe("parité Vitrine — les polices du thème, TROIS listes et deux gardes", () => {
  it("le thème admet exactement les polices que le SQL accepte", () => {
    expect(POLICES_SQL.slice().sort()).toEqual(
      [...VITRINE_THEME_POLICES].sort(),
    );
  });

  it("le thème admet exactement les polices que le CSS sait charger", () => {
    // LA GARDE QUE LA MIGRATION A DEMANDÉE, mot pour mot : « une huitième police
    // ajoutée à fonts.ts sans passer ici sera REFUSÉE par la base ». Sans ce
    // test, le symptôme serait un choix offert à l'écran et refusé par Postgres
    // sur un 23514 que personne ne sait traduire.
    expect([...VITRINE_THEME_POLICES].sort()).toEqual([...FONT_KEYS].sort());
  });
});

describe("parité Vitrine — les bornes des `check`", () => {
  it("les longueurs de texte sont les mêmes des deux côtés", () => {
    expect(nombre(/char_length\(accroche\) <= (\d+)/, "accroche")).toBe(
      VITRINE_ACCROCHE_MAX,
    );
    expect(nombre(/char_length\(histoire\) <= (\d+)/, "histoire")).toBe(
      VITRINE_HISTOIRE_MAX,
    );
    expect(
      nombre(/char_length\(horaires_texte\) <= (\d+)/, "horaires_texte"),
    ).toBe(VITRINE_HORAIRES_MAX);
    expect(nombre(/char_length\(description\) <= (\d+)/, "description")).toBe(
      VITRINE_FICHE_DESCRIPTION_MAX,
    );
    expect(nombre(/char_length\(cover_path\) <= (\d+)/, "cover_path")).toBe(
      VITRINE_CHEMIN_IMAGE_MAX,
    );
    expect(nombre(/char_length\(photo_path\) <= (\d+)/, "photo_path")).toBe(
      VITRINE_CHEMIN_IMAGE_MAX,
    );
  });

  it("les bornes des noms et du prix affiché sont les mêmes des deux côtés", () => {
    // Le nom de CARTE est le premier `btrim(nom)` du fichier, celui de RUBRIQUE
    // le deuxième, celui de FICHE le troisième : on les lit par leur ancre de
    // table plutôt que par leur rang, qu'une insertion ferait glisser en silence.
    const borneNom = (ancreTable: string, quoi: string): number => {
      const depuis = SOURCE.indexOf(ancreTable);
      if (depuis < 0) throw new Error(`Table ${ancreTable} introuvable`);
      const trouve = /char_length\(pg_catalog\.btrim\(nom\)\) between 1 and (\d+)/.exec(
        SOURCE.slice(depuis),
      );
      if (!trouve) throw new Error(`Borne de nom introuvable pour ${quoi}`);
      return Number(trouve[1]);
    };
    expect(borneNom("create table public.vitrine_menus", "carte")).toBe(
      VITRINE_CARTE_NOM_MAX,
    );
    expect(borneNom("create table public.vitrine_categories", "rubrique")).toBe(
      VITRINE_RUBRIQUE_NOM_MAX,
    );
    expect(borneNom("create table public.vitrine_items", "fiche")).toBe(
      VITRINE_FICHE_NOM_MAX,
    );
    expect(
      nombre(/char_length\(prix_affiche\) between 1 and (\d+)/, "prix_affiche"),
    ).toBe(VITRINE_PRIX_AFFICHE_MAX);
  });

  it("le rang d'affichage est borné pareil des deux côtés", () => {
    const trouve = /ordre between (\d+) and (\d+)/.exec(SOURCE);
    if (!trouve) throw new Error("Borne d'ordre introuvable");
    expect(Number(trouve[1])).toBe(VITRINE_ORDRE_MIN);
    expect(Number(trouve[2])).toBe(VITRINE_ORDRE_MAX);
  });

  it("la forme du slug public est la même des deux côtés", () => {
    // ANCRÉ SUR LA TABLE, et cette ancre a été AJOUTÉE après un rouge : la
    // PREMIÈRE occurrence de cette forme dans le fichier est un commentaire
    // d'en-tête qui cite `organizations.slug` (`^[a-z0-9-]{2,48}$`) pour
    // expliquer POURQUOI le slug de vitrine est distinct. La garde comparait
    // donc les bornes de l'identité interne du locataire à celles de l'adresse
    // commerciale — deux champs que la migration existe précisément pour ne pas
    // confondre.
    const depuis = SOURCE.indexOf("create table public.vitrine_settings");
    if (depuis < 0) throw new Error("Table vitrine_settings introuvable");
    const trouve = /\^\[a-z0-9-\]\{(\d+),(\d+)\}\$/.exec(SOURCE.slice(depuis));
    if (!trouve) throw new Error("Forme du slug introuvable");
    expect(Number(trouve[1])).toBe(VITRINE_SLUG_MIN);
    expect(Number(trouve[2])).toBe(VITRINE_SLUG_MAX);
  });
});
