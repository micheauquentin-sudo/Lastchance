import type {
  QuizOption,
  QuizQuestionType,
  QuizRewardMode,
  QuizTheme,
} from "@/lib/quiz";
import type { SpinWheelPrizes } from "./loyalty-settings-presets";

/** Roue de l'organisation ciblable par un tour offert, avec l'état de ses lots. */
export interface QuizWheelOption extends SpinWheelPrizes {
  id: string;
  name: string;
}

export interface DashboardQuiz {
  id: string;
  name: string;
  theme: QuizTheme;
  status: "draft" | "active" | "archived";
  publicSlug: string | null;
  introText: string | null;
  rewardMode: QuizRewardMode;
  rewardThreshold: number | null;
  drawTopN: number | null;
  rewardLabel: string;
  rewardDetails: string | null;
  rewardStock: number;
  rewardClaimedCount: number;
  targetWheelId: string | null;
  /** Tirage différé déjà effectué (colonne RPC-only, jamais remise à pending). */
  drawState: "pending" | "done";
  drawnAt: string | null;
  /** Validité du code QUIZ- émis, en jours (null = sans limite). */
  codeTtlDays: number | null;
  /**
   * Le quiz propose-t-il à ses joueurs de le partager (`quizzes.share_enabled`,
   * `true` par défaut en base) ? Gate « 📣 Défier un ami » et « Partager mon
   * score » côté joueur — jamais le partage du code de retrait.
   */
  shareEnabled: boolean;
}

export interface DashboardQuizQuestion {
  id: string;
  position: number;
  questionType: QuizQuestionType;
  preset: string;
  prompt: string;
  options: QuizOption[];
  /** Résultat officiel (jsonb brut). Côté commerçant : aucun enjeu de fuite. */
  correctAnswer: unknown;
  imageUrl: string | null;
  timeLimitSeconds: number | null;
  points: number;
  tolerance: number | null;
  rankingSize: number | null;
}
