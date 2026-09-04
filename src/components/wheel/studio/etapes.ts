/**
 * LES NEUF ÉTAPES DU STUDIO DE LA ROUE (VIT-46).
 *
 * ── CE N'EST PAS UNE CONSTRUCTION DE ZÉRO, C'EST UN RAPPROCHEMENT ──
 *
 * Ce module a déjà un atelier à SEPT étapes
 * (`src/components/dashboard/atelier-roue-etapes.ts`). Le studio n'invente
 * donc rien : il reprend le même terrain, en le coupant là où le socle des
 * studios (VIT-38) le permet et où l'atelier ne le pouvait pas.
 *
 * ── CE QUE L'ATELIER NE POUVAIT PAS COUPER, ET QUI SE COUPE ICI ──
 *
 * Dans l'atelier, chaque étape est une NAVIGATION (`?etape=` recharge la
 * page) : elle rend un formulaire NEUF, donc une charge amputée de tout ce qui
 * n'est pas à l'écran. « L'habillage » y était donc un écran unique de ~20
 * contrôles, parce qu'`updateWheelStyle` écrase le style COMPLET — deux
 * formulaires d'habillage, et le second efface le premier.
 *
 * Le socle lève exactement cette contrainte : un seul état en mémoire, aucun
 * contrôle visible portant de `name`, et la charge rendue EN ENTIER à chaque
 * rendu. « L'habillage » se coupe donc en deux — « L'habillage » (les styles
 * prêts à l'emploi et le fond d'écran) puis « Les couleurs » (le réglage fin)
 * — sans qu'aucun des deux ne puisse effacer l'autre : ils écrivent dans le
 * MÊME `style`, et c'est ce style-là qui part.
 *
 * ── CE QUI N'A PAS ÉTÉ COUPÉ, ET POURQUOI ──
 *
 * 1. **« Le jeu » garde la mécanique ET la limite de participation.** Le socle
 *    lève l'obligation MÉCANIQUE de les réunir (`updateWheelSchema` exige
 *    `game_type` et `play_limit` ensemble, mais la charge complète est rendue
 *    quelle que soit l'étape ouverte). Ce qui reste, et qui décide, est une
 *    raison PRODUIT : « Illimité » est INTERDIT sur les jeux à secret, et
 *    l'option grisée comme la note qui l'explique dépendent de la mécanique.
 *    Sur deux étapes, le commerçant lirait un refus portant sur un réglage
 *    qu'il ne voit pas — c'est l'argument exact qui garde
 *    `jackpot_campaign_id` avec le mode de validation dans le studio du
 *    passeport (VIT-42).
 *
 * 2. **« Les couleurs » n'a pas été coupée en « roue » / « page ».** Douze des
 *    réglages n'existent que sur le SVG de la roue (`porteeHabillage`) : pour
 *    les quatorze autres mécaniques, une étape « Les couleurs de la roue »
 *    serait VIDE. Et la section « Ce jeu » n'existe que pour huit mécaniques,
 *    donc l'inverse est vrai aussi. Une étape creuse selon le jeu choisi est
 *    pire qu'une étape dense : le fil d'étapes annonce un travail qui n'existe
 *    pas. C'est le même arbitrage que le ticket d'or, qui a livré cinq étapes
 *    au lieu de six.
 *
 * ── L'ORDRE SUIT LA PRÉPARATION ──
 *
 * On choisit à quoi on joue, ce qu'on gagne, l'allure, les couleurs, quand
 * c'est ouvert, ce qu'on propose avant la partie, ce qu'on demande au gagnant,
 * comment on fait venir d'autres clients, puis on vérifie.
 *
 * ── CE QUI RESTE HORS DU FIL ──
 *
 * Le statut et la publication, la suppression, les QR codes, la performance
 * par lot, la programmation et le budget : ils vivent sur la page de suivi de
 * la campagne, qui est le seul écran qui PUBLIE. L'étape de vérification y
 * renvoie plutôt que de rendre un second bouton « Ouvrir aux joueurs » — deux
 * boutons de publication, ce sont deux vérités sur l'état d'une animation.
 */
import {
  type DeclarationEtape,
  libelleEtape,
  parseEtape,
} from "@/components/studio/etapes";

export const ETAPES_STUDIO_ROUE = [
  {
    cle: "jeu",
    titre: "Le jeu",
    resume:
      "À quoi vos clients jouent, l'éventuel défi, et combien de fois ils peuvent tenter leur chance.",
  },
  {
    cle: "lots",
    titre: "Les gains",
    resume: "Ce que vos clients peuvent gagner, à quelle fréquence, en quelle quantité.",
  },
  {
    cle: "allure",
    titre: "L'habillage",
    resume: "Un style prêt à l'emploi, et la grande image de fond derrière le jeu.",
  },
  {
    cle: "couleurs",
    titre: "Les couleurs",
    resume: "Le réglage fin : la roue, l'objet du jeu, la page et son bouton.",
  },
  {
    cle: "creneau",
    titre: "Quand on peut jouer",
    resume: "Les jours et les heures où le jeu est ouvert.",
  },
  {
    cle: "avant",
    titre: "Avant de jouer",
    resume: "Ce qu'on propose à votre client juste avant la partie.",
  },
  {
    cle: "apres",
    titre: "Après le gain",
    resume: "Ce qu'on demande au gagnant, et combien de temps son code reste valable.",
  },
  {
    cle: "partage",
    titre: "Faire venir d'autres clients",
    resume: "L'invitation à partager la partie, et le parrainage.",
  },
  {
    cle: "verification",
    titre: "Dernière vérification",
    resume: "Ce qu'il reste à faire avant d'ouvrir aux joueurs.",
  },
] as const;

export type EtapeStudioRoue = (typeof ETAPES_STUDIO_ROUE)[number]["cle"];

/**
 * Les deux fonctions ci-dessous ne font que NOMMER leur liste : le libellé
 * accessible et le repli vivent au socle (`@/components/studio/etapes`). Elles
 * restent exportées d'ici parce que c'est ce nom-là que les gardes cherchent —
 * un libellé recopié dans un test divergerait au premier renommage, et la garde
 * chercherait un bouton qui n'existe plus.
 */
export function parseEtapeStudioRoue(
  brut: string | null | undefined,
): EtapeStudioRoue {
  return parseEtape(ETAPES_STUDIO_ROUE, brut);
}

export function libelleEtapeStudioRoue(cle: EtapeStudioRoue): string {
  return libelleEtape(ETAPES_STUDIO_ROUE, cle);
}

/** La liste satisfait le contrat du socle — vérifié à la compilation. */
const _contrat: readonly DeclarationEtape<EtapeStudioRoue>[] =
  ETAPES_STUDIO_ROUE;
void _contrat;
