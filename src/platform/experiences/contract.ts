import type { ZodType } from "zod";

export type ExperienceKind =
  | "campaign"
  | "pronostics"
  | "hunt"
  | "loyalty"
  | "jackpot"
  | "event"
  | "calendar"
  | "quiz"
  | "referral";

export type Entitlement =
  | "core"
  | "pronostics"
  | "hunts"
  | "loyalty"
  | "jackpot"
  | "events"
  | "calendar"
  | "quiz"
  | "referral";

export interface Experience {
  id: string;
  kind: ExperienceKind;
  status: "draft" | "active" | "archived";
}

export interface ValidationResult {
  valid: boolean;
  issues: Array<{ path: string; message: string }>;
}

export interface AnalyticsAdapter {
  kind: ExperienceKind;
  dimensions(experience: Experience): Record<string, string | number | boolean>;
}

export interface RewardAdapter {
  sourceType: string;
  experienceId(experience: Experience): string;
}

/**
 * Contrat d'intégration d'une expérience. Les modules historiques sont migrés
 * progressivement vers ce port : le registre commun peut les découvrir sans
 * importer leurs actions serveur monolithiques.
 */
export interface ExperienceDefinition<TDraft, TTemplate> {
  kind: ExperienceKind;
  entitlement: Entitlement;
  createDraft(): Promise<TDraft>;
  validatePublication(experience: Experience): Promise<ValidationResult>;
  publicRoute: string;
  analyticsAdapter: AnalyticsAdapter;
  rewardAdapter?: RewardAdapter;
  templateSchema: ZodType<TTemplate>;
}
