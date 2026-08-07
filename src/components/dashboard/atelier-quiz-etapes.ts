import {
  definitionEtape,
  hrefEtape,
  type EtapeAtelier,
} from "@/components/dashboard/atelier-etapes";

/**
 * LES QUATRE ÉTAPES DE L'ATELIER DU QUIZ — la déclinaison QUIZ des primitives.
 *
 * Le découpage n'est pas cosmétique : il suit les actions serveur EXISTANTES,
 * une étape = un POST complet de l'une d'elles. `updateQuiz` exige name + theme
 * et EFFACE `intro_text` s'il n'est pas rendu : les trois voyagent donc
 * ensemble dans « Le quiz ». `updateQuizReward` écrit ses sept colonnes en bloc
 * avec un `superRefine` qui croise le mode et les champs : « le mode » et « le
 * lot » ne peuvent PAS devenir deux étapes — d'où une « Dotation » indivisible.
 *
 * L'étape vit dans la query string de `/dashboard/quiz/[id]`, jamais dans une
 * sous-route : c'est ce qui garde valides les quatorze `revalidatePath` de
 * `src/actions/quiz.ts`, qui visent la page nue.
 *
 * L'ABSENCE de `?etape=` n'est pas la première étape : c'est la vue SUIVI (QR,
 * statut, tirage, relance). La page passe donc `parseEtape(…, "nulle")`.
 */
export type EtapeQuiz = "quiz" | "questions" | "dotation" | "verification";

export const ETAPES_QUIZ = [
  {
    cle: "quiz",
    titre: "Le quiz",
    resume: "Le nom, l'habillage, la consigne d'accueil et l'adresse publique.",
  },
  {
    cle: "questions",
    titre: "Les questions",
    resume: "Ce que vos clients auront à trouver, et dans quel ordre.",
  },
  {
    cle: "dotation",
    titre: "La dotation",
    resume: "Ce qu'on gagne, à quelle condition, et en quelle quantité.",
  },
  {
    cle: "verification",
    titre: "La vérification",
    resume: "Ce qu'il reste à faire avant d'ouvrir aux joueurs.",
  },
] as const satisfies readonly EtapeAtelier[];

export function baseAtelierQuiz(quizId: string): string {
  return `/dashboard/quiz/${quizId}`;
}

export function hrefEtapeQuiz(quizId: string, cle: EtapeQuiz): string {
  return hrefEtape(baseAtelierQuiz(quizId), cle);
}

export function definitionEtapeQuiz(cle: EtapeQuiz): EtapeAtelier {
  return definitionEtape(ETAPES_QUIZ, cle) ?? ETAPES_QUIZ[0];
}
