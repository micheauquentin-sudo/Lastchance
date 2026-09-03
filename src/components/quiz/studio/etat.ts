import { codeTtlDaysInitial } from "@/components/dashboard/code-ttl-days-field";
import type {
  DashboardQuiz,
  QuizWheelOption,
} from "@/components/dashboard/quiz-editor";
import type { QuizRewardMode, QuizTheme } from "@/lib/quiz";

/**
 * L'ÉTAT DU STUDIO DU QUIZ — les DOUZE réglages que les deux actions d'écriture
 * du quiz portent, plus rien (VIT-41).
 *
 * ── UN SEUL ÉTAT POUR DEUX ACTIONS, ET CE N'EST PAS UN MÉLANGE ──
 *
 * Le quiz n'a pas UNE action d'écriture mais DEUX, et elles ne se ressemblent
 * pas :
 *
 *  · `updateQuiz(prev, FormData)` — cinq champs plus l'identifiant, postés par
 *    le `<form>` vide de la coquille ;
 *  · `updateQuizReward({ … })` — un OBJET typé, pas une `FormData`, appelé à la
 *    main. Il n'y a aucun formulaire à soumettre, c'est pour ce cas précis
 *    qu'existe `useAutoSaveManuel`.
 *
 * Les deux moitiés vivent néanmoins dans le MÊME état, et c'est délibéré : ce
 * qui protège du champ manquant, c'est qu'aucun contrôle visible ne porte la
 * valeur. Deux états séparés auraient rouvert la question « lequel des deux
 * l'étape courante tient-elle ? » à chaque étape ajoutée.
 *
 * ── LA DOTATION EST INDIVISIBLE, ET LE RESTE ──
 *
 * `updateQuizRewardSchema` porte un `superRefine` qui croise le mode et les
 * champs (miroir des CHECK SQL) : un seuil sans mode « à partir de X », une roue
 * offerte sur un tirage différé, sont REFUSÉS. Les sept champs partent donc
 * toujours ensemble, en un seul appel. « Ce qu'on gagne » et « Le lot » sont
 * deux VUES de cette charge, jamais deux soumissions.
 *
 * ── POURQUOI TOUT EST UNE CHAÎNE ──
 *
 * Même parti pris que le calendrier (VIT-39) et que `CodeTtlDaysField` : la
 * saisie BRUTE voyage telle quelle et se fait valider par le schéma, qui porte
 * déjà tous les messages. Reconstruire un nombre ici transformerait un champ
 * vidé le temps de retaper en un `0` silencieux — un stock à zéro n'émet plus
 * rien, et personne ne relierait la panne à ce choix.
 *
 * ── `code_ttl_days` VIDE EST UNE VALEUR, PAS UNE ABSENCE ──
 *
 * Il vaut « sans limite », et c'est précisément ce que `updateQuiz` distingue
 * par `formData.has()` plutôt que `get()`. Il doit donc être rendu TOUJOURS :
 * champ absent ⇒ colonne intacte, champ présent et vide ⇒ colonne effacée.
 * Confondre les deux fait perdre un réglage sans un mot.
 */
export interface EtatQuiz {
  // ── La charge d'`updateQuiz` ──
  name: string;
  theme: QuizTheme;
  public_slug: string;
  intro_text: string;
  /** Saisie BRUTE en jours ; `""` = sans limite. */
  code_ttl_days: string;

  // ── La charge d'`updateQuizReward` (indivisible) ──
  reward_mode: QuizRewardMode;
  /** Saisie BRUTE, n'a de sens qu'en mode « threshold ». */
  reward_threshold: string;
  /** Saisie BRUTE, n'a de sens qu'en mode « draw ». */
  draw_top_n: string;
  reward_label: string;
  reward_details: string;
  /** Saisie BRUTE ; le stock est FINI et OBLIGATOIRE (ADR-031). */
  reward_stock: string;
  /** `""` = pas de roue offerte, un lot classique. */
  target_wheel_id: string;
}

/**
 * L'état de départ, lu depuis la ligne. Aucun défaut n'est INVENTÉ ici : tout ce
 * qui est nul devient la chaîne vide, qui est exactement ce que les schémas
 * savent relire comme « rien ». Le studio du produit voisin a payé l'inverse —
 * résoudre les défauts au montage grave en base des décisions que personne n'a
 * prises (VIT-19), et l'enregistrement automatique du socle les enverrait.
 *
 * LA SEULE EXCEPTION EST LA ROUE DISPARUE, et elle est reprise telle quelle de
 * `QuizRewardEditor` : une `target_wheel_id` qui ne figure plus dans les roues
 * de l'organisation ne peut pas être proposée dans le sélecteur (elle n'y a pas
 * d'option), et un `<select>` dont la valeur n'existe pas retombe sur la
 * première option en silence. On repart donc de « pas de roue », et l'écran le
 * dit.
 */
export function etatInitialQuiz(
  quiz: DashboardQuiz,
  roues: QuizWheelOption[],
): EtatQuiz {
  const roueDisparue =
    quiz.targetWheelId !== null && !roues.some((r) => r.id === quiz.targetWheelId);
  return {
    name: quiz.name,
    theme: quiz.theme,
    public_slug: quiz.publicSlug ?? "",
    intro_text: quiz.introText ?? "",
    code_ttl_days: codeTtlDaysInitial(quiz.codeTtlDays),

    reward_mode: quiz.rewardMode,
    reward_threshold:
      quiz.rewardThreshold === null ? "" : String(quiz.rewardThreshold),
    draw_top_n: quiz.drawTopN === null ? "" : String(quiz.drawTopN),
    reward_label: quiz.rewardLabel,
    reward_details: quiz.rewardDetails ?? "",
    reward_stock: String(quiz.rewardStock),
    target_wheel_id: roueDisparue ? "" : (quiz.targetWheelId ?? ""),
  };
}

/** Le mode remet-il un lot au moment même où le joueur termine ? */
export function modeImmediatQuiz(mode: QuizRewardMode): boolean {
  return mode === "threshold" || mode === "instant";
}

/** Le mode attend-il un tirage/classement déclenché par le commerçant ? */
export function modeDiffereQuiz(mode: QuizRewardMode): boolean {
  return mode === "draw" || mode === "ranking";
}

/**
 * LA CHARGE D'`updateQuizReward`, CONSTRUITE À UN SEUL ENDROIT.
 *
 * Chaque mode ne porte QUE ses propres champs : les autres partent VIDES, sinon
 * le `superRefine` (miroir des CHECK SQL) refuse la mise à jour. C'est la règle
 * exacte de `QuizRewardEditor`, reprise ici mot pour mot — et rassemblée dans
 * une fonction pure pour qu'une garde puisse la lire sans monter d'écran.
 */
export function chargeDotationQuiz(
  id: string,
  etat: EtatQuiz,
): {
  id: string;
  rewardMode: QuizRewardMode;
  rewardThreshold: string;
  drawTopN: string;
  rewardLabel: string;
  rewardDetails: string;
  rewardStock: string | number;
  targetWheelId: string;
} {
  const emet = etat.reward_mode !== "none";
  return {
    id,
    rewardMode: etat.reward_mode,
    rewardThreshold: etat.reward_mode === "threshold" ? etat.reward_threshold : "",
    drawTopN: etat.reward_mode === "draw" ? etat.draw_top_n : "",
    rewardLabel: emet ? etat.reward_label : "",
    rewardDetails: emet ? etat.reward_details : "",
    rewardStock: emet ? etat.reward_stock : 0,
    targetWheelId: modeImmediatQuiz(etat.reward_mode) ? etat.target_wheel_id : "",
  };
}
