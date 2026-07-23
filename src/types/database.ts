/**
 * Types de la base de données (miroir de supabase/migrations).
 *
 * Référence générée : `src/types/database.generated.ts` (snapshot produit par
 * `npm run types:generate`, dérive vérifiée en CI contre les migrations —
 * step « Types TypeScript — dérive schéma vs snapshot » du job
 * database-security). Tout nouveau type ajouté ici doit s'aligner sur ce
 * fichier généré ; les types existants seront migrés vers lui ultérieurement.
 */

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "inactive";

export type CampaignStatus = "draft" | "active" | "paused" | "archived";
/** Motif d'une pause automatique (null : pause manuelle ou campagne active). */
export type CampaignPausedReason = "schedule_end" | "budget_reached";
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
  /** Module Pronostics activé depuis le back-office (option payante). */
  addon_pronostics: boolean;
  /** Module Chasse au trésor multi-QR activé depuis le back-office. */
  addon_hunts: boolean;
  /** Module Passeport de fidélité activé depuis le back-office. */
  addon_loyalty: boolean;
  /** Module Jackpot collectif activé depuis le back-office. */
  addon_jackpot: boolean;
  /** Accès offert (premium sans paiement) accordé depuis le back-office. */
  comp_access: boolean;
  /** Fin de l'accès offert (null = illimité). */
  comp_access_until: string | null;
  /** Motif interne de l'accès offert. */
  comp_access_note: string;
  created_at: string;
}

// ── Module Pronostics ──

export type ContestStatus = "draft" | "active" | "finished";
export type ContestMatchStatus = "scheduled" | "finished";

export interface Contest {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  /** Clé du catalogue de compétitions (src/lib/competitions.ts). */
  competition_key: string;
  status: ContestStatus;
  /** Barème { exact, diff, winner } — lire via parseScoring(). */
  scoring: unknown;
  /** Récompenses par rang [{ from, to, label }] — lire via parseRewards(). */
  rewards: unknown;
  collect_email: boolean;
  collect_phone: boolean;
  /** Dernière synchronisation fournisseur réussie (null : jamais). */
  last_synced_at: string | null;
  /** Erreur de la dernière synchronisation (null : réussie). */
  last_sync_error: string | null;
  /** Question subsidiaire optionnelle (départage des ex æquo). */
  tiebreaker_question: string | null;
  /** Réponse officielle à la question subsidiaire. */
  tiebreaker_answer: number | null;
  /** Clôture des récompenses : classement figé, règlement définitif. */
  finalized_at: string | null;
  created_at: string;
}

export type ContestAwardStatus = "pending" | "delivered" | "cancelled";

export interface ContestAward {
  id: string;
  contest_id: string;
  organization_id: string;
  player_id: string;
  rank: number;
  reward_label: string;
  /** Code de retrait à présenter en caisse (PRONO-XXXXXXXX). */
  code: string;
  status: ContestAwardStatus;
  delivered_at: string | null;
  created_at: string;
}

export interface ContestMatch {
  id: string;
  contest_id: string;
  organization_id: string;
  home_key: string;
  home_name: string;
  home_badge: string;
  home_color: string;
  away_key: string;
  away_name: string;
  away_badge: string;
  away_color: string;
  kickoff_at: string;
  status: ContestMatchStatus;
  /** Score final, prolongations incluses (hors séance de tirs au but). */
  home_score: number | null;
  away_score: number | null;
  /** Fin du match : temps réglementaire, prolongation ou tirs au but. */
  finish_type: ContestFinishType;
  /** Séance de tirs au but — null hors penalties. */
  home_penalties: number | null;
  away_penalties: number | null;
  position: number;
  /** Identifiant du match chez le fournisseur de calendriers (vide = saisie manuelle). */
  external_ref: string;
  created_at: string;
}

export type ContestFinishType = "regular" | "extra_time" | "penalties";

