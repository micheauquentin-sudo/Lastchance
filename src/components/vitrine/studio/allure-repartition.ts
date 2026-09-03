import type {
  ChampBooleenAllure,
  ChampChiffreAllure,
  ChampEnumAllure,
} from "@/lib/vitrine";

/** N'importe lequel des vingt-cinq réglages d'allure, quel que soit son type. */
export type CleAllure =
  | ChampEnumAllure
  | ChampChiffreAllure
  | ChampBooleenAllure;

/** Les quatre étapes qui rendent de l'allure. Les cinq autres n'en rendent aucune. */
export type EtapeAllure = "banniere" | "fiches" | "navigation" | "ambiance";

/**
 * OÙ VIT CHAQUE RÉGLAGE D'ALLURE — LA source, lue par l'écran ET par la garde.
 *
 * ── POURQUOI UNE TABLE, ET NON QUATRE LISTES ÉCRITES DANS QUATRE ÉTAPES ──
 *
 * Éclater vingt-cinq réglages sur quatre écrans ouvre exactement deux pannes,
 * et aucune ne se voit : un réglage OUBLIÉ (plus atteignable, donc figé sur son
 * défaut pour toujours) et un réglage DOUBLÉ (deux contrôles pour une seule
 * ligne en base — celui qu'on ne regarde pas gagne, au hasard du dernier
 * rendu). Les deux passeraient une revue de code, parce qu'elles ne se lisent
 * pas dans un diff : elles se lisent dans la somme de quatre fichiers.
 *
 * Cette table est cette somme, en un seul endroit. `allure-repartition.test.ts`
 * la compare à `VITRINE_ALLURE_CLES` — la liste blanche que la base accepte —
 * et fait rougir la CI sur un oubli comme sur un doublon. Ajouter un réglage
 * sans lui donner d'étape devient impossible sans le voir.
 *
 * ── L'ORDRE À L'INTÉRIEUR D'UNE ÉTAPE EST CELUI DE LA PAGE, PAS DU TYPE ──
 *
 * `hero_hauteur` (curseur) précède `carte_infos` (liste) parce que c'est
 * l'ordre où l'on descend une bannière. Grouper par type aurait donné un écran
 * plus régulier et un parcours moins évident — or c'est le parcours qu'on vient
 * de refaire.
 *
 * `style_cartes` N'EST PAS ICI : ce n'est pas une clé d'allure mais une colonne
 * du thème, et l'étape « Les fiches » la rend à part.
 */
export const REPARTITION_ALLURE = {
  banniere: [
    "hero_hauteur",
    "hero_taille_nom",
    "hero_voile",
    "carte_infos",
    "monogramme",
  ],
  fiches: [
    "style_fiche",
    "photo_taille",
    "photo_position",
    "style_prix",
    "capitales",
    "capitales_desc",
  ],
  navigation: [
    "style_onglets",
    "style_chips",
    "style_rubrique",
    "compte_rubrique",
    "entete_collant",
    "barre_basse",
    "favoris",
    "recherche",
  ],
  ambiance: [
    "motif",
    "motif_opacite",
    "densite",
    "rayon",
    "ombre",
    "echelle_texte",
  ],
} as const satisfies Record<EtapeAllure, readonly CleAllure[]>;

/**
 * LES LIBELLÉS — ils étaient dans `panneau-allure.tsx`, qui a été dissous.
 *
 * Ils restent en une seule table plutôt que répartis avec les clés : ce sont
 * les mots que lit le commerçant, et c'est ce qu'on relit quand on cherche une
 * incohérence de vocabulaire.
 */
export const LIBELLES_ALLURE: Record<CleAllure, string> = {
  motif: "Motif de fond",
  densite: "Densité",
  style_fiche: "Style des fiches",
  photo_taille: "Taille des photos",
  photo_position: "Position des photos",
  style_prix: "Affichage du prix",
  style_onglets: "Style des onglets",
  style_chips: "Style des filtres",
  style_rubrique: "Titre des rubriques",
  barre_basse: "Barre du bas",
  carte_infos: "Carte d'informations",
  motif_opacite: "Intensité du motif",
  rayon: "Arrondi",
  ombre: "Ombres",
  echelle_texte: "Taille du texte",
  hero_hauteur: "Hauteur de bannière",
  hero_taille_nom: "Taille du nom",
  hero_voile: "Voile sur la photo",
  entete_collant: "Onglets collants",
  capitales: "Noms en capitales",
  capitales_desc: "Descriptions en capitales",
  compte_rubrique: "Nombre d'articles par rubrique",
  monogramme: "Initiale si pas de photo",
  favoris: "Favoris",
  recherche: "Recherche",
};

/** Les valeurs des listes, en français. Une clé absente s'affiche telle quelle. */
export const VALEURS_ALLURE: Record<string, string> = {
  aucun: "Aucun",
  diagonales: "Diagonales",
  points: "Points",
  damier: "Damier",
  confortable: "Confortable",
  standard: "Standard",
  compact: "Compact",
  ombre: "Ombre portée",
  contour: "Contour",
  plein: "Fond teinté",
  grande: "Grande",
  vignette: "Vignette",
  aucune: "Sans photo",
  droite: "À droite",
  gauche: "À gauche",
  pleine: "Pleine largeur",
  simple: "Filet pointillé",
  accent: "Gras, en couleur",
  pastille: "Pastille",
  soulignes: "Soulignés",
  pastilles: "Pastilles",
  segmentes: "Segmentés",
  pleines: "Pleines",
  soulignees: "Soulignées",
  carte: "Carte",
  filet: "Filet centré",
  flottante: "Flottante",
  masquee: "Masquée",
  chevauche: "Chevauche la photo",
  dessous: "Sous la photo",
};
