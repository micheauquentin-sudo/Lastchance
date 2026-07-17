/**
 * Éditeur d'affiche « libre » (façon Canva) : l'affiche est une liste
 * d'éléments (texte, forme, image, QR) positionnés en % de la page A4,
 * déplaçables et personnalisables sans limite. Stocké en jsonb sur
 * `qr_codes.poster`, revalidé intégralement côté serveur.
 *
 * Les anciennes affiches (modèle v1 à champs fixes : title/subtitle/
 * steps/…) sont migrées à la volée vers des éléments équivalents —
 * aucun travail perdu.
 */

import { z } from "zod";

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Couleur invalide");

/* ────────────────────────────────────────────────────────────
 * Catalogue de polices (Google Fonts) — le « stock » de l'éditeur.
 * ──────────────────────────────────────────────────────────── */

export interface PosterFont {
  key: string;
  label: string;
  family: string;
  /** Graisses à charger (la première sert de défaut). */
  weights: number[];
  /** Catégorie affichée dans le sélecteur. */
  group: "Titres" | "Rondes" | "Manuscrites" | "Classiques";
}

export const POSTER_FONTS: PosterFont[] = [
  // Titres à fort impact
  { key: "lilita", label: "Lilita One", family: "Lilita One", weights: [400], group: "Titres" },
  { key: "titan", label: "Titan One", family: "Titan One", weights: [400], group: "Titres" },
  { key: "luckiest", label: "Luckiest Guy", family: "Luckiest Guy", weights: [400], group: "Titres" },
  { key: "bangers", label: "Bangers", family: "Bangers", weights: [400], group: "Titres" },
  { key: "alfa", label: "Alfa Slab One", family: "Alfa Slab One", weights: [400], group: "Titres" },
  { key: "anton", label: "Anton", family: "Anton", weights: [400], group: "Titres" },
  { key: "bebas", label: "Bebas Neue", family: "Bebas Neue", weights: [400], group: "Titres" },
  { key: "shrikhand", label: "Shrikhand", family: "Shrikhand", weights: [400], group: "Titres" },
  { key: "righteous", label: "Righteous", family: "Righteous", weights: [400], group: "Titres" },
  { key: "abril", label: "Abril Fatface", family: "Abril Fatface", weights: [400], group: "Titres" },
  // Rondes et amicales
  { key: "nunito", label: "Nunito", family: "Nunito", weights: [700, 400, 900], group: "Rondes" },
  { key: "fredoka", label: "Fredoka", family: "Fredoka", weights: [500, 700], group: "Rondes" },
  { key: "chewy", label: "Chewy", family: "Chewy", weights: [400], group: "Rondes" },
  { key: "comfortaa", label: "Comfortaa", family: "Comfortaa", weights: [700, 400], group: "Rondes" },
  { key: "poppins", label: "Poppins", family: "Poppins", weights: [700, 400, 900], group: "Rondes" },
  { key: "montserrat", label: "Montserrat", family: "Montserrat", weights: [700, 400, 900], group: "Rondes" },
  // Manuscrites
  { key: "pacifico", label: "Pacifico", family: "Pacifico", weights: [400], group: "Manuscrites" },
  { key: "lobster", label: "Lobster", family: "Lobster", weights: [400], group: "Manuscrites" },
  { key: "caveat", label: "Caveat", family: "Caveat", weights: [700, 400], group: "Manuscrites" },
  { key: "dancing", label: "Dancing Script", family: "Dancing Script", weights: [700, 400], group: "Manuscrites" },
  { key: "satisfy", label: "Satisfy", family: "Satisfy", weights: [400], group: "Manuscrites" },
  { key: "courgette", label: "Courgette", family: "Courgette", weights: [400], group: "Manuscrites" },
  { key: "kalam", label: "Kalam", family: "Kalam", weights: [700, 400], group: "Manuscrites" },
  { key: "marker", label: "Permanent Marker", family: "Permanent Marker", weights: [400], group: "Manuscrites" },
  { key: "amatic", label: "Amatic SC", family: "Amatic SC", weights: [700], group: "Manuscrites" },
  // Classiques
  { key: "playfair", label: "Playfair Display", family: "Playfair Display", weights: [700, 400, 900], group: "Classiques" },
  { key: "merriweather", label: "Merriweather", family: "Merriweather", weights: [700, 400, 900], group: "Classiques" },
  { key: "oswald", label: "Oswald", family: "Oswald", weights: [600, 400], group: "Classiques" },
  { key: "cormorant", label: "Cormorant Garamond", family: "Cormorant Garamond", weights: [600, 400], group: "Classiques" },
];

