"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import {
  jackpotTokenCookieName,
  loadJackpotActionContext,
} from "@/lib/jackpot-context";
import {
  mapJackpotParticipation,
  type JackpotParticipationResult,
} from "@/lib/jackpot";
import { signJackpotCheckin, verifyJackpotCheckin } from "@/lib/jackpot-checkin";
import { monitored, reportError } from "@/lib/monitoring";
import { generatePlayerToken, hashPlayerToken } from "@/lib/pronostics";
import {
  observeSharedKey,
  RATE_LIMITS,
  rateLimit,
  rateLimitBucket,
} from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasJackpotAccess } from "@/lib/subscription";
import { turnstileEnabled, verifyTurnstile } from "@/lib/turnstile";
import { randomCode, slugify, type ActionResult } from "@/lib/utils";
import {
  createJackpotCampaignSchema,
  deleteJackpotCampaignSchema,
  jackpotCampaignIdSchema,
  jackpotCounterCodeSchema,
  participateJackpotSchema,
  participateJackpotStaffSchema,
  setJackpotCampaignStatusSchema,
  updateJackpotCampaignSchema,
} from "@/lib/validations/jackpot";

/** Durée de vie du cookie joueur d'un jackpot (180 j, comme la fidélité). */
const JACKPOT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

const NOT_EDITOR = "Action non autorisée";
const GENERIC_ERROR = "Une erreur est survenue, réessayez.";

// ────────────────────────────────────────────────────────────
// Contrôle d'abus — principe de conception du module (ADR-032)
//
// La jauge du jackpot est une clé PARTAGÉE entre TOUS les joueurs : la remplir
// vite est un OBJECTIF, pas un abus. AUCUN seau `failClosed` ne porte donc sur
// la CAMPAGNE (ni sur l'IP mutualisée d'un lieu) — un tel seau deviendrait un
// interrupteur qu'un tiers allume en le saturant (« déni de participation d'un
// lieu entier »). Les clés partagées ne portent que des compteurs
// d'OBSERVABILITÉ fail-OPEN (`observeSharedKey`) : ils incrémentent, ils
// alertent, ils ne refusent JAMAIS.
//
// Le `failClosed` reste légitime — et employé — sur une clé propre à UNE
// identité (hash du jeton joueur) ou à UN opérateur authentifié (user.id) : la
// saturer ne coupe que son porteur.
//
// La borne réelle contre le gonflage de la jauge n'est pas un rate-limit : c'est
// l'anti-triche (code tournant recalculé serveur / validation staff) + le
// cooldown par joueur (>= 300 s) + le stock FINI obligatoire. Fabriquer N
// cookies ne crée PAS N lots (un seul gagnant par cycle, unicité SQL
// (campaign_id, cycle)) : la frappe d'identités n'a aucun rendement ici.
//
// ── INVENTAIRE DES SEAUX ────────────────────────────────────────────────
//  participateJackpot (public, rotating)
//    · jackpot:participate:code:<campagne>:<hash>    identité   CLOSED
//    · jackpot:participate:member:<campagne>:<hash>  identité   CLOSED
//    · jackpot:public:ip:<campagne>:<ip>             partagée   OPEN (observabilité)
//    · jackpot:new:campaign:<campagne>               partagée   OPEN (création réelle seulement)
//  participateJackpotStaff (authentifié)
//    · jackpot:staff:<org>:<user>                    opérateur  CLOSED
//    · jackpot:staff:new:<org>:<user>                opérateur  OPEN (création réelle seulement)
//  getJackpotCounterCode (authentifié) : jackpot:counter:<org>:<user> opérateur CLOSED
// ────────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════
// Dashboard commerçant — campagnes (session + RLS éditeurs)
// ════════════════════════════════════════════════════════════

export async function createJackpotCampaign(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createJackpotCampaignSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  // reward_stock est NOT NULL sans défaut en base : on part sur 0 (« en pause »),
  // le commerçant règle le vrai stock avant l'activation.
  const supabase = await createClient();
  const { data: campaign, error } = await supabase
    .from("jackpot_campaigns")
    .insert({ organization_id: organization.id, name: parsed.data.name, reward_stock: 0 })
    .select("id")
    .single();

  if (error || !campaign) {
    console.error("[jackpot] create campaign:", error?.message);
    return { ok: false, error: "Impossible de créer la campagne" };
  }

  revalidatePath("/dashboard/jackpot");
  redirect(`/dashboard/jackpot/${campaign.id}`);
}

