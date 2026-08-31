import { z } from "zod";
import {
  VITRINE_PHOTO_ALT_MAX,
  VITRINE_PHOTO_DATA_URL_MAX,
} from "@/lib/vitrine-photo";
import {
  absentSiNonRendu,
  caseACochee,
  entierRequis,
  nonRenduVaut,
  texteOptionnel,
  videSiNonRendu,
} from "@/lib/validations/champ-formulaire";
import {
  VITRINE_ACCROCHE_MAX,
  VITRINE_ALLERGENES,
  VITRINE_ALLURE_BOOLEENS,
  VITRINE_ALLURE_BORNES,
  VITRINE_ALLURE_CHIFFRES,
  VITRINE_ALLURE_ENUMS,
  VITRINE_ALLURE_ENUMS_CLES,
  VITRINE_BADGE_OUVERTURE_MAX,
  VITRINE_BADGES,
  VITRINE_ACTIONS,
  VITRINE_BLOCS,
  VITRINE_SECTEURS,
  type ChampBooleenAllure,
  type ChampChiffreAllure,
  type ChampEnumAllure,
  VITRINE_CARTE_NOM_MAX,
  VITRINE_CONTENU_RANG_MAX,
  VITRINE_CONTENU_RANG_MIN,
  VITRINE_CONTENU_TITRE_MAX,
  VITRINE_CONTENU_URL_MAX,
  VITRINE_FACETTES,
  VITRINE_FICHE_DESCRIPTION_MAX,
  VITRINE_FICHE_NOM_MAX,
  VITRINE_HISTOIRE_MAX,
  VITRINE_HORAIRES_MAX,
  VITRINE_PRIX_AFFICHE_MAX,
  VITRINE_REORDONNANCEMENT_MAX,
  VITRINE_RUBRIQUE_NOM_MAX,
  VITRINE_SLUG_MAX,
  VITRINE_SLUG_MIN,
  VITRINE_STYLES_CARTES,
  VITRINE_THEME_POLICES,
  VITRINE_TRADUCTION_CHAMPS,
  VITRINE_TRADUCTION_CIBLES,
  VITRINE_TRADUCTION_TEXTE_MAX,
} from "@/lib/vitrine";

// ────────────────────────────────────────────────────────────
// VITRINE (VIT-1a) — schémas d'entrée
//
// MIROIR DE CONFORT, PAS AUTORITÉ. La vérité est dans la migration
// 20261011120000 : forme du slug, vocabulaire réservé, vocabulaires fermés des
// badges et des allergènes, thème fermé aux deux rangs, bornes de longueur.
// Ces schémas ne servent qu'à rendre un message utile AVANT l'aller-retour —
// jamais à décider à la place de la base, qui refuse de toute façon.
//
// Bornes applicatives = CHECK SQL, à la valeur près, et la parité est gardée
// mécaniquement par `src/lib/vitrine-parity.test.ts` : les constantes viennent
// de `@/lib/vitrine`, qui est comparé au fichier de migration.
//
// LES NOMS DE CHAMPS SONT CEUX DE LA BASE (`prix_affiche`, `horaires_texte`,
// `ordre_blocs`) et ceux des `<input name=…>` : un seul jeu de noms, du `check`
// SQL jusqu'au formulaire. Voir l'en-tête de `@/lib/vitrine`.
// ────────────────────────────────────────────────────────────

const uuid = z.string().uuid("Identifiant invalide");

/**
 * Une case à cocher NATIVE : présente = cochée, absente = décochée.
 *
 * À NE PAS CONFONDRE AVEC `caseACochee`, qui lit un champ CACHÉ portant
 * littéralement « true » ou « false ». Les deux existent dans ce fichier parce
 * que les deux existent à l'écran : `active` et `disponible` sont de vraies
 * cases dans le formulaire d'édition, tandis que la bascule rapide
 * « Marquer indisponible » poste un état VOULU dans un champ caché — un bouton
 * n'a pas de case à décocher.
 *
 * `null` (champ absent du POST) et `undefined` (champ absent de l'objet) donnent
 * tous deux `false`, ce qui est ici la BONNE lecture : un navigateur n'envoie
 * pas une case décochée. La limite connue, écrite pour qu'on ne la redécouvre
 * pas : un formulaire qui NE RENDRAIT PAS la case l'enregistrerait à `false`.
 * Les deux écrans concernés la rendent toujours (ils la désactivent quand le
 * rôle ne permet pas d'éditer, et un champ désactivé n'est pas soumis — mais
 * l'action est alors refusée par `gardeEditeurVitrine`, pas enregistrée).
 */
const caseNative = nonRenduVaut(z.string(), "").transform(
  (valeur) => valeur !== "",
);

// ── L'ADRESSE PUBLIQUE ───────────────────────────────────────

/**
 * Le slug, NORMALISÉ COMME EN SQL puis validé.
 *
 * `set_vitrine_slug` détoure et met en minuscules avant de valider ; on fait
 * exactement le même geste, dans le même ordre, pour que le commerçant ne se
 * fasse pas refuser « Le-Comptoir » ici et accepter en base. Ce qui n'est PAS
 * normalisé — espaces internes, accents — reste refusé des deux côtés.
 *
 * Le vocabulaire RÉSERVÉ n'est PAS testé ici : la base le tranche et rend
 * `reserved_slug`, un état distinct que l'écran affiche. Le doubler en zod
 * aurait donné deux listes à tenir d'accord pour un message identique.
 */
const slugVitrineSchema = z
  .string()
  .transform((saisie) => saisie.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(
        VITRINE_SLUG_MIN,
        `Adresse trop courte (${VITRINE_SLUG_MIN} caractères minimum)`,
      )
      .max(
        VITRINE_SLUG_MAX,
        `Adresse trop longue (${VITRINE_SLUG_MAX} caractères max)`,
      )
      .regex(
        /^[a-z0-9-]+$/,
        "L'adresse n'accepte que des lettres minuscules, des chiffres et des tirets",
      ),
  );

