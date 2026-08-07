import type { ReactElement } from "react";

/**
 * DÉCOR DE GOUTTIÈRE — les dessins cartoon qui habillent le fond des pages
 * joueur selon le thème choisi par le commerçant.
 *
 * ── Pourquoi ce fichier existe ──
 *
 * Les thèmes ne faisaient varier qu'un `repeating-linear-gradient` : des
 * rayures. « C'est fade », et c'est vrai — on est dans un univers de jeu. Un
 * thème « Noël » doit poser des rennes, des têtes de Père Noël et des sucres
 * d'orge, pas trois lignes obliques vertes.
 *
 * ── Ce que ce composant n'est PAS ──
 *
 * Ce n'est pas une illustration de contenu : c'est du PAPIER PEINT. D'où trois
 * contraintes qui ne se négocient pas, chacune payée au moins une fois par ce
 * dépôt :
 *
 * 1. `aria-hidden` + `pointer-events-none`. Le second n'est pas qu'un confort
 *    de clic : `document.elementsFromPoint` — donc axe-core, qui s'en sert pour
 *    résoudre le fond d'un texte — IGNORE les éléments `pointer-events: none`.
 *    Le décor est ainsi invisible au calcul de contraste, qui continue de
 *    porter sur la couleur réellement peinte par le shell.
 * 2. L'opacité passe par les attributs SVG `fill-opacity` / `stroke-opacity`,
 *    JAMAIS par une `opacity` ou un `transform` sur un conteneur du shell :
 *    voir `play-backdrop.tsx`, où un simple contexte d'empilement faisait
 *    retomber la mesure axe-core sur le crème du body (1,07:1 mesuré).
 * 3. Positions FIXES, jamais `Math.random()` : le rendu serveur et
 *    l'hydratation client doivent tomber sur le même dessin.
 *
 * ── « Gouttière », littéralement ──
 *
 * Les emplacements ci-dessous longent les bords et les coins. Le centre reste
 * vide (un seul motif, petit, en bas), parce que c'est là que vit le contenu
 * du joueur — sur des cartes opaques, mais un pied de page ou une mention
 * repose parfois directement sur le fond.
 */

/**
 * Clés de décor — DÉCOUPLÉES des clés de thème, volontairement : le même
 * décor sert plusieurs thèmes (le « neutre » du calendrier, l'« entreprise »
 * du quiz et le preset « Kermesse » de la roue partagent les confettis), et
 * un thème peut changer de décor sans toucher au domaine SQL.
 */
export type DecorKey =
  | "aucun"
  | "noel"
  | "coeurs"
  | "ballons"
  | "etiquettes"
  | "fanions"
  | "gourmand"
  | "verres"
  | "livres"
  | "cadeaux"
  | "sport"
  | "confetti"
  | "sucreries"
  | "etoiles"
  | "eclairs"
  | "diamants";

export const DECOR_KEYS: readonly DecorKey[] = [
  "aucun",
  "noel",
  "coeurs",
  "ballons",
  "etiquettes",
  "fanions",
  "gourmand",
  "verres",
  "livres",
  "cadeaux",
  "sport",
  "confetti",
  "sucreries",
  "etoiles",
  "eclairs",
  "diamants",
];

/* ────────────────────────────────────────────────────────────
 * Palette — les jetons « kermesse » du site, en dur : un SVG ne
 * lit pas les variables CSS de Tailwind depuis un attribut `fill`
 * sans surcoût, et ces couleurs sont déjà figées côté design.
 * ──────────────────────────────────────────────────────────── */

const INK = "#211d16";
const CREAM = "#fdf6e3";
const YELLOW = "#fcca59";
const PINK = "#f296bd";
const BLUE = "#99b7f5";
const GREEN = "#267f53";
const ORANGE = "#f5793b";
const RED = "#e5484d";
const BROWN = "#b07a4a";

/** Contour cartoon commun — même facture que `cartoon-burst.tsx`. */
const trait = { stroke: INK, strokeWidth: 2 } as const;

/* ────────────────────────────────────────────────────────────
 * Motifs — chacun dessiné dans une boîte 24×24, sans `fill-opacity`
 * propre : l'atténuation est posée UNE fois sur le `<svg>` racine et
 * héritée (voir `ThemeDecor`).
 * ──────────────────────────────────────────────────────────── */

