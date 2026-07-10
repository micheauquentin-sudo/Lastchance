/**
 * Éditeur d'affiche : configuration par QR code, stockée en jsonb sur
 * `qr_codes.poster`. Même philosophie que le style de roue : des
 * templates complets comme point de départ, puis chaque élément
 * (fond, couleurs, police, textes, tailles) reste modifiable à l'unité.
 */

import { z } from "zod";
import { FONT_KEYS } from "@/lib/fonts";

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Couleur invalide");

export const QR_SCALES = ["sm", "md", "lg"] as const;

export const posterConfigSchema = z.object({
  /** Dernier template appliqué (indicatif). */
  template: z.string().max(24).optional(),

  // Fond (dégradé vertical ; mettre deux fois la même couleur = uni)
  bgFrom: hexColor.default("#ffffff"),
  bgTo: hexColor.default("#ffffff"),
  /** Couleur d'accent : numéros d'étapes, cadre du QR. */
  accent: hexColor.default("#7c3aed"),
  /** Couleur du texte principal. */
  textColor: hexColor.default("#18181b"),

  font: z.enum(FONT_KEYS).default("sans"),

  // Textes — tous éditables
  title: z.string().trim().max(60).default("Tentez votre chance !"),
  subtitle: z
    .string()
    .trim()
    .max(90)
    .default("Tournez la roue, gagnez un cadeau."),
  step1: z.string().trim().max(60).default("Scannez le QR code"),
  step2: z.string().trim().max(60).default("Tournez la roue"),
  step3: z.string().trim().max(60).default("Montrez votre gain en caisse"),
  footer: z
    .string()
    .trim()
    .max(120)
    .default("Jeu gratuit sans obligation d'achat"),

  // Éléments affichés
  showLogo: z.boolean().default(true),
  showOrgName: z.boolean().default(true),
  showSteps: z.boolean().default(true),

  qrScale: z.enum(QR_SCALES).default("md"),
});

export type PosterConfig = z.infer<typeof posterConfigSchema>;

/** Configuration complète avec défauts — sûre même sur jsonb corrompu. */
export function resolvePosterConfig(raw: unknown): PosterConfig {
  const parsed = posterConfigSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  return posterConfigSchema.parse({});
}

/* ────────────────────────────────────────────────────────────
 * Templates
 * ──────────────────────────────────────────────────────────── */

export interface PosterTemplate {
  key: string;
  label: string;
  swatch: [string, string, string];
  config: PosterConfig;
}

function template(
  key: string,
  label: string,
  swatch: [string, string, string],
  overrides: Partial<PosterConfig>,
): PosterTemplate {
  return {
    key,
    label,
    swatch,
    config: posterConfigSchema.parse({ ...overrides, template: key }),
  };
}

export const POSTER_TEMPLATES: PosterTemplate[] = [
  template("clean", "Épuré", ["#ffffff", "#7c3aed", "#18181b"], {}),
  template("bold", "Contraste", ["#18181b", "#facc15", "#ffffff"], {
    bgFrom: "#18181b",
    bgTo: "#000000",
    accent: "#facc15",
    textColor: "#ffffff",
    font: "impact",
  }),
  template("elegant", "Élégant", ["#faf7f2", "#ca8a04", "#292524"], {
    bgFrom: "#faf7f2",
    bgTo: "#f5ede0",
    accent: "#ca8a04",
    textColor: "#292524",
    font: "elegant",
  }),
  template("fun", "Festif", ["#f472b6", "#fb923c", "#ffffff"], {
    bgFrom: "#f472b6",
    bgTo: "#fb923c",
    accent: "#ffffff",
    textColor: "#ffffff",
    font: "rounded",
  }),
];

export function getPosterTemplate(key: string): PosterTemplate | undefined {
  return POSTER_TEMPLATES.find((t) => t.key === key);
}

/** Fond CSS de l'affiche. */
export function posterBackground(config: PosterConfig): string {
  if (config.bgFrom === config.bgTo) return config.bgFrom;
  return `linear-gradient(to bottom, ${config.bgFrom}, ${config.bgTo})`;
}

/** Taille du QR sur l'affiche (px à l'écran, mis à l'échelle en print). */
export const QR_SCALE_PX: Record<(typeof QR_SCALES)[number], number> = {
  sm: 180,
  md: 230,
  lg: 290,
};

/** Noir ou blanc selon la luminance du fond — pour texte lisible. */
export function contrastText(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150 ? "#18181b" : "#ffffff";
}
