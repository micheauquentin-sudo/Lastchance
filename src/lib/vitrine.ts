import type { FontKey } from "@/lib/fonts";
import { estLienInvitationSur } from "@/lib/validations/organizations";

/**
 * VITRINE — le vocabulaire, les bornes et la lecture du catalogue QR (VIT-1a).
 *
 * ── CE FICHIER EST UN MIROIR, PAS UNE AUTORITÉ ──
 *
 * L'autorité est la migration `20261011120000_vitrine_catalogue.sql` : ses
 * `check` refusent ce que ce fichier accepterait par erreur, et sa RPC publique
 * décide seule de ce qui sort. Ce qui vit ici sert à rendre un message utile
 * AVANT l'aller-retour, et à donner un libellé français à des slugs que la base
 * ne connaît que comme des chaînes.
 *
 * Deux listes recopiées à la main, c'est deux listes qui divergent : la parité
 * est donc GARDÉE MÉCANIQUEMENT par `vitrine-parity.test.ts`, qui LIT la
 * migration et compare. Ajouter un badge en base sans passer ici fait rougir la
 * CI, et l'inverse aussi.
 *
 * ── LES VUES GARDENT LES NOMS DE LA BASE ──
 *
 * `prix_affiche`, `horaires_texte`, `ordre_blocs` : les vues et le thème sont en
 * `snake_case`, pas en camelCase. Ce n'est pas de la paresse de mappeur. Le
 * thème est écrit TEL QUEL dans une colonne `jsonb` dont
 * `is_valid_vitrine_theme` ferme les clés aux DEUX rangs : le renommer à la
 * lecture obligerait à le renommer en sens inverse à l'écriture, et la première
 * clé oubliée serait refusée par la contrainte en 23514 — sur un formulaire
 * correctement rempli. Un seul jeu de noms, du `check` SQL jusqu'au `<input>`.
 *
 * ── AUCUN UPLOAD D'IMAGE DANS CE LOT ──
 *
 * `cover_path` et `photo_path` sont lus et rendus, jamais écrits : le lot L10
 * ne livre aucun pipeline d'images (bucket, conversion, tailles). Les deux
 * champs restent donc à `null` pour toute vitrine créée par les actions de ce
 * lot. C'est écrit ici, en haut, pour que personne ne cherche le formulaire
 * manquant.
 */

// ────────────────────────────────────────────────────────────
// LE DRAPEAU SERVEUR — OUVERT depuis L11, et il RESTE
// ────────────────────────────────────────────────────────────

/**
 * LA VITRINE PUBLIQUE EST OUVERTE (L11), ET LE DRAPEAU NE DISPARAÎT PAS.
 *
 * Il a d'abord servi à tenir la page fermée jusqu'à l'anglais : la condition
 * d'ouverture était produit et non technique — une carte de restaurant servie en
 * français seul au visiteur étranger est un moins bon produit que pas de carte
 * du tout. Cette condition est remplie : `p_lang` superpose les traductions
 * fraîches et le sélecteur s'offre au-delà de `SEUIL_COUVERTURE_SELECTEUR`.
 *
 * ── CE QU'IL EST DEVENU : L'INTERRUPTEUR D'URGENCE ──
 *
 * Il reste le SEUL point où toutes les pages publiques de la Vitrine se coupent
 * d'un geste : `/v/{slug}` rend 404 et `getVitrinePublicState` refuse SANS
 * MÊME APPELER LA BASE. Le repasser à `false` est la réponse à une fuite
 * constatée, à un abus, à une RPC qui rend n'importe quoi — un seul mot changé,
 * relu, déployé, et plus aucune vitrine n'est servie. Le retirer aurait demandé,
 * ce jour-là, d'écrire le mécanisme sous pression.
 *
 * IL RESTE SERVEUR, PAS UNE VARIABLE D'ENVIRONNEMENT. Une variable se bascule
 * depuis un tableau de bord, sans revue, sans trace dans l'historique, et sur un
 * seul environnement à la fois — c'est-à-dire exactement ce qu'on ne veut pas
 * d'une décision d'ouverture commerciale. L'ouvrir comme le refermer est un
 * COMMIT CONSCIENT, relu, daté, réversible par `git revert`.
 *
 * CE QU'IL NE FAIT PAS : il ne remplace ni `published` (le choix du commerçant)
 * ni le droit `vitrine` (l'abonnement). La base tient ces deux-là, et la RPC les
 * exige toutes les deux — ce drapeau est un troisième verrou, en amont.
 *
 * TYPÉ `boolean`, PAS `true as const`, et c'est délibéré : les gardes
 * `if (!VITRINE_PUBLIQUE_OUVERTE)` doivent rester du code VIVANT pour le
 * compilateur — un littéral les ferait narrower en branches mortes, et c'est
 * précisément le chemin qu'on veut pouvoir emprunter un jour de panne.
 */
export const VITRINE_PUBLIQUE_OUVERTE: boolean = true;

// ────────────────────────────────────────────────────────────
// LES LANGUES — la superposition est en SQL, le SEUIL est ici
// ────────────────────────────────────────────────────────────

/** Les langues qu'une page publique peut servir. Le français est le repli. */
export const VITRINE_LANGUES = ["fr", "en"] as const;
export type LangueVitrine = (typeof VITRINE_LANGUES)[number];

/**
 * La seule langue TRADUISIBLE aujourd'hui — celle que `vitrine_translations`
 * accepte (`check` sur `lang`) et que `lang_coverage` décrit.
 *
 * Le français n'en fait pas partie : il n'est pas traduit, il est la SOURCE.
 */
export const VITRINE_LANGUE_TRADUITE = "en" as const;

/**
 * À PARTIR DE QUAND ON PROPOSE L'ANGLAIS : 95 % des champs traduisibles à jour.
 *
 * ── POURQUOI CE SEUIL VIT ICI ET NON EN SQL ──
 *
 * La migration `20261012120000` rend le COMPTE et s'arrête là
 * (`total_champs_traduisibles`, `traduits_frais`) : elle recompte, elle ne
 * conclut pas. Le seuil est un arbitrage de PRODUIT — il se règle en relisant
 * des vitrines réelles, pas en écrivant une migration — et l'enfermer dans une
 * fonction `security definer` aurait demandé un déploiement de base pour le
 * bouger d'un point.
 *
 * ── POURQUOI 95 ET NON 100 ──
 *
 * Une carte vivante est TOUJOURS un peu en retard : le plat du jour saisi à
 * 11 h n'est pas traduit à midi. Exiger 100 % aurait fait disparaître le
 * sélecteur au premier ajout, c'est-à-dire au moment où la vitrine sert le plus
 * — et l'aurait fait disparaître d'un coup, sans que le commerçant comprenne ce
 * qu'il a cassé. Les 5 % de marge sont ce retard-là, et rien d'autre : les
 * champs manquants retombent en français, champ à champ, jamais en page vide.
 */
export const SEUIL_COUVERTURE_SELECTEUR = 0.95;

/**
 * La couverture de traduction, telle que l'application la lit.
 *
 * `total` = champs traduisibles VISIBLES du visiteur (la RPC compte sur les
 * cartes actives seulement), `frais` = ceux dont la traduction est postérieure à
 * la dernière modification du texte source. Une traduction PÉRIMÉE compte donc
 * comme absente — c'est ce que « frais » veut dire, et c'est le seul comptage
 * qui ne promet pas une page anglaise faite de textes d'avant-hier.
 */
export interface VitrineLangCoverage {
  total: number;
  frais: number;
}

/**
 * Le sélecteur de langue s'offre-t-il ?
 *
 * `total > 0` est une condition à part entière, et pas une garde contre la
 * division par zéro : une vitrine SANS aucun champ traduisible (ni accroche, ni
 * histoire, ni carte) n'a rien à traduire, et proposer « English » sur une page
 * qui rendrait exactement les mêmes mots serait une promesse creuse.
 */
export function selecteurLanguesOuvert(coverage: VitrineLangCoverage): boolean {
  return (
    coverage.total > 0 &&
    coverage.frais / coverage.total >= SEUIL_COUVERTURE_SELECTEUR
  );
}

// ────────────────────────────────────────────────────────────
// LE CALQUE DE TRADUCTION (VIT-5) — miroir des `check` de
// `vitrine_translations` (20261012120000)
//
// Ces trois vocabulaires sont ceux que l'ÉCRAN poste en retour : le tableau de
// traduction rend une ligne par (cible, champ), et chaque ligne réécrit
// exactement les valeurs qu'elle a reçues. Les fermer ici sert donc deux fois —
// à refuser une valeur forgée avant l'aller-retour, et à typer les vues.
// ────────────────────────────────────────────────────────────

/** Les quatre porteurs de texte traduisible — `check (cible_type in …)`. */
export const VITRINE_TRADUCTION_CIBLES = [
  "settings",
  "menu",
  "categorie",
  "item",
] as const;
export type CibleTraductionVitrine = (typeof VITRINE_TRADUCTION_CIBLES)[number];

/**
 * Les cinq champs traduisibles, TOUS TYPES DE CIBLE CONFONDUS.
 *
 * La base tient EN PLUS le couplage type ↔ champ
 * (`vitrine_translations_champ_par_cible` : `settings` porte accroche/histoire/
 * horaires_texte, `menu` et `categorie` portent `nom`, `item` porte nom et
 * description). Ce couplage n'est PAS recopié ici, et c'est délibéré : les deux
 * RPC d'écriture le vérifient et rendent `invalid_champ`, un refus nommé que
 * l'action traduit en message. Le doubler en TypeScript aurait donné deux
 * tables de vérité à tenir d'accord pour un verdict identique — exactement ce
 * que le vocabulaire réservé des slugs a déjà refusé de faire.
 */
export const VITRINE_TRADUCTION_CHAMPS = [
  "accroche",
  "histoire",
  "horaires_texte",
  "nom",
  "description",
] as const;
export type ChampTraductionVitrine = (typeof VITRINE_TRADUCTION_CHAMPS)[number];

/**
 * Les trois états d'un champ traduisible, tels que `vitrine_translation_state`
 * les calcule. TROIS ET NON DEUX : « il reste des plats à traduire » et « vos
 * modifications d'hier ont périmé six fiches » sont deux écrans différents.
 */
export const VITRINE_TRADUCTION_ETATS = ["frais", "perime", "absent"] as const;
export type EtatTraductionVitrine = (typeof VITRINE_TRADUCTION_ETATS)[number];

/**
 * La borne du texte traduit : `char_length(btrim(texte)) between 1 and 2000`.
 *
 * Au-dessus du plus long champ traduisible (`histoire`, 1200) : une traduction
 * est parfois plus longue que sa source, et refuser sur la borne du français
 * aurait fait échouer un anglais correct.
 */
export const VITRINE_TRADUCTION_TEXTE_MAX = 2000;

// ────────────────────────────────────────────────────────────
// LES BORNES — miroir exact des `check` de la migration
// ────────────────────────────────────────────────────────────

/** Nom d'une fiche : 1..120 après détourage (`vitrine_items.nom`). */
export const VITRINE_FICHE_NOM_MAX = 120;
/** Nom d'une carte : 1..80 après détourage. */
export const VITRINE_CARTE_NOM_MAX = 80;
/** Nom d'une rubrique : même borne que la carte, nommée à part pour l'écran. */
export const VITRINE_RUBRIQUE_NOM_MAX = 80;
/** Description d'une fiche : 400 caractères. */
export const VITRINE_FICHE_DESCRIPTION_MAX = 400;
/** Prix AFFICHÉ : du texte court, détouré, 1..40 — jamais un décimal. */
export const VITRINE_PRIX_AFFICHE_MAX = 40;
/** Accroche de l'identité publique : 200 caractères. */
export const VITRINE_ACCROCHE_MAX = 200;
/** Histoire du lieu : 1200 caractères. */
export const VITRINE_HISTOIRE_MAX = 1200;
/** Horaires en texte libre : 600 caractères. */
export const VITRINE_HORAIRES_MAX = 600;

/**
 * Le badge du hero — court par construction.
 *
 * 48 caractères : « Ouvert · 12h–23h » en fait 16, « Ouvert du mardi au
 * dimanche, 12h–23h » en fait 38. Au-delà, la pastille passe à la ligne
 * par-dessus le nom du commerce dans une largeur de téléphone, et le hero
 * n'a plus de titre lisible.
 */
export const VITRINE_BADGE_OUVERTURE_MAX = 48;
/** Chemin d'image (couverture ou photo de fiche) : 300 caractères. */
export const VITRINE_CHEMIN_IMAGE_MAX = 300;

// ── LES CONTENUS MIS EN AVANT (VIT-4) ────────────────────────
//
// Miroir des `check` de `vitrine_contenus` (20261015120000). Trois bornes et
// pas une de plus : la table ne porte qu'un titre, une adresse et une place.

