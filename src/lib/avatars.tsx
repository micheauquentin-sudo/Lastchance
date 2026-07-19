import type { ReactNode } from "react";

/**
 * Catalogue d'avatars « cartoon » du module Pronostics, dessinés à la
 * main dans la DA Kermesse (encre #211d16, aplats de la palette k-*,
 * gros contours arrondis). Les joueurs en choisissent un à l'inscription
 * puis peuvent en changer. Une clé courte est stockée en base — aucune
 * URL, aucun upload : pas de donnée personnelle ni de surface d'abus.
 *
 * Chaque avatar est un SVG 100×100 autonome : lisible à 32 px dans un
 * classement comme à 96 px dans le sélecteur.
 */

const INK = "#211d16";

export const AVATAR_IDS = [
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
  /** Personnage centré, contour encre hérité du groupe parent. */
  draw: () => ReactNode;
}

/** Deux yeux « points » encre (sans contour, pour rester nets). */
function eyes(cx1: number, cx2: number, cy: number, r = 3.4) {
  return (
    <>
      <circle cx={cx1} cy={cy} r={r} fill={INK} stroke="none" />
      <circle cx={cx2} cy={cy} r={r} fill={INK} stroke="none" />
    </>
  );
}

const AVATARS: Record<AvatarId, AvatarDef> = {
  chat: {
    label: "Chat",
    bg: "#f296bd",
    draw: () => (
      <>
        <path d="M30 20 44 40 24 42Z" fill="#f6b26a" />
        <path d="M70 20 56 40 76 42Z" fill="#f6b26a" />
        <path d="M33 26 42 38 30 39Z" fill="#e8607f" stroke="none" />
        <path d="M67 26 58 38 70 39Z" fill="#e8607f" stroke="none" />
        <circle cx="50" cy="55" r="24" fill="#f6b26a" />
        {eyes(41, 59, 53)}
        <path d="M50 58 46 62 54 62Z" fill="#e8607f" stroke="none" />
        <path d="M50 62 50 66" />
        <path d="M50 66 45 69M50 66 55 69" fill="none" />
        <path d="M22 54 34 56M22 61 34 60M78 54 66 56M78 61 66 60" fill="none" strokeWidth="2.2" />
      </>
    ),
  },
  renard: {
    label: "Renard",
    bg: "#fcca59",
    draw: () => (
      <>
        <path d="M27 22 46 42 26 44Z" fill="#f5793b" />
        <path d="M73 22 54 42 74 44Z" fill="#f5793b" />
        <path d="M31 26 42 40 30 41Z" fill={INK} stroke="none" />
        <path d="M69 26 58 40 70 41Z" fill={INK} stroke="none" />
        <path d="M26 46 74 46 50 66Z" fill="#f5793b" />
        <path d="M39 56 61 56 50 82Z" fill="#fdf6e3" />
        {eyes(40, 60, 50)}
        <path d="M50 72 46 68 54 68Z" fill={INK} stroke="none" />
      </>
    ),
  },
  ours: {
    label: "Ours",
    bg: "#99b7f5",
    draw: () => (
      <>
        <circle cx="31" cy="31" r="11" fill="#a5703f" />
        <circle cx="69" cy="31" r="11" fill="#a5703f" />
        <circle cx="31" cy="31" r="5" fill="#d7a06a" stroke="none" />
        <circle cx="69" cy="31" r="5" fill="#d7a06a" stroke="none" />
        <circle cx="50" cy="54" r="25" fill="#a5703f" />
        <ellipse cx="50" cy="62" rx="13" ry="10" fill="#ecd3ab" />
        {eyes(41, 59, 49)}
        <circle cx="50" cy="58" r="4.2" fill={INK} stroke="none" />
        <path d="M50 62 50 66M50 66 45 69M50 66 55 69" fill="none" />
      </>
    ),
  },
  panda: {
    label: "Panda",
    bg: "#f6b8ce",
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
        <path d="M50 64 50 68M44 69q6 5 12 0" fill="none" />
      </>
    ),
  },
  lapin: {
    label: "Lapin",
    bg: "#a7c4ff",
    draw: () => (
      <>
        <ellipse cx="41" cy="26" rx="7" ry="19" fill="#fdf6e3" />
        <ellipse cx="59" cy="26" rx="7" ry="19" fill="#fdf6e3" />
        <ellipse cx="41" cy="26" rx="3" ry="13" fill="#f3a9c4" stroke="none" />
        <ellipse cx="59" cy="26" rx="3" ry="13" fill="#f3a9c4" stroke="none" />
        <circle cx="50" cy="58" r="23" fill="#fdf6e3" />
        {eyes(41, 59, 55)}
        <circle cx="38" cy="62" r="4" fill="#f7c6d8" stroke="none" />
        <circle cx="62" cy="62" r="4" fill="#f7c6d8" stroke="none" />
        <path d="M50 60 46 63 54 63Z" fill="#e8607f" stroke="none" />
        <path d="M50 63 50 67" fill="none" />
      </>
    ),
  },
  grenouille: {
    label: "Grenouille",
    bg: "#fcca59",
    draw: () => (
      <>
        <ellipse cx="50" cy="60" rx="29" ry="24" fill="#3aa35a" />
        <circle cx="35" cy="36" r="14" fill="#3aa35a" />
        <circle cx="65" cy="36" r="14" fill="#3aa35a" />
        <circle cx="35" cy="35" r="7.5" fill="#fdf6e3" stroke="none" />
        <circle cx="65" cy="35" r="7.5" fill="#fdf6e3" stroke="none" />
        <circle cx="36" cy="36" r="3.4" fill={INK} stroke="none" />
        <circle cx="64" cy="36" r="3.4" fill={INK} stroke="none" />
        <path d="M32 62q18 16 36 0" fill="none" />
        <circle cx="44" cy="58" r="1.8" fill={INK} stroke="none" />
        <circle cx="56" cy="58" r="1.8" fill={INK} stroke="none" />
      </>
    ),
  },
  hibou: {
    label: "Hibou",
    bg: "#f5793b",
    draw: () => (
      <>
        <path d="M30 30 40 46 26 46Z" fill="#8a5a34" />
        <path d="M70 30 60 46 74 46Z" fill="#8a5a34" />
        <ellipse cx="50" cy="56" rx="26" ry="28" fill="#8a5a34" />
        <ellipse cx="50" cy="66" rx="16" ry="18" fill="#c69a63" />
        <circle cx="39" cy="47" r="13" fill="#fdf6e3" />
        <circle cx="61" cy="47" r="13" fill="#fdf6e3" />
        <circle cx="39" cy="47" r="6" fill={INK} stroke="none" />
        <circle cx="61" cy="47" r="6" fill={INK} stroke="none" />
        <path d="M50 54 43 62 57 62Z" fill="#fcca59" />
        <path d="M30 78 34 84M70 78 66 84" fill="none" />
      </>
    ),
  },
  pingouin: {
    label: "Pingouin",
    bg: "#a7c4ff",
    draw: () => (
      <>
        <ellipse cx="50" cy="54" rx="25" ry="30" fill="#2c2b2b" />
        <ellipse cx="50" cy="60" rx="15" ry="22" fill="#fdf6e3" />
        <circle cx="42" cy="42" r="4.6" fill="#fdf6e3" />
        <circle cx="58" cy="42" r="4.6" fill="#fdf6e3" />
        <circle cx="42" cy="42" r="2.2" fill={INK} stroke="none" />
        <circle cx="58" cy="42" r="2.2" fill={INK} stroke="none" />
        <path d="M50 47 44 52 56 52Z" fill="#f5793b" />
        <path d="M40 82 34 88 47 86ZM60 82 66 88 53 86Z" fill="#f5793b" />
      </>
    ),
  },
  lion: {
    label: "Lion",
    bg: "#fcca59",
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
              fill="#e8863a"
            />
          );
        })}
        <circle cx="50" cy="52" r="22" fill="#ffcf8a" />
        {eyes(42, 58, 49)}
        <path d="M50 55 45 59 55 59Z" fill={INK} stroke="none" />
        <path d="M50 59 50 63M42 64q8 6 16 0" fill="none" />
      </>
    ),
  },
  tigre: {
    label: "Tigre",
    bg: "#fcca59",
    draw: () => (
      <>
        <circle cx="31" cy="32" r="10" fill="#f5793b" />
        <circle cx="69" cy="32" r="10" fill="#f5793b" />
        <circle cx="31" cy="32" r="4" fill="#f7c6d8" stroke="none" />
        <circle cx="69" cy="32" r="4" fill="#f7c6d8" stroke="none" />
        <circle cx="50" cy="54" r="25" fill="#f5793b" />
        <ellipse cx="50" cy="63" rx="14" ry="11" fill="#fdf6e3" />
        <path d="M50 40 50 30M40 42 36 33M60 42 64 33M31 52 22 50M69 52 78 50M32 60 24 61M68 60 76 61" fill="none" strokeWidth="2.6" />
        {eyes(42, 58, 50)}
        <path d="M50 59 46 63 54 63Z" fill="#e8607f" stroke="none" />
        <path d="M50 63 50 67" fill="none" />
      </>
    ),
  },
  koala: {
    label: "Koala",
    bg: "#a7c4ff",
    draw: () => (
      <>
        <circle cx="27" cy="40" r="15" fill="#aab4ba" />
        <circle cx="73" cy="40" r="15" fill="#aab4ba" />
        <circle cx="27" cy="40" r="8" fill="#f3a9c4" stroke="none" />
        <circle cx="73" cy="40" r="8" fill="#f3a9c4" stroke="none" />
        <circle cx="50" cy="55" r="24" fill="#aab4ba" />
        {eyes(41, 59, 52)}
        <path d="M43 60q7 12 14 0Z" fill={INK} stroke="none" />
        <ellipse cx="50" cy="59" rx="8" ry="9" fill={INK} stroke="none" />
      </>
    ),
  },
  singe: {
    label: "Singe",
    bg: "#4db07a",
    draw: () => (
      <>
        <circle cx="27" cy="46" r="11" fill="#8a5a34" />
        <circle cx="73" cy="46" r="11" fill="#8a5a34" />
        <circle cx="27" cy="46" r="5.5" fill="#d7a06a" stroke="none" />
        <circle cx="73" cy="46" r="5.5" fill="#d7a06a" stroke="none" />
        <circle cx="50" cy="50" r="24" fill="#8a5a34" />
        <path d="M50 34q20 2 18 24q-2 18-18 18q-16 0-18-18q-2-22 18-24Z" fill="#e3bd8a" />
        {eyes(42, 58, 50, 3)}
        <path d="M50 58 50 62" fill="none" />
        <circle cx="46" cy="64" r="1.7" fill={INK} stroke="none" />
        <circle cx="54" cy="64" r="1.7" fill={INK} stroke="none" />
        <path d="M44 68q6 5 12 0" fill="none" />
      </>
    ),
  },
};

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