export const setVitrineSlugSchema = z.object({
  slug: slugVitrineSchema,
});

// ── LA LANGUE DEMANDÉE (VIT-1b) ──────────────────────────────

/**
 * La langue d'une page publique : `"en"`, ou rien.
 *
 * ── POURQUOI UN LITTÉRAL ET NON UN `enum` DES DEUX LANGUES ──
 *
 * `"fr"` n'est pas une valeur qu'on DEMANDE : c'est l'absence de demande, et
 * c'est le segment d'URL qui n'existe pas (`/v/{slug}`, sans suffixe). Admettre
 * `"fr"` ici aurait créé une seconde façon d'écrire le défaut, donc un état de
 * plus à faire retomber au même endroit.
 *
 * ── CE QU'IL NE FAIT PAS : IL NE REFUSE RIEN ──
 *
 * Une langue inconnue (`de`, `xx`, une chaîne vide) n'est PAS une erreur de
 * page : elle vaut `undefined`, donc le français — même arbitrage que la RPC,
 * qui replie silencieusement. Lever aurait transformé une adresse bricolée en
 * page d'erreur, et refuser aurait donné au visiteur un moyen de distinguer les
 * langues configurées des autres. Les appelants utilisent donc `safeParse` et
 * lisent `success ? data : undefined`.
 */
export const vitrineLangSchema = z.literal("en").optional();

// ── LE CALQUE DE TRADUCTION (VIT-5) ──────────────────────────
//
// LES CLÉS SONT CELLES DE LA BASE (`cible_type`, `cible_id`, `champ`), comme
// partout ailleurs dans ce fichier : ce sont les `<input name=…>` du tableau de
// traduction, et le tableau reposte exactement ce qu'il a reçu.
//
// LA LANGUE N'EST PAS UN CHAMP DE FORMULAIRE. `'en'` est la seule langue
// traduisible (`check (lang in ('en'))`), l'action la pose elle-même, et le
// navigateur n'a donc rien à en dire. L'accepter en entrée aurait créé un champ
// qu'il faut valider, une valeur qu'il faut refuser, et un refus (`invalid_lang`)
// qu'aucun écran ne peut provoquer.

const CIBLE_INCONNUE = "Cet élément ne peut pas porter de traduction.";
const CHAMP_INCONNU = "Ce champ ne se traduit pas.";
const CLE_INCONNUE = "Traduction : champ de formulaire inconnu.";

/**
 * La version SOURCE, repostée telle quelle.
 *
 * ── CE QU'ELLE EST : LA VERSION VUE ──
 *
 * L'écran l'a reçue dans l'état de traduction (`cibles[].version`, l'`updated_at`
 * de la cible au moment de la lecture) et la renvoie sans y toucher. La RPC en
 * fait le `version_source` de la ligne, et la fraîcheur se lit ensuite par
 * `version_source >= cible.updated_at`. Si la source a bougé entretemps, la
 * traduction naît PÉRIMÉE — ce qui est exact.
 *
 * ── POURQUOI AUCUN REFORMATAGE, NI ICI NI DANS L'ACTION ──
 *
 * `new Date(v).toISOString()` aurait perdu la précision de la microseconde que
 * Postgres écrit dans un `timestamptz`, et deux timestamps distants d'une
 * microseconde se seraient mis à comparer égaux — c'est-à-dire qu'une traduction
 * périmée aurait pu se déclarer fraîche. La chaîne traverse INTACTE ; le
 * détourage est la seule retouche, et il ne change aucune date.
 *
 * ── CE QUE `Date.parse` GARDE, ET CE QU'IL NE GARDE PAS ──
 *
 * Il garde l'innocuité : ce qui part en paramètre d'une RPC `timestamptz` est
 * une date que JavaScript sait lire, pas une chaîne arbitraire. Il ne garde PAS
 * la véracité — le commerçant peut poster une version d'hier, et n'y gagne
 * qu'une traduction déclarée périmée. Le seul mensonge utile serait une version
 * du FUTUR, qui déclarerait fraîche une traduction qui ne l'est pas ; c'est un
 * mensonge sur SA PROPRE vitrine, sans effet hors de son locataire, et le
 * refuser aurait demandé de lire l'`updated_at` de la cible avant chaque
 * enregistrement — un aller-retour par frappe pour empêcher un commerçant de se
 * tromper lui-même.
 */
const VERSION_INVALIDE = "Rechargez la page avant d'enregistrer.";
/** Borne d'innocuité, pas de format : un `timestamptz` ISO tient en ~35 signes. */
const VERSION_SOURCE_MAX = 64;

const versionSourceSchema = z
  .string()
  .trim()
  .min(1, VERSION_INVALIDE)
  .max(VERSION_SOURCE_MAX, VERSION_INVALIDE)
  .refine((valeur) => !Number.isNaN(Date.parse(valeur)), VERSION_INVALIDE);

/**
 * Le texte traduit — MIROIR EXACT du `check`, détouré d'abord.
 *
 * `char_length(btrim(texte)) between 1 and 2000`, et la RPC détoure elle aussi
 * avant de mesurer. Le vide est REFUSÉ et non lu comme un retrait : c'est la
 * doctrine de la migration L15, qui a fait du retrait une SECONDE PORTE
 * (`deleteVitrineTraduction`) précisément pour qu'« un `p_texte` nul valant
 * suppression » ne transforme pas un bug d'appelant en effacement silencieux
 * d'un contenu publié.
 */
const texteTraduitSchema = z
  .string()
  .trim()
  .min(1, "La traduction ne peut pas être vide")
  .max(
    VITRINE_TRADUCTION_TEXTE_MAX,
    `Traduction trop longue (${VITRINE_TRADUCTION_TEXTE_MAX} caractères max)`,
  );

const cibleTraductionSchema = z.enum(VITRINE_TRADUCTION_CIBLES, {
  error: CIBLE_INCONNUE,
});
const champTraductionSchema = z.enum(VITRINE_TRADUCTION_CHAMPS, {
  error: CHAMP_INCONNU,
});

