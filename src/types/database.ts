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
export type MemberRole = "owner" | "editor" | "cashier";
export type GameType = "wheel" | "scratch";

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
  /** Relance automatique des clients inactifs activée (cron). */
  auto_reengage: boolean;
  /** Email au propriétaire à chaque gain réclamé (désactivable). */
  notify_on_win: boolean;
  /** Purge auto des participations/désabonnés au-delà de N mois (null = jamais). */
  data_retention_months: number | null;
  /** URL du webhook sortant du commerçant (null = désactivé). */
  webhook_url: string | null;
  /** Secret HMAC signant chaque livraison de webhook. */
  webhook_secret: string;
  /** Fuseau IANA utilisé pour les créneaux et limites de jeu. */
  timezone: string;
  created_at: string;
}

export interface NewsletterSubscriber {
  id: string;
  organization_id: string;
  email: string;
  source: string;
  created_at: string;
  /** Dernière relance automatique — null si jamais relancé (cooldown). */
  last_reengaged_at: string | null;
  /** Désinscription (lien signé dans chaque email) — null si toujours abonné. */
  unsubscribed_at: string | null;
}

export interface NewsletterCampaign {
  id: string;
  organization_id: string;
  subject: string;
  body: string;
  recipient_count: number;
  created_at: string;
}

/** Profil agrégé d'un joueur identifié (RPC org_customer_profiles). */
export interface CustomerProfile {
  email: string;
  first_name: string;
  wins: number;
  redeemed: number;
  first_win: string;
  last_win: string;
}

export interface OrganizationMember {
  organization_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

/** Ligne renvoyée par la RPC org_team_members (email vit dans auth.users). */
export interface TeamMemberRow {
  user_id: string;
  email: string;
  role: MemberRole;
  joined_at: string;
}

export interface TeamInvitation {
  id: string;
  organization_id: string;
  email: string;
  role: MemberRole;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
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
  /** Mécanique de jeu : roue classique ou carte à gratter. */
  game_type: GameType;
  /** Ordre d'affichage / de priorité pour la sélection au jeu. */
  position: number;
  /** Créneau horaire optionnel (heures locales 0..24). null = pas de borne. */
  schedule_start_hour: number | null;
  schedule_end_hour: number | null;
  /** Jours actifs 0=dimanche..6=samedi. null/[] = tous les jours. */
  schedule_days: number[] | null;
  /**
   * Personnalisation visuelle complète (anneau, lumières, segments,
   * moyeu, pointeur, police, fond, bouton). Validée par
   * `wheelStyleSchema` — voir src/lib/wheel-style.ts.
   */
  style: Record<string, unknown>;
  created_at: string;
}

/** Segment de ciblage pour l'envoi d'une newsletter. */
export type NewsletterSegment = "all" | "loyal" | "new" | "inactive";

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

/** Forme des modules du QR. */
export type QrPattern = "square" | "rounded" | "dots" | "diamond";
/** Forme des trois « yeux » (repères de coin). */
export type QrEyeStyle = "square" | "rounded" | "circle" | "leaf";
/** Dégradé appliqué aux modules. */
export type QrGradientType = "none" | "linear" | "radial";
/** Cadre décoratif autour du QR. */
export type QrFrame = "none" | "banner";

/** Personnalisation visuelle d'un QR code (studio QR). */
export interface QrStyle {
  /** Couleur des modules (par défaut #18181b). */
  dark?: string;
  /** Couleur de fond (par défaut #ffffff). */
  light?: string;
  /** Logo centré, data URL PNG normalisée côté client (≈256px). */
  logo?: string | null;
  /** Forme des modules (par défaut carrés). */
  pattern?: QrPattern;
  /** Forme des yeux (par défaut carrés). */
  eyeStyle?: QrEyeStyle;
  /** Couleur des yeux — null : même couleur que les modules. */
  eyeColor?: string | null;
  /** Dégradé des modules (none : couleur unie `dark`). */
  gradientType?: QrGradientType;
  /** Seconde couleur du dégradé. */
  darkTo?: string | null;
  /** Cadre : bannière avec appel à l'action sous le QR. */
  frame?: QrFrame;
  /** Texte de la bannière (ex. « SCANNEZ-MOI »). */
  frameText?: string;
  /** Couleur du cadre/bannière. */
  frameColor?: string;
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
