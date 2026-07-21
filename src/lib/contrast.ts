/**
 * Contraste WCAG 2.x — helpers purs, sans dépendance.
 *
 * Partagés entre le rendu de la roue (couleur de texte « auto » calculée
 * par segment) et l'éditeur du Studio (avertissement de lisibilité quand
 * le commerçant choisit une couleur de texte explicite peu contrastée).
 */

/** Encre sombre du projet (k-ink) et blanc : les deux candidats du mode auto. */
export const AUTO_TEXT_DARK = "#211d16";
export const AUTO_TEXT_LIGHT = "#ffffff";

/** `#abc` / `#aabbcc` → [r, g, b] en 0..255, ou null si invalide. */
function parseHex(color: string): [number, number, number] | null {
  const m = /^#(?:([0-9a-f]{3})|([0-9a-f]{6}))$/i.exec(color.trim());
  if (!m) return null;
  const hex = m[1]
    ? m[1]
        .split("")
        .map((c) => c + c)
        .join("")
    : m[2];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/** Linéarisation sRGB d'un canal 0..255 (WCAG 2.x). */
function linearize(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/**
 * Luminance relative WCAG : 0 (noir) → 1 (blanc).
 * Couleur non hexadécimale : 0 (traitée comme noire) — les couleurs du
 * projet sont validées en amont (zod), c'est un simple filet de sécurité.
 */
export function relativeLuminance(color: string): number {
  const rgb = parseHex(color);
  if (!rgb) return 0;
  return (
    0.2126 * linearize(rgb[0]) +
    0.7152 * linearize(rgb[1]) +
    0.0722 * linearize(rgb[2])
  );
}

/** Ratio de contraste WCAG entre deux couleurs : 1 (identiques) → 21 (noir/blanc). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Couleur de texte (encre sombre ou blanc) maximisant le contraste sur
 * `bg`. À égalité, l'encre gagne (fonds moyens : le sombre lit mieux).
 */
export function bestTextColor(bg: string): string {
  return contrastRatio(bg, AUTO_TEXT_DARK) >= contrastRatio(bg, AUTO_TEXT_LIGHT)
    ? AUTO_TEXT_DARK
    : AUTO_TEXT_LIGHT;
}
