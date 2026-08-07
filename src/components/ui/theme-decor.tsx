import type { ReactElement } from "react";

/**
 * DÉCOR DE PAGE — les dessins cartoon qui habillent le fond des pages joueur
 * selon le thème choisi par le commerçant.
 *
 * ── Pourquoi ce fichier existe ──
 *
 * Les thèmes ne faisaient varier qu'un `repeating-linear-gradient` : des
 * rayures. « C'est fade », et c'est vrai — on est dans un univers de jeu. Un
 * thème « Noël » doit poser des rennes, des têtes de Père Noël et des sucres
 * d'orge, pas trois lignes obliques vertes.
 *
 * ── Ce que la première version a raté, et ce qui a changé ──
 *
 * La V1 posait bien des dessins, mais à 12 % d'opacité, en petit, sur un fond
 * crème identique pour tous les thèmes : à l'écran, des TACHES BEIGES. On ne
 * distinguait ni personnage ni thème. Trois corrections, ensemble :
 *
 * 1. Les motifs sont PEINTS (aplats à 80 %, contour encre à 92 %), pas
 *    suggérés. Un Père Noël doit se lire comme un Père Noël.
 * 2. Ils portent des VISAGES (yeux, sourire, joues) — c'est ce qui sépare une
 *    forme géométrique d'un personnage.
 * 3. Le fond lui-même change de couleur par thème (voir les tables
 *    `*-theme.ts`) : le décor s'accorde à un lavis, pas au même crème partout.
 *
 * ── Ce que ce composant n'est toujours PAS ──
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
 * ── LA LISIBILITÉ TIENT PAR LA COMPOSITION, PLUS PAR L'EFFACEMENT ──
 *
 * Puisque les motifs sont désormais peints, on ne peut plus compter sur leur
 * transparence pour sauver un texte. C'est la CARTE DES EMPLACEMENTS qui s'en
 * charge, et elle obéit à deux relevés faits sur les pages réelles :
 *
 *   · le contenu joueur vit dans une colonne `mx-auto max-w-md` (448 px) —
 *     tout ce qui est hors de cette colonne est libre sur grand écran ;
 *   · deux textes NE SONT PAS ENCARTÉS : l'en-tête (nom du commerce + titre,
 *     en haut, centré) et le pied de page (mention « propulsé par », en bas,
 *     centré). Ces deux couloirs restent vides.
 *
 * D'où la règle des `desktop: true` : les GRANDES vignettes du haut n'existent
 * qu'à partir de `md` (768 px), largeur à laquelle la colonne de contenu laisse
 * de vraies marges. En dessous — le parcours QR en boutique, donc le cas
 * courant — le haut ne reçoit que des motifs de bord.
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
const WHITE = "#ffffff";
const YELLOW = "#fcca59";
const PINK = "#f296bd";
const BLUE = "#99b7f5";
const GREEN = "#267f53";
const GREEN_CLAIR = "#5cb98a";
const ORANGE = "#f5793b";
const RED = "#e5484d";
const BROWN = "#b07a4a";
const PEAU = "#f6d5b8";
const VIOLET = "#b79bf0";

/**
 * Contour cartoon commun.
 *
 * `vector-effect: non-scaling-stroke` est le détail qui fait tenir toute
 * l'échelle : les motifs sont dessinés dans une boîte 24×24 puis rendus entre
 * 20 px (semis) et 168 px (grande vignette). Sans lui, le même trait passerait
 * de 1,7 px à 14 px — le petit motif serait un pâté, le grand un dessin au
 * feutre géant. Avec, le contour vaut 2 px À L'ÉCRAN partout, et la famille
 * visuelle tient d'un bout à l'autre.
 */
const trait = {
  stroke: INK,
  strokeWidth: 2,
  vectorEffect: "non-scaling-stroke",
} as const;

/** Trait fin — traits de visage, détails internes. */
const traitFin = {
  stroke: INK,
  strokeWidth: 1.3,
  vectorEffect: "non-scaling-stroke",
} as const;

/**
 * VISAGE — la brique qui transforme une forme en personnage.
 *
 * Deux yeux pleins, un sourire, deux joues rondes. Rien de plus : à 24 px de
 * boîte, une bouche ouverte ou un nez deviennent du bruit.
 */
function Visage({
  cx,
  cy,
  ecart = 3,
  joues = PINK,
  sourire = 2.2,
}: {
  cx: number;
  cy: number;
  /** Demi-écart entre les yeux. */
  ecart?: number;
  /** Couleur des joues, ou `null` pour un visage sans joues. */
  joues?: string | null;
  /** Demi-largeur du sourire. */
  sourire?: number;
}): ReactElement {
  return (
    <>
      {joues ? (
        <>
          <circle
            cx={cx - ecart - 1.5}
            cy={cy + 1.7}
            r={1.15}
            fill={joues}
            stroke="none"
          />
          <circle
            cx={cx + ecart + 1.5}
            cy={cy + 1.7}
            r={1.15}
            fill={joues}
            stroke="none"
          />
        </>
      ) : null}
      <circle cx={cx - ecart} cy={cy} r={0.95} fill={INK} stroke="none" />
      <circle cx={cx + ecart} cy={cy} r={0.95} fill={INK} stroke="none" />
      {sourire > 0 ? (
        <path
          d={`M${cx - sourire} ${cy + 2.3}q${sourire} ${sourire * 0.95} ${sourire * 2} 0`}
          fill="none"
          {...traitFin}
        />
      ) : null}
    </>
  );
}

