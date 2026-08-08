/**
 * Fonds d'écran thématiques — la table des dix illustrations cartoon.
 *
 * ── D'où viennent les fichiers ───────────────────────────────
 *
 * Les originaux sont dans `Input/fonds/<cle>.png` (1672x941, non versionnés :
 * `.gitignore` couvre `Input/`). `scripts/optimiser-fonds.mjs` — script npm
 * `assets:fonds` — en dérive les seuls artefacts commités :
 *
 *   public/fonds/<cle>-960.webp
 *   public/fonds/<cle>-1280.webp
 *   public/fonds/<cle>-1672.webp     ← largeur NATIVE, jamais agrandie
 *   public/fonds/<cle>-vignette.webp ← 360 px, pour les sélecteurs
 *
 * La largeur native est 1672 px : au-delà, le rendu est un léger étirement CSS
 * assumé (style cartoon, dégradation invisible). C'est la doctrine du dépôt —
 * on optimise hors requête, jamais à la volée.
 *
 * ── Une seule variante chargée par page ──────────────────────
 *
 * `fondSrcSet` sert les trois largeurs au navigateur, qui n'en télécharge
 * qu'UNE selon son viewport et son ratio de pixels. La vignette est un usage
 * distinct (le sélecteur de l'éditeur, qui en affiche dix d'un coup) et ne fait
 * donc pas partie du srcset : la mélanger aux largeurs de rendu ferait choisir
 * une image de 360 px comme fond plein écran sur un petit mobile.
 *
 * ── Ce que ce module ne fait PAS ─────────────────────────────
 *
 * Il ne décide d'aucun habillage : il traduit une clé déjà validée en URL.
 * `asFondKey` est une garde de LECTURE — même dissymétrie que `asSeasonalTheme`
 * (tolérance sur ce qu'on relit, jamais sur ce qu'on écrit) : une saisie hors
 * vocabulaire doit être REFUSÉE par zod, pas repliée en silence.
 */

import type { SeasonalTheme } from "@/types/database";
import type { QuizTheme } from "@/lib/quiz";

/** Les dix fonds livrés — une clé par fichier de `public/fonds/`. */
export const FOND_KEYS = [
  "prairie",
  "noel",
  "saint_valentin",
  "anniversaire",
  "soldes",
  "festival",
  "musique",
  "football",
  "restaurant",
  "espace",
] as const;

export type FondKey = (typeof FOND_KEYS)[number];

/** Libellés courts pour les sélecteurs (français, sans emoji). */
export const FOND_LABELS: Record<FondKey, string> = {
  prairie: "Prairie du trèfle",
  noel: "Noël",
  saint_valentin: "Saint-Valentin",
  anniversaire: "Anniversaire",
  soldes: "Soldes & boutique",
  festival: "Fête foraine",
  musique: "Scène musicale",
  football: "Football",
  restaurant: "Restaurant",
  espace: "Espace",
};

/**
 * Variantes produites par `scripts/optimiser-fonds.mjs`. Les trois nombres
 * sont des largeurs de rendu ; `"vignette"` est l'aperçu 360 px du sélecteur.
 */
export type FondLargeur = 960 | 1280 | 1672 | "vignette";

/** Les trois largeurs de rendu, dans l'ordre du srcset. */
const LARGEURS_RENDU = [960, 1280, 1672] as const;

/** URL publique d'une variante. */
export function fondSrc(cle: FondKey, largeur: FondLargeur): string {
  return `/fonds/${cle}-${largeur}.webp`;
}

/**
 * Attribut `srcSet` des trois largeurs de rendu — la vignette en est exclue
 * délibérément (voir l'en-tête).
 */
export function fondSrcSet(cle: FondKey): string {
  return LARGEURS_RENDU.map((l) => `${fondSrc(cle, l)} ${l}w`).join(", ");
}

/**
 * Fond correspondant à un habillage de la palette partagée.
 *
 * `Record` EXHAUSTIF et non un `includes` : ainsi une clé ajoutée à
 * `SeasonalTheme` sans son fond ne compile pas — c'est exactement l'oubli que
 * la palette partagée existe pour empêcher. `neutre` n'a pas de fond, et c'est
 * son sens : « aucun habillage », pas « un habillage sobre ».
 */
const FOND_PAR_THEME: Record<SeasonalTheme, FondKey | null> = {
  neutre: null,
  noel: "noel",
  saint_valentin: "saint_valentin",
  anniversaire: "anniversaire",
  soldes: "soldes",
  festival: "festival",
  prairie: "prairie",
  musique: "musique",
  football: "football",
  restaurant: "restaurant",
  espace: "espace",
};

export function fondPourTheme(theme: SeasonalTheme): FondKey | null {
  return FOND_PAR_THEME[theme] ?? null;
}

/**
 * Fond correspondant à un thème de QUIZ — correspondance d'USAGE, pas une
 * extension du vocabulaire.
 *
 * Les thèmes de quiz nomment un usage métier (gourmand, dégustation, culture,
 * produit, entreprise) et gardent leurs sept clés : décision `20260917120000`.
 * Deux d'entre eux se trouvent avoir une illustration qui leur convient —
 * `gourmand` → la salle de restaurant, `sport` → le terrain de football. Les
 * autres n'en ont pas, et leur en inventer une (« culture » sur un fond
 * d'espace ?) reviendrait à faire dire au vocabulaire métier ce qu'il ne dit
 * pas. `null` est ici une réponse complète, pas un trou à combler plus tard.
 */
const FOND_PAR_THEME_QUIZ: Record<QuizTheme, FondKey | null> = {
  neutre: null,
  gourmand: "restaurant",
  degustation: null,
  culture: null,
  produit: null,
  sport: "football",
  entreprise: null,
};

export function fondPourQuizTheme(theme: QuizTheme): FondKey | null {
  return FOND_PAR_THEME_QUIZ[theme] ?? null;
}

/**
 * Referme une valeur RELUE (jsonb `wheels.style`, colonne dont le CHECK aurait
 * bougé) sur `FondKey`, ou `null`. Jamais d'exception : un fond inconnu doit
 * faire une page sans fond, pas une page en erreur.
 */
export function asFondKey(value: unknown): FondKey | null {
  return (FOND_KEYS as readonly string[]).includes(value as string)
    ? (value as FondKey)
    : null;
}