export interface ContestPlayer {
  id: string;
  contest_id: string;
  organization_id: string;
  /** Hash SHA-256 du jeton remis au navigateur à l'inscription. */
  token_hash: string;
  /** Pseudo affiché au classement. */
  first_name: string;
  /** Clé d'avatar cartoon (catalogue applicatif) — vide = défaut. */
  avatar: string;
  email: string | null;
  phone: string | null;
  /** Consentement aux règles et à l'affichage du prénom au classement. */
  accepted_terms: boolean;
  created_at: string;
}

export interface ContestPrediction {
  id: string;
  contest_id: string;
  organization_id: string;
  match_id: string;
  player_id: string;
  home_score: number;
  away_score: number;
  /** Points attribués à la saisie du résultat (null tant que non joué). */
  points: number | null;
  created_at: string;
  updated_at: string;
}

/** Ligue privée d'un championnat de pronostics (écritures via RPC service role). */
export interface ContestLeague {
  id: string;
  organization_id: string;
  contest_id: string;
  name: string;
  /** Code d'invitation (6-8 caractères, alphabet sans I/O/0/1), unique par championnat. */
  code: string;
  /** Joueur créateur (null si son compte a été purgé). */
  created_by: string | null;
  created_at: string;
}

export interface ContestLeagueMember {
  league_id: string;
  player_id: string;
  joined_at: string;
}

// ── Chasse au trésor multi-QR ──

export type HuntStatus = "draft" | "active" | "archived";
export type HuntOrderMode = "free" | "ordered";

/** Chasse au trésor : 2 à 10 étapes QR, lot final avec code de retrait. */
export interface Hunt {
  id: string;
  organization_id: string;
  name: string;
  status: HuntStatus;
  /** Fenêtre de visibilité optionnelle (null = sans borne). */
  starts_at: string | null;
  ends_at: string | null;
  /** Ordre des étapes : libre, ou imposé (position croissante). */
  order_mode: HuntOrderMode;
  /** Délai minimal entre deux scans d'un même joueur (0 = désactivé). */
  min_scan_interval_seconds: number;
  /** Lot final remis en caisse (pas de roue). */
  reward_label: string;
  reward_details: string | null;
  /** Stock du lot (null = illimité). */
  reward_stock: number | null;
  /** Codes de retrait émis — géré par record_hunt_scan uniquement. */
  reward_claimed_count: number;
  created_at: string;
}

export interface HuntStep {
  id: string;
  hunt_id: string;
  organization_id: string;
  /** Position 1..10, unique par chasse. */
  position: number;
  label: string;
  /** Indice optionnel révélé une fois l'étape tamponnée. */
  hint_text: string | null;
  /** Jeton public non devinable de l'URL du QR (randomCode). */
  token: string;
  created_at: string;
}

export interface HuntPlayer {
  id: string;
  hunt_id: string;
  organization_id: string;
  /** Hash SHA-256 du jeton remis au navigateur (aucune PII). */
  token_hash: string;
  created_at: string;
}

export interface HuntScan {
  id: string;
  hunt_id: string;
  organization_id: string;
  player_id: string;
  step_id: string;
  scanned_at: string;
}

export interface HuntCompletion {
  id: string;
  hunt_id: string;
  organization_id: string;
  player_id: string;
  /** Code de retrait à présenter en caisse (CHASSE-XXXXXXXX). */
  code: string;
  /** Renseignés par le backend au moment du claim (opt-in). */
  email: string | null;
  marketing_opt_in: boolean;
  completed_at: string;
  redeemed_at: string | null;
  redeemed_by: string | null;
}

/** Réponse jsonb de la RPC record_hunt_scan. */
export type HuntScanState =
  | "unavailable"
  | "too_soon"
  | "wrong_order"
  | "scanned"
  | "already"
  | "completed"
  | "hunt_full";

// ── Passeport de fidélité ──

