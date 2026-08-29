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
   * LA PRISE DE RENDEZ-VOUS — sa propre clé depuis RDV-5 (migration
   * 20261107120000, `addon_rendez_vous`).
   *
   * À NE PAS CONFONDRE avec `reserver` juste en dessous, qui garde ce
   * qu'elle a toujours gardé : les MOMENTS — ateliers, dégustations, files
   * d'accueil, invitations, offres de dernière minute. Seul le LIBELLÉ de
   * `reserver` a changé le 2026-08-29 ; sa valeur, écrite dans les octrois
   * déjà posés, n'a pas bougé. Même arbitrage que `event_kind = 'football'`
   * devenu « Sport ».
   *
   * Les deux produits partagent les MÊMES tables : c'est
   * `reservation_activities.booking_mode` qui les sépare, jamais un second
   * schéma.
   */
  | "rendez_vous"
  /**
   * L'agenda Réserver — sa propre clé d'octroi depuis la migration
   * 20261020120000 (`addon_reserver`), au même titre que `duo` et `bande`.
   *
   * Même statut que `vitrine` ci-dessus sur le point qui compte ici : ce n'est
   * pas une expérience jouable, donc rien à chercher dans `ExperienceKind`.
   *
   * CE JOUR EST ARRIVÉ (2026-08-22) : l'offre « Sur Place » et La Totale les
   * vendent toutes les deux, `MODULE_CATALOG` les décrit et
   * `apply_stripe_subscription_event_v2` sait les inscrire
   * (migration 20261021120000). L'encart nomme donc l'offre tout seul, et
   * aucun tarif n'a été recopié ici.
   */
  | "reserver"
  /**
   * Duo Miroir et Portrait de la Bande — les deux jeux de salon, détachés de
   * `vitrine` par la migration 20261020120000 et vendus depuis le 2026-08-22.
   *
   * ── POURQUOI ILS ENTRENT DANS CETTE UNION MAINTENANT ──
   *
   * Ils étaient jusqu'ici des `GrantableModule` sans être des `Entitlement` :
   * le back-office pouvait les accorder, aucune offre ne pouvait les contenir.
   * L'asymétrie tenait tant que le seul chemin était l'octroi manuel ; elle
   * cesse dès qu'un `PLAN_TIERS` les déclare, parce que le webhook fait passer
   * les droits d'une offre par `Entitlement` et par rien d'autre.
   *
   * Ils restent hors d'`ExperienceKind` pour la même raison que leurs deux
   * voisins : un salon de 2 à 12 joueurs n'a ni route publique de campagne, ni
   * adaptateur de récompense — il se joue par code court, depuis un lobby.
   */
  | "duo"
  | "bande";

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
