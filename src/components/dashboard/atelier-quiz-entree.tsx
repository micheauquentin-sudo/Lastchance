import { AtelierEntree } from "@/components/dashboard/atelier-entree";
import {
  ETAPES_QUIZ,
  hrefEtapeQuiz,
  type EtapeQuiz,
} from "@/components/dashboard/atelier-quiz-etapes";

/**
 * LA PORTE DE L'ATELIER DU QUIZ — la déclinaison quiz d'`AtelierEntree`.
 *
 * La page nue ne porte plus les cartes d'édition : sans cette carte, le
 * commerçant qui arrive sur son quiz publié n'aurait AUCUN chemin visible vers
 * la préparation. Le rendu (les étapes en toutes lettres, pas seulement un
 * bouton) est celui, partagé, d'`atelier-entree.tsx` ; ne reste ici que le
 * texte propre au quiz.
 */
export function AtelierEntreeQuiz({ quizId }: { quizId: string }) {
  return (
    <AtelierEntree
      etapes={ETAPES_QUIZ}
      hrefPour={(cle) => hrefEtapeQuiz(quizId, cle as EtapeQuiz)}
      titre="L'atelier du quiz"
      sousTitre="La préparation se fait en quatre étapes. Chacune s'enregistre pour elle-même : vous pouvez vous arrêter et revenir."
    />
  );
}