/**
 * Champs d'une campagne normalisés selon le mode de résolution (miroir des
 * CHECK SQL de cohérence) : `win_probability` n'a de sens qu'en `rescan_win`,
 * `draw_at` qu'en `date_draw`. Écraser ces champs à null hors de leur mode évite
 * une erreur SQL brute 23514 (jackpot_campaigns_win_probability_check /
 * jackpot_campaigns_draw_at_check).
 */
function campaignFieldsForMode(
  d: ReturnType<typeof updateJackpotCampaignSchema.parse>,
) {
  const isRescan = d.draw_mode === "rescan_win";
  const isDate = d.draw_mode === "date_draw";
  return {
    name: d.name,
    public_slug: d.public_slug,
    validation_mode: d.validation_mode,
    rotating_period_seconds: d.rotating_period_seconds,
    min_participation_interval_seconds: d.min_participation_interval_seconds,
    draw_mode: d.draw_mode,
    threshold: d.threshold,
    win_probability: isRescan ? d.win_probability : null,
    draw_at: isDate ? d.draw_at : null,
    reward_label: d.reward_label,
    reward_details: d.reward_details || null,
    // reward_stock est FINI et OBLIGATOIRE (refineCampaign rejette null) ; le
    // `?? 0` n'est là que pour le typage NOT NULL de la colonne.
    reward_stock: d.reward_stock ?? 0,
    display_base_cents: d.display_base,
    display_increment_cents: d.display_increment,
    merchant_content: d.merchant_content || null,
  };
}

/** Réglages d'une campagne (nom, modes, seuils, cooldown, lot, affichage). */
export async function updateJackpotCampaign(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateJackpotCampaignSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    public_slug: formData.get("public_slug") ?? "",
    validation_mode: formData.get("validation_mode"),
    rotating_period_seconds: formData.get("rotating_period_seconds") ?? 60,
    min_participation_interval_seconds:
      formData.get("min_participation_interval_seconds") ?? 86400,
    draw_mode: formData.get("draw_mode"),
    threshold: formData.get("threshold") ?? 100,
    win_probability: formData.get("win_probability") ?? "",
    draw_at: formData.get("draw_at") ?? "",
    reward_label: formData.get("reward_label") ?? "",
    reward_details: formData.get("reward_details") ?? "",
    reward_stock: formData.get("reward_stock") ?? "",
    display_base: formData.get("display_base") ?? "",
    display_increment: formData.get("display_increment") ?? "",
    merchant_content: formData.get("merchant_content") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const { id } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("jackpot_campaigns")
    .update(campaignFieldsForMode(parsed.data))
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Cette URL publique est déjà utilisée" };
    }
    console.error("[jackpot] update campaign:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath("/dashboard/jackpot");
  revalidatePath(`/dashboard/jackpot/${id}`);
  return { ok: true, data: undefined };
}

/** Campagne prête à l'activation ? Message d'erreur sinon (null = OK). */
function activationBlocker(campaign: {
  draw_mode: string;
  threshold: number;
  draw_at: string | null;
  reward_stock: number;
  reward_label: string;
}): string | null {
  if (!campaign.reward_label.trim()) {
    return "Renseignez le lot avant d'activer la campagne.";
  }
  if (campaign.reward_stock < 1) {
    return "Indiquez un stock d'au moins 1 lot avant d'activer (0 = en pause).";
  }
  if (campaign.threshold < 1) {
    return "L'objectif de la jauge doit valoir au moins 1.";
  }
  if (campaign.draw_mode === "date_draw") {
    if (!campaign.draw_at || new Date(campaign.draw_at).getTime() <= Date.now()) {
      return "Planifiez le tirage à une date et heure futures avant d'activer.";
    }
  }
  return null;
}

/** Base de slug public dérivée du nom (>= 3 caractères, alphabet a-z0-9-). */
function jackpotSlugBase(name: string): string {
  const base = slugify(name);
  if (base.length >= 3) return base;
  return `jackpot-${base}`.slice(0, 64).replace(/-+$/, "") || "jackpot";
}