/* ────────────────────────────────────────────────────────────
 * Motifs — chacun dessiné dans une boîte 24×24, sans `fill-opacity`
 * propre : l'atténuation est posée UNE fois sur le `<svg>` racine et
 * héritée (voir `ThemeDecor`).
 * ──────────────────────────────────────────────────────────── */

type MotifKey =
  | "renne"
  | "pereNoel"
  | "bonhommeNeige"
  | "sapin"
  | "sucreOrge"
  | "flocon"
  | "coeur"
  | "enveloppe"
  | "flecheCupidon"
  | "ballon"
  | "confetti"
  | "partGateau"
  | "etiquette"
  | "sacShopping"
  | "eclat"
  | "fanion"
  | "grandeRoue"
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
        d="M6.4 8.4C5.4 5.6 4.2 4 1.6 3.2M6.4 8.4C5.8 6 3.6 5 1.4 5.8M17.6 8.4c1-2.8 2.2-4.4 4.8-5.2M17.6 8.4c.6-2.4 2.8-3.4 5-2.6"
        fill="none"
        {...trait}
      />
      <path d="M6.2 9h11.6v5.2a5.8 5.8 0 0 1-11.6 0z" fill={BROWN} {...trait} />
      <path d="M6.2 9h11.6v2.6H6.2z" fill="#c99263" {...trait} />
      <circle cx="12" cy="17.8" r="3.1" fill={RED} {...trait} />
      <circle cx="11" cy="16.9" r="0.9" fill={WHITE} stroke="none" />
      <Visage cx={12} cy={11.8} ecart={3.1} joues={null} sourire={0} />
    </>
  ),
  pereNoel: () => (
    <>
      {/* Bonnet */}
      <path d="M4 9.6C4 5.4 7.6 2 12 2s8 3.4 8 7.6z" fill={RED} {...trait} />
      <circle cx="20.4" cy="6.8" r="2.5" fill={CREAM} {...trait} />
      <path d="M3.2 9.2h17.6v2.4H3.2z" fill={CREAM} {...trait} />
      {/* Visage */}
      <path d="M6.4 11.4h11.2V14a5.6 5.6 0 0 1-11.2 0z" fill={PEAU} {...trait} />
      {/* Barbe */}
      <path
        d="M5.8 13.8c0 5.6 2.8 8.4 6.2 8.4s6.2-2.8 6.2-8.4c-1.4 1.6-2.6 2.2-3.4 2.2-1 0-1.6.8-2.8.8s-1.8-.8-2.8-.8c-.8 0-2-.6-3.4-2.2z"
        fill={CREAM}
        {...trait}
      />
      <circle cx="12" cy="16.4" r="1.5" fill={PEAU} {...trait} />
      <circle cx="9.4" cy="12.9" r="0.95" fill={INK} stroke="none" />
      <circle cx="14.6" cy="12.9" r="0.95" fill={INK} stroke="none" />
      <circle cx="7.5" cy="14.2" r="1.1" fill={PINK} stroke="none" />
      <circle cx="16.5" cy="14.2" r="1.1" fill={PINK} stroke="none" />
    </>
  ),
  bonhommeNeige: () => (
    <>
      <circle cx="12" cy="16.8" r="5.4" fill={WHITE} {...trait} />
      <circle cx="12" cy="8.2" r="4.2" fill={WHITE} {...trait} />
      {/* Chapeau */}
      <path d="M8.2 5h7.6v.9H8.2z" fill={INK} {...trait} />
      <path d="M9.6 1.4h4.8V5H9.6z" fill={INK} {...trait} />
      {/* Bras */}
      <path d="M6.8 14.4L2.6 11.6M4.6 12.9l-.6-2M17.2 14.4l4.2-2.8M19.4 12.9l.6-2" fill="none" {...trait} />
      {/* Nez carotte */}
      <path d="M12 8.6l3.4 1-3.4 1z" fill={ORANGE} {...trait} />
      <circle cx="10.2" cy="7.4" r="0.9" fill={INK} stroke="none" />
      <circle cx="13.8" cy="7.4" r="0.9" fill={INK} stroke="none" />
      <path d="M10.2 10.4q1.8 1.5 3.6 0" fill="none" {...traitFin} />
      <circle cx="12" cy="14.6" r="0.95" fill={INK} stroke="none" />
      <circle cx="12" cy="17.6" r="0.95" fill={INK} stroke="none" />
    </>
  ),
  sapin: () => (
    <>
      <path d="M10.4 19.4h3.2v3.6h-3.2z" fill={BROWN} {...trait} />
      <path d="M12 3.2l4.6 6.2H7.4z" fill={GREEN} {...trait} />
      <path d="M12 7.6l5.8 7H6.2z" fill={GREEN} {...trait} />
      <path d="M12 12l7 7.6H5z" fill={GREEN_CLAIR} {...trait} />
      <path
        d="M12 .6l.9 1.9 2.1.3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L9 2.8l2.1-.3z"
        fill={YELLOW}
        {...trait}
      />
      <circle cx="9.4" cy="16.4" r="1" fill={RED} stroke="none" />
      <circle cx="14.6" cy="17.4" r="1" fill={BLUE} stroke="none" />
      <circle cx="12.2" cy="10.2" r="1" fill={PINK} stroke="none" />
    </>
  ),
  sucreOrge: () => (
    <>
      <path
        d="M8.2 22.4V9.6a4.9 4.9 0 0 1 9.8 0"
        fill="none"
        stroke={INK}
        strokeWidth={7.4}
        strokeLinecap="round"
      />
      <path
        d="M8.2 22.4V9.6a4.9 4.9 0 0 1 9.8 0"
        fill="none"
        stroke={CREAM}
        strokeWidth={5.4}
        strokeLinecap="round"
      />
      <path
        d="M8.2 22.4V9.6a4.9 4.9 0 0 1 9.8 0"
        fill="none"
        stroke={RED}
        strokeWidth={5.4}
        strokeLinecap="butt"
        strokeDasharray="2.6 3.4"
      />
    </>
  ),
  flocon: () => (
    <>
      <path
        d="M12 1.5v21M2.4 7l19.2 11M21.6 7L2.4 18"
        fill="none"
        stroke={BLUE}
        strokeWidth={2.6}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M8.6 4.4L12 7l3.4-2.6M8.6 19.6L12 17l3.4 2.6M4.6 9.4l.6 4M19.4 9.4l-.6 4"
        fill="none"
        stroke={BLUE}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx="12" cy="12" r="2" fill={WHITE} {...trait} />
    </>
  ),
  coeur: () => (
    <>
      <path
        d="M12 21.6C12 21.6 2.4 15 2.4 8.8A4.95 4.95 0 0 1 12 6.2a4.95 4.95 0 0 1 9.6 2.6c0 6.2-9.6 12.8-9.6 12.8z"
        fill={PINK}
        {...trait}
      />
      <Visage cx={12} cy={11} ecart={3.2} joues={RED} />
    </>
  ),
  enveloppe: () => (
    <>
      <rect x="2.2" y="5.4" width="19.6" height="13.4" rx="2" fill={CREAM} {...trait} />
      <path d="M2.2 7L12 13.6 21.8 7" fill="none" {...trait} />
      <path
        d="M14.8 15.6a2.8 2.8 0 1 1 5.6 0c0 2-2.8 3.9-2.8 3.9s-2.8-1.9-2.8-3.9z"
        fill={RED}
        {...trait}
      />
      <circle cx="6.4" cy="15.4" r="0.9" fill={INK} stroke="none" />
      <circle cx="10" cy="15.4" r="0.9" fill={INK} stroke="none" />
      <path d="M6.6 17.4q1.6 1.4 3.2 0" fill="none" {...traitFin} />
    </>
  ),
  flecheCupidon: () => (
    <>
      <path d="M4.4 19.6L18 6" fill="none" {...trait} />
      <path d="M1.2 22.8l1.4-4.8 3.4 3.4z" fill={BLUE} {...trait} />
      <path
        d="M17.2 5.2a2.6 2.6 0 1 1 5 0c0 1.9-2.5 3.6-2.5 3.6S17.2 7.1 17.2 5.2z"
        fill={PINK}
        {...trait}
      />
      <path d="M13.6 10.4l3.4 3.4M10.2 13.8l3.4 3.4" fill="none" {...traitFin} />
    </>
  ),
  ballon: () => (
    <>
      <path
        d="M12 1.6c3.7 0 6.6 3.1 6.6 7S15.7 16 12 16 5.4 12.5 5.4 8.6 8.3 1.6 12 1.6z"
        fill={PINK}
        {...trait}
      />
      <path d="M8.4 5.2c.6-1.4 1.6-2.2 2.8-2.5" fill="none" stroke={WHITE} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      <path d="M10.5 16h3l-1.5 2.1z" fill={PINK} {...trait} />
      <path d="M12 18.2c1.7 1.4-1.7 2.6 0 4.2" fill="none" {...trait} />
      <Visage cx={12} cy={8.4} ecart={2.7} joues={RED} sourire={1.9} />
    </>
  ),
  confetti: () => (
    <>
      <rect x="1.6" y="2.6" width="5.6" height="3.4" rx="1.2" fill={YELLOW} {...trait} />
      <rect x="14.6" y="5.4" width="5" height="3.6" rx="1.2" fill={BLUE} {...trait} />
      <rect x="7.4" y="12.4" width="5.4" height="3.2" rx="1.2" fill={PINK} {...trait} />
      <rect x="16" y="16" width="5" height="3.4" rx="1.2" fill={ORANGE} {...trait} />
      <rect x="2.2" y="8.6" width="4" height="2.8" rx="1" fill={VIOLET} {...trait} />
      <path d="M2.6 15c1.7-1.7 3.4 1.7 5.1 0" fill="none" {...trait} />
      <path d="M3.6 20.6c1.7-1.7 3.4 1.7 5.1 0" fill="none" {...trait} />
      <path d="M13.8 21.4c1.7-1.7 3.4 1.7 5.1 0" fill="none" {...trait} />
    </>
  ),
  partGateau: () => (
    <>
      <path d="M2.8 20.4L12 5.2l9.2 15.2z" fill={CREAM} {...trait} />
      <path d="M5.6 15h12.8" fill="none" {...trait} />
      <path d="M8.2 10.6h7.6" fill="none" {...trait} />
      <path d="M4.8 17.8c1.6-1.6 3 1.6 4.6 0s3 1.6 4.6 0 3 1.6 4.6 0" fill="none" {...traitFin} />
      <path d="M11.2 1.6h1.6v3.4h-1.6z" fill={PINK} {...trait} />
      <path d="M12 .2c1.3.9 1.3 2.3 0 2.7-1.3-.4-1.3-1.8 0-2.7z" fill={ORANGE} {...trait} />
    </>
  ),
  etiquette: () => (
    <>
      <path d="M12.4 1.6L22.4 11.6 12 22 2 12V1.6z" fill={ORANGE} {...trait} />
      <circle cx="5.6" cy="5.2" r="1.7" fill={CREAM} {...trait} />
      {/* « -% » : deux disques et une barre, jamais du texte — pas de
          dépendance à une police dans un décor. */}
      <path d="M8.4 12.4h3.2" fill="none" {...trait} />
      <circle cx="14" cy="11.6" r="1.5" fill={CREAM} {...trait} />
      <circle cx="18" cy="15.6" r="1.5" fill={CREAM} {...trait} />
      <path d="M18.6 10.8l-5.2 5.6" fill="none" {...trait} />
    </>
  ),
  sacShopping: () => (
    <>
      <path d="M4 7.4h16l-1.2 14.6H5.2z" fill={YELLOW} {...trait} />
      <path d="M8.4 8.6V5.8a3.6 3.6 0 0 1 7.2 0v2.8" fill="none" {...trait} />
      <path d="M4 7.4h16l-.3 3.4H4.3z" fill={ORANGE} {...trait} />
      <Visage cx={12} cy={15} ecart={3} joues={PINK} sourire={2.2} />
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
      <path d="M0 3.4c8 4.6 16 4.6 24 0" fill="none" {...trait} />
      <path d="M2.6 4.8L7.4 4l-2.2 6.6z" fill={RED} {...trait} />
      <path d="M8.8 5.6h4.8L11.2 12z" fill={YELLOW} {...trait} />
      <path d="M15.4 4.6l4.8-1.2-2.2 6.4z" fill={BLUE} {...trait} />
      <path d="M2 15.6c8 4.6 16 4.6 22 0" fill="none" {...trait} />
      <path d="M5 17.2l4.4-.6-2 6z" fill={GREEN} {...trait} />
      <path d="M11.4 17.6h4.4L13.6 23.6z" fill={ORANGE} {...trait} />
      <path d="M18 16.6l4.2-1.2-2 6z" fill={VIOLET} {...trait} />
    </>
  ),
  grandeRoue: () => (
    <>
      <path d="M12 12L5.4 22.4h13.2z" fill={BROWN} {...trait} />
      <circle cx="12" cy="11" r="9.4" fill={CREAM} {...trait} />
      <path
        d="M12 1.6v18.8M2.6 11h18.8M5.4 4.4l13.2 13.2M18.6 4.4L5.4 17.6"
        fill="none"
        {...traitFin}
      />
      <circle cx="12" cy="11" r="2.2" fill={YELLOW} {...trait} />
      <circle cx="12" cy="2" r="1.8" fill={RED} {...trait} />
      <circle cx="21" cy="11" r="1.8" fill={BLUE} {...trait} />
      <circle cx="12" cy="20" r="1.8" fill={PINK} {...trait} />
      <circle cx="3" cy="11" r="1.8" fill={GREEN_CLAIR} {...trait} />
      <circle cx="18.4" cy="4.6" r="1.6" fill={ORANGE} {...trait} />
      <circle cx="5.6" cy="17.4" r="1.6" fill={VIOLET} {...trait} />
    </>
  ),
  feuArtifice: () => (
    <>
      <path
        d="M12 12V2M12 12l7.1-7.1M12 12h10M12 12l7.1 7.1M12 12v10M12 12l-7.1 7.1M12 12H2M12 12L4.9 4.9"
        fill="none"
        stroke={ORANGE}
        strokeWidth={2.4}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx="12" cy="12" r="2.8" fill={YELLOW} {...trait} />
      <circle cx="12" cy="2.2" r="1.7" fill={PINK} {...trait} />
      <circle cx="21.8" cy="12" r="1.7" fill={BLUE} {...trait} />
      <circle cx="12" cy="21.8" r="1.7" fill={RED} {...trait} />
      <circle cx="2.2" cy="12" r="1.7" fill={GREEN_CLAIR} {...trait} />
      <circle cx="19.4" cy="4.6" r="1.4" fill={VIOLET} {...trait} />
      <circle cx="4.6" cy="19.4" r="1.4" fill={YELLOW} {...trait} />
    </>
  ),
  croissant: () => (
    <>
      <path
        d="M1.8 18.4C3 8.4 21 8.4 22.2 18.4c-3.2-3.8-6.6-5.6-10.2-5.6S5 14.6 1.8 18.4z"
        fill={YELLOW}
        {...trait}
      />
      <path d="M7 14.6l-1.6 3M12 13.2v3.6M17 14.6l1.6 3" fill="none" {...traitFin} />
      <Visage cx={12} cy={16.4} ecart={2.6} joues={ORANGE} sourire={1.8} />
    </>
  ),
  cupcake: () => (
    <>
      <path d="M5.4 12.6h13.2l-1.9 9.6H7.3z" fill={CREAM} {...trait} />
      <path
        d="M4.8 12.6c0-2.5 2-3.5 2.6-4.6C7.8 6 9.7 4.8 12 4.8s4.2 1.2 4.6 3.2c.6 1.1 2.6 2.1 2.6 4.6z"
        fill={PINK}
        {...trait}
      />
      <circle cx="12" cy="3" r="1.9" fill={RED} {...trait} />
      <path d="M8.4 16v4.2M12 16v4.2M15.6 16v4.2" fill="none" {...traitFin} />
      <Visage cx={12} cy={9.4} ecart={2.6} joues={RED} sourire={1.8} />
    </>
  ),
  verre: () => (
    <>
      <path d="M6.2 2.2h11.6l-1.5 7a4.4 4.4 0 0 1-8.6 0z" fill={PINK} {...trait} />
      <path d="M7 6.2h10" fill="none" {...traitFin} />
      <path d="M12 13.8V20" fill="none" {...trait} />
      <path d="M7.2 21.6h9.6" fill="none" {...trait} />
      <path d="M9 3.4c-.4 1.6-.2 3 .6 4.2" fill="none" stroke={WHITE} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </>
  ),
  grappe: () => (
    <>
      <path d="M12 5.4c0-2 1.6-3.6 4-4" fill="none" {...trait} />
      <path d="M15.6 2.4c2 .6 3 1.8 3.2 3.4-1.8.2-3-.8-3.2-3.4z" fill={GREEN} {...trait} />
      <circle cx="8.6" cy="9.4" r="2.7" fill={VIOLET} {...trait} />
      <circle cx="15.4" cy="9.4" r="2.7" fill={VIOLET} {...trait} />
      <circle cx="12" cy="13.6" r="2.7" fill={VIOLET} {...trait} />
      <circle cx="6.6" cy="15" r="2.5" fill={VIOLET} {...trait} />
      <circle cx="17.4" cy="15" r="2.5" fill={VIOLET} {...trait} />
      <circle cx="12" cy="19.4" r="2.5" fill={VIOLET} {...trait} />
    </>
  ),
  livre: () => (
    <>
      <path d="M2.4 4.4h8.4V20H2.4z" fill={BLUE} {...trait} />
      <path d="M13.2 4.4h8.4V20h-8.4z" fill={ORANGE} {...trait} />
      <path d="M10.8 4.4h2.4V20h-2.4z" fill={CREAM} {...trait} />
      <path d="M4.6 8.4h4M4.6 11.6h4M15.4 8.4h4M15.4 11.6h4" fill="none" {...traitFin} />
      <circle cx="5.6" cy="16" r="0.9" fill={INK} stroke="none" />
      <circle cx="8.4" cy="16" r="0.9" fill={INK} stroke="none" />
      <path d="M5.4 17.6q1.6 1.4 3.2 0" fill="none" {...traitFin} />
    </>
  ),
  interrogation: () => (
    <>
      <circle cx="12" cy="12" r="10.4" fill={BLUE} {...trait} />
      <path
        d="M8.4 9.4a3.8 3.8 0 0 1 7.4 1.2c0 2.6-3.1 2.9-3.1 5.2"
        fill="none"
        stroke={INK}
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx="12.5" cy="18.6" r="1.5" fill={INK} stroke="none" />
    </>
  ),
  cadeau: () => (
    <>
      <path d="M3 9.6h18V21.4H3z" fill={BLUE} {...trait} />
      <path d="M1.8 5.8h20.4v3.8H1.8z" fill={CREAM} {...trait} />
      <path d="M10.4 5.8h3.2v15.6h-3.2z" fill={RED} {...trait} />
      <path d="M12 5.8C10.6 2.2 6 2.4 6.6 5.4M12 5.8c1.4-3.6 6-3.4 5.4-.4" fill="none" {...trait} />
      <circle cx="6.6" cy="14.4" r="0.9" fill={INK} stroke="none" />
      <circle cx="8.9" cy="14.4" r="0.9" fill={INK} stroke="none" />
      <path d="M6.5 16.2q1.3 1.2 2.6 0" fill="none" {...traitFin} />
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
      <circle cx="12" cy="12" r="10" fill={WHITE} {...trait} />
      <path d="M12 6.4l4.4 3.2-1.7 5.2H9.3l-1.7-5.2z" fill={INK} stroke="none" />
      <path
        d="M12 2v4.4M3.4 8.8l4.2 2.8M20.6 8.8l-4.2 2.8M7 21l2.3-6.2M17 21l-2.3-6.2"
        fill="none"
        {...trait}
      />
    </>
  ),
  ballonBasket: () => (
    <>
      <circle cx="12" cy="12" r="10" fill={ORANGE} {...trait} />
      <path
        d="M2 12h20M12 2v20M4.4 5.2C8.6 8 8.6 16 4.4 18.8M19.6 5.2C15.4 8 15.4 16 19.6 18.8"
        fill="none"
        {...traitFin}
      />
    </>
  ),
  trophee: () => (
    <>
      <path d="M6.4 2.4h11.2v6.4a5.6 5.6 0 0 1-11.2 0z" fill={YELLOW} {...trait} />
      <path
        d="M6.4 4h-3.2v2a3.7 3.7 0 0 0 3.3 3.5M17.6 4h3.2v2a3.7 3.7 0 0 1-3.3 3.5"
        fill="none"
        {...trait}
      />
      <path d="M12 14.4v3.2" fill="none" {...trait} />
      <path d="M7.2 17.6h9.6v4H7.2z" fill={YELLOW} {...trait} />
      <Visage cx={12} cy={6.4} ecart={2.6} joues={ORANGE} sourire={1.9} />
    </>
  ),
  bonbon: () => (
    <>
      <circle cx="12" cy="12" r="5.6" fill={PINK} {...trait} />
      <path d="M6.5 12L1.4 7.6v8.8z" fill={YELLOW} {...trait} />
      <path d="M17.5 12l5.1-4.4v8.8z" fill={YELLOW} {...trait} />
      <Visage cx={12} cy={11.2} ecart={2.2} joues={RED} sourire={1.6} />
    </>
  ),
  sucette: () => (
    <>
      <circle cx="11.4" cy="8.6" r="6.8" fill={PINK} {...trait} />
      <path
        d="M11.4 8.6a2.5 2.5 0 1 1-2.3-2.5c2.1 0 3.6 1.7 3.6 3.8s-1.9 3.8-4.2 3.8"
        fill="none"
        stroke={CREAM}
        strokeWidth={2.4}
        vectorEffect="non-scaling-stroke"
      />
      <path d="M11.4 15.4V22.4" fill="none" {...trait} />
    </>
  ),
  eclair: () => (
    <path d="M13.6 1.4L4 13.4h6L9.4 22.6 20 10.2h-6.4z" fill={YELLOW} {...trait} />
  ),
  diamant: () => (
    <>
      <path d="M6 2.6h12l5 6.4-11 12.4L1 9z" fill={BLUE} {...trait} />
      <path d="M1 9h22M6 2.6L9 9l3 12.4M18 2.6L15 9l-3 12.4" fill="none" {...traitFin} />
      <path d="M3.6 6.2l1.4-1.8" fill="none" stroke={WHITE} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </>
  ),
};