export type LoyaltyProgramStatus = "draft" | "active" | "archived";
/** Mode de validation d'une visite (voir migration loyalty_passport). */
export type LoyaltyValidationMode = "rotating_code" | "staff";
/** Nature d'un palier : lot direct (code FIDELITE-…) ou tour de roue offert. */
export type LoyaltyRewardType = "spin" | "lot";
/** Niveau du passeport, calqué sur visit_count (bronze = départ). */
export type LoyaltyTier = "bronze" | "silver" | "gold";

/** Programme de fidélité : cumul de visites, paliers, niveaux. */
export interface LoyaltyProgram {
  id: string;
  organization_id: string;
  name: string;
  status: LoyaltyProgramStatus;
  validation_mode: LoyaltyValidationMode;
  /**
   * Secret du code tournant (bytea → hex string) — SERVEUR UNIQUEMENT :
   * jamais lisible par une session marchande (grant de colonne exclu) ni
   * exposé au client. Rempli par le trigger loyalty_programs_set_secret.
   */
  rotating_secret: string | null;
  /** Période de rotation du code tournant (secondes, 15..3600). */
  rotating_period_seconds: number;
  /** Cooldown anti-abus entre deux tampons d'un même passeport (0 = off). */
  min_stamp_interval_seconds: number;
  /** Seuil de visites du niveau argent. */
  silver_threshold: number;
  /** Seuil de visites du niveau or. */
  gold_threshold: number;
  created_at: string;
}

/** Palier d'un programme : à N visites, un lot ou un tour de roue offert. */
export interface LoyaltyMilestone {
  id: string;
  program_id: string;
  organization_id: string;
  /** Nombre de visites déclenchant le palier (unique par programme). */
  visit_count: number;
  reward_type: LoyaltyRewardType;
  /** reward_type='lot' : lot remis en caisse (code FIDELITE-…). */
  reward_label: string;
  reward_details: string | null;
  /**
   * Stock du lot. OBLIGATOIRE et FINI sur un palier `lot` (>= 0 ; 0 = épuisé /
   * en pause), toujours null sur un palier `spin` — CHECK
   * loyalty_milestones_reward_stock_check (20260725190000). Le type reste
   * nullable pour couvrir les deux cas : « illimité » n'existe plus.
   */
  reward_stock: number | null;
  /** Codes de lot émis — géré par record_loyalty_stamp uniquement. */
  reward_claimed_count: number;
  /** reward_type='spin' : roue cible du tour offert (même organisation). */
  target_wheel_id: string | null;
  position: number;
  created_at: string;
}

/** Passeport d'un client (cookie HTTP-only, aucune PII à la création). */
export interface LoyaltyMember {
  id: string;
  program_id: string;
  organization_id: string;
  /** Hash SHA-256 du jeton remis au navigateur. */
  token_hash: string;
  visit_count: number;
  /** Niveau dérivé, rafraîchi par record_loyalty_stamp à chaque tampon. */
  tier: LoyaltyTier;
  last_stamp_at: string | null;
  created_at: string;
}

/** Journal des visites validées (anti-double via cooldown dans la RPC). */
export interface LoyaltyStamp {
  id: string;
  member_id: string;
  program_id: string;
  organization_id: string;
  stamped_at: string;
  /** Mode ayant validé la visite. */
  mode: LoyaltyValidationMode;
  /** Staff : user_id du membre ayant validé (null en mode rotating_code). */
  validated_by: string | null;
}

/** Palier gagné : lot (code FIDELITE-…) ou spin offert (grant à usage unique). */
export interface LoyaltyReward {
  id: string;
  member_id: string;
  program_id: string;
  organization_id: string;
  milestone_id: string;
  reward_type: LoyaltyRewardType;
  earned_at: string;
  /** reward_type='lot' : code de retrait présenté en caisse (FIDELITE-XXXXXXXX). */
  code: string | null;
  redeemed_at: string | null;
  redeemed_by: string | null;
  /** reward_type='spin' : jeton de spin offert à usage unique (48 hex). */
  grant_token: string | null;
  /** Consommation du grant de spin (null tant que non joué). */
  consumed_at: string | null;
  /** Spin produit par la consommation du grant (flux de gain normal). */
  resulting_spin_id: string | null;
}