export const POSTER_FONT_KEYS = POSTER_FONTS.map((f) => f.key) as [string, ...string[]];

const FONT_BY_KEY = new Map(POSTER_FONTS.map((f) => [f.key, f]));

export function posterFont(key: string): PosterFont {
  return FONT_BY_KEY.get(key) ?? POSTER_FONTS[0];
}

export function posterFontFamily(key: string): string {
  const f = posterFont(key);
  return `"${f.family}", system-ui, sans-serif`;
}

/** URL Google Fonts chargeant tout le catalogue (éditeur + impression). */
export function posterFontsHref(): string {
  const families = POSTER_FONTS.map((f) => {
    const weights = [...f.weights].sort((a, b) => a - b).join(";");
    return `family=${f.family.replaceAll(" ", "+")}:wght@${weights}`;
  }).join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/* ────────────────────────────────────────────────────────────
 * Formes
 * ──────────────────────────────────────────────────────────── */

export const SHAPE_KINDS = [
  "circle",
  "ring",
  "square",
  "pill",
  "triangle",
  "diamond",
  "star",
  "heart",
  "clover",
  "sparkle",
  "burst",
  "arrow",
  "squiggle",
  "moon",
] as const;

export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  circle: "Cercle",
  ring: "Anneau",
  square: "Carré",
  pill: "Pilule",
  triangle: "Triangle",
  diamond: "Losange",
  star: "Étoile",
  heart: "Cœur",
  clover: "Trèfle",
  sparkle: "Étincelle",
  burst: "Sceau",
  arrow: "Flèche",
  squiggle: "Vague",
  moon: "Lune",
};

/* ────────────────────────────────────────────────────────────
 * Schéma des éléments
 * ──────────────────────────────────────────────────────────── */

export const posterElementSchema = z.object({
  id: z.string().min(1).max(24),
  type: z.enum(["text", "shape", "image", "qr"]),
  /** Position du centre, en % de la page (léger hors-cadre autorisé). */
  x: z.number().min(-30).max(130),
  y: z.number().min(-30).max(130),
  /** Largeur en % de la largeur de page. */
  w: z.number().min(2).max(130),
  /** Rotation en degrés. */
  rot: z.number().min(-180).max(180).default(0),
  /** Ordre d'empilement. */
  z: z.number().int().min(0).max(200).default(10),

  // ── texte ──
  text: z.string().max(400).optional(),
  font: z.enum(POSTER_FONT_KEYS).optional(),
  /** Taille de police en % de la largeur de page (unités cqw). */
  size: z.number().min(0.8).max(30).optional(),
  color: hexColor.optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  weight: z.number().int().min(300).max(900).optional(),

  // ── forme ──
  kind: z.enum(SHAPE_KINDS).optional(),
  /** Rapport hauteur/largeur de la forme. */
  ratio: z.number().min(0.05).max(8).optional(),

  // ── image ──
  src: z
    .string()
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Image invalide")
    .max(500_000, "Image trop lourde")
    .optional(),
});

export type PosterElement = z.infer<typeof posterElementSchema>;

export const posterConfigSchema = z.object({
  version: z.literal(2).default(2),
  /** Dernier modèle appliqué (indicatif). */
  template: z.string().max(24).optional(),
  bg: hexColor.default("#fdf6e3"),
  bgPattern: z.enum(["none", "dots", "stripes"]).default("none"),
  elements: z.array(posterElementSchema).max(60).default([]),
});

export type PosterConfig = z.infer<typeof posterConfigSchema>;

let uid = 0;
export function elementId(): string {
  uid += 1;
  return `el-${Date.now().toString(36)}-${uid.toString(36)}`;
}

/* ────────────────────────────────────────────────────────────
 * Modèles — jeux d'éléments complets, modifiables à l'unité.
 * ──────────────────────────────────────────────────────────── */

interface TemplatePalette {
  bg: string;
  bgPattern: PosterConfig["bgPattern"];
  ink: string;
  soft: string;
  accent: string;
  chipBg: string;
  chipText: string;
  deco: [string, string, string];
  titleFont: string;
  bodyFont: string;
}