/**
 * Change le statut d'une campagne. L'activation exige le module actif et une
 * configuration cohérente (lot, stock >= 1, tirage à date planifié). À
 * l'activation, si aucune URL publique n'a été posée, on en génère une unique
 * (public_slug est UNIQUE au niveau plateforme : retry avec suffixe sur
 * collision, y compris inter-tenant que la RLS ne verrait pas en lecture).
 */
export async function setJackpotCampaignStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setJackpotCampaignStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const { id, status } = parsed.data;
  const supabase = await createClient();

  if (status !== "active") {
    const { error } = await supabase
      .from("jackpot_campaigns")
      .update({ status })
      .eq("id", id)
      .eq("organization_id", organization.id);
    if (error) {
      console.error("[jackpot] status:", error.message);
      return { ok: false, error: "Mise à jour impossible" };
    }
    revalidatePath("/dashboard/jackpot");
    revalidatePath(`/dashboard/jackpot/${id}`);
    return { ok: true, data: undefined };
  }

  // Activation.
  if (!hasJackpotAccess(organization)) {
    return {
      ok: false,
      error: "Le module Jackpot collectif n'est pas activé sur votre compte.",
    };
  }
  const { data: campaign } = await supabase
    .from("jackpot_campaigns")
    .select("id, name, draw_mode, threshold, draw_at, reward_stock, reward_label, public_slug")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!campaign) return { ok: false, error: "Campagne introuvable" };

  const blocker = activationBlocker(campaign);
  if (blocker) return { ok: false, error: blocker };

  // URL publique déjà posée par le commerçant : simple bascule de statut.
  if (campaign.public_slug) {
    const { error } = await supabase
      .from("jackpot_campaigns")
      .update({ status: "active" })
      .eq("id", id)
      .eq("organization_id", organization.id);
    if (error) {
      console.error("[jackpot] activate:", error.message);
      return { ok: false, error: "Mise à jour impossible" };
    }
    revalidatePath("/dashboard/jackpot");
    revalidatePath(`/dashboard/jackpot/${id}`);
    return { ok: true, data: undefined };
  }

  // Génération d'un slug unique : on TENTE l'update (le SET public_slug bute sur
  // l'unicité globale → 23505) et on retente avec un suffixe. Pas de lecture
  // préalable : la RLS ne voit pas les slugs des autres tenants.
  const base = jackpotSlugBase(campaign.name);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate =
      attempt === 0 ? base : `${base}-${randomCode(4).toLowerCase()}`.slice(0, 64);
    const { error } = await supabase
      .from("jackpot_campaigns")
      .update({ status: "active", public_slug: candidate })
      .eq("id", id)
      .eq("organization_id", organization.id);
    if (!error) {
      revalidatePath("/dashboard/jackpot");
      revalidatePath(`/dashboard/jackpot/${id}`);
      return { ok: true, data: undefined };
    }
    if (error.code !== "23505") {
      console.error("[jackpot] activate:", error.message);
      return { ok: false, error: "Mise à jour impossible" };
    }
  }
  return { ok: false, error: "Impossible de générer une URL publique unique, réessayez." };
}

export async function deleteJackpotCampaign(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteJackpotCampaignSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { error } = await supabase
    .from("jackpot_campaigns")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[jackpot] delete campaign:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath("/dashboard/jackpot");
  redirect("/dashboard/jackpot");
}

// ════════════════════════════════════════════════════════════
// Écran comptoir — code tournant courant (authentifié, jamais public)
// ════════════════════════════════════════════════════════════

export interface JackpotCounterCode {
  /** Code TOTP courant (null si la campagne n'est pas en mode rotating). */
  code: string | null;
  /** Période de rotation, pour le compte à rebours côté écran. */
  periodSeconds: number;
}

/**
 * Code tournant à afficher au comptoir. Réservé à un owner/editor — même garde
 * que la page comptoir (leçon INFO-2 de la fidélité) : une server action reste
 * un endpoint appelable directement, et le code courant vaut une participation.
 * Un compte `cashier` (ou tout autre rôle) le lirait à distance et
 * s'auto-validerait sans être en boutique ; la caisse dispose déjà de
 * `participateJackpotStaff`. Le secret ne sort jamais côté client.
 */