type MotifKey =
  | "renne"
  | "pereNoel"
  | "sucreOrge"
  | "flocon"
  | "coeur"
  | "enveloppe"
  | "ballon"
  | "confetti"
  | "partGateau"
  | "etiquette"
  | "eclat"
  | "fanion"
  | "feuArtifice"
  | "croissant"
  | "cupcake"
  | "verre"
  | "grappe"
  | "livre"
  | "interrogation"
  | "cadeau"
  | "etoile"
  | "ballonFoot"
  | "ballonBasket"
  | "trophee"
  | "bonbon"
  | "sucette"
  | "eclair"
  | "diamant";

const MOTIFS: Record<MotifKey, () => ReactElement> = {
  renne: () => (
    <>
      <path
        d="M7 8C6 5.6 5 4.2 2.6 3.6M7 8C6.4 5.8 4.4 5 2.4 5.8M17 8c1-2.4 2-3.8 4.4-4.4M17 8c.6-2.2 2.6-3 4.6-2.2"
        fill="none"
        {...trait}
      />
      <path d="M7 8.6h10V14a5 5 0 0 1-10 0z" fill={BROWN} {...trait} />
      <circle cx="12" cy="18" r="3.2" fill={RED} {...trait} />
      <circle cx="9.6" cy="11.4" r="1.1" fill={INK} stroke="none" />
      <circle cx="14.4" cy="11.4" r="1.1" fill={INK} stroke="none" />
    </>
  ),
  pereNoel: () => (
    <>
      <path d="M4 9.4C4 5.3 7.6 2 12 2s8 3.3 8 7.4z" fill={RED} {...trait} />
      <path d="M6.5 11.2h11V14a5.5 5.5 0 0 1-11 0z" fill="#f6d5b8" {...trait} />
      <path d="M6 14c0 5.2 2.7 8 6 8s6-2.8 6-8z" fill={CREAM} {...trait} />
      <path d="M3.4 9.4h17.2v2.2H3.4z" fill={CREAM} {...trait} />
      <circle cx="20.6" cy="7.4" r="2.4" fill={CREAM} {...trait} />
      <circle cx="9.6" cy="12.8" r="1" fill={INK} stroke="none" />
      <circle cx="14.4" cy="12.8" r="1" fill={INK} stroke="none" />
    </>
  ),
  sucreOrge: () => (
    <>
      <path
        d="M8.5 22V9.5a4.8 4.8 0 0 1 9.6 0"
        fill="none"
        stroke={INK}
        strokeWidth={7}
        strokeLinecap="round"
      />
      <path
        d="M8.5 22V9.5a4.8 4.8 0 0 1 9.6 0"
        fill="none"
        stroke={RED}
        strokeWidth={4.6}
        strokeLinecap="round"
      />
    </>
  ),
  flocon: () => (
    <>
      <path
        d="M12 1.5v21M2.4 7l19.2 11M21.6 7L2.4 18"
        fill="none"
        stroke={BLUE}
        strokeWidth={2.4}
      />
      <path
        d="M8.6 4.4L12 7l3.4-2.6M8.6 19.6L12 17l3.4 2.6"
        fill="none"
        stroke={BLUE}
        strokeWidth={2.2}
      />
    </>
  ),
  coeur: () => (
    <path
      d="M12 21.4C12 21.4 2.6 15 2.6 8.9A4.9 4.9 0 0 1 12 6.4a4.9 4.9 0 0 1 9.4 2.5c0 6.1-9.4 12.5-9.4 12.5z"
      fill={PINK}
      {...trait}
    />
  ),
  enveloppe: () => (
    <>
      <rect x="2.2" y="5.4" width="19.6" height="13.4" rx="2" fill={CREAM} {...trait} />
      <path d="M2.2 7L12 13.6 21.8 7" fill="none" {...trait} />
      <path
        d="M15.6 15.4a2.6 2.6 0 1 1 5.2 0c0 1.9-2.6 3.6-2.6 3.6s-2.6-1.7-2.6-3.6z"
        fill={PINK}
        {...trait}
      />
    </>
  ),
  ballon: () => (
    <>
      <path d="M12 1.8c3.6 0 6.4 3 6.4 6.8S15.6 16 12 16 5.6 12.4 5.6 8.6 8.4 1.8 12 1.8z" fill={PINK} {...trait} />
      <path d="M10.6 16h2.8l-1.4 2z" fill={PINK} {...trait} />
      <path d="M12 18c1.6 1.4-1.6 2.6 0 4" fill="none" {...trait} />
    </>
  ),
  confetti: () => (
    <>
      <rect x="2" y="3" width="5.4" height="3.2" rx="1" fill={YELLOW} {...trait} />
      <rect x="15" y="6" width="4.6" height="3.4" rx="1" fill={BLUE} {...trait} />
      <rect x="8" y="13" width="5" height="3" rx="1" fill={PINK} {...trait} />
      <rect x="16.4" y="16.4" width="4.6" height="3.2" rx="1" fill={ORANGE} {...trait} />
      <path d="M3 14.6c1.6-1.6 3.2 1.6 4.8 0" fill="none" {...trait} />
      <path d="M4 20.4c1.6-1.6 3.2 1.6 4.8 0" fill="none" {...trait} />
    </>
  ),
  partGateau: () => (
    <>
      <path d="M3 19.6L12 4l9 15.6z" fill={CREAM} {...trait} />
      <path d="M6.4 13.6h11.2" fill="none" {...trait} />
      <path d="M8.6 9.2h6.8" fill="none" {...trait} />
      <circle cx="12" cy="5" r="2" fill={RED} {...trait} />
    </>
  ),
  etiquette: () => (
    <>
      <path d="M12.4 1.6L22.4 11.6 12 22 2 12V1.6z" fill={ORANGE} {...trait} />
      <circle cx="6.4" cy="6" r="1.8" fill={CREAM} {...trait} />
      <circle cx="11.4" cy="12" r="1.8" fill={CREAM} {...trait} />
      <circle cx="16.4" cy="17" r="1.8" fill={CREAM} {...trait} />
      <path d="M17.6 11.2L10.2 18.6" fill="none" {...trait} />
    </>
  ),
  eclat: () => (
    <path
      d="M12 1l2.4 5.6L20 4.4l-2.2 5.6 5.6 2.4-5.6 2.2 2.2 5.6-5.6-2.2L12 23.4 9.6 17.8 4 20l2.2-5.6L.6 12.4l5.6-2.4L4 4.4l5.6 2.2z"
      fill={YELLOW}
      {...trait}
    />
  ),
  fanion: () => (
    <>
      <path d="M1 4c7 4 15 4 22 0" fill="none" {...trait} />
      <path d="M3.6 5.2L8 4.6 5.8 10.6z" fill={RED} {...trait} />
      <path d="M9.8 6.2h4.6L12 12.4z" fill={YELLOW} {...trait} />
      <path d="M16.2 5.2l4.4-1.2-2 6z" fill={BLUE} {...trait} />
      <path d="M6 16.4h12" fill="none" {...trait} />
      <path d="M8.2 17.4L11 17l-1.4 4z" fill={GREEN} {...trait} />
      <path d="M13.4 17h3l-1.2 4.2z" fill={ORANGE} {...trait} />
    </>
  ),
  feuArtifice: () => (
    <>
      <path
        d="M12 12V2M12 12l7.1-7.1M12 12h10M12 12l7.1 7.1M12 12v10M12 12l-7.1 7.1M12 12H2M12 12L4.9 4.9"
        fill="none"
        stroke={ORANGE}
        strokeWidth={2.2}
      />
      <circle cx="12" cy="12" r="2.6" fill={YELLOW} {...trait} />
      <circle cx="12" cy="2.4" r="1.4" fill={PINK} stroke="none" />
      <circle cx="21.6" cy="12" r="1.4" fill={BLUE} stroke="none" />
      <circle cx="12" cy="21.6" r="1.4" fill={PINK} stroke="none" />
      <circle cx="2.4" cy="12" r="1.4" fill={BLUE} stroke="none" />
    </>
  ),
  croissant: () => (
    <>
      <path
        d="M2.4 17.6C3.6 8.8 20.4 8.8 21.6 17.6c-3-3.4-6.2-5-9.6-5s-6.6 1.6-9.6 5z"
        fill={YELLOW}
        {...trait}
      />
      <path d="M7.4 13.6l-1.6 3M12 12.4v3.4M16.6 13.6l1.6 3" fill="none" {...trait} />
    </>
  ),
  cupcake: () => (
    <>
      <path d="M5.6 12h12.8l-1.8 9.4H7.4z" fill={CREAM} {...trait} />
      <path
        d="M5 12c0-2.4 2-3.4 2.6-4.4C8 5.6 9.8 4.4 12 4.4s4 1.2 4.4 3.2c.6 1 2.6 2 2.6 4.4z"
        fill={PINK}
        {...trait}
      />
      <circle cx="12" cy="2.8" r="1.8" fill={RED} {...trait} />
      <path d="M8.6 15.4v3.4M12 15.4v3.4M15.4 15.4v3.4" fill="none" {...trait} />
    </>
  ),
  verre: () => (
    <>
      <path d="M6.4 2.4h11.2l-1.4 6.8a4.2 4.2 0 0 1-8.4 0z" fill={PINK} {...trait} />
      <path d="M12 13.6V20" fill="none" {...trait} />
      <path d="M7.4 21.4h9.2" fill="none" {...trait} />
    </>
  ),
  grappe: () => (
    <>
      <path d="M12 5.6c0-2 1.6-3.6 4-4" fill="none" {...trait} />
      <path d="M15.6 2.6c2 .6 3 1.8 3.2 3.4-1.8.2-3-.8-3.2-3.4z" fill={GREEN} {...trait} />
      <circle cx="8.6" cy="9.4" r="2.6" fill={PINK} {...trait} />
      <circle cx="15.4" cy="9.4" r="2.6" fill={PINK} {...trait} />
      <circle cx="12" cy="13.6" r="2.6" fill={PINK} {...trait} />
      <circle cx="6.6" cy="15" r="2.4" fill={PINK} {...trait} />
      <circle cx="17.4" cy="15" r="2.4" fill={PINK} {...trait} />
      <circle cx="12" cy="19.4" r="2.4" fill={PINK} {...trait} />
    </>
  ),
  livre: () => (
    <>
      <path d="M2.4 4.4h8.4V20H2.4z" fill={BLUE} {...trait} />
      <path d="M13.2 4.4h8.4V20h-8.4z" fill={ORANGE} {...trait} />
      <path d="M10.8 4.4h2.4V20h-2.4z" fill={CREAM} {...trait} />
      <path d="M4.6 8.4h4M4.6 11.6h4M15.4 8.4h4M15.4 11.6h4" fill="none" {...trait} />
    </>
  ),
  interrogation: () => (
    <>
      <path
        d="M7.6 8.2a4.6 4.6 0 0 1 9 1.4c0 3-3.6 3.4-3.6 6.2"
        fill="none"
        stroke={INK}
        strokeWidth={3}
      />
      <circle cx="13" cy="20.4" r="1.9" fill={YELLOW} {...trait} />
    </>
  ),
  cadeau: () => (
    <>
      <path d="M3 9.6h18V21H3z" fill={BLUE} {...trait} />
      <path d="M2 6h20v3.6H2z" fill={CREAM} {...trait} />
      <path d="M10.4 6h3.2v15h-3.2z" fill={RED} {...trait} />
      <path d="M12 6c-1.4-3.6-6-3.4-5.4-.4M12 6c1.4-3.6 6-3.4 5.4-.4" fill="none" {...trait} />
    </>
  ),
  etoile: () => (
    <path
      d="M12 1.6l3.1 6.9 7.5.8-5.6 5 1.6 7.3L12 17.9l-6.6 3.7L7 14.3l-5.6-5 7.5-.8z"
      fill={YELLOW}
      {...trait}
    />
  ),
  ballonFoot: () => (
    <>
      <circle cx="12" cy="12" r="10" fill={CREAM} {...trait} />
      <path d="M12 6.6l4.2 3-1.6 5h-5.2l-1.6-5z" fill={INK} stroke="none" />
      <path d="M12 2v4.6M3.4 8.8l4.4 2.8M20.6 8.8l-4.4 2.8M7 21l2.4-6.4M17 21l-2.4-6.4" fill="none" {...trait} />
    </>
  ),
  ballonBasket: () => (
    <>
      <circle cx="12" cy="12" r="10" fill={ORANGE} {...trait} />
      <path d="M2 12h20M12 2v20M4.4 5.2C8.6 8 8.6 16 4.4 18.8M19.6 5.2C15.4 8 15.4 16 19.6 18.8" fill="none" {...trait} />
    </>
  ),
  trophee: () => (
    <>
      <path d="M6.6 2.6h10.8v6.2a5.4 5.4 0 0 1-10.8 0z" fill={YELLOW} {...trait} />
      <path d="M6.6 4.2H3.4v2a3.6 3.6 0 0 0 3.2 3.4M17.4 4.2h3.2v2a3.6 3.6 0 0 1-3.2 3.4" fill="none" {...trait} />
      <path d="M12 14.2v3.4" fill="none" {...trait} />
      <path d="M7.4 17.6h9.2v3.8H7.4z" fill={YELLOW} {...trait} />
    </>
  ),
  bonbon: () => (
    <>
      <circle cx="12" cy="12" r="5.4" fill={PINK} {...trait} />
      <path d="M6.6 12L1.6 8v8z" fill={YELLOW} {...trait} />
      <path d="M17.4 12l5 -4v8z" fill={YELLOW} {...trait} />
    </>
  ),
  sucette: () => (
    <>
      <circle cx="11.4" cy="8.6" r="6.6" fill={PINK} {...trait} />
      <path
        d="M11.4 8.6a2.4 2.4 0 1 1-2.2-2.4c2 0 3.4 1.6 3.4 3.6s-1.8 3.6-4 3.6"
        fill="none"
        stroke={CREAM}
        strokeWidth={1.8}
      />
      <path d="M11.4 15.2V22" fill="none" {...trait} />
    </>
  ),
  eclair: () => (
    <path d="M13.6 1.4L4 13.4h6L9.4 22.6 20 10.2h-6.4z" fill={YELLOW} {...trait} />
  ),
  diamant: () => (
    <>
      <path d="M6 2.6h12l5 6.4-11 12.4L1 9z" fill={BLUE} {...trait} />
      <path d="M1 9h22M6 2.6L9 9l3 12.4M18 2.6L15 9l-3 12.4" fill="none" {...trait} />
    </>
  ),
};