/** Titre d'un contenu mis en avant : 1..80 après détourage. */
export const VITRINE_CONTENU_TITRE_MAX = 80;
/** Adresse d'un contenu : 300, la même borne que les chemins d'image. */
export const VITRINE_CONTENU_URL_MAX = 300;
/**
 * La PLACE d'un contenu : 1, 2 ou 3 — jamais un `ordre` libre.
 *
 * En base, le `check (rang between 1 and 3)` et l'`unique (organization_id,
 * rang)` tiennent ENSEMBLE la spécification « un à trois » : au plus trois
 * lignes par commerce, jamais deux à la même place. C'est aussi ce qui rend le
 * tri de la RPC total sans colonne de départage.
 */
export const VITRINE_CONTENU_RANG_MIN = 1;
export const VITRINE_CONTENU_RANG_MAX = 3;
/**
 * Combien de contenus la page publique rend — miroir de `c_max_contenus`.
 *
 * Redondant avec `VITRINE_CONTENU_RANG_MAX` par construction, et nommé à part
 * pour la même raison que `VITRINE_PORTES_MAX` : c'est la borne du DOCUMENT, et
 * elle se lit là où le document se relit. Une contrainte de table retirée un
 * jour ne doit pas faire grossir sans borne ce que l'ISR sert à chaque visiteur.
 */
export const VITRINE_CONTENUS_MAX = 3;

/** Rang d'affichage, aux trois niveaux : `ordre between 0 and 999`. */
export const VITRINE_ORDRE_MIN = 0;
export const VITRINE_ORDRE_MAX = 999;

/**
 * Combien d'éléments un seul geste de réordonnancement peut porter.
 *
 * CE N'EST PAS UNE BORNE SQL — la base accepte n'importe quel rang de 0 à 999.
 * C'est une borne d'ÉCRAN : le réordonnancement s'écrit en une mise à jour par
 * ligne (PostgREST ne sait pas faire `update … from (values …)`), et cent
 * allers-retours est déjà le double de ce qu'une carte réelle contient. Mille en
 * aurait fait un geste qui expire.
 */
export const VITRINE_REORDONNANCEMENT_MAX = 100;

/** Adresse publique : `^[a-z0-9-]{3,60}$`. */
export const VITRINE_SLUG_MIN = 3;
export const VITRINE_SLUG_MAX = 60;
export const VITRINE_SLUG_PATTERN = /^[a-z0-9-]{3,60}$/;

// ────────────────────────────────────────────────────────────
// LES HUIT BADGES DE RÉGIME — vocabulaire de la PLATEFORME
//
// Slugs recopiés du `check` de `vitrine_items.badges`. Les libellés et les
// émojis, eux, n'existent QUE côté application : la base n'a aucune raison de
// porter du français. L11 les a traduits UNE FOIS POUR TOUTES (`BADGES_EN`) —
// c'est du vocabulaire de plateforme, il ne passe pas par le calque
// `vitrine_translations`, qui ne porte que ce que le commerçant écrit.
//
// ÉMOJI SOBRE, un par badge : il sert de repère visuel sur une fiche dense, pas
// de décoration. Aucun émoji composé (ZWJ) — ils se rendent mal sur les vieux
// Android, qui sont exactement le parc d'un QR de comptoir.
// ────────────────────────────────────────────────────────────

export const VITRINE_BADGES = [
  "vegetarien",
  "vegan",
  "epice",
  "traditionnel",
  "sain",
  "grille",
  "nouveau",
  "fait_maison",
] as const;

export type BadgeVitrine = (typeof VITRINE_BADGES)[number];

export const BADGES_FR: Record<BadgeVitrine, string> = {
  vegetarien: "🥗 Végétarien",
  vegan: "🌱 Vegan",
  epice: "🌶️ Épicé",
  traditionnel: "🍲 Traditionnel",
  sain: "🍃 Sain",
  grille: "🔥 Grillé",
  nouveau: "✨ Nouveau",
  fait_maison: "🏠 Fait maison",
};

/**
 * LES MÊMES HUIT BADGES, EN ANGLAIS — écrits à la main (VIT-1b).
 *
 * ── AUCUNE MACHINE N'A TRADUIT CES HUIT MOTS ──
 *
 * C'est du vocabulaire de PLATEFORME : il tient sur une ligne, il ne change
 * jamais, et il est lu par un visiteur qui décide s'il peut manger le plat.
 * Le faire traduire à la volée aurait coûté un appel par page pour huit chaînes
 * connues d'avance, et aurait laissé « Fait maison » revenir en « Made at home »
 * un jour sur deux. Le calque `vitrine_translations` traduit ce que le
 * commerçant ÉCRIT ; ces huit mots, eux, sont à nous.
 *
 * ── LES ÉMOJIS SONT LES MÊMES, ET C'EST LE POINT ──
 *
 * Un pictogramme n'a pas de langue. Le garder identique fait que le badge occupe
 * la même place, se reconnaît du même coup d'œil et se compare d'une langue à
 * l'autre — changer d'émoji en changeant de langue aurait laissé croire à un
 * autre régime.
 */
export const BADGES_EN: Record<BadgeVitrine, string> = {
  vegetarien: "🥗 Vegetarian",
  vegan: "🌱 Vegan",
  epice: "🌶️ Spicy",
  traditionnel: "🍲 Traditional",
  sain: "🍃 Healthy",
  grille: "🔥 Grilled",
  nouveau: "✨ New",
  fait_maison: "🏠 Homemade",
};

/**
 * Le libellé d'un badge, émoji compris, dans la langue servie.
 *
 * Rend le SLUG quand il ne connaît pas la valeur, plutôt qu'une chaîne vide :
 * une ligne écrite avant un retrait de vocabulaire afficherait sinon une case
 * vide que personne ne sait expliquer. Le français est le DÉFAUT du paramètre,
 * ce qui laisse les appelants d'avant L11 inchangés.
 */
export function libelleBadge(badge: string, lang: LangueVitrine = "fr"): string {
  const catalogue = lang === "en" ? BADGES_EN : BADGES_FR;
  return catalogue[badge as BadgeVitrine] ?? badge;
}

// ────────────────────────────────────────────────────────────
// LES QUATORZE ALLERGÈNES — annexe II du règlement UE 1169/2011
//
// C'est le seul vocabulaire de ce fichier qui soit RÉGLEMENTAIRE : il ne
// s'étend pas parce qu'un commerçant le demande, il s'étend si l'annexe change.
// Aucun émoji ici — un allergène n'est pas un argument de vente, et un
// pictogramme fantaisiste sur « fruits à coque » serait lu comme une nuance.
// ────────────────────────────────────────────────────────────

export const VITRINE_ALLERGENES = [
  "gluten",
  "crustaces",
  "oeufs",
  "poissons",
  "arachides",
  "soja",
  "lait",
  "fruits_a_coque",
  "celeri",
  "moutarde",
  "sesame",
  "sulfites",
  "lupin",
  "mollusques",
] as const;

export type AllergeneVitrine = (typeof VITRINE_ALLERGENES)[number];

export const ALLERGENES_FR: Record<AllergeneVitrine, string> = {
  gluten: "Gluten",
  crustaces: "Crustacés",
  oeufs: "Œufs",
  poissons: "Poissons",
  arachides: "Arachides",
  soja: "Soja",
  lait: "Lait",
  fruits_a_coque: "Fruits à coque",
  celeri: "Céleri",
  moutarde: "Moutarde",
  sesame: "Sésame",
  sulfites: "Sulfites",
  lupin: "Lupin",
  mollusques: "Mollusques",
};

/* ────────────────────────────────────────────────────────────
   LA BOUSSOLE (VIT-10) — deux vocabulaires fermés de plus
   ──────────────────────────────────────────────────────────── */

/**
 * Les facettes d'une fiche, PRÉFIXÉES PAR DIMENSION.
 *
 * Le préfixe n'est pas décoratif : c'est lui qui sépare les quatre questions
 * de la Boussole sans que la base ait à connaître la notion de « question ».
 * Une seule colonne, un seul `check`, un seul `grant` — et un seul endroit où
 * ajouter une dimension le jour où il en faudra une cinquième.
 *
 * PARITÉ AVEC LE `check` de `20261024120000`, gardée par
 * `src/lib/vitrine-parity.test.ts` : les deux listes se comptent.
 */
export const VITRINE_FACETTES = [
  "occasion_repas",
  "occasion_apero",
  "occasion_cafe",
  "occasion_fete",
  "temps_rapide",
  "temps_pose",
  "envie_sale",
  "envie_sucre",
  "envie_boisson",
  "table_seul",
  "table_groupe",
] as const;

export type FacetteVitrine = (typeof VITRINE_FACETTES)[number];

export const FACETTES_FR: Record<FacetteVitrine, string> = {
  occasion_repas: "Un repas",
  occasion_apero: "Un apéro",
  occasion_cafe: "Un café, une pause",
  occasion_fete: "Une occasion à fêter",
  temps_rapide: "Vite fait",
  temps_pose: "On prend le temps",
  envie_sale: "Salé",
  envie_sucre: "Sucré",
  envie_boisson: "À boire",
  table_seul: "Seul",
  table_groupe: "À plusieurs",
};

/**
 * Les six portes qu'une fiche ou une rubrique peut ouvrir. AU PLUS UNE.
 *
 * Ce sont des MODULES, jamais des objets : `reserver` et non « l'activité
 * n° 42 ». La porte se referme d'elle-même quand `portes` ne publie plus rien
 * pour ce module — aucune suppression à propager, aucune jointure à tenir.
 */
export const VITRINE_ACTIONS = [
  "boussole",
  "reserver",
  "offre",
  "quiz",
  "duo",
  "bande",
] as const;

export type ActionVitrine = (typeof VITRINE_ACTIONS)[number];

export const ACTIONS_FR: Record<ActionVitrine, string> = {
  boussole: "Aider à choisir (Boussole)",
  reserver: "Réserver un créneau",
  offre: "Voir les offres à retirer",
  quiz: "Proposer un quiz",
  duo: "Proposer le Duo Miroir",
  bande: "Proposer le Portrait de la Bande",
};

/** Le libellé vu par le CLIENT sur la fiche — un geste, pas un nom de module. */
/**
 * Une action relue, ou `null`.
 *
 * REPLI FERMÉ, motif du vocabulaire : une valeur inconnue — écrite avant que
 * la liste n'existe, ou par un chemin qui l'ignorerait — vaut « aucune porte »
 * plutôt qu'un bouton que l'écran ne saurait pas peindre.
 */
export function actionVitrine(brut: unknown): ActionVitrine | null {
  return typeof brut === "string" &&
    (VITRINE_ACTIONS as readonly string[]).includes(brut)
    ? (brut as ActionVitrine)
    : null;
}
export const ACTIONS_PUBLIC_FR: Record<ActionVitrine, string> = {
  boussole: "Aidez-moi à choisir",
  reserver: "Réserver",
  offre: "Voir les offres",
  quiz: "Jouer au quiz",
  duo: "Jouer au Duo Miroir",
  bande: "Jouer au Portrait de la Bande",
};


/**
 * LES QUATORZE ALLERGÈNES EN ANGLAIS — les termes de l'annexe II elle-même.
 *
 * Ce ne sont pas des traductions libres : le règlement UE 1169/2011 est publié
 * dans les vingt-quatre langues de l'Union, et sa version anglaise NOMME ces
 * quatorze substances. On recopie ce vocabulaire-là plutôt que d'en inventer un
 * — « Nuts » et non « Shell fruits », « Sulphites » et non « Sulfites » (la
 * graphie britannique est celle du texte), « Molluscs » et non « Shellfish »,
 * qui en anglais courant désigne AUSSI les crustacés et fondrait deux entrées
 * que le règlement sépare.
 *
 * Aucun émoji ici non plus : un allergène n'est pas un argument de vente.
 */
export const ALLERGENES_EN: Record<AllergeneVitrine, string> = {
  gluten: "Gluten",
  crustaces: "Crustaceans",
  oeufs: "Eggs",
  poissons: "Fish",
  arachides: "Peanuts",
  soja: "Soybeans",
  lait: "Milk",
  fruits_a_coque: "Nuts",
  celeri: "Celery",
  moutarde: "Mustard",
  sesame: "Sesame",
  sulfites: "Sulphites",
  lupin: "Lupin",
  mollusques: "Molluscs",
};

export function libelleAllergene(
  allergene: string,
  lang: LangueVitrine = "fr",
): string {
  const catalogue = lang === "en" ? ALLERGENES_EN : ALLERGENES_FR;
  return catalogue[allergene as AllergeneVitrine] ?? allergene;
}

