/**
 * Les 9 MODÈLES de question du Créateur de quiz (`preset`) et ce qu'ils changent
 * dans le formulaire du commerçant comme dans le rendu joueur.
 *
 * ARCHITECTURE — deux étages, à ne pas confondre :
 *  · `question_type` (4 valeurs : choice / number / ranking / text) est LE MOTEUR :
 *    c'est lui qui décide de la forme de la réponse, de sa validation et de son
 *    évaluation EN BASE ;
 *  · `preset` n'est qu'un MODÈLE D'INTERFACE posé au-dessus. Le moteur l'ignore
 *    totalement (CHECK de FORME seule côté SQL : `^[a-z][a-z0-9_]{1,39}$`) :
 *    ajouter un 8e modèle ne demande NI migration NI changement de server action —
 *    seulement une entrée dans la table ci-dessous.
 *
 * Le CHRONOMÈTRE (`time_limit_seconds`) est une option TRANSVERSALE : tous les
 * modèles peuvent la porter. Le modèle `timed` ne fait que la rendre obligatoire.
 *
 * Cœur PUR (aucun import réseau ni server-only), partagé par l'éditeur et le
 * parcours joueur — miroir de contest-event-kinds.ts.
 */

import type { QuizQuestionType } from "@/lib/quiz";

export interface QuizPresetInfo {
  key: string;
  label: string;
  /** Emoji décoratif (jamais seul porteur d'information). */
  icon: string;
  /** À quoi sert ce modèle, en une phrase de commerçant. */
  hint: string;
  /**
   * Formes de réponse compatibles. La PREMIÈRE est celle que le modèle propose
   * par défaut ; un modèle à plusieurs entrées laisse le choix au commerçant
   * (`mystery_image` : choix d'options OU réponse libre ; `timed` : les quatre).
   */
  types: readonly QuizQuestionType[];
  /** Options IMPOSÉES par le modèle (Vrai / Faux) : ni ajout ni suppression. */
  fixedOptions: readonly string[] | null;
  /** Le média est le cœur du modèle : le champ image est mis en avant et exigé. */
  requiresImage: boolean;
  /** Le chronomètre est le cœur du modèle : case cochée et verrouillée. */
  requiresTimer: boolean;
  /** Secondes proposées à l'activation du chronomètre. */
  suggestedTimeLimit: number;
  promptPlaceholder: string;
  /**
   * Ce modèle N'A PAS de bonne réponse (sondage d'opinion, pronostic de
   * soirée). Conséquences, toutes portées par ce seul drapeau :
   *  · le commerçant ne saisit aucun résultat officiel — le formulaire retient
   *    la première proposition, exigence de FORME de `correct_answer` (colonne
   *    `not null`), jamais une vérité ;
   *  · la question vaut 0 point : sans quoi le classement récompenserait
   *    d'avoir cliqué, pas d'avoir su ;
   *  · le joueur ne voit ni ✓ ni ✕ ni « la bonne réponse était » — seulement
   *    l'accusé de réception de son avis.
   *
   * Rien de tout cela n'a demandé de migration : `preset` est contraint en
   * FORME seulement côté SQL, et `points` accepte déjà 0.
   */
  sansVerite: boolean;
}

