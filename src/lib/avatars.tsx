import type { ReactNode } from "react";

/**
 * Catalogue d'avatars du module Pronostics, dessinés à la main dans la
 * DA Kermesse (encre #211d16, aplats, gros contours arrondis). Deux
 * familles : des animaux « cartoon » au regard de compétiteur (sourcils
 * froncés, palette profonde — assumé mais pas enfantin) et les drapeaux
 * de 30 grandes nations du sport, en médaillon aux blancs crème façon
 * fanion vintage. Les joueurs en choisissent un à l'inscription puis
 * peuvent en changer. Une clé courte est stockée en base — aucune URL,
 * aucun upload : pas de donnée personnelle ni de surface d'abus.
 *
 * Chaque avatar est un SVG 100×100 autonome : lisible à 32 px dans un
 * classement comme à 96 px dans le sélecteur.
 */

const INK = "#211d16";

export const ANIMAL_AVATAR_IDS = [
  "chat",
  "renard",
  "ours",
  "panda",
  "lapin",
  "grenouille",
  "hibou",
  "pingouin",
  "lion",
  "tigre",
  "koala",
  "singe",
] as const;

export const FLAG_AVATAR_IDS = [
  "france",
  "angleterre",
  "espagne",
  "italie",
  "allemagne",
  "portugal",
  "paysbas",
  "belgique",
  "croatie",
  "suisse",
  "suede",
  "danemark",
  "pologne",
  "turquie",
  "maroc",
  "algerie",
  "tunisie",
  "senegal",
  "cotedivoire",
  "cameroun",
  "nigeria",
  "bresil",
  "argentine",
  "uruguay",
  "colombie",
  "mexique",
  "etatsunis",
  "canada",
  "japon",
  "coree",
] as const;

export const AVATAR_IDS = [...ANIMAL_AVATAR_IDS, ...FLAG_AVATAR_IDS] as const;

type AnimalAvatarId = (typeof ANIMAL_AVATAR_IDS)[number];
type FlagAvatarId = (typeof FLAG_AVATAR_IDS)[number];
export type AvatarId = (typeof AVATAR_IDS)[number];

/** Avatar servi quand aucun choix n'a été fait (clé vide en base). */
export const DEFAULT_AVATAR: AvatarId = "renard";

export function isAvatarId(value: string): value is AvatarId {
  return (AVATAR_IDS as readonly string[]).includes(value);
}

/** Ramène une valeur quelconque (base, formulaire) à un avatar valide. */
export function coerceAvatarId(value: string | null | undefined): AvatarId {
  return value && isAvatarId(value) ? value : DEFAULT_AVATAR;
}

interface AvatarDef {
  label: string;
  /** Fond du médaillon (palette Kermesse). */
  bg: string;
  /** Contenu centré, contour encre hérité du groupe parent. */
  draw: () => ReactNode;
}

// ────────────────────────────────────────────────────────────
// Animaux — helpers d'expression
// ────────────────────────────────────────────────────────────

/** Deux yeux « points » encre (sans contour, pour rester nets). */
function eyes(cx1: number, cx2: number, cy: number, r = 3.1) {
  return (
    <>
      <circle cx={cx1} cy={cy} r={r} fill={INK} stroke="none" />
      <circle cx={cx2} cy={cy} r={r} fill={INK} stroke="none" />
    </>
  );
}

/** Sourcils froncés vers le centre — le regard de compétiteur qui fait
 *  basculer chaque personnage du mignon vers l'assuré. */
function brows(cx1: number, cx2: number, cy: number, len = 10, drop = 3.5) {
  const h = len / 2;
  return (
    <path
      d={`M${cx1 - h} ${cy - drop} L${cx1 + h} ${cy}M${cx2 + h} ${cy - drop} L${cx2 - h} ${cy}`}
      fill="none"
      strokeWidth="2.8"
    />
  );
}

