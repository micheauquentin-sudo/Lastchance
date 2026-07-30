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
export const PAGE_THEMES = ["nuit", "kermesse"] as const;

export const wheelStyleSchema = z.object({
  /** Dernier preset appliqué (indicatif — chaque champ reste modifiable). */
  preset: z.string().max(24).optional(),

  /** Ambiance de la page /play : « nuit » (dégradé sombre, texte blanc)
   *  ou « kermesse » (crème + encre + ombres dures — le joueur retrouve
   *  exactement l'univers du site Lastchance). */
  pageTheme: z.enum(PAGE_THEMES).default("nuit"),

  // Anneau extérieur
  ring: z.enum(RING_STYLES).default("classic"),
  ringColor: hexColor.optional(),
  lights: z.boolean().default(true),
  lightColorA: hexColor.default("#ffffff"),
  lightColorB: hexColor.default("#ffd34d"),

  // Segments
  segmentBorderColor: hexColor.default("#000000"),
  segmentBorderWidth: z.number().min(0).max(6).default(2),
  /** Couleur du texte des lots : « auto » = calculée par segment pour
   *  maximiser le contraste (bestTextColor) ; un hex explicite choisi
   *  par le commerçant est toujours respecté tel quel. Les styles déjà
   *  enregistrés portent un hex (l'éditeur sauve le style résolu) —
   *  seuls les styles vierges passent en auto. */
  labelColor: z.union([hexColor, z.literal("auto")]).default("auto"),
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
  // bordures franches, ampoules chaudes, bouton orange→jaune. Avec le
  // thème de page assorti, le joueur arrive sur le même univers que le
  // site Lastchance (fond crème, bandeau rayé, ombres dures encre).
  preset("kermesse", "Kermesse", ["#fcca59", "#f296bd", "#211d16"], {
    pageTheme: "kermesse",
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

/**
 * Décision d'habillage de la page /play, partagée entre le rendu client
 * et l'aperçu de l'éditeur : thème « kermesse » (fond crème `bg-k-bg`
 * du site + bandeau rayé, aucun fond inline) ou « nuit » (dégradé
 * radial personnalisé du commerçant).
 */
export function playSurface(style: WheelStyle): {
  kermesse: boolean;
  background?: string;
} {
  if (style.pageTheme === "kermesse") return { kermesse: true };
  return { kermesse: false, background: playBackground(style) };
}

/** Luminance relative WCAG 2.x d'une couleur `#rrggbb`. */
function luminance(hex: string): number {
  const c = hex.replace("#", "");
  const canaux = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lin = canaux.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Rapport de contraste WCAG entre deux couleurs opaques. */
export function contrastRatio(a: string, b: string): number {
  const [haut, bas] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (haut + 0.05) / (bas + 0.05);
}

/**
 * La surface de /play appelle-t-elle une PALETTE DE TEXTE SOMBRE ?
 *
 * ── Le défaut que cette fonction remplace (2026-07-30) ──
 *
 * Dix-huit endroits du produit écrivaient `style.pageTheme === "kermesse"` et
 * s'en servaient pour choisir la couleur du texte. C'était la mauvaise
 * question. Ce qui décide de la lisibilité, ce n'est pas le thème DÉCLARÉ,
 * c'est la clarté du fond RÉELLEMENT PEINT.
 *
 * Deux presets livrés embarquent un dégradé clair en gardant `pageTheme:
 * "nuit"` — donc `playText.title` valait `text-white` :
 *
 *   Pastel  (#fbcfe8 → #fda4af) : titre blanc à 1,38:1
 *   Cartoon (#fef08a → #f59e0b) : titre blanc à 1,16:1   (seuil : 3:1)
 *
 * Permanent, sans animation, sans artefact de mesure : tout commerçant qui
 * choisit l'un de ces deux styles publie une page dont le titre est
 * pratiquement invisible.
 *
 * ── Pourquoi une règle et non deux presets recolorés ──
 *
 * `bgFrom` et `bgTo` sont des champs de couleur LIBRES. Un commerçant peut
 * déjà, aujourd'hui, poser un fond blanc et obtenir un titre blanc. Recolorer
 * les deux presets réparerait deux exemples et laisserait le défaut entier.
 *
 * ── Le seuil, et pourquoi celui-là ──
 *
 * « La surface est claire si le BLANC échoue en AA-large (3:1) » — le critère
 * est exactement la chose qu'on cherche à éviter, pas un seuil de luminance
 * arbitraire. Les deux extrémités du dégradé sont testées : le titre est haut
 * (près de `bgFrom`), les mentions sont basses (près de `bgTo`).
 *
 * Classement obtenu sur les presets livrés — vérifié par
 * `wheel-style.test.ts`, qui refera le calcul à chaque exécution :
 * défaut 15,2 · bois 9,9 · nuit étoilée 14,7 · café 15,2 · ardoise 10,4 ·
 * rouge 10,0 → sombres ; Pastel 1,4 · Cartoon 1,2 → CLAIRES.
 */
export function playOnLightSurface(style: WheelStyle): boolean {
  if (style.pageTheme === "kermesse") return true;
  return (
    Math.min(
      contrastRatio("#ffffff", style.bgFrom),
      contrastRatio("#ffffff", style.bgTo),
    ) < 3
  );
}

/** Jetons de texte réellement appliqués sur /play, résolus en couleur. */
const TEXTE_SOMBRE = { titre: "#211d16", corps: "#3d382f" } as const;
const TEXTE_CLAIR = { titre: "#ffffff", corps: "#d4d4d8" } as const;

/**
 * Le fond choisi rend-il le texte de /play illisible ? Message destiné au
 * COMMERÇANT, jamais un refus.
 *
 * ── Pourquoi un avertissement et pas une validation bloquante ──
 *
 * `bgFrom` et `bgTo` sont des champs de couleur libres, et c'est voulu : le
 * commerçant habille sa page. `playOnLightSurface` choisit désormais la
 * palette de texte selon la clarté du fond, ce qui sauve les cas francs —
 * fond très clair, fond très sombre.
 *
 * Restent les DEMI-TEINTES, et aucune palette à deux états ne peut les
 * sauver : l'ambre `#f59e0b` rend 2,15:1 au texte blanc et 7,81:1 au texte
 * sombre, mais un `#7a7a7a` est hostile aux deux. Refuser ces couleurs
 * serait décider à la place du commerçant sur son propre habillage ; ne rien
 * dire serait le laisser publier une page que ses clients ne peuvent pas
 * lire. On mesure, on nomme le chiffre, et on le laisse trancher.
 *
 * ── Il ne parle QUE du texte secondaire, et ce n'est pas un oubli ──
 *
 * Le TITRE ne peut pas échouer, et la bascule de palette le garantit par
 * construction. Démonstration : le titre blanc n'échoue en AA-large que si le
 * fond a une luminance supérieure à ~0,30 ; mais dans ce cas
 * `playOnLightSurface` bascule sur `k-ink` (luminance 0,016), qui rend alors
 * au moins 5,3:1. Les deux conditions ne peuvent pas être vraies ensemble.
 *
 * Une première version de cette fonction portait une branche « votre titre
 * ressort à X:1 ». Un test l'a montrée INATTEIGNABLE — c'était du code mort,
 * et un message qu'aucun commerçant n'aurait jamais vu. Retirée.
 *
 * Le texte secondaire, lui, tombe pour de bon : il vise 4,5:1, et un fond de
 * demi-teinte le met en défaut quelle que soit la palette choisie.
 *
 * Le seuil suit WCAG 1.4.3. Les deux extrémités du dégradé sont testées — le
 * fond ne défile pas, un texte remonté en haut de l'écran repose bien sur
 * `bgFrom`.
 */
export function playContrastWarning(style: WheelStyle): string | null {
  if (style.pageTheme === "kermesse") return null;
  const jetons = playOnLightSurface(style) ? TEXTE_SOMBRE : TEXTE_CLAIR;
  const corps = Math.min(
    contrastRatio(jetons.corps, style.bgFrom),
    contrastRatio(jetons.corps, style.bgTo),
  );
  if (corps >= 4.5) return null;
  return `Sur ce fond, le texte secondaire ressort à ${corps.toFixed(1).replace(".", ",")}:1 — il en faut 4,5. Votre titre reste lisible ; ce sont les petites mentions qui s'effacent. Un fond plus franc, plus sombre ou plus clair, les remettra d'aplomb.`;
}

export type { FontKey };