function buildTemplate(key: string, p: TemplatePalette, title: string): PosterConfig {
  let n = 0;
  const id = () => `${key}-${(n += 1)}`;
  const elements: PosterElement[] = [
    // Décor
    { id: id(), type: "shape", kind: "clover", color: p.deco[0], x: 8, y: 6, w: 10, rot: -14, z: 2, ratio: 1 },
    { id: id(), type: "shape", kind: "star", color: p.deco[1], x: 92, y: 5, w: 8, rot: 12, z: 2, ratio: 1 },
    { id: id(), type: "shape", kind: "sparkle", color: p.deco[2], x: 93, y: 36, w: 6, rot: 0, z: 2, ratio: 1 },
    { id: id(), type: "shape", kind: "circle", color: p.deco[1], x: 6, y: 42, w: 5, rot: 0, z: 2, ratio: 1 },
    // Titre + sous-titre
    {
      id: id(), type: "text", x: 50, y: 13, w: 88, rot: 0, z: 10,
      text: title, font: p.titleFont, size: 7.4, color: p.ink, align: "center", weight: 400,
    },
    {
      id: id(), type: "text", x: 50, y: 22, w: 76, rot: 0, z: 10,
      text: "Scannez, tournez la roue et repartez avec un cadeau.",
      font: p.bodyFont, size: 3, color: p.soft, align: "center", weight: 700,
    },
    // Chip « jeu gratuit »
    { id: id(), type: "shape", kind: "pill", color: p.chipBg, x: 50, y: 28.5, w: 42, rot: -1.5, z: 11, ratio: 0.16 },
    {
      id: id(), type: "text", x: 50, y: 28.5, w: 42, rot: -1.5, z: 12,
      text: "JEU 100 % GRATUIT", font: p.bodyFont, size: 2.4, color: p.chipText, align: "center", weight: 900,
    },
    // QR au centre
    { id: id(), type: "qr", x: 50, y: 50, w: 42, rot: 0, z: 10 },
    // Étapes
    {
      id: id(), type: "text", x: 50, y: 74, w: 80, rot: 0, z: 10,
      text: "1 · Scannez le QR code\n2 · Tournez la roue\n3 · Montrez votre gain en caisse",
      font: p.bodyFont, size: 3.1, color: p.ink, align: "center", weight: 800,
    },
    // Vague décorative + pied de page
    { id: id(), type: "shape", kind: "squiggle", color: p.accent, x: 50, y: 84, w: 26, rot: 0, z: 5, ratio: 0.2 },
    {
      id: id(), type: "text", x: 50, y: 92, w: 84, rot: 0, z: 10,
      text: "Jeu gratuit sans obligation d'achat — les gains ne sont jamais conditionnés à un avis.",
      font: p.bodyFont, size: 1.8, color: p.soft, align: "center", weight: 700,
    },
  ];
  return posterConfigSchema.parse({
    version: 2,
    template: key,
    bg: p.bg,
    bgPattern: p.bgPattern,
    elements,
  });
}

export interface PosterTemplate {
  key: string;
  label: string;
  swatch: [string, string, string];
  config: PosterConfig;
}

export const POSTER_TEMPLATES: PosterTemplate[] = [
  {
    key: "kermesse",
    label: "Kermesse",
    swatch: ["#fdf6e3", "#211d16", "#f5793b"],
    config: buildTemplate(
      "kermesse",
      {
        bg: "#fdf6e3", bgPattern: "none", ink: "#211d16", soft: "#3d382f",
        accent: "#f5793b", chipBg: "#fcca59", chipText: "#211d16",
        deco: ["#267f53", "#fcca59", "#f296bd"],
        titleFont: "lilita", bodyFont: "nunito",
      },
      "Tournez la roue,\ntentez votre chance !",
    ),
  },
  {
    key: "nuit",
    label: "Nuit",
    swatch: ["#211d16", "#fdf6e3", "#fcca59"],
    config: buildTemplate(
      "nuit",
      {
        bg: "#211d16", bgPattern: "dots", ink: "#fdf6e3", soft: "#b8b2a4",
        accent: "#fcca59", chipBg: "#fcca59", chipText: "#211d16",
        deco: ["#f5793b", "#fcca59", "#f296bd"],
        titleFont: "bangers", bodyFont: "nunito",
      },
      "Tournez, gagnez,\nrevenez !",
    ),
  },
  {
    key: "douceur",
    label: "Douceur",
    swatch: ["#ffe3ea", "#5b1d33", "#f296bd"],
    config: buildTemplate(
      "douceur",
      {
        bg: "#ffe3ea", bgPattern: "none", ink: "#5b1d33", soft: "#8a4b63",
        accent: "#f296bd", chipBg: "#ffffff", chipText: "#5b1d33",
        deco: ["#f296bd", "#fcca59", "#99b7f5"],
        titleFont: "pacifico", bodyFont: "poppins",
      },
      "Un petit jeu,\nun joli cadeau",
    ),
  },
  {
    key: "menthe",
    label: "Menthe",
    swatch: ["#eaf7f0", "#123326", "#267f53"],
    config: buildTemplate(
      "menthe",
      {
        bg: "#eaf7f0", bgPattern: "stripes", ink: "#123326", soft: "#3c6b55",
        accent: "#267f53", chipBg: "#267f53", chipText: "#eaf7f0",
        deco: ["#267f53", "#fcca59", "#99b7f5"],
        titleFont: "titan", bodyFont: "fredoka",
      },
      "La chance sourit\nà ceux qui scannent",
    ),
  },
];