// ────────────────────────────────────────────────────────────
// LE THÈME — trois vocabulaires fermés, tous recopiés du validateur SQL
// ────────────────────────────────────────────────────────────

/** `style_cartes` : la façon dont les fiches se posent sur l'écran. */
export const VITRINE_STYLES_CARTES = ["liste", "grille", "magazine"] as const;
export type StyleCartesVitrine = (typeof VITRINE_STYLES_CARTES)[number];

const STYLES_LIBELLES: Record<StyleCartesVitrine, string> = {
  liste: "Liste",
  grille: "Grille",
  magazine: "Magazine",
};

export function libelleStyleCartes(style: string): string {
  return STYLES_LIBELLES[style as StyleCartesVitrine] ?? style;
}

/**
 * `ordre_blocs` : la page d'accueil, bloc par bloc.
 *
 * L'ordre déclaré ici est l'ordre PAR DÉFAUT — celui qu'une vitrine sans thème
 * rend. Le commerçant le permute, et MASQUER UN BLOC C'EST L'OMETTRE : la
 * migration accepte une permutation PARTIELLE, sans doublon.
 *
 * ── LES DEUX PORTES SONT EN QUEUE, ET C'EST LE DÉFAUT QU'ON VEUT (VIT-3) ──
 *
 * `reserver` et `experiences` ouvrent sur d'AUTRES pages du commerce. Les poser
 * en tête aurait fait sortir le visiteur de la vitrine avant qu'il ait lu la
 * carte pour laquelle il a scanné le QR. Ils restent permutables comme les cinq
 * autres — et LE RETRAIT EST LE RÉGLAGE : un commerçant qui ne veut pas annoncer
 * ses files les omet de son ordre, il n'y a aucun drapeau séparé qui dirait la
 * même chose une seconde fois.
 *
 * CETTE LISTE EST LE VOCABULAIRE COMPLET — ce que la base accepte, ce que
 * l'écran de réglages propose, ce que la validation laisse passer. Elle n'est
 * PAS le défaut : voir `VITRINE_BLOCS_DEFAUT` juste en dessous.
 */
export const VITRINE_BLOCS = [
  "accroche",
  "histoire",
  "cartes",
  "horaires",
  "social",
  "reserver",
  "experiences",
] as const;
export type BlocVitrine = (typeof VITRINE_BLOCS)[number];

/**
 * CE QU'UNE VITRINE JAMAIS RÉGLÉE PUBLIE : les cinq blocs de VIT-1a, et EUX
 * SEULS. Les deux portes de VIT-3 en sont absentes — délibérément.
 *
 * ── UNE PORTE PUBLIÉE EST UN CHOIX, PAS UN DÉFAUT ──
 *
 * Le repli portait la liste complète, et la conséquence était un geste que
 * personne n'avait fait : toute vitrine dont le commerçant n'a jamais touché
 * l'ordre des blocs se serait mise, au déploiement de VIT-3, à ANNONCER
 * publiquement ses activités, ses files et ses quiz — sur une page servie en
 * ISR, NON indexée (`robots: { index: false }`, décision de commerce en
 * attente) mais atteignable par quiconque devine le slug de l'enseigne, et
 * découverte par un visiteur avant par son propriétaire.
 *
 * Ces noms ne sont pas neutres : « Privatisation Dupont », « Rattrapage de
 * M. Bernard », « File retrait commande Martin » sont des libellés d'ORGANISATION
 * INTERNE, écrits pour un écran de comptoir. Aucun d'eux ne doit s'annoncer
 * seul, et surtout pas parce qu'une version a changé.
 *
 * ── LE GESTE EST LE CONSENTEMENT ──
 *
 * Le commerçant remonte `reserver` et `experiences` depuis la colonne
 * « Masqués » de ses réglages, et cette remontée EST l'accord de publier. Il n'y
 * a donc toujours aucun drapeau séparé — l'omission reste le réglage, ce qui
 * change est seulement le point de départ : masqué jusqu'à ce qu'on le montre,
 * plutôt que montré jusqu'à ce qu'on le cache.
 *
 * `satisfies` et non une recopie libre : un bloc retiré du vocabulaire ferait
 * rougir le compilateur ici, plutôt que de survivre dans un défaut que la base
 * refuserait ensuite en 23514.
 */
export const VITRINE_BLOCS_DEFAUT = [
  "accroche",
  "histoire",
  "cartes",
  "horaires",
  "social",
] as const satisfies readonly BlocVitrine[];

const BLOCS_LIBELLES: Record<BlocVitrine, string> = {
  accroche: "Accroche",
  histoire: "Notre histoire",
  cartes: "Nos cartes",
  horaires: "Horaires",
  social: "Réseaux et avis",
  reserver: "Réserver",
  experiences: "Jeux et expériences",
};

export function libelleBloc(bloc: string): string {
  return BLOCS_LIBELLES[bloc as BlocVitrine] ?? bloc;
}

/**
 * `polices` : le catalogue admis par le thème.
 *
 * ── POURQUOI CETTE LISTE EST ÉCRITE ICI PLUTÔT QUE DÉRIVÉE DE `FONT_KEYS` ──
 *
 * Elle est le MIROIR DU `check` SQL, pas un alias du catalogue de polices. La
 * dériver de `FONT_KEYS` rendrait la parité TypeScript vraie par construction —
 * donc invérifiable — et l'écart réel (SQL ↔ application) passerait inaperçu
 * jusqu'à ce qu'une huitième police fasse échouer un enregistrement en
 * production sur un 23514 illisible.
 *
 * Écrite à la main, elle se compare des DEUX côtés dans
 * `vitrine-parity.test.ts` : à `FONT_KEYS` (le CSS charge-t-il cette police ?)
 * et au validateur de la migration (la base l'accepte-t-elle ?). Trois listes,
 * une seule vérité, deux gardes.
 */
export const VITRINE_THEME_POLICES = [
  "sans",
  "elegant",
  "impact",
  "rounded",
  "script",
  "modern",
  "mono",
] as const;

/**
 * Le thème stocké, AUX NOMS DE LA BASE.
 *
 * `is_valid_vitrine_theme` ferme les clés aux deux rangs : ce type est la forme
 * exacte qu'elle accepte, et c'est la même qui part en `jsonb` — voir l'en-tête
 * du fichier sur le refus de renommer.
 */
export interface ThemeVitrine {
  couleurs?: { primary?: string; secondary?: string };
  polices?: { heading?: FontKey; body?: FontKey };
  style_cartes?: StyleCartesVitrine;
  ordre_blocs?: BlocVitrine[];
  allure?: AllureVitrine;
}

// ────────────────────────────────────────────────────────────
// LE SECTEUR — ce que le commerce EST, et rien de plus
//
// ── POURQUOI UNE LISTE FERMÉE ET PAS UN TEXTE LIBRE ──
//
// Le secteur ne décore pas : il CHOISIT DES MOTS que le visiteur lit
// (« Nos cartes » chez un restaurant, « Nos prestations » chez un coiffeur,
// « Nos chambres » à l'hôtel) et il pose un préréglage de couleurs et de
// polices. Les deux sont des tables indexées par cette liste — un texte libre
// aurait fait retomber « Coiffeur », « coiffeuse » et « Salon de coiffure » sur
// trois cases vides, donc sur du vocabulaire de restaurant chez un coiffeur.
//
// ── `commerce` EST LE DÉFAUT, ET IL EST NEUTRE ──
//
// Il n'est pas un septième métier : c'est ce que rend une vitrine dont personne
// n'a rien dit. Son vocabulaire ne parle ni de plats ni de rendez-vous. Une
// vitrine existante, qui n'a évidemment pas de secteur en base, retombe donc
// ici — et sur le préréglage de la maquette de référence.
//
// ── LA MISE EN PAGE NE DÉPEND JAMAIS DU SECTEUR ──
//
// Un coiffeur et un restaurant ont la MÊME structure d'écran : hero, onglets,
// chips, fiches, barre basse. Le secteur ne touche qu'aux MOTS et aux valeurs
// PAR DÉFAUT du thème — que le commerçant reste libre de changer ensuite. Faire
// dépendre la mise en page du secteur aurait créé sept écrans à tenir d'accord
// au lieu d'un.
// ────────────────────────────────────────────────────────────

export const VITRINE_SECTEURS = [
  "restaurant",
  "bar",
  "coiffeur",
  "fleuriste",
  "hotel",
  "spa",
  "commerce",
] as const;
export type SecteurVitrine = (typeof VITRINE_SECTEURS)[number];

/** Le secteur d'une vitrine dont personne n'a rien dit. Voir ci-dessus. */
export const VITRINE_SECTEUR_DEFAUT: SecteurVitrine = "commerce";

const SECTEURS_LIBELLES: Record<SecteurVitrine, string> = {
  restaurant: "Restaurant",
  bar: "Bar, café",
  coiffeur: "Coiffeur, barbier",
  fleuriste: "Fleuriste",
  hotel: "Hôtel, chambres d'hôtes",
  spa: "Spa, institut",
  commerce: "Autre commerce",
};

/** Le nom du secteur pour l'ÉCRAN COMMERÇANT. Le public ne le lit jamais. */
export function libelleSecteur(secteur: string): string {
  return (
    SECTEURS_LIBELLES[secteur as SecteurVitrine] ??
    SECTEURS_LIBELLES[VITRINE_SECTEUR_DEFAUT]
  );
}

/** Le mot du vocabulaire, ou le défaut — jamais une valeur inventée. */
export function asSecteurVitrine(valeur: unknown): SecteurVitrine {
  return typeof valeur === "string" &&
    (VITRINE_SECTEURS as readonly string[]).includes(valeur)
    ? (valeur as SecteurVitrine)
    : VITRINE_SECTEUR_DEFAUT;
}

// ────────────────────────────────────────────────────────────
// L'ALLURE — les réglages visuels, sous UNE SEULE clé de premier rang
//
// ── POURQUOI `allure` ET NON VINGT-CINQ CLÉS À LA RACINE ──
//
// `is_valid_vitrine_theme` ferme les clés AUX DEUX RANGS. Vingt-cinq clés à la
// racine auraient allongé la liste blanche du premier rang à vingt-neuf
// entrées, mélangées aux quatre qui existent depuis VIT-1a — et la prochaine
// relecture n'aurait plus pu distinguer « ce qui structure la page » de « ce
// qui la décore ». Un seul objet imbriqué garde le premier rang à cinq mots.
//
// COROLLAIRE : toute clé d'allure INCONNUE fait refuser le thème entier par la
// base. C'est voulu, et c'est le même contrat qu'aux quatre autres — une clé
// tolérée en silence est une clé qu'on croit lue alors que rien ne la lit.
//
// ── LES DÉFAUTS SONT LA MAQUETTE, AU PIXEL ──
//
// Chaque valeur ci-dessous est celle de la carte de référence. Une vitrine à
// laquelle personne n'a touché sort donc EXACTEMENT comme elle, et les réglages
// ne sont que des écarts volontaires. L'inverse — des défauts neutres et une
// allure à reconstituer réglage par réglage — aurait fait de la maquette une
// destination qu'aucun commerçant n'atteint.
// ────────────────────────────────────────────────────────────

export const VITRINE_MOTIFS = [
  "aucun",
  "diagonales",
  "points",
  "damier",
] as const;
export type MotifVitrine = (typeof VITRINE_MOTIFS)[number];

export const VITRINE_DENSITES = ["confortable", "standard", "compact"] as const;
export type DensiteVitrine = (typeof VITRINE_DENSITES)[number];

export const VITRINE_STYLES_FICHE = ["ombre", "contour", "plein"] as const;
export type StyleFicheVitrine = (typeof VITRINE_STYLES_FICHE)[number];

/**
 * `aucune` retire la photo ET son emplacement — ce n'est pas une taille nulle.
 *
 * ── POURQUOI `aucune` ET NON `sans`, QUI SE LIT MIEUX ──
 *
 * `'sans'` est DÉJÀ une clé de police (`FONT_KEYS`), et les deux vocabulaires
 * vivent dans le corps de la MÊME fonction SQL. `vitrine.test.sql` y compte les
 * occurrences quotées des sept polices pour prouver qu'elles sont bien recopiées
 * — un `'sans'` de plus, venu d'une autre liste, en faisait huit et cassait une
 * garde qui n'avait rien à voir.
 *
 * On renomme la valeur plutôt que d'élargir la garde : elle n'est pas fausse,
 * elle est grossière, et l'affaiblir pour un confort de nommage aurait coûté
 * plus que ce mot. `aucune` répond d'ailleurs à `aucun` du motif.
 */
