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
/** Chemin d'image (couverture ou photo de fiche) : 300 caractères. */
export const VITRINE_CHEMIN_IMAGE_MAX = 300;

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
}

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
  theme: ThemeVitrine;
}

export interface VitrineLiensView {
  google_review_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
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

  return theme;
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
      theme: mapThemeVitrine(identite.theme),
    },
    liens: {
      google_review_url: asLienSortant(liens.google_review_url),
      instagram_url: asLienSortant(liens.instagram_url),
      tiktok_url: asLienSortant(liens.tiktok_url),
    },
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
