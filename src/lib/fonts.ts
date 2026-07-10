/**
 * Polices proposées au commerçant (roue publique + éditeur d'affiche).
 * Chaque clé mappe vers une pile CSS ; les polices Google sont chargées
 * à la demande via <link> uniquement quand elles sont sélectionnées —
 * la page /play ne paie que la police réellement utilisée.
 */

export const FONT_KEYS = [
  "sans",
  "elegant",
  "impact",
  "rounded",
  "script",
  "modern",
  "mono",
] as const;

export type FontKey = (typeof FONT_KEYS)[number];

export interface FontOption {
  key: FontKey;
  label: string;
  /** Pile font-family CSS complète. */
  family: string;
  /** Feuille Google Fonts à charger quand la police est sélectionnée. */
  googleHref?: string;
}

export const FONT_OPTIONS: Record<FontKey, FontOption> = {
  sans: {
    key: "sans",
    label: "Moderne (défaut)",
    family: "var(--font-geist-sans), system-ui, sans-serif",
  },
  elegant: {
    key: "elegant",
    label: "Élégante",
    family: "'Playfair Display', Georgia, serif",
    googleHref:
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700;800&display=swap",
  },
  impact: {
    key: "impact",
    label: "Impact",
    family: "'Bebas Neue', 'Arial Narrow', sans-serif",
    googleHref:
      "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap",
  },
  rounded: {
    key: "rounded",
    label: "Arrondie",
    family: "'Baloo 2', 'Comic Sans MS', system-ui, sans-serif",
    googleHref:
      "https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700;800&display=swap",
  },
  script: {
    key: "script",
    label: "Manuscrite",
    family: "'Pacifico', 'Brush Script MT', cursive",
    googleHref: "https://fonts.googleapis.com/css2?family=Pacifico&display=swap",
  },
  modern: {
    key: "modern",
    label: "Géométrique",
    family: "'Montserrat', 'Helvetica Neue', sans-serif",
    googleHref:
      "https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;800&display=swap",
  },
  mono: {
    key: "mono",
    label: "Machine",
    family: "var(--font-geist-mono), 'Courier New', monospace",
  },
};

export const FONT_LIST: FontOption[] = FONT_KEYS.map((k) => FONT_OPTIONS[k]);

export function fontFamily(key: FontKey | undefined): string {
  return FONT_OPTIONS[key ?? "sans"].family;
}

export function fontGoogleHref(key: FontKey | undefined): string | undefined {
  return FONT_OPTIONS[key ?? "sans"].googleHref;
}