/* ────────────────────────────────────────────────────────────
 * Emplacements — bords et coins, un seul motif vers le centre-bas.
 * Coordonnées en POURCENTAGE de la surface, tailles en pixels :
 * un `<svg>` imbriqué accepte `x`/`y` en pourcentage tout en gardant
 * son propre `viewBox`, donc les motifs ne se déforment jamais.
 * ──────────────────────────────────────────────────────────── */

interface Slot {
  x: string;
  y: string;
  size: number;
  rot: number;
}

const SLOTS_PAGE: readonly Slot[] = [
  { x: "2%", y: "5%", size: 54, rot: -12 },
  { x: "24%", y: "1.5%", size: 34, rot: 17 },
  { x: "62%", y: "2.5%", size: 40, rot: -16 },
  { x: "87%", y: "9%", size: 46, rot: 13 },
  { x: "5%", y: "26%", size: 38, rot: 8 },
  { x: "90%", y: "31%", size: 50, rot: -9 },
  { x: "1.5%", y: "47%", size: 46, rot: 15 },
  { x: "88%", y: "54%", size: 36, rot: -14 },
  { x: "6%", y: "69%", size: 40, rot: -6 },
  { x: "89%", y: "75%", size: 48, rot: 11 },
  { x: "14%", y: "89%", size: 42, rot: 7 },
  { x: "45%", y: "84%", size: 30, rot: 13 },
  { x: "70%", y: "92%", size: 36, rot: -11 },
];