/** Réponse jsonb de la RPC record_loyalty_stamp. */
export type LoyaltyStampState =
  | "unavailable"
  | "invalid_code"
  | "too_soon"
  | "stamped";

/** Réponse jsonb de la RPC consume_loyalty_spin_grant. */
export type LoyaltySpinGrantState =
  | "unavailable"
  | "already_consumed"
  | "no_prize"
  | "spun";

// ── Jackpot collectif ──

export type JackpotCampaignStatus = "draft" | "active" | "archived";
/** Mode de validation d'une participation (miroir loyalty). */
export type JackpotValidationMode = "rotating_code" | "staff";
/** Mode de résolution du jackpot (voir migration jackpot_collective). */
export type JackpotDrawMode = "threshold_draw" | "rescan_win" | "date_draw";

/** Campagne de jackpot collectif : jauge PARTAGÉE, lot unique fini. */
export interface JackpotCampaign {
  id: string;
  organization_id: string;
  name: string;
  status: JackpotCampaignStatus;
  /** URL publique suivable (null = la page cible l'id). */
  public_slug: string | null;
  validation_mode: JackpotValidationMode;
  /**
   * Secret du code tournant (bytea → hex string) — SERVEUR UNIQUEMENT :
   * jamais lisible par une session marchande (grant de colonne exclu). Rempli
   * par le trigger jackpot_campaigns_set_secret.
   */
  rotating_secret: string | null;
  /** Période de rotation du code tournant (secondes, 15..300). */
  rotating_period_seconds: number;
  /** Cooldown anti-abus entre deux participations d'un même joueur. */
  min_participation_interval_seconds: number;
  draw_mode: JackpotDrawMode;
  /** Objectif de jauge : déclencheur (threshold/rescan) ou affichage (date). */
  threshold: number;
  /** rescan_win : probabilité de gain instantané (null = défaut 1/threshold). */
  win_probability: number | null;
  /** date_draw : instant du tirage. */
  draw_at: string | null;
  /** Lot unique remis en caisse (code JACKPOT-…). */
  reward_label: string;
  reward_details: string | null;
  /** Stock FINI et OBLIGATOIRE (ADR-031) : gagnants/cycles autorisés (>= 0). */
  reward_stock: number;
  /** Lots émis — géré par les RPC de tirage uniquement. */
  reward_claimed_count: number;
  /** Jackpot croissant (affichage) : montant = base + count · increment. */
  display_base_cents: number;
  display_increment_cents: number;
  /** Contenu marchand affiché sur la page publique (offres, soirées…). */
  merchant_content: string | null;
  /** Jauge PARTAGÉE dénormalisée du cycle courant — géré par les RPC. */
  current_count: number;
  /** Numéro de cycle courant — géré par les RPC. */
  cycle: number;
  created_at: string;
}

/** Identité d'un joueur d'une campagne (cookie HTTP-only, aucune PII). */
export interface JackpotPlayer {
  id: string;
  campaign_id: string;
  organization_id: string;
  /** Hash SHA-256 du jeton remis au navigateur. */
  token_hash: string;
  participation_count: number;
  /** Dernière participation — borne le cooldown. */
  last_participation_at: string | null;
  created_at: string;
}

/** Entrée du tirage : une par participation (revenir = plus de chances). */
export interface JackpotParticipant {
  id: string;
  campaign_id: string;
  organization_id: string;
  /** Hash du joueur (dénormalisé pour le tirage). */
  player_token_hash: string;
  /** Cycle auquel appartient l'entrée. */
  cycle: number;
  created_at: string;
}

