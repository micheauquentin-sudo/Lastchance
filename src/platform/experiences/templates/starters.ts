import type { ExperienceKind } from "@/platform/experiences/contract";
import type {
  BlueprintAsset,
  BlueprintReward,
} from "@/platform/experiences/templates/contract";

export interface StarterBlueprint {
  kind: ExperienceKind;
  name: string;
  description: string;
  configuration: Record<string, unknown>;
  assets: BlueprintAsset[];
  defaultRewards: BlueprintReward[];
}

export const STARTER_BLUEPRINTS: Partial<Record<ExperienceKind, StarterBlueprint>> = {
  quiz: {
    kind: "quiz",
    name: "Quiz découverte",
    description: "Un quiz court à personnaliser avant activation.",
    configuration: {
      name: "Quiz découverte",
      theme: "neutre",
      intro_text: "Testez vos connaissances.",
      questions: [
        {
          prompt: "Quelle réponse souhaitez-vous mettre en avant ?",
          options: [
            { id: "a", label: "Réponse A" },
            { id: "b", label: "Réponse B" },
          ],
          correct_option_id: "a",
          preset: "multiple_choice",
          points: 1,
        },
      ],
    },
    assets: [],
    defaultRewards: [],
  },
  hunt: {
    kind: "hunt",
    name: "Parcours découverte",
    description: "Deux étapes avec de nouveaux jetons QR à chaque application.",
    configuration: {
      name: "Parcours découverte",
      order_mode: "ordered",
      min_scan_interval_seconds: 0,
      steps: [
        { label: "Première étape", hint_text: "Ajoutez votre indice." },
        { label: "Étape finale", hint_text: "Ajoutez votre indice final." },
      ],
    },
    assets: [],
    defaultRewards: [{ slot: "completion", label: "Lot découverte", stock: 10 }],
  },
  calendar: {
    kind: "calendar",
    name: "Semaine découverte",
    description: "Sept cases déverrouillées jour après jour.",
    configuration: {
      name: "Semaine découverte",
      theme: "neutre",
      start_offset_days: 0,
      merchant_content: "Une surprise par jour.",
      days: Array.from({ length: 7 }, (_, index) => ({
        content_text: `Contenu du jour ${index + 1}`,
        is_special: index === 6,
      })),
    },
    assets: [],
    defaultRewards: [{ slot: "completion", label: "Cadeau fidélité", stock: 10 }],
  },
  loyalty: {
    kind: "loyalty",
    name: "Passeport découverte",
    description: "Un passeport à deux paliers avec secret serveur neuf.",
    configuration: {
      name: "Passeport découverte",
      validation_mode: "staff",
      rotating_period_seconds: 60,
      min_stamp_interval_seconds: 86_400,
      silver_threshold: 5,
      gold_threshold: 10,
      milestones: [
        { visit_count: 5, label: "Avantage argent", stock: 25 },
        { visit_count: 10, label: "Avantage or", stock: 10 },
      ],
    },
    assets: [],
    defaultRewards: [],
  },
  event: {
    kind: "event",
    name: "Animation découverte",
    description: "Un jeu et une session draft avec un code d’accès neuf.",
    configuration: {
      name: "Animation découverte",
      session_label: "Session à préparer",
      questions: [
        {
          type: "poll",
          prompt: "Quelle option préférez-vous ?",
          time_limit_seconds: 20,
          points_base: 0,
          options: [
            { label: "Option A", is_correct: false },
            { label: "Option B", is_correct: false },
          ],
        },
      ],
    },
    assets: [],
    defaultRewards: [],
  },
  pronostics: {
    kind: "pronostics",
    name: "Pronostics découverte",
    description: "Un championnat draft avec un slug neuf.",
    configuration: {
      name: "Pronostics découverte",
      competition_key: "custom",
      event_kind: "football",
      collect_email: true,
      collect_phone: false,
      scoring: { exact: 3, diff: 2, winner: 1 },
      matches: [
        {
          home_name: "Équipe A",
          away_name: "Équipe B",
          kickoff_offset_hours: 168,
        },
      ],
    },
    assets: [],
    defaultRewards: [],
  },
};
