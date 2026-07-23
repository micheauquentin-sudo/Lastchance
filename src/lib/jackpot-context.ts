import "server-only";

import { cookies } from "next/headers";
import { hashPlayerToken } from "@/lib/pronostics";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasJackpotAccess } from "@/lib/subscription";
import type {
  JackpotCampaign,
  JackpotDrawMode,
  JackpotValidationMode,
  Organization,
} from "@/types/database";

type PublicJackpotOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "logo_url"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_jackpot"
  | "comp_access"
  | "comp_access_until"
  | "timezone"
>;

/**
 * Campagne sans le secret du code tournant (jamais exposé au client) ni la
 * probabilité de gain instantané (odds internes non divulguées).
 */
export type PublicJackpotCampaign = Omit<
  JackpotCampaign,
  "rotating_secret" | "win_probability"
>;

const ORG_COLUMNS =
  "id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_jackpot, comp_access, comp_access_until, timezone";

/** Colonnes publiques de la campagne — rotating_secret / win_probability exclus. */
const CAMPAIGN_COLUMNS =
  "id, organization_id, name, status, public_slug, validation_mode, rotating_period_seconds, min_participation_interval_seconds, draw_mode, threshold, draw_at, reward_label, reward_details, reward_stock, reward_claimed_count, display_base_cents, display_increment_cents, merchant_content, current_count, cycle, created_at";

/** Erreur générique unique : aucun oracle sur l'existence/l'état interne. */
const UNAVAILABLE = "Ce jackpot n'est pas disponible.";

/** UUID canonique (pour distinguer un id d'un public_slug à la résolution). */
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Nom du cookie httpOnly portant le jeton joueur d'une campagne. */
export function jackpotTokenCookieName(campaignId: string): string {
  return `lc-jackpot-${campaignId}`;
}

/** Jauge partagée telle que présentée au joueur (montant d'affichage calculé). */
export interface JackpotGaugeView {
  currentCount: number;
  threshold: number;
  cycle: number;
  drawMode: JackpotDrawMode;
  validationMode: JackpotValidationMode;
  /** date_draw : instant du tirage (null sinon). */
  drawAt: string | null;
  /** Montant d'AFFICHAGE (cosmétique) : base + count · increment. */
  displayAmountCents: number;
  /** Récompense épuisée : plus aucun tirage jusqu'à réapprovisionnement. */
  soldOut: boolean;
}

/** Gain remporté par le joueur courant (un code de retrait par cycle gagné). */
export interface JackpotPlayerWin {
  id: string;
  cycle: number;
  /** Code de retrait JACKPOT-… présenté en caisse. */
  code: string;
  drawnAt: string;
  redeemedAt: string | null;
}

/**
 * État du joueur courant (cookie httpOnly) en LECTURE SEULE : rien n'est écrit
 * au rendu de la page. Aucun cookie/joueur → état vide.
 */
export interface JackpotPlayerState {
  hasIdentity: boolean;
  participationCount: number;
  lastParticipationAt: string | null;
  wins: JackpotPlayerWin[];
}

interface CampaignWithOrg {
  campaign: PublicJackpotCampaign;
  organization: PublicJackpotOrganization;
}

/**
 * Charge une campagne + son organisation via la service role et VÉRIFIE la
 * cohérence inter-tenant (la service role contourne la RLS : chaque relation
 * doit pointer le même tenant). Résolution par id (UUID) ou par public_slug.
 * null si introuvable/incohérent.
 */
async function fetchCampaignWithOrg(
  admin: ReturnType<typeof createAdminClient>,
  campaignIdOrSlug: string,
): Promise<CampaignWithOrg | null> {
  const query = admin
    .from("jackpot_campaigns")
    .select(`${CAMPAIGN_COLUMNS}, organizations(${ORG_COLUMNS})`);
  const { data } = UUID_PATTERN.test(campaignIdOrSlug)
    ? await query.eq("id", campaignIdOrSlug).maybeSingle()
    : await query.eq("public_slug", campaignIdOrSlug.toLowerCase()).maybeSingle();
  if (!data) return null;

  const row = data as unknown as PublicJackpotCampaign & {
    organizations: PublicJackpotOrganization | null;
  };
  const org = row.organizations;
  if (!org || org.id !== row.organization_id) {
    console.error("[jackpot-context] organisation incohérente", { campaignIdOrSlug });
    return null;
  }
  const { organizations: _org, ...campaign } = row;
  void _org;
  return { campaign, organization: org };
}

function toGaugeView(campaign: PublicJackpotCampaign): JackpotGaugeView {
  return {
    currentCount: campaign.current_count,
    threshold: campaign.threshold,
    cycle: campaign.cycle,
    drawMode: campaign.draw_mode,
    validationMode: campaign.validation_mode,
    drawAt: campaign.draw_at,
    displayAmountCents:
      campaign.display_base_cents +
      campaign.current_count * campaign.display_increment_cents,
    soldOut: campaign.reward_claimed_count >= campaign.reward_stock,
  };
}

