import {
  definitionEtape,
  hrefEtape,
  type EtapeAtelier,
} from "@/components/dashboard/atelier-etapes";

/**
 * LES SEPT ÉTAPES DE L'ATELIER DE LA VITRINE (VIT-15).
 *
 * ── POURQUOI LA VITRINE Y VIENT EN DERNIER, ET POURQUOI ELLE Y VIENT ──
 *
 * Huit modules règlent déjà leur préparation par étapes ; la Vitrine était le
 * seul gros module à empiler neuf cartes repliables sur un seul écran. Ça
 * tenait tant qu'elle n'avait que l'adresse et la carte. Elle porte désormais
 * l'identité, le secteur, vingt-cinq réglages d'allure, l'import, les
 * traductions, les liens mis en avant et deux jeux : la pile était devenue un
 * mur où l'ordre de préparation ne se lisait plus.
 *
 * ── L'ÉTAPE VIT DANS `?etape=`, PAS DANS UNE SOUS-ROUTE ──
 *
 * Motif commun de l'atelier, et il compte particulièrement ici : les vingt et
 * un `revalidatePath("/dashboard/vitrine")` de `src/actions/vitrine.ts` visent
 * la page NUE, et la revalidation ignore la query. Une sous-route les aurait
 * tous fait mentir d'un coup.
 *
 * ── L'ORDRE EST CELUI DU TRAVAIL RÉEL, PAS CELUI DE L'ÉCRAN D'AVANT ──
 *
 * L'adresse d'abord, parce que rien n'existe sans elle — la page le disait
 * déjà, en refusant d'afficher le reste. Puis ce que le client VOIT en
 * arrivant (identité, style), puis ce qu'il vient LIRE (la carte), puis ce qui
 * s'ajoute autour (à la une, réseaux), puis l'anglais, puis les jeux. La
 * vérification ferme la marche.
 *
 * ── « LES JEUX » EST UNE ÉTAPE, PAS DEUX ──
 *
 * Duo Miroir et Portrait de la Bande avaient chacun leur carte. Ce sont deux
 * jeux facultatifs que la plupart des commerçants n'activent jamais : deux
 * étapes permanentes auraient fait porter à tout le monde le poids de ce que
 * peu utilisent. Une seule étape présente le bilan et laisse cocher ; les
 * réglages de chaque jeu retenu suivront dans leurs propres étapes, ajoutées
 * seulement quand la case est cochée (lot suivant).
 */
export type EtapeVitrine =
  | "adresse"
  | "identite"
  | "carte"
  | "alaune"
  | "traductions"
  | "jeux"
  | "duo"
  | "bande"
  | "verification";

export const ETAPES_VITRINE = [
  {
    cle: "adresse",
    titre: "L'adresse",
    resume:
      "L'adresse publique que porteront vos QR codes. Elle se choisit une fois.",
  },
  {
    cle: "identite",
    titre: "L'identité et le style",
    resume:
      "Votre métier, la photo d'en-tête, votre histoire, vos horaires et l'allure de la page.",
  },
  {
    cle: "carte",
    titre: "Votre carte",
    resume:
      "Importez une carte existante ou saisissez vos cartes, rubriques et fiches.",
  },
  {
    cle: "alaune",
    titre: "À la une",
    resume: "Jusqu'à trois liens mis en avant, et vos réseaux.",
  },
  {
    cle: "traductions",
    titre: "L'anglais",
    resume:
      "Facultatif : la version anglaise de votre carte, pour vos clients étrangers.",
  },
  {
    cle: "jeux",
    titre: "Les jeux sur la carte",
    resume:
      "Facultatif : ce que vous possédez, et ce que vous voulez proposer depuis votre vitrine.",
  },
  {
    cle: "verification",
    titre: "La vérification",
    resume: "Ce qu'il reste à faire avant de publier.",
  },
] as const satisfies readonly EtapeAtelier[];

/**
 * LES DEUX ÉTAPES QUI N'EXISTENT QUE SI ON LES A DEMANDÉES (VIT-16).
 *
 * Elles se glissent APRÈS « Les jeux » et AVANT « La vérification » : on coche,
 * on règle ce qu'on vient de cocher, puis on vérifie. Les poser à la fin aurait
 * séparé le choix de son réglage par l'écran qui juge les deux.
 */