export const VITRINE_PHOTO_TAILLES = [
  "grande",
  "standard",
  "vignette",
  "aucune",
] as const;
export type PhotoTailleVitrine = (typeof VITRINE_PHOTO_TAILLES)[number];

export const VITRINE_PHOTO_POSITIONS = ["droite", "gauche", "pleine"] as const;
export type PhotoPositionVitrine = (typeof VITRINE_PHOTO_POSITIONS)[number];

export const VITRINE_STYLES_PRIX = ["simple", "accent", "pastille"] as const;
export type StylePrixVitrine = (typeof VITRINE_STYLES_PRIX)[number];

export const VITRINE_STYLES_ONGLETS = [
  "soulignes",
  "pastilles",
  "segmentes",
] as const;
export type StyleOngletsVitrine = (typeof VITRINE_STYLES_ONGLETS)[number];

export const VITRINE_STYLES_CHIPS = [
  "contour",
  "pleines",
  "soulignees",
] as const;
export type StyleChipsVitrine = (typeof VITRINE_STYLES_CHIPS)[number];

export const VITRINE_STYLES_RUBRIQUE = ["carte", "filet", "simple"] as const;
export type StyleRubriqueVitrine = (typeof VITRINE_STYLES_RUBRIQUE)[number];

export const VITRINE_BARRES_BASSES = [
  "flottante",
  "pleine",
  "masquee",
] as const;
export type BarreBasseVitrine = (typeof VITRINE_BARRES_BASSES)[number];

export const VITRINE_CARTES_INFOS = [
  "chevauche",
  "dessous",
  "masquee",
] as const;
export type CarteInfosVitrine = (typeof VITRINE_CARTES_INFOS)[number];

/**
 * LES BORNES DES RÉGLAGES CHIFFRÉS — miroir exact des `between` du SQL.
 *
 * Elles sont ici et pas dans le composant parce que TROIS écrans les lisent :
 * la page publique (qui borne une valeur venue de la base), l'éditeur (qui
 * borne un curseur) et le validateur (qui refuse une saisie). Trois copies
 * auraient divergé le jour où l'une bouge.
 *
 * `pas` sert au curseur de l'éditeur, JAMAIS à la validation : la base accepte
 * n'importe quelle valeur DANS l'intervalle, et refuser 0.45 parce qu'il n'est
 * pas sur le pas aurait fait échouer un enregistrement pour une raison que
 * personne ne peut lire dans un 23514.
 */
export const VITRINE_ALLURE_BORNES = {
  motif_opacite: { min: 0, max: 1, pas: 0.05, defaut: 0.4 },
  rayon: { min: 0, max: 24, pas: 1, defaut: 13 },
  ombre: { min: 0, max: 1, pas: 0.05, defaut: 0.6 },
  echelle_texte: { min: 0.85, max: 1.3, pas: 0.05, defaut: 1 },
  hero_hauteur: { min: 180, max: 420, pas: 2, defaut: 240 },
  hero_taille_nom: { min: 28, max: 60, pas: 1, defaut: 46 },
  hero_voile: { min: 0, max: 0.9, pas: 0.05, defaut: 0.4 },
} as const satisfies Record<
  string,
  { min: number; max: number; pas: number; defaut: number }
>;

export type ChampChiffreAllure = keyof typeof VITRINE_ALLURE_BORNES;

/** Les sept curseurs, dans l'ordre où l'éditeur les présente. */
export const VITRINE_ALLURE_CHIFFRES = Object.keys(
  VITRINE_ALLURE_BORNES,
) as ChampChiffreAllure[];

/**
 * LES INTERRUPTEURS, avec leur valeur par défaut — celle de la maquette.
 *
 * `favoris` et `recherche` ÉTEIGNENT une fonction, ils ne la cachent pas : un
 * favori posé puis rendu invisible ferait croire à une perte.
 */
export const VITRINE_ALLURE_BOOLEENS_DEFAUTS = {
  entete_collant: true,
  capitales: true,
  capitales_desc: true,
  compte_rubrique: true,
  monogramme: true,
  favoris: true,
  recherche: true,
} as const satisfies Record<string, boolean>;

export type ChampBooleenAllure = keyof typeof VITRINE_ALLURE_BOOLEENS_DEFAUTS;

export const VITRINE_ALLURE_BOOLEENS = Object.keys(
  VITRINE_ALLURE_BOOLEENS_DEFAUTS,
) as ChampBooleenAllure[];

/**
 * L'allure STOCKÉE — toutes les clés facultatives, comme le reste du thème.
 *
 * Facultatives et non remplies par défaut : « la clé n'est posée que si elle
 * EXISTAIT ». Un document qui recopierait les vingt-cinq défauts ferait croire
 * à vingt-cinq décisions du commerçant, et le jour où un défaut change, aucune
 * vitrine déjà enregistrée n'en profiterait.
 */
export interface AllureVitrine {
  motif?: MotifVitrine;
  densite?: DensiteVitrine;
  style_fiche?: StyleFicheVitrine;
  photo_taille?: PhotoTailleVitrine;
  photo_position?: PhotoPositionVitrine;
  style_prix?: StylePrixVitrine;
  style_onglets?: StyleOngletsVitrine;
  style_chips?: StyleChipsVitrine;
  style_rubrique?: StyleRubriqueVitrine;
  barre_basse?: BarreBasseVitrine;
  carte_infos?: CarteInfosVitrine;
  motif_opacite?: number;
  rayon?: number;
  ombre?: number;
  echelle_texte?: number;
  hero_hauteur?: number;
  hero_taille_nom?: number;
  hero_voile?: number;
  entete_collant?: boolean;
  capitales?: boolean;
  capitales_desc?: boolean;
  compte_rubrique?: boolean;
  monogramme?: boolean;
  favoris?: boolean;
  recherche?: boolean;
}

/**
 * LES ÉNUMÉRATIONS D'ALLURE, indexées par leur clé — une seule table lue par le
 * mappeur, par le validateur applicatif et par l'éditeur.
 *
 * Écrite à la main plutôt que dérivée : c'est le miroir du `check` SQL, et une
 * table dérivée aurait rendu la parité vraie par construction, donc muette. La
 * garde qui la compare à la migration vit dans `vitrine-allure-parite.test.ts`.
 *
 * `defaut` est la valeur de la MAQUETTE. Elle n'est jamais écrite en base : elle
 * est ce que rend `resoudreThemeVitrine` quand la clé est absente.
 */
export const VITRINE_ALLURE_ENUMS = {
  motif: { valeurs: VITRINE_MOTIFS, defaut: "diagonales" },
  densite: { valeurs: VITRINE_DENSITES, defaut: "standard" },
  style_fiche: { valeurs: VITRINE_STYLES_FICHE, defaut: "ombre" },
  photo_taille: { valeurs: VITRINE_PHOTO_TAILLES, defaut: "standard" },
  photo_position: { valeurs: VITRINE_PHOTO_POSITIONS, defaut: "gauche" },
  style_prix: { valeurs: VITRINE_STYLES_PRIX, defaut: "accent" },
  style_onglets: { valeurs: VITRINE_STYLES_ONGLETS, defaut: "segmentes" },
  style_chips: { valeurs: VITRINE_STYLES_CHIPS, defaut: "pleines" },
  style_rubrique: { valeurs: VITRINE_STYLES_RUBRIQUE, defaut: "carte" },
  barre_basse: { valeurs: VITRINE_BARRES_BASSES, defaut: "flottante" },
  carte_infos: { valeurs: VITRINE_CARTES_INFOS, defaut: "chevauche" },
} as const;

export type ChampEnumAllure = keyof typeof VITRINE_ALLURE_ENUMS;

/** Les onze listes déroulantes, dans l'ordre où l'éditeur les présente. */
export const VITRINE_ALLURE_ENUMS_CLES = Object.keys(
  VITRINE_ALLURE_ENUMS,
) as ChampEnumAllure[];

/**
 * TOUTES LES CLÉS D'ALLURE ACCEPTÉES — le miroir de la liste blanche du second
 * rang, côté SQL. Une clé absente d'ici fait refuser le thème par la base.
 */
export const VITRINE_ALLURE_CLES: readonly string[] = [
  ...VITRINE_ALLURE_ENUMS_CLES,
  ...VITRINE_ALLURE_CHIFFRES,
  ...VITRINE_ALLURE_BOOLEENS,
];

/**
 * LES PRÉRÉGLAGES PAR SECTEUR — couleurs et polices, et rien d'autre.
 *
 * ── CE N'EST PAS UN THÈME STOCKÉ ──
 *
 * Ces valeurs ne sont jamais écrites en base : elles remplacent les défauts de
 * `resoudreThemeVitrine` quand le commerçant n'a rien choisi. Un commerçant qui
 * change de secteur voit donc son allure suivre — tant qu'il n'a pas posé sa
 * propre couleur, auquel cas la sienne gagne, toujours.
 *
 * ── L'ALLURE N'Y EST PAS, ET C'EST DÉLIBÉRÉ ──
 *
 * Les vingt-cinq réglages de mise en page sont les MÊMES pour les sept secteurs
 * (voir l'en-tête du secteur). Un spa et un restaurant se distinguent par leur
 * palette et leur vocabulaire, pas par la position de leurs photos.
 */
export const VITRINE_PRESETS_SECTEUR: Record<
  SecteurVitrine,
  { primary: string; secondary: string; heading: FontKey; body: FontKey }
> = {
  // L'accent et le crème de la carte de référence.
  restaurant: {
    primary: "#7D3C11",
    secondary: "#FAF6EC",
    heading: "elegant",
    body: "sans",
  },
  bar: {
    primary: "#B4762A",
    secondary: "#F2F1EE",
    heading: "impact",
    body: "sans",
  },
  coiffeur: {
    primary: "#7A1F2B",
    secondary: "#FDFBF6",
    heading: "modern",
    body: "sans",
  },
  fleuriste: {
    primary: "#1F4B3F",
    secondary: "#EFF2EA",
    heading: "elegant",
    body: "sans",
  },
  hotel: {
    primary: "#1B3A5C",
    secondary: "#FDFBF6",
    heading: "elegant",
    body: "sans",
  },
  spa: {
    primary: "#1F4B3F",
    secondary: "#F8EFEA",
    heading: "elegant",
    body: "rounded",
  },
  // Le neutre EST la maquette : une vitrine sans secteur ne doit pas avoir
  // l'air moins finie qu'une autre.
  commerce: {
    primary: "#7D3C11",
    secondary: "#FAF6EC",
    heading: "elegant",
    body: "sans",
  },
};

// ────────────────────────────────────────────────────────────
// LES SLUGS RÉSERVÉS — miroir de `is_reserved_vitrine_slug`
//
// La liste couvre les segments de premier niveau que l'application sert déjà,
// ou qu'un routeur finira par vouloir. La base reste juge — `set_vitrine_slug`
// rend « reserved_slug » — mais l'écran doit pouvoir le dire AVANT le clic.
// ────────────────────────────────────────────────────────────

export const VITRINE_SLUGS_RESERVES: readonly string[] = [
  // Les segments que l'application se réserve aujourd'hui.
  "admin",
  "api",
  "dashboard",
  "app",
  "auth",
  "login",
  "logout",
  "signup",
  "account",
  "settings",
  "billing",
  "stripe",
  "webhook",
  "webhooks",
  // Les segments publics déjà servis par le produit.
  "play",
  "pronos",
  "scan",
  "jouer",
  "wallet",
  "portefeuille",
  "reserver",
  "vitrine",
  "menu",
  "carte",
  // Les segments techniques et d'infrastructure.
  "static",
  "assets",
  "public",
  "www",
  "cdn",
  "health",
  "status",
  "robots",
  "sitemap",
  "favicon",
  "next",
  // Les segments institutionnels du site.
  "blog",
  "help",
  "support",
  "contact",
  "legal",
  "cgu",
  "cgv",
  "privacy",
  "pricing",
  "tarifs",
  "demo",
  // Les verbes qu'un routeur finit toujours par vouloir.
  "new",
  "edit",
  "test",
] as const;

// ────────────────────────────────────────────────────────────
// LES CHEMINS
// ────────────────────────────────────────────────────────────

/**
 * L'adresse publique d'une vitrine : `/v/{slug}`.
 *
 * ── LE PRÉFIXE EST COURT PARCE QU'IL EST IMPRIMÉ ──
 *
 * Une lettre : l'adresse tient sur une carte de visite et le QR reste peu
 * dense. Ce n'est PAS le premier niveau, et le vocabulaire réservé reste
 * néanmoins utile — un slug `api` ou `dashboard` sous `/v/` ne collisionne
 * avec rien aujourd'hui, mais il crée une confusion d'intention qu'un
 * commerçant ayant imprimé ses QR ne peut plus défaire.
 */