/* ────────────────────────────────────────────────────────────
 * Emplacements — voir l'en-tête du fichier pour la règle des deux
 * couloirs libres (en-tête et pied de page, tous deux centrés).
 * Coordonnées en POURCENTAGE de la surface, tailles en pixels :
 * un `<svg>` imbriqué accepte `x`/`y` en pourcentage tout en gardant
 * son propre `viewBox`, donc les motifs ne se déforment jamais.
 * ──────────────────────────────────────────────────────────── */

interface Slot {
  x: string;
  y: string;
  size: number;
  rot: number;
  /**
   * `grand` reçoit un motif « héros » (le personnage qui NOMME le thème),
   * le reste reçoit le semis. Sans cette distinction, la distribution par
   * modulo pouvait placer un flocon en vignette de 120 px et le Père Noël
   * en pastille de 22 px.
   */
  rang?: "grand";
  /**
   * Rendu à partir de `md` (768 px) seulement. En dessous, la colonne de
   * contenu (`max-w-md`) occupe toute la largeur : il n'y a pas de marge où
   * poser une grande vignette sans passer sous le titre, qui n'est PAS
   * encarté. Le parcours mobile — le cas courant, on scanne un QR en
   * boutique — garde donc un décor de bord.
   */
  desktop?: boolean;
}