/** Vignette d'éditeur : quatre motifs, aux quatre coins d'une boîte plate. */
const SLOTS_VIGNETTE: readonly Slot[] = [
  { x: "2%", y: "6%", size: 20, rot: -12 },
  { x: "32%", y: "42%", size: 16, rot: 14 },
  { x: "62%", y: "4%", size: 18, rot: -8 },
  { x: "86%", y: "40%", size: 20, rot: 10 },
];

/* ────────────────────────────────────────────────────────────
 * Scènes — la liste de motifs d'un décor, distribuée sur les
 * emplacements par simple modulo : déterministe, et un décor se
 * décrit en une ligne.
 * ──────────────────────────────────────────────────────────── */

const SCENES: Record<DecorKey, readonly MotifKey[]> = {
  aucun: [],
  noel: ["renne", "sucreOrge", "pereNoel", "flocon"],
  coeurs: ["coeur", "enveloppe", "coeur", "eclat"],
  ballons: ["ballon", "confetti", "partGateau", "ballon"],
  etiquettes: ["etiquette", "eclat", "etiquette", "confetti"],
  fanions: ["fanion", "feuArtifice", "fanion", "eclat"],
  gourmand: ["croissant", "cupcake", "croissant", "partGateau"],
  verres: ["verre", "grappe", "verre", "eclat"],
  livres: ["livre", "interrogation", "livre", "etoile"],
  cadeaux: ["cadeau", "etoile", "cadeau", "eclat"],
  sport: ["ballonFoot", "trophee", "ballonBasket", "eclat"],
  confetti: ["confetti", "eclat", "confetti", "etoile"],
  sucreries: ["bonbon", "sucette", "bonbon", "coeur"],
  etoiles: ["etoile", "eclat", "etoile", "confetti"],
  eclairs: ["eclair", "etoile", "eclair", "eclat"],
  diamants: ["diamant", "eclat", "diamant", "etoile"],
};

