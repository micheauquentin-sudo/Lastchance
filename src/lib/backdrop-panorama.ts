/**
 * Décor « panorama » de la variante /v2 : une seule illustration verticale,
 * parcourue au scroll. La source vit hors dépôt (`Input/` est ignoré) — les
 * images se régénèrent avec `node scripts/build-backdrop-panorama.mjs`.
 *
 * Le panorama descend d'un ciel de cumulus à un cœur de lave : la luminosité
 * perçue passe de 0,72 à 0,29. Un voile d'opacité fixe serait donc soit
 * inutile en haut, soit opaque en bas. PANORAMA_LUMA porte la luminosité de
 * chaque bande, PANORAMA_TINT sa teinte dominante : voile et accents suivent
 * la descente, comme ils suivent le film sur la version vivante.
 *
 * Fichier généré — ne pas éditer à la main.
 */

/** Dimensions de la source, pour calculer le cadrage sans attendre le chargement. */
export const PANORAMA_WIDTH = 2560;
export const PANORAMA_HEIGHT = 6592;
export const PANORAMA_RATIO = 0.38835;

/** Paliers de largeur. Le client n'en charge qu'un, le plus étroit qui couvre. */
export const PANORAMA_TIERS = [
  { src: "/panorama/p1080.webp", width: 1080 },
  { src: "/panorama/p1920.webp", width: 1920 },
  { src: "/panorama/p2560.webp", width: 2560 },
] as const;

/**
 * Fraction de la hauteur, depuis le haut, où l'image n'est QUE du ciel.
 *
 * Le décor s'en sert pour cadrer son ouverture : au repos, la fenêtre
 * visible ne doit pas descendre plus bas, sinon le hero s'ouvre sur des
 * bambous. Mesurée sur l'image, marge de sécurité comprise — et remesurée
 * à chaque génération, parce que l'illustration a déjà changé une fois.
 */
export const PANORAMA_SKY_FRACTION = 1;

/** Aperçu flou, peint avant la première requête réseau. */
export const PANORAMA_PREVIEW = "data:image/webp;base64,UklGRlIBAABXRUJQVlA4IEYBAADQBwCdASoUADQAPu1kpU4ppaMiLAzJMB2JbACdMxMK2NOZ4xZRpRQrnZPLm8t0NHjZLgwgQ4OXj23OS/KZxTiAPbVjypjwAAD+1xm9OgBgxGy3yCW9rT8+GvkSoZoCHz2PvbfJiRm/bfTAeq7dDHmsr1iF0FLJT4wGmP82jGTbURJlJOU2XumJE0gNrhelIGI34b3aiWc0oTzdAIOqmaI6zSsizLNBxrqWisbPnpNcTJSQ/wP3DQe1EhSGGVvbPJmvkEx7nAR8HYSahrhRxScUfNmMNgMyEgWO3BQkdrCPffBsx6PoldPVDvWIXC7x1LebfccTkeqlet1JbXsILEllR9GL0RIpuGFAGDwMVm3T8awv/t5DZk4NKCheHrOi67K1CK7XGGeO6nmFtI78B2JM5W6kGDYDOR7oTwtYPRRrEIM6DYCAAA==";

/** Luminosité perçue, une valeur par bande, du haut vers le bas (64 bandes). */
export const PANORAMA_LUMA: readonly number[] = [
  0.638, 0.645, 0.644, 0.659, 0.677, 0.653, 0.650, 0.634,
  0.637, 0.667, 0.694, 0.689, 0.688, 0.683, 0.693, 0.698,
  0.696, 0.697, 0.697, 0.683, 0.706, 0.718, 0.713, 0.721,
  0.699, 0.686, 0.691, 0.698, 0.707, 0.718, 0.713, 0.707,
  0.710, 0.692, 0.682, 0.686, 0.686, 0.713, 0.704, 0.685,
  0.644, 0.625, 0.631, 0.605, 0.604, 0.607, 0.572, 0.541,
  0.512, 0.485, 0.475, 0.459, 0.474, 0.436, 0.424, 0.420,
  0.380, 0.358, 0.346, 0.344, 0.346, 0.358, 0.384, 0.286,
];

/** Teinte dominante de chaque bande, `null` si la bande n'en a pas. */
export const PANORAMA_TINT: readonly (string | null)[] = [
  "#5186d6", "#5186d6", "#5186d6", "#5186d6",
  "#5187d6", "#5187d6", "#5187d6", "#5188d6",
  "#5188d6", "#5188d6", "#5189d6", "#5189d6",
  "#5188d6", "#5188d6", "#5188d6", "#5188d6",
  "#5188d6", "#5188d6", "#518cd6", "#518fd6",
  "#5190d6", "#5192d6", "#5194d6", "#d6515f",
  "#d6515f", "#d6515f", "#d6515f", "#d6515f",
  "#d65160", "#d65161", "#d65161", "#d65161",
  "#d65161", "#d65164", "#d65166", "#d65168",
  "#d6516a", "#d6517a", "#d6517e", "#d65181",
  "#d65184", "#d65188", "#d6519c", "#d651a0",
  "#d651a3", "#d651a7", "#d651ab", "#d651ae",
  "#d551d6", "#d051d6", "#cd51d6", "#ca51d6",
  "#c751d6", "#c451d6", "#c051d6", "#bf51d6",
  "#ac51d6", "#a951d6", "#a851d6", "#a651d6",
  "#a051d6", "#a051d6", "#9f51d6", "#9f51d6",
];
