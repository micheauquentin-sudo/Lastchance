/**
 * Personnalisation visuelle de la roue et de la page /play.
 *
 * Le style est stocké en jsonb sur `wheels.style`, validé ici (zod) à
 * l'écriture ET à la lecture (`resolveWheelStyle` tolère un contenu
 * corrompu et retombe sur les défauts). Les presets remplissent tous
 * les champs d'un coup ; le commerçant peut ensuite surcharger chaque
 * détail individuellement — les styles se mélangent librement.
 */

import { z } from "zod";
import { FONT_KEYS, type FontKey } from "@/lib/fonts";

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Couleur invalide");

export const RING_STYLES = ["classic", "gold", "neon", "minimal", "none"] as const;
export const HUB_STYLES = ["dot", "disc", "target", "none"] as const;
export const POINTER_STYLES = ["triangle", "pin", "arrow"] as const;

export const wheelStyleSchema = z.object({
  /** Dernier preset appliqué (indicatif — chaque champ reste modifiable). */
  preset: z.string().max(24).optional(),

  // Anneau extérieur
  ring: z.enum(RING_STYLES).default("classic"),
  ringColor: hexColor.optional(),
  lights: z.boolean().default(true),
  lightColorA: hexColor.default("#ffffff"),
  lightColorB: hexColor.default("#ffd34d"),

  // Segments
  segmentBorderColor: hexColor.default("#000000"),
  segmentBorderWidth: z.number().min(0).max(6).default(2),
  labelColor: hexColor.default("#ffffff"),
  labelOutline: z.boolean().default(true),

  // Moyeu central
  hub: z.enum(HUB_STYLES).default("none"),
  hubColor: hexColor.default("#ffffff"),

  // Pointeur
  pointer: z.enum(POINTER_STYLES).default("triangle"),
  pointerColor: hexColor.default("#a78bfa"),

  // Typographie (titre + libellés des segments + bouton)
  font: z.enum(FONT_KEYS).default("sans"),

  // Fond de la page /play (dégradé radial)
  bgFrom: hexColor.default("#2e1065"),
  bgTo: hexColor.default("#000000"),

  // Bouton « Lancer la roue » (dégradé)
  buttonFrom: hexColor.default("#7c3aed"),
  buttonTo: hexColor.default("#d946ef"),

  // Texte d'accroche personnalisé (défaut : "Tournez la roue, tentez votre chance !")
  title: z.string().trim().max(80).optional(),

  // Animations Cartoon
  cartoonAnimations: z.boolean().default(false),
});

export type WheelStyle = z.infer<typeof wheelStyleSchema>;

/** Style complet avec défauts appliqués — sûr même sur jsonb corrompu. */
export function resolveWheelStyle(raw: unknown): WheelStyle {
  const parsed = wheelStyleSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  return wheelStyleSchema.parse({});
}

/* ────────────────────────────────────────────────────────────
 * Presets — points de départ complets, mélangeables ensuite
 * champ par champ dans l'éditeur.
 * ──────────────────────────────────────────────────────────── */

export interface WheelPreset {
  key: string;
  label: string;
  /** Couleurs représentatives pour la vignette de l'éditeur. */
  swatch: [string, string, string];
  style: WheelStyle;
}

function preset(
  key: string,
  label: string,
  swatch: [string, string, string],
  overrides: Partial<WheelStyle>,
): WheelPreset {
  return {
    key,
    label,
    swatch,
    style: wheelStyleSchema.parse({ ...overrides, preset: key }),
  };
}