const ANIMALS: Record<AnimalAvatarId, AvatarDef> = {
  chat: {
    label: "Chat",
    bg: "#2e8c7f",
    draw: () => (
      <>
        <path d="M30 20 44 40 24 42Z" fill="#f0913f" />
        <path d="M70 20 56 40 76 42Z" fill="#f0913f" />
        <path d="M33 26 42 38 30 39Z" fill="#a8452f" stroke="none" />
        <path d="M67 26 58 38 70 39Z" fill="#a8452f" stroke="none" />
        <circle cx="50" cy="55" r="24" fill="#f0913f" />
        {brows(41, 59, 46)}
        {eyes(41, 59, 53)}
        <path d="M50 58 46 62 54 62Z" fill="#a8452f" stroke="none" />
        <path d="M50 62 50 65M45 68q5 3 10 0" fill="none" />
        <path d="M22 54 34 56M22 61 34 60M78 54 66 56M78 61 66 60" fill="none" strokeWidth="2.2" />
      </>
    ),
  },
  renard: {
    label: "Renard",
    bg: "#f0b02c",
    draw: () => (
      <>
        <path d="M27 22 46 42 26 44Z" fill="#d95f27" />
        <path d="M73 22 54 42 74 44Z" fill="#d95f27" />
        <path d="M31 26 42 40 30 41Z" fill={INK} stroke="none" />
        <path d="M69 26 58 40 70 41Z" fill={INK} stroke="none" />
        <path d="M26 46 74 46 50 66Z" fill="#d95f27" />
        <path d="M39 56 61 56 50 82Z" fill="#fdf6e3" />
        {/* Paupières inclinées fusionnant avec l'œil : regard perçant sans
            déborder sur le contour du museau triangulaire. */}
        <path d="M36.5 47.5 41 50.5M63.5 47.5 59 50.5" fill="none" strokeWidth="2.8" />
        {eyes(40, 60, 52)}
        <path d="M50 72 46 68 54 68Z" fill={INK} stroke="none" />
      </>
    ),
  },
  ours: {
    label: "Ours",
    bg: "#56719e",
    draw: () => (
      <>
        <circle cx="31" cy="31" r="11" fill="#7d5232" />
        <circle cx="69" cy="31" r="11" fill="#7d5232" />
        <circle cx="31" cy="31" r="5" fill="#c99a66" stroke="none" />
        <circle cx="69" cy="31" r="5" fill="#c99a66" stroke="none" />
        <circle cx="50" cy="54" r="25" fill="#7d5232" />
        <ellipse cx="50" cy="62" rx="13" ry="10" fill="#d9b98a" />
        {brows(41, 59, 42)}
        {eyes(41, 59, 49)}
        <circle cx="50" cy="58" r="4.2" fill={INK} stroke="none" />
        <path d="M50 62 50 65M45 68q5 2.5 10 0" fill="none" />
      </>
    ),
  },
  panda: {
    label: "Panda",
    bg: "#c34f5f",
    draw: () => (
      <>
        <circle cx="30" cy="30" r="11" fill={INK} />
        <circle cx="70" cy="30" r="11" fill={INK} />
        <circle cx="50" cy="55" r="25" fill="#fdf6e3" />
        <ellipse cx="40" cy="50" rx="7" ry="10" fill={INK} stroke="none" transform="rotate(18 40 50)" />
        <ellipse cx="60" cy="50" rx="7" ry="10" fill={INK} stroke="none" transform="rotate(-18 60 50)" />
        <circle cx="41" cy="51" r="2.7" fill="#fdf6e3" stroke="none" />
        <circle cx="59" cy="51" r="2.7" fill="#fdf6e3" stroke="none" />
        <path d="M50 60 46 64 54 64Z" fill={INK} stroke="none" />
        <path d="M50 64 50 67M45 69q5 2.5 10 0" fill="none" />
      </>
    ),
  },
  lapin: {
    label: "Lapin",
    bg: "#7b5ea7",
    draw: () => (
      <>
        <ellipse cx="41" cy="25" rx="6.5" ry="19" fill="#fdf6e3" />
        <ellipse cx="59" cy="25" rx="6.5" ry="19" fill="#fdf6e3" />
        <ellipse cx="41" cy="25" rx="3" ry="13" fill="#c69ab8" stroke="none" />
        <ellipse cx="59" cy="25" rx="3" ry="13" fill="#c69ab8" stroke="none" />
        <circle cx="50" cy="58" r="23" fill="#fdf6e3" />
        {brows(41, 59, 48)}
        {eyes(41, 59, 55)}
        <path d="M50 60 46 63 54 63Z" fill="#b3495c" stroke="none" />
        <path d="M50 63 50 66M45.5 68.5q4.5 2.5 9 0" fill="none" />
      </>
    ),
  },
  grenouille: {
    label: "Grenouille",
    bg: "#cf5b3f",
    draw: () => (
      <>
        <ellipse cx="50" cy="60" rx="29" ry="24" fill="#2f8f4e" />
        <circle cx="35" cy="36" r="14" fill="#2f8f4e" />
        <circle cx="65" cy="36" r="14" fill="#2f8f4e" />
        <circle cx="35" cy="35" r="7.5" fill="#fdf6e3" stroke="none" />
        <circle cx="65" cy="35" r="7.5" fill="#fdf6e3" stroke="none" />
        <circle cx="36" cy="36" r="3.4" fill={INK} stroke="none" />
        <circle cx="64" cy="36" r="3.4" fill={INK} stroke="none" />
        <path d="M28 29 38 32M72 29 62 32" fill="none" strokeWidth="2.8" />
        <path d="M36 62q14 8 28 0" fill="none" />
        <circle cx="44" cy="56" r="1.8" fill={INK} stroke="none" />
        <circle cx="56" cy="56" r="1.8" fill={INK} stroke="none" />
      </>
    ),
  },
  hibou: {
    label: "Hibou",
    bg: "#4c4a78",
    draw: () => (
      <>
        <path d="M30 30 40 46 26 46Z" fill="#7a4e2c" />
        <path d="M70 30 60 46 74 46Z" fill="#7a4e2c" />
        <ellipse cx="50" cy="56" rx="26" ry="28" fill="#7a4e2c" />
        <ellipse cx="50" cy="66" rx="16" ry="18" fill="#bd8f55" />
        <circle cx="39" cy="47" r="13" fill="#fdf6e3" />
        <circle cx="61" cy="47" r="13" fill="#fdf6e3" />
        <circle cx="39" cy="47" r="6" fill={INK} stroke="none" />
        <circle cx="61" cy="47" r="6" fill={INK} stroke="none" />
        <path d="M26 38 40 42M74 38 60 42" fill="none" strokeWidth="3.4" />
        <path d="M50 54 43 62 57 62Z" fill="#e3a93c" />
        <path d="M30 78 34 84M70 78 66 84" fill="none" />
      </>
    ),
  },
  pingouin: {
    label: "Pingouin",
    bg: "#3f7fa6",
    draw: () => (
      <>
        <ellipse cx="50" cy="54" rx="25" ry="30" fill="#26262a" />
        <ellipse cx="50" cy="60" rx="15" ry="22" fill="#fdf6e3" />
        <circle cx="42" cy="42" r="4.6" fill="#fdf6e3" />
        <circle cx="58" cy="42" r="4.6" fill="#fdf6e3" />
        <circle cx="42" cy="42" r="2.2" fill={INK} stroke="none" />
        <circle cx="58" cy="42" r="2.2" fill={INK} stroke="none" />
        <path d="M37 35 46 38M63 35 54 38" fill="none" stroke="#fdf6e3" strokeWidth="2.6" />
        <path d="M50 47 44 52 56 52Z" fill="#e07b2f" />
        <path d="M40 82 34 88 47 86ZM60 82 66 88 53 86Z" fill="#e07b2f" />
      </>
    ),
  },
  lion: {
    label: "Lion",
    bg: "#3c7a52",
    draw: () => (
      <>
        {Array.from({ length: 11 }, (_, i) => {
          const a = (i / 11) * Math.PI * 2;
          return (
            <circle
              key={i}
              cx={50 + Math.cos(a) * 27}
              cy={52 + Math.sin(a) * 27}
              r="10.5"
              fill="#c96a24"
            />
          );
        })}
        <circle cx="50" cy="52" r="22" fill="#e8ac6b" />
        {brows(42, 58, 42)}
        {eyes(42, 58, 49)}
        <path d="M50 55 45 59 55 59Z" fill={INK} stroke="none" />
        <path d="M50 59 50 62M43 64q7 4 14 0" fill="none" />
      </>
    ),
  },
  tigre: {
    label: "Tigre",
    bg: "#2f5866",
    draw: () => (
      <>
        <circle cx="31" cy="32" r="10" fill="#e2662a" />
        <circle cx="69" cy="32" r="10" fill="#e2662a" />
        <circle cx="31" cy="32" r="4" fill="#c99a66" stroke="none" />
        <circle cx="69" cy="32" r="4" fill="#c99a66" stroke="none" />
        <circle cx="50" cy="54" r="25" fill="#e2662a" />
        <ellipse cx="50" cy="63" rx="14" ry="11" fill="#fdf6e3" />
        <path d="M50 38 50 29M41 40 37 32M59 40 63 32M31 52 22 50M69 52 78 50M32 60 24 61M68 60 76 61" fill="none" strokeWidth="2.6" />
        {brows(42, 58, 44, 9, 3)}
        {eyes(42, 58, 50)}
        <path d="M50 59 46 63 54 63Z" fill="#b3495c" stroke="none" />
        <path d="M50 63 50 66" fill="none" />
      </>
    ),
  },
  koala: {
    label: "Koala",
    bg: "#ba6b3f",
    draw: () => (
      <>
        <circle cx="27" cy="40" r="15" fill="#8a949b" />
        <circle cx="73" cy="40" r="15" fill="#8a949b" />
        <circle cx="27" cy="40" r="8" fill="#b98a94" stroke="none" />
        <circle cx="73" cy="40" r="8" fill="#b98a94" stroke="none" />
        <circle cx="50" cy="55" r="24" fill="#8a949b" />
        {brows(41, 59, 45)}
        {eyes(41, 59, 52)}
        <ellipse cx="50" cy="60" rx="8" ry="9" fill={INK} stroke="none" />
      </>
    ),
  },
  singe: {
    label: "Singe",
    bg: "#6b8e3f",
    draw: () => (
      <>
        <circle cx="27" cy="46" r="11" fill="#6f4a2c" />
        <circle cx="73" cy="46" r="11" fill="#6f4a2c" />
        <circle cx="27" cy="46" r="5.5" fill="#c99a66" stroke="none" />
        <circle cx="73" cy="46" r="5.5" fill="#c99a66" stroke="none" />
        <circle cx="50" cy="50" r="24" fill="#6f4a2c" />
        <path d="M50 34q20 2 18 24q-2 18-18 18q-16 0-18-18q-2-22 18-24Z" fill="#d9b382" />
        {brows(42, 58, 43)}
        {eyes(42, 58, 50, 3)}
        <path d="M50 58 50 61" fill="none" />
        <circle cx="46" cy="63" r="1.7" fill={INK} stroke="none" />
        <circle cx="54" cy="63" r="1.7" fill={INK} stroke="none" />
        <path d="M45 67q5 3 10 0" fill="none" />
      </>
    ),
  },
};

