import QRCode from "qrcode";
import type {
  QrEyeStyle,
  QrFrame,
  QrGradientType,
  QrPattern,
  QrStyle,
} from "@/types/database";

/**
 * Studio QR — moteur de rendu canvas maison (inspiré des générateurs
 * type qr.io) : formes de modules, yeux personnalisés, dégradés,
 * bannière d'appel à l'action et logo. La matrice vient de
 * `QRCode.create` ; tout le dessin est fait ici, ce qui permet des
 * styles impossibles avec `QRCode.toCanvas`.
 *
 * Compatible ascendant : un style `{ dark, light, logo }` d'avant le
 * studio se résout en carrés classiques, sans dégradé ni cadre.
 */

export interface ResolvedQrStyle {
  dark: string;
  light: string;
  logo: string | null;
  logoScale: number;
  pattern: QrPattern;
  eyeStyle: QrEyeStyle;
  eyeColor: string | null;
  gradientType: QrGradientType;
  darkTo: string | null;
  frame: QrFrame;
  frameText: string;
  frameColor: string;
}

export const QR_DEFAULTS: ResolvedQrStyle = {
  dark: "#18181b",
  light: "#ffffff",
  logo: null,
  logoScale: 0.22,
  pattern: "square",
  eyeStyle: "square",
  eyeColor: null,
  gradientType: "none",
  darkTo: null,
  frame: "none",
  frameText: "SCANNEZ-MOI",
  frameColor: "#211d16",
};

export function resolveQrStyle(style: QrStyle | null | undefined): ResolvedQrStyle {
  return {
    dark: style?.dark ?? QR_DEFAULTS.dark,
    light: style?.light ?? QR_DEFAULTS.light,
    logo: style?.logo ?? null,
    logoScale: Math.min(0.32, Math.max(0.12, style?.logoScale ?? QR_DEFAULTS.logoScale)),
    pattern: style?.pattern ?? QR_DEFAULTS.pattern,
    eyeStyle: style?.eyeStyle ?? QR_DEFAULTS.eyeStyle,
    eyeColor: style?.eyeColor ?? null,
    gradientType: style?.gradientType ?? QR_DEFAULTS.gradientType,
    darkTo: style?.darkTo ?? null,
    frame: style?.frame ?? QR_DEFAULTS.frame,
    frameText: style?.frameText ?? QR_DEFAULTS.frameText,
    frameColor: style?.frameColor ?? QR_DEFAULTS.frameColor,
  };
}

/* ── Modèles prêts à l'emploi (mélangeables champ par champ ensuite) ── */

export interface QrPreset {
  key: string;
  label: string;
  swatch: [string, string, string];
  style: Omit<ResolvedQrStyle, "logo">;
}

function qrPreset(
  key: string,
  label: string,
  swatch: [string, string, string],
  overrides: Partial<Omit<ResolvedQrStyle, "logo">>,
): QrPreset {
  const { logo: _logo, ...base } = QR_DEFAULTS;
  void _logo;
  return { key, label, swatch, style: { ...base, ...overrides } };
}

export const QR_PRESETS: QrPreset[] = [
  // Style maison — la DA « La Kermesse » du site.
  qrPreset("kermesse", "Kermesse", ["#211d16", "#fdf6e3", "#f5793b"], {
    dark: "#211d16",
    light: "#fdf6e3",
    pattern: "rounded",
    eyeStyle: "rounded",
    eyeColor: "#f5793b",
    frame: "banner",
    frameText: "SCANNEZ & GAGNEZ",
    frameColor: "#211d16",
  }),
  qrPreset("classique", "Classique", ["#18181b", "#ffffff", "#18181b"], {}),
  qrPreset("sucette", "Sucette", ["#f5793b", "#fff5f8", "#f296bd"], {
    dark: "#f5793b",
    darkTo: "#e0447f",
    gradientType: "linear",
    light: "#fff5f8",
    pattern: "dots",
    eyeStyle: "circle",
    eyeColor: "#e0447f",
  }),
  qrPreset("menthe", "Menthe", ["#267f53", "#f2fbf6", "#267f53"], {
    dark: "#1c5f3e",
    darkTo: "#2f9e67",
    gradientType: "radial",
    light: "#f2fbf6",
    pattern: "rounded",
    eyeStyle: "leaf",
  }),
  qrPreset("nuit", "Nuit", ["#1e2a4a", "#eef2ff", "#4468c4"], {
    dark: "#1e2a4a",
    darkTo: "#4468c4",
    gradientType: "linear",
    light: "#eef2ff",
    pattern: "diamond",
    eyeStyle: "square",
    frame: "banner",
    frameText: "SCANNEZ-MOI",
    frameColor: "#1e2a4a",
  }),
];

/* ── Lisibilité ── */

function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Texte lisible (crème ou encre) sur une couleur donnée. */
function readableOn(hex: string): string {
  return luminance(hex) > 0.4 ? "#211d16" : "#fdf6e3";
}

