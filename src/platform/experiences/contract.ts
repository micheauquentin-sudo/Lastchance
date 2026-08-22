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
   * La Vitrine — publier la carte du commerce et le CRM léger (lot L2,
   * migration 20261001120000).
   *
   * Elle a couvert un temps une TROISIÈME capacité, l'agenda Réserver ; la
   * migration 20261020120000 a détaché celui-ci sur sa propre clé, juste
   * en dessous. Un droit unique ne pouvait pas nommer le bon produit dans un
   * encart d'offre dès lors que les deux se vendent séparément.
   *
   * Volontairement ABSENTE d'`ExperienceKind` et d'`EXPERIENCE_CATALOG` : ce
   * n'est pas une expérience jouable — pas de route publique, pas d'adaptateur
   * d'analytique, pas de récompense. Les gardes qui exigent qu'un droit soit
   * vendu par une offre (`plans.test.ts`) dérivent leur liste du CATALOGUE et
   * non de cette union : `vitrine` n'y figure donc pas, et c'est ce qui la rend
   * non achetable tant qu'aucun produit Stripe n'existe.
   */
  | "vitrine"
  /**
   * L'agenda Réserver — sa propre clé d'octroi depuis la migration
   * 20261020120000 (`addon_reserver`), au même titre que `duo` et `bande`.
   *
   * Même statut que `vitrine` ci-dessus sur les deux points qui comptent ici :
   * pas une expérience jouable, et AUCUNE offre du catalogue ne la vend — les
   * écrans Réserver affichent donc « Option à activer sur votre abonnement »
   * plutôt qu'un prix. Le jour où un produit Stripe existe, il s'ajoute à
   * `PLAN_TIERS` et l'encart nomme l'offre tout seul. Ne rien inscrire ici
   * en attendant : un tarif recopié serait une seconde source de vérité.
   */
  | "reserver";

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