const SLOTS_PAGE: readonly Slot[] = [
  /* ── Grandes vignettes ── */
  // Bas de page, hors du couloir central du pied de page.
  { x: "-4%", y: "68%", size: 118, rot: -8, rang: "grand" },
  { x: "78%", y: "75%", size: 112, rot: 9, rang: "grand" },
  // Coins hauts : grand écran uniquement (voir `desktop` ci-dessus).
  { x: "1%", y: "2%", size: 164, rot: -11, rang: "grand", desktop: true },
  { x: "79%", y: "4%", size: 146, rot: 13, rang: "grand", desktop: true },
  { x: "83%", y: "38%", size: 128, rot: -6, rang: "grand", desktop: true },
  { x: "3%", y: "40%", size: 120, rot: 7, rang: "grand", desktop: true },

  /* ── Semis moyen, en flanc ── */
  { x: "-2%", y: "1.5%", size: 62, rot: -14 },
  { x: "85%", y: "1%", size: 58, rot: 12 },
  { x: "2%", y: "12%", size: 40, rot: 9 },
  { x: "88%", y: "15%", size: 44, rot: -10 },
  { x: "-3%", y: "23%", size: 56, rot: 7 },
  { x: "87%", y: "26%", size: 38, rot: -13 },
  { x: "1%", y: "34%", size: 44, rot: -7 },
  { x: "89%", y: "47%", size: 52, rot: 11 },
  { x: "-2%", y: "50%", size: 50, rot: 14 },
  { x: "86%", y: "58%", size: 42, rot: -9 },
  { x: "2%", y: "58%", size: 36, rot: 6 },
  { x: "88%", y: "66%", size: 54, rot: -12 },
  { x: "90%", y: "88%", size: 40, rot: 8 },
  { x: "-1%", y: "90%", size: 34, rot: -6 },

  /* ── Petits, en semis serré ── */
  { x: "7%", y: "30%", size: 24, rot: 18 },
  { x: "92%", y: "20%", size: 22, rot: -16 },
  { x: "6%", y: "54%", size: 26, rot: 13 },
  { x: "92%", y: "43%", size: 20, rot: 15 },
  { x: "8%", y: "80%", size: 22, rot: -15 },
  { x: "91%", y: "72%", size: 24, rot: 10 },
  { x: "5%", y: "8%", size: 20, rot: 22 },

  /* ── Densification grand écran (marges libres de la colonne) ── */
  { x: "13%", y: "7%", size: 46, rot: -9, desktop: true },
  { x: "76%", y: "17%", size: 38, rot: 12, desktop: true },
  { x: "15%", y: "50%", size: 44, rot: 8, desktop: true },
  { x: "77%", y: "60%", size: 40, rot: -11, desktop: true },
  { x: "16%", y: "84%", size: 42, rot: 14, desktop: true },
  { x: "78%", y: "90%", size: 30, rot: -8, desktop: true },
  { x: "12%", y: "22%", size: 26, rot: 16, desktop: true },
  { x: "80%", y: "28%", size: 24, rot: -18, desktop: true },
];

