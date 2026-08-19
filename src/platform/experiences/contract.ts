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
  | "referral"
  /**
   * Vitrine & Réserver — UN droit pour TROIS capacités serveur : publier la
   * Vitrine, le CRM léger, l'agenda Réserver (lot L2, migration 20261001120000).
   *
   * Volontairement ABSENT d'`ExperienceKind` et d'`EXPERIENCE_CATALOG` : ce
   * n'est pas une expérience jouable — pas de route publique, pas d'adaptateur
   * d'analytique, pas de récompense. Les gardes qui exigent qu'un droit soit
   * vendu par une offre (`plans.test.ts`) dérivent leur liste du CATALOGUE et
   * non de cette union : `vitrine` n'y figure donc pas, et c'est ce qui la rend
   * non achetable tant qu'aucun produit Stripe n'existe.
   */
  | "vitrine";

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