const PRESETS: readonly QuizPresetInfo[] = [
  {
    key: "multiple_choice",
    label: "Choix multiple",
    icon: "🎯",
    hint: "Une seule bonne réponse parmi vos propositions.",
    types: ["choice"],
    fixedOptions: null,
    requiresImage: false,
    requiresTimer: false,
    sansVerite: false,
    suggestedTimeLimit: 30,
    promptPlaceholder: "Ex : Quel fromage entre dans notre tartiflette ?",
  },
  {
    key: "true_false",
    label: "Vrai ou faux",
    icon: "✅",
    hint: "Une affirmation, deux boutons. Les options sont posées pour vous.",
    types: ["choice"],
    fixedOptions: ["Vrai", "Faux"],
    requiresImage: false,
    requiresTimer: false,
    sansVerite: false,
    suggestedTimeLimit: 15,
    promptPlaceholder: "Ex : Notre pain est pétri sur place chaque matin.",
  },
  {
    key: "mystery_image",
    label: "Image mystère",
    icon: "🖼️",
    hint: "On montre une photo, le joueur devine. Au choix d'options ou en réponse libre.",
    types: ["choice", "text"],
    fixedOptions: null,
    requiresImage: true,
    requiresTimer: false,
    sansVerite: false,
    suggestedTimeLimit: 30,
    promptPlaceholder: "Ex : Quel ingrédient est photographié ?",
  },
  {
    key: "estimate",
    label: "Estimation chiffrée",
    icon: "🔢",
    hint: "Un nombre à deviner, avec une marge d'erreur acceptée si vous le voulez.",
    types: ["number"],
    fixedOptions: null,
    requiresImage: false,
    requiresTimer: false,
    sansVerite: false,
    suggestedTimeLimit: 45,
    promptPlaceholder: "Ex : Combien de cépages dans cet assemblage ?",
  },
  {
    key: "timed",
    label: "Question chronométrée",
    icon: "⏱️",
    hint: "N'importe quelle forme de réponse, mais contre la montre.",
    types: ["choice", "number", "ranking", "text"],
    fixedOptions: null,
    requiresImage: false,
    requiresTimer: true,
    sansVerite: false,
    suggestedTimeLimit: 20,
    promptPlaceholder: "Ex : Citez notre plat signature — vite !",
  },
  {
    key: "ranking",
    label: "Classement",
    icon: "🥇",
    hint: "L'ordre exact d'un top N parmi vos propositions.",
    types: ["ranking"],
    fixedOptions: null,
    requiresImage: false,
    requiresTimer: false,
    sansVerite: false,
    suggestedTimeLimit: 60,
    promptPlaceholder: "Ex : Classez ces trois vins du plus sec au plus doux.",
  },
  {
    key: "free_prediction",
    label: "Réponse libre",
    icon: "✍️",
    hint: "Le joueur écrit ; vous listez les formulations acceptées.",
    types: ["text"],
    fixedOptions: null,
    requiresImage: false,
    requiresTimer: false,
    sansVerite: false,
    suggestedTimeLimit: 45,
    promptPlaceholder: "Ex : Comment s'appelle notre chef ?",
  },
  {
    key: "sondage",
    label: "Sondage",
    icon: "📊",
    hint: "Un avis, pas une colle : aucune bonne réponse, aucun point, aucune correction.",
    types: ["choice"],
    fixedOptions: null,
    requiresImage: false,
    requiresTimer: false,
    sansVerite: true,
    suggestedTimeLimit: 20,
    promptPlaceholder: "Ex : Sucré ou salé au petit-déjeuner ?",
  },
  {
    key: "pronostic",
    label: "Pronostic",
    icon: "🔮",
    hint: "Un pari sur ce que personne ne sait encore. Pour un résultat arbitré plus tard, passez par le module Pronostics.",
    types: ["choice"],
    fixedOptions: null,
    requiresImage: false,
    requiresTimer: false,
    sansVerite: true,
    suggestedTimeLimit: 25,
    promptPlaceholder: "Ex : Qui finira premier du classement ce soir ?",
  },
];

/** Modèle de repli : le plus courant, et le seul type qui marche partout. */
const FALLBACK = PRESETS[0];

/** Les 9 modèles, dans l'ordre d'affichage du sélecteur. */
export const QUIZ_PRESET_INFOS: readonly QuizPresetInfo[] = PRESETS;

/**
 * Fiche d'un modèle. Un `preset` inconnu (modèle retiré du catalogue, valeur
 * venue de la base) retombe sur « choix multiple » plutôt que de casser le rendu.
 */
export function quizPresetInfo(preset: string): QuizPresetInfo {
  return PRESETS.find((p) => p.key === preset) ?? FALLBACK;
}