/**
 * `.strict()` SUR LES DEUX, et ce n'est pas décoratif.
 *
 * L'action extrait les clés une à une : aucune clé inventée ne peut atteindre
 * ces schémas aujourd'hui. La strictesse garde le JOUR D'APRÈS — celui où
 * quelqu'un recopie `Object.fromEntries(formData)` pour aller plus vite, et où
 * un `lang` ou un `organization_id` posté passerait en silence. C'est le même
 * raisonnement que pour l'import : un vocabulaire fermé se ferme aux deux bouts.
 */
export const setVitrineTraductionSchema = z
  .object(
    {
      cible_type: cibleTraductionSchema,
      cible_id: uuid,
      champ: champTraductionSchema,
      texte: texteTraduitSchema,
      version: versionSourceSchema,
    },
    { error: CLE_INCONNUE },
  )
  .strict();

export const deleteVitrineTraductionSchema = z
  .object(
    {
      cible_type: cibleTraductionSchema,
      cible_id: uuid,
      champ: champTraductionSchema,
    },
    { error: CLE_INCONNUE },
  )
  .strict();

// ── L'IDENTITÉ ET LE THÈME ───────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Une couleur du thème, ou rien.
 *
 * La forme courte `#abc` est REFUSÉE, comme en SQL : la couleur voyage jusqu'à
 * une variable CSS, et deux écritures de la même couleur rendraient fausse la
 * comparaison « le thème a-t-il changé » dont L11 aura besoin pour invalider
 * ses caches.
 */
const couleurSchema = videSiNonRendu(
  z.union([
    z.literal(""),
    z.string().regex(HEX, "Couleur attendue au format #rrggbb"),
  ]),
);

const policeSchema = videSiNonRendu(
  z.union([z.literal(""), z.enum(VITRINE_THEME_POLICES)]),
);

const styleCartesSchema = videSiNonRendu(
  z.union([z.literal(""), z.enum(VITRINE_STYLES_CARTES)]),
);

/**
 * L'ordre des blocs, posté en JSON dans un champ caché.
 *
 * ── POURQUOI UNE CHAÎNE JSON ET NON `formData.getAll` ──
 *
 * `getAll` rend `[]` pour un champ ABSENT exactement comme pour un champ
 * présent et vide, et il ne garantit pas l'ordre entre deux noms identiques. Or
 * ce champ N'EST QUE de l'ordre : c'est la seule information qu'il porte.
 * L'écran de réglages tient donc la liste en état et la sérialise, ce qui rend
 * l'ordre explicite et le rejeu du formulaire fidèle.
 *
 * ── CE QUI EST ÉCARTÉ PLUTÔT QUE REFUSÉ ──
 *
 * JSON illisible, valeur non tableau, blocs inconnus, doublons : tous donnent
 * une liste vide ou amputée, jamais une erreur de formulaire. La base refuserait
 * les doublons (23514), mais un commerçant ne peut pas en produire depuis une
 * interface de réordonnancement — un refus l'enverrait corriger quelque chose
 * qu'il n'a pas fait. Une liste vide vaut « ordre par défaut », que
 * `resoudreThemeVitrine` rend déjà comme tel.
 */
const ordreBlocsSchema = nonRenduVaut(z.string(), "").transform((saisie) => {
  if (!saisie.trim()) return [];
  let brut: unknown;
  try {
    brut = JSON.parse(saisie);
  } catch {
    return [];
  }
  if (!Array.isArray(brut)) return [];
  const vus = new Set<string>();
  const sortie: (typeof VITRINE_BLOCS)[number][] = [];
  for (const valeur of brut) {
    if (typeof valeur !== "string" || vus.has(valeur)) continue;
    if (!(VITRINE_BLOCS as readonly string[]).includes(valeur)) continue;
    vus.add(valeur);
    sortie.push(valeur as (typeof VITRINE_BLOCS)[number]);
  }
  return sortie;
});

// ── LE SECTEUR ET L'ALLURE (VIT-13) ──────────────────────────

const secteurSchema = videSiNonRendu(
  z.union([z.literal(""), z.enum(VITRINE_SECTEURS)]),
);

/**
 * UN CURSEUR — un nombre dans ses bornes, ou rien.
 *
 * ── HORS BORNES = ÉCARTÉ, PAS REFUSÉ ──
 *
 * Même arbitrage que `ordre_blocs`, et pour la même raison : un `<input
 * type="range" min max>` ne PEUT PAS produire une valeur hors bornes depuis
 * l'écran. Une valeur qui arrive quand même vient d'un formulaire trafiqué ou
 * d'un champ qu'on aura oublié de mettre à jour après un resserrement — et dans
 * les deux cas, renvoyer le commerçant corriger un curseur qu'il n'a pas bougé
 * est plus désorientant que de retomber sur le défaut de la maquette.
 *
 * `Number` et non `parseFloat` : `parseFloat("13abc")` rend 13 sans broncher,
 * là où `Number("13abc")` rend `NaN`, que `Number.isFinite` écarte. Un curseur
 * n'envoie jamais « 13abc » — mais c'est exactement le genre de valeur qu'un
 * formulaire reconstruit à la main enverrait.
 */
function curseurSchema(cle: ChampChiffreAllure) {
  const { min, max } = VITRINE_ALLURE_BORNES[cle];
  return nonRenduVaut(z.string(), "").transform((saisie) => {
    const t = saisie.trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < min || n > max) return null;
    return n;
  });
}

/** Une liste fermée d'allure — vide quand le champ n'est pas rendu. */
function listeAllureSchema(cle: ChampEnumAllure) {
  return videSiNonRendu(
    z.union([z.literal(""), z.enum(VITRINE_ALLURE_ENUMS[cle].valeurs)]),
  );
}