/**
 * APERÇU d'éditeur (l'écran de téléphone simulé du Studio de la roue) : la
 * MÊME composition que la page, à l'échelle de la maquette. Elle est DÉRIVÉE
 * de `SLOTS_PAGE`, jamais recopiée — sinon la maquette promettrait au
 * commerçant une disposition que sa page ne rend pas, et l'écart se creuserait
 * à chaque retouche.
 *
 * Les emplacements `desktop` en sont retirés : la maquette fait la largeur
 * d'un téléphone, c'est le rendu mobile qu'elle doit montrer.
 */
const SLOTS_APERCU: readonly Slot[] = SLOTS_PAGE.filter((s) => !s.desktop).map(
  (s) => ({ ...s, size: Math.max(14, Math.round(s.size * 0.42)) }),
);

/**
 * Vignette d'éditeur : la MÊME scène, miniaturisée. Densité réduite (cinq
 * motifs contre trente-cinq) parce qu'une pastille de 40 px de haut n'a pas
 * la place d'un semis — mais les deux « héros » y figurent, sinon l'aperçu
 * promettrait un décor que la page ne montre pas, ou l'inverse.
 */
const SLOTS_VIGNETTE: readonly Slot[] = [
  { x: "0%", y: "6%", size: 24, rot: -10, rang: "grand" },
  { x: "27%", y: "36%", size: 15, rot: 12 },
  { x: "50%", y: "2%", size: 21, rot: -8, rang: "grand" },
  { x: "74%", y: "32%", size: 18, rot: 9 },
  { x: "88%", y: "0%", size: 14, rot: -14 },
];