/**
 * Forme de réponse proposée par défaut par un modèle — utilisée quand le
 * commerçant change de modèle et que la forme courante n'est pas compatible.
 */
export function quizPresetDefaultType(preset: string): QuizQuestionType {
  return quizPresetInfo(preset).types[0];
}

/** La forme de réponse est-elle compatible avec ce modèle ? */
export function quizPresetAllowsType(
  preset: string,
  questionType: QuizQuestionType,
): boolean {
  return quizPresetInfo(preset).types.includes(questionType);
}

/**
 * CE QUE LE FORMULAIRE DOIT MONTRER, pour un couple (modèle, forme de réponse).
 * Toute la logique d'adaptation du formulaire du commerçant tient ici : le JSX se
 * contente de lire ces booléens, et cette fonction reste testable sans DOM.
 */
export interface QuizFormShape {
  /** Liste de propositions (choice / ranking). */
  showOptions: boolean;
  /** Les propositions sont figées par le modèle (vrai/faux) : lecture seule. */
  optionsLocked: boolean;
  /** Taille du top attendu (ranking). */
  showRankingSize: boolean;
  /** Écart absolu toléré (number). */
  showTolerance: boolean;
  /** Formulations acceptées (text). */
  showVariants: boolean;
  /** Le champ image est mis en avant (image mystère) plutôt que replié. */
  imageFeatured: boolean;
  /** Le chronomètre est imposé par le modèle : case cochée, non décochable. */
  timerLocked: boolean;
  /** La forme de réponse se choisit (modèle compatible avec plusieurs). */
  typeSelectable: boolean;
  /**
   * Le bloc « Bonne réponse » a-t-il un sens ? Faux pour un sondage et un
   * pronostic : le formulaire retient alors la première proposition, qui ne
   * satisfait que la contrainte `not null` de la colonne.
   */
  showVerite: boolean;
}

export function quizFormShape(
  preset: string,
  questionType: QuizQuestionType,
): QuizFormShape {
  const info = quizPresetInfo(preset);
  const usesOptions = questionType === "choice" || questionType === "ranking";
  return {
    showOptions: usesOptions,
    optionsLocked: usesOptions && info.fixedOptions !== null,
    showRankingSize: questionType === "ranking",
    showTolerance: questionType === "number",
    showVariants: questionType === "text",
    imageFeatured: info.requiresImage,
    timerLocked: info.requiresTimer,
    typeSelectable: info.types.length > 1,
    showVerite: !info.sansVerite,
  };
}

/**
 * Disposition des réponses CÔTÉ JOUEUR. Le moteur ne connaît que 4 formes ; le
 * modèle raffine leur présentation — `true_false` mérite deux gros boutons plutôt
 * qu'une liste de radios, sur un téléphone tenu à une main.
 */
export type QuizAnswerLayout = "duo" | "list" | "ranking" | "number" | "text";

export function quizAnswerLayout(
  preset: string,
  questionType: QuizQuestionType,
  optionCount: number,
): QuizAnswerLayout {
  if (questionType === "ranking") return "ranking";
  if (questionType === "number") return "number";
  if (questionType === "text") return "text";
  // choice : deux options imposées par le modèle → paire de gros boutons.
  return quizPresetInfo(preset).fixedOptions !== null && optionCount === 2
    ? "duo"
    : "list";
}

/** Libellé lisible d'une forme de réponse (badges de l'éditeur). */
export function quizQuestionTypeLabel(questionType: QuizQuestionType): string {
  switch (questionType) {
    case "choice":
      return "Choix d'une option";
    case "number":
      return "Nombre";
    case "ranking":
      return "Classement";
    case "text":
      return "Réponse libre";
  }
}

/**
 * Ce modèle se joue-t-il SANS bonne réponse ? Une seule question à poser, à
 * l'éditeur comme au parcours joueur, plutôt que deux clés à tenir en phase.
 */
export function quizPresetSansVerite(preset: string): boolean {
  return quizPresetInfo(preset).sansVerite;
}