/**
 * LES VINGT-CINQ CHAMPS D'ALLURE, construits depuis le vocabulaire.
 *
 * Écrits à la main, ils auraient été vingt-cinq lignes à tenir d'accord avec
 * `@/lib/vitrine` — et la première à diverger n'aurait rien fait rougir : un
 * champ absent du schéma est simplement ignoré, donc un réglage qui ne
 * s'enregistre pas, sans erreur nulle part. Les dériver de la même table que
 * le validateur SQL rend l'oubli impossible.
 */
const champsAllure = {
  ...Object.fromEntries(
    VITRINE_ALLURE_ENUMS_CLES.map((cle) => [cle, listeAllureSchema(cle)]),
  ),
  ...Object.fromEntries(
    VITRINE_ALLURE_CHIFFRES.map((cle) => [cle, curseurSchema(cle)]),
  ),
  ...Object.fromEntries(
    VITRINE_ALLURE_BOOLEENS.map((cle) => [cle, caseNative]),
  ),
} as {
  [K in ChampEnumAllure]: ReturnType<typeof listeAllureSchema>;
} & {
  [K in ChampChiffreAllure]: ReturnType<typeof curseurSchema>;
} & {
  [K in ChampBooleenAllure]: typeof caseNative;
};

export const saveVitrineSettingsSchema = z.object({
  ...champsAllure,
  /**
   * LE TÉMOIN DE PRÉSENCE DE LA SECTION « ALLURE ».
   *
   * ── SANS LUI, SEPT RÉGLAGES S'ÉTEIGNENT TOUT SEULS ──
   *
   * Les sept interrupteurs valent `true` par défaut, et une case NON COCHÉE ne
   * s'envoie pas — exactement comme une case NON RENDUE. Un formulaire qui ne
   * porterait pas la section les lirait donc tous à `false` et écrirait sept
   * refus que personne n'a formulés : en-tête figé, capitales éteintes,
   * compteurs, monogramme, favoris et recherche retirés d'un seul
   * enregistrement, sans message et sans trace.
   *
   * Ce champ caché est posé PAR la section elle-même. Absent, `composerAllure`
   * n'écrit rien du tout et la vitrine garde son allure. C'est la seule façon
   * de distinguer « le commerçant a décoché » de « l'écran n'a pas la
   * section », que `formData.get` rend autrement identiques.
   */
  allure_rendue: caseNative,
  secteur: secteurSchema,
  badge_ouverture: texteOptionnel(
    z
      .string()
      .trim()
      .max(
        VITRINE_BADGE_OUVERTURE_MAX,
        `Badge trop long (${VITRINE_BADGE_OUVERTURE_MAX} caractères max)`,
      ),
  ),
  accroche: texteOptionnel(
    z
      .string()
      .trim()
      .max(
        VITRINE_ACCROCHE_MAX,
        `Accroche trop longue (${VITRINE_ACCROCHE_MAX} caractères max)`,
      ),
  ),
  histoire: texteOptionnel(
    z
      .string()
      .trim()
      .max(
        VITRINE_HISTOIRE_MAX,
        `Histoire trop longue (${VITRINE_HISTOIRE_MAX} caractères max)`,
      ),
  ),
  horaires_texte: texteOptionnel(
    z
      .string()
      .trim()
      .max(
        VITRINE_HORAIRES_MAX,
        `Horaires trop longs (${VITRINE_HORAIRES_MAX} caractères max)`,
      ),
  ),
  couleur_primary: couleurSchema,
  couleur_secondary: couleurSchema,
  police_heading: policeSchema,
  police_body: policeSchema,
  style_cartes: styleCartesSchema,
  ordre_blocs: ordreBlocsSchema,
});

// ── LES CONTENUS MIS EN AVANT (VIT-4) ────────────────────────

/**
 * LA PLACE, 1 à 3 — et le même schéma sert à poser comme à retirer.
 *
 * C'est la CLÉ de la ligne côté commerçant : `vitrine_contenus` a bien un `id`,
 * mais il ne sort d'aucune lecture (la RPC publique rend `{titre, url, rang}`,
 * et l'écran de réglages travaille par place). Les deux actions écrivent donc
 * par `(organisation, rang)`, et un rang hors bornes doit être refusé ICI :
 * envoyé tel quel, il ne toucherait aucune ligne et la suppression rendrait un
 * succès qui n'a rien supprimé.
 *
 * UN SEUL MESSAGE POUR LES QUATRE REFUS (absent, non numérique, hors bornes,
 * décimal) : ils désignent tous le même écart, et l'écran n'offre que trois
 * boutons — un commerçant ne peut produire ces valeurs qu'en forgeant le POST.
 */
const PLACE_INVALIDE = "La place du contenu doit être 1, 2 ou 3.";

const rangContenuSchema = entierRequis({
  absent: PLACE_INVALIDE,
  nombre: PLACE_INVALIDE,
  entier: PLACE_INVALIDE,
  min: [VITRINE_CONTENU_RANG_MIN, PLACE_INVALIDE],
  max: [VITRINE_CONTENU_RANG_MAX, PLACE_INVALIDE],
});

/**
 * L'adresse d'un contenu — MIROIR EXACT du `check` SQL, détourée d'abord.
 *
 * `url ~ '^https://[^[:space:]]+$'` et `char_length(url) <= 300`. Le détourage
 * précède la mesure pour la raison de `prix_affiche` : une adresse collée avec
 * son espace de fin serait acceptée ici et refusée en base sur un 23514 que
 * l'écran ne sait pas expliquer.
 *
 * AUCUNE LISTE BLANCHE D'HÔTES, contrairement aux trois liens sociaux
 * d'`organizations` : c'est une adresse arbitraire, et le sens de la
 * fonctionnalité est justement de montrer autre chose qu'un réseau social. Ce
 * qui garde la page publique est la revalidation À LA LECTURE
 * (`asLienContenu`), parce qu'une valeur écrite avant qu'une garde n'existe
 * traverse toutes les gardes posées après elle.
 */
const urlContenuSchema = z
  .string()
  .trim()
  .min(1, "L'adresse du contenu est requise")
  .max(
    VITRINE_CONTENU_URL_MAX,
    `Adresse trop longue (${VITRINE_CONTENU_URL_MAX} caractères max)`,
  )
  .regex(
    /^https:\/\/\S+$/,
    "L'adresse doit commencer par https:// et ne contenir aucun espace",
  );

