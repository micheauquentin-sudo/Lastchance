import type { CSSProperties } from "react";
import {
  FONT_KEYS,
  fontFamily,
  fontGoogleHref,
  type FontKey,
} from "@/lib/fonts";
import {
  VITRINE_BLOCS_DEFAUT,
  VITRINE_STYLES_CARTES,
  type BlocVitrine,
  type StyleCartesVitrine,
  type ThemeVitrine,
} from "@/lib/vitrine";

/**
 * LE THÈME, TRADUIT EN PIXELS — et rien d'autre.
 *
 * ── POURQUOI CE MODULE EST CÔTÉ COMPOSANTS ET NON DANS `src/lib` ──
 *
 * `@/lib/vitrine` porte le VOCABULAIRE : quelles couleurs sont valides, quelles
 * polices existent, quels blocs peuvent être ordonnés. C'est la même liste que
 * garde `is_valid_vitrine_theme` en base, et elle ne doit exister qu'une fois.
 *
 * Ce fichier-ci ne décide de rien : il traduit ce vocabulaire en variables CSS,
 * en piles `font-family` et en couleur de texte lisible. C'est une décision
 * d'affichage — deux écrans (la page publique, l'aperçu du tableau de bord)
 * doivent rendre le MÊME thème de la MÊME façon, et c'est tout ce que ce module
 * garantit.
 *
 * ── LES DÉFAUTS SONT SOBRES, PAS NEUTRES ──
 *
 * `#211d16` sur `#fdf6e3` : l'encre et le crème du produit. Un commerçant qui
 * n'a rien réglé obtient une carte qui a l'air VOULUE — c'est exactement la
 * promesse « les fiches sans photo doivent être belles ». Un gris système
 * aurait donné l'air d'un formulaire pas fini.
 */

const PRIMARY_DEFAUT = "#211d16";
const SECONDARY_DEFAUT = "#fdf6e3";
const STYLE_CARTES_DEFAUT: StyleCartesVitrine = "liste";

export interface VitrineThemeResolu {
  /** Couleur d'accent : titres, prix, pastille de carte active. */
  primary: string;
  /** Fond de page. */
  secondary: string;
  /** Texte lisible POSÉ SUR `primary`. */
  surPrimary: string;
  /** Texte lisible POSÉ SUR `secondary`. */
  surSecondary: string;
  heading: FontKey;
  body: FontKey;
  styleCartes: StyleCartesVitrine;
  /** Blocs de la page d'accueil, dans l'ordre voulu. Jamais vide. */
  blocs: BlocVitrine[];
}

/** `#RRGGBB` — la forme courte est refusée en base, on ne l'accepte pas ici. */
function estHex(valeur: unknown): valeur is string {
  return typeof valeur === "string" && /^#[0-9a-fA-F]{6}$/.test(valeur);
}

/**
 * Le texte à poser SUR une couleur de fond : encre ou blanc, celui des deux qui
 * contraste le plus.
 *
 * Luminance relative WCAG, et non une moyenne des composantes : la moyenne fait
 * basculer au blanc sur des verts moyens où le noir reste plus lisible, et
 * c'est précisément la famille de couleurs qu'un restaurant choisit.
 *
 * Ce calcul ne REMPLACE pas le contrôle de contraste — un commerçant peut
 * choisir deux couleurs proches l'une de l'autre, et aucune fonction ne peut
 * l'en empêcher — mais il ferme le cas le plus courant : du texte blanc sur un
 * accent clair.
 */
export function texteSur(fond: string): string {
  if (!estHex(fond)) return "#211d16";
  const canal = (n: number) => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = canal(parseInt(fond.slice(1, 3), 16));
  const v = canal(parseInt(fond.slice(3, 5), 16));
  const b = canal(parseInt(fond.slice(5, 7), 16));
  const luminance = 0.2126 * r + 0.7152 * v + 0.0722 * b;
  // Seuil 0.5 en luminance RELATIVE (et non 0.5 en clarté perçue) : c'est le
  // point où le rapport de contraste avec le blanc et celui avec l'encre se
  // croisent.
  return luminance > 0.5 ? "#211d16" : "#ffffff";
}

