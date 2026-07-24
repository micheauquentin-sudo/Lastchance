/**
 * Catalogue d'INTERFACE des modèles d'événement (`contests.event_kind`).
 *
 * La base ne contraint que la FORME de la clé (voir EVENT_KIND_PATTERN :
 * minuscules, chiffres et UNDERSCORES — jamais de tiret) : ajouter un
 * modèle ici ne demande aucune migration. Le football n'est qu'un modèle
 * parmi d'autres — le seul à porter un catalogue de compétitions et une
 * synchro de calendrier ; tous les autres composent leurs questions.
 *
 * Un modèle ne PRÉ-REMPLIT jamais la base : `suggestedQuestions` sont des
 * BROUILLONS qui remplissent le formulaire d'ajout (le commerçant complète
 * et valide), `suggestedScoring` des valeurs conseillées posées dans
 * l'éditeur de barème tant qu'aucune valeur propre n'a été enregistrée.
 */

import type {
  ContestQuestionType,
  ContestScoring,
  GenericQuestionType,
} from "@/lib/pronostics";

/** Brouillon de question proposé par un modèle (jamais écrit en base). */
export interface SuggestedQuestion {
  questionType: ContestQuestionType;
  prompt: string;
  /** Nombre de places à classer (questions `ranking` uniquement). */
  rankingSize?: number;
  /**
   * AIDE À LA SAISIE : textes d'exemple affichés en `placeholder` des
   * champs de proposition. Ce ne sont JAMAIS des options réelles — le
   * commerçant saisit ses propres candidats, pays, plats ou équipes.
   */
  optionsPlaceholder?: string[];
}

/** Brouillon saisissable dans le constructeur (le type `score` exclu). */
export interface GenericSuggestedQuestion extends SuggestedQuestion {
  questionType: GenericQuestionType;
}

export interface EventKindOption {
  key: string;
  label: string;
  icon: string;
  /** Description courte : ce que le commerçant comprend en une ligne. */
  hint: string;
  /** Le catalogue de compétitions n'existe que pour le football. */
  usesCompetition: boolean;
  /** Brouillons de questions cohérents avec le modèle (1 à 3). */
  suggestedQuestions?: SuggestedQuestion[];
  /** Barème conseillé — clés miroir de `contests.scoring`. */
  suggestedScoring?: Partial<ContestScoring>;
}

