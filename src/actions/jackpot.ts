"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { blocageActivationJackpot } from "@/lib/activation/jackpot";
import { moduleOuvertAuJoueur } from "@/lib/module-acces-public";
import { getUserAndOrg } from "@/lib/auth";
import { hrefEtapeJackpot } from "@/components/dashboard/atelier-jackpot-etapes";
import { refuserSiQuotaBrouillonAtteint } from "@/lib/quota-brouillons";
import { zonedDateTimeToIso } from "@/lib/date-time";
import {
  jackpotTokenCookieName,
  loadJackpotActionContext,
  loadJackpotGauge,
  type JackpotGaugeView,
} from "@/lib/jackpot-context";
import {
  mapJackpotParticipation,
  type JackpotParticipationResult,
} from "@/lib/jackpot";
import { signJackpotCheckin, verifyJackpotCheckin } from "@/lib/jackpot-checkin";
import {
  ponterIdentiteJackpotCaisse,
  reunirIdentitesJackpot,
} from "@/lib/jackpot-identite";
import { monitored, reportError } from "@/lib/monitoring";
import { ensureProgressivePlayerIdentity } from "@/lib/player-identity";
import { generatePlayerToken, hashPlayerToken } from "@/lib/pronostics";
import { refusTransition } from "@/lib/publication-transition";
import {
  observeSharedKey,
  RATE_LIMITS,
  rateLimit,
  rateLimitBucket,
} from "@/lib/rate-limit";
import { clientIpFromHeaders, observerPressionIp } from "@/lib/request-ip";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasJackpotAccess } from "@/lib/subscription";
import { turnstileEnabled, verifyTurnstile } from "@/lib/turnstile";
import type { Organization } from "@/types/database";
import { randomCode, slugify, type ActionResult } from "@/lib/utils";
import {
  createJackpotCampaignSchema,
  deleteJackpotCampaignSchema,
  getJackpotStateSchema,
  jackpotCampaignIdSchema,
  jackpotCounterCodeSchema,
  participateJackpotSchema,
  participateJackpotStaffSchema,
  setJackpotCampaignStatusSchema,
  invitationJackpotSchema,
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
  // Le brouillon gratuit du module, borne cote SERVEUR : l'ecran cache
  // deja le formulaire, mais une server action reste POSTable en direct.
  const refusQuota = await refuserSiQuotaBrouillonAtteint("jackpot");
  if (refusQuota) return refusQuota;

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
  // ATTERRISSAGE SUR L'ATELIER, et non en haut de la page de suivi : une
  // cagnotte qui vient de naître n'a rien à suivre, elle a tout à régler.
  redirect(hrefEtapeJackpot(campaign.id, "reglages"));
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
    // Champ absent du formulaire → colonne non touchée (et non remise à null).
    ...(d.code_ttl_days !== undefined
      ? { code_ttl_days: d.code_ttl_days }
      : {}),
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
    public_slug: formData.get("public_slug"),
    validation_mode: formData.get("validation_mode"),
    rotating_period_seconds: formData.get("rotating_period_seconds"),
    min_participation_interval_seconds:
      formData.get("min_participation_interval_seconds"),
    draw_mode: formData.get("draw_mode"),
    threshold: formData.get("threshold"),
    win_probability: formData.get("win_probability"),
    draw_at: formData.get("draw_at"),
    reward_label: formData.get("reward_label"),
    reward_details: formData.get("reward_details"),
    reward_stock: formData.get("reward_stock"),
    display_base: formData.get("display_base"),
    display_increment: formData.get("display_increment"),
    merchant_content: formData.get("merchant_content"),
    // Le réglage n'est lu que si le formulaire porte RÉELLEMENT le champ.
    // '' = « sans limite », valeur LÉGITIME → `has`, jamais `get() ?? ""` :
    // sinon la sauvegarde de tout autre formulaire de la page remettrait
    // l'échéance à « sans limite » sans que le commerçant y ait touché.
    code_ttl_days: formData.has("code_ttl_days")
      ? formData.get("code_ttl_days")
      : undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  let drawAt: string | null;
  try {
    drawAt = parsed.data.draw_at
      ? zonedDateTimeToIso(parsed.data.draw_at, organization.timezone)
      : null;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Date invalide",
    };
  }

  const { id } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("jackpot_campaigns")
    .update(campaignFieldsForMode({ ...parsed.data, draw_at: drawAt }))
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
  // LE STUDIO VIT HORS DE `/dashboard`, il n'est atteint par aucune ligne
  // ci-dessus : Next revalide un CHEMIN, pas une ressource. Sans ce jumeau, un
  // enregistrement réussit et l'écran continue d'afficher la version d'avant —
  // sur un studio, c'est-à-dire à l'endroit précis où l'on règle en regardant.
  // Défaut déjà payé en VIT-37, VIT-39, VIT-41 et VIT-42 ;
  // `src/components/jackpot/studio/revalidation-studio.test.ts` le garde.
  revalidatePath(`/studio/cagnotte/${id}`);
  return { ok: true, data: undefined };
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

  // `jackpot_campaigns.status` n'est plus écrivable par `authenticated`
  // (migration 20260905120000) : les trois transitions passent par la RPC
  // gardée. Elle NE POSE PAS `public_slug` — l'URL publique s'écrit avant, par
  // le client RLS, la colonne gardant son grant (voir plus bas).
  const transitionJackpot = async () => {
    const { data, error } = await supabase.rpc("set_jackpot_campaign_status", {
      p_organization_id: organization.id,
      p_campaign_id: id,
      p_status: status,
    });
    const refus = refusTransition(
      { data, error },
      {
        introuvable: "Campagne introuvable",
        module: "Le module Jackpot collectif n'est pas activé sur votre compte.",
        role: NOT_EDITOR,
        transition: "Ce changement de statut n'est pas permis.",
        echec: "Mise à jour impossible",
      },
    );
    if (refus) console.error("[jackpot] status:", error?.message ?? `rpc=${data}`);
    return refus;
  };

  if (status !== "active") {
    const refus = await transitionJackpot();
    if (refus) return { ok: false, error: refus };
    revalidatePath("/dashboard/jackpot");
    revalidatePath(`/dashboard/jackpot/${id}`);
    // Le studio lit le statut pour sa dernière étape : sans ce jumeau, il
    // annoncerait « cagnotte non ouverte » sur une cagnotte qui vient de l'être.
    revalidatePath(`/studio/cagnotte/${id}`);
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

  // Le prédicat vit dans `src/lib/activation/jackpot.ts` : c'est le MÊME que
  // celui qu'affiche l'étape « La vérification » de l'atelier. Le commerçant
  // lit avant de cliquer ce que ce refus lui opposerait — comportement du
  // serveur inchangé, motifs et ordre compris.
  const blocker = blocageActivationJackpot(campaign);
  if (blocker) return { ok: false, error: blocker };

  // ── L'URL PUBLIQUE S'ÉCRIT AVANT LE STATUT, ET C'EST L'ORDRE IMPOSÉ ──
  //
  // `set_jackpot_campaign_status` ne touche QUE `status` (son commentaire SQL
  // le dit) ; les deux écritures ne peuvent donc plus tenir dans un seul
  // `update`. Le slug passe en premier parce que son échec est le seul des deux
  // qui doit empêcher l'autre : une campagne active sans URL publique n'est
  // jouable par personne. Dans l'autre sens le résidu est bénin — un slug posé
  // sur une campagne restée en brouillon ne mène à rien tant qu'elle n'est pas
  // publiée, et la tentative suivante repasse simplement par la branche
  // « slug déjà posé » ci-dessus.
  if (!campaign.public_slug) {
    // Génération d'un slug unique : on TENTE l'update (le SET public_slug bute
    // sur l'unicité globale → 23505) et on retente avec un suffixe. Pas de
    // lecture préalable : la RLS ne voit pas les slugs des autres tenants.
    const base = jackpotSlugBase(campaign.name);
    let pose = false;
    for (let attempt = 0; attempt < 6 && !pose; attempt += 1) {
      const candidate =
        attempt === 0 ? base : `${base}-${randomCode(4).toLowerCase()}`.slice(0, 64);
      const { error } = await supabase
        .from("jackpot_campaigns")
        .update({ public_slug: candidate })
        .eq("id", id)
        .eq("organization_id", organization.id);
      if (!error) {
        pose = true;
        break;
      }
      if (error.code !== "23505") {
        console.error("[jackpot] activate:", error.message);
        return { ok: false, error: "Mise à jour impossible" };
      }
    }
    if (!pose) {
      return {
        ok: false,
        error: "Impossible de générer une URL publique unique, réessayez.",
      };
    }
  }

  const refus = await transitionJackpot();
  if (refus) return { ok: false, error: refus };

  revalidatePath("/dashboard/jackpot");
  revalidatePath(`/dashboard/jackpot/${id}`);
  // Même motif qu'au refus ci-dessus : la dernière étape du studio lit l'état
  // enregistré, elle doit voir l'ouverture qui vient d'avoir lieu.
  revalidatePath(`/studio/cagnotte/${id}`);
  return { ok: true, data: undefined };
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

    // ── LA FUITE DU CHEMIN CAISSE, COLMATÉE (ID-8b) ──
    //
    // C'était le SEUL chemin d'écriture du module à ne poser aucun pont
    // d'identité. Sans pont, `reward_player_from_legacy` rend `null` pour les
    // gains de cette empreinte et le lot n'apparaît JAMAIS sur
    // `/portefeuille`. On ne peut pas appeler ici
    // `ensureProgressivePlayerIdentity` : elle lit le cookie `lc-player` de la
    // requête, qui est celui du POSTE DE CAISSE — tous les clients servis par
    // ce comptoir convergeraient vers la personne du caissier.
    //
    // APRÈS l'écriture, jamais avant : le pont ne doit pas pouvoir retarder ni
    // faire échouer la validation d'un client au comptoir. `ponter…` avale ses
    // propres erreurs pour la même raison. L'autorisation qui permet cet appel
    // `service_role` est celle qui précède : session, rôle de comptoir, et
    // campagne vérifiée appartenir à l'organisation active.
    //
    // Seul `recorded` déclenche : un `too_soon` ou un jeton rejeté n'a rien
    // écrit, et n'apprend donc rien de neuf au socle.
    if (result.state === "recorded") {
      await ponterIdentiteJackpotCaisse({
        organizationId: organization.id,
        campaignId: parsed.data.campaignId,
        tokenHash: checkin.playerTokenHash,
      });
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
  await observerPressionIp(
    ["jackpot:public:ip", campaignId],
    ip,
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

    if (result.state !== "unavailable") {
      const pont = await ensureProgressivePlayerIdentity({
        organizationId: ctx.campaign.organization_id,
        experienceKind: "jackpot",
        experienceId: ctx.campaign.id,
        legacyIdentityHash: identity.tokenHash,
        acquisitionSource: "direct",
      });
      // LE PONT VIENT D'ÊTRE POSÉ : c'est l'instant, et le seul, où la base
      // peut apprendre que le cookie de ce navigateur et l'empreinte laissée en
      // caisse désignent le même client (ID-8b). Au geste d'ÉCRITURE, jamais à
      // l'affichage — et la RPC de réunion n'est appelée que si un doublon est
      // réellement mesuré (cf. reunirIdentitesJackpot).
      if (pont.ok) {
        await reunirIdentitesJackpot({
          organizationId: ctx.campaign.organization_id,
          campaignId: ctx.campaign.id,
          playerId: pont.playerId,
        });
      }
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
    const pont = await ensureProgressivePlayerIdentity({
      organizationId: ctx.campaign.organization_id,
      experienceKind: "jackpot",
      experienceId: ctx.campaign.id,
      legacyIdentityHash: identity.tokenHash,
      acquisitionSource: "direct",
    });
    // Le QR va être présenté au comptoir, et c'est `participateJackpotStaff`
    // qui écrira sous cette empreinte : le pont doit être posé AVANT, sinon le
    // gain de ce passage resterait sans bénéficiaire sur `/portefeuille`. La
    // réunion suit le pont, aux mêmes conditions que sur la participation.
    if (pont.ok) {
      await reunirIdentitesJackpot({
        organizationId: ctx.campaign.organization_id,
        campaignId: ctx.campaign.id,
        playerId: pont.playerId,
      });
    }
    return { ok: true, data: { token, expiresAt } };
  } catch (err) {
    reportError("jackpot.checkinToken", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ────────────────────────────────────────────────────────────
// getJackpotState — repli polling (jauge de la page suivable)
// ────────────────────────────────────────────────────────────

/**
 * Jauge publique d'une campagne, telle qu'un écran suivable la rafraîchit.
 *
 * `state` porte le MÊME refus indistinct que le reste du module : campagne
 * inexistante, non active, ou module fermé rendent tous `unavailable`, sans
 * dire lequel — l'état de préparation d'un commerçant n'est l'affaire de
 * personne d'autre. `gauge` est alors `null`.
 *
 * AUCUN bloc joueur : seule la jauge PARTAGÉE bouge d'un tour de sondage à
 * l'autre. Les codes de retrait du joueur courant, eux, ne changent qu'après
 * une action qu'il a lui-même déclenchée — les faire voyager à chaque
 * rafraîchissement ferait lire une ligne indexée par joueur et par tour pour
 * une valeur constante.
 */
export interface JackpotPublicGauge {
  state: "ok" | "unavailable";
  gauge: JackpotGaugeView | null;
}

const JACKPOT_INDISPONIBLE: JackpotPublicGauge = {
  state: "unavailable",
  gauge: null,
};

/**
 * Repli POLLING : renvoie la jauge publique d'une campagne (page suivable).
 * Calque de `getCalendarState` — validation Zod, contexte public, compteur
 * d'observabilité sur clé partagée (JAMAIS un refus, ADR-032 : la jauge se
 * remplit vite par OBJECTIF, et l'IP d'un lieu est mutualisée), puis
 * projection. Toute panne rend `unavailable` : cette action ne lève jamais,
 * elle est appelée en boucle depuis un écran de salle.
 */
export async function getJackpotState(input: {
  campaignId: string;
}): Promise<JackpotPublicGauge> {
  const parsed = getJackpotStateSchema.safeParse(input);
  if (!parsed.success) return JACKPOT_INDISPONIBLE;

  try {
    const ctx = await loadJackpotActionContext(parsed.data.campaignId);
    if (!ctx.ok) return JACKPOT_INDISPONIBLE;

    // Observabilité seule (clé partagée, jamais un refus) : le poll est
    // fréquent et légitime, on ne le bride pas — et il a son PROPRE seau.
    // Le verser dans celui des participations aurait fait de trente écrans
    // laissés ouverts un dépassement du seuil d'abus, sans qu'une seule
    // participation ait eu lieu : le signal se serait noyé dans le bruit des
    // écrans. Un sondage n'est pas une participation.
    await observerPressionIp(
      ["jackpot:state:ip", ctx.campaign.id],
      clientIpFromHeaders(await headers()),
      RATE_LIMITS.jackpotStateIp,
      "jackpot_state_pressure",
      { campaign_id: ctx.campaign.id },
    );

    return { state: "ok", gauge: await loadJackpotGauge(ctx.admin, ctx.campaign) };
  } catch (err) {
    reportError("jackpot.state", err);
    return JACKPOT_INDISPONIBLE;
  }
}

// ────────────────────────────────────────────────────────────
// invitationJackpot (panneau d'un AUTRE module, aucune identité requise)
// ────────────────────────────────────────────────────────────

/** Colonnes de campagne exigées par l'invitation, et RIEN de plus. */
const INVITE_CAMPAIGN_COLUMNS = "id, name, public_slug, organization_id";

/** Colonnes d'organisation exigées par `moduleOuvertAuJoueur`, et rien de plus. */
const INVITE_ORG_COLUMNS =
  "id, subscription_status, trial_ends_at, past_due_since, addon_jackpot, comp_access, comp_access_until";

/**
 * Les champs d'organisation que la garde du module exige, et EUX SEULS.
 * `ChampsModule<"jackpot">` les réclame à la compilation : oublier
 * `addon_jackpot` dans le `select` ne se lirait pas `false`, ça ne
 * compilerait pas (miroir de `InvitationOrganization`, src/actions/loyalty.ts).
 */
type InvitationJackpotOrganization = Pick<
  Organization,
  | "id"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_jackpot"
  | "comp_access"
  | "comp_access_until"
>;

/** Ce que le panneau reçoit — et la liste EST le contrat de sécurité. */
export interface InvitationJackpot {
  /** Adresse publique de la page suivie : `/jackpot/<publicSlug>`. */
  publicSlug: string;
  campaignName: string;
}

/**
 * INVITATION À REJOINDRE LE JACKPOT COLLECTIF depuis un autre module.
 *
 * ── LE DÉFAUT QU'ELLE FERME ──
 *
 * Exactement celui de `invitationPasseport` (src/actions/loyalty.ts), un cran
 * plus loin : un commerçant peut exploiter un jackpot collectif ET un
 * calendrier sans que le client qui ouvre sa case apprenne jamais que la
 * jauge existe. Or un jackpot COLLECTIF est le seul module du socle dont la
 * valeur croît avec le nombre de participants — le laisser sans chemin
 * applicatif, c'est le priver de ce qui le fait fonctionner.
 *
 * ── CE QU'ELLE NE FAIT PAS ──
 *
 * Elle NE PARTICIPE PAS. Aucun cookie posé, aucune écriture, aucune
 * incrémentation de la jauge : elle rend de quoi construire un lien. La
 * participation reste un geste explicite, sur la page du jackpot, et elle y
 * exige toujours le code tournant ou la validation en caisse — rejoindre par
 * ce lien ne contourne RIEN de l'anti-triche.
 *
 * ── AUCUN ORACLE : LES QUATRE REFUS SONT LE MÊME `null` ──
 *
 * UUID malformé, organisation inconnue, aucune campagne active, module fermé
 * (abonnement échu / add-on éteint / octroi expiré) — quatre causes, une
 * seule réponse. `organizationId` arrive d'une prop CLIENT : balayer des UUID
 * n'apprend donc rien de plus que visiter la vitrine, où le QR du jackpot est
 * déjà affiché.
 *
 * ── UNE SEULE LECTURE ──
 *
 * `loadJackpotContext` engage la jauge ET l'état du joueur ; il n'est pas
 * appelé ici. La campagne et son organisation viennent d'UN aller-retour
 * (jointure incorporée), avec la garde inter-tenant à la main — la
 * service_role contourne la RLS.
 */
export async function invitationJackpot(input: {
  organizationId: string;
}): Promise<InvitationJackpot | null> {
  const parsed = invitationJackpotSchema.safeParse(input);
  if (!parsed.success) return null;
  const { organizationId } = parsed.data;

  try {
    // Clé PARTAGÉE (organisation + IP) : fail-OPEN, observabilité seule, et
    // consommée AVANT la première requête SQL — ADR-032.
    await observerPressionIp(
      ["jackpot:invite:ip", organizationId],
      clientIpFromHeaders(await headers()),
      RATE_LIMITS.jackpotInvite,
      "jackpot_invite_pressure",
      { organization_id: organizationId },
    );

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("jackpot_campaigns")
      .select(`${INVITE_CAMPAIGN_COLUMNS}, organizations(${INVITE_ORG_COLUMNS})`)
      .eq("organization_id", organizationId)
      .eq("status", "active")
      // Plusieurs campagnes actives sont possibles : la plus récente gagne,
      // choix ARBITRAIRE assumé — le panneau n'a de place que pour une
      // invitation, et la dernière activée est celle dont le commerce parle.
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      reportError("jackpot.invitation", error.message);
      return null;
    }
    if (!data) return null;

    // select() construit la liste de colonnes par gabarit — supabase-js ne
    // peut pas inférer la forme de l'embed depuis une chaîne dynamique.
    // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
    const row = data as unknown as {
      id: string;
      name: string;
      public_slug: string | null;
      organization_id: string;
      organizations: InvitationJackpotOrganization | null;
    };
    const org = row.organizations;
    if (!org || org.id !== row.organization_id) {
      reportError("jackpot.invitation", "organisation incohérente");
      return null;
    }

    if (!(await moduleOuvertAuJoueur("jackpot", org))) return null;

    // Sans `public_slug`, aucune adresse à proposer. On NE retombe PAS sur
    // l'UUID : le slug est posé par trigger à la création, son absence
    // signale une ligne anormale — et un lien en UUID serait une adresse
    // qu'aucun QR ni aucune affiche ne porte.
    if (!row.public_slug) return null;

    return { publicSlug: row.public_slug, campaignName: row.name };
  } catch (err) {
    reportError("jackpot.invitation", err);
    return null;
  }
}
