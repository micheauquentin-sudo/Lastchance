/**
 * Habillages du Créateur de quiz — décline la DA « Kermesse / carton » (crème,
 * encre, ombres dures) selon l'usage du commerçant : cuisine, dégustation,
 * culture, produits, sport, entreprise. Chaque thème ne fait varier QUE la
 * palette d'accent, les emoji décoratifs et le motif de fond : jamais la famille
 * visuelle, jamais une information.
 *
 * Cœur PUR (aucun accès réseau, aucun import server-only) — miroir de
 * calendar-theme.ts, réutilisable côté commerçant (aperçu du sélecteur) comme
 * côté joueur (page publique).
 */

import type { CSSProperties } from "react";
import type { QuizTheme } from "@/lib/quiz";
import type { DecorKey } from "@/components/ui/theme-decor";
import { LAVIS_QUIZ as LAVIS } from "@/components/ui/theme-lavis";

export interface QuizThemeTokens {
  key: QuizTheme;
  /** Libellé lisible (sélecteur d'éditeur). */
  label: string;
  /**
   * Scène cartoon dessinée en gouttière de la page joueur. SCALAIRE, jamais
   * du JSX : ce fichier est un cœur PUR, la résolution clé → dessin vit dans
   * `components/ui/theme-decor.tsx`.
   */
  decor: DecorKey;
  /** Usage typique, pour aider le commerçant à choisir. */
  usage: string;
  /** Emoji décoratif d'en-tête (jamais porteur d'information). */
  titleEmoji: string;
  /** Frimousse de repli quand le commerce n'a pas de logo. */
  faceEmoji: string;
  /** Motif de fond de la page publique (inline style, très léger). */
  pageStyle: CSSProperties;
  /** Option de réponse retenue par le joueur. */
  optionActive: string;
  /** Option de réponse au repos. */
  optionIdle: string;
  /** Pastille d'accent (numéro de question, badge de modèle). */
  accentChip: string;
  /** Remplissage de la jauge de progression. */
  progressFill: string;
}

const OPTION_ACTIVE_BASE =
  "border-2 border-k-ink text-k-ink shadow-[3px_3px_0_var(--color-k-ink)]";
const OPTION_IDLE =
  "border-2 border-k-ink/20 bg-white text-k-body hover:border-k-ink/50";