export async function getJackpotCounterCode(
  campaignId: string,
): Promise<JackpotCounterCode | null> {
  const parsed = jackpotCounterCodeSchema.safeParse({ campaignId });
  if (!parsed.success) return null;

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return null;

  const allowed = await rateLimit(
    rateLimitBucket("jackpot:counter", organization.id, user.id),
    RATE_LIMITS.jackpotCounter,
    { failClosed: true },
  );
  if (!allowed) return null;

  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("jackpot_campaigns")
    .select("id, validation_mode, rotating_period_seconds")
    .eq("id", parsed.data.campaignId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!campaign) return null;

  if (campaign.validation_mode !== "rotating_code") {
    return { code: null, periodSeconds: campaign.rotating_period_seconds };
  }

  const { data: code, error } = await createAdminClient().rpc("current_jackpot_code", {
    p_campaign_id: parsed.data.campaignId,
  });
  if (error) {
    reportError("jackpot.counter-code", error.message);
    return null;
  }
  return {
    code: (code as string | null) ?? null,
    periodSeconds: campaign.rotating_period_seconds,
  };
}

// ════════════════════════════════════════════════════════════
// Caisse — participation validée par le staff (mode staff)
// ════════════════════════════════════════════════════════════

/**
 * Valide une participation depuis la caisse (mode staff) : le staff scanne le
 * QR affiché par le client, qui porte un JETON DE CHECK-IN signé et éphémère
 * (~3 min, cf. lib/jackpot-checkin.ts) — jamais le jeton d'identité du joueur,
 * qui ne quitte pas le serveur. AUTHENTIFIÉE, réservée à un membre autorisé ;
 * l'identité du validateur (user.id) est transmise à la RPC comme
 * p_validated_by (obligatoire en mode staff).
 */
export async function participateJackpotStaff(input: {
  campaignId: string;
  checkinToken: string;
}): Promise<ActionResult<JackpotParticipationResult>> {
  return monitored("jackpot.participateStaff", () => participateStaffInner(input));
}