/**
 * `FONT_KEYS` est la SEULE liste consultée — la même que recopie
 * `is_valid_vitrine_theme` en base. Une police retirée de `fonts.ts` cesse donc
 * d'être rendue ici sans que rien d'autre ne bouge.
 */
function estPolice(valeur: unknown): valeur is FontKey {
  return (
    typeof valeur === "string" && (FONT_KEYS as readonly string[]).includes(valeur)
  );
}

/**
 * Le thème EFFECTIF : ce que la base a stocké, complété par les défauts.
 *
 * Tolérant par construction — `theme` est une colonne `jsonb` dont toutes les
 * clés sont facultatives, et une vitrine à moitié réglée doit s'afficher. Ce
 * qui est refusé ici n'est jamais une valeur du commerçant, seulement une
 * valeur que la base n'aurait pas dû laisser passer.
 */
export function resoudreThemeVitrine(
  theme: ThemeVitrine | null | undefined,
): VitrineThemeResolu {
  const couleurs = theme?.couleurs;
  const polices = theme?.polices;
  const demandeStyle = theme?.style_cartes;

  const primary = estHex(couleurs?.primary) ? couleurs.primary : PRIMARY_DEFAUT;
  const secondary = estHex(couleurs?.secondary)
    ? couleurs.secondary
    : SECONDARY_DEFAUT;
  const heading = estPolice(polices?.heading) ? polices.heading : "elegant";
  const body = estPolice(polices?.body) ? polices.body : "sans";

  const styleCartes =
    demandeStyle && VITRINE_STYLES_CARTES.includes(demandeStyle)
      ? demandeStyle
      : STYLE_CARTES_DEFAUT;

  // L'ordre PARTIEL est légitime : omettre un bloc, c'est le masquer. Deux cas
  // seulement retombent sur l'ordre par défaut, et aucun n'est un choix du
  // commerçant : la clé ABSENTE (`mapThemeVitrine` ne la pose que si elle
  // existait) et une liste VIDE, qui rendrait une page sans rien.
  //
  // LE REPLI EST `VITRINE_BLOCS_DEFAUT` — LES CINQ, PAS LES SEPT. Retomber sur
  // le vocabulaire complet aurait fait publier les deux portes de VIT-3 à toute
  // vitrine jamais réglée, sans que personne l'ait demandé : voir le POURQUOI
  // au-dessus de la constante, dans `@/lib/vitrine`.
  const demandes = theme?.ordre_blocs ?? [];
  const blocs =
    demandes.length > 0 ? [...demandes] : [...VITRINE_BLOCS_DEFAUT];

  return {
    primary,
    secondary,
    surPrimary: texteSur(primary),
    surSecondary: texteSur(secondary),
    heading,
    body,
    styleCartes,
    blocs,
  };
}

/**
 * Les variables CSS du thème, posées sur le conteneur de la vitrine.
 *
 * VARIABLES ET NON CLASSES : les couleurs viennent d'une base de données, donc
 * Tailwind ne peut pas les compiler. Elles sont lues par des `style` et par des
 * utilitaires arbitraires `text-[var(--vitrine-primary)]` — ce qui reste du
 * Tailwind ordinaire, sans classe générée à la volée.
 */
export function variablesThemeVitrine(t: VitrineThemeResolu): CSSProperties {
  return {
    "--vitrine-primary": t.primary,
    "--vitrine-secondary": t.secondary,
    "--vitrine-sur-primary": t.surPrimary,
    "--vitrine-sur-secondary": t.surSecondary,
    "--vitrine-titre": fontFamily(t.heading),
    "--vitrine-texte": fontFamily(t.body),
  } as CSSProperties;
}

/**
 * Les feuilles Google Fonts à charger — UNIQUEMENT celles choisies, et jamais
 * deux fois la même.
 *
 * Même motif que `/play` (`fontGoogleHref` + `<link>` dans le rendu) : la page
 * ne paie que les polices réellement utilisées. Le dédoublonnage compte ici et
 * pas là-bas : la vitrine choisit DEUX polices, et « Élégante » en titre comme
 * en texte aurait chargé Playfair Display deux fois.
 */
export function policesVitrine(t: VitrineThemeResolu): string[] {
  const hrefs = [fontGoogleHref(t.heading), fontGoogleHref(t.body)];
  return [...new Set(hrefs.filter((h): h is string => Boolean(h)))];
}
