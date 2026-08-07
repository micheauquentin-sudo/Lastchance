/**
 * Thèmes saisonniers d'un championnat de pronostics — miroir EXACT de
 * `components/calendar/calendar-theme.ts` : même domaine (`SeasonalTheme`),
 * même famille visuelle (« Kermesse / carton » : crème, encre, ombres dures),
 * mêmes règles.
 *
 * ── Pourquoi une table à part et non celle du calendrier ──
 *
 * Les deux modules partagent le DOMAINE (les six clés viennent du même enum
 * SQL) mais pas les JETONS : le calendrier habille des CASES (`availableCell`,
 * `lockedCell`, `openedCell`), notions qui n'existent pas dans un championnat.
 * Réutiliser sa table obligerait les pronostics à porter trois jetons morts, et
 * le premier réglage d'une case repeindrait un championnat.
 *
 * Cœur PUR (aucun accès réseau, aucun import server-only, aucun JSX) —
 * testable en isolation, lisible côté commerçant (aperçu du sélecteur) comme
 * côté joueur (page publique).
 */

import type { CSSProperties } from "react";
import type { SeasonalTheme } from "@/types/database";
import type { DecorKey } from "@/components/ui/theme-decor";

export interface ContestThemeTokens {
  key: SeasonalTheme;
  /** Libellé lisible (sélecteur d'éditeur). */
  label: string;
  /** Scène cartoon dessinée en gouttière de la page joueur. */
  decor: DecorKey;
  /** Emoji décoratif (jamais porteur d'information). */
  titleEmoji: string;
  /** Motif de fond de la page publique (inline style, très léger). */
  pageStyle: CSSProperties;
  /** Pastille d'accent (rang, badge de statut) — vignette du sélecteur. */
  accentChip: string;
  /** Remplissage de la jauge de progression des pronostics. */
  progressFill: string;
}

const THEMES: Record<SeasonalTheme, ContestThemeTokens> = {
  neutre: {
    key: "neutre",
    label: "Carton standard",
    decor: "confetti",
    titleEmoji: "⚽",
    pageStyle: {
      backgroundColor: "var(--color-k-bg)",
      backgroundImage:
        "repeating-linear-gradient(135deg,#f3ead3 0 14px,#fdf6e3 14px 28px)",
    },
    accentChip: "border-2 border-k-ink bg-k-yellow text-k-ink",
    progressFill: "bg-k-yellow",
  },
  noel: {
    key: "noel",
    label: "Noël",
    decor: "noel",
    titleEmoji: "🎄",
    pageStyle: {
      backgroundColor: "var(--color-k-bg)",
      backgroundImage:
        "repeating-linear-gradient(135deg,rgba(38,127,83,.12) 0 16px,transparent 16px 32px)",
    },
    accentChip: "border-2 border-k-ink bg-k-green/25 text-k-ink",
    progressFill: "bg-k-green",
  },
  saint_valentin: {
    key: "saint_valentin",
    label: "Saint-Valentin",
    decor: "coeurs",
    titleEmoji: "💘",
    pageStyle: {
      backgroundColor: "var(--color-k-bg)",
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 30 30'%3E%3Cpath d='M15 23S6 16.6 6 11.6A4.6 4.6 0 0 1 15 9a4.6 4.6 0 0 1 9 2.6C24 16.6 15 23 15 23z' fill='%23f296bd' fill-opacity='.16'/%3E%3C/svg%3E\")",
      backgroundSize: "30px 30px",
    },
    accentChip: "border-2 border-k-ink bg-k-pink/25 text-k-ink",
    progressFill: "bg-k-pink/70",
  },
  anniversaire: {
    key: "anniversaire",
    label: "Anniversaire",
    decor: "ballons",
    titleEmoji: "🎉",
    pageStyle: {
      backgroundColor: "var(--color-k-bg)",
      backgroundImage:
        "radial-gradient(rgba(242,150,189,.28) 2px,transparent 2px)",
      backgroundSize: "22px 22px",
    },
    accentChip: "border-2 border-k-ink bg-k-pink/40 text-k-ink",
    progressFill: "bg-k-pink",
  },
  soldes: {
    key: "soldes",
    label: "Soldes",
    decor: "etiquettes",
    titleEmoji: "💯",
    pageStyle: {
      backgroundColor: "var(--color-k-bg)",
      backgroundImage:
        "repeating-linear-gradient(135deg,rgba(245,121,59,.14) 0 16px,transparent 16px 32px)",
    },
    accentChip: "border-2 border-k-ink bg-k-orange/30 text-k-ink",
    progressFill: "bg-k-orange",
  },
  festival: {
    key: "festival",
    label: "Festival",
    decor: "fanions",
    titleEmoji: "🎊",
    pageStyle: {
      backgroundColor: "var(--color-k-bg)",
      backgroundImage:
        "repeating-linear-gradient(90deg,rgba(153,183,245,.18) 0 18px,rgba(252,202,89,.18) 18px 36px)",
    },
    accentChip: "border-2 border-k-ink bg-k-blue/40 text-k-ink",
    progressFill: "bg-k-blue",
  },
};

/** Liste ordonnée des thèmes (sélecteur d'éditeur avec aperçu). */
export const CONTEST_THEME_ORDER: readonly SeasonalTheme[] = [
  "neutre",
  "noel",
  "saint_valentin",
  "anniversaire",
  "soldes",
  "festival",
];

/**
 * Jeu de jetons d'un thème. Toute valeur inconnue — ou ABSENTE — retombe sur
 * `neutre`, jamais d'exception : le contexte public de /pronos peut servir une
 * ligne lue avant que la colonne `theme` n'entre dans son `select`, et une page
 * joueur ne doit pas tomber pour un fond d'écran.
 */
export function contestThemeTokens(
  theme: SeasonalTheme | null | undefined,
): ContestThemeTokens {
  // `Object.hasOwn`, pas un accès par crochet nu : `THEMES["constructor"]`
  // rendrait une propriété héritée truthy et le repli ne jouerait pas.
  return theme && Object.hasOwn(THEMES, theme) ? THEMES[theme] : THEMES.neutre;
}