/** Gain d'un cycle : un seul gagnant par (campaign_id, cycle). */
export interface JackpotWin {
  id: string;
  campaign_id: string;
  organization_id: string;
  cycle: number;
  /** Hash du jeton du gagnant. */
  winner_token_hash: string;
  /** Code de retrait présenté en caisse (JACKPOT-XXXXXXXX). */
  code: string;
  drawn_at: string;
  /** Source crypto journalisée (hex) — rend le tirage vérifiable. */
  draw_seed: string;
  redeemed_at: string | null;
  redeemed_by: string | null;
}

/** Réponse jsonb de la RPC record_jackpot_participation. */
export type JackpotParticipationState =
  | "unavailable"
  | "invalid_code"
  | "too_soon"
  | "recorded";

// ── Automatisations commerçant ──

export type AutomationScenario =
  | "won_not_redeemed"
  | "inactive"
  | "post_redemption"
  | "birthday";

/** Activation et réglages d'un scénario d'email automatique (par org). */
export interface AutomationSetting {
  organization_id: string;
  scenario: AutomationScenario;
  enabled: boolean;
  /** Réglages libres du scénario (délais, textes…) — validés côté app. */
  config: Record<string, unknown>;
  updated_at: string;
}

/** Journal anti-doublon des emails de scénario (écrit par le worker). */
export interface EmailLogEntry {
  id: string;
  organization_id: string;
  scenario: string;
  recipient: string;
  participation_id: string | null;
  /** Clé d'unicité de l'envoi (ex. 'wnr:{participationId}'). */
  dedup_key: string;
  sent_at: string;
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
  /**
   * Anniversaire (YYYY-MM-DD) — présent UNIQUEMENT si le consentement
   * « anniversaire » explicite a été recueilli (case dédiée côté UI).
   * Effacé avec la ligne (suppression owner ou purge RGPD).
   */
  birth_date: string | null;
}

export interface NewsletterCampaign {
  id: string;
  organization_id: string;
  subject: string;
  body: string;
  /** Abonnés ciblés au dépôt (sent_count = réellement envoyés). */
  recipient_count: number;
  sent_count: number | null;
  segment: "all" | "loyal" | "new" | "inactive";
  /** Cycle de vie via la file de travaux (table jobs). */
  status: "queued" | "sending" | "completed" | "partial" | "failed";
  completed_at: string | null;
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
  /** Programmation automatique : run_campaign_schedule() suit starts_at/ends_at. */
  auto_schedule: boolean;
  /** Plafond de dépense en centimes (somme des cost_cents des lots réclamés). null = sans plafond. */
  budget_cents: number | null;
  /** Dépense imputée à chaque gain réclamé (claim_winning_spin, atomique). */
  budget_spent_cents: number;
  /** Pourquoi la campagne est en pause automatique — effacé au retour en active (trigger). */
  paused_reason: CampaignPausedReason | null;
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
  /** Seuil d'alerte stock faible (null : pas d'alerte). */
  low_stock_threshold: number | null;
  /** Épisode d'alerte en cours (null : alerte armée) — géré par trigger. */
  low_stock_notified_at: string | null;
  /** Coût réel du lot en centimes (ROI) — null si non renseigné. */
  cost_cents: number | null;
  /** Valeur commerciale du lot en centimes — null si non renseignée. */
  value_cents: number | null;
  position: number;
  is_active: boolean;
  created_at: string;
}

/** Forme des modules du QR (fluid/lines/classy : formes connectées,
 *  dessinées en fonction des modules voisins). */
export type QrPattern =
  | "square"
  | "rounded"
  | "dots"
  | "diamond"
  | "fluid"
  | "lines-h"
  | "lines-v"
  | "classy";
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
  /** Taille du logo, fraction de la largeur du QR (0.12–0.32, déf. 0.22). */
  logoScale?: number;
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
  /** Échéance SERVEUR du code de retrait (vérifiée par la RPC). */
  redeem_expires_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  /** Panier saisi en caisse au retrait, en centimes (facultatif). */
  basket_cents: number | null;
  player_key: string;
  created_at: string;
}
