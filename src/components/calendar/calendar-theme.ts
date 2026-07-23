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
      backgroundColor: "var(--color-k-bg)",
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
      backgroundColor: "var(--color-k-bg)",
      backgroundImage:
        "repeating-linear-gradient(135deg,rgba(38,127,83,.12) 0 16px,transparent 16px 32px)",
    },
    availableCell: `${BASE_AVAILABLE} bg-k-green/25`,
    lockedCell: BASE_LOCKED,
    openedCell: BASE_OPENED,
    accentChip: "border-2 border-k-ink bg-k-green/25 text-k-ink",
    progressFill: "bg-k-green",
  },
  anniversaire: {
    key: "anniversaire",
    label: "Anniversaire",
    titleEmoji: "🎉",
    faceEmoji: "🎈",
    pageStyle: {
      backgroundColor: "var(--color-k-bg)",
      backgroundImage:
        "radial-gradient(rgba(242,150,189,.28) 2px,transparent 2px)",
      backgroundSize: "22px 22px",
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
      backgroundColor: "var(--color-k-bg)",
      backgroundImage:
        "repeating-linear-gradient(135deg,rgba(245,121,59,.14) 0 16px,transparent 16px 32px)",
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
      backgroundColor: "var(--color-k-bg)",
      backgroundImage:
        "repeating-linear-gradient(90deg,rgba(153,183,245,.18) 0 18px,rgba(252,202,89,.18) 18px 36px)",
    },
    availableCell: `${BASE_AVAILABLE} bg-k-blue/40`,
    lockedCell: BASE_LOCKED,
    openedCell: BASE_OPENED,
    accentChip: "border-2 border-k-ink bg-k-blue/40 text-k-ink",
    progressFill: "bg-k-blue",
  },
};

/** Liste ordonnée des thèmes (sélecteur d'éditeur avec aperçu). */
export const CALENDAR_THEME_ORDER: readonly CalendarTheme[] = [
  "neutre",
  "noel",
  "anniversaire",
  "soldes",
  "festival",
];

/**
 * Jeu de classes/tokens d'un thème. Tout thème inconnu retombe sur `neutre`
 * (jamais d'exception) — défense en profondeur, `mapCalendarPublicState` normalise
 * déjà l'enum côté données.
 */
export function calendarThemeTokens(theme: CalendarTheme): CalendarThemeTokens {
  return THEMES[theme] ?? THEMES.neutre;
}