/* ────────────────────────────────────────────────────────────
 * Scènes — les motifs d'un décor, en deux registres : les `heros`
 * (grandes vignettes) et le `semis`. Distribution par modulo dans
 * chaque registre : déterministe, et une scène se décrit en deux lignes.
 * ──────────────────────────────────────────────────────────── */

interface Scene {
  heros: readonly MotifKey[];
  semis: readonly MotifKey[];
}

const SCENES: Record<DecorKey, Scene> = {
  aucun: { heros: [], semis: [] },
  noel: {
    heros: ["pereNoel", "renne", "bonhommeNeige"],
    semis: ["sapin", "sucreOrge", "flocon", "cadeau", "flocon", "sapin"],
  },
  coeurs: {
    heros: ["coeur", "enveloppe"],
    semis: ["coeur", "flecheCupidon", "eclat", "coeur"],
  },
  ballons: {
    heros: ["ballon", "partGateau"],
    semis: ["ballon", "confetti", "eclat", "ballon", "partGateau"],
  },
  etiquettes: {
    heros: ["sacShopping", "etiquette"],
    semis: ["etiquette", "eclat", "confetti", "etiquette"],
  },
  fanions: {
    heros: ["grandeRoue", "fanion"],
    semis: ["fanion", "feuArtifice", "eclat", "fanion"],
  },
  gourmand: {
    heros: ["cupcake", "croissant"],
    semis: ["croissant", "cupcake", "partGateau", "eclat"],
  },
  verres: {
    heros: ["verre", "grappe"],
    semis: ["grappe", "verre", "eclat", "grappe"],
  },
  livres: {
    heros: ["livre", "interrogation"],
    semis: ["livre", "interrogation", "etoile", "livre"],
  },
  cadeaux: {
    heros: ["cadeau", "etoile"],
    semis: ["cadeau", "eclat", "etoile", "cadeau"],
  },
  sport: {
    heros: ["trophee", "ballonFoot", "ballonBasket"],
    semis: ["ballonFoot", "ballonBasket", "eclat", "etoile"],
  },
  confetti: {
    heros: ["confetti", "feuArtifice"],
    semis: ["confetti", "eclat", "etoile", "confetti"],
  },
  sucreries: {
    heros: ["sucette", "bonbon"],
    semis: ["bonbon", "coeur", "eclat", "sucette"],
  },
  etoiles: {
    heros: ["etoile", "eclat"],
    semis: ["etoile", "eclat", "confetti", "etoile"],
  },
  eclairs: {
    heros: ["eclair", "etoile"],
    semis: ["eclair", "etoile", "eclat", "eclair"],
  },
  diamants: {
    heros: ["diamant", "etoile"],
    semis: ["diamant", "eclat", "etoile", "diamant"],
  },
};

