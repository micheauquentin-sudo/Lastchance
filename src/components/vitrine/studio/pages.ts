/**
 * LES NEUF ÉTAPES DU STUDIO (VIT-20, redécoupées VIT-35).
 *
 * ── POURQUOI DES ÉTAPES, ET NON UN LONG DÉFILEMENT ──
 *
 * Le studio règle tout : identité, horaires, carte, contenu, et les
 * vingt-cinq réglages d'allure. Empilé dans une seule colonne, c'est le mur
 * que l'atelier par étape avait été créé pour défaire (VIT-15) — et cette fois
 * avec un aperçu à tenir visible en même temps.
 *
 * ── POURQUOI NEUF, ET NON TROIS ──
 *
 * C'est la demande du propriétaire : « les étapes seront bien réparties afin
 * de guider le client facilement et ludiquement ». Trois onglets tenaient la
 * mise en page, pas le parcours — « Identité » mélangeait le logo, les sept
 * jours de la semaine et quatre cases de visibilité, et toute l'allure vivait
 * dans une unique colonne de droite de vingt-cinq contrôles qu'il fallait
 * parcourir pour trouver le sien.
 *
 * Neuf étapes numérotées disent DEUX choses qu'un onglet ne dit pas : combien
 * il en reste, et où l'on en est. C'est ce qui transforme un panneau de
 * réglages en parcours.
 *
 * ── LA DÉCOUPE SUIT LA PAGE PUBLIQUE, PAS LE SCHÉMA ──
 *
 * « La bannière », « Les fiches », « La navigation », « L'ambiance » sont ce
 * qu'un commerçant REGARDE, dans l'ordre où il descend sa propre page. Un
 * découpage par type de contrôle — les listes, puis les curseurs, puis les
 * cases — aurait été plus simple à écrire et illisible à l'usage : personne ne
 * cherche « un curseur », on cherche « la hauteur de ma bannière ».
 *
 * ÉCARTÉ : garder l'allure dans une colonne de droite permanente. C'était
 * l'arbitrage de VIT-20 — régler une densité EN REGARDANT la vraie carte — et
 * il n'est pas perdu : l'aperçu, lui, reste affiché à TOUTES les étapes. Ce
 * qui disparaît, c'est la troisième colonne, dont la largeur était prise à la
 * seule chose qui avait besoin de place.
 *
 * ── L'ÉTAPE VIT EN MÉMOIRE, JAMAIS DANS UNE SOUS-ROUTE ──
 *
 * `/vitrine-studio` est une route unique et les réglages en cours d'essai
 * vivent dans un `useState`. Une sous-route serait une navigation serveur,
 * donc une remontée de composant, donc la perte de ce qu'on est en train
 * d'essayer. C'est aussi pourquoi le changement d'étape se fait par un bouton
 * et non par un `<Link>` : il ne touche pas à l'historique, il déplace un état.
 */
export const ETAPES_STUDIO = [
  {
    cle: "identite",
    titre: "Identité",
    resume: "Votre logo, votre bannière, vos mots.",
  },
  {
    cle: "horaires",
    titre: "Horaires",
    resume: "Vos sept jours, et la pastille qui dit si c'est ouvert.",
  },
  {
    cle: "carte",
    titre: "Ma carte",
    resume: "Vos cartes, vos rubriques et vos fiches.",
  },
  /**
   * « À LA UNE » N'A PLUS D'ÉTAPE À ELLE (VIT-32), et les cases de visibilité
   * l'ont rejointe (VIT-35) : elles répondent toutes à la MÊME question — que
   * voit un client en descendant ma page ? Les tenir sur trois écrans obligeait
   * à en faire trois fois le tour.
   */
  {
    cle: "parait",
    titre: "Ce qui paraît",
    resume: "Ce que votre page montre : blocs, jeux, réseaux, mises en avant.",
  },
  {
    cle: "couleurs",
    titre: "Couleurs & polices",
    resume: "Vos deux couleurs et vos deux polices.",
  },
  {
    cle: "banniere",
    titre: "La bannière",
    resume: "Le haut de votre page : sa hauteur, votre nom, la carte d'infos.",
  },
  {
    cle: "fiches",
    titre: "Les fiches",
    resume: "La présentation de vos articles : photos, prix, mise en forme.",
  },
  {
    cle: "navigation",
    titre: "La navigation",
    resume: "Comment vos clients circulent : onglets, filtres, barre du bas.",
  },
  {
    cle: "ambiance",
    titre: "L'ambiance",
    resume: "Le fond, l'espace, les arrondis, la taille du texte.",
  },
] as const;

export type EtapeStudio = (typeof ETAPES_STUDIO)[number]["cle"];

export const ETAPE_STUDIO_DEFAUT: EtapeStudio = "identite";

/**
 * Une étape INCONNUE retombe sur la première, jamais sur un écran vide.
 *
 * Même arbitrage que `parseEtape` pour les étapes d'un jeu décoché (ADR-129) :
 * ce qui n'est pas reconnu mène quelque part d'utile.
 */
export function parseEtapeStudio(brut: string | null | undefined): EtapeStudio {
  const trouvee = ETAPES_STUDIO.find((e) => e.cle === brut);
  return trouvee ? trouvee.cle : ETAPE_STUDIO_DEFAUT;
}

/**
 * LE NOM ACCESSIBLE D'UN BOUTON D'ÉTAPE — écrit ICI, pas dans la mise en page.
 *
 * Le numéro est ce qui rend le parcours lisible, mais à l'écran il tient dans
 * une pastille : lu seul par un lecteur d'écran, « 3 Ma carte » ne dit pas de
 * quoi trois est le numéro. Cette fonction est la SOURCE du nom — la barre
 * l'utilise et les gardes aussi, sans quoi elles chercheraient un libellé
 * recopié, qui divergerait au premier renommage.
 */
export function libelleEtapeStudio(cle: EtapeStudio): string {
  const index = ETAPES_STUDIO.findIndex((e) => e.cle === cle);
  return `Étape ${index + 1} sur ${ETAPES_STUDIO.length} : ${ETAPES_STUDIO[index].titre}`;
}