const titreContenuSchema = z
  .string()
  .trim()
  .min(1, "Le titre du contenu est requis")
  .max(
    VITRINE_CONTENU_TITRE_MAX,
    `Titre trop long (${VITRINE_CONTENU_TITRE_MAX} caractères max)`,
  );

export const setVitrineContenuSchema = z.object({
  rang: rangContenuSchema,
  titre: titreContenuSchema,
  url: urlContenuSchema,
});

export const deleteVitrineContenuSchema = z.object({ rang: rangContenuSchema });

// ── LES CARTES ───────────────────────────────────────────────

const nomCarteSchema = z
  .string()
  .trim()
  .min(1, "Le nom de la carte est requis")
  .max(
    VITRINE_CARTE_NOM_MAX,
    `Nom trop long (${VITRINE_CARTE_NOM_MAX} caractères max)`,
  );

/**
 * La porte d'une fiche ou d'une rubrique : une valeur de la liste, ou RIEN.
 *
 * Le `<select>` poste la chaîne vide pour « aucune » — un navigateur n'a pas
 * d'autre façon de dire « pas de choix » dans une liste déroulante. La traduire
 * en `null` ICI, plutôt que dans l'action, garde la règle avec le reste du
 * contrat d'entrée.
 */
const actionFermee = nonRenduVaut(z.string(), "")
  .transform((valeur) => valeur.trim())
  .pipe(
    z
      .union([z.literal(""), z.enum(VITRINE_ACTIONS)])
      .transform((valeur) => (valeur === "" ? null : valeur)),
  );

export const createVitrineCarteSchema = z.object({ nom: nomCarteSchema });

export const updateVitrineCarteSchema = z.object({
  id: uuid,
  nom: nomCarteSchema,
  active: caseNative,
});

export const deleteVitrineCarteSchema = z.object({ id: uuid });

// ── LES RUBRIQUES ────────────────────────────────────────────

const nomRubriqueSchema = z
  .string()
  .trim()
  .min(1, "Le nom de la rubrique est requis")
  .max(
    VITRINE_RUBRIQUE_NOM_MAX,
    `Nom trop long (${VITRINE_RUBRIQUE_NOM_MAX} caractères max)`,
  );

export const createVitrineRubriqueSchema = z.object({
  menu_id: uuid,
  nom: nomRubriqueSchema,
});

export const updateVitrineRubriqueSchema = z.object({
  id: uuid,
  nom: nomRubriqueSchema,
  action: actionFermee,
});

export const deleteVitrineRubriqueSchema = z.object({ id: uuid });

// ── LES FICHES ───────────────────────────────────────────────

/**
 * Un vocabulaire FERMÉ posté en cases à cocher (`getAll`, jamais `get`).
 *
 * `getAll` rend `[]` pour un champ absent, et ici c'est la BONNE lecture :
 * aucune case cochée = aucun badge. Contrairement à `ordre_blocs`, les deux
 * états disent la même chose.
 *
 * Les doublons sont ÉCARTÉS et non refusés — la base les refuse (le validateur
 * `is_valid_vitrine_vocabulaire` compte les distincts), mais un formulaire à
 * cases n'en produit pas, et un refus enverrait le commerçant corriger un défaut
 * qui n'est pas le sien.
 */
function vocabulaireFerme<T extends string>(
  vocabulaire: readonly [T, ...T[]],
) {
  return nonRenduVaut(z.array(z.enum(vocabulaire)), [] as T[]).transform(
    (valeurs) => [...new Set(valeurs)],
  );
}

const nomFicheSchema = z
  .string()
  .trim()
  .min(1, "Le nom de la fiche est requis")
  .max(
    VITRINE_FICHE_NOM_MAX,
    `Nom trop long (${VITRINE_FICHE_NOM_MAX} caractères max)`,
  );

export const createVitrineFicheSchema = z.object({
  categorie_id: uuid,
  nom: nomFicheSchema,
});

/**
 * Le prix AFFICHÉ : du texte court, détouré, jamais un décimal.
 *
 * La carte réelle d'un restaurant écrit « 12 € », « à partir de 8 € », « selon
 * arrivage ». Le `check` SQL exige `prix_affiche = btrim(prix_affiche)` et
 * 1..40 : on détoure donc AVANT de mesurer, sinon un prix saisi avec un espace
 * de trop serait accepté ici et refusé en base sur un 23514 illisible.
 */
export const updateVitrineFicheSchema = z.object({
  id: uuid,
  nom: nomFicheSchema,
  description: texteOptionnel(
    z
      .string()
      .trim()
      .max(
        VITRINE_FICHE_DESCRIPTION_MAX,
        `Description trop longue (${VITRINE_FICHE_DESCRIPTION_MAX} caractères max)`,
      ),
  ),
  prix_affiche: texteOptionnel(
    z
      .string()
      .trim()
      .max(
        VITRINE_PRIX_AFFICHE_MAX,
        `Prix trop long (${VITRINE_PRIX_AFFICHE_MAX} caractères max)`,
      ),
  ),
  badges: vocabulaireFerme(VITRINE_BADGES),
  allergenes: vocabulaireFerme(VITRINE_ALLERGENES),
  facettes: vocabulaireFerme(VITRINE_FACETTES),
  action: actionFermee,
  disponible: caseNative,
});

export const deleteVitrineFicheSchema = z.object({ id: uuid });

/* ────────────────────────────────────────────────────────────
   Les photos (VIT-7)
   ──────────────────────────────────────────────────────────── */