/** Le décor d'une clé est-il dessiné ? (`aucun` ne rend rien du tout.) */
export function decorEstVide(decor: DecorKey): boolean {
  const scene = SCENES[decor] ?? SCENES.aucun;
  return scene.heros.length === 0 && scene.semis.length === 0;
}

/**
 * OPACITÉ — le point exact où la V1 s'est trompée.
 *
 * Elle valait 12 % de remplissage : sur la capture d'écran du propriétaire,
 * les motifs ressortaient en TACHES BEIGES sur un crème, indistinctes du fond.
 * « On ne distingue ni personnage ni thème » — et c'était structurel, pas une
 * question de dessin : aucun trait ne survit à 12 % sur un fond clair.
 *
 * Les motifs sont donc peints presque pleins. Ce qui protège la lisibilité,
 * ce n'est plus l'effacement mais LA CARTE DES EMPLACEMENTS (voir `Slot`) :
 * les deux seuls textes non encartés des pages joueur — l'en-tête et le pied
 * de page, tous deux centrés — n'ont aucun motif sous eux. Le reste du contenu
 * vit sur des cartes opaques, sur lesquelles le décor n'a aucun effet.
 *
 * Le reste de 20 % de transparence n'est pas de la timidité : il fait reculer
 * le décor d'un cran derrière les cartes, qui sont blanches pleines. Sans lui
 * le fond rivalise avec le contenu.
 *
 * La VIGNETTE d'éditeur monte à 95 % : haute de 40 px, elle réduit une page
 * entière à une pastille, et le moindre voile y efface le dessin. Aucun texte
 * ne repose dessus (le libellé du thème est SOUS la vignette).
 */
