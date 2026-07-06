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

export interface Organization {
  id: string;
  name: string;
  slug: string;
  stripe_customer_id: string | null;
  subscription_status: SubscriptionStatus;
  plan: string;
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

export interface QrCode {
  id: string;
  organization_id: string;
  campaign_id: string;
  slug: string;
  label: string;
  scan_count: number;
  created_at: string;
}

export interface Participation {
  id: string;
  organization_id: string;
  campaign_id: string;
  wheel_id: string;
  prize_id: string | null;
  first_name: string;
  email: string;
  accepted_terms: boolean;
  marketing_opt_in: boolean;
  redeem_code: string | null;
  redeemed_at: string | null;
  player_key: string;
  created_at: string;
}