export const EVENT_KINDS: EventKindOption[] = [
  {
    key: "football",
    label: "Football",
    icon: "⚽",
    hint: "Matchs à pronostiquer sur le score, calendrier officiel importé automatiquement.",
    usesCompetition: true,
  },
  {
    key: "ceremony",
    label: "Cérémonie",
    icon: "🏆",
    hint: "Les résultats d'une cérémonie : vos clients parient sur les lauréats.",
    usesCompetition: false,
    suggestedQuestions: [
      {
        questionType: "choice",
        prompt: "Qui remporte le prix principal ?",
        optionsPlaceholder: ["1er nommé", "2e nommé", "3e nommé"],
      },
      {
        questionType: "choice",
        prompt: "Qui remporte la catégorie révélation ?",
        optionsPlaceholder: ["1er nommé", "2e nommé", "3e nommé"],
      },
    ],
    suggestedScoring: { choice: 3 },
  },
  {
    key: "eurovision",
    label: "Eurovision",
    icon: "🎤",
    hint: "Soirée Eurovision : le pays vainqueur et le score final.",
    usesCompetition: false,
    suggestedQuestions: [
      {
        questionType: "choice",
        prompt: "Quel pays remporte l'Eurovision ?",
        optionsPlaceholder: ["1er pays", "2e pays", "3e pays"],
      },
      {
        questionType: "number",
        prompt: "Combien de points pour le vainqueur ?",
      },
    ],
    suggestedScoring: {
      choice: 4,
      number_exact: 6,
      number_close: 2,
      number_tolerance: 20,
    },
  },
  {
    key: "election",
    label: "Élection",
    icon: "🗳️",
    hint: "Élection interne ou associative : qui sera élu, et avec quelle participation.",
    usesCompetition: false,
    suggestedQuestions: [
      {
        questionType: "choice",
        prompt: "Qui sera élu ?",
        optionsPlaceholder: ["1er candidat", "2e candidat", "3e candidat"],
      },
      {
        questionType: "number",
        prompt: "Quel taux de participation, en pourcentage ?",
      },
    ],
    suggestedScoring: {
      choice: 3,
      number_exact: 5,
      number_close: 2,
      number_tolerance: 5,
    },
  },
  {
    key: "remise_prix",
    label: "Remise de prix",
    icon: "🎖️",
    hint: "Une remise de prix : vos clients désignent le lauréat avant l'annonce.",
    usesCompetition: false,
    suggestedQuestions: [
      {
        questionType: "choice",
        prompt: "Qui reçoit le prix ?",
        optionsPlaceholder: ["1er nommé", "2e nommé", "3e nommé"],
      },
      {
        questionType: "choice",
        prompt: "Qui reçoit le prix du public ?",
        optionsPlaceholder: ["1er nommé", "2e nommé", "3e nommé"],
      },
    ],
    suggestedScoring: { choice: 3 },
  },
  {
    key: "entreprise",
    label: "Compétition d'entreprise",
    icon: "🏢",
    hint: "Challenge entre équipes ou services : podium final et épreuve reine.",
    usesCompetition: false,
    suggestedQuestions: [
      {
        questionType: "ranking",
        prompt: "Quel sera le podium final ?",
        rankingSize: 3,
        optionsPlaceholder: ["1re équipe", "2e équipe", "3e équipe", "4e équipe"],
      },
      {
        questionType: "choice",
        prompt: "Quelle équipe remporte l'épreuve reine ?",
        optionsPlaceholder: ["1re équipe", "2e équipe", "3e équipe"],
      },
      {
        questionType: "number",
        prompt: "Combien de points pour l'équipe gagnante ?",
      },
    ],
    suggestedScoring: {
      ranking_exact: 6,
      ranking_partial: 2,
      choice: 3,
      number_exact: 4,
      number_close: 1,
      number_tolerance: 5,
    },
  },
  {
    key: "culinaire",
    label: "Concours culinaire",
    icon: "🍽️",
    hint: "Concours de cuisine : le meilleur plat et la note du vainqueur.",
    usesCompetition: false,
    suggestedQuestions: [
      {
        questionType: "choice",
        prompt: "Quel plat remporte le concours ?",
        optionsPlaceholder: ["1er plat", "2e plat", "3e plat"],
      },
      {
        questionType: "ranking",
        prompt: "Quel sera le podium du jury ?",
        rankingSize: 3,
        optionsPlaceholder: ["1er plat", "2e plat", "3e plat", "4e plat"],
      },
      {
        questionType: "number",
        prompt: "Quelle note pour le plat vainqueur, sur 20 ?",
      },
    ],
    suggestedScoring: {
      choice: 3,
      ranking_exact: 6,
      ranking_partial: 2,
      number_exact: 5,
      number_close: 2,
      number_tolerance: 1,
    },
  },
  {
    key: "emission",
    label: "Finale d'une émission",
    icon: "📺",
    hint: "Finale d'une émission TV : le gagnant et l'audience de la soirée.",
    usesCompetition: false,
    suggestedQuestions: [
      {
        questionType: "choice",
        prompt: "Qui remporte la finale ?",
        optionsPlaceholder: ["1er finaliste", "2e finaliste", "3e finaliste"],
      },
      {
        questionType: "number",
        prompt: "Combien de téléspectateurs, en millions ?",
      },
    ],
    suggestedScoring: {
      choice: 3,
      number_exact: 5,
      number_close: 2,
      number_tolerance: 1,
    },
  },
  {
    key: "tournoi",
    label: "Tournoi local",
    icon: "🏓",
    hint: "Tournoi du quartier ou du club : vos clients pronostiquent le classement.",
    usesCompetition: false,
    suggestedQuestions: [
      {
        questionType: "ranking",
        prompt: "Quel sera le podium du tournoi ?",
        rankingSize: 3,
        optionsPlaceholder: [
          "1re équipe",
          "2e équipe",
          "3e équipe",
          "4e équipe",
        ],
      },
      {
        questionType: "choice",
        prompt: "Qui remporte le tournoi ?",
        optionsPlaceholder: ["1re équipe", "2e équipe", "3e équipe"],
      },
    ],
    suggestedScoring: { ranking_exact: 6, ranking_partial: 2, choice: 3 },
  },
  {
    key: "course",
    label: "Course",
    icon: "🏁",
    hint: "Résultat d'une course : l'ordre d'arrivée sur le podium.",
    usesCompetition: false,
    suggestedQuestions: [
      {
        questionType: "ranking",
        prompt: "Quel sera l'ordre d'arrivée du podium ?",
        rankingSize: 3,
        optionsPlaceholder: [
          "1er concurrent",
          "2e concurrent",
          "3e concurrent",
          "4e concurrent",
        ],
      },
      {
        questionType: "choice",
        prompt: "Qui franchit la ligne d'arrivée en premier ?",
        optionsPlaceholder: ["1er concurrent", "2e concurrent", "3e concurrent"],
      },
    ],
    suggestedScoring: { ranking_exact: 6, ranking_partial: 2, choice: 3 },
  },
  {
    key: "esport",
    label: "E-sport",
    icon: "🎮",
    hint: "Événement e-sport : podium de la compétition et format de la finale.",
    usesCompetition: false,
    suggestedQuestions: [
      {
        questionType: "ranking",
        prompt: "Quel sera le podium de la compétition ?",
        rankingSize: 3,
        optionsPlaceholder: ["1re équipe", "2e équipe", "3e équipe", "4e équipe"],
      },
      {
        questionType: "choice",
        prompt: "Quelle équipe soulève le trophée ?",
        optionsPlaceholder: ["1re équipe", "2e équipe", "3e équipe"],
      },
      {
        questionType: "number",
        prompt: "Combien de manches dans la finale ?",
      },
    ],
    suggestedScoring: {
      ranking_exact: 6,
      ranking_partial: 2,
      choice: 3,
      number_exact: 4,
      number_close: 1,
      number_tolerance: 1,
    },
  },
  {
    key: "custom",
    label: "Événement personnalisé",
    icon: "✨",
    hint: "Tout le reste : vous composez librement vos propres questions.",
    usesCompetition: false,
  },
];

/** Modèle par défaut : le football, seul parcours d'origine. */
export const FOOTBALL_EVENT_KIND = "football";

export function getEventKind(key: string): EventKindOption | undefined {
  return EVENT_KINDS.find((kind) => kind.key === key);
}

/** Libellé affichable d'un modèle — repli sur la clé brute (un modèle
 *  posé hors catalogue reste lisible plutôt que d'afficher du vide). */
export function eventKindLabel(key: string): string {
  return getEventKind(key)?.label ?? key;
}

/**
 * Brouillons proposables dans le constructeur de questions : les modèles
 * ne suggèrent que des questions GÉNÉRIQUES (le type `score` reste
 * réservé au football, qui passe par la liste des matchs).
 */
export function suggestedQuestionsFor(key: string): GenericSuggestedQuestion[] {
  return (getEventKind(key)?.suggestedQuestions ?? []).filter(
    (question): question is GenericSuggestedQuestion =>
      question.questionType !== "score",
  );
}