const ETAPE_DUO = {
  cle: "duo",
  titre: "Duo Miroir",
  resume: "Les fiches épinglées au plateau — il en faut assez pour que le jeu ouvre.",
} as const satisfies EtapeAtelier;

const ETAPE_BANDE = {
  cle: "bande",
  titre: "Portrait de la Bande",
  resume: "Le pack de questions posées à la tablée.",
} as const satisfies EtapeAtelier;

/**
 * LE FIL D'ÉTAPES RÉELLEMENT AFFICHÉ.
 *
 * ── POURQUOI UNE FONCTION, ET NON UNE LISTE ──
 *
 * Duo Miroir et Portrait de la Bande sont facultatifs, et la plupart des
 * commerçants n'en activent aucun. Deux étapes permanentes auraient fait porter
 * à tous le poids de ce que peu utilisent — un fil de neuf cases dont deux
 * vides. Elles n'apparaissent donc que si la case est cochée.
 *
 * ── L'ÉTAPE D'UN JEU DÉCOCHÉ RESTE ATTEIGNABLE PAR SON URL ──
 *
 * `parseEtape` juge sur la liste qu'on lui passe : une étape absente y est
 * INCONNUE, donc elle retombe sur la première. C'est le bon comportement — un
 * lien vers « Duo Miroir » gardé en favori après avoir décoché le jeu doit
 * mener quelque part d'utile, pas à un écran vide ni à un 404.
 */
export function etapesVitrine(jeux: {
  duo: boolean;
  bande: boolean;
}): readonly EtapeAtelier[] {
  const conditionnelles: EtapeAtelier[] = [];
  if (jeux.bande) conditionnelles.push(ETAPE_BANDE);
  if (jeux.duo) conditionnelles.push(ETAPE_DUO);
  if (conditionnelles.length === 0) return ETAPES_VITRINE;

  const iVerif = ETAPES_VITRINE.findIndex((e) => e.cle === "verification");
  return [
    ...ETAPES_VITRINE.slice(0, iVerif),
    ...conditionnelles,
    ...ETAPES_VITRINE.slice(iVerif),
  ];
}

/**
 * LA BASE EST LA PAGE ELLE-MÊME. La Vitrine n'a pas d'identifiant dans son
 * URL — il y en a UNE par commerce, contrairement aux chasses ou aux quiz qui
 * se comptent. C'est la seule différence avec les six autres ateliers, et elle
 * ne change rien au reste : les primitives ne connaissent que la base.
 */
export function baseAtelierVitrine(): string {
  return "/dashboard/vitrine";
}

export function hrefEtapeVitrine(cle: EtapeVitrine): string {
  return hrefEtape(baseAtelierVitrine(), cle);
}

export function definitionEtapeVitrine(cle: EtapeVitrine): EtapeAtelier {
  return definitionEtape(ETAPES_VITRINE, cle) ?? ETAPES_VITRINE[0];
}

/**
 * L'ÉTAPE QUI CORRIGE UN POINT DE CONTRÔLE.
 *
 * La vérification n'énonce pas des reproches : elle renvoie à l'endroit où le
 * point se répare. Cette table est la seule qui relie les deux vocabulaires —
 * celui de `construireVerificationVitrine` (`adresse`, `catalogue`,
 * `publiee`, `duo-plateau`) et celui des étapes.
 *
 * `publiee` renvoie à la VÉRIFICATION et non à une étape de publication :
 * publier n'est pas une étape de l'atelier, c'est un geste de la vue suivi.
 * L'écran de vérification porte donc le bouton qui y ramène.
 */
const ETAPE_DU_CONTROLE: Record<string, EtapeVitrine> = {
  adresse: "adresse",
  catalogue: "carte",
  publiee: "verification",
  "duo-plateau": "duo",
};

export function etapeDuControleVitrine(cle: string): EtapeVitrine {
  return ETAPE_DU_CONTROLE[cle] ?? "verification";
}