export const WHEEL_PRESETS: WheelPreset[] = [
  // Style maison — reprend la DA « La Kermesse » du site : crème + encre,
  // bordures franches, ampoules chaudes, bouton orange→jaune.
  preset("kermesse", "Kermesse", ["#fcca59", "#f296bd", "#211d16"], {
    ring: "classic",
    ringColor: "#fcca59",
    lights: true,
    lightColorA: "#fdf6e3",
    lightColorB: "#fcca59",
    segmentBorderColor: "#211d16",
    segmentBorderWidth: 3,
    labelColor: "#fdf6e3",
    labelOutline: true,
    hub: "disc",
    hubColor: "#fdf6e3",
    pointer: "triangle",
    pointerColor: "#f5793b",
    font: "rounded",
    bgFrom: "#4a4238",
    bgTo: "#211d16",
    buttonFrom: "#f5793b",
    buttonTo: "#fcca59",
  }),
  preset("classic", "Classique", ["#7c3aed", "#d946ef", "#ffd34d"], {}),
  preset("neon", "Néon", ["#22d3ee", "#f0abfc", "#0f172a"], {
    ring: "neon",
    ringColor: "#22d3ee",
    lights: true,
    lightColorA: "#22d3ee",
    lightColorB: "#f0abfc",
    segmentBorderColor: "#67e8f9",
    segmentBorderWidth: 1.5,
    hub: "disc",
    hubColor: "#0f172a",
    pointer: "arrow",
    pointerColor: "#22d3ee",
    font: "impact",
    bgFrom: "#172554",
    bgTo: "#020617",
    buttonFrom: "#06b6d4",
    buttonTo: "#d946ef",
  }),
  preset("luxe", "Luxe", ["#ca8a04", "#1c1917", "#f5e6c4"], {
    ring: "gold",
    lights: false,
    segmentBorderColor: "#ca8a04",
    segmentBorderWidth: 1,
    labelColor: "#f5e6c4",
    labelOutline: false,
    hub: "disc",
    hubColor: "#ca8a04",
    pointer: "pin",
    pointerColor: "#ca8a04",
    font: "elegant",
    bgFrom: "#292524",
    bgTo: "#0c0a09",
    buttonFrom: "#ca8a04",
    buttonTo: "#92400e",
  }),
  preset("candy", "Pastel", ["#f9a8d4", "#fde68a", "#ffffff"], {
    ring: "minimal",
    ringColor: "#ffffff",
    lights: false,
    segmentBorderColor: "#ffffff",
    segmentBorderWidth: 4,
    labelColor: "#500724",
    labelOutline: false,
    hub: "disc",
    hubColor: "#ffffff",
    pointer: "pin",
    pointerColor: "#ec4899",
    font: "rounded",
    bgFrom: "#fbcfe8",
    bgTo: "#fda4af",
    buttonFrom: "#ec4899",
    buttonTo: "#f97316",
  }),
  preset("minimal", "Minimal", ["#18181b", "#e4e4e7", "#ffffff"], {
    ring: "none",
    lights: false,
    segmentBorderColor: "#ffffff",
    segmentBorderWidth: 1.5,
    labelOutline: false,
    hub: "dot",
    hubColor: "#18181b",
    pointer: "triangle",
    pointerColor: "#18181b",
    font: "modern",
    bgFrom: "#3f3f46",
    bgTo: "#18181b",
    buttonFrom: "#18181b",
    buttonTo: "#3f3f46",
  }),
  preset("fiesta", "Festif", ["#ef4444", "#facc15", "#22c55e"], {
    ring: "classic",
    ringColor: "#facc15",
    lights: true,
    lightColorA: "#facc15",
    lightColorB: "#ef4444",
    segmentBorderColor: "#7f1d1d",
    segmentBorderWidth: 2.5,
    hub: "target",
    hubColor: "#facc15",
    pointer: "triangle",
    pointerColor: "#facc15",
    font: "impact",
    bgFrom: "#7f1d1d",
    bgTo: "#1c0505",
    buttonFrom: "#ef4444",
    buttonTo: "#f97316",
  }),
  preset("cartoon", "Cartoon", ["#facc15", "#ef4444", "#3b82f6"], {
    ring: "classic",
    ringColor: "#ef4444",
    lights: true,
    lightColorA: "#ffffff",
    lightColorB: "#facc15",
    segmentBorderColor: "#000000",
    segmentBorderWidth: 4,
    labelColor: "#ffffff",
    labelOutline: true,
    hub: "disc",
    hubColor: "#ffffff",
    pointer: "arrow",
    pointerColor: "#facc15",
    font: "rounded",
    bgFrom: "#fef08a",
    bgTo: "#f59e0b",
    buttonFrom: "#3b82f6",
    buttonTo: "#1d4ed8",
    cartoonAnimations: true,
  }),
];

export function getPreset(key: string): WheelPreset | undefined {
  return WHEEL_PRESETS.find((p) => p.key === key);
}

/** Dégradé radial du fond de la page /play. */
export function playBackground(style: WheelStyle): string {
  return `radial-gradient(circle at 50% -10%, ${style.bgFrom}, ${style.bgTo} 75%)`;
}

export type { FontKey };
