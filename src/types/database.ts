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

export type EngagementActionConfig = {
  enabled?: boolean;
  /** Lien externe (profil Instagram/TikTok, page d'avis Google). */
  url?: string;
}

/** Configuration org-level : quelles actions sont proposées avant de jouer. */
export type EngagementConfig = Partial<
  Record<EngagementAction, EngagementActionConfig>
>;

export type Organization = {
  id: string;
  name: string;
  slug: string;
  stripe_customer_id: string | null;
  subscription_status: SubscriptionStatus;
  plan: string;
  /** Fin de l'essai gratuit applicatif (7 jours après l'inscription). */
  trial_ends_at: string;
  created_at: string;
}

export type NewsletterSubscriber = {
  id: string;
  organization_id: string;
  email: string;
  source: string;
  created_at: string;
}

export type OrganizationMember = {
  organization_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

export type Campaign = {
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

export type WheelTheme = {
  /** Couleur principale (boutons, pointeur). */
  primary?: string;
  /** Couleur secondaire (dégradés). */
  secondary?: string;
}

export type Wheel = {
  id: string;
  organization_id: string;
  campaign_id: string;
  name: string;
  theme: WheelTheme;
  play_limit: PlayLimit;
  created_at: string;
}

export type Prize = {
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

export type QrCode = {
  id: string;
  organization_id: string;
  campaign_id: string;
  slug: string;
  label: string;
  scan_count: number;
  created_at: string;
}

export type Participation = {
  id: string;
  organization_id: string;
  campaign_id: string;
  wheel_id: string;
  prize_id: string | null;
  spin_id: string | null;
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

export type Spin = {
  id: string;
  organization_id: string;
  campaign_id: string;
  wheel_id: string;
  prize_id: string | null;
  is_losing: boolean;
  player_key: string;
  claimed: boolean;
  engagement_action: EngagementAction | null;
  created_at: string;
}

export type StripeEvent = {
  id: string;
  created_at: string;
}

// ────────────────────────────────────────────────────────────
// Schéma typé pour les clients Supabase (createClient<Database>).
// Row = types ci-dessus (alias objets, requis par postgrest-js) ;
// Insert exige les colonnes NOT NULL sans défaut ; Relationships
// permet l'inférence des selects imbriqués
// (ex. `participations.select("prizes(label)")`).
// ────────────────────────────────────────────────────────────

/** Relation N→1 vers organizations (toutes les tables métier en ont une). */
type OrgRel<T extends string> = {
  foreignKeyName: `${T}_organization_id_fkey`;
  columns: ["organization_id"];
  isOneToOne: false;
  referencedRelation: "organizations";
  referencedColumns: ["id"];
};

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: Partial<Organization> & Pick<Organization, "name" | "slug">;
        Update: Partial<Organization>;
        Relationships: [];
      };
      organization_members: {
        Row: OrganizationMember;
        Insert: Partial<OrganizationMember> &
          Pick<OrganizationMember, "organization_id" | "user_id">;
        Update: Partial<OrganizationMember>;
        Relationships: [OrgRel<"organization_members">];
      };
      campaigns: {
        Row: Campaign;
        Insert: Partial<Campaign> &
          Pick<Campaign, "organization_id" | "name">;
        Update: Partial<Campaign>;
        Relationships: [OrgRel<"campaigns">];
      };
      wheels: {
        Row: Wheel;
        Insert: Partial<Wheel> &
          Pick<Wheel, "organization_id" | "campaign_id">;
        Update: Partial<Wheel>;
        Relationships: [
          OrgRel<"wheels">,
          {
            foreignKeyName: "wheels_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: true;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
        ];
      };
      prizes: {
        Row: Prize;
        Insert: Partial<Prize> &
          Pick<Prize, "organization_id" | "wheel_id" | "label">;
        Update: Partial<Prize>;
        Relationships: [
          OrgRel<"prizes">,
          {
            foreignKeyName: "prizes_wheel_id_fkey";
            columns: ["wheel_id"];
            isOneToOne: false;
            referencedRelation: "wheels";
            referencedColumns: ["id"];
          },
        ];
      };
      qr_codes: {
        Row: QrCode;
        Insert: Partial<QrCode> &
          Pick<QrCode, "organization_id" | "campaign_id" | "slug">;
        Update: Partial<QrCode>;
        Relationships: [
          OrgRel<"qr_codes">,
          {
            foreignKeyName: "qr_codes_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
        ];
      };
      participations: {
        Row: Participation;
        Insert: Partial<Participation> &
          Pick<
            Participation,
            "organization_id" | "campaign_id" | "wheel_id" | "accepted_terms" | "player_key"
          >;
        Update: Partial<Participation>;
        Relationships: [
          OrgRel<"participations">,
          {
            foreignKeyName: "participations_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "participations_wheel_id_fkey";
            columns: ["wheel_id"];
            isOneToOne: false;
            referencedRelation: "wheels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "participations_prize_id_fkey";
            columns: ["prize_id"];
            isOneToOne: false;
            referencedRelation: "prizes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "participations_spin_id_fkey";
            columns: ["spin_id"];
            isOneToOne: true;
            referencedRelation: "spins";
            referencedColumns: ["id"];
          },
        ];
      };
      spins: {
        Row: Spin;
        Insert: Partial<Spin> &
          Pick<Spin, "organization_id" | "campaign_id" | "wheel_id" | "player_key">;
        Update: Partial<Spin>;
        Relationships: [
          OrgRel<"spins">,
          {
            foreignKeyName: "spins_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "spins_wheel_id_fkey";
            columns: ["wheel_id"];
            isOneToOne: false;
            referencedRelation: "wheels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "spins_prize_id_fkey";
            columns: ["prize_id"];
            isOneToOne: false;
            referencedRelation: "prizes";
            referencedColumns: ["id"];
          },
        ];
      };
      newsletter_subscribers: {
        Row: NewsletterSubscriber;
        Insert: Partial<NewsletterSubscriber> &
          Pick<NewsletterSubscriber, "organization_id" | "email">;
        Update: Partial<NewsletterSubscriber>;
        Relationships: [OrgRel<"newsletter_subscribers">];
      };
      stripe_events: {
        Row: StripeEvent;
        Insert: Partial<StripeEvent> & Pick<StripeEvent, "id">;
        Update: Partial<StripeEvent>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_campaign_with_defaults: {
        Args: { org_id: string; campaign_name: string };
        Returns: string;
      };
      create_organization: {
        Args: { org_name: string; org_slug: string };
        Returns: string;
      };
      decrement_prize_stock: {
        Args: { p_prize_id: string };
        Returns: boolean;
      };
      increment_qr_scan: {
        Args: { p_slug: string };
        Returns: undefined;
      };
      is_org_member: {
        Args: { org_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
