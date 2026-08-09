/**
 * Thèmes saisonniers du Calendrier / campagnes quotidiennes — décline la DA
 * « Kermesse / carton » existante (crème, encre, ombres dures) par saison, sans
 * en changer la famille visuelle. Chaque thème ne fait varier QUE : palette
 * d'accent, emoji décoratifs, motif de fond et teinte des cases. Cœur pur (aucun
 * accès réseau, aucun import server-only), testable en isolation — miroir des
 * helpers d'état de jackpot-state.ts / loyalty-passport-state.ts.
 */

import type { CSSProperties } from "react";
import type { CalendarTheme } from "@/types/database";
import { LAVIS_SAISON as LAVIS } from "@/components/ui/theme-lavis";

export interface CalendarThemeTokens {
  key: CalendarTheme;
  /** Libellé lisible (sélecteur d'éditeur). */
  label: string;
  /** Emoji décoratif d'en-tête (jamais porteur d'information). */
  titleEmoji: string;
  /** Frimousse d'une case fermée (avant ouverture). */
  faceEmoji: string;
  /** Motif de fond de la page (inline style, très léger, sur fond crème). */
  pageStyle: CSSProperties;
  /** Case ouvrable « ouvre-moi ! » : teinte d'accent, encre + ombre carton. */
  availableCell: string;
  /** Case verrouillée : sobre, en attente. */
  lockedCell: string;
  /** Case ouverte (révélée). */
  openedCell: string;
  /** Pastille d'accent (badge « ouvre-moi », case spéciale). */
  accentChip: string;
  /** Remplissage de la jauge d'assiduité. */
  progressFill: string;
}

const BASE_AVAILABLE =
  "border-2 border-k-ink text-k-ink shadow-[3px_3px_0_var(--color-k-ink)]";
const BASE_LOCKED =
  "border-2 border-dashed border-k-ink/40 bg-white/70 text-k-body";
const BASE_OPENED = "border-2 border-k-ink bg-white text-k-ink";

