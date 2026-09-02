import "server-only";

import { moduleOuvertAuJoueur } from "@/lib/module-acces-public";

import { cookies } from "next/headers";
import { recordCounter } from "@/lib/monitoring";
import {
  lookupLegacyIdentityHashes,
  peekPlayerDeviceTokenHash,
} from "@/lib/player-identity";
import { hashPlayerToken } from "@/lib/pronostics";
import { createAdminClient } from "@/lib/supabase/admin";
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
  /** date_draw : instant du tirage programmé (null sinon). */
  drawAt: string | null;
  /**
   * date_draw : le tirage du cycle COURANT a-t-il déjà eu lieu ? Vrai dès qu'une
   * ligne jackpot_wins existe pour (campaign_id, cycle) — le cycle est alors
   * figé, participer n'a plus de sens. Toujours faux hors mode date_draw.
   */
  drawDone: boolean;
  /** date_draw : instant EFFECTIF du tirage (drawn_at du gain), null sinon. */
  drawnAt: string | null;
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
    // Renseignés à part par loadDateDrawState (lecture jackpot_wins du cycle).
    drawDone: false,
    drawnAt: null,
    displayAmountCents:
      campaign.display_base_cents +
      campaign.current_count * campaign.display_increment_cents,
    soldOut: campaign.reward_claimed_count >= campaign.reward_stock,
  };
}

/**
 * date_draw uniquement : le tirage du cycle COURANT a-t-il eu lieu ? Le cron
 * tire une seule fois à `draw_at` et matérialise une ligne jackpot_wins pour le
 * cycle ; sa présence fige le cycle. Lecture service-role bornée au strict
 * nécessaire — on ne lit QUE `drawn_at` (jamais le winner_token_hash d'autrui :
 * l'identité du gagnant ne fuit pas à un tiers). Hors date_draw → jamais tiré.
 */