/**
 * L'image arrive en data URL, pas en fichier.
 *
 * Motif des affiches (`poster-storage.ts`) : l'écran réduit et ré-encode avant
 * d'envoyer, ce qui garde le corps de l'action sous sa limite et évite de faire
 * transiter quatre méga-octets pour en stocker deux cents kilos. Le serveur
 * ré-encode DE TOUTE FAÇON — rien de ce que le navigateur affirme n'est cru.
 *
 * PAS DE REGEX SUR LE CONTENU ICI : une expression rationnelle appliquée à
 * neuf cent mille caractères de base64 coûterait plus cher que le décodage
 * lui-même, et `sharp` refuse de toute manière ce qui n'est pas une image. On
 * ne vérifie que ce qui est bon marché : le préfixe et la longueur.
 */
const imageDataUrl = z
  .string()
  .min(32, "Image manquante")
  .max(
    VITRINE_PHOTO_DATA_URL_MAX,
    "Image trop lourde — réessayez avec une photo plus légère",
  )
  .refine((valeur) => valeur.startsWith("data:image/"), "Image invalide");

const altSchema = texteOptionnel(
  z
    .string()
    .trim()
    .max(
      VITRINE_PHOTO_ALT_MAX,
      `Description trop longue (${VITRINE_PHOTO_ALT_MAX} caractères max)`,
    ),
);

/**
 * DEUX CIBLES, UNE UNION DISCRIMINÉE — et non un `fiche_id` facultatif.
 *
 * Avec un champ optionnel, « couverture avec un `fiche_id` » et « fiche sans
 * `fiche_id` » auraient été des états représentables, à refuser à la main dans
 * l'action. L'union les rend inexprimables.
 */
export const setVitrinePhotoSchema = z.discriminatedUnion("cible", [
  z.object({
    cible: z.literal("fiche"),
    fiche_id: uuid,
    image: imageDataUrl,
    alt: altSchema,
  }),
  z.object({
    cible: z.literal("couverture"),
    image: imageDataUrl,
    alt: altSchema,
  }),
]);

/**
 * VIT-12 — l'accord d'indexation, une case et rien d'autre.
 *
 * `caseACochee` et non `caseNative` : le geste est un BOUTON qui poste un état
 * voulu dans un champ caché, pas une case qu'on décoche dans un formulaire.
 * Un navigateur n'envoie pas une case décochée — l'état « je retire mon
 * accord » n'aurait alors jamais atteint le serveur.
 */
export const setVitrineIndexationSchema = z.object({
  indexable: caseACochee,
});

export const deleteVitrinePhotoSchema = z.discriminatedUnion("cible", [
  z.object({ cible: z.literal("fiche"), fiche_id: uuid }),
  z.object({ cible: z.literal("couverture") }),
]);

/**
 * La bascule rapide du service : `disponible` est un champ CACHÉ portant l'état
 * VOULU (« true » / « false »), pas une case. Un bouton n'a rien à décocher, et
 * poster l'état voulu plutôt que l'état courant rend le geste idempotent — deux
 * clics sur « Marquer indisponible » laissent le plat indisponible.
 */
export const toggleVitrineFicheDisponibiliteSchema = z.object({
  id: uuid,
  disponible: caseACochee,
});

// ── LE RÉORDONNANCEMENT ──────────────────────────────────────

/**
 * Le rang de N frères, posté EN UNE FOIS dans un champ `order` sérialisé.
 *
 * ── LE RANG N'EST PAS TRANSPORTÉ : C'EST L'INDEX ──
 *
 * Le glisser-déposer (ici, les flèches ↑↓) connaît la liste ORDONNÉE ; poster
 * des rangs explicites aurait laissé arriver des listes incohérentes — deux
 * fois le rang 3 — qu'il aurait fallu réparer côté serveur.
 *
 * ── LA BORNE HAUTE N'EST PAS `VITRINE_ORDRE_MAX` ──
 *
 * Ce que borne cette liste, ce n'est pas le rang atteignable (999) mais le
 * nombre d'allers-retours qu'un seul clic déclenche : voir
 * `VITRINE_REORDONNANCEMENT_MAX`.
 */
const ordreIdsSchema = z
  .string()
  .transform((saisie, ctx) => {
    let brut: unknown;
    try {
      brut = JSON.parse(saisie);
    } catch {
      ctx.addIssue({ code: "custom", message: "Ordre illisible" });
      return z.NEVER;
    }
    if (!Array.isArray(brut)) {
      ctx.addIssue({ code: "custom", message: "Ordre illisible" });
      return z.NEVER;
    }
    return brut;
  })
  .pipe(
    z
      .array(uuid)
      .min(1, "Rien à réordonner")
      .max(
        VITRINE_REORDONNANCEMENT_MAX,
        `Trop d'éléments à réordonner en une fois (${VITRINE_REORDONNANCEMENT_MAX} max)`,
      ),
  );

export const reorderVitrineCartesSchema = z.object({ order: ordreIdsSchema });

/**
 * Le PARENT est posté avec la liste, et il n'est pas décoratif : il permet de
 * borner l'écriture aux frères d'une même carte (ou rubrique) en plus du filtre
 * d'organisation. Sans lui, un identifiant glissé dans la liste pourrait
 * réordonner une ligne d'une AUTRE carte du même commerce — pas une fuite
 * inter-locataire, mais un désordre que personne n'aurait demandé.
 */
export const reorderVitrineRubriquesSchema = z.object({
  menu_id: uuid,
  order: ordreIdsSchema,
});

export const reorderVitrineFichesSchema = z.object({
  categorie_id: uuid,
  order: ordreIdsSchema,
});

// ── L'IMPORT D'UNE CARTE EN LOT (VIT-2) ──────────────────────