async function participateStaffInner(
  input: Parameters<typeof participateJackpotStaff>[0],
): Promise<ActionResult<JackpotParticipationResult>> {
  try {
    const parsed = participateJackpotStaffSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const { user, organization, role } = await getUserAndOrg();
    if (!user || !organization) redirect("/login");
    // Caisse : owner, editor ou cashier opèrent le comptoir.
    if (role !== "owner" && role !== "editor" && role !== "cashier") {
      return { ok: false, error: NOT_EDITOR };
    }

    // Clé d'OPÉRATEUR authentifié (organisation + user.id), jamais partagée :
    // `failClosed` légitime, la saturer ne coupe que ce poste de caisse.
    const allowed = await rateLimit(
      rateLimitBucket("jackpot:staff", organization.id, user.id),
      RATE_LIMITS.cashier,
      { failClosed: true },
    );
    if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };

    // Multi-tenant : la campagne doit appartenir à l'organisation active.
    const supabase = await createClient();
    const { data: campaign } = await supabase
      .from("jackpot_campaigns")
      .select("id")
      .eq("id", parsed.data.campaignId)
      .eq("organization_id", organization.id)
      .maybeSingle();
    if (!campaign) return { ok: false, error: "Jackpot introuvable" };

    // Le QR ne porte QUE ce laissez-passer signé : signature, expiration et
    // campagne sont vérifiés ici. Un jeton photographié devient inerte à
    // l'expiration, et n'a jamais donné accès à l'identité du joueur.
    const checkin = verifyJackpotCheckin(parsed.data.checkinToken);
    if (!checkin || checkin.campaignId !== parsed.data.campaignId) {
      return {
        ok: false,
        error:
          "Carte expirée ou illisible — demandez au client de rafraîchir son écran.",
      };
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("record_jackpot_participation", {
      p_campaign_id: parsed.data.campaignId,
      p_player_token_hash: checkin.playerTokenHash,
      p_rotating_code: undefined,
      p_validated_by: user.id,
    });
    if (error) {
      reportError("jackpot.participateStaff", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const result = mapJackpotParticipation(data);

    // Compteur d'observabilité par OPÉRATEUR sur les créations RÉELLES (jamais
    // un refus) : consommé uniquement sur `is_new_player = true`. Le débit du
    // poste reste borné par `cashier` (fail-closed, même clé d'opérateur).
    if (result.isNewPlayer) {
      await observeSharedKey(
        rateLimitBucket("jackpot:staff:new", organization.id, user.id),
        RATE_LIMITS.jackpotStaffPlayerCreation,
        "jackpot_staff_player_burst",
        {
          campaign_id: parsed.data.campaignId,
          organization_id: organization.id,
          validated_by: user.id,
        },
      );
    }

    return { ok: true, data: result };
  } catch (err) {
    reportError("jackpot.participateStaff", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ════════════════════════════════════════════════════════════
// Parcours public — participation joueur (anonyme, service role via contexte)
// ════════════════════════════════════════════════════════════

/** Identité du joueur portée par le cookie httpOnly du navigateur. */
interface JackpotIdentity {
  /** Empreinte du jeton (seule valeur transmise à la base). */
  tokenHash: string;
  /** Le cookie préexistait-il ? Sinon, aucune identité à interroger en base. */
  returning: boolean;
}

/**
 * Résout — et pose au besoin — l'identité du joueur. AUCUN aller-retour base :
 * ce qui permet de trancher le premier seau avant la moindre requête SQL, avant
 * tout appel sortant et avant l'instrumentation (`monitored`).
 *
 * Le cookie est posé dès la première tentative, même refusée : sans lui, un
 * client légitime resterait éternellement « inconnu » et repaierait le
 * challenge à chaque essai.
 */
async function resolvePlayerIdentity(campaignId: string): Promise<JackpotIdentity> {
  const store = await cookies();
  const cookieName = jackpotTokenCookieName(campaignId);
  const existing = store.get(cookieName)?.value;
  const token = existing ?? generatePlayerToken();
  if (!existing) {
    store.set(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: JACKPOT_COOKIE_MAX_AGE,
    });
  }
  return { tokenHash: hashPlayerToken(token), returning: Boolean(existing) };
}

/** Seau d'observabilité de la pression publique (clé partagée, jamais un refus). */
async function observePublicPressure(campaignId: string, ip: string): Promise<void> {
  await observeSharedKey(
    rateLimitBucket("jackpot:public:ip", campaignId, ip),
    RATE_LIMITS.jackpotParticipateIp,
    "jackpot_public_pressure",
    { campaign_id: campaignId },
  );
}

/**
 * Ancienneté d'une identité de joueur. Le cookie n'est qu'une valeur aléatoire
 * NON SIGNÉE choisie par l'appelant : seule la ligne `jackpot_players` (créée
 * par la RPC APRÈS validation d'un code / d'un staff) atteste quelque chose.
 *
 *  · `unknown`     — pas de cookie, ou cookie sans ligne en base. Un premier
 *                    passage validé CRÉERAIT une identité : c'est là, et là
 *                    seulement, qu'un challenge anti-robot a du sens (rotating).
 *  · `fresh`       — ligne existante mais participation trop récente.
 *  · `established` — a déjà participé (>= 1) et dernière participation antérieure
 *                    d'au moins un cooldown. Cette classe ne touche plus aucune
 *                    clé partagée, pas même en observabilité.
 */
type JackpotPlayerStanding = "unknown" | "fresh" | "established";

/** Plancher d'ancienneté (miroir du plancher SQL de cooldown, >= 300 s). */
const JACKPOT_ESTABLISHED_MIN_AGE_SECONDS = 300;

async function playerStanding(
  admin: ReturnType<typeof createAdminClient>,
  campaignId: string,
  tokenHash: string | null,
  minIntervalSeconds: number,
): Promise<JackpotPlayerStanding> {
  if (!tokenHash) return "unknown";

  const { data, error } = await admin
    .from("jackpot_players")
    .select("participation_count, last_participation_at")
    .eq("campaign_id", campaignId)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) {
    reportError("jackpot.player-standing", error.message);
    return "unknown";
  }
  if (!data) return "unknown";

  const count = (data.participation_count as number | null) ?? 0;
  const lastMs = data.last_participation_at
    ? Date.parse(data.last_participation_at as string)
    : Number.NaN;
  const cooldownMs =
    Math.max(minIntervalSeconds, JACKPOT_ESTABLISHED_MIN_AGE_SECONDS) * 1000;
  const recentEnough = Number.isFinite(lastMs) && Date.now() - lastMs >= cooldownMs;

  return count >= 1 && recentEnough ? "established" : "fresh";
}

/**
 * Le challenge anti-robot est-il RÉELLEMENT jouable ? Il faut les DEUX clés : le
 * secret serveur (vérification) et la clé de site (rendu du widget). N'en
 * provisionner qu'une briderait le parcours (miroir de la fidélité). Compromis
 * assumé sans Turnstile : on n'oppose pas de challenge — sans stock à drainer et
 * sans rendement à fabriquer des joueurs, une identité neuve ne vaut rien.
 */
function jackpotChallengeAvailable(): boolean {
  return turnstileEnabled() && Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

/**
 * Résultat d'une participation publique : `ActionResult<JackpotParticipationResult>`
 * augmenté d'un drapeau `challengeRequired` — créer une identité (joueur inconnu,
 * mode rotating) exige un challenge Turnstile, l'UI affiche alors le widget et
 * rejoue la participation. Un client légitime ne le voit qu'à son tout premier
 * passage ; ensuite son identité l'en dispense.
 */
export type JackpotParticipationActionResult =
  | { ok: true; data: JackpotParticipationResult }
  | { ok: false; error: string; challengeRequired?: boolean };

/**
 * Participe au jackpot en mode rotating_code : le client fournit le code à 6
 * chiffres affiché au comptoir. POST du bouton uniquement (jamais au GET).
 * Crée/lit le cookie joueur, appelle record_jackpot_participation et renvoie un
 * résultat typé (jauge, gagnant/armé/épuisé, cooldown).
 *
 * `turnstileToken` n'est demandé que lorsque l'appel précédent a répondu
 * `challengeRequired` (création d'une identité, cf. participateInner).
 */
export async function participateJackpot(input: {
  campaignId: string;
  code?: string;
  turnstileToken?: string;
}): Promise<JackpotParticipationActionResult> {
  const parsed = participateJackpotSchema.safeParse({
    campaignId: input.campaignId,
    code: input.code,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // ── PREMIER REMPART ──────────────────────────────────────────────────
  // Deux seaux fail-closed clés sur l'IDENTITÉ du demandeur (son cookie),
  // consultés AVANT la moindre requête SQL, avant tout appel sortant et hors de
  // `monitored`. Une clé propre à un porteur peut refuser sans couper personne
  // d'autre : le seul endroit où `failClosed` est admis ici. JAMAIS sur la
  // campagne (clé partagée, cf. en-tête du module).
  const identity = await resolvePlayerIdentity(parsed.data.campaignId);
  for (const [prefix, rule] of [
    ["jackpot:participate:code", RATE_LIMITS.jackpotParticipateCodeMember],
    ["jackpot:participate:member", RATE_LIMITS.jackpotParticipateMember],
  ] as const) {
    if (
      !(await rateLimit(
        rateLimitBucket(prefix, parsed.data.campaignId, identity.tokenHash),
        rule,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de tentatives récentes. Patientez un instant avant de continuer.",
      };
    }
  }

  return monitored("jackpot.participate", () =>
    participateInner(parsed.data, identity, input.turnstileToken),
  );
}

async function participateInner(
  parsed: { campaignId: string; code?: string },
  identity: JackpotIdentity,
  turnstileToken: string | undefined,
): Promise<JackpotParticipationActionResult> {
  try {
    const ctx = await loadJackpotActionContext(parsed.campaignId);
    // Campagne inconnue / fermée / module coupé : résultat générique typé
    // (l'UI affiche le même message, aucun oracle sur le motif).
    if (!ctx.ok) {
      return { ok: true, data: mapJackpotParticipation({ state: "unavailable" }) };
    }

    const ip = clientIpFromHeaders(await headers());

    const standing = await playerStanding(
      ctx.admin,
      ctx.campaign.id,
      identity.returning ? identity.tokenHash : null,
      ctx.campaign.min_participation_interval_seconds,
    );

    // CRÉATION D'IDENTITÉ (mode rotating) : seul cas où un challenge a du sens.
    // En mode staff la création passe par l'action authentifiée, pas ici.
    if (ctx.campaign.validation_mode === "rotating_code" && standing === "unknown") {
      if (
        jackpotChallengeAvailable() &&
        !(await verifyTurnstile(turnstileToken, ip, "jackpot-participate"))
      ) {
        return {
          ok: false,
          error:
            "Vérification anti-robot requise. Validez le contrôle ci-dessous puis participez.",
          challengeRequired: true,
        };
      }
    }

    // Clé partagée = observabilité seule. Un joueur ÉTABLI n'y touche même pas :
    // il ne peut pas être pris en otage par un voisin de Wi-Fi / CGNAT.
    if (standing !== "established") {
      await observePublicPressure(ctx.campaign.id, ip);
    }

    const { data, error } = await ctx.admin.rpc("record_jackpot_participation", {
      p_campaign_id: parsed.campaignId,
      p_player_token_hash: identity.tokenHash,
      p_rotating_code: parsed.code,
      p_validated_by: undefined,
    });
    if (error) {
      reportError("jackpot.participate", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const result = mapJackpotParticipation(data);

    // Compteur de CRÉATIONS sur clé partagée (campagne) : consommé UNIQUEMENT
    // sur une création réelle (`is_new_player`). Il alerte, il ne refuse jamais.
    if (result.isNewPlayer) {
      await observeSharedKey(
        rateLimitBucket("jackpot:new:campaign", ctx.campaign.id),
        RATE_LIMITS.jackpotNewPlayerBurst,
        "jackpot_player_creation_burst",
        {
          campaign_id: ctx.campaign.id,
          challenge_available: jackpotChallengeAvailable(),
        },
      );
    }

    return { ok: true, data: result };
  } catch (err) {
    reportError("jackpot.participate", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Jeton de check-in du jackpot (mode staff) : établit au besoin l'identité du
 * joueur (cookie httpOnly, sans participer) puis renvoie un laissez-passer SIGNÉ
 * et ÉPHÉMÈRE (~3 min), seule valeur encodée dans le QR présenté au comptoir.
 * Miroir EXACT de getLoyaltyCheckinToken.
 *
 * Le jeton d'identité (valeur du cookie) n'est jamais renvoyé au client : un QR
 * photographié ne permet ni de rejouer l'identité du joueur, ni de lire quoi que
 * ce soit — au pire il fait compter UNE participation à la victime avant son
 * expiration. Le client rafraîchit son jeton avant échéance.
 */
export async function getJackpotCheckinToken(input: {
  campaignId: string;
}): Promise<ActionResult<{ token: string; expiresAt: number }>> {
  const parsed = jackpotCampaignIdSchema.safeParse(input.campaignId);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // PREMIER REMPART — clé d'IDENTITÉ (cookie du joueur), donc `failClosed`
  // légitime, consulté avant la moindre requête SQL comme avant toute écriture
  // d'instrumentation. La saturer ne coupe que ce porteur.
  const identity = await resolvePlayerIdentity(parsed.data);
  if (
    !(await rateLimit(
      rateLimitBucket("jackpot:checkin:member", parsed.data, identity.tokenHash),
      RATE_LIMITS.jackpotCheckinMember,
      { failClosed: true },
    ))
  ) {
    return { ok: false, error: "Trop de tentatives. Patientez un instant." };
  }

  return monitored("jackpot.checkinToken", () =>
    checkinTokenInner(parsed.data, identity),
  );
}

async function checkinTokenInner(
  campaignId: string,
  identity: JackpotIdentity,
): Promise<ActionResult<{ token: string; expiresAt: number }>> {
  try {
    const ctx = await loadJackpotActionContext(campaignId);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    // Aucun challenge ici : ce jeton ne vaut RIEN sans un membre de l'équipe qui
    // le scanne (participateJackpotStaff, authentifiée) et ne crée aucune ligne
    // en base. Reste l'observabilité, sur clé partagée : elle alerte, elle ne
    // refuse pas — l'écran joueur staff n'a aucune saisie de repli, un refus ici
    // couperait TOUT check-in derrière une même box.
    const standing = await playerStanding(
      ctx.admin,
      ctx.campaign.id,
      identity.returning ? identity.tokenHash : null,
      ctx.campaign.min_participation_interval_seconds,
    );
    if (standing !== "established") {
      await observePublicPressure(
        ctx.campaign.id,
        clientIpFromHeaders(await headers()),
      );
    }

    const { token, expiresAt } = signJackpotCheckin({
      campaignId: ctx.campaign.id,
      playerTokenHash: identity.tokenHash,
    });
    return { ok: true, data: { token, expiresAt } };
  } catch (err) {
    reportError("jackpot.checkinToken", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}