const ALPHA_PAGE = { fill: 0.8, stroke: 0.92 } as const;
const ALPHA_VIGNETTE = { fill: 0.95, stroke: 1 } as const;

export function ThemeDecor({
  decor,
  variant = "page",
  className = "",
}: {
  decor: DecorKey;
  /**
   * `apercu` : maquette de téléphone du Studio (même composition, à l'échelle).
   * `vignette` : pastille du sélecteur de thème, haute de 40 px.
   */
  variant?: "page" | "apercu" | "vignette";
  className?: string;
}): ReactElement | null {
  const scene = SCENES[decor] ?? SCENES.aucun;
  if (scene.heros.length === 0 && scene.semis.length === 0) return null;

  const slots =
    variant === "vignette"
      ? SLOTS_VIGNETTE
      : variant === "apercu"
        ? SLOTS_APERCU
        : SLOTS_PAGE;
  const alpha = variant === "vignette" ? ALPHA_VIGNETTE : ALPHA_PAGE;

  // Un registre vide retombe sur l'autre : une scène peut n'avoir que des
  // héros sans laisser d'emplacement au motif indéfini.
  const heros = scene.heros.length > 0 ? scene.heros : scene.semis;
  const semis = scene.semis.length > 0 ? scene.semis : scene.heros;

  let iHeros = 0;
  let iSemis = 0;

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
        const cle =
          slot.rang === "grand"
            ? heros[iHeros++ % heros.length]
            : semis[iSemis++ % semis.length];
        const Motif = MOTIFS[cle];
        return (
          <svg
            key={i}
            x={slot.x}
            y={slot.y}
            width={slot.size}
            height={slot.size}
            viewBox="0 0 24 24"
            overflow="visible"
            className={slot.desktop ? "hidden md:block" : undefined}
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