/**
 * Les deux bornes de CARDINALITÉ de l'import.
 *
 * ── POURQUOI ELLES NE VIENNENT PAS DE `@/lib/vitrine` ──
 *
 * Toutes les autres bornes de ce fichier bornent une COLONNE : elles sont dans
 * les `check` de 20261011120000, recopiées dans `@/lib/vitrine`, et
 * `vitrine-parity.test.ts` compare les deux. Celles-ci ne portent sur AUCUNE
 * ligne — elles bornent un GESTE — et n'existent qu'en deux constantes du corps
 * de `import_vitrine_carte` (20261013120000), que ce test-là ne lit pas. Elles
 * vivent donc ici, et leur parité est gardée par `vitrine.test.ts`, qui lit la
 * migration d'import comme la garde de parité lit la sienne.
 *
 * ── POURQUOI LES REFUSER ICI ALORS QUE LA RPC LES REFUSE DÉJÀ ──
 *
 * C'est exactement le cas où l'aller-retour est le plus cher : un payload de dix
 * mille fiches doit voyager en entier pour s'entendre dire qu'il est trop gros.
 * La base reste juge — elle refusera de toute façon — mais elle n'a pas à le
 * faire pour un fichier qu'on peut mesurer avant de l'envoyer.
 */
export const VITRINE_IMPORT_RUBRIQUES_MAX = 12;
export const VITRINE_IMPORT_FICHES_MAX = 120;

/** Ce que dit un refus de FORME, aux trois rangs : jamais le contenu du fichier. */
const IMPORT_ILLISIBLE = "Import illisible";

/**
 * Un vocabulaire fermé venu d'un FICHIER, et non de cases à cocher.
 *
 * Même arbitrage que `vocabulaireFerme` sur les doublons — ils sont ÉCARTÉS,
 * parce que `is_valid_vitrine_vocabulaire` les refuserait en 23514 pour une
 * répétition qui n'enlève ni n'ajoute rien à la fiche. Un mot INCONNU, lui, est
 * refusé : ici il ne peut venir que de la main qui a écrit le fichier, et le
 * taire produirait une fiche sans le badge que le commerçant croit avoir posé.
 */
function vocabulaireImporte<T extends string>(
  vocabulaire: readonly [T, ...T[]],
  message: string,
) {
  // `.nullish()` et non `.optional()` : la règle A du dépôt — un champ qui
  // tolère l'absence rend la MÊME chose pour `null`, parce qu'un producteur
  // JSON écrit `"badges": null` aussi naturellement qu'il omet la clé.
  return z
    .array(z.enum(vocabulaire, { error: message }), { error: message })
    .nullish()
    .transform((valeurs) =>
      valeurs == null ? undefined : [...new Set(valeurs)],
    );
}

/**
 * Un nom du fichier — MÊMES BORNES que le formulaire, autres MESSAGES.
 *
 * Les bornes viennent des mêmes constantes, donc du même `check` : c'est le seul
 * point où la divergence coûterait quelque chose. Les messages, eux, sont
 * réécrits parce qu'ils ne s'adressent pas au même geste — « Le nom de la fiche
 * est requis » désigne LE champ qu'on a sous les yeux dans un formulaire, et ne
 * désigne rien du tout dans un fichier de cent vingt lignes.
 *
 * Le paramètre `error` couvre le mauvais TYPE (`"nom": 42`), que les schémas du
 * formulaire laissent au message anglais par défaut de Zod : là-bas un `<input>`
 * ne peut pas poster autre chose qu'une chaîne, ici un fichier écrit à la main
 * le peut.
 */
function nomImporte(max: number, requis: string, tropLong: string) {
  return z.string({ error: requis }).trim().min(1, requis).max(max, tropLong);
}

/**
 * Un champ facultatif du fichier : absent, `null`, ou du texte détouré.
 *
 * Les trois disent « rien à afficher », exactement comme en SQL — la RPC écrit
 * `nullif(btrim(…), '')` et fait retomber les trois sur `null`. Le détourage est
 * fait ICI aussi parce que le `check` de `prix_affiche` exige une valeur déjà
 * détourée : un prix copié d'un tableur avec son espace de fin ferait échouer
 * TOUT l'import sur un 23514 que l'écran ne sait pas expliquer.
 */
function texteImporte(max: number, typeAttendu: string, tropLong: string) {
  // Le `?? undefined` final aligne `null` sur l'absence (règle A) : les deux
  // disparaissent du JSON envoyé, et la RPC fait de toute façon retomber les
  // trois formes de « rien » sur `null` en base.
  return z
    .string({ error: typeAttendu })
    .trim()
    .max(max, tropLong)
    .nullish()
    .transform((valeur) => valeur ?? undefined);
}

/**
 * LE MIROIR DU CONTRAT FERMÉ, aux trois rangs.
 *
 * ── `.strict()` N'EST PAS UN CONFORT ICI ──
 *
 * La RPC refuse une clé inconnue à chacun des trois rangs, et son en-tête dit
 * pourquoi en toutes lettres : accepter `"prix"` au lieu de `"prix_affiche"` en
 * le laissant tomber produirait une carte de soixante plats SANS AUCUN PRIX et
 * sans le moindre message — le seul mode d'échec qui ressemble à un succès. Un
 * `z.object` ordinaire DÉPOUILLE les clés inconnues : il aurait fabriqué ce
 * mode d'échec côté application, sur le chemin même que la base ferme.
 *
 * `photo_path` et `disponible` sont donc REFUSÉS comme n'importe quelle autre
 * clé inventée, et c'est voulu : la photo suppose un fichier déjà déposé dans
 * un bucket qu'un lot jsonb ne peut pas porter, la disponibilité naît à `true`
 * et se règle d'un geste sur l'écran prévu pour ça.
 *
 * ── LE MESSAGE DE REFUS NE RECOPIE PAS LE FICHIER ──
 *
 * Zod nomme la clé fautive dans son message par défaut. Ce message part vers un
 * écran et un journal ; le paramètre `error` de chaque rang le remplace par le
 * nôtre, borné, pour la raison qui interdit à la RPC de relayer du texte libre
 * du payload.
 */
