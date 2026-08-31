import type { CSSProperties } from "react";
import {
  FONT_KEYS,
  fontFamily,
  fontGoogleHref,
  type FontKey,
} from "@/lib/fonts";
import {
  VITRINE_ALLURE_BOOLEENS_DEFAUTS,
  VITRINE_ALLURE_BORNES,
  VITRINE_ALLURE_ENUMS,
  VITRINE_BLOCS_DEFAUT,
  VITRINE_PRESETS_SECTEUR,
  VITRINE_SECTEUR_DEFAUT,
  VITRINE_STYLES_CARTES,
  type AllureVitrine,
  type BarreBasseVitrine,
  type BlocVitrine,
  type CarteInfosVitrine,
  type DensiteVitrine,
  type MotifVitrine,
  type PhotoPositionVitrine,
  type PhotoTailleVitrine,
  type SecteurVitrine,
  type StyleCartesVitrine,
  type StyleChipsVitrine,
  type StyleFicheVitrine,
  type StyleOngletsVitrine,
  type StylePrixVitrine,
  type StyleRubriqueVitrine,
  type ThemeVitrine,
} from "@/lib/vitrine";

/**
 * LE THÈME, TRADUIT EN PIXELS — et rien d'autre.
 *
 * ── POURQUOI CE MODULE EST CÔTÉ COMPOSANTS ET NON DANS `src/lib` ──
 *
 * `@/lib/vitrine` porte le VOCABULAIRE : quelles couleurs sont valides, quelles
 * polices existent, quels blocs peuvent être ordonnés, quels réglages d'allure
 * la base accepte. C'est la même liste que garde `is_valid_vitrine_theme` en
 * base, et elle ne doit exister qu'une fois.
 *
 * Ce fichier-ci ne décide de rien : il traduit ce vocabulaire en variables CSS,
 * en piles `font-family` et en couleur de texte lisible. C'est une décision
 * d'affichage — deux écrans (la page publique, l'aperçu du tableau de bord)
 * doivent rendre le MÊME thème de la MÊME façon, et c'est tout ce que ce module
 * garantit.
 *
 * ── LES DÉFAUTS SONT LA MAQUETTE, PAS UN GRIS SYSTÈME (VIT-13) ──
 *
 * Chaque défaut d'allure est la valeur de la carte de référence. Une vitrine à
 * laquelle personne n'a touché sort donc EXACTEMENT comme elle. C'est le seul
 * arbitrage qui tient la promesse « que ça ressemble à ça » sans imposer au
 * commerçant de reconstituer une maquette réglage par réglage.
 *
 * La palette, elle, vient du SECTEUR — `#7D3C11` sur `#FAF6EC` pour un
 * restaurant, un bleu de nuit pour un hôtel. Un commerçant qui a posé SA
 * couleur garde la sienne, toujours : le préréglage ne remplit qu'un vide.
 */

const STYLE_CARTES_DEFAUT: StyleCartesVitrine = "liste";

/**
 * L'allure RÉSOLUE — les vingt-cinq réglages, sans un seul facultatif.
 *
 * Le stockage est partiel (`AllureVitrine`), l'affichage ne peut pas l'être :
 * un composant qui ferait `allure.rayon ?? 13` recopierait le défaut à chaque
 * usage, et le jour où il change, il changerait à onze endroits sur douze.
 */
export interface AllureResolue {
  motif: MotifVitrine;
  densite: DensiteVitrine;
  styleFiche: StyleFicheVitrine;
  photoTaille: PhotoTailleVitrine;
  photoPosition: PhotoPositionVitrine;
  stylePrix: StylePrixVitrine;
  styleOnglets: StyleOngletsVitrine;
  styleChips: StyleChipsVitrine;
  styleRubrique: StyleRubriqueVitrine;
  barreBasse: BarreBasseVitrine;
  carteInfos: CarteInfosVitrine;
  motifOpacite: number;
  rayon: number;
  ombre: number;
  echelleTexte: number;
  heroHauteur: number;
  heroTailleNom: number;
  heroVoile: number;
  enteteCollant: boolean;
  capitales: boolean;
  capitalesDesc: boolean;
  compteRubrique: boolean;
  monogramme: boolean;
  favoris: boolean;
  recherche: boolean;
}

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
  /** Le métier — il pilote le VOCABULAIRE public et le préréglage de palette. */
  secteur: SecteurVitrine;
  allure: AllureResolue;
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
 * Une couleur du thème, diluée — en `rgba()` et NON en `color-mix()`.
 *
 * `color-mix` aurait été plus court, mais il se compose mal : `color-mix(…)`
 * dans un dégradé répété, dans une ombre portée et dans un `background-image`
 * multiplie les recalculs sur la page dont le budget est le plus serré du
 * dépôt. `rgba` est calculé UNE fois, ici, et voyage comme une chaîne.
 */
function dilue(hex: string, alpha: number): string {
  if (!estHex(hex)) return `rgba(0,0,0,${alpha})`;
  const n = parseInt(hex.slice(1), 16);
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
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
 * L'allure EFFECTIVE : ce que la base a stocké, complété par les défauts de la
 * maquette.
 *
 * Aucune valeur n'est rabotée : `mapAllureVitrine` a déjà écarté ce qui sortait
 * des bornes, et une valeur ramenée de force donnerait une page qui a l'air
 * réglée alors qu'elle ne l'est pas.
 */
function resoudreAllure(allure: AllureVitrine | undefined): AllureResolue {
  const a = allure ?? {};
  const e = VITRINE_ALLURE_ENUMS;
  const b = VITRINE_ALLURE_BORNES;
  const d = VITRINE_ALLURE_BOOLEENS_DEFAUTS;

  return {
    motif: a.motif ?? e.motif.defaut,
    densite: a.densite ?? e.densite.defaut,
    styleFiche: a.style_fiche ?? e.style_fiche.defaut,
    photoTaille: a.photo_taille ?? e.photo_taille.defaut,
    photoPosition: a.photo_position ?? e.photo_position.defaut,
    stylePrix: a.style_prix ?? e.style_prix.defaut,
    styleOnglets: a.style_onglets ?? e.style_onglets.defaut,
    styleChips: a.style_chips ?? e.style_chips.defaut,
    styleRubrique: a.style_rubrique ?? e.style_rubrique.defaut,
    barreBasse: a.barre_basse ?? e.barre_basse.defaut,
    carteInfos: a.carte_infos ?? e.carte_infos.defaut,
    motifOpacite: a.motif_opacite ?? b.motif_opacite.defaut,
    rayon: a.rayon ?? b.rayon.defaut,
    ombre: a.ombre ?? b.ombre.defaut,
    echelleTexte: a.echelle_texte ?? b.echelle_texte.defaut,
    heroHauteur: a.hero_hauteur ?? b.hero_hauteur.defaut,
    heroTailleNom: a.hero_taille_nom ?? b.hero_taille_nom.defaut,
    heroVoile: a.hero_voile ?? b.hero_voile.defaut,
    enteteCollant: a.entete_collant ?? d.entete_collant,
    capitales: a.capitales ?? d.capitales,
    capitalesDesc: a.capitales_desc ?? d.capitales_desc,
    compteRubrique: a.compte_rubrique ?? d.compte_rubrique,
    monogramme: a.monogramme ?? d.monogramme,
    favoris: a.favoris ?? d.favoris,
    recherche: a.recherche ?? d.recherche,
  };
}

/**
 * Le thème EFFECTIF : ce que la base a stocké, complété par le préréglage du
 * secteur, puis par les défauts.
 *
 * Tolérant par construction — `theme` est une colonne `jsonb` dont toutes les
 * clés sont facultatives, et une vitrine à moitié réglée doit s'afficher. Ce
 * qui est refusé ici n'est jamais une valeur du commerçant, seulement une
 * valeur que la base n'aurait pas dû laisser passer.
 *
 * `secteur` est FACULTATIF et non requis : l'aperçu du tableau de bord et les
 * tests appellent cette fonction sans lui, et le rendre obligatoire aurait fait
 * inventer un secteur à des appelants qui n'en connaissent pas.
 */
export function resoudreThemeVitrine(
  theme: ThemeVitrine | null | undefined,
  secteur: SecteurVitrine = VITRINE_SECTEUR_DEFAUT,
): VitrineThemeResolu {
  const couleurs = theme?.couleurs;
  const polices = theme?.polices;
  const demandeStyle = theme?.style_cartes;
  const preset = VITRINE_PRESETS_SECTEUR[secteur];

  // LE PRÉRÉGLAGE NE REMPLIT QU'UN VIDE. Une couleur posée par le commerçant
  // gagne toujours — y compris après un changement de secteur, où le contraire
  // aurait effacé son choix sans le lui dire.
  const primary = estHex(couleurs?.primary) ? couleurs.primary : preset.primary;
  const secondary = estHex(couleurs?.secondary)
    ? couleurs.secondary
    : preset.secondary;
  const heading = estPolice(polices?.heading) ? polices.heading : preset.heading;
  const body = estPolice(polices?.body) ? polices.body : preset.body;

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
  // vitrine jamais réglée, sans que personne l'ait demandé.
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
    secteur,
    allure: resoudreAllure(theme?.allure),
  };
}

/** Le rembourrage d'une fiche, en pixels — la densité, traduite. */
const PAD_DENSITE: Record<DensiteVitrine, number> = {
  confortable: 18,
  standard: 14,
  compact: 10,
};

/**
 * La photo d'une fiche : largeur et hauteur, en pixels.
 *
 * `sans` ne figure pas ici — cette taille ne RÉDUIT pas la photo, elle la
 * retire, et c'est le composant qui décide de ne rien rendre. Lui donner des
 * dimensions aurait réservé un cadre vide.
 */
const PHOTO_LATERALE: Record<
  Exclude<PhotoTailleVitrine, "aucune">,
  [number, number]
> = {
  grande: [152, 116],
  standard: [130, 92],
  vignette: [88, 66],
};

/** En pleine largeur, seule la HAUTEUR se règle : la largeur est celle de la carte. */
const PHOTO_PLEINE: Record<Exclude<PhotoTailleVitrine, "aucune">, number> = {
  grande: 220,
  standard: 170,
  vignette: 120,
};

/**
 * Le motif de fond — un dégradé répété, jamais une image.
 *
 * Trois `repeating-linear-gradient` et un `radial-gradient` coûtent zéro requête
 * et zéro octet transféré. Une texture en PNG aurait pesé plus que le HTML de
 * la page entière, sur un téléphone en salle et sur un réseau de comptoir.
 */
function motifCss(motif: MotifVitrine, couleur: string): string {
  switch (motif) {
    case "aucun":
      return "none";
    case "diagonales":
      return `repeating-linear-gradient(135deg, ${couleur} 0 1px, transparent 1px 12px)`;
    case "points":
      return `radial-gradient(${couleur} 1.2px, transparent 1.3px)`;
    case "damier":
      return (
        `repeating-linear-gradient(0deg, ${couleur} 0 1px, transparent 1px 22px),` +
        `repeating-linear-gradient(90deg, ${couleur} 0 1px, transparent 1px 22px)`
      );
  }
}

/**
 * Les variables CSS du thème, posées sur le conteneur de la vitrine.
 *
 * VARIABLES ET NON CLASSES : les couleurs viennent d'une base de données, donc
 * Tailwind ne peut pas les compiler. Elles sont lues par des `style` et par des
 * utilitaires arbitraires `text-[var(--vitrine-primary)]` — ce qui reste du
 * Tailwind ordinaire, sans classe générée à la volée.
 *
 * ── TOUT CE QUI PEUT ÊTRE CALCULÉ ICI L'EST ICI ──
 *
 * Le composant ne doit jamais refaire une multiplication : `--vitrine-pad` vaut
 * déjà « 14px », pas « standard ». Un composant qui traduirait lui-même la
 * densité serait un second endroit où la traduction existe, et le premier à
 * diverger le jour où « compact » passe de 10 à 9.
 */
export function variablesThemeVitrine(t: VitrineThemeResolu): CSSProperties {
  const a = t.allure;
  const pleine = a.photoPosition === "pleine";
  // `aucune` retire la photo, il ne la dimensionne pas : le composant ne rendra
  // rien, et ces variables ne seront lues par personne. On retombe donc sur
  // `standard` plutôt que d'ouvrir la table à une quatrième entrée qui
  // signifierait « pas de taille ».
  const taille: Exclude<PhotoTailleVitrine, "aucune"> =
    a.photoTaille === "aucune" ? "standard" : a.photoTaille;
  const laterale = PHOTO_LATERALE[taille];
  const hauteurPleine = PHOTO_PLEINE[taille];

  // L'ombre, dérivée d'un seul curseur : plus elle monte, plus elle descend,
  // s'étale et fonce. Trois réglages séparés auraient laissé produire des
  // ombres impossibles (très floue et très opaque) qui salissent la page.
  const ombre =
    `0 ${Math.round(2 + 8 * a.ombre)}px ${Math.round(8 + 24 * a.ombre)}px ` +
    dilue("#000000", 0.03 + 0.11 * a.ombre);

  // Le voile du hero : sombre en haut pour les pastilles, clair au milieu pour
  // laisser voir la photo, sombre en bas pour que le nom reste lisible.
  const voile =
    `linear-gradient(to bottom, ${dilue("#1C130C", a.heroVoile)} 0%, ` +
    `${dilue("#1C130C", a.heroVoile * 0.12)} 40%, ` +
    `${dilue("#1C130C", Math.min(0.95, a.heroVoile + 0.2))} 100%)`;

  return {
    "--vitrine-primary": t.primary,
    "--vitrine-secondary": t.secondary,
    "--vitrine-sur-primary": t.surPrimary,
    "--vitrine-sur-secondary": t.surSecondary,
    "--vitrine-titre": fontFamily(t.heading),
    "--vitrine-texte": fontFamily(t.body),

    // Accent dilué — lu par les bordures, les pastilles et les fonds tramés.
    "--vitrine-accent-08": dilue(t.primary, 0.08),
    "--vitrine-accent-10": dilue(t.primary, 0.1),
    "--vitrine-accent-25": dilue(t.primary, 0.25),
    "--vitrine-accent-30": dilue(t.primary, 0.3),

    "--vitrine-rad": `${a.rayon}px`,
    // Le rayon INTÉRIEUR d'une photo dans une carte : jamais négatif, sans quoi
    // le navigateur ignore la propriété entière et la photo redevient carrée.
    "--vitrine-rad-photo": `${Math.max(0, a.rayon - 6)}px`,
    "--vitrine-pad": `${PAD_DENSITE[a.densite]}px`,
    "--vitrine-fsx": String(a.echelleTexte),
    "--vitrine-motif": motifCss(a.motif, dilue(t.primary, 0.1 * a.motifOpacite)),
    "--vitrine-ombre": ombre,

    "--vitrine-carte-fond": a.styleFiche === "plein" ? dilue(t.primary, 0.06) : "#ffffff",
    "--vitrine-carte-bord": a.styleFiche === "contour" ? "1px" : "0px",
    "--vitrine-carte-ombre": a.styleFiche === "ombre" ? ombre : "none",
    "--vitrine-carte-flex": pleine
      ? "column-reverse"
      : a.photoPosition === "gauche"
        ? "row-reverse"
        : "row",

    "--vitrine-photo-l": pleine ? "100%" : `${laterale[0]}px`,
    "--vitrine-photo-h": pleine ? `${hauteurPleine}px` : `${laterale[1]}px`,

    "--vitrine-hero-h": `${a.heroHauteur}px`,
    "--vitrine-hero-nom": `${a.heroTailleNom}px`,
    "--vitrine-voile": voile,
    // Le bas du bloc de titre : il remonte quand la carte d'infos vient le
    // chevaucher, sans quoi les deux se superposent.
    "--vitrine-hero-bas": a.carteInfos === "chevauche" ? "52px" : "22px",
    "--vitrine-infos-mt": a.carteInfos === "chevauche" ? "-38px" : "12px",

    "--vitrine-caps": a.capitales ? "uppercase" : "none",
    "--vitrine-caps-desc": a.capitalesDesc ? "uppercase" : "none",
    "--vitrine-collant": a.enteteCollant ? "sticky" : "static",

    "--vitrine-barre-rad": a.barreBasse === "pleine" ? "0px" : "999px",
    "--vitrine-barre-pad": a.barreBasse === "pleine" ? "0px" : "10px 12px 12px",
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