// ────────────────────────────────────────────────────────────
// Drapeaux — géométrie de bandes découpées dans le disque
// ────────────────────────────────────────────────────────────

/** Rayon du disque drapeau : affleure le bord intérieur du liseré encre
 *  du médaillon (r=48, trait 3.5) pour éviter tout halo de fond. */
const FLAG_R = 46.5;

const fmt = (n: number) => +n.toFixed(2);
const clampToDisc = (v: number) => Math.min(50 + FLAG_R, Math.max(50 - FLAG_R, v));
const chordHalf = (v: number) =>
  Math.sqrt(Math.max(0, FLAG_R * FLAG_R - (v - 50) * (v - 50)));

/** Bande horizontale du disque entre y1 et y2 (bords = arcs de cercle). */
function hBandPath(y1: number, y2: number): string {
  const a = clampToDisc(y1);
  const b = clampToDisc(y2);
  const ha = fmt(chordHalf(a));
  const hb = fmt(chordHalf(b));
  return (
    `M${fmt(50 - ha)} ${fmt(a)} L${fmt(50 + ha)} ${fmt(a)}` +
    ` A${FLAG_R} ${FLAG_R} 0 0 1 ${fmt(50 + hb)} ${fmt(b)}` +
    ` L${fmt(50 - hb)} ${fmt(b)}` +
    ` A${FLAG_R} ${FLAG_R} 0 0 1 ${fmt(50 - ha)} ${fmt(a)}Z`
  );
}