export function getPosterTemplate(key: string): PosterTemplate | undefined {
  return POSTER_TEMPLATES.find((t) => t.key === key);
}

/* ────────────────────────────────────────────────────────────
 * Résolution + migration de l'ancien modèle (v1, champs fixes)
 * ──────────────────────────────────────────────────────────── */

/** Ancien modèle → éléments équivalents (rien n'est perdu). */
function migrateLegacy(raw: Record<string, unknown>): PosterConfig {
  const str = (v: unknown, fallback: string) =>
    typeof v === "string" && v.trim() ? v.trim() : fallback;
  const hex = (v: unknown, fallback: string) =>
    typeof v === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : fallback;

  const bg = hex(raw.bgFrom, "#ffffff");
  const ink = hex(raw.textColor, "#18181b");
  const accent = hex(raw.accent, "#f5793b");
  const title = str(raw.title, "Tentez votre chance !");
  const subtitle = str(raw.subtitle, "Tournez la roue, gagnez un cadeau.");
  const steps = [raw.step1, raw.step2, raw.step3]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  const footer = str(raw.footer, "Jeu gratuit sans obligation d'achat");
  const qrW = raw.qrScale === "sm" ? 34 : raw.qrScale === "lg" ? 50 : 42;

  let n = 0;
  const id = () => `mig-${(n += 1)}`;
  const elements: PosterElement[] = [
    { id: id(), type: "text", x: 50, y: 14, w: 88, rot: 0, z: 10, text: title, font: "lilita", size: 7, color: ink, align: "center", weight: 400 },
    { id: id(), type: "text", x: 50, y: 23, w: 78, rot: 0, z: 10, text: subtitle, font: "nunito", size: 3, color: ink, align: "center", weight: 700 },
    { id: id(), type: "qr", x: 50, y: 48, w: qrW, rot: 0, z: 10 },
    ...(steps.length
      ? [{
          id: id(), type: "text" as const, x: 50, y: 74, w: 80, rot: 0, z: 10,
          text: steps.map((s, i) => `${i + 1} · ${s}`).join("\n"),
          font: "nunito", size: 3, color: ink, align: "center" as const, weight: 800,
        }]
      : []),
    { id: id(), type: "shape", kind: "squiggle", color: accent, x: 50, y: 84, w: 26, rot: 0, z: 5, ratio: 0.2 },
    { id: id(), type: "text", x: 50, y: 92, w: 84, rot: 0, z: 10, text: footer, font: "nunito", size: 1.8, color: ink, align: "center", weight: 700 },
  ];

  return posterConfigSchema.parse({ version: 2, bg, bgPattern: "none", elements });
}

/** Configuration complète — migre l'ancien format, sûre sur jsonb corrompu. */
export function resolvePosterConfig(raw: unknown): PosterConfig {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.elements)) {
      const parsed = posterConfigSchema.safeParse(record);
      if (parsed.success) return parsed.data;
    } else if ("title" in record || "bgFrom" in record || "accent" in record) {
      try {
        return migrateLegacy(record);
      } catch {
        // repli sur le modèle par défaut
      }
    }
  }
  return POSTER_TEMPLATES[0].config;
}

/** Noir ou blanc selon la luminance du fond — pour éléments lisibles. */
export function contrastText(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150 ? "#18181b" : "#ffffff";
}