const THEMES: Record<CalendarTheme, CalendarThemeTokens> = {
  neutre: {
    key: "neutre",
    label: "Carton standard",
    titleEmoji: "✨",
    faceEmoji: "🎁",
    pageStyle: {
      backgroundColor: LAVIS.neutre,
      backgroundImage:
        "repeating-linear-gradient(135deg,#f3ead3 0 14px,#fdf6e3 14px 28px)",
    },
    availableCell: `${BASE_AVAILABLE} bg-k-yellow`,
    lockedCell: BASE_LOCKED,
    openedCell: BASE_OPENED,
    accentChip: "border-2 border-k-ink bg-k-yellow text-k-ink",
    progressFill: "bg-k-yellow",
  },
  noel: {
    key: "noel",
    label: "Noël",
    titleEmoji: "🎄",
    faceEmoji: "❄️",
    pageStyle: {
      backgroundColor: LAVIS.noel,
      backgroundImage:
        "repeating-linear-gradient(135deg,rgba(38,127,83,.22) 0 16px,transparent 16px 32px)",
    },
    availableCell: `${BASE_AVAILABLE} bg-k-green/25`,
    lockedCell: BASE_LOCKED,
    openedCell: BASE_OPENED,
    accentChip: "border-2 border-k-ink bg-k-green/25 text-k-ink",
    progressFill: "bg-k-green",
  },
  // Le placeholder B1 (copie de `neutre` teintée de rose) est remplacé par un
  // vrai thème. Son motif de fond n'est plus une rayure mais une TRAME DE
  // CŒURS — un SVG en data-URI, seul moyen de dessiner une forme dans un
  // `background-image` sans quitter le scalaire pur exigé par ce fichier.
  // L'alpha (.16) est celui des autres thèmes ; `%23` est le `#` échappé,
  // obligatoire dans une data-URI non encodée en base64.
  //
  // Le `progressFill` diffère volontairement de celui d'`anniversaire`
  // (`bg-k-pink`) : deux thèmes qui partageraient une jauge seraient
  // indiscernables à l'écran.
  saint_valentin: {
    key: "saint_valentin",
    label: "Saint-Valentin",
    titleEmoji: "💘",
    faceEmoji: "💌",
    pageStyle: {
      backgroundColor: LAVIS.saint_valentin,
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 30 30'%3E%3Cpath d='M15 23S6 16.6 6 11.6A4.6 4.6 0 0 1 15 9a4.6 4.6 0 0 1 9 2.6C24 16.6 15 23 15 23z' fill='%23e5484d' fill-opacity='.26'/%3E%3C/svg%3E\")",
      backgroundSize: "30px 30px",
    },
    availableCell: `${BASE_AVAILABLE} bg-k-pink/25`,
    lockedCell: BASE_LOCKED,
    openedCell: BASE_OPENED,
    accentChip: "border-2 border-k-ink bg-k-pink/25 text-k-ink",
    progressFill: "bg-k-pink/70",
  },
  anniversaire: {
    key: "anniversaire",
    label: "Anniversaire",
    titleEmoji: "🎉",
    faceEmoji: "🎈",
    pageStyle: {
      backgroundColor: LAVIS.anniversaire,
      backgroundImage:
        "radial-gradient(rgba(242,150,189,.38) 2.4px,transparent 2.4px)",
      backgroundSize: "20px 20px",
    },
    availableCell: `${BASE_AVAILABLE} bg-k-pink/40`,
    lockedCell: BASE_LOCKED,
    openedCell: BASE_OPENED,
    accentChip: "border-2 border-k-ink bg-k-pink/40 text-k-ink",
    progressFill: "bg-k-pink",
  },
  soldes: {
    key: "soldes",
    label: "Soldes",
    titleEmoji: "💯",
    faceEmoji: "🏷️",
    pageStyle: {
      backgroundColor: LAVIS.soldes,
      backgroundImage:
        "repeating-linear-gradient(135deg,rgba(245,121,59,.24) 0 16px,transparent 16px 32px)",
    },
    availableCell: `${BASE_AVAILABLE} bg-k-orange/30`,
    lockedCell: BASE_LOCKED,
    openedCell: BASE_OPENED,
    accentChip: "border-2 border-k-ink bg-k-orange/30 text-k-ink",
    progressFill: "bg-k-orange",
  },
  festival: {
    key: "festival",
    label: "Festival",
    titleEmoji: "🎊",
    faceEmoji: "🎪",
    pageStyle: {
      backgroundColor: LAVIS.festival,
      backgroundImage:
        "repeating-linear-gradient(90deg,rgba(153,183,245,.30) 0 18px,rgba(252,202,89,.26) 18px 36px)",
    },
    availableCell: `${BASE_AVAILABLE} bg-k-blue/40`,
    lockedCell: BASE_LOCKED,
    openedCell: BASE_OPENED,
    accentChip: "border-2 border-k-ink bg-k-blue/40 text-k-ink",
    progressFill: "bg-k-blue",
  },

  // ── Les cinq thèmes « fond d'écran » ──
  //
  // Ce qui les distingue vraiment, c'est l'IMAGE de
  // fond plein cadre que `fondPourTheme` leur associe — le motif CSS ci-dessous
  // n'est plus qu'un repli, visible le temps du chargement de la photo puis
  // recouvert par elle. Il reste néanmoins dessiné, et pas laissé en aplat :
  // une image qui ne charge pas (réseau de boutique) ne doit pas rendre la
  // page indistincte du thème neutre.
  prairie: {
    key: "prairie",
    label: "Prairie",
    titleEmoji: "🍀",
    faceEmoji: "🌼",
    pageStyle: {
      backgroundColor: LAVIS.prairie,
      backgroundImage:
        "repeating-linear-gradient(135deg,rgba(92,185,138,.22) 0 16px,transparent 16px 32px)",
    },
    availableCell: `${BASE_AVAILABLE} bg-k-green/25`,
    lockedCell: BASE_LOCKED,
    openedCell: BASE_OPENED,
    accentChip: "border-2 border-k-ink bg-k-green/25 text-k-ink",
    progressFill: "bg-k-green/50",
  },
  musique: {
    key: "musique",
    label: "Musique",
    titleEmoji: "🎵",
    faceEmoji: "🎧",
    pageStyle: {
      backgroundColor: LAVIS.musique,
      backgroundImage:
        "repeating-linear-gradient(90deg,rgba(183,155,240,.30) 0 6px,transparent 6px 24px)",
    },
    // Pas de jeton `k-violet` dans la palette Kermesse — le violet du motif
    // ci-dessus est un littéral, pas une variable CSS. Les cases reprennent
    // donc le jaune, atténué pour ne pas se confondre avec `neutre` (jaune
    // plein).
    availableCell: `${BASE_AVAILABLE} bg-k-yellow/50`,
    lockedCell: BASE_LOCKED,
    openedCell: BASE_OPENED,
    accentChip: "border-2 border-k-ink bg-k-yellow/50 text-k-ink",
    progressFill: "bg-k-yellow/60",
  },
  football: {
    key: "football",
    label: "Football",
    titleEmoji: "⚽",
    faceEmoji: "🥅",
    pageStyle: {
      backgroundColor: LAVIS.football,
      // Bandes de pelouse tondue : le seul motif de cette famille qui NOMME
      // son thème sans dessiner quoi que ce soit.
      backgroundImage:
        "repeating-linear-gradient(90deg,rgba(38,127,83,.16) 0 28px,transparent 28px 56px)",
    },
    availableCell: `${BASE_AVAILABLE} bg-k-green/25`,
    lockedCell: BASE_LOCKED,
    openedCell: BASE_OPENED,
    accentChip: "border-2 border-k-ink bg-k-green/40 text-k-ink",
    progressFill: "bg-k-green/75",
  },
  restaurant: {
    key: "restaurant",
    label: "Restaurant",
    titleEmoji: "🍽️",
    faceEmoji: "🥐",
    pageStyle: {
      backgroundColor: LAVIS.restaurant,
      // Nappe à carreaux — deux passes croisées, l'intersection s'assombrit
      // d'elle-même par superposition d'alpha.
      backgroundImage:
        "repeating-linear-gradient(0deg,rgba(245,121,59,.18) 0 12px,transparent 12px 24px),repeating-linear-gradient(90deg,rgba(245,121,59,.18) 0 12px,transparent 12px 24px)",
    },
    availableCell: `${BASE_AVAILABLE} bg-k-orange/30`,
    lockedCell: BASE_LOCKED,
    openedCell: BASE_OPENED,
    accentChip: "border-2 border-k-ink bg-k-orange/30 text-k-ink",
    progressFill: "bg-k-orange/60",
  },
  espace: {
    key: "espace",
    label: "Espace",
    titleEmoji: "🚀",
    faceEmoji: "🛸",
    pageStyle: {
      backgroundColor: LAVIS.espace,
      // Semis d'étoiles : deux trames de points décalées, pas une rayure.
      backgroundImage:
        "radial-gradient(rgba(124,58,237,.30) 1.6px,transparent 1.6px),radial-gradient(rgba(153,183,245,.34) 1.2px,transparent 1.2px)",
      backgroundSize: "34px 34px, 22px 22px",
      backgroundPosition: "0 0, 11px 13px",
    },
    availableCell: `${BASE_AVAILABLE} bg-k-blue/40`,
    lockedCell: BASE_LOCKED,
    openedCell: BASE_OPENED,
    accentChip: "border-2 border-k-ink bg-k-blue/40 text-k-ink",
    progressFill: "bg-k-blue/70",
  },
};

/** Liste ordonnée des thèmes (sélecteur d'éditeur avec aperçu). */
export const CALENDAR_THEME_ORDER: readonly CalendarTheme[] = [
  "neutre",
  "noel",
  "saint_valentin",
  "anniversaire",
  "soldes",
  "festival",
  "prairie",
  "musique",
  "football",
  "restaurant",
  "espace",
];

/**
 * Jeu de classes/tokens d'un thème. Tout thème inconnu retombe sur `neutre`
 * (jamais d'exception) — défense en profondeur, `mapCalendarPublicState` normalise
 * déjà l'enum côté données.
 */
export function calendarThemeTokens(theme: CalendarTheme): CalendarThemeTokens {
  // `Object.hasOwn` : une clé héritée (`"constructor"`) passerait le `??`.
  return Object.hasOwn(THEMES, theme) ? THEMES[theme] : THEMES.neutre;
}
