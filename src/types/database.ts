/**
 * Types de la base de données (miroir de supabase/migrations).
 * Régénérables plus tard via `supabase gen types typescript`.
 */

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "inactive";

export type CampaignStatus = "draft" | "active" | "paused" | "archived";
export type PlayLimit = "once" | "daily" | "weekly" | "unlimited";
export type MemberRole = "owner" | "staff";

/** Actions proposées au joueur avant de lancer la roue. */
export type EngagementAction =
  | "newsletter"
  | "instagram"
  | "tiktok"
  | "google_review";

export interface EngagementActionConfig {
  enabled?: boolean;
  /** Lien externe (profil Instagram/TikTok, page d'avis Google). */
  url?: string;
}

/** Configuration org-level : quelles actions sont proposées avant de jouer. */
export type EngagementConfig = Partial<
  Record<EngagementAction, EngagementActionConfig>
>;

export interface Organization {
  id: string;
  name: string;
  slug: string;
  stripe_customer_id: string | null;
  subscription_status: SubscriptionStatus;
  plan: string;
  /** Fin de l'essai gratuit applicatif (7 jours après l'inscription). */
  trial_ends_at: string;
  /** Entrée en impayé (statut past_due), null sinon — borne le délai de grâce. */
  past_due_since: string | null;
  /** Logo affiché sur la page publique /play (Supabase Storage). */
  logo_url: string | null;
  created_at: string;
}

export interface NewsletterSubscriber {
  id: string;
  organization_id: string;
  email: string;
  source: string;
  created_at: string;
}

export interface OrganizationMember {
  organization_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

export interface Campaign {
  id: string;
  organization_id: string;
  name: string;
  status: CampaignStatus;
  starts_at: string | null;
  ends_at: string | null;
  /** Actions proposées au joueur avant de lancer la roue. */
  engagement: EngagementConfig;
  /** Demander l'email du gagnant avant d'afficher le code. */
  collect_email: boolean;
  /** Demander le téléphone du gagnant avant d'afficher le code. */
  collect_phone: boolean;
  /** Compte à rebours (secondes) avant masquage de l'écran du code. null = jamais. */
  code_ttl_seconds: number | null;
  created_at: string;
}

export interface WheelTheme {
  /** Couleur principale (boutons, pointeur). */
  primary?: string;
  /** Couleur secondaire (dégradés). */
  secondary?: string;
}

export interface Wheel {
  id: string;
  organization_id: string;
  campaign_id: string;
  name: string;
  theme: WheelTheme;
  play_limit: PlayLimit;
  /**
   * Personnalisation visuelle complète (anneau, lumières, segments,
   * moyeu, pointeur, police, fond, bouton). Validée par
   * `wheelStyleSchema` — voir src/lib/wheel-style.ts.
   */
  style: Record<string, unknown>;
  created_at: string;
}

export interface Prize {
  id: string;
  organization_id: string;
  wheel_id: string;
  label: string;
  description: string;
  color: string;
  weight: number;
  is_losing: boolean;
  stock: number | null;
  position: number;
  is_active: boolean;
  created_at: string;
}

/** Personnalisation visuelle d'un QR code. */
export interface QrStyle {
  /** Couleur des modules (par défaut #18181b). */
  dark?: string;
  /** Couleur de fond (par défaut #ffffff). */
  light?: string;
  /** Logo centré, data URL PNG normalisée côté client (≈256px). */
  logo?: string | null;
}

export interface QrCode {
  id: string;
  organization_id: string;
  campaign_id: string;
  slug: string;
  label: string;
  scan_count: number;
  /**
   * Configuration de l'affiche personnalisée (éditeur d'affiche).
   * Validée par `posterConfigSchema` — voir src/lib/poster.ts.
   */
  poster: Record<string, unknown>;
  /** Personnalisation du QR lui-même (couleurs + logo). */
  style: QrStyle;
  created_at: string;
}

export interface Participation {
  id: string;
  organization_id: string;
  campaign_id: string;
  wheel_id: string;
  prize_id: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  accepted_terms: boolean;
  marketing_opt_in: boolean;
  redeem_code: string | null;
  redeemed_at: string | null;
  player_key: string;
  created_at: string;
}