export function cheminVitrine(slug: string): string {
  return `/v/${slug}`;
}

/** La même adresse, absolue — c'est elle que le QR du commerce encodera. */
export function urlVitrine(slug: string, appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}${cheminVitrine(slug)}`;
}

/**
 * L'adresse publique DANS UNE LANGUE : `/v/{slug}` en français, `/v/{slug}/en`.
 *
 * ── LE FRANÇAIS N'A PAS DE SEGMENT, ET C'EST DÉLIBÉRÉ ──
 *
 * C'est l'adresse IMPRIMÉE sur le QR : lui ajouter `/fr` aurait allongé ce qui
 * est gravé sur un support qu'on ne réimprime pas, et créé deux URL pour la même
 * page française — donc deux entrées de cache, deux pages indexées, et un choix
 * canonique à trancher pour rien.
 */
export function cheminVitrineLangue(slug: string, lang: LangueVitrine): string {
  return lang === "fr" ? cheminVitrine(slug) : `${cheminVitrine(slug)}/${lang}`;
}

/**
 * TOUS les chemins publics d'une vitrine — ce qu'une mutation doit revalider.
 *
 * La page publique est en ISR : sans cette purge, le commerçant qui corrige un
 * prix attend la fenêtre de revalidation devant sa propre carte. La liste est
 * DÉRIVÉE de `VITRINE_LANGUES` et non recopiée : une troisième langue serait
 * sinon servie par un cache que plus personne ne purge.
 */
export function cheminsPublicsVitrine(slug: string): string[] {
  return VITRINE_LANGUES.map((lang) => cheminVitrineLangue(slug, lang));
}

/**
 * Normalise comme `set_vitrine_slug` le fait, MOT POUR MOT : minuscules et
 * détourage, rien d'autre. Les espaces internes et les accents ne sont PAS
 * transformés en silence — ils restent hors forme, et sont refusés.
 */
export function normaliserSlugVitrine(saisie: string): string {
  return saisie.trim().toLowerCase();
}

/** Vrai si le slug (normalisé ou non) appartient au vocabulaire réservé. */
export function estSlugVitrineReserve(saisie: string): boolean {
  return VITRINE_SLUGS_RESERVES.includes(normaliserSlugVitrine(saisie));
}

/** Forme seule — le vocabulaire réservé se teste à part, comme en SQL. */
export function formeSlugVitrineValide(saisie: string): boolean {
  return VITRINE_SLUG_PATTERN.test(saisie);
}

// ────────────────────────────────────────────────────────────
// LES VUES DU CATALOGUE — aux noms de la base
// ────────────────────────────────────────────────────────────

export interface VitrineFicheView {
  id: string;
  nom: string;
  description: string | null;
  prix_affiche: string | null;
  /** Toujours `null` en L10 : aucun pipeline d'images n'est livré. */
  photo_path: string | null;
  /** Description saisie à la main (VIT-7). `null` = image décorative. */
  photo_alt: string | null;
  /** VIT-10 : le vocabulaire de la Boussole. Vide = jamais proposée. */
  facettes: FacetteVitrine[];
  /** VIT-10 : au plus une porte, ou aucune. */
  action: ActionVitrine | null;
  badges: BadgeVitrine[];
  allergenes: AllergeneVitrine[];
  /**
   * Drapeau SAISI À LA MAIN. Une fiche indisponible est rendue QUAND MÊME par
   * la RPC publique : l'écran la grise, il ne la fait pas disparaître.
   */
  disponible: boolean;
  ordre: number;
}

export interface VitrineRubriqueView {
  id: string;
  nom: string;
  ordre: number;
  /** VIT-10 : au plus une porte au rang de la rubrique, ou aucune. */
  action: ActionVitrine | null;
  fiches: VitrineFicheView[];
}

export interface VitrineCarteView {
  id: string;
  nom: string;
  ordre: number;
  /** Toujours `true` dans l'état PUBLIC : la RPC n'en rend pas d'autres. */
  active: boolean;
  /** `categories` et non `rubriques` : le nom de la table, jusqu'à l'écran. */
  categories: VitrineRubriqueView[];
}

export interface VitrineIdentiteView {
  /**
   * Le nom du commerce, JAMAIS vide côté public : il titre la page et son
   * onglet. `organizations.name` est `not null` en base ; le repli sur
   * « Ce commerce » ne sert qu'à un document jsonb corrompu, et il vaut mieux
   * qu'un titre vide.
   */
  nom: string;
  logo_url: string | null;
  accroche: string | null;
  histoire: string | null;
  horaires_texte: string | null;
  cover_path: string | null;
  cover_alt: string | null;
  /** VIT-12 : le commerçant autorise-t-il l'indexation ? Ne suffit pas à indexer. */
  indexable: boolean;
  /**
   * Le métier du commerce — il choisit les MOTS du chrome et le préréglage de
   * palette. Jamais vide côté public : `asSecteurVitrine` retombe sur
   * `commerce` pour une ligne écrite avant que la colonne n'existe.
   */
  secteur: SecteurVitrine;
  /**
   * LE BADGE DU HERO — « Ouvert · 12h–23h », écrit à la main.
   *
   * ── POURQUOI UN TEXTE ET NON UN CALCUL ──
   *
   * `horaires_texte` est un champ MULTILIGNE LIBRE : « Mardi au dimanche »,
   * « Fermé le lundi midi », « Service continu l'été ». Rien n'en déduit une
   * ouverture à l'instant T sans se tromper un jour férié, et un badge « Ouvert »
   * faux sur une page publique fait déplacer un client pour rien — c'est
   * strictement pire que pas de badge.
   *
   * Le commerçant écrit donc la phrase qu'il assume, et `null` la retire.
   * Un horaire STRUCTURÉ (jour, plage, exceptions) est un autre lot : il
   * demande un éditeur de créneaux, un fuseau et des jours fériés.
   */
  badge_ouverture: string | null;
  theme: ThemeVitrine;
}

export interface VitrineLiensView {
  google_review_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
}

/**
 * Un contenu mis en avant — CLÉ SŒUR de `liens`, et non une extension.
 *
 * `liens` porte TROIS adresses FIXES ET NOMMÉES : l'écran sait d'avance qu'il
 * rendra une icône Google, une Instagram et une TikTok. Un contenu mis en avant
 * appartient à une LISTE ORDONNÉE de longueur variable, dont l'écran ne connaît
 * ni le nombre ni les libellés — le commerçant les a écrits à la main.
 *
 * `rang` VOYAGE JUSQU'À L'ÉCRAN et n'est pas un détail de tri : c'est la PLACE,
 * elle identifie la ligne pour le commerçant (« remplacer le contenu n° 2 »)
 * comme pour les actions, qui écrivent par `(organisation, rang)` faute d'`id`
 * exposé côté public.
 */
export interface ContenuVitrineView {
  titre: string;
  url: string;
  rang: number;
}

// ────────────────────────────────────────────────────────────
// LES PORTES (VIT-3) — l'annuaire des autres pages publiques
//
// La vitrine était un cul-de-sac : le visiteur lisait la carte, et rien ne lui
// disait que ce commerce ouvre aussi une file d'attente, un stock à retirer ou
// un quiz. `vitrine_public_state` rend désormais cet annuaire, et ces types en
// sont la forme applicative.
//
// ── LA SEULE FAMILLE DE CE FICHIER EN camelCase, ET POURQUOI ──
//
// L'en-tête pose la règle : les vues gardent les noms de la base. Elle a une
// raison PRÉCISE — le thème repart en `jsonb` par le même chemin, et le
// renommer à la lecture obligerait à le renommer en sens inverse à l'écriture.
// Les portes ne repartent JAMAIS : elles sont dérivées de quatre tables
// d'autres modules, elles ne sont ni saisies ni enregistrées ici, et aucun
// aller-retour ne peut donc les faire échouer sur une clé oubliée. Leurs deux
// bornes de fenêtre deviennent `windowStartsAt`/`windowEndsAt` parce que leur
// seul consommateur est un composant React qui les formate — et non un `check`
// SQL qui les relira.
//
// ── AUCUN CHEMIN N'EST CONSTRUIT ICI ──
//
// Les `id` sortent en texte parce que ce sont des fragments d'URL
// (`/reserver/{id}`), mais l'assemblage du `href` appartient à l'écran : ce
// mappeur lit un document, il ne décide pas d'une route.
// ────────────────────────────────────────────────────────────

/**
 * LA BORNE DES PORTES — miroir de `c_max_portes` (20261014120000).
 *
 * La base tronque déjà à douze par liste. Ce nombre est recopié ici pour que la
 * lecture le tronque AUSSI : la page est servie en ISR, et un document bricolé
 * — ou écrit par une version future plus généreuse — ne doit pas pouvoir faire
 * grossir sans borne ce que l'écran rend à chaque visiteur.
 */
export const VITRINE_PORTES_MAX = 12;

/** Une porte de Réserver : un identifiant d'URL et un libellé. */
export interface PorteVitrineView {
  id: string;
  nom: string;
}

/**
 * Une offre de stock — la seule porte qui porte ses bornes de retrait.
 *
 * Elles voyagent avec la porte pour que l'écran puisse dire « jusqu'à 18 h »
 * sans second appel. `null` quand le document ne les porte pas : l'écran
 * affiche alors la porte sans horaire, ce qui reste juste, plutôt que de
 * disparaître pour une valeur illisible.
 */
export interface PorteOffreVitrineView extends PorteVitrineView {
  windowStartsAt: string | null;
  windowEndsAt: string | null;
}

/** Une expérience : `slug` et non `id`, parce que son URL publique est un slug. */
export interface PorteQuizVitrineView {
  slug: string;
  titre: string;
}

/**
 * L'annuaire complet. LES SIX LISTES EXISTENT TOUJOURS, éventuellement vides —
 * exactement comme en SQL : distinguer « pas de file » de « pas de clé » aurait
 * fait porter deux chemins à l'écran pour un seul état. C'est l'écran qui masque
 * un bloc vide, pas ce mappeur.
 */
export interface PortesVitrineView {
  reserver: {
    activites: PorteVitrineView[];
    files: PorteVitrineView[];
    offres: PorteOffreVitrineView[];
  };
  experiences: {
    quiz: PorteQuizVitrineView[];
    /** Calendriers actifs, identifiés par leur adresse publique. */
    calendars: PorteQuizVitrineView[];
    /** Pronostics publiés, y compris un classement final encore consultable. */
    pronostics: PorteQuizVitrineView[];
    /**
     * Duo Miroir est-il JOUABLE ici (L17) — un booléen, et rien de plus.
     *
     * La base ne publie ni le nombre de fiches épinglées ni leurs noms : le
     * lien à peindre se déduit du slug (`/lobby/nouveau/{slug}`), et publier
     * la sélection du commerçant reviendrait à annoncer la carte du jeu avant
     * que les joueurs l'ouvrent. Sa vérité vit dans `duo_jouable()` — au moins
     * deux fiches épinglées, la même condition qui laisse la manche démarrer.
     */
    duo: boolean;
  };
}

export type VitrinePublicState =
  | { state: "unavailable" }
  | {
      state: "ok";
      slug: string;
      /**
       * La langue RÉELLEMENT servie, jamais celle qui a été demandée : `?lang=de`
       * rend `fr`. C'est elle qui va sur l'attribut `lang` du document — le
       * redeviner côté écran aurait dupliqué la règle de repli du SQL.
       */
      lang: LangueVitrine;
      /** Le COMPTE, dans les deux langues : c'est sur la page française que
       *  l'écran décide s'il propose l'anglais. */
      langCoverage: VitrineLangCoverage;
      /** Le verdict du seuil, calculé UNE FOIS ici — voir
       *  `SEUIL_COUVERTURE_SELECTEUR`. */
      selecteurLangues: boolean;
      identite: VitrineIdentiteView;
      liens: VitrineLiensView;
      /**
       * Les UN À TROIS contenus mis en avant, ordonnés par `rang`. TOUJOURS
       * présente, éventuellement vide — même règle que les six listes de
       * `portes` : c'est l'écran qui masque un bloc vide, pas ce mappeur.
       */
      contenus: ContenuVitrineView[];
      cartes: VitrineCarteView[];
      /** L'annuaire des autres pages publiques du commerce — voir
       *  `PortesVitrineView`. Toujours présent, listes vides comprises. */
      portes: PortesVitrineView;
    };

export interface VitrineSettingsView {
  id: string;
  slug: string;
  published: boolean;
  accroche: string | null;
  histoire: string | null;
  horaires_texte: string | null;
  theme: ThemeVitrine;
  cover_path: string | null;
  cover_alt: string | null;
  /** VIT-12 : le commerçant autorise-t-il l'indexation ? Ne suffit pas à indexer. */
  indexable: boolean;
  /** VIT-13 : le métier, qui choisit le vocabulaire public et le préréglage. */
  secteur: SecteurVitrine;
  /** VIT-13 : la pastille du hero, écrite à la main. */
  badge_ouverture: string | null;
  updated_at: string | null;
}

export type VitrineDashboardState =
  | { state: "unavailable" }
  | {
      state: "ok";
      /** Le droit `vitrine` est-il vivant ? Indicatif : le trigger SQL garde. */
      module_access: boolean;
      /** `null` tant qu'aucune adresse n'a été choisie — c'est un premier pas. */
      settings: VitrineSettingsView | null;
      cartes: VitrineCarteView[];
    };

/**
 * Les quatre états de `set_vitrine_slug`, plus un cinquième qui n'existe QUE
 * côté application : `error`.
 *
 * Il ne ment pas sur le contrat SQL, il nomme ce que le contrat ne couvre pas —
 * un jsonb illisible, une panne de transport. Le replier sur `invalid_slug`
 * aurait dit au commerçant que SON adresse est mauvaise alors que c'est la
 * lecture qui a échoué : le pire message possible, puisqu'il l'envoie corriger
 * quelque chose de correct.
 */
export type SetVitrineSlugResult =
  | { state: "invalid_slug" | "reserved_slug" | "slug_taken" | "error" }
  | { state: "ok"; slug: string; created: boolean; changed: boolean };

// ────────────────────────────────────────────────────────────
// Lecture défensive du jsonb (motif src/lib/reserver.ts:356)
// ────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Ne garde que les membres CONNUS du vocabulaire, et déduplique.
 *
 * La base refuse déjà doublons et intrus ; ce filtre existe pour la lecture
 * d'une ligne écrite AVANT un retrait de vocabulaire — l'écran rendrait sinon
 * un badge sans libellé, c'est-à-dire une case vide que personne ne sait
 * expliquer.
 */
export function motsDuVocabulaireVitrine<T extends string>(
  brut: unknown,
  vocabulaire: readonly T[],
): T[] {
  const vus = new Set<string>();
  const sortie: T[] = [];
  for (const valeur of asArray(brut)) {
    const mot = asString(valeur);
    if (!mot || vus.has(mot)) continue;
    if (!(vocabulaire as readonly string[]).includes(mot)) continue;
    vus.add(mot);
    sortie.push(mot as T);
  }
  return sortie;
}

/**
 * Lit le thème DÉFENSIVEMENT, en conservant les noms de la base.
 *
 * Tout ce qui n'est pas reconnu est OMIS plutôt que rendu tel quel : le thème
 * part dans des variables CSS et dans un attribut `style`, et laisser passer
 * une valeur jamais vérifiée y serait le seul endroit de la vitrine où cela
 * compte vraiment.
 */
export function mapThemeVitrine(raw: unknown): ThemeVitrine {
  const root = asRecord(raw);
  if (!root) return {};
  const theme: ThemeVitrine = {};

  const couleurs = asRecord(root.couleurs);
  if (couleurs) {
    const hex = /^#[0-9a-fA-F]{6}$/;
    const primary = asString(couleurs.primary);
    const secondary = asString(couleurs.secondary);
    const retenues: { primary?: string; secondary?: string } = {};
    if (primary && hex.test(primary)) retenues.primary = primary;
    if (secondary && hex.test(secondary)) retenues.secondary = secondary;
    if (retenues.primary || retenues.secondary) theme.couleurs = retenues;
  }

  const polices = asRecord(root.polices);
  if (polices) {
    const connue = (v: unknown): FontKey | undefined => {
      const mot = asString(v);
      return mot && (VITRINE_THEME_POLICES as readonly string[]).includes(mot)
        ? (mot as FontKey)
        : undefined;
    };
    const heading = connue(polices.heading);
    const body = connue(polices.body);
    if (heading || body) {
      theme.polices = {};
      if (heading) theme.polices.heading = heading;
      if (body) theme.polices.body = body;
    }
  }

  const style = asString(root.style_cartes);
  if (style && (VITRINE_STYLES_CARTES as readonly string[]).includes(style)) {
    theme.style_cartes = style as StyleCartesVitrine;
  }

  // La clé n'est posée que si elle EXISTAIT : `resoudreThemeVitrine` retombe sur
  // l'ordre naturel pour une liste vide, et poser `[]` là où la base n'a rien
  // écrit aurait inventé un réglage que le commerçant n'a pas fait.
  if (Array.isArray(root.ordre_blocs)) {
    theme.ordre_blocs = motsDuVocabulaireVitrine(root.ordre_blocs, VITRINE_BLOCS);
  }

  const allure = mapAllureVitrine(root.allure);
  if (allure) theme.allure = allure;

  return theme;
}

/**
 * L'allure, lue clé par clé — et `undefined` quand rien n'est reconnu.
 *
 * ── `undefined` ET NON `{}` ──
 *
 * Un objet vide serait posé sur `theme.allure` et ferait croire à un réglage.
 * C'est le même arbitrage que `ordre_blocs` : la clé n'existe que si elle
 * portait quelque chose.
 *
 * ── CE QUI EST HORS BORNES EST OMIS, PAS RABOTÉ ──
 *
 * Ramener 900 à 420 pour `hero_hauteur` rendrait une page qui a l'air réglée
 * alors qu'elle ne l'est pas, et le commerçant chercherait longtemps pourquoi
 * son curseur ne fait rien. Omettre la clé fait retomber sur le défaut de la
 * maquette, qui est une valeur que quelqu'un a choisie.
 *
 * Aucune de ces valeurs ne peut normalement arriver : la base les refuse. Ce
 * filtre couvre la ligne écrite AVANT un resserrement de bornes — même motif
 * que `motsDuVocabulaireVitrine`.
 */
function mapAllureVitrine(raw: unknown): AllureVitrine | undefined {
  const root = asRecord(raw);
  if (!root) return undefined;

  const allure: AllureVitrine = {};
  let posee = false;

  for (const cle of VITRINE_ALLURE_ENUMS_CLES) {
    const mot = asString(root[cle]);
    const valeurs = VITRINE_ALLURE_ENUMS[cle].valeurs as readonly string[];
    if (mot && valeurs.includes(mot)) {
      // `never` : chaque clé a son propre type d'union, et TypeScript ne peut
      // pas relier l'indice à la valeur dans une boucle. L'appartenance vient
      // d'être vérifiée contre la MÊME table que celle qui type le champ.
      allure[cle] = mot as never;
      posee = true;
    }
  }

  for (const cle of VITRINE_ALLURE_CHIFFRES) {
    const brut = root[cle];
    const bornes = VITRINE_ALLURE_BORNES[cle];
    if (
      typeof brut === "number" &&
      Number.isFinite(brut) &&
      brut >= bornes.min &&
      brut <= bornes.max
    ) {
      allure[cle] = brut;
      posee = true;
    }
  }

  for (const cle of VITRINE_ALLURE_BOOLEENS) {
    if (typeof root[cle] === "boolean") {
      allure[cle] = root[cle];
      posee = true;
    }
  }

  return posee ? allure : undefined;
}

function mapFiche(raw: unknown): VitrineFicheView | null {
  const root = asRecord(raw);
  if (!root) return null;
  const id = asString(root.id);
  const nom = asString(root.nom);
  // Une fiche sans identifiant ni nom est corrompue, pas incomplète : il n'y a
  // rien à rendre et rien à éditer. On la retire plutôt que d'inventer un titre.
  if (!id || !nom) return null;
  return {
    id,
    nom,
    description: asString(root.description),
    prix_affiche: asString(root.prix_affiche),
    photo_path: asString(root.photo_path),
    photo_alt: asString(root.photo_alt),
    facettes: motsDuVocabulaireVitrine(root.facettes, VITRINE_FACETTES),
    action: actionVitrine(root.action),
    badges: motsDuVocabulaireVitrine(root.badges, VITRINE_BADGES),
    allergenes: motsDuVocabulaireVitrine(root.allergenes, VITRINE_ALLERGENES),
    // Repli FERMÉ : un drapeau illisible affiche « indisponible » plutôt que de
    // promettre un plat que la cuisine n'a plus.
    disponible: root.disponible === true,
    ordre: asInt(root.ordre) ?? 0,
  };
}

function mapRubrique(raw: unknown): VitrineRubriqueView | null {
  const root = asRecord(raw);
  if (!root) return null;
  const id = asString(root.id);
  const nom = asString(root.nom);
  if (!id || !nom) return null;
  return {
    id,
    nom,
    ordre: asInt(root.ordre) ?? 0,
    action: actionVitrine(root.action),
    fiches: asArray(root.fiches)
      .map(mapFiche)
      .filter((f): f is VitrineFicheView => f !== null),
  };
}

/**
 * L'arbre du catalogue, tel que `vitrine_cartes_json` le rend.
 *
 * L'ORDRE N'EST PAS RECALCULÉ ICI : la RPC trie déjà par `(ordre, id)` aux trois
 * niveaux, et retrier côté application aurait créé un second ordre à tenir —
 * celui qui, le jour où les deux divergent, gagne sans qu'on sache lequel.
 */
export function mapVitrineCartes(raw: unknown): VitrineCarteView[] {
  return asArray(raw)
    .map((brut): VitrineCarteView | null => {
      const root = asRecord(brut);
      if (!root) return null;
      const id = asString(root.id);
      const nom = asString(root.nom);
      if (!id || !nom) return null;
      return {
        id,
        nom,
        ordre: asInt(root.ordre) ?? 0,
        active: root.active === true,
        categories: asArray(root.categories)
          .map(mapRubrique)
          .filter((r): r is VitrineRubriqueView => r !== null),
      };
    })
    .filter((c): c is VitrineCarteView => c !== null);
}

/**
 * Une liste de portes, LUE DÉFENSIVEMENT ET TRONQUÉE À DOUZE.
 *
 * La borne compte les portes RETENUES et non les entrées lues : un document où
 * une entrée sur deux est corrompue rend quand même douze portes valides, ce qui
 * est le comportement utile — la troncature est là pour le poids de la page, pas
 * pour punir un document abîmé.
 *
 * Une liste absente ou illisible vaut la liste VIDE : `asArray` rend `[]` pour
 * tout ce qui n'est pas un tableau, et une clé manquante prend le même chemin
 * qu'une clé vide. C'est ce qui garantit que les six listes existent toujours,
 * même si la base cessait un jour de le promettre.
 */
function mapListePortes<T>(
  raw: unknown,
  lire: (brut: unknown) => T | null,
): T[] {
  const sortie: T[] = [];
  for (const brut of asArray(raw)) {
    if (sortie.length >= VITRINE_PORTES_MAX) break;
    const porte = lire(brut);
    if (porte) sortie.push(porte);
  }
  return sortie;
}

/**
 * Une porte sans identifiant ni libellé est écartée, motif `mapFiche` : il n'y a
 * ni `href` à construire ni texte à cliquer. Un lien vide vers `/reserver/`
 * serait pire qu'une porte absente — il envoie le visiteur sur un 404 signé du
 * commerce.
 */
function mapPorteSimple(raw: unknown): PorteVitrineView | null {
  const root = asRecord(raw);
  if (!root) return null;
  const id = asString(root.id);
  const nom = asString(root.nom);
  if (!id || !nom) return null;
  return { id, nom };
}

function mapPorteOffre(raw: unknown): PorteOffreVitrineView | null {
  const root = asRecord(raw);
  if (!root) return null;
  const base = mapPorteSimple(root);
  if (!base) return null;
  return {
    ...base,
    // Les deux bornes sont rendues telles quelles — c'est de l'ISO 8601 produit
    // par Postgres, et le formatage appartient à l'écran, qui seul connaît la
    // langue servie. Une valeur non textuelle vaut `null` : une porte sans
    // horaire reste une porte, une porte avec un horaire faux ne l'est pas.
    windowStartsAt: asString(root.window_starts_at),
    windowEndsAt: asString(root.window_ends_at),
  };
}

function mapPorteQuiz(raw: unknown): PorteQuizVitrineView | null {
  const root = asRecord(raw);
  if (!root) return null;
  const slug = asString(root.slug);
  const titre = asString(root.titre);
  if (!slug || !titre) return null;
  return { slug, titre };
}

/**
 * Lecture de la clé `portes` de `vitrine_public_state`.
 *
 * Rend TOUJOURS les six listes, y compris sur `undefined` — un document écrit
 * avant VIT-3 n'a pas cette clé, et l'écran ne doit pas avoir à distinguer
 * « vitrine d'avant les portes » de « commerce sans porte ouverte ».
 */
export function mapPortesVitrine(raw: unknown): PortesVitrineView {
  const root = asRecord(raw);
  const reserver = asRecord(root?.reserver);
  const experiences = asRecord(root?.experiences);
  return {
    reserver: {
      activites: mapListePortes(reserver?.activites, mapPorteSimple),
      files: mapListePortes(reserver?.files, mapPorteSimple),
      offres: mapListePortes(reserver?.offres, mapPorteOffre),
    },
    experiences: {
      quiz: mapListePortes(experiences?.quiz, mapPorteQuiz),
      calendars: mapListePortes(experiences?.calendars, mapPorteQuiz),
      pronostics: mapListePortes(experiences?.pronostics, mapPorteQuiz),
      // REPLI FERMÉ : tout ce qui n'est pas exactement `true` vaut « pas de
      // jeu ici ». Un document ancien (d'avant L17) n'a pas la clé, et la
      // porte ne doit pas s'ouvrir sur une absence.
      duo: experiences?.duo === true,
    },
  };
}

const VITRINE_INDISPONIBLE: VitrinePublicState = { state: "unavailable" };

/**
 * Lit `lang_coverage`, DÉFENSIVEMENT et sans jamais dépasser 100 %.
 *
 * La RPC compte par `left join` depuis les champs traduisibles : `frais` ne
 * peut pas y excéder `total`. Le bornage est donc écrit pour le document
 * CORROMPU — une charge utile bricolée qui rendrait `frais > total` allumerait
 * sinon le sélecteur sur une vitrine non traduite, et le visiteur anglophone
 * verrait une page française sous un drapeau anglais. Une valeur illisible vaut
 * ZÉRO : le repli fermé, celui qui n'offre pas l'anglais.
 *
 * La clé `lang` du document (toujours `'en'` aujourd'hui) est IGNORÉE : il n'y a
 * qu'une langue traduisible, et lire un nom de langue pour ne rien en faire
 * aurait laissé croire que ce mappeur sait en gérer plusieurs.
 */
function mapLangCoverage(raw: unknown): VitrineLangCoverage {
  const root = asRecord(raw);
  if (!root) return { total: 0, frais: 0 };
  const total = Math.max(0, asInt(root.total_champs_traduisibles) ?? 0);
  const frais = Math.max(0, asInt(root.traduits_frais) ?? 0);
  return { total, frais: Math.min(frais, total) };
}

/**
 * Un lien SORTANT servi à un visiteur anonyme — revalidé À LA LECTURE.
 *
 * La liste blanche d'hôtes (`estLienInvitationSur`) n'était tenue qu'à
 * l'ÉCRITURE, par le schéma des réglages. C'est insuffisant ici : ces trois
 * valeurs partent en `href` sur une page publique, et une valeur écrite avant
 * que la liste blanche n'existe — ou posée par un chemin qui l'ignorerait —
 * ferait de la vitrine un relais de redirection avec la caution visuelle du
 * commerce. C'est la LECTURE qui doit être sûre.
 *
 * Exactement le motif de `lib/play-context.ts:64` : même garde, et surtout même
 * repli MUET. Une valeur refusée vaut `null`, le lien ne s'affiche pas, et
 * personne n'attend de message d'erreur sur une lecture publique.
 *
 * `''` (« non renseigné », 20260918120000) tombe donc en `null` plutôt que
 * d'être rendu tel quel : `estLienInvitationSur` refuse la chaîne vide, et
 * l'écran filtrait déjà les deux de la même façon (`Boolean(href?.trim())`).
 */
function asLienSortant(value: unknown): string | null {
  const lien = asString(value);
  return lien !== null && estLienInvitationSur(lien) ? lien : null;
}

/**
 * L'adresse d'un CONTENU MIS EN AVANT, revalidée à la lecture — et PAS avec la
 * garde des trois liens sociaux.
 *
 * ── POURQUOI PAS `estLienInvitationSur` ──
 *
 * Cette fonction-là tient une LISTE BLANCHE D'HÔTES (Instagram, TikTok, les
 * cinq formes de la fiche Google) parce que ses trois champs désignent trois
 * services connus d'avance. Un contenu mis en avant est l'inverse exact : c'est
 * une adresse ARBITRAIRE, choisie par le commerçant — un article de presse, une
 * vidéo, une page de menu chez un tiers. La lui passer aurait refusé en silence
 * tout ce qui n'est pas un réseau social, c'est-à-dire à peu près tout ce que
 * la fonctionnalité existe pour montrer.
 *
 * Ce qui est gardé, ce n'est donc pas QUI est au bout, mais ce que la valeur
 * peut faire une fois posée en `href` sur une page publique servie sous le nom
 * du commerce. Quatre refus, plus la borne de longueur :
 *
 *   * ce qui ne se parse pas comme une URL absolue — un `href` relatif signé du
 *     commerce enverrait le visiteur sur une page de l'application ;
 *   * tout schéma autre que `https:` — `javascript:` et `data:` d'abord, mais
 *     `http:` compte autant : bloqué par le navigateur depuis une page TLS,
 *     sans que personne ne sache pourquoi ;
 *   * les identifiants dans l'URL (`https://qui:quoi@ailleurs.test`), motif de
 *     `lib/webhook-url.ts` — ils ne servent qu'à masquer l'hôte réel dans la
 *     barre d'adresse ;
 *   * tout caractère d'espacement, retour à la ligne compris : c'est le miroir
 *     exact du `check` SQL (`url ~ '^https://[^[:space:]]+$'`), et il est
 *     revérifié ICI parce que `new URL` ne le refuse pas — il ré-encode ou
 *     supprime en silence, donc la chaîne BRUTE qu'on rend pourrait encore le
 *     porter.
 *
 * LE PORT N'EST PAS REFUSÉ, contrairement aux liens sociaux : là-bas
 * `https://instagram.com:1` n'est pas une adresse qu'Instagram sert, seulement
 * une façon de pointer un autre écouteur sur un hôte de confiance. Ici il n'y a
 * aucun hôte de confiance à protéger — le commerçant a choisi l'hôte ET le port.
 *
 * REPLI MUET, motif `asLienSortant` : une valeur refusée vaut `null`, et
 * `mapContenusVitrine` fait alors disparaître le contenu ENTIER. Un titre
 * cliquable sans adresse, ou pire une adresse rendue sans son titre, serait un
 * demi-contenu que l'écran devrait apprendre à afficher.
 */
