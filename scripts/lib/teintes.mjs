/**
 * Extraction de la teinte d'accent d'une image — le calcul, sans les fichiers.
 *
 * Utilisé par `build-backdrop-panorama.mjs`, et vécu à part parce que la
 * FORMULE est ce qui doit rester stable : elle a servi à deux générateurs de
 * décor successifs, et le jour où un troisième arrive, il doit aboutir au même
 * rose pour les mêmes nuages. Deux copies finiraient par diverger sur un
 * réglage retouché d'un seul côté, et personne ne saurait dire pourquoi les
 * couleurs du site ont changé.
 *
 * Le principe, et c'est la décision qui compte ici : on retient le SOMMET de
 * l'histogramme des teintes, jamais leur moyenne. Une image de décor porte
 * souvent deux familles bien séparées — un ciel de nuages roses montre 41 % de
 * bleu et 40 % de rose. Leur moyenne circulaire tombe vers 285°, un violet
 * absent de l'image : moyenner une distribution à deux bosses invente une
 * couleur au lieu d'en choisir une.
 */

/** Saturation et clarté auxquelles toute teinte extraite est reposée. */
export const ACCENT_SATURATION = 0.62;
export const ACCENT_LIGHTNESS = 0.58;

/** Découpage du cercle des teintes : 36 tranches de 10°. */
export const BIN_COUNT = 36;
export const BIN_DEGREES = 360 / BIN_COUNT;
/** Demi-voisinage, en tranches, pour le lissage circulaire et l'affinage. */
export const BIN_NEIGHBOURS = 2;

export function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Histogramme des teintes d'un tampon brut RVB(A).
 *
 * Poids : saturation au carré (une couleur franche pèse plus qu'un pastel)
 * × fenêtre sur la clarté (nulle au noir et au blanc, maximale à mi-chemin).
 * Sans cette fenêtre, le cœur blanc des nuages et le noir des cavernes
 * dominent le calcul par leur seul nombre de pixels, et rendent une teinte qui
 * n'est celle d'aucune couleur visible.
 */
export function hueHistogram(data, channels, pixels) {
  const bins = new Array(BIN_COUNT).fill(0);

  for (let p = 0; p < pixels; p++) {
    const o = p * channels;
    const r = data[o] / 255;
    const g = data[o + 1] / 255;
    const b = data[o + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta < 0.02) continue;

    const lightness = (max + min) / 2;
    const saturation = delta / (1 - Math.abs(2 * lightness - 1) || 1);
    const w = saturation * saturation * (1 - Math.abs(2 * lightness - 1));
    if (w <= 0) continue;

    let hue;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;

    bins[Math.floor(hue / BIN_DEGREES) % BIN_COUNT] += w;
  }

  return bins;
}

/**
 * Teinte dominante d'un histogramme, ou `null` si l'image n'en a pas.
 *
 * Le sommet retient la famille la plus lourde, puis une moyenne circulaire
 * LOCALE, dans son seul voisinage, en affine le degré.
 */
export function histogramToAccent(bins) {
  return peakToAccent(bins, null).hex;
}

/**
 * Fraction du sommet qu'il suffit à la famille sortante de conserver pour
 * qu'on ne change pas de couleur. Voir `peakToAccent`.
 */
const HYSTERESIS = 0.85;

/**
 * Sommet de l'histogramme, avec **hystérésis** : à égalité près, on reste sur
 * la famille déjà retenue.
 *
 * Sans elle, deux familles au coude-à-coude font clignoter l'accent. Le
 * panorama en donne le cas d'école : son ciel montre du bleu ENTRE des nuages
 * roses, si bien que d'une bande à l'autre le vainqueur changeait — bleu,
 * rose, bleu — soit deux basculements de 140° sur le premier écran, là où
 * l'œil ne voit qu'un seul ciel.
 *
 * L'hystérésis ne masque pas les vraies transitions : quand on passe du ciel
 * aux bambous, la famille sortante ne conserve pas 85 % du sommet, et la
 * bascule a lieu. Elle ne fait que refuser les allers-retours entre deux
 * familles qui coexistent.
 *
 * @param bins       histogramme (déjà lissé sur ses voisins)
 * @param precedent  tranche retenue au pas précédent, ou `null` au départ
 * @returns {{ bin: number|null, hex: string|null }}
 */
export function peakToAccent(bins, precedent) {
  const total = bins.reduce((a, b) => a + b, 0);
  if (total <= 0) return { bin: null, hex: null };

  /* Lissage circulaire avant de chercher le sommet : sans lui, une famille
     étalée sur quatre tranches perdrait contre une famille étroite plus
     légère, au seul motif qu'elle est étalée. */
  const lisse = bins.map((_, i) => {
    let sum = 0;
    for (let d = -BIN_NEIGHBOURS; d <= BIN_NEIGHBOURS; d++) {
      sum += bins[(i + d + BIN_COUNT) % BIN_COUNT];
    }
    return sum;
  });

  let peak = 0;
  for (let i = 1; i < BIN_COUNT; i++) if (lisse[i] > lisse[peak]) peak = i;

  /* Une distribution plate n'a pas de dominante : lui en inventer une
     reviendrait à tirer une couleur au sort. Un histogramme uniforme donnerait
     13,9 % ; les images du film sont entre 44 % et 100 %. */
  if (lisse[peak] / total < 0.2) return { bin: null, hex: null };

  /* La famille sortante garde la main tant qu'elle reste proche du sommet. */
  if (precedent !== null && lisse[precedent] >= HYSTERESIS * lisse[peak]) {
    peak = precedent;
  }

  let x = 0;
  let y = 0;
  for (let d = -BIN_NEIGHBOURS; d <= BIN_NEIGHBOURS; d++) {
    const i = (peak + d + BIN_COUNT) % BIN_COUNT;
    const angle = ((i * BIN_DEGREES + BIN_DEGREES / 2) * Math.PI) / 180;
    x += Math.cos(angle) * bins[i];
    y += Math.sin(angle) * bins[i];
  }
  const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { bin: peak, hex: hslToHex(hue, ACCENT_SATURATION, ACCENT_LIGHTNESS) };
}

/**
 * Lisse une suite de teintes en additionnant les histogrammes voisins avant de
 * conclure. D'une position à la suivante, la dominante saute — une racine qui
 * traverse le cadre suffit à la faire virer, et sur un accent d'interface ce
 * saut se voit comme un clignotement. On somme donc les histogrammes, puis on
 * cherche le sommet une seule fois : c'est plus juste que de moyenner des
 * teintes déjà décidées, qui pourrait à nouveau mélanger deux familles.
 */
export function smoothAccents(histograms, demiFenetre) {
  let precedent = null;
  return histograms.map((_, i) => {
    const somme = new Array(BIN_COUNT).fill(0);
    for (let d = -demiFenetre; d <= demiFenetre; d++) {
      const h = histograms[i + d];
      if (!h) continue;
      for (let b = 0; b < BIN_COUNT; b++) somme[b] += h[b];
    }
    const { bin, hex } = peakToAccent(somme, precedent);
    /* Une position sans dominante ne remet pas la mémoire à zéro : sinon un
       seul plan délavé au milieu d'une séquence rouvrirait la porte au
       clignotement juste après. */
    if (bin !== null) precedent = bin;
    return hex;
  });
}

/** Luminosité perçue (Rec. 709) d'un tampon brut, entre 0 et 1. */
export function perceivedLuminance(data, channels, pixels) {
  let sum = 0;
  for (let p = 0; p < pixels; p++) {
    const o = p * channels;
    sum += (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
  }
  return Number((sum / pixels).toFixed(3));
}