async function loadDateDrawState(
  admin: ReturnType<typeof createAdminClient>,
  campaign: PublicJackpotCampaign,
): Promise<{ drawDone: boolean; drawnAt: string | null }> {
  if (campaign.draw_mode !== "date_draw") {
    return { drawDone: false, drawnAt: null };
  }
  const { data } = await admin
    .from("jackpot_wins")
    .select("drawn_at")
    .eq("campaign_id", campaign.id)
    .eq("cycle", campaign.cycle)
    .order("drawn_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return { drawDone: false, drawnAt: null };
  return { drawDone: true, drawnAt: (data.drawn_at as string | null) ?? null };
}

/**
 * Jauge partagée complète : la projection de la campagne, complétée par l'état
 * du tirage du cycle courant. Un seul endroit compose les deux — la page
 * suivable (`loadJackpotContext`) et le repli polling (`getJackpotState`)
 * doivent montrer exactement la même chose, y compris le `drawDone` qui fige
 * un cycle.
 */
export async function loadJackpotGauge(
  admin: ReturnType<typeof createAdminClient>,
  campaign: PublicJackpotCampaign,
): Promise<JackpotGaugeView> {
  const drawState = await loadDateDrawState(admin, campaign);
  return { ...toGaugeView(campaign), ...drawState };
}

/** Ligne joueur telle que la page la lit — compteur et dernière participation. */
interface JoueurJackpot {
  participation_count: number | null;
  last_participation_at: string | null;
}

/** L'identité retenue pour ce navigateur, et la ligne joueur qu'elle tient. */
interface IdentiteJackpot {
  /** Empreinte finalement retenue, ou `null` si ce navigateur n'en a aucune. */
  tokenHash: string | null;
  joueur: JoueurJackpot | null;
}

/**
 * Résout l'identité jackpot du navigateur courant : le cookie du module
 * d'abord, l'identité globale ensuite. Calque EXACT de
 * `resoudreIdentitePasseport` (loyalty-context.ts) — l'ordre, les gardes et les
 * raisons sont les mêmes, seule la table change.
 *
 * ── CE QUE ÇA RÉPARE ──
 *
 * Le jackpot ne connaissait qu'un seul chemin : `lc-jackpot-<campagne>`. Ce
 * cookie effacé — nettoyage du navigateur, mode privé refermé, téléphone changé
 * de main — le client redevenait un inconnu devant une jauge qu'il avait
 * pourtant contribué à remplir : compteur à zéro, et surtout CODES DE RETRAIT
 * DISPARUS. Un lot gagné et non retiré cessait de s'afficher alors que son code
 * restait valable en caisse. Rien n'était perdu en base : son appareil est
 * connu de `players`, et les deux chemins d'écriture publics posent le pont
 * `jackpot` (`ensureProgressivePlayerIdentity`). Il ne manquait que l'appel.
 *
 * ── L'ORDRE, ET POURQUOI IL EST DANS CE SENS ──
 *
 *  1. Le cookie du module, TOUJOURS EN PREMIER dès qu'il désigne un joueur.
 *     C'est le chemin que toute la production emprunte aujourd'hui : personne
 *     ne doit changer d'identité en silence le jour du déploiement.
 *  2. Absent, ou présent mais ne désignant AUCUN joueur : on retombe sur
 *     l'identité globale, dont les empreintes historiques sont rendues de la
 *     plus récemment vue à la plus ancienne. On retient la première qui tient
 *     réellement un joueur.
 *  3. Un visiteur neuf ne trouve rien nulle part et repart sans identité,
 *     exactement comme avant.
 *
 * ── C'EST UN ORDRE, PAS UN REMPLACEMENT (ADR-041) ──
 *
 * Le cookie de module n'est ni supprimé, ni cessé d'être écrit, ni relégué : il
 * reste lu en premier, `resolvePlayerIdentity` continue de le poser et
 * `record_jackpot_participation` continue d'écrire sous son empreinte. Ce lot
 * AJOUTE un second essai ; il n'en retire aucun.
 *
 * ── LE PIÈGE DU HACHAGE, QUI NE LÈVERAIT AUCUNE ERREUR ──
 *
 * `jackpot_players.token_hash` est une empreinte DE MODULE : un SHA-256 NU du
 * cookie de campagne (`hashPlayerToken`). L'empreinte de l'identité globale est
 * SALÉE ET VERSIONNÉE (`hashPlayerDeviceToken`, `player-device:v1`). Les deux
 * font 64 hexadécimaux et passent le même contrôle de forme : les substituer ne
 * lèverait RIEN — la requête ne trouverait simplement plus personne, partout,
 * sans une ligne de journal. L'empreinte globale n'entre donc JAMAIS dans un
 * filtre `jackpot_players` ; elle sert à demander au pont QUELLES empreintes de
 * module appartiennent à cet appareil, et ce sont celles-là, et elles seules,
 * qui sont filtrées.
 *
 * ── LA PORTÉE N'EST PAS ÉLARGIE D'UN POUCE ──
 *
 * La RPC de reprise part de `player_devices.token_hash` et ne rend que les
 * empreintes d'une adhésion du MÊME joueur, sur la MÊME organisation et la MÊME
 * expérience — ici la campagne elle-même. Le `in (…)` conserve en plus le filtre
 * `campaign_id`, exactement comme le chemin du cookie.
 *
 * ── TOUTE PANNE REND L'ÉTAT D'AVANT ──
 *
 * Pas de cookie global, aucune empreinte historique, lecture en panne : on rend
 * ce que le chemin du cookie avait trouvé. Ce repli ne peut qu'AJOUTER un
 * joueur, jamais en retirer un. Et il n'ÉCRIT rien : `peekPlayerDeviceTokenHash`
 * ne pose pas même le cookie global — afficher une page ne fabrique pas une
 * identité.
 */
async function resoudreIdentiteJackpot(
  admin: ReturnType<typeof createAdminClient>,
  campaign: PublicJackpotCampaign,
): Promise<IdentiteJackpot> {
  const store = await cookies();
  const token = store.get(jackpotTokenCookieName(campaign.id))?.value;
  const empreinteCookie = token ? hashPlayerToken(token) : null;

  if (empreinteCookie) {
    const { data } = await admin
      .from("jackpot_players")
      .select("participation_count, last_participation_at")
      .eq("campaign_id", campaign.id)
      .eq("token_hash", empreinteCookie)
      .maybeSingle();
    if (data) {
      return { tokenHash: empreinteCookie, joueur: data as JoueurJackpot };
    }
  }

  const vide: IdentiteJackpot = { tokenHash: empreinteCookie, joueur: null };

  const empreinteAppareil = await peekPlayerDeviceTokenHash();
  if (!empreinteAppareil) return vide;

  const anciennes = await lookupLegacyIdentityHashes({
    deviceTokenHash: empreinteAppareil,
    organizationId: campaign.organization_id,
    experienceKind: "jackpot",
    experienceId: campaign.id,
  });
  if (anciennes.length === 0) return vide;

  // UNE requête pour toutes les empreintes, jamais une par empreinte : ce repli
  // est rare, il ne doit pas coûter N allers-retours le jour où il sert.
  const { data, error } = await admin
    .from("jackpot_players")
    .select("token_hash, participation_count, last_participation_at")
    .eq("campaign_id", campaign.id)
    .in("token_hash", anciennes);
  if (error) return vide;

  const parEmpreinte = new Map<string, JoueurJackpot>();
  for (const ligne of data ?? []) {
    const row = ligne as JoueurJackpot & { token_hash: string | null };
    if (!row?.token_hash) continue;
    parEmpreinte.set(row.token_hash, {
      participation_count: row.participation_count,
      last_participation_at: row.last_participation_at,
    });
  }

  // L'ORDRE DE LA RPC DÉCIDE, pas celui que la base a rendu : `anciennes` est
  // trié de la plus récemment vue à la plus ancienne. Un client qui a changé
  // deux fois de cookie retrouve donc sa participation la plus RÉCENTE.
  for (const ancienne of anciennes) {
    const joueur = parEmpreinte.get(ancienne);
    if (!joueur) continue;
    // ZÉRO EST LA VALEUR ATTENDUE tant que personne n'a perdu son cookie ; une
    // population non nulle dit combien de clients auraient vu leur jauge — et
    // leurs codes de retrait — disparaître.
    recordCounter("jackpot.joueur.repli_identite_globale");
    return { tokenHash: ancienne, joueur };
  }
  return vide;
}

/**
 * État du joueur courant en lecture seule : compteur de participations et gains
 * remportés (codes de retrait). Aucune identité → état vide. Le jeton
 * d'identité ne quitte pas le serveur : seul son hash touche la base (miroir
 * fidélité).
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

  const { tokenHash, joueur: player } = await resoudreIdentiteJackpot(
    admin,
    campaign,
  );
  if (!tokenHash) return empty;

  // Les gains SUIVENT l'empreinte retenue, jamais le cookie : c'est la moitié
  // du lot qui compte le plus. Un code de retrait affiché sous une empreinte
  // perdue est un lot que son gagnant ne voit plus, alors qu'il reste valable
  // au comptoir.
  const { data: winRows } = await admin
    .from("jackpot_wins")
    .select("id, cycle, code, drawn_at, redeemed_at")
    .eq("campaign_id", campaign.id)
    .eq("winner_token_hash", tokenHash)
    .order("cycle", { ascending: false });

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

  // Empreinte retenue mais aucune ligne joueur (mode staff avant la première
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

  if (!await moduleOuvertAuJoueur("jackpot", organization)) return { ok: false, error: UNAVAILABLE };
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

  if (!await moduleOuvertAuJoueur("jackpot", organization)) return { ok: false, error: UNAVAILABLE };
  if (campaign.status !== "active") return { ok: false, error: UNAVAILABLE };

  const [gauge, player] = await Promise.all([
    loadJackpotGauge(admin, campaign),
    loadPlayerState(admin, campaign),
  ]);

  return { ok: true, admin, campaign, organization, gauge, player };
}