/** Le QR restera-t-il lisible par les téléphones ? (seuil pragmatique) */
export function isScannable(style: QrStyle | null | undefined): boolean {
  const s = resolveQrStyle(style);
  const colors = [s.dark];
  if (s.gradientType !== "none" && s.darkTo) colors.push(s.darkTo);
  if (s.eyeColor) colors.push(s.eyeColor);
  return colors.every((c) => contrastRatio(c, s.light) >= 2.5);
}

/* ── Dessin ── */

const MARGIN = 2; // zone de silence, en modules

function isFinderZone(row: number, col: number, n: number): boolean {
  return (
    (row < 7 && col < 7) ||
    (row < 7 && col >= n - 7) ||
    (row >= n - 7 && col < 7)
  );
}

/** Modules voisins présents (pour les formes connectées). */
interface Neighbors {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

function drawModule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  pattern: QrPattern,
  nb: Neighbors,
) {
  switch (pattern) {
    case "dots": {
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, cell * 0.46, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "rounded": {
      ctx.beginPath();
      ctx.roundRect(x + cell * 0.05, y + cell * 0.05, cell * 0.9, cell * 0.9, cell * 0.32);
      ctx.fill();
      break;
    }
    case "diamond": {
      ctx.beginPath();
      ctx.moveTo(x + cell / 2, y + cell * 0.04);
      ctx.lineTo(x + cell * 0.96, y + cell / 2);
      ctx.lineTo(x + cell / 2, y + cell * 0.96);
      ctx.lineTo(x + cell * 0.04, y + cell / 2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "fluid": {
      // Blocs fusionnés : seuls les coins « exposés » (sans voisin sur
      // les deux côtés adjacents) sont arrondis ; léger débord vers les
      // voisins pour une jonction sans couture.
      const r = cell * 0.5;
      const w = cell + (nb.right ? 0.5 : 0);
      const h = cell + (nb.down ? 0.5 : 0);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, [
        !nb.up && !nb.left ? r : 0,
        !nb.up && !nb.right ? r : 0,
        !nb.down && !nb.right ? r : 0,
        !nb.down && !nb.left ? r : 0,
      ]);
      ctx.fill();
      break;
    }
    case "lines-h": {
      // Barres horizontales : les runs se soudent, extrémités rondes.
      const h = cell * 0.72;
      const yy = y + (cell - h) / 2;
      const x0 = x + (nb.left ? 0 : cell * 0.06);
      const x1 = x + cell - (nb.right ? -0.5 : cell * 0.06);
      const r = h / 2;
      ctx.beginPath();
      ctx.roundRect(x0, yy, x1 - x0, h, [
        nb.left ? 0 : r,
        nb.right ? 0 : r,
        nb.right ? 0 : r,
        nb.left ? 0 : r,
      ]);
      ctx.fill();
      break;
    }
    case "lines-v": {
      // Colonnes verticales : même logique que lines-h, à la verticale.
      const w = cell * 0.72;
      const xx = x + (cell - w) / 2;
      const y0 = y + (nb.up ? 0 : cell * 0.06);
      const y1 = y + cell - (nb.down ? -0.5 : cell * 0.06);
      const r = w / 2;
      ctx.beginPath();
      ctx.roundRect(xx, y0, w, y1 - y0, [
        nb.up ? 0 : r,
        nb.up ? 0 : r,
        nb.down ? 0 : r,
        nb.down ? 0 : r,
      ]);
      ctx.fill();
      break;
    }
    case "classy": {
      // Feuilles : coins opposés arrondis (haut-gauche / bas-droit).
      const r = cell * 0.48;
      ctx.beginPath();
      ctx.roundRect(x + cell * 0.04, y + cell * 0.04, cell * 0.92, cell * 0.92, [r, 0, r, 0]);
      ctx.fill();
      break;
    }
    default:
      // léger débord pour éviter les fils blancs entre modules
      ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
  }
}

/** Radii [tl, tr, br, bl] de l'anneau extérieur d'un œil selon le style. */
function eyeRadii(style: QrEyeStyle, unit: number): [number, number, number, number] {
  switch (style) {
    case "rounded":
      return [unit * 2.1, unit * 2.1, unit * 2.1, unit * 2.1];
    case "circle":
      return [unit * 3.5, unit * 3.5, unit * 3.5, unit * 3.5];
    case "leaf":
      return [unit * 2.6, unit * 0.4, unit * 2.6, unit * 0.4];
    default:
      return [0, 0, 0, 0];
  }
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  style: QrEyeStyle,
  fill: string | CanvasGradient,
) {
  const outer = cell * 7;
  const scale = (r: [number, number, number, number], k: number) =>
    r.map((v) => Math.max(0, v * k)) as [number, number, number, number];
  const radii = eyeRadii(style, cell);

  // Anneau extérieur (7×7 percé en 5×5) — remplissage pair-impair.
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, outer, outer, radii);
  ctx.roundRect(x + cell, y + cell, cell * 5, cell * 5, scale(radii, 5 / 7));
  ctx.fill("evenodd");

  // Pupille 3×3.
  ctx.beginPath();
  ctx.roundRect(x + cell * 2, y + cell * 2, cell * 3, cell * 3, scale(radii, 3.4 / 7));
  ctx.fill();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

/**
 * Dessine le QR complet (cadre, fond, modules, yeux, logo, bannière)
 * dans `canvas`. `size` est la largeur du QR ; avec un cadre, le canvas
 * final est un peu plus large et plus haut (bannière).
 */
export async function renderQr(
  canvas: HTMLCanvasElement,
  url: string,
  style: QrStyle | null | undefined,
  size: number,
) {
  const s = resolveQrStyle(style);
  const qr = QRCode.create(url, {
    errorCorrectionLevel: s.logo ? "H" : "M",
  });
  const n = qr.modules.size;
  const data = qr.modules.data;

  const hasFrame = s.frame === "banner";
  const framePad = hasFrame ? Math.round(size * 0.055) : 0;
  const bannerH = hasFrame ? Math.round(size * 0.17) : 0;
  const W = size + framePad * 2;
  const H = size + framePad * 2 + bannerH;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);

  // Cadre + fond du QR.
  if (hasFrame) {
    ctx.fillStyle = s.frameColor;
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, Math.round(size * 0.055));
    ctx.fill();
    ctx.fillStyle = s.light;
    ctx.beginPath();
    ctx.roundRect(framePad, framePad, size, size, Math.round(size * 0.03));
    ctx.fill();
  } else {
    ctx.fillStyle = s.light;
    ctx.fillRect(0, 0, W, H);
  }

  const cell = size / (n + MARGIN * 2);
  const ox = framePad + MARGIN * cell;
  const oy = framePad + MARGIN * cell;

  // Remplissage des modules : couleur unie ou dégradé.
  let fill: string | CanvasGradient = s.dark;
  if (s.gradientType === "linear" && s.darkTo) {
    const g = ctx.createLinearGradient(ox, oy, ox + n * cell, oy + n * cell);
    g.addColorStop(0, s.dark);
    g.addColorStop(1, s.darkTo);
    fill = g;
  } else if (s.gradientType === "radial" && s.darkTo) {
    const cx = ox + (n * cell) / 2;
    const cy = oy + (n * cell) / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, (n * cell) / 1.35);
    g.addColorStop(0, s.dark);
    g.addColorStop(1, s.darkTo);
    fill = g;
  }

  // Un module « compte » s'il est actif et hors des yeux (dessinés à part).
  const present = (r: number, c: number) =>
    r >= 0 && c >= 0 && r < n && c < n && !!data[r * n + c] && !isFinderZone(r, c, n);

  ctx.fillStyle = fill;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!present(r, c)) continue;
      drawModule(ctx, ox + c * cell, oy + r * cell, cell, s.pattern, {
        up: present(r - 1, c),
        down: present(r + 1, c),
        left: present(r, c - 1),
        right: present(r, c + 1),
      });
    }
  }

  // Les trois yeux.
  const eyeFill: string | CanvasGradient = s.eyeColor ?? fill;
  drawEye(ctx, ox, oy, cell, s.eyeStyle, eyeFill);
  drawEye(ctx, ox + (n - 7) * cell, oy, cell, s.eyeStyle, eyeFill);
  drawEye(ctx, ox, oy + (n - 7) * cell, cell, s.eyeStyle, eyeFill);

  // Logo centré sur un pavé arrondi couleur fond.
  if (s.logo) {
    try {
      const img = await loadImage(s.logo);
      const logoSize = size * s.logoScale;
      const pad = size * 0.035;
      const lx = framePad + (size - logoSize) / 2;
      const box = logoSize + pad * 2;
      // lx sert aussi de y : la zone QR est carrée et le logo centré.
      ctx.fillStyle = s.light;
      ctx.beginPath();
      ctx.roundRect(lx - pad, lx - pad, box, box, pad * 1.6);
      ctx.fill();
      const ratio = img.width / img.height;
      const w = ratio >= 1 ? logoSize : logoSize * ratio;
      const h = ratio >= 1 ? logoSize / ratio : logoSize;
      ctx.drawImage(img, lx + (logoSize - w) / 2, lx + (logoSize - h) / 2, w, h);
    } catch {
      // logo illisible : le QR reste valide sans lui
    }
  }

  // Texte de la bannière.
  if (hasFrame && s.frameText) {
    ctx.fillStyle = readableOn(s.frameColor);
    ctx.font = `800 ${Math.round(bannerH * 0.44)}px Nunito, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      s.frameText.toUpperCase(),
      W / 2,
      framePad + size + framePad / 2 + bannerH / 2,
      W - framePad * 2,
    );
  }
}