/** Bande verticale du disque entre x1 et x2. */
function vBandPath(x1: number, x2: number): string {
  const a = clampToDisc(x1);
  const b = clampToDisc(x2);
  const ha = fmt(chordHalf(a));
  const hb = fmt(chordHalf(b));
  return (
    `M${fmt(a)} ${fmt(50 - ha)}` +
    ` A${FLAG_R} ${FLAG_R} 0 0 1 ${fmt(b)} ${fmt(50 - hb)}` +
    ` L${fmt(b)} ${fmt(50 + hb)}` +
    ` A${FLAG_R} ${FLAG_R} 0 0 1 ${fmt(a)} ${fmt(50 + ha)}Z`
  );
}

/** Étoile à cinq branches (emblèmes de drapeaux). */
function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${fmt(cx + Math.cos(a) * rad)} ${fmt(cy + Math.sin(a) * rad)}`);
  }
  return `M${pts.join(" L")}Z`;
}

/** Croissant ouvert vers la droite (Turquie, Algérie, Tunisie). */
function crescentPath(cx: number, cy: number, r: number): string {
  const tx = fmt(cx + 0.35 * r);
  const ty1 = fmt(cy - 0.82 * r);
  const ty2 = fmt(cy + 0.82 * r);
  const inner = fmt(0.8 * r);
  return (
    `M${tx} ${ty1} A${r} ${r} 0 1 0 ${tx} ${ty2}` +
    ` A${inner} ${inner} 0 1 1 ${tx} ${ty1}Z`
  );
}

/** Palette drapeaux : teintes légèrement assourdies + blanc crème pour
 *  rester dans la DA (façon fanion de tournoi vintage). */
const F = {
  red: "#cf3d3d",
  wine: "#b83232",
  blue: "#2b4f9c",
  navy: "#2b5ba6",
  sky: "#7fb3d9",
  green: "#2f8f4e",
  yellow: "#f2c94c",
  gold: "#e0a63a",
  orange: "#e8833a",
  cream: "#faf3e3",
} as const;

/** Croix nordique (Suède, Danemark) : branche verticale décalée à gauche. */
function nordicCross(color: string) {
  return (
    <>
      <path d={hBandPath(42, 58)} fill={color} />
      <path d={vBandPath(28, 44)} fill={color} />
    </>
  );
}

const FLAGS: Record<FlagAvatarId, AvatarDef> = {
  france: {
    label: "France",
    bg: F.cream,
    draw: () => (
      <g stroke="none">
        <path d={vBandPath(3, 34)} fill={F.blue} />
        <path d={vBandPath(66, 97)} fill={F.red} />
      </g>
    ),
  },
  angleterre: {
    label: "Angleterre",
    bg: F.cream,
    draw: () => (
      <g stroke="none">
        <path d={hBandPath(42, 58)} fill={F.red} />
        <path d={vBandPath(42, 58)} fill={F.red} />
      </g>
    ),
  },
  espagne: {
    label: "Espagne",
    bg: F.yellow,
    draw: () => (
      <g stroke="none">
        <path d={hBandPath(3, 28)} fill={F.red} />
        <path d={hBandPath(72, 97)} fill={F.red} />
      </g>
    ),
  },
  italie: {
    label: "Italie",
    bg: F.cream,
    draw: () => (
      <g stroke="none">
        <path d={vBandPath(3, 34)} fill={F.green} />
        <path d={vBandPath(66, 97)} fill={F.red} />
      </g>
    ),
  },
  allemagne: {
    label: "Allemagne",
    bg: F.red,
    draw: () => (
      <g stroke="none">
        <path d={hBandPath(3, 34)} fill={INK} />
        <path d={hBandPath(66, 97)} fill={F.yellow} />
      </g>
    ),
  },
  portugal: {
    label: "Portugal",
    bg: F.red,
    draw: () => (
      <g stroke="none">
        <path d={vBandPath(3, 40)} fill={F.green} />
        <circle cx="40" cy="50" r="9" fill={F.yellow} />
        <circle cx="40" cy="50" r="5" fill={F.red} />
        <circle cx="40" cy="50" r="2.4" fill={F.cream} />
      </g>
    ),
  },
  paysbas: {
    label: "Pays-Bas",
    bg: F.cream,
    draw: () => (
      <g stroke="none">
        <path d={hBandPath(3, 34)} fill={F.red} />
        <path d={hBandPath(66, 97)} fill={F.blue} />
      </g>
    ),
  },
  belgique: {
    label: "Belgique",
    bg: F.yellow,
    draw: () => (
      <g stroke="none">
        <path d={vBandPath(3, 34)} fill={INK} />
        <path d={vBandPath(66, 97)} fill={F.red} />
      </g>
    ),
  },
  croatie: {
    label: "Croatie",
    bg: F.cream,
    draw: () => (
      <g stroke="none">
        <path d={hBandPath(3, 34)} fill={F.red} />
        <path d={hBandPath(66, 97)} fill={F.blue} />
        {Array.from({ length: 12 }, (_, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          return (
            <rect
              key={i}
              x={40 + col * 5}
              y={42.5 + row * 5}
              width="5"
              height="5"
              fill={(col + row) % 2 === 0 ? F.red : F.cream}
            />
          );
        })}
      </g>
    ),
  },
  suisse: {
    label: "Suisse",
    bg: F.red,
    draw: () => (
      <g stroke="none">
        <rect x="44" y="30" width="12" height="40" fill={F.cream} />
        <rect x="30" y="44" width="40" height="12" fill={F.cream} />
      </g>
    ),
  },
  suede: {
    label: "Suède",
    bg: F.navy,
    draw: () => <g stroke="none">{nordicCross(F.yellow)}</g>,
  },
  danemark: {
    label: "Danemark",
    bg: F.red,
    draw: () => <g stroke="none">{nordicCross(F.cream)}</g>,
  },
  pologne: {
    label: "Pologne",
    bg: F.cream,
    draw: () => (
      <g stroke="none">
        <path d={hBandPath(50, 97)} fill={F.red} />
      </g>
    ),
  },
  turquie: {
    label: "Turquie",
    bg: F.red,
    draw: () => (
      <g stroke="none">
        <path d={crescentPath(44, 50, 14)} fill={F.cream} />
        <path d={starPath(60, 50, 6)} fill={F.cream} />
      </g>
    ),
  },
  maroc: {
    label: "Maroc",
    bg: F.wine,
    draw: () => (
      <g stroke="none">
        <path d={starPath(50, 52, 17)} fill={F.green} />
      </g>
    ),
  },
  algerie: {
    label: "Algérie",
    bg: F.cream,
    draw: () => (
      <g stroke="none">
        <path d={vBandPath(3, 50)} fill={F.green} />
        <path d={crescentPath(52, 50, 13)} fill={F.red} />
        <path d={starPath(61, 50, 4.5)} fill={F.red} />
      </g>
    ),
  },
  tunisie: {
    label: "Tunisie",
    bg: F.red,
    draw: () => (
      <g stroke="none">
        <circle cx="50" cy="50" r="16" fill={F.cream} />
        <path d={crescentPath(50, 50, 10)} fill={F.red} />
        <path d={starPath(56.5, 50, 4)} fill={F.red} />
      </g>
    ),
  },
  senegal: {
    label: "Sénégal",
    bg: F.yellow,
    draw: () => (
      <g stroke="none">
        <path d={vBandPath(3, 34)} fill={F.green} />
        <path d={vBandPath(66, 97)} fill={F.red} />
        <path d={starPath(50, 50, 8)} fill={F.green} />
      </g>
    ),
  },
  cotedivoire: {
    label: "Côte d'Ivoire",
    bg: F.cream,
    draw: () => (
      <g stroke="none">
        <path d={vBandPath(3, 34)} fill={F.orange} />
        <path d={vBandPath(66, 97)} fill={F.green} />
      </g>
    ),
  },
  cameroun: {
    label: "Cameroun",
    bg: F.red,
    draw: () => (
      <g stroke="none">
        <path d={vBandPath(3, 34)} fill={F.green} />
        <path d={vBandPath(66, 97)} fill={F.yellow} />
        <path d={starPath(50, 50, 7)} fill={F.yellow} />
      </g>
    ),
  },
  nigeria: {
    label: "Nigeria",
    bg: F.cream,
    draw: () => (
      <g stroke="none">
        <path d={vBandPath(3, 34)} fill={F.green} />
        <path d={vBandPath(66, 97)} fill={F.green} />
      </g>
    ),
  },
  bresil: {
    label: "Brésil",
    bg: F.green,
    draw: () => (
      <g stroke="none">
        <path d="M50 21 79 50 50 79 21 50Z" fill={F.yellow} />
        <circle cx="50" cy="50" r="12" fill={F.blue} />
      </g>
    ),
  },
  argentine: {
    label: "Argentine",
    bg: F.cream,
    draw: () => (
      <g stroke="none">
        <path d={hBandPath(3, 32)} fill={F.sky} />
        <path d={hBandPath(68, 97)} fill={F.sky} />
        <path d={starPath(50, 50, 8.5)} fill={F.gold} />
        <circle cx="50" cy="50" r="4.5" fill={F.yellow} />
      </g>
    ),
  },
  uruguay: {
    label: "Uruguay",
    bg: F.cream,
    draw: () => (
      <g stroke="none">
        <path d={hBandPath(15, 22)} fill={F.blue} />
        <path d={hBandPath(34, 41)} fill={F.blue} />
        <path d={hBandPath(59, 66)} fill={F.blue} />
        <path d={hBandPath(78, 85)} fill={F.blue} />
        <circle cx="27" cy="27" r="11" fill={F.cream} />
        <path d={starPath(27, 27, 9)} fill={F.gold} />
        <circle cx="27" cy="27" r="4.5" fill={F.yellow} />
      </g>
    ),
  },
  colombie: {
    label: "Colombie",
    bg: F.yellow,
    draw: () => (
      <g stroke="none">
        <path d={hBandPath(50, 73)} fill={F.blue} />
        <path d={hBandPath(73, 97)} fill={F.red} />
      </g>
    ),
  },
  mexique: {
    label: "Mexique",
    bg: F.cream,
    draw: () => (
      <g stroke="none">
        <path d={vBandPath(3, 34)} fill={F.green} />
        <path d={vBandPath(66, 97)} fill={F.red} />
        <ellipse cx="50" cy="52" rx="6" ry="4.5" fill="#7a5230" />
        <circle cx="55" cy="47" r="2.6" fill="#7a5230" />
        <path d="M57 46 60 47 57 48.5Z" fill={F.gold} />
      </g>
    ),
  },
  etatsunis: {
    label: "États-Unis",
    bg: F.cream,
    draw: () => (
      <g stroke="none">
        <path d={hBandPath(3, 16)} fill={F.red} />
        <path d={hBandPath(30, 43)} fill={F.red} />
        <path d={hBandPath(57, 70)} fill={F.red} />
        <path d={hBandPath(84, 97)} fill={F.red} />
        <path d={`M50 50 L50 ${fmt(50 - FLAG_R)} A${FLAG_R} ${FLAG_R} 0 0 0 ${fmt(50 - FLAG_R)} 50Z`} fill={F.blue} />
        <circle cx="17" cy="35" r="2.2" fill={F.cream} />
        <circle cx="27" cy="21" r="2.2" fill={F.cream} />
        <circle cx="29" cy="37" r="2.2" fill={F.cream} />
        <circle cx="40" cy="27" r="2.2" fill={F.cream} />
      </g>
    ),
  },
  canada: {
    label: "Canada",
    bg: F.cream,
    draw: () => (
      <g stroke="none">
        <path d={vBandPath(3, 30)} fill={F.red} />
        <path d={vBandPath(70, 97)} fill={F.red} />
        <path
          d="M50 34 L54 42 L60 39 L57 47 L64 46 L58 54 L61 58 L52 57 L52 64 L48 64 L48 57 L39 58 L42 54 L36 46 L43 47 L40 39 L46 42Z"
          fill={F.red}
        />
      </g>
    ),
  },
  japon: {
    label: "Japon",
    bg: F.cream,
    draw: () => (
      <g stroke="none">
        <circle cx="50" cy="50" r="15" fill={F.red} />
      </g>
    ),
  },
  coree: {
    label: "Corée du Sud",
    bg: F.cream,
    draw: () => (
      <g stroke="none">
        <path d="M37 50 A13 13 0 0 1 63 50Z" fill={F.red} />
        <path d="M37 50 A13 13 0 0 0 63 50Z" fill={F.blue} />
        <circle cx="43.5" cy="50" r="6.5" fill={F.red} />
        <circle cx="56.5" cy="50" r="6.5" fill={F.blue} />
        <path d="M24 32 32 24M27 35 35 27M65 73 73 65M68 76 76 68" stroke={INK} strokeWidth="2.4" fill="none" />
      </g>
    ),
  },
};

const AVATARS: Record<AvatarId, AvatarDef> = { ...ANIMALS, ...FLAGS };

/** Groupes affichés par le sélecteur (onglets Animaux / Nations). */
export const AVATAR_GROUPS = [
  { key: "animaux", label: "Animaux", ids: ANIMAL_AVATAR_IDS },
  { key: "nations", label: "Nations", ids: FLAG_AVATAR_IDS },
] as const;

export function avatarLabel(id: string): string {
  return AVATARS[coerceAvatarId(id)].label;
}

/**
 * Rend un avatar. `id` est tolérant (valeur base/formulaire) : une clé
 * inconnue retombe sur l'avatar par défaut plutôt que de casser le rendu.
 */
export function Avatar({
  id,
  className,
  title,
}: {
  id: string;
  className?: string;
  title?: string;
}) {
  const def = AVATARS[coerceAvatarId(id)];
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title ?? def.label}
    >
      <circle cx="50" cy="50" r="48" fill={def.bg} stroke={INK} strokeWidth="3.5" />
      <g
        stroke={INK}
        strokeWidth="3.1"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {def.draw()}
      </g>
    </svg>
  );
}