function asLienContenu(value: unknown): string | null {
  const lien = asString(value);
  if (lien === null || lien.length === 0) return null;
  if (lien.length > VITRINE_CONTENU_URL_MAX) return null;
  if (/\s/.test(lien)) return null;
  let url: URL;
  try {
    url = new URL(lien);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return lien;
}

/**
 * Lecture de la clé `contenus` de `vitrine_public_state`.
 *
 * Rend TOUJOURS une liste, y compris sur `undefined` — un document écrit avant
 * VIT-4 n'a pas cette clé, et l'écran ne doit pas avoir à distinguer « vitrine
 * d'avant les contenus » de « commerce qui n'en a mis aucun ».
 *
 * TROIS AU PLUS, et la borne compte les contenus RETENUS et non les entrées
 * lues — même arbitrage que `mapListePortes` : la troncature existe pour le
 * poids de la page, pas pour punir un document abîmé.
 *
 * L'ORDRE N'EST PAS RECALCULÉ, motif `mapVitrineCartes` : la RPC trie déjà par
 * `rang`, et l'unicité `(organization_id, rang)` rend ce tri total. Retrier ici
 * aurait créé un second ordre à tenir — celui qui, le jour où les deux
 * divergent, gagne sans qu'on sache lequel.
 *
 * LES TROIS CHAMPS SONT EXIGÉS : un contenu sans titre, sans adresse servable
 * ou sans place lisible est ÉCARTÉ EN ENTIER, motif `mapFiche`. Il n'y a ni
 * texte à cliquer, ni `href` à poser, ni place où le poser — et un demi-contenu
 * serait un état de plus que l'écran devrait apprendre à rendre.
 */
export function mapContenusVitrine(raw: unknown): ContenuVitrineView[] {
  const sortie: ContenuVitrineView[] = [];
  for (const brut of asArray(raw)) {
    if (sortie.length >= VITRINE_CONTENUS_MAX) break;
    const root = asRecord(brut);
    if (!root) continue;
    const titre = asString(root.titre);
    const url = asLienContenu(root.url);
    const rang = asInt(root.rang);
    if (!titre || !url || rang === null) continue;
    sortie.push({ titre, url, rang });
  }
  return sortie;
}

/** Lecture de `vitrine_public_state`. Tout ce qui n'est pas « ok » est muet. */
export function mapVitrinePublicState(raw: unknown): VitrinePublicState {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return VITRINE_INDISPONIBLE;
  const slug = asString(root.slug);
  if (!slug) return VITRINE_INDISPONIBLE;

  const identite = asRecord(root.identite) ?? {};
  const liens = asRecord(root.liens) ?? {};
  const langCoverage = mapLangCoverage(root.lang_coverage);

  return {
    state: "ok",
    slug,
    // REPLI FERMÉ SUR LE FRANÇAIS, exactement comme la RPC : tout ce qui n'est
    // pas la langue traduite est du français. Un document sans `lang` — écrit
    // par une version d'avant L11 — rend donc une page française cohérente
    // plutôt qu'un attribut de langue inventé.
    lang: asString(root.lang) === VITRINE_LANGUE_TRADUITE ? "en" : "fr",
    langCoverage,
    selecteurLangues: selecteurLanguesOuvert(langCoverage),
    identite: {
      // `organizations.name` est `not null` : ce repli ne couvre qu'un document
      // corrompu, et il vaut mieux qu'un `<title>` vide.
      nom: asString(identite.nom) ?? "Ce commerce",
      logo_url: asString(identite.logo_url),
      accroche: asString(identite.accroche),
      histoire: asString(identite.histoire),
      horaires_texte: asString(identite.horaires_texte),
      cover_path: asString(identite.cover_path),
      cover_alt: asString(identite.cover_alt),
      indexable: identite.indexable === true,
      secteur: asSecteurVitrine(identite.secteur),
      badge_ouverture: asString(identite.badge_ouverture),
      theme: mapThemeVitrine(identite.theme),
    },
    liens: {
      google_review_url: asLienSortant(liens.google_review_url),
      instagram_url: asLienSortant(liens.instagram_url),
      tiktok_url: asLienSortant(liens.tiktok_url),
    },
    contenus: mapContenusVitrine(root.contenus),
    cartes: mapVitrineCartes(root.cartes),
    portes: mapPortesVitrine(root.portes),
  };
}

/** Lecture de `vitrine_dashboard_state`. */
export function mapVitrineDashboardState(raw: unknown): VitrineDashboardState {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return { state: "unavailable" };

  const brut = asRecord(root.settings);
  let settings: VitrineSettingsView | null = null;
  if (brut) {
    const id = asString(brut.id);
    const slug = asString(brut.slug);
    // Une ligne de réglages sans identité est illisible : on rend `null`,
    // c'est-à-dire « aucune adresse choisie », qui est l'état que l'écran sait
    // proposer de corriger — plutôt qu'un formulaire prérempli de vide.
    if (id && slug) {
      settings = {
        id,
        slug,
        published: brut.published === true,
        accroche: asString(brut.accroche),
        histoire: asString(brut.histoire),
        horaires_texte: asString(brut.horaires_texte),
        theme: mapThemeVitrine(brut.theme),
        cover_path: asString(brut.cover_path),
        cover_alt: asString(brut.cover_alt),
        indexable: brut.indexable === true,
        secteur: asSecteurVitrine(brut.secteur),
        badge_ouverture: asString(brut.badge_ouverture),
        updated_at: asString(brut.updated_at),
      };
    }
  }

  return {
    state: "ok",
    module_access: root.module_access === true,
    settings,
    cartes: mapVitrineCartes(root.cartes),
  };
}

/** Lecture de `set_vitrine_slug`. Un document illisible vaut `error`. */
export function mapSetVitrineSlug(raw: unknown): SetVitrineSlugResult {
  const root = asRecord(raw);
  const state = root ? asString(root.state) : null;
  if (
    state === "invalid_slug" ||
    state === "reserved_slug" ||
    state === "slug_taken"
  ) {
    return { state };
  }
  if (state !== "ok") return { state: "error" };
  const slug = asString(root?.slug);
  if (!slug) return { state: "error" };
  return {
    state: "ok",
    slug,
    created: root?.created === true,
    changed: root?.changed === true,
  };
}

// ════════════════════════════════════════════════════════════
// L'ÉTAT DE TRADUCTION, TEL QUE L'ÉCRAN LE LIT (VIT-5, lot L15)
//
// Lecture de `vitrine_translation_state` (20261016120000). Les noms de la base
// sont ici TRADUITS en noms de vue (`cible_type` → `cibleType`) — seul endroit
// du fichier où la règle « un seul jeu de noms » cède, et pour une raison : ces
// valeurs ne sont pas des colonnes d'un formulaire, ce sont les propriétés d'un
// tableau que React rend et reposte. Les clés POSTÉES, elles, gardent les noms
// de la base (voir `setVitrineTraductionSchema`).
// ════════════════════════════════════════════════════════════

/** Une ligne du tableau : un champ d'une cible, son état, ses deux textes. */
export interface TraductionChampView {
  champ: ChampTraductionVitrine;
  etat: EtatTraductionVitrine;
  /**
   * Le français COURANT — celui qui a périmé la traduction, jamais celui
   * d'alors. `""` quand la RPC n'a pas retrouvé la source : voir
   * `mapTraductionChamp`, la ligne reste montrée.
   */
  texteSource: string;
  /** L'anglais stocké, PÉRIMÉ COMPRIS : une périmée se retouche. */
  texteTraduit: string | null;
}

/** Un bloc du tableau : une carte, une rubrique, une fiche, ou les réglages. */
export interface TraductionCibleView {
  cibleType: CibleTraductionVitrine;
  cibleId: string;
  /** Le nom lisible — « Carte du soir », « Velouté », ou « Réglages ». */
  libelle: string;
  /**
   * LA VERSION VUE : l'`updated_at` de la cible au moment de cette lecture.
   *
   * Elle est repostée TELLE QUELLE à l'enregistrement (`p_version_source`), et
   * c'est tout le modèle : la traduction vaut pour la version du texte source
   * que le commerçant avait sous les yeux. Si la source a bougé entre la
   * lecture et l'envoi, la traduction naît PÉRIMÉE — ce qui est exact, et
   * infiniment préférable à une fraîcheur déclarée sur un texte jamais lu.
   *
   * `""` si le document ne la porte pas : la ligne reste affichée (voir
   * `mapTraductionCible`), et le schéma de l'action refuse l'enregistrement.
   */
  version: string;
  champs: TraductionChampView[];
}

export interface TraductionEtatView {
  /**
   * LE RÉSUMÉ VIENT DE LA RPC, il n'est pas recompté depuis `cibles`.
   *
   * C'est le seul comptage qui porte sur TOUT le catalogue, cartes désactivées
   * comprises, et l'écran l'affiche `frais / total` contre
   * `SEUIL_COUVERTURE_SELECTEUR`. Le recalculer depuis la liste rendue aurait
   * fait dépendre le chiffre de ce que ce mappeur a su lire.
   */
  resume: { total: number; frais: number; perimes: number; manquants: number };
  cibles: TraductionCibleView[];
}

/**
 * Le repli : rien à traduire, rien à montrer.
 *
 * FABRIQUÉ À CHAQUE APPEL et non partagé comme `VITRINE_INDISPONIBLE` : il
 * porte un tableau, et une constante de module rendue N fois donnerait N
 * appelants sur la même liste mutable.
 */
function traductionVide(): TraductionEtatView {
  return {
    resume: { total: 0, frais: 0, perimes: 0, manquants: 0 },
    cibles: [],
  };
}

const TRADUCTION_LIBELLE_INCONNU = "Sans titre";

/**
 * Une ligne de champ.
 *
 * ── CE QUI FAIT DISPARAÎTRE UNE LIGNE, ET CE QUI NE LE FAIT PAS ──
 *
 * Un `champ` ou un `etat` hors vocabulaire fait disparaître la ligne : la
 * première valeur ne peut pas être repostée (le schéma de l'action la refuse),
 * la seconde ne peut pas être rendue. C'est le motif de
 * `motsDuVocabulaireVitrine` — l'inconnu est OMIS, jamais rendu tel quel.
 *
 * Un `texte_source` nul, LUI, NE LA FAIT PAS DISPARAÎTRE, et c'est le point
 * délicat. La migration s'en explique : son `left join` laisse sortir un champ
 * dont la source n'a pas été retrouvée « et [il] reste COMPTÉ — un `inner join`
 * l'aurait fait disparaître de la liste tout en le laissant dans le résumé
 * chiffré, soit un écran qui affirme "3 manquants" en n'en montrant que deux ».
 * Le refaire ici rétablirait exactement l'incohérence que le SQL a refusée. La
 * ligne sort donc avec une source vide, comptée comme les autres.
 */
function mapTraductionChamp(raw: unknown): TraductionChampView | null {
  const root = asRecord(raw);
  if (!root) return null;

  const champ = asString(root.champ);
  const etat = asString(root.etat);
  if (
    !champ ||
    !(VITRINE_TRADUCTION_CHAMPS as readonly string[]).includes(champ)
  ) {
    return null;
  }
  if (
    !etat ||
    !(VITRINE_TRADUCTION_ETATS as readonly string[]).includes(etat)
  ) {
    return null;
  }

  return {
    champ: champ as ChampTraductionVitrine,
    etat: etat as EtatTraductionVitrine,
    texteSource: asString(root.texte_source) ?? "",
    texteTraduit: asString(root.texte_traduit),
  };
}

/**
 * Un bloc de cible.
 *
 * ── L'IDENTITÉ EST REQUISE, LE TEXTE NE L'EST PAS ──
 *
 * Sans `cible_type` connu ni `cible_id`, il n'y a ni clé de rendu ni cible à
 * poster : le bloc est retiré, motif `mapFiche`. Le LIBELLÉ et la VERSION, eux,
 * ne conditionnent rien de tout cela — la migration les calcule par jointure
 * (`max(libelle)`) et prévoit explicitement qu'une jointure ratée ne fasse pas
 * disparaître de ligne. Un libellé illisible vaut donc « Sans titre » et une
 * version illisible vaut `""` : le bloc reste montré, reste compté, et c'est le
 * schéma de l'action qui refusera l'enregistrement d'une ligne sans version —
 * un message d'échec vaut mieux qu'un plat qui manque au tableau sans que le
 * résumé chiffré bouge.
 *
 * Un bloc dont AUCUN champ n'a survécu est retiré : il ne resterait qu'un titre
 * au-dessus de rien.
 */
function mapTraductionCible(raw: unknown): TraductionCibleView | null {
  const root = asRecord(raw);
  if (!root) return null;

  const cibleType = asString(root.cible_type);
  const cibleId = asString(root.cible_id);
  if (
    !cibleType ||
    !(VITRINE_TRADUCTION_CIBLES as readonly string[]).includes(cibleType)
  ) {
    return null;
  }
  if (!cibleId) return null;

  const champs: TraductionChampView[] = [];
  for (const brut of asArray(root.champs)) {
    const champ = mapTraductionChamp(brut);
    if (champ) champs.push(champ);
  }
  if (champs.length === 0) return null;

  return {
    cibleType: cibleType as CibleTraductionVitrine,
    cibleId,
    libelle: asString(root.libelle) ?? TRADUCTION_LIBELLE_INCONNU,
    version: asString(root.version) ?? "",
    champs,
  };
}

/**
 * Lecture de `vitrine_translation_state`.
 *
 * ── LES COMPTEURS SONT BORNÉS PAR LE TOTAL ──
 *
 * Même raison qu'à `mapLangCoverage`, et elle vaut surtout pour `frais` :
 * l'écran affiche `frais / total` contre `SEUIL_COUVERTURE_SELECTEUR`, et un
 * document bricolé rendant `frais > total` annoncerait au commerçant que sa
 * vitrine est traduite au-delà du seuil alors qu'elle ne l'est pas. Les deux
 * autres sont bornés pour la même raison de cohérence, pas parce qu'un affichage
 * en dépendrait.
 *
 * Un document illisible — absent, tronqué, `state` autre qu'`ok`, y compris
 * l'`unavailable` d'une organisation inconnue — vaut le tableau VIDE et le
 * résumé à zéro. C'est l'état que l'écran sait rendre (« rien à traduire »), et
 * il ne promet rien.
 */
export function mapVitrineTraductionState(raw: unknown): TraductionEtatView {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return traductionVide();

  const brut = asRecord(root.resume);
  const total = Math.max(0, asInt(brut?.total_champs_traduisibles) ?? 0);
  const borne = (valeur: unknown): number =>
    Math.min(Math.max(0, asInt(valeur) ?? 0), total);

  const cibles: TraductionCibleView[] = [];
  for (const entree of asArray(root.cibles)) {
    const cible = mapTraductionCible(entree);
    if (cible) cibles.push(cible);
  }

  return {
    resume: {
      total,
      frais: borne(brut?.traduits_frais),
      perimes: borne(brut?.perimes),
      manquants: borne(brut?.manquants),
    },
    cibles,
  };
}

/**
 * Les refus NOMMÉS des deux portes d'écriture, plus l'illisible.
 *
 * `error` n'existe pas dans le contrat SQL : il nomme ce que le contrat ne
 * couvre pas — un jsonb illisible, une réponse tronquée. Motif
 * `SetVitrineSlugResult`, et pour la même raison : replier sur `invalid_texte`
 * aurait envoyé le commerçant corriger un texte correct.
 */
export type RefusTraductionVitrine =
  | "invalid_cible"
  | "invalid_lang"
  | "invalid_champ"
  | "invalid_texte"
  | "error";

export type UpsertVitrineTraductionResult =
  | { state: RefusTraductionVitrine }
  | { state: "ok"; created: boolean; changed: boolean };

/**
 * Le retrait ne peut pas rendre `invalid_texte` — il n'en poste aucun — mais son
 * type le porte quand même : les deux portes partagent leurs refus, et donner à
 * l'une un vocabulaire amputé aurait obligé l'action à distinguer deux tables de
 * messages pour un jeu de refus identique.
 */
export type DeleteVitrineTraductionResult =
  | { state: RefusTraductionVitrine }
  | { state: "ok"; deleted: boolean };

/** Les quatre refus nommés, ou `error`. Rendu `null` sur un succès. */
function refusTraduction(raw: unknown): RefusTraductionVitrine | null {
  const root = asRecord(raw);
  const state = root ? asString(root.state) : null;
  if (
    state === "invalid_cible" ||
    state === "invalid_lang" ||
    state === "invalid_champ" ||
    state === "invalid_texte"
  ) {
    return state;
  }
  return state === "ok" ? null : "error";
}

/** Lecture d'`upsert_vitrine_translation`. Un document illisible vaut `error`. */
export function mapUpsertVitrineTraduction(
  raw: unknown,
): UpsertVitrineTraductionResult {
  const refus = refusTraduction(raw);
  if (refus) return { state: refus };
  const root = asRecord(raw);
  return {
    state: "ok",
    created: root?.created === true,
    // `changed: false` est un SUCCÈS : le texte posté était déjà celui qui est
    // stocké, pour la même version source. La RPC n'écrit rien et le dit.
    changed: root?.changed === true,
  };
}

/** Lecture de `delete_vitrine_translation`. Idempotente : `deleted` peut être faux. */
export function mapDeleteVitrineTraduction(
  raw: unknown,
): DeleteVitrineTraductionResult {
  const refus = refusTraduction(raw);
  if (refus) return { state: refus };
  const root = asRecord(raw);
  return { state: "ok", deleted: root?.deleted === true };
}

/**
 * LA RÉPONSE DE `delete_vitrine` (VIT-14) — trois états, et un seul est un échec.
 *
 * `ok` porte l'adresse LIBÉRÉE, dont l'appelant a besoin pour purger le cache
 * ISR de `/v/{slug}` : après la suppression, ce slug n'existe plus nulle part
 * et personne d'autre ne saurait le retrouver.
 *
 * `absente` n'est PAS une erreur — deux onglets, deux clics, ou une vitrine
 * jamais créée. L'écran doit répondre « c'est fait », pas « impossible ».
 *
 * `error` est le seul état hors contrat : la RPC a rendu quelque chose
 * d'illisible, et cela se journalise, contrairement aux deux autres.
 */
export type DeleteVitrineResult =
  | { state: "ok"; slug: string; cartes: number; rubriques: number; fiches: number }
  | { state: "absente" }
  | { state: "error" };

export function mapDeleteVitrine(raw: unknown): DeleteVitrineResult {
  const root = asRecord(raw);
  const state = root ? asString(root.state) : null;
  if (state === "absente") return { state: "absente" };
  if (state !== "ok") return { state: "error" };

  const slug = asString(root?.slug);
  // Un `ok` SANS adresse est incohérent : la RPC ne rend `ok` que lorsqu'elle a
  // trouvé une vitrine, donc un slug. On refuse de deviner.
  if (!slug) return { state: "error" };

  const entier = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;

  return {
    state: "ok",
    slug,
    cartes: entier(root?.cartes),
    rubriques: entier(root?.rubriques),
    fiches: entier(root?.fiches),
  };
}