/**
 * État du joueur courant (cookie httpOnly) en lecture seule : compteur de
 * participations et gains remportés (codes de retrait). Aucun cookie → état
 * vide. Le jeton d'identité ne quitte pas le serveur : seul son hash touche la
 * base (miroir fidélité).
 */
async function loadPlayerState(
  admin: ReturnType<typeof createAdminClient>,
  campaign: PublicJackpotCampaign,
): Promise<JackpotPlayerState> {
  const empty: JackpotPlayerState = {
    hasIdentity: false,
    participationCount: 0,
    lastParticipationAt: null,
    wins: [],
  };

  const store = await cookies();
  const token = store.get(jackpotTokenCookieName(campaign.id))?.value;
  if (!token) return empty;
  const tokenHash = hashPlayerToken(token);

  const [{ data: player }, { data: winRows }] = await Promise.all([
    admin
      .from("jackpot_players")
      .select("participation_count, last_participation_at")
      .eq("campaign_id", campaign.id)
      .eq("token_hash", tokenHash)
      .maybeSingle(),
    admin
      .from("jackpot_wins")
      .select("id, cycle, code, drawn_at, redeemed_at")
      .eq("campaign_id", campaign.id)
      .eq("winner_token_hash", tokenHash)
      .order("cycle", { ascending: false }),
  ]);

  const wins: JackpotPlayerWin[] = ((winRows as Array<{
    id: string;
    cycle: number;
    code: string;
    drawn_at: string;
    redeemed_at: string | null;
  }> | null) ?? []).map((w) => ({
    id: w.id,
    cycle: w.cycle,
    code: w.code,
    drawnAt: w.drawn_at,
    redeemedAt: w.redeemed_at,
  }));

  // Cookie présent mais aucune ligne joueur (mode staff avant la première
  // validation) : l'identité existe (le QR de check-in peut être affiché), mais
  // les compteurs restent à zéro.
  if (!player) {
    return { ...empty, hasIdentity: true, wins };
  }

  return {
    hasIdentity: true,
    participationCount: (player.participation_count as number | null) ?? 0,
    lastParticipationAt: (player.last_participation_at as string | null) ?? null,
    wins,
  };
}

export type JackpotActionContext =
  | { ok: false; error: string }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      campaign: PublicJackpotCampaign;
    };

/**
 * Contexte MINIMAL d'une server action publique (participation) : campagne +
 * organisation résolues et vérifiées (addon, abonnement, statut actif), rien de
 * plus. Toujours résolue par l'UUID de campagne (l'action ne reçoit jamais un
 * slug). Sur un chemin ouvert à Internet, une seule requête précède le premier
 * rempart d'identité — pas d'amplification de lecture (miroir fidélité).
 */
export async function loadJackpotActionContext(
  campaignId: string,
): Promise<JackpotActionContext> {
  const admin = createAdminClient();

  const resolved = await fetchCampaignWithOrg(admin, campaignId);
  if (!resolved) return { ok: false, error: UNAVAILABLE };
  const { campaign, organization } = resolved;

  if (!hasJackpotAccess(organization)) return { ok: false, error: UNAVAILABLE };
  if (campaign.status !== "active") return { ok: false, error: UNAVAILABLE };

  return { ok: true, admin, campaign };
}

export type JackpotContext =
  | { ok: false; error: string }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      campaign: PublicJackpotCampaign;
      organization: PublicJackpotOrganization;
      gauge: JackpotGaugeView;
      player: JackpotPlayerState;
    };

/**
 * Contexte public de la page suivable /jackpot/[id] : résout campagne →
 * organisation (service role + gardes inter-tenant), vérifie addon + abonnement
 * + statut actif, expose la jauge, le contenu marchand et l'état du joueur
 * courant en LECTURE SEULE. Réponse générique unique en cas d'invalidité
 * (404 côté page) — pas d'oracle sur le motif.
 */
export async function loadJackpotContext(
  campaignIdOrSlug: string,
): Promise<JackpotContext> {
  const admin = createAdminClient();

  const resolved = await fetchCampaignWithOrg(admin, campaignIdOrSlug);
  if (!resolved) return { ok: false, error: UNAVAILABLE };
  const { campaign, organization } = resolved;

  if (!hasJackpotAccess(organization)) return { ok: false, error: UNAVAILABLE };
  if (campaign.status !== "active") return { ok: false, error: UNAVAILABLE };

  const gauge = toGaugeView(campaign);
  const player = await loadPlayerState(admin, campaign);

  return { ok: true, admin, campaign, organization, gauge, player };
}