/** Le décor d'une clé est-il dessiné ? (`aucun` ne rend rien du tout.) */
export function decorEstVide(decor: DecorKey): boolean {
  return (SCENES[decor] ?? SCENES.aucun).length === 0;
}

/**
 * ALPHA — mesuré contre le pire cas, pas choisi à l'œil.
 *
 * Sur la page, les motifs vivent en gouttière et le contenu joueur est posé
 * sur des cartes opaques ; restent les pieds de page et les mentions, qui
 * reposent directement sur le crème. À 12 % de remplissage et 14 % de contour,
 * l'écart de luminance introduit sous un texte est inférieur à celui des
 * rayures `repeating-linear-gradient` déjà livrées (16 % chez `noel`), donc
 * strictement plus sûr que l'existant.
 *
 * La VIGNETTE d'éditeur monte à 24 / 30 % : haute de 40 px, elle réduit une
 * page entière à une pastille, et à 12 % le décor y serait invisible — la
 * vignette promettrait alors « pas de décor » là où la page en porte. Aucun
 * texte ne repose dessus (le libellé du thème est SOUS la vignette).
 */
const ALPHA_PAGE = { fill: 0.12, stroke: 0.14 } as const;
const ALPHA_VIGNETTE = { fill: 0.24, stroke: 0.3 } as const;

