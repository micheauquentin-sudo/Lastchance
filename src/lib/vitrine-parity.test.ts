import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FONT_KEYS } from "./fonts";
import {
  ALLERGENES_EN,
  ALLERGENES_FR,
  BADGES_EN,
  BADGES_FR,
  VITRINE_ACCROCHE_MAX,
  VITRINE_ACTIONS,
  VITRINE_ALLERGENES,
  VITRINE_BADGES,
  VITRINE_FACETTES,
  VITRINE_CARTE_NOM_MAX,
  VITRINE_CHEMIN_IMAGE_MAX,
  VITRINE_CONTENUS_MAX,
  VITRINE_CONTENU_RANG_MAX,
  VITRINE_CONTENU_RANG_MIN,
  VITRINE_CONTENU_TITRE_MAX,
  VITRINE_CONTENU_URL_MAX,
  VITRINE_FICHE_DESCRIPTION_MAX,
  VITRINE_FICHE_NOM_MAX,
  VITRINE_HISTOIRE_MAX,
  VITRINE_HORAIRES_MAX,
  VITRINE_BLOCS,
  VITRINE_ORDRE_MAX,
  VITRINE_ORDRE_MIN,
  VITRINE_PORTES_MAX,
  VITRINE_PRIX_AFFICHE_MAX,
  VITRINE_RUBRIQUE_NOM_MAX,
  VITRINE_SLUG_MAX,
  VITRINE_SLUG_MIN,
  VITRINE_SLUGS_RESERVES,
  VITRINE_STYLES_CARTES,
  VITRINE_THEME_POLICES,
  VITRINE_ALLURE_BOOLEENS,
  VITRINE_ALLURE_BORNES,
  VITRINE_ALLURE_CHIFFRES,
  VITRINE_ALLURE_CLES,
  VITRINE_ALLURE_ENUMS,
  VITRINE_ALLURE_ENUMS_CLES,
  VITRINE_BADGE_OUVERTURE_MAX,
  VITRINE_SECTEURS,
  VITRINE_JEUX,
  VITRINE_CRENEAUX_PAR_JOUR_MAX,
  VITRINE_HEURE_PATTERN,
  VITRINE_JOURS,
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

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

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
function lire(fichier: string): string {
  return readFileSync(join(MIGRATIONS, fichier), "utf8").replace(/\r\n/g, "\n");
}

/**
 * LA DERNIÈRE MIGRATION QUI DÉFINIT CETTE FONCTION — pas la première.
 *
 * ── LE DÉFAUT QUE CETTE INDIRECTION FERME, ET IL A EXISTÉ ──
 *
 * Cette garde lisait `20261011120000_vitrine_catalogue.sql` en dur. VIT-3 y a
 * ajouté deux blocs (`reserver`, `experiences`) en RECRÉANT
 * `is_valid_vitrine_theme` dans une migration ultérieure : le fichier d'origine
 * est resté à cinq blocs, il est toujours vrai en tant qu'historique, et il ne
 * décrit PLUS ce que la base accepte. Une garde qui le lit encore compare le
 * miroir TypeScript à une définition MORTE — elle rougit sur un ajout correct,
 * et surtout elle passerait au vert sur un futur retrait.
 *
 * On vise donc la définition VIVANTE : le dernier fichier, dans l'ordre des
 * horodatages, qui DÉFINIT cette fonction. Une troisième réécriture sera suivie
 * sans que personne n'ait à revenir ici.
 *
 * ── LES DEUX ÉCRITURES SONT ACCEPTÉES, ET C'EST LE POINT (revue L13, I1) ──
 *
 * L'ancre était la chaîne littérale `create or replace function`. Or la leçon L3
 * de ce dépôt fait redéfinir une fonction en `drop function` puis
 * `create function` — sans `or replace` — dès que sa SIGNATURE change, ce que
 * `create or replace` refuse. Une migration écrite comme cela aurait été
 * INVISIBLE pour cette recherche : la garde serait silencieusement retombée sur
 * la définition précédente, MORTE, et aurait continué à comparer le miroir
 * TypeScript à un vocabulaire que la base n'applique plus. Un test vert sur une
 * source périmée, c'est-à-dire le pire des deux mondes.
 *
 * Le `or replace` est donc FACULTATIF dans le motif. Le reste reste serré — le
 * nom qualifié `public.` et la parenthèse ouvrante — pour qu'un `comment on
 * function` ou un `grant execute` ne soit jamais pris pour une définition.
 */
function motifDefinition(fonction: string): RegExp {
  return new RegExp(`create (or replace )?function public\\.${fonction}\\(`);
}

function definitionVivante(fonction: string): string {
  const ancre = motifDefinition(fonction);
  const fichiers = readdirSync(MIGRATIONS)
    .filter((nom) => nom.endsWith(".sql"))
    .sort();
  for (const nom of [...fichiers].reverse()) {
    const source = lire(nom);
    if (ancre.test(source)) return source;
  }
  throw new Error(
    `Aucune migration ne définit « ${fonction} » : la garde ne mesure plus ` +
      "rien — corriger l'ancre, jamais la contourner.",
  );
}

/** Les TABLES et leurs `check` : la migration fondatrice, jamais réécrite. */
const SOURCE = lire("20261011120000_vitrine_catalogue.sql");

/**
 * `vitrine_contenus` vit dans SA migration (VIT-4), pas dans la fondatrice.
 *
 * La table est née en 20261015120000 précisément pour ne PAS toucher aux quatre
 * tables de L10 — leur trigger `touch_updated_at` aurait périmé les traductions
 * anglaises à chaque édition d'un lien. Ses `check` se lisent donc là-bas.
 */
const SOURCE_CONTENUS = lire("20261015120000_vitrine_social_crm.sql");

/**
 * LE VALIDATEUR DU THÈME, DANS SA VERSION VIVANTE.
 *
 * Styles, blocs et polices vivent tous les trois dans `is_valid_vitrine_theme`,
 * qui a été recréé en VIT-3 : les trois se lisent donc ici et non dans `SOURCE`.
 */
const SOURCE_THEME = definitionVivante("is_valid_vitrine_theme");

/** La RPC publique, vivante elle aussi — c'est elle qui borne les portes. */
const SOURCE_ETAT_PUBLIC = definitionVivante("vitrine_public_state");

/**
 * LA MIGRATION DU SECTEUR ET DU BADGE (VIT-13).
 *
 * Lue EN DUR, contrairement au validateur de thème : ce sont deux `check` de
 * COLONNE, et une colonne ne se redéfinit pas — un `alter table … add column`
 * ne se rejoue pas ailleurs. Le jour où l'un de ces deux `check` serait
 * remplacé, ce serait par un `drop constraint` explicite, que cette garde doit
 * faire rougir plutôt que suivre en silence.
 */
const SOURCE_ALLURE = lire("20261121120000_vitrine_allure_secteur.sql");

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
function fragment(ancre: string, fin: string, source: string = SOURCE): string {
  const debut = source.indexOf(ancre);
  if (debut < 0) {
    throw new Error(
      `Ancre introuvable dans la migration Vitrine : « ${ancre} ». La garde ne ` +
        "mesure plus rien — corriger l'ancre, jamais la contourner.",
    );
  }
  const apres = source.indexOf(fin, debut + ancre.length);
  if (apres < 0) {
    throw new Error(
      `Terminateur « ${fin} » introuvable après « ${ancre} » : forme du SQL ` +
        "changée, garde à réécrire.",
    );
  }
  return source.slice(debut + ancre.length, apres);
}

/** Un nombre nommé par une regex, ou une erreur — jamais un `undefined` muet. */
function nombre(motif: RegExp, quoi: string, source: string = SOURCE): number {
  const trouve = motif.exec(source);
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
/**
 * LES DEUX VOCABULAIRES DE LA BOUSSOLE (VIT-10), lus dans LEUR migration.
 *
 * Même raison que `vitrine_contenus` : ajouter deux colonnes à la fondatrice
 * aurait demandé de la réécrire, ce que ce dépôt ne fait jamais.
 *
 * `ACTIONS_SQL` est dédoublonné : la même liste de six est écrite DEUX FOIS
 * dans la migration — une par table — et c'est voulu, un `check` ne se partage
 * pas. La garde compare donc l'ensemble, pas la suite.
 */
const SOURCE_BOUSSOLE = lire("20261024120000_vitrine_boussole.sql");
const FACETTES_SQL = motsQuotes(
  fragment("        facettes,", "]::text[]", SOURCE_BOUSSOLE),
);
const ACTIONS_SQL = motsQuotes(
  fragment("      check (action is null", "));", SOURCE_BOUSSOLE),
);

// Les trois vocabulaires du thème se lisent dans le validateur VIVANT.
const STYLES_SQL = motsQuotes(
  fragment("->> 'style_cartes') not in (", ")", SOURCE_THEME),
);
const BLOCS_SQL = motsQuotes(
  fragment("(e.value #>> '{}') not in", ")", SOURCE_THEME),
);
const POLICES_SQL = motsQuotes(
  fragment("(v_polices ->> e.key) not in", ")", SOURCE_THEME),
);
const RESERVES_SQL = motsQuotes(
  fragment(
    "return lower(btrim(p_slug)) = any (array[",
    "]);",
  ),
);

/**
 * LES HORAIRES STRUCTURÉS (VIT-31), DANS LEUR VALIDATEUR VIVANT.
 *
 * Sept jours, une borne de créneaux et une expression d'heure — trois choses
 * qui existent des DEUX côtés et qui n'ont, sans cette garde, rien qui les
 * relie. La plus traître est la troisième : deux expressions régulières qui
 * divergent d'un caractère ne se voient nulle part, elles se paient en 23514
 * dans un formulaire, c'est-à-dire par une erreur de base rendue à un
 * commerçant qui a saisi une heure parfaitement valide côté écran.
 */
const SOURCE_HORAIRES = definitionVivante("is_valid_vitrine_horaires");
const JOURS_SQL = motsQuotes(
  fragment("c_jours constant text[] := array[", "];", SOURCE_HORAIRES),
);
const HEURE_SQL = fragment(
  "c_heure constant text := '",
  "';",
  SOURCE_HORAIRES,
);

/**
 * LE FICHIER DE VIT-31, lu EN DUR — même raison que `SOURCE_ALLURE`.
 *
 * Le `grant update` et le `add column` sont des ordres qui ne se REJOUENT pas
 * ailleurs : les chercher dans une « définition vivante » n'aurait aucun sens,
 * et le jour où l'un d'eux serait révoqué, ce serait par un ordre explicite que
 * cette garde doit faire rougir plutôt que suivre en silence.
 */
const SOURCE_VIT31 = lire("20261201120000_vitrine_horaires_structures.sql");

describe("parité Vitrine — les vocabulaires du SQL et leur miroir TypeScript", () => {
  it("le parsing a effectivement trouvé quelque chose (garde de la garde)", () => {
    // ROUGE SI un extracteur devient muet : sans ces comptes, les `toEqual`
    // ci-dessous compareraient deux listes vides et passeraient.
    expect(BADGES_SQL.length).toBe(8);
    expect(ALLERGENES_SQL.length).toBe(14);
    expect(STYLES_SQL.length).toBe(3);
    // SEPT depuis VIT-3 : les cinq blocs de VIT-1a plus les deux portes.
    expect(BLOCS_SQL.length).toBe(7);
    expect(POLICES_SQL.length).toBe(7);
    expect(RESERVES_SQL.length).toBeGreaterThan(40);
    // VIT-31 : sept jours, et une expression d'heure NON VIDE — un extracteur
    // muet aurait ici rendu la chaîne vide, que `toBe` sur une regex source
    // n'aurait pas laissée passer, mais le compte le dit plus tôt et mieux.
    expect(JOURS_SQL.length).toBe(7);
    expect(HEURE_SQL.length).toBeGreaterThan(10);
  });

  it("l'ancre de la définition vivante accepte les DEUX écritures", () => {
    // Sans le `or replace` facultatif, une redéfinition écrite selon la leçon L3
    // — `drop function` puis `create function`, seul chemin quand la SIGNATURE
    // change — serait invisible : la garde retomberait en silence sur la
    // définition précédente, morte, et resterait verte sur un vocabulaire que la
    // base n'applique plus.
    const ancre = motifDefinition("is_valid_vitrine_theme");
    expect(
      ancre.test("create or replace function public.is_valid_vitrine_theme(\n"),
    ).toBe(true);
    expect(
      ancre.test("create function public.is_valid_vitrine_theme(p_theme jsonb)"),
    ).toBe(true);

    // Et elle reste serrée : ni un droit, ni un commentaire, ni une fonction
    // dont le nom COMMENCE par celui-là ne doivent passer pour une définition.
    expect(
      ancre.test("grant execute on function public.is_valid_vitrine_theme("),
    ).toBe(false);
    expect(
      ancre.test("comment on function public.is_valid_vitrine_theme(jsonb) is"),
    ).toBe(false);
    expect(
      ancre.test("create function public.is_valid_vitrine_theme_v2(p jsonb)"),
    ).toBe(false);
  });

  it("les huit badges de régime sont les mêmes des deux côtés", () => {
    expect(BADGES_SQL.slice().sort()).toEqual([...VITRINE_BADGES].sort());
  });

  it("les onze facettes de la Boussole sont les mêmes des deux côtés", () => {
    expect(FACETTES_SQL.slice().sort()).toEqual([...VITRINE_FACETTES].sort());
  });

  it("les six portes de fiche sont les mêmes des deux côtés", () => {
    expect([...new Set(ACTIONS_SQL)].sort()).toEqual(
      [...VITRINE_ACTIONS].sort(),
    );
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

  it("les sept blocs de la page d'accueil sont les mêmes des deux côtés", () => {
    expect(BLOCS_SQL.slice().sort()).toEqual([...VITRINE_BLOCS].sort());
  });

  it("la CARDINALITÉ acceptée par le SQL suit le nombre de blocs", () => {
    // `jsonb_array_length(…) > 7` est une SECONDE écriture du même nombre, dans
    // la même fonction : ajouter un huitième bloc au vocabulaire sans toucher
    // cette borne rendrait une permutation complète refusée en 23514, sur un
    // formulaire correctement rempli.
    expect(
      nombre(
        /jsonb_array_length\(p_theme -> 'ordre_blocs'\) > (\d+)/,
        "cardinalité d'ordre_blocs",
        SOURCE_THEME,
      ),
    ).toBe(VITRINE_BLOCS.length);
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

  it("la borne des portes est la même des deux côtés", () => {
    // `VITRINE_PORTES_MAX` tronque à la LECTURE ce que `c_max_portes` tronque en
    // base. Les deux doivent dire douze : un miroir plus généreux laisserait
    // passer un document futur plus gros, un miroir plus strict amputerait des
    // portes réellement ouvertes.
    expect(
      nombre(
        /c_max_portes constant integer := (\d+)/,
        "borne des portes",
        SOURCE_ETAT_PUBLIC,
      ),
    ).toBe(VITRINE_PORTES_MAX);
  });

  it("les bornes des contenus mis en avant sont les mêmes des deux côtés", () => {
    // Quatre nombres écrits DEUX fois — un `check` et un miroir — plus un
    // cinquième (`c_max_contenus`) qui borne le document. Sans cette garde, un
    // titre saisi à 81 caractères passerait l'écran et échouerait en 23514, et
    // un miroir de lecture plus généreux que la fonction laisserait grossir ce
    // que l'ISR sert à chaque visiteur.
    expect(
      nombre(
        /char_length\(pg_catalog\.btrim\(titre\)\) between 1 and (\d+)/,
        "titre d'un contenu",
        SOURCE_CONTENUS,
      ),
    ).toBe(VITRINE_CONTENU_TITRE_MAX);
    expect(
      nombre(
        /char_length\(url\) <= (\d+)/,
        "adresse d'un contenu",
        SOURCE_CONTENUS,
      ),
    ).toBe(VITRINE_CONTENU_URL_MAX);

    const rang = /rang between (\d+) and (\d+)/.exec(SOURCE_CONTENUS);
    if (!rang) throw new Error("Borne du rang d'un contenu introuvable");
    expect(Number(rang[1])).toBe(VITRINE_CONTENU_RANG_MIN);
    expect(Number(rang[2])).toBe(VITRINE_CONTENU_RANG_MAX);

    // La borne du DOCUMENT, lue dans la RPC vivante — motif `c_max_portes`.
    expect(
      nombre(
        /c_max_contenus constant integer := (\d+)/,
        "borne des contenus",
        SOURCE_ETAT_PUBLIC,
      ),
    ).toBe(VITRINE_CONTENUS_MAX);
  });

  it("le schéma des contenus est CLOS à https, des deux côtés", () => {
    // La migration écrit `url ~ '^https://[^[:space:]]+$'` ; `asLienContenu` et
    // `urlContenuSchema` en sont le miroir. Cette assertion garde la SOURCE :
    // si le `check` cessait un jour d'exiger https, le miroir de lecture
    // deviendrait la seule garde — et ce test le dirait avant la revue.
    expect(SOURCE_CONTENUS).toContain("url ~ '^https://[^[:space:]]+$'");
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
  // ── L'ALLURE ET LE SECTEUR (VIT-13) ───────────────────────────
  //
  // Vingt-cinq réglages et sept métiers, recopiés dans un `check` qui ne peut
  // pas lire un fichier TypeScript. C'est la MÊME dette que les polices, et
  // elle se ferme de la même façon : on lit le SQL vivant et on compare.
  //
  // CE QUE CETTE GARDE ATTRAPE VRAIMENT : une clé d'allure ajoutée côté TS et
  // oubliée côté SQL ne rougit NULLE PART ailleurs. L'éditeur rendrait le
  // contrôle, le commerçant le réglerait, et la base refuserait le thème
  // ENTIER sur une 23514 illisible — en emportant au passage les vingt-quatre
  // autres réglages qui, eux, étaient valides.

  it("les clés d'allure acceptées sont les mêmes des deux côtés", () => {
    const sql = motsQuotes(
      fragment(
        "select 1 from jsonb_object_keys(v_allure) k",
        ") then",
        SOURCE_THEME,
      ),
    );
    // Le fragment contient l'ancre `where k not in (…)` : les seuls mots
    // quotés y sont les clés. On compte avant de comparer — une ancre devenue
    // muette rendrait une liste vide, donc deux ensembles vides et un test vert
    // qui ne mesure rien.
    expect(sql.length).toBe(25);
    expect([...sql].sort()).toEqual([...VITRINE_ALLURE_CLES].sort());
  });

  it("chaque liste fermée d'allure a les mêmes valeurs des deux côtés", () => {
    for (const cle of VITRINE_ALLURE_ENUMS_CLES) {
      // Chaque ligne du `values` porte la clé puis son `array[...]` : on isole
      // la ligne, puis les mots quotés du tableau.
      const ligne = fragment(`('${cle}',`, "])", SOURCE_THEME);
      const valeurs = motsQuotes(ligne);
      expect(valeurs.length, `liste ${cle} vide côté SQL`).toBeGreaterThan(1);
      expect([...valeurs].sort(), `liste ${cle}`).toEqual(
        [...VITRINE_ALLURE_ENUMS[cle].valeurs].sort(),
      );
    }
  });

  it("les bornes des curseurs sont les mêmes des deux côtés", () => {
    /**
     * LE BLOC `values` DES CURSEURS, ISOLÉ AVANT TOUTE RECHERCHE PAR CLÉ.
     *
     * C'est nécessaire, et le contraire a été écrit d'abord puis corrigé sur un
     * rouge : `('motif_opacite',` apparaît DEUX fois dans la fonction — une
     * première dans la liste `e.key in (…)` qui vérifie le TYPE des sept
     * curseurs, une seconde dans le `values` qui porte leurs BORNES. Une
     * recherche à plat trouvait la première, en tirait « 'rayon' » comme borne
     * minimale, et la garde échouait pour une raison qui n'était pas la sienne.
     *
     * On borne donc la recherche au seul bloc dont le nom de colonnes dit qu'il
     * porte des bornes : `as v(cle, mini, maxi)`.
     */
    const fin = SOURCE_THEME.indexOf("as v(cle, mini, maxi)");
    if (fin < 0) {
      throw new Error(
        "Bloc des bornes introuvable (`as v(cle, mini, maxi)`) : la garde ne " +
          "mesure plus aucun curseur.",
      );
    }
    const debut = SOURCE_THEME.lastIndexOf("join (values", fin);
    if (debut < 0) throw new Error("Début du bloc des bornes introuvable");
    const bloc = SOURCE_THEME.slice(debut, fin);

    for (const cle of VITRINE_ALLURE_CHIFFRES) {
      const bornes = VITRINE_ALLURE_BORNES[cle];
      // La ligne du `values` : ('cle', mini, maxi). Les casts `::numeric` de la
      // première ligne — qui donnent son type à toute la colonne — sont
      // tolérés, sur le minimum comme sur le maximum.
      const motif = new RegExp(
        "\\('" +
          cle +
          "',\\s*(-?[0-9.]+)(?:::numeric)?,\\s*(-?[0-9.]+)(?:::numeric)?\\)",
      );
      const trouve = motif.exec(bloc);
      if (!trouve) {
        throw new Error(
          `Bornes de « ${cle} » introuvables dans is_valid_vitrine_theme : la ` +
            "garde ne mesure plus ce curseur.",
        );
      }
      expect(Number(trouve[1]), `${cle}.min`).toBe(bornes.min);
      expect(Number(trouve[2]), `${cle}.max`).toBe(bornes.max);
      // Le DÉFAUT doit être DANS les bornes, sinon la maquette elle-même
      // produirait un thème que la base refuse.
      expect(bornes.defaut).toBeGreaterThanOrEqual(bornes.min);
      expect(bornes.defaut).toBeLessThanOrEqual(bornes.max);
    }
  });

  it("les sept interrupteurs sont les mêmes des deux côtés", () => {
    const sql = motsQuotes(
      fragment(
        "where e.key in ('entete_collant'",
        ")",
        SOURCE_THEME,
      ),
    );
    // Le fragment s'arrête à la parenthèse fermante du `in (...)`, donc juste
    // après `'recherche'`. Le premier mot est consommé par l'ancre : on le
    // remet pour comparer l'ensemble complet.
    const complet = ["entete_collant", ...sql];
    expect(complet.length).toBe(7);
    expect([...complet].sort()).toEqual([...VITRINE_ALLURE_BOOLEENS].sort());
  });

  it("chaque défaut de liste appartient à sa propre liste", () => {
    // Une garde de la garde : un défaut absent de sa liste rendrait une page
    // dont le réglage ne peut pas être re-choisi dans l'éditeur, et un thème
    // que la base refuserait si jamais il était écrit.
    for (const cle of VITRINE_ALLURE_ENUMS_CLES) {
      const { valeurs, defaut } = VITRINE_ALLURE_ENUMS[cle];
      expect(valeurs as readonly string[], `défaut de ${cle}`).toContain(defaut);
    }
  });

  it("les deux jeux de la carte sont les mêmes des deux côtés", () => {
    // VIT-16. La liste est courte, et c'est précisément pourquoi elle mérite
    // une garde : deux mots se recopient sans y penser, et un troisième jeu
    // ajouté côté TypeScript ferait refuser le thème ENTIER par la base — sur
    // une 23514 que personne ne relierait à une case à cocher.
    const sql = motsQuotes(
      fragment(
        "select 1 from jsonb_object_keys(v_jeux) k",
        ") then",
        SOURCE_THEME,
      ),
    );
    expect(sql.length).toBe(2);
    expect([...sql].sort()).toEqual([...VITRINE_JEUX].sort());
  });

  it("les sept secteurs sont les mêmes des deux côtés", () => {
    const sql = motsQuotes(
      fragment("check (secteur in (", "))", SOURCE_ALLURE),
    );
    expect(sql.length).toBe(7);
    expect([...sql].sort()).toEqual([...VITRINE_SECTEURS].sort());
  });

  it("la borne du badge d'ouverture est la même des deux côtés", () => {
    // Extraction PAR ANCRES et non par regex : le `check` s'étend sur deux
    // lignes (`char_length(btrim(badge_ouverture))` puis `between 1 and 48`),
    // et une regex multiligne y aurait ajouté le piège CRLF que ce fichier
    // ferme une fois pour toutes à la lecture.
    const entre = fragment("between 1 and ", ")", SOURCE_ALLURE).trim();
    const borne = Number(entre);
    if (!Number.isFinite(borne)) {
      throw new Error(
        "Borne de badge_ouverture introuvable : la garde ne mesure plus rien.",
      );
    }
    expect(borne).toBe(VITRINE_BADGE_OUVERTURE_MAX);
  });
});

describe("parité Vitrine — les horaires structurés (VIT-31)", () => {
  it("les sept jours sont les mêmes des deux côtés, DANS LE MÊME ORDRE", () => {
    // L'ORDRE compte ici, contrairement aux autres vocabulaires de ce fichier
    // qui se comparent triés : `VITRINE_JOURS` décide de l'ordre d'affichage
    // ET du parcours « quand ouvre-t-il ? » dans `etatHoraires`. Un SQL qui
    // commencerait par dimanche ne casserait rien en base et décalerait tout
    // le calcul d'un jour.
    expect(JOURS_SQL).toEqual([...VITRINE_JOURS]);
  });

  it("l'expression de l'heure est la même des deux côtés, caractère pour caractère", () => {
    // LE DÉFAUT QUE CETTE ASSERTION FERME : deux expressions qui divergent
    // d'un caractère laissent zod accepter ce que le `check` refuse. Le
    // commerçant reçoit alors un 23514 — une erreur de BASE — pour une heure
    // que son propre formulaire vient de valider.
    expect(HEURE_SQL).toBe(VITRINE_HEURE_PATTERN.source);
  });

  it("la borne de créneaux par jour est la même des deux côtés", () => {
    expect(
      nombre(
        /c_creneaux_max constant integer := (\d+);/,
        "créneaux par jour",
        SOURCE_HORAIRES,
      ),
    ).toBe(VITRINE_CRENEAUX_PAR_JOUR_MAX);
  });

  it("la colonne `horaires` reçoit un `grant update` NOMMÉ — le piège RDV-12", () => {
    // `vitrine_settings` accorde `update` COLONNE PAR COLONNE : une colonne
    // neuve est lisible par héritage et MUETTE en écriture tant qu'aucun grant
    // ne la nomme. Ce défaut ne casse rien de visible — l'action réussit et
    // n'écrit pas — et il a été trouvé après coup trois fois de suite sur
    // `reservations`, jamais par une garde.
    //
    // La migration porte déjà sa propre assertion `has_column_privilege`, qui
    // est la vraie preuve. Celle-ci la double parce qu'elle tourne SANS base,
    // donc à chaque `npm test`, là où la première exige Docker.
    expect(SOURCE_VIT31).toContain(
      "grant update (horaires) on public.vitrine_settings to authenticated;",
    );
    expect(SOURCE_VIT31).toContain(
      "'authenticated', 'public.vitrine_settings', 'horaires', 'UPDATE'",
    );
  });

  it("la contrainte de colonne appelle bien le validateur", () => {
    // Un validateur juste mais non branché est une décoration : la colonne
    // accepterait n'importe quel jsonb, et le miroir TypeScript serait seul à
    // tenir une forme que la base ne garantit plus.
    expect(SOURCE_VIT31).toContain(
      "check (public.is_valid_vitrine_horaires(horaires))",
    );
  });
});