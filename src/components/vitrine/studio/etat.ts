import {
  VITRINE_BLOCS_DEFAUT,
  type AllureVitrine,
  type BlocVitrine,
  type SecteurVitrine,
  type StyleCartesVitrine,
  type ThemeVitrine,
} from "@/lib/vitrine";

/**
 * L'ÉTAT DU STUDIO — UN SEUL OBJET, POUR UN SEUL FORMULAIRE (VIT-20).
 *
 * ── POURQUOI L'ÉTAT EST CENTRAL ET NON RÉPARTI DANS LES PAGES ──
 *
 * Le studio a désormais plusieurs pages, et une page qu'on quitte est
 * DÉMONTÉE. Si ses champs portaient eux-mêmes leur `name`, quitter la page
 * « Identité » pour aller composer sa carte ferait disparaître l'accroche du
 * formulaire — et l'enregistrement suivant l'effacerait, exactement le défaut
 * que VIT-19 vient de fermer côté serveur, réintroduit par la navigation.
 *
 * L'état vit donc ICI, au-dessus des pages, et c'est LUI qu'on sérialise —
 * en entier, à chaque rendu, quelle que soit la page ouverte. Les contrôles
 * visibles ne portent aucun `name` : ils lisent et écrivent cet objet, rien de
 * plus. Il devient impossible de poster un formulaire partiel, parce qu'il
 * n'existe aucun chemin par lequel un champ pourrait manquer.
 *
 * ── CE QUI N'EST PAS ICI, ET POURQUOI ──
 *
 * Le logo, la photo de couverture, les liens sociaux et la carte ont chacun
 * LEUR action serveur. Ils ne transitent pas par cet objet et s'enregistrent
 * seuls, à leur propre bouton. Les faire passer par « Enregistrer » aurait
 * exigé de les imbriquer dans ce formulaire — ce que le HTML interdit et ce
 * que `reglages-formulaires.test.tsx` garde depuis VIT-16.
 */
export type EtatStudio = {
  // ── Ce qui se lit (colonnes de `vitrine_settings`) ──
  secteur: SecteurVitrine;
  accroche: string;
  histoire: string;
  horaires: string;
  badge: string;

  // ── Le thème ──
  couleurs: { primary: string; secondary: string };
  polices: { heading: string; body: string };
  styleCartes: StyleCartesVitrine | "";
  /**
   * L'ordre ET la visibilité : un bloc masqué est un bloc ABSENT de cette
   * liste (VIT-3). Il n'y a pas de drapeau séparé qui dirait la même chose une
   * seconde fois — cocher, c'est ajouter ; décocher, c'est retirer.
   */
  blocs: BlocVitrine[];
  allure: AllureVitrine;
};

/**
 * L'état de départ, lu depuis la base.
 *
 * ── `blocs` NE PEUT PAS PARTIR VIDE ──
 *
 * Une vitrine dont personne n'a touché l'ordre a `ordre_blocs` ABSENT, ce qui
 * vaut « les cinq blocs par défaut » (VIT-3). Partir d'une liste vide aurait
 * affiché toutes les cases décochées à un commerçant dont la page montre
 * pourtant cinq blocs — et le premier enregistrement aurait entériné ce
 * mensonge. On résout donc l'absence AVANT d'afficher, comme le fait la page
 * publique.
 */
export function etatInitialStudio(
  theme: ThemeVitrine,
  identite: {
    secteur: SecteurVitrine;
    accroche: string;
    histoire: string;
    horaires: string;
    badge: string;
  },
): EtatStudio {
  return {
    ...identite,
    couleurs: {
      primary: theme.couleurs?.primary ?? "",
      secondary: theme.couleurs?.secondary ?? "",
    },
    polices: {
      heading: theme.polices?.heading ?? "",
      body: theme.polices?.body ?? "",
    },
    styleCartes: theme.style_cartes ?? "",
    blocs:
      theme.ordre_blocs && theme.ordre_blocs.length > 0
        ? [...theme.ordre_blocs]
        : [...VITRINE_BLOCS_DEFAUT],
    allure: theme.allure ?? {},
  };
}

/**
 * Le thème que rend l'aperçu — la MÊME forme que ce qui partira en base.
 *
 * Les clés vides sont omises, comme le fait `composerTheme` : sans cela,
 * l'aperçu montrerait `couleurs: { primary: "" }` là où la base recevra une
 * absence, et `resoudreThemeVitrine` ne retomberait pas sur la palette du
 * métier. L'aperçu mentirait alors précisément sur le cas où le commerçant n'a
 * rien choisi — c'est-à-dire au premier écran qu'il ouvre.
 */
export function themeDeLEtat(etat: EtatStudio, base: ThemeVitrine): ThemeVitrine {
  const theme: ThemeVitrine = { ...base };

  if (etat.couleurs.primary || etat.couleurs.secondary) {
    theme.couleurs = {
      ...(etat.couleurs.primary ? { primary: etat.couleurs.primary } : {}),
      ...(etat.couleurs.secondary ? { secondary: etat.couleurs.secondary } : {}),
    };
  } else delete theme.couleurs;

  if (etat.polices.heading || etat.polices.body) {
    theme.polices = {
      ...(etat.polices.heading
        ? { heading: etat.polices.heading as NonNullable<ThemeVitrine["polices"]>["heading"] }
        : {}),
      ...(etat.polices.body
        ? { body: etat.polices.body as NonNullable<ThemeVitrine["polices"]>["body"] }
        : {}),
    };
  } else delete theme.polices;

  if (etat.styleCartes) theme.style_cartes = etat.styleCartes;
  else delete theme.style_cartes;

  if (etat.blocs.length > 0) theme.ordre_blocs = [...etat.blocs];
  else delete theme.ordre_blocs;

  theme.allure = etat.allure;
  return theme;
}

/** Cocher un bloc l'ajoute EN FIN, décocher le retire. L'ordre des autres ne bouge pas. */
export function basculerBloc(
  blocs: readonly BlocVitrine[],
  bloc: BlocVitrine,
  visible: boolean,
): BlocVitrine[] {
  const present = blocs.includes(bloc);
  if (visible === present) return [...blocs];
  return visible ? [...blocs, bloc] : blocs.filter((b) => b !== bloc);
}