export function ThemeDecor({
  decor,
  variant = "page",
  className = "",
}: {
  decor: DecorKey;
  /** `vignette` : version miniature pour les aperçus d'éditeur. */
  variant?: "page" | "vignette";
  className?: string;
}): ReactElement | null {
  const scene = SCENES[decor] ?? SCENES.aucun;
  if (scene.length === 0) return null;

  const slots = variant === "vignette" ? SLOTS_VIGNETTE : SLOTS_PAGE;
  const alpha = variant === "vignette" ? ALPHA_VIGNETTE : ALPHA_PAGE;

  return (
    <svg
      aria-hidden
      focusable="false"
      data-decor={decor}
      className={`pointer-events-none absolute inset-0 h-full w-full select-none ${className}`}
      fillOpacity={alpha.fill}
      strokeOpacity={alpha.stroke}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {slots.map((slot, i) => {
        const Motif = MOTIFS[scene[i % scene.length]];
        return (
          <svg
            key={i}
            x={slot.x}
            y={slot.y}
            width={slot.size}
            height={slot.size}
            viewBox="0 0 24 24"
            overflow="visible"
          >
            {/* Deux `<g>` imbriqués, et c'est nécessaire : la classe CSS
                animée pose un `transform`, qui l'emporte sur l'attribut
                `transform` du même élément — la rotation serait effacée. */}
            <g className={i % 2 === 0 ? "decor-float" : "decor-float-b"}>
              <g transform={`rotate(${slot.rot} 12 12)`}>
                <Motif />
              </g>
            </g>
          </svg>
        );
      })}
    </svg>
  );
}
