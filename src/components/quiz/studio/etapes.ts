/**
 * LES HUIT ÉTAPES DU STUDIO DU QUIZ (VIT-41).
 *
 * ── POURQUOI HUIT, ALORS QUE L'ATELIER N'EN A QUE QUATRE ──
 *
 * L'atelier n'en a jamais eu que quatre pour deux raisons mécaniques, écrites
 * noir sur blanc dans `atelier-quiz-etapes.ts` :
 *
 *  1. `updateQuiz` EFFACE `intro_text` si le champ n'est pas rendu — le nom, le
 *     thème et la consigne devaient donc voyager ENSEMBLE dans « Le quiz » ;
 *  2. `updateQuizReward` écrit ses sept colonnes en bloc avec un `superRefine`
 *     qui croise le mode et les champs — « le mode » et « le lot » ne pouvaient
 *     PAS devenir deux étapes, d'où une « Dotation » indivisible.
 *
 * Dans l'atelier, chaque étape est une NAVIGATION : `?etape=` recharge la page,
 * donc rend un formulaire NEUF, donc une charge utile amputée de tout ce qui
 * n'est pas à l'écran. Le socle des studios lève exactement cette contrainte
 * (VIT-38) : l'état vit en mémoire, aucun contrôle visible ne porte de `name`,
 * et la charge utile est rendue EN ENTIER à chaque rendu — pour les réglages
 * par `ChampsCachesQuiz`, pour la dotation par un envoi unique construit depuis
 * le même état. Il n'existe alors aucun chemin par lequel un champ manque.
 *
 * ── « CE QU'ON GAGNE » ET « LE LOT » SONT DEUX VUES, PAS DEUX ENVOIS ──
 *
 * C'est la nuance qui fait tenir la découpe. `updateQuizReward` reste
 * INDIVISIBLE : ses sept champs partent toujours ensemble, en un seul appel,
 * depuis un seul état. Ce qui est découpé, c'est ce qu'on REGARDE — le mode et
 * son seuil d'un côté, le lot et son stock de l'autre — jamais ce qu'on POSTE.
 * Un commerçant qui règle le stock enverra donc aussi le mode, sans le savoir
 * et sans le perdre.
 *
 * ── LA DÉCOUPE SUIT CE QUE LE COMMERÇANT CHERCHE ──
 *
 * « Le nom », « L'habillage », « Les questions », « Le lot » sont ce qu'il vient
 * régler. Un découpage par action serveur — updateQuiz, puis updateQuizReward,
 * puis updateQuizShareInvite — aurait été plus simple à écrire et illisible :
 * personne ne cherche « la charge utile d'updateQuiz », on cherche « mon lot ».
 *
 * L'ORDRE, LUI, SUIT LA PRÉPARATION : on nomme, on habille, on écrit les
 * questions, on règle le détail de l'une d'elles, puis seulement on décide ce
 * qu'on donne — un lot n'a pas de sens avant de savoir ce qu'on demande.
 */
import {
  type DeclarationEtape,
  libelleEtape,
  parseEtape,
} from "@/components/studio/etapes";

export const ETAPES_STUDIO_QUIZ = [
  {
    cle: "nom",
    titre: "Le nom et l'adresse",
    resume: "Comment votre quiz s'appelle, et à quelle adresse vos clients le trouvent.",
  },
  {
    cle: "allure",
    titre: "L'habillage",
    resume: "Le thème, les couleurs et la consigne d'accueil de la page.",
  },
  {
    cle: "questions",
    titre: "Les questions",
    resume: "Ce que vos clients auront à trouver, et dans quel ordre.",
  },
  {
    cle: "question",
    titre: "Le détail d'une question",
    resume: "Le chronomètre, les points, l'image et la tolérance d'une question.",
  },
  {
    cle: "gain",
    titre: "Ce qu'on gagne",
    resume: "À quelle condition le lot est remis : un seuil, un tirage, un classement.",
  },
  {
    cle: "lot",
    titre: "Le lot et son stock",
    resume: "Ce que le joueur reçoit, en quelle quantité, et jusqu'à quand.",
  },
  {
    cle: "partage",
    titre: "Le partage par le joueur",
    resume: "Proposer à vos clients de défier un proche et de partager leur score.",
  },
  {
    cle: "verification",
    titre: "On vérifie et on ouvre",
    resume: "Ce qu'il reste à faire avant d'ouvrir aux joueurs.",
  },
] as const;

export type EtapeStudioQuiz = (typeof ETAPES_STUDIO_QUIZ)[number]["cle"];

/**
 * Les deux fonctions ci-dessous ne font que NOMMER leur liste : le libellé
 * accessible et le repli vivent au socle (`@/components/studio/etapes`). Elles
 * restent exportées d'ici parce que c'est ce nom-là que les gardes cherchent —
 * un libellé recopié dans un test divergerait au premier renommage, et la garde
 * chercherait un bouton qui n'existe plus.
 */
export function parseEtapeStudioQuiz(
  brut: string | null | undefined,
): EtapeStudioQuiz {
  return parseEtape(ETAPES_STUDIO_QUIZ, brut);
}

export function libelleEtapeStudioQuiz(cle: EtapeStudioQuiz): string {
  return libelleEtape(ETAPES_STUDIO_QUIZ, cle);
}

/** La liste satisfait le contrat du socle — vérifié à la compilation. */
const _contrat: readonly DeclarationEtape<EtapeStudioQuiz>[] = ETAPES_STUDIO_QUIZ;
void _contrat;