const ficheImporteeSchema = z
  .object(
    {
      nom: nomImporte(
        VITRINE_FICHE_NOM_MAX,
        "Une fiche du fichier n'a pas de nom",
        `Nom de fiche trop long (${VITRINE_FICHE_NOM_MAX} caractères max)`,
      ),
      description: texteImporte(
        VITRINE_FICHE_DESCRIPTION_MAX,
        "La description d'une fiche doit être du texte",
        `Description trop longue (${VITRINE_FICHE_DESCRIPTION_MAX} caractères max)`,
      ),
      prix_affiche: texteImporte(
        VITRINE_PRIX_AFFICHE_MAX,
        "Le prix d'une fiche doit être du texte",
        `Prix trop long (${VITRINE_PRIX_AFFICHE_MAX} caractères max)`,
      ),
      badges: vocabulaireImporte(
        VITRINE_BADGES,
        "Badge inconnu dans une fiche du fichier",
      ),
      allergenes: vocabulaireImporte(
        VITRINE_ALLERGENES,
        "Allergène inconnu dans une fiche du fichier",
      ),
    },
    { error: "Une fiche du fichier porte un champ inconnu" },
  )
  .strict();

const rubriqueImporteeSchema = z
  .object(
    {
      nom: nomImporte(
        VITRINE_RUBRIQUE_NOM_MAX,
        "Une rubrique du fichier n'a pas de nom",
        `Nom de rubrique trop long (${VITRINE_RUBRIQUE_NOM_MAX} caractères max)`,
      ),
      fiches: absentSiNonRendu(
        z.array(ficheImporteeSchema, {
          error: "Les fiches d'une rubrique doivent former une liste",
        }),
      ),
    },
    { error: "Une rubrique du fichier porte un champ inconnu" },
  )
  .strict();

/**
 * La carte entière — et les deux refus qu'aucun rang ne peut porter seul.
 *
 * LE TOTAL DE FICHES est compté SUR LE LOT, pas par rubrique : douze rubriques
 * de cent fiches passeraient douze bornes locales et resteraient un import de
 * mille deux cents lignes. C'est le total qui coûte, et c'est lui que la RPC
 * borne.
 *
 * LES RUBRIQUES HOMONYMES sont refusées ici alors que la RPC les refuse aussi,
 * et ce doublon-là est le seul du fichier à être délibéré : c'est le refus dont
 * le message vaut le plus, puisqu'il désigne une faute que le commerçant peut
 * corriger dans son fichier en dix secondes. Le laisser partir aurait rendu un
 * 22023 indistinct des refus de forme — l'action ne peut pas les distinguer sans
 * relayer le texte de la base, ce qu'elle s'interdit.
 */
const carteImporteeSchema = z
  .object(
    {
      nom: nomImporte(
        VITRINE_CARTE_NOM_MAX,
        "Le fichier n'indique pas le nom de la carte",
        `Nom de carte trop long (${VITRINE_CARTE_NOM_MAX} caractères max)`,
      ),
      rubriques: nonRenduVaut(
        z
          .array(rubriqueImporteeSchema, {
            error: "Les rubriques du fichier doivent former une liste",
          })
          .max(
            VITRINE_IMPORT_RUBRIQUES_MAX,
            `Trop de rubriques dans un seul import (${VITRINE_IMPORT_RUBRIQUES_MAX} max)`,
          ),
        [],
      ),
    },
    { error: "Le fichier porte un champ inconnu" },
  )
  .strict()
  .superRefine((carte, ctx) => {
    const vus = new Set<string>();
    for (const rubrique of carte.rubriques) {
      if (vus.has(rubrique.nom)) {
        ctx.addIssue({
          code: "custom",
          message: "Deux rubriques du fichier portent le même nom",
        });
        break;
      }
      vus.add(rubrique.nom);
    }

    const total = carte.rubriques.reduce(
      (compte, rubrique) => compte + (rubrique.fiches?.length ?? 0),
      0,
    );
    if (total > VITRINE_IMPORT_FICHES_MAX) {
      ctx.addIssue({
        code: "custom",
        message: `Trop de fiches dans un seul import (${VITRINE_IMPORT_FICHES_MAX} max)`,
      });
    }
  });

/**
 * L'entrée de l'action : un champ CACHÉ portant le payload en JSON.
 *
 * Motif exact d'`ordreIdsSchema` — `JSON.parse` dans un `transform` qui rend une
 * ISSUE, jamais une exception : une action serveur qui lève sur un champ posté
 * rend une erreur de rendu là où le commerçant attend une phrase. L'écran tient
 * la carte en état (collage, fichier lu côté client) et la sérialise ; c'est du
 * JSON parce que le lot est un ARBRE, ce qu'aucun jeu de `name=` plat ne porte.
 */
/**
 * Borne de la CHAÎNE brute, avant tout `JSON.parse` : le pire cas légitime —
 * 133 lignes aux longueurs maximales, vocabulaires compris — tient sous 96 Ko ;
 * 128 Ko laissent la marge de l'échappement JSON. Sans elle, la seule borne
 * était le `bodySizeLimit` implicite de Next (1 Mo) : ~1 s de parse Zod par
 * envoi refusé APRÈS coup, et une borne de framework qui monterait en silence
 * le jour où quelqu'un la relève pour un upload (revue L12, M2).
 */
const IMPORT_CHAINE_MAX = 131_072;

export const importVitrineCarteSchema = z.object({
  import: z
    .string({ error: IMPORT_ILLISIBLE })
    .max(IMPORT_CHAINE_MAX, { error: IMPORT_ILLISIBLE })
    .transform((saisie, ctx) => {
      let brut: unknown;
      try {
        brut = JSON.parse(saisie);
      } catch {
        ctx.addIssue({ code: "custom", message: IMPORT_ILLISIBLE });
        return z.NEVER;
      }
      return brut;
    })
    .pipe(carteImporteeSchema),
});

/** Le payload tel qu'il part à `import_vitrine_carte` : détouré, dédoublonné. */
export type CarteImportee = z.infer<typeof carteImporteeSchema>;

// ── LA PUBLICATION ───────────────────────────────────────────
//
// AUCUN SCHÉMA : `publishVitrine` et `unpublishVitrine` n'ont pas d'entrée. Le
// sens du geste est dans le NOM de l'action, pas dans un champ `publier` que le
// navigateur pourrait poster à l'envers — c'est la même raison qui fait exister
// deux boutons plutôt qu'une bascule postée.
