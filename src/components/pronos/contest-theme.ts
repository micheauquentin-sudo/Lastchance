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
import { LAVIS_SAISON as LAVIS } from "@/components/ui/theme-lavis";

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
      backgroundColor: LAVIS.neutre,
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
      backgroundColor: LAVIS.noel,
      backgroundImage:
        "repeating-linear-gradient(135deg,rgba(38,127,83,.22) 0 16px,transparent 16px 32px)",
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
      backgroundColor: LAVIS.saint_valentin,
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 30 30'%3E%3Cpath d='M15 23S6 16.6 6 11.6A4.6 4.6 0 0 1 15 9a4.6 4.6 0 0 1 9 2.6C24 16.6 15 23 15 23z' fill='%23e5484d' fill-opacity='.26'/%3E%3C/svg%3E\")",
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
      backgroundColor: LAVIS.anniversaire,
      backgroundImage:
        "radial-gradient(rgba(242,150,189,.38) 2.4px,transparent 2.4px)",
      backgroundSize: "20px 20px",
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
      backgroundColor: LAVIS.soldes,
      backgroundImage:
        "repeating-linear-gradient(135deg,rgba(245,121,59,.24) 0 16px,transparent 16px 32px)",
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
      backgroundColor: LAVIS.festival,
      backgroundImage:
        "repeating-linear-gradient(90deg,rgba(153,183,245,.30) 0 18px,rgba(252,202,89,.26) 18px 36px)",
    },
    accentChip: "border-2 border-k-ink bg-k-blue/40 text-k-ink",
    progressFill: "bg-k-blue",
  },

  // ── Les cinq thèmes « fond d'écran » ──
  //
  // Miroir EXACT des cinq entrées ajoutées à `calendar-theme.ts` : mêmes
  // clés, mêmes lavis, mêmes décors, mêmes motifs de repli. C'est la règle
  // déjà posée en tête de ce fichier — un client ne peut pas voir deux
  // « Football » différents selon le module. Ce qui les distingue vraiment est
  // l'IMAGE de fond que `fondPourTheme` leur associe ; le motif CSS n'est plus
  // qu'un repli, le temps que la photo charge.
  prairie: {
    key: "prairie",
    label: "Prairie",
    decor: "confetti",
    titleEmoji: "🍀",
    pageStyle: {
      backgroundColor: LAVIS.prairie,
      backgroundImage:
        "repeating-linear-gradient(135deg,rgba(92,185,138,.22) 0 16px,transparent 16px 32px)",
    },
    accentChip: "border-2 border-k-ink bg-k-green/25 text-k-ink",
    progressFill: "bg-k-green/50",
  },
  musique: {
    key: "musique",
    label: "Musique",
    decor: "fanions",
    titleEmoji: "🎵",
    pageStyle: {
      backgroundColor: LAVIS.musique,
      backgroundImage:
        "repeating-linear-gradient(90deg,rgba(183,155,240,.30) 0 6px,transparent 6px 24px)",
    },
    accentChip: "border-2 border-k-ink bg-k-yellow/50 text-k-ink",
    progressFill: "bg-k-yellow/60",
  },
  football: {
    key: "football",
    label: "Football",
    decor: "sport",
    titleEmoji: "⚽",
    pageStyle: {
      backgroundColor: LAVIS.football,
      backgroundImage:
        "repeating-linear-gradient(90deg,rgba(38,127,83,.16) 0 28px,transparent 28px 56px)",
    },
    accentChip: "border-2 border-k-ink bg-k-green/40 text-k-ink",
    progressFill: "bg-k-green/75",
  },
  restaurant: {
    key: "restaurant",
    label: "Restaurant",
    decor: "gourmand",
    titleEmoji: "🍽️",
    pageStyle: {
      backgroundColor: LAVIS.restaurant,
      backgroundImage:
        "repeating-linear-gradient(0deg,rgba(245,121,59,.18) 0 12px,transparent 12px 24px),repeating-linear-gradient(90deg,rgba(245,121,59,.18) 0 12px,transparent 12px 24px)",
    },
    accentChip: "border-2 border-k-ink bg-k-orange/30 text-k-ink",
    progressFill: "bg-k-orange/60",
  },
  espace: {
    key: "espace",
    label: "Espace",
    decor: "etoiles",
    titleEmoji: "🚀",
    pageStyle: {
      backgroundColor: LAVIS.espace,
      backgroundImage:
        "radial-gradient(rgba(124,58,237,.30) 1.6px,transparent 1.6px),radial-gradient(rgba(153,183,245,.34) 1.2px,transparent 1.2px)",
      backgroundSize: "34px 34px, 22px 22px",
      backgroundPosition: "0 0, 11px 13px",
    },
    accentChip: "border-2 border-k-ink bg-k-blue/40 text-k-ink",
    progressFill: "bg-k-blue/70",
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
  "prairie",
  "musique",
  "football",
  "restaurant",
  "espace",
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