const THEMES: Record<QuizTheme, QuizThemeTokens> = {
  neutre: {
    key: "neutre",
    label: "Carton standard",
    decor: "confetti",
    usage: "Tout commerce, sans couleur dominante.",
    titleEmoji: "❓",
    faceEmoji: "🧠",
    pageStyle: {
      backgroundColor: LAVIS.neutre,
      backgroundImage:
        "repeating-linear-gradient(135deg,#f3ead3 0 14px,#fdf6e3 14px 28px)",
    },
    optionActive: `${OPTION_ACTIVE_BASE} bg-k-yellow`,
    optionIdle: OPTION_IDLE,
    accentChip: "border-2 border-k-ink bg-k-yellow text-k-ink",
    progressFill: "bg-k-yellow",
  },
  gourmand: {
    key: "gourmand",
    label: "Gourmand",
    decor: "gourmand",
    usage: "Restaurant, boulangerie : quiz de cuisine.",
    titleEmoji: "🍽️",
    faceEmoji: "👨‍🍳",
    pageStyle: {
      backgroundColor: LAVIS.gourmand,
      backgroundImage:
        "repeating-linear-gradient(135deg,rgba(245,121,59,.22) 0 16px,transparent 16px 32px)",
    },
    optionActive: `${OPTION_ACTIVE_BASE} bg-k-orange/30`,
    optionIdle: OPTION_IDLE,
    accentChip: "border-2 border-k-ink bg-k-orange/30 text-k-ink",
    progressFill: "bg-k-orange",
  },
  degustation: {
    key: "degustation",
    label: "Dégustation",
    decor: "verres",
    usage: "Cave, bar à vins : reconnaissance à l'aveugle.",
    titleEmoji: "🍷",
    faceEmoji: "🍇",
    pageStyle: {
      backgroundColor: LAVIS.degustation,
      backgroundImage:
        "radial-gradient(rgba(140,59,87,.20) 2.4px,transparent 2.4px)",
      backgroundSize: "20px 20px",
    },
    optionActive: `${OPTION_ACTIVE_BASE} bg-k-pink/40`,
    optionIdle: OPTION_IDLE,
    accentChip: "border-2 border-k-ink bg-k-pink/40 text-k-ink",
    progressFill: "bg-k-pink",
  },
  culture: {
    key: "culture",
    label: "Culture",
    decor: "livres",
    usage: "Musée, médiathèque : parcours culturel.",
    titleEmoji: "🏛️",
    faceEmoji: "🖼️",
    pageStyle: {
      backgroundColor: LAVIS.culture,
      backgroundImage:
        "repeating-linear-gradient(90deg,rgba(153,183,245,.30) 0 18px,transparent 18px 36px)",
    },
    optionActive: `${OPTION_ACTIVE_BASE} bg-k-blue/40`,
    optionIdle: OPTION_IDLE,
    accentChip: "border-2 border-k-ink bg-k-blue/40 text-k-ink",
    progressFill: "bg-k-blue",
  },
  produit: {
    key: "produit",
    label: "Produits",
    decor: "cadeaux",
    usage: "Boutique, salon d'exposants : connaissance de l'offre.",
    titleEmoji: "🏷️",
    faceEmoji: "🛍️",
    pageStyle: {
      backgroundColor: LAVIS.produit,
      backgroundImage:
        "repeating-linear-gradient(135deg,rgba(252,202,89,.45) 0 16px,transparent 16px 32px)",
    },
    optionActive: `${OPTION_ACTIVE_BASE} bg-k-yellow`,
    optionIdle: OPTION_IDLE,
    accentChip: "border-2 border-k-ink bg-k-yellow text-k-ink",
    progressFill: "bg-k-yellow",
  },
  sport: {
    key: "sport",
    label: "Sport",
    decor: "sport",
    usage: "Club, association sportive : quiz d'avant-match.",
    titleEmoji: "🏆",
    faceEmoji: "⚽",
    pageStyle: {
      backgroundColor: LAVIS.sport,
      backgroundImage:
        "repeating-linear-gradient(135deg,rgba(38,127,83,.20) 0 16px,transparent 16px 32px)",
    },
    optionActive: `${OPTION_ACTIVE_BASE} bg-k-green/25`,
    optionIdle: OPTION_IDLE,
    accentChip: "border-2 border-k-ink bg-k-green/25 text-k-ink",
    progressFill: "bg-k-green",
  },
  entreprise: {
    key: "entreprise",
    label: "Entreprise",
    decor: "confetti",
    usage: "Team building, séminaire : quiz interne.",
    titleEmoji: "💼",
    faceEmoji: "🤝",
    pageStyle: {
      backgroundColor: LAVIS.entreprise,
      backgroundImage:
        "repeating-linear-gradient(90deg,rgba(153,183,245,.26) 0 18px,rgba(252,202,89,.22) 18px 36px)",
    },
    optionActive: `${OPTION_ACTIVE_BASE} bg-k-blue/40`,
    optionIdle: OPTION_IDLE,
    accentChip: "border-2 border-k-ink bg-k-blue/40 text-k-ink",
    progressFill: "bg-k-blue",
  },
};

/** Liste ordonnée des habillages (sélecteur d'éditeur avec aperçu). */
export const QUIZ_THEME_ORDER: readonly QuizTheme[] = [
  "neutre",
  "gourmand",
  "degustation",
  "culture",
  "produit",
  "sport",
  "entreprise",
];

/**
 * Jeu de classes/tokens d'un habillage. Toute valeur inconnue retombe sur
 * `neutre` (jamais d'exception) — défense en profondeur, `mapQuizPublicState`
 * normalise déjà l'enum côté données.
 */
export function quizThemeTokens(theme: QuizTheme): QuizThemeTokens {
  // `Object.hasOwn` : une clé héritée (`"constructor"`) passerait le `??`.
  return Object.hasOwn(THEMES, theme) ? THEMES[theme] : THEMES.neutre;
}
