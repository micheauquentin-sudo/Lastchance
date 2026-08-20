import { z } from "zod";
import {
  caseACochee,
  nonRenduVaut,
  texteOptionnel,
  videSiNonRendu,
} from "@/lib/validations/champ-formulaire";
import {
  VITRINE_ACCROCHE_MAX,
  VITRINE_ALLERGENES,
  VITRINE_BADGES,
  VITRINE_BLOCS,
  VITRINE_CARTE_NOM_MAX,
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

export const saveVitrineSettingsSchema = z.object({
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

// ── LES CARTES ───────────────────────────────────────────────

const nomCarteSchema = z
  .string()
  .trim()
  .min(1, "Le nom de la carte est requis")
  .max(
    VITRINE_CARTE_NOM_MAX,
    `Nom trop long (${VITRINE_CARTE_NOM_MAX} caractères max)`,
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
  disponible: caseNative,
});

export const deleteVitrineFicheSchema = z.object({ id: uuid });

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

// ── LA PUBLICATION ───────────────────────────────────────────
//
// AUCUN SCHÉMA : `publishVitrine` et `unpublishVitrine` n'ont pas d'entrée. Le
// sens du geste est dans le NOM de l'action, pas dans un champ `publier` que le
// navigateur pourrait poster à l'envers — c'est la même raison qui fait exister
// deux boutons plutôt qu'une bascule postée.
