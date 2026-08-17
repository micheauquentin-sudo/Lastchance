"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { anonymousPlayerKey } from "@/lib/anonymous-player";
import { monitored, reportError } from "@/lib/monitoring";
import {
  hasReferralAccess,
  loadReferralActionContext,
  loadReferralPublicContext,
  resolveReferralCampaignId,
} from "@/lib/referral-context";
import {
  mapReferralPublicState,
  mapReferralSpinGrant,
  mapReferralSponsor,
  mapReferralValidation,
  redactReferralValidation,
  type ReferralPublicState,
  type ReferralSponsorResult,
  type ReferralValidationResult,
} from "@/lib/referral";
import {
  RATE_LIMITS,
  rateLimit,
  rateLimitBucket,
} from "@/lib/rate-limit";
import {
  bridgeOfferedSpinToCampaign,
  ensureProgressivePlayerIdentity,
} from "@/lib/player-identity";
import { classerTransition, refusTransition } from "@/lib/publication-transition";
import { clientIpFromHeaders, observerPressionIp } from "@/lib/request-ip";
import { revalidatePlaySlugs } from "@/lib/revalidate-play";
import { signClaimToken } from "@/lib/spin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { type ActionResult } from "@/lib/utils";
import {
  consumeReferralSpinSchema,
  ensureReferralSponsorSchema,
  getReferralStateSchema,
  saveReferralProgramSchema,
  validateReferralSchema,
} from "@/lib/validations/referral";

const GENERIC_ERROR = "Une erreur est survenue, réessayez.";
const RATE_LIMITED = "Trop de tentatives. Patientez un instant.";
const SPIN_UNAVAILABLE = "Tour offert indisponible.";
const NOT_EDITOR = "Action non autorisée";

// ════════════════════════════════════════════════════════════
// Contrôle d'abus — principe de conception du module (ADR-032)
//
// Le parrainage vit sur la roue publique (play/[slug]), servie par le service_role
// à des joueurs derrière le Wi-Fi / CGNAT PARTAGÉ d'un commerce : l'IP est souvent
// COMMUNE. AUCUN seau `failClosed` ne porte donc sur une clé partagée (IP,
// campagne) — un tel seau deviendrait un interrupteur qu'un tiers allume en le
// saturant (« déni de parrainage d'une campagne entière »). Les clés partagées ne
// portent que des compteurs d'OBSERVABILITÉ fail-OPEN (`observeSharedKey`, seau
// `referralPublicIp`).
//
// Le `failClosed` reste légitime — et employé — sur la clé d'IDENTITÉ device
// (`anonymousPlayerKey`, hash SHA-256 sans PII ; seau `referralPlayerAction`) :
// la saturer ne coupe que son porteur, et elle est tranchée AVANT toute RPC et
// avant l'instrumentation (`monitored`).
//
// La borne réelle contre l'abus n'est pas un rate-limit : c'est la PREUVE d'un
// spin RÉEL exigée du filleul (anti-clic), les contraintes d'unicité SQL (un
// parrain/filleul par device, une preuve = un filleul), le plafond/période par
// parrain et le stock FINI obligatoire des lots. Fabriquer N cookies ne crée pas
// N versements.
// ════════════════════════════════════════════════════════════

/** Résolution + identité device + PREMIER REMPART failClosed (ADR-032). */
type ReferralPlayerGuard =
  | { ok: true; campaignId: string; deviceKey: string }
  | { ok: false; reason: "unavailable" | "rate_limited" };

/**
 * Prélude commun aux actions joueur : résout le slug → campagne (qr_codes), pose
 * l'identité device (cookie httpOnly, AUCUN aller-retour base), puis tranche le
 * PREMIER REMPART — un seau `failClosed` sur la clé d'IDENTITÉ device, avant toute
 * RPC, tout appel sortant et toute instrumentation. Slug inconnu → `unavailable`
 * (aucun cookie posé, rien à protéger).
 */
async function beginReferralPlayer(slug: string): Promise<ReferralPlayerGuard> {
  const admin = createAdminClient();
  const campaignId = await resolveReferralCampaignId(admin, slug);
  if (!campaignId) return { ok: false, reason: "unavailable" };

  const deviceKey = await anonymousPlayerKey();

  if (
    !(await rateLimit(
      rateLimitBucket("referral:player", campaignId, deviceKey),
      RATE_LIMITS.referralPlayerAction,
      { failClosed: true },
    ))
  ) {
    return { ok: false, reason: "rate_limited" };
  }
  return { ok: true, campaignId, deviceKey };
}

/** Seau d'observabilité de la pression publique (clé partagée, jamais un refus). */
async function observeReferralPressure(campaignId: string, ip: string): Promise<void> {
  await observerPressionIp(
    ["referral:public:ip", campaignId],
    ip,
    RATE_LIMITS.referralPublicIp,
    "referral_public_pressure",
    { campaign_id: campaignId },
    );
}

// ────────────────────────────────────────────────────────────
// ensureReferralSponsor — devenir parrain (get-or-create, opt-in email)
// ────────────────────────────────────────────────────────────

/**
 * Devenir parrain d'une campagne (get-or-create idempotent) : résout la campagne
 * par son slug, pose l'identité device (clé du parrain), appelle
 * ensure_referral_sponsor et renvoie le jeton PR-… + l'état pour bâtir le lien
 * `/play/[slug]?ref=<code>`. L'email opt-in est RGPD : EXPLICITE côté UI, jamais
 * pré-coché ; la RPC ne fait MONTER l'email (jamais l'effacer).
 */
export async function ensureReferralSponsor(input: {
  slug: string;
  email?: string;
}): Promise<ActionResult<ReferralSponsorResult>> {
  const parsed = ensureReferralSponsorSchema.safeParse({
    slug: input.slug,
    email: input.email ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const guard = await beginReferralPlayer(parsed.data.slug);
  if (!guard.ok) {
    if (guard.reason === "rate_limited") return { ok: false, error: RATE_LIMITED };
    return { ok: true, data: mapReferralSponsor({ state: "unavailable" }) };
  }

  return monitored("referral.ensureSponsor", () =>
    ensureSponsorInner(parsed.data, guard.campaignId, guard.deviceKey),
  );
}

async function ensureSponsorInner(
  parsed: { slug: string; email?: string },
  campaignId: string,
  deviceKey: string,
): Promise<ActionResult<ReferralSponsorResult>> {
  try {
    const ctx = await loadReferralActionContext(campaignId);
    if (!ctx.ok) {
      return { ok: true, data: mapReferralSponsor({ state: "unavailable" }) };
    }

    await observeReferralPressure(campaignId, clientIpFromHeaders(await headers()));

    const { data, error } = await ctx.admin.rpc("ensure_referral_sponsor", {
      p_campaign_id: campaignId,
      p_sponsor_key: deviceKey,
      p_email: parsed.email ?? undefined,
    });
    if (error) {
      reportError("referral.ensureSponsor", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const sponsor = mapReferralSponsor(data);
    // ── PONT D'IDENTITÉ : la famille `referral` en était absente ──────────
    //
    // Le parrain gagnait bien ses lots (les triggers du registre universel les
    // inscrivent), mais avec `player_id` null : `reward_player_from_legacy`
    // n'avait aucun pont à lire pour cette famille, `/portefeuille` filtrant
    // sur `player_id`, ses lots de parrainage n'y figuraient jamais — alors
    // que la page promet « les lots gagnés depuis ce téléphone ». Une mission
    // de saison portant sur « referral » restait inerte pour la même raison.
    //
    // La clé passée est celle que le registre interroge pour un parrain :
    // `referral_sponsors.sponsor_key`, c'est-à-dire l'empreinte device. Et
    // l'expérience est le PROGRAMME (`rp.id`), jamais la campagne.
    if (sponsor.state === "ready") {
      await ensureProgressivePlayerIdentity({
        organizationId: ctx.organizationId,
        experienceKind: "referral",
        experienceId: ctx.programId,
        legacyIdentityHash: deviceKey,
        acquisitionSource: "direct",
      });
    }
    return { ok: true, data: sponsor };
  } catch (err) {
    reportError("referral.ensureSponsor", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ────────────────────────────────────────────────────────────
// validateReferral — un filleul valide le parrainage (APRÈS son spin)
// ────────────────────────────────────────────────────────────

/**
 * Valide un parrainage : le FILLEUL, après avoir VRAIMENT joué la roue de la
 * campagne (proofSpinId = son spin réel, gagnant OU perdant), fait progresser la
 * jauge de l'équipe. L'identité device courante est la clé du filleul ; `ref` est
 * le jeton du parrain capté dans l'URL. Toutes les protections (anti-clic,
 * self-parrainage, doublon, boucle, plafond, période, stock) sont appliquées SOUS
 * VERROU côté RPC — l'action ne transporte que l'issue CLIENT (redactReferralValidation) :
 * `validated` (+ récompense filleul {kind, code?, grant?}), `unavailable`, ou un refus
 * GÉNÉRIQUE `rejected`. Les motifs de refus distincts (invalid, self, doublon, boucle,
 * plafond, période, preuve absente) ne franchissent JAMAIS le réseau — aucun oracle sur
 * l'existence ou l'état d'un code PR-…
 */
export async function validateReferral(input: {
  slug: string;
  ref: string;
  proofSpinId: string;
  email?: string;
}): Promise<ActionResult<ReferralValidationResult>> {
  const parsed = validateReferralSchema.safeParse({
    slug: input.slug,
    ref: input.ref,
    proofSpinId: input.proofSpinId,
    email: input.email ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const guard = await beginReferralPlayer(parsed.data.slug);
  if (!guard.ok) {
    if (guard.reason === "rate_limited") return { ok: false, error: RATE_LIMITED };
    return { ok: true, data: mapReferralValidation({ state: "unavailable" }) };
  }

  return monitored("referral.validate", () =>
    validateInner(parsed.data, guard.campaignId, guard.deviceKey),
  );
}

async function validateInner(
  parsed: { slug: string; ref: string; proofSpinId: string; email?: string },
  campaignId: string,
  deviceKey: string,
): Promise<ActionResult<ReferralValidationResult>> {
  try {
    const ctx = await loadReferralActionContext(campaignId);
    if (!ctx.ok) {
      return { ok: true, data: mapReferralValidation({ state: "unavailable" }) };
    }

    const ip = clientIpFromHeaders(await headers());
    await observeReferralPressure(campaignId, ip);

    const { data, error } = await ctx.admin.rpc("validate_referral", {
      p_campaign_id: campaignId,
      p_referral_code: parsed.ref,
      p_filleul_key: deviceKey,
      p_proof_spin_id: parsed.proofSpinId,
      p_filleul_email: parsed.email ?? undefined,
      // `p_ip` n'est PLUS transmis : la fonction SQL l'ignore depuis qu'elle ne
      // journalise plus l'adresse. Continuer à l'envoyer ferait traverser une
      // donnée personnelle jusqu'à la base pour rien — et la première personne
      // qui rebrancherait un `insert` dessus le ferait sans s'en apercevoir.
      // La pression par IP reste mesurée EN MÉMOIRE, juste au-dessus.
    });
    if (error) {
      reportError("referral.validate", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }
    const validation = mapReferralValidation(data);
    // Pont d'identité du FILLEUL, et seulement s'il est réellement rattaché :
    // le registre universel résout son lot par `referral_signups.filleul_key`,
    // qui est cette même empreinte device. Posé sur `validated` uniquement —
    // un refus (self-parrainage, doublon, plafond) n'a créé aucune ligne à
    // relier, et poser le pont quand même inscrirait une adhésion pour un
    // joueur que le programme n'a pas accepté.
    if (validation.state === "validated") {
      await ensureProgressivePlayerIdentity({
        organizationId: ctx.organizationId,
        experienceKind: "referral",
        experienceId: ctx.programId,
        legacyIdentityHash: deviceKey,
        acquisitionSource: "referral",
      });
    }
    // Collapse client : les motifs de refus distincts sont écrasés en `rejected`
    // AVANT de partir sur le réseau (aucun oracle sur un code PR-…). Le mapper reste
    // fidèle au jsonb ; seule cette couche action neutralise l'issue exposée.
    return { ok: true, data: redactReferralValidation(validation) };
  } catch (err) {
    reportError("referral.validate", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ────────────────────────────────────────────────────────────
// consumeReferralSpin — tour de roue offert par un versement `spin`
// ────────────────────────────────────────────────────────────

/** Issue d'un tour de roue offert consommé, prête pour l'UI de la roue. */
export interface ReferralSpinOutcome {
  state: "spun" | "already_consumed" | "no_prize";
  wheelId: string | null;
  prizeId: string | null;
  isLosing: boolean;
  /** Index du lot dans la roue cible (animation), null si perdant/indispo. */
  prizeIndex: number | null;
  label: string | null;
  description: string | null;
  /** Gain non perdant : jeton signé à passer à claimPrize (flux GAIN-…). */
  claimToken: string | null;
}

interface SpinRow {
  wheelId: string;
  prizeId: string | null;
  isLosing: boolean;
}

/** Relit un spin (reprise already_consumed via resulting_spin_id). */
async function loadSpinRow(
  admin: ReturnType<typeof createAdminClient>,
  spinId: string,
): Promise<SpinRow | null> {
  const { data } = await admin
    .from("spins")
    .select("wheel_id, prize_id, is_losing")
    .eq("id", spinId)
    .maybeSingle();
  if (!data) return null;
  return {
    wheelId: data.wheel_id as string,
    prizeId: (data.prize_id as string | null) ?? null,
    isLosing: data.is_losing as boolean,
  };
}

/** Enrichit l'issue avec le libellé et l'index du lot dans la roue cible. */
async function enrichSpinPrize(
  admin: ReturnType<typeof createAdminClient>,
  wheelId: string | null,
  prizeId: string | null,
): Promise<{ prizeIndex: number | null; label: string | null; description: string | null }> {
  const empty = { prizeIndex: null, label: null, description: null };
  if (!wheelId || !prizeId) return empty;

  const { data } = await admin
    .from("prizes")
    .select("id, label, description, position, created_at")
    .eq("wheel_id", wheelId)
    .eq("is_active", true);
  const prizes = ((data as Array<{
    id: string;
    label: string;
    description: string;
    position: number;
    created_at: string;
  }> | null) ?? []).sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
  );
  const idx = prizes.findIndex((p) => p.id === prizeId);
  if (idx < 0) return empty;
  return { prizeIndex: idx, label: prizes[idx].label, description: prizes[idx].description };
}

/**
 * Consomme un tour de roue offert (versement `spin` d'un parrainage). Échange le
 * grant_token contre un tirage atomique sur la roue ACTIVE de la campagne via
 * consume_referral_spin_grant, puis, pour un gain non perdant, signe un jeton
 * claim (spin_id) rebranché sur le flux claimPrize existant (code GAIN-…). Le
 * player_key du spin étant la clé device, la reprise passe par resulting_spin_id
 * (état already_consumed). Miroir EXACT de consumeLoyaltySpin / consumeCalendarSpin.
 */
export async function consumeReferralSpin(input: {
  slug: string;
  grantToken: string;
}): Promise<ActionResult<ReferralSpinOutcome>> {
  const parsed = consumeReferralSpinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const guard = await beginReferralPlayer(parsed.data.slug);
  if (!guard.ok) {
    if (guard.reason === "rate_limited") return { ok: false, error: RATE_LIMITED };
    return { ok: false, error: SPIN_UNAVAILABLE };
  }

  return monitored("referral.consumeSpin", () =>
    consumeSpinInner(parsed.data, guard.campaignId, guard.deviceKey),
  );
}

async function consumeSpinInner(
  parsed: { slug: string; grantToken: string },
  campaignId: string,
  deviceKey: string,
): Promise<ActionResult<ReferralSpinOutcome>> {
  try {
    const ctx = await loadReferralActionContext(campaignId);
    if (!ctx.ok) return { ok: false, error: SPIN_UNAVAILABLE };

    // Clé PARTAGÉE (campagne + IP) : fail-OPEN, observabilité seule.
    await observeReferralPressure(campaignId, clientIpFromHeaders(await headers()));

    const { data, error } = await ctx.admin.rpc("consume_referral_spin_grant", {
      p_campaign_id: campaignId,
      p_key: deviceKey,
      p_grant_token: parsed.grantToken,
    });
    if (error) {
      reportError("referral.consumeSpin", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const grant = mapReferralSpinGrant(data);
    if (grant.state === "unavailable") {
      return { ok: false, error: SPIN_UNAVAILABLE };
    }
    if (grant.state === "no_prize") {
      return {
        ok: true,
        data: {
          state: "no_prize",
          wheelId: grant.wheelId,
          prizeId: null,
          isLosing: false,
          prizeIndex: null,
          label: null,
          description: null,
          claimToken: null,
        },
      };
    }

    // spun / already_consumed : reconstruire l'issue à partir du spin.
    let wheelId = grant.wheelId;
    let prizeId = grant.prizeId;
    let isLosing = grant.isLosing;
    if (grant.state === "already_consumed" && grant.spinId) {
      const spin = await loadSpinRow(ctx.admin, grant.spinId);
      if (spin) {
        wheelId = spin.wheelId;
        prizeId = spin.prizeId;
        isLosing = spin.isLosing;
      }
    }

    const enriched = await enrichSpinPrize(ctx.admin, wheelId, prizeId);
    const claimToken =
      !isLosing && prizeId && grant.spinId ? signClaimToken(grant.spinId) : null;

    // PONT `campaign` DU TOUR OFFERT (voir `bridgeOfferedSpinToCampaign`).
    //
    // Ce module pose déjà le pont de SA famille ; aucun ne posait celui de la
    // CAMPAGNE sur laquelle le tour offert est réellement joué. La
    // `participations` que `claimPrize` va créer est pourtant résolue par le
    // triplet (`campaign`, campaign_id, player_key) : sans ce pont, son
    // `player_id` reste null et le lot n'apparaît jamais sur `/portefeuille`.
    //
    // Posé ICI et pas plus haut : un jeton de claim émis est la condition
    // exacte sous laquelle une participation peut naître. Un tour perdant ou
    // sans lot n'a aucun lot à faire figurer nulle part.
    if (claimToken && grant.spinId) {
      await bridgeOfferedSpinToCampaign(ctx.admin, grant.spinId);
    }

    return {
      ok: true,
      data: {
        state: grant.state,
        wheelId,
        prizeId,
        isLosing,
        prizeIndex: enriched.prizeIndex,
        label: enriched.label,
        description: enriched.description,
        claimToken,
      },
    };
  } catch (err) {
    reportError("referral.consumeSpin", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ────────────────────────────────────────────────────────────
// getReferralState — repli polling (page parrain suivable)
// ────────────────────────────────────────────────────────────

/**
 * Repli POLLING : renvoie l'état public du parrain courant (jauge, coffre, SES
 * codes/jetons). Le parrain inconnu voit une jauge 0 ; la RPC ne révèle jamais
 * les versements d'un autre parrain (non-fuite).
 *
 * TOUTE la chaîne de lecture — résolution du slug, gardes (addon + abonnement +
 * programme activé + campagne dans sa fenêtre), identité device en LECTURE SEULE,
 * et appel de `referral_public_state` sous cette SEULE identité — vit dans
 * `loadReferralPublicContext`. Elle a été recopiée ici à la main pendant tout le
 * module, en double d'une version sans appelant : deux copies d'une même règle
 * finissent par diverger, et c'est la morte qu'on relit en croyant relire la
 * vivante. Une seule source, prouvée une fois (src/lib/referral-context.test.ts).
 *
 * Restent à cette couche les deux choses qui lui appartiennent : la validation de
 * l'entrée, et le compteur de pression sur clé PARTAGÉE — observabilité fail-open,
 * jamais un frein (ADR-032) : un poll est fréquent et légitime, on ne le bride pas.
 * Tout refus retombe sur le MÊME état neutre : aucun oracle.
 */
export async function getReferralState(input: {
  slug: string;
}): Promise<ReferralPublicState> {
  const parsed = getReferralStateSchema.safeParse(input);
  if (!parsed.success) return mapReferralPublicState(null);

  const ctx = await loadReferralPublicContext(parsed.data.slug);
  if (!ctx.ok) return mapReferralPublicState(null);

  // Compté après la lecture plutôt qu'avant : le seau partagé mesure les polls
  // réellement SERVIS. Il reste fail-open (observeSharedKey ne refuse jamais),
  // ce déplacement ne peut donc fermer la porte à aucun joueur.
  await observeReferralPressure(ctx.campaignId, clientIpFromHeaders(await headers()));

  return ctx.publicState;
}

// ════════════════════════════════════════════════════════════
// Dashboard commerçant — configuration du programme (session + RLS éditeurs)
// ════════════════════════════════════════════════════════════

/** Config d'un versement telle que reçue du formulaire d'édition. */
export interface ReferralRewardInput {
  kind: "none" | "spin" | "lot";
  label?: string;
  details?: string;
  stock?: string | number;
}

type ParsedReward = { kind: "none" | "spin" | "lot"; label: string; details: string; stock: number | null };

/**
 * Colonnes d'un versement normalisées selon son kind (miroir de dayFieldsForType /
 * milestoneFieldsForType, et des CHECK SQL referral_programs_*_lot_stock_check) :
 * un `lot` porte libellé + détails + stock FINI ; `spin`/`none` remettent
 * label='', details=null, stock=null (un tour offert est borné par le stock réel
 * de la roue, pas par un stock propre). Écraser les champs hors-usage évite une
 * erreur SQL brute 23514. Les compteurs *_claimed_count NE SONT JAMAIS touchés
 * (RPC-only : validate_referral).
 */
function referralRewardColumns(reward: ParsedReward): {
  kind: string;
  label: string;
  details: string | null;
  stock: number | null;
} {
  const isLot = reward.kind === "lot";
  return {
    kind: reward.kind,
    label: isLot ? reward.label : "",
    details: isLot ? reward.details || null : null,
    stock: isLot ? reward.stock : null,
  };
}

/** Champs de config (communs insert + update), hors campaign_id/org_id/updated_at. */
function programConfigFields(parsed: {
  enabled: boolean;
  chestThreshold: number;
  sponsorMaxFilleuls: number;
  windowDays: number;
  codeTtlDays?: number | null;
  sponsor: ParsedReward;
  filleul: ParsedReward;
  chest: ParsedReward;
}) {
  const sponsor = referralRewardColumns(parsed.sponsor);
  const filleul = referralRewardColumns(parsed.filleul);
  const chest = referralRewardColumns(parsed.chest);
  return {
    enabled: parsed.enabled,
    chest_threshold: parsed.chestThreshold,
    sponsor_max_filleuls: parsed.sponsorMaxFilleuls,
    window_days: parsed.windowDays,
    sponsor_reward_kind: sponsor.kind,
    sponsor_reward_label: sponsor.label,
    sponsor_reward_details: sponsor.details,
    sponsor_reward_stock: sponsor.stock,
    filleul_reward_kind: filleul.kind,
    filleul_reward_label: filleul.label,
    filleul_reward_details: filleul.details,
    filleul_reward_stock: filleul.stock,
    chest_reward_kind: chest.kind,
    chest_reward_label: chest.label,
    chest_reward_details: chest.details,
    chest_reward_stock: chest.stock,
    // Échéance du code PARRAIN- — à NE PAS confondre avec `window_days`
    // ci-dessus (délai de validation d'un filleul, avant la récompense) : ici
    // c'est la durée pendant laquelle le lot déjà gagné reste encaissable.
    // Champ absent de l'entrée → colonne non touchée à l'update, laissée à son
    // défaut SQL (null, sans limite) à l'insert.
    ...(parsed.codeTtlDays !== undefined
      ? { code_ttl_days: parsed.codeTtlDays }
      : {}),
  };
}

/**
 * Enregistre (crée ou met à jour) le programme de parrainage d'une campagne
 * roue. AUTHENTIFIÉE, session + RLS is_org_editor. Miroir de updateCalendar /
 * updateCalendarDay : rôle owner|editor, campagne de l'org obligatoire, champs
 * normalisés par kind. Activer le parrainage (enabled=true) exige le module actif
 * (hasReferralAccess), comme setCalendarStatus exige hasCalendarAccess.
 *
 * UPSERT respectant les grants de colonnes de la migration (l'UPDATE n'a PAS le
 * droit sur campaign_id/organization_id, l'INSERT n'a PAS le droit sur updated_at
 * ni sur les *_claimed_count RPC-only) : on tente d'abord l'UPDATE (config +
 * updated_at) ; à défaut de ligne, on INSÈRE (config + campaign_id + org_id). Une
 * course concurrente est rattrapée par unique(campaign_id) → 23505 → nouvel UPDATE.
 */
export async function saveReferralProgram(input: {
  campaignId: string;
  enabled: boolean;
  chestThreshold: number | string;
  sponsorMaxFilleuls: number | string;
  windowDays: number | string;
  /** Échéance du code PARRAIN-, en jours. '' = sans limite ; ABSENT = ne pas
   *  toucher au réglage. Distinct de `windowDays`, qui borne la VALIDATION
   *  d'un filleul et non la validité du lot gagné. */
  codeTtlDays?: number | string | null;
  sponsor: ReferralRewardInput;
  filleul: ReferralRewardInput;
  chest: ReferralRewardInput;
}): Promise<ActionResult> {
  const rewardForSchema = (r: ReferralRewardInput | undefined) => ({
    kind: r?.kind ?? "none",
    label: r?.label ?? "",
    details: r?.details ?? "",
    stock: r?.stock ?? "",
  });
  const parsed = saveReferralProgramSchema.safeParse({
    campaignId: input.campaignId,
    enabled: input.enabled ?? false,
    chestThreshold: input.chestThreshold,
    sponsorMaxFilleuls: input.sponsorMaxFilleuls,
    windowDays: input.windowDays,
    // Même garde que les cinq actions FormData, transposée à une entrée typée :
    // la valeur est passée TELLE QUELLE, donc l'absence de la clé (`undefined`)
    // se distingue de la chaîne vide, qui vaut « sans limite ». Surtout PAS
    // `input.codeTtlDays ?? ""`, l'équivalent exact du `formData.get(...) ?? ""`
    // proscrit ailleurs : tout écran appelant cette action sans porter le champ
    // effacerait l'échéance sans que personne y ait touché.
    codeTtlDays: input.codeTtlDays,
    sponsor: rewardForSchema(input.sponsor),
    filleul: rewardForSchema(input.filleul),
    chest: rewardForSchema(input.chest),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  // Activer le parrainage exige le module actif (addon + abonnement), comme
  // l'activation d'un calendrier. Un programme déjà activé qu'on ré-enregistre
  // avec enabled=false reste toujours autorisé (on ne bloque que l'allumage).
  if (parsed.data.enabled && !hasReferralAccess(organization)) {
    return {
      ok: false,
      error: "Le module Parrainage n'est pas activé sur votre compte.",
    };
  }

  const supabase = await createClient();

  // Multi-tenant : la campagne doit appartenir à l'organisation active (message
  // clair plutôt qu'une violation de FK composite brute).
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", parsed.data.campaignId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!campaign) return { ok: false, error: "Campagne introuvable" };

  // ── `enabled` SORT DE LA CONFIG, ET RIEN D'AUTRE NE BOUGE ──
  //
  // `referral_programs.enabled` n'est plus écrivable par `authenticated`
  // (migration 20260905120000) : c'est la publication du module, elle passe
  // par `set_referral_program_enabled`. Le point délicat est que ce panneau
  // n'a AUCUN chemin séparé — le commerçant enregistre dix-sept colonnes et un
  // interrupteur d'un seul geste, et il doit continuer à ne rien remarquer.
  //
  // Découpage : la config part par le client RLS comme avant, l'interrupteur
  // suit par la RPC. LA CONFIG PASSE EN PREMIER, et l'inverse serait le mauvais
  // choix — allumer d'abord puis échouer à écrire la config ferait tourner un
  // programme de parrainage sur des récompenses et des seuils que le commerçant
  // croit avoir changés. Dans l'ordre retenu, un échec laisse la config
  // enregistrée et l'interrupteur là où il était : ce que l'écran rouvre est
  // vrai, et le second enregistrement finit le travail.
  //
  // À l'INSERT, `enabled` reste dans la ligne : la création est atomique, et
  // le trigger `referral_programs_guard_publication` refuse lui-même un
  // `enabled = true` sans droit — comportement voulu, non contourné.
  const { enabled, ...config } = programConfigFields(parsed.data);

  /** Bascule l'interrupteur si besoin. `null` = rien à signaler. */
  const basculerInterrupteur = async (programId: string) => {
    // Appelée sans lire l'état courant : la RPC compare elle-même sous
    // `for update` et rend `true` sans rien écrire quand la valeur est déjà la
    // bonne — donc pas d'entrée d'audit parasite au ré-enregistrement, et pas
    // de fenêtre entre une lecture et une écriture.
    const reponse = await supabase.rpc("set_referral_program_enabled", {
      p_organization_id: organization.id,
      p_program_id: programId,
      p_enabled: parsed.data.enabled,
    });
    const refus = refusTransition(reponse, {
      introuvable: "Programme de parrainage introuvable",
      module: "Le module Parrainage n'est pas activé sur votre compte.",
      role: NOT_EDITOR,
      transition: "Ce changement de statut n'est pas permis.",
      echec: "Enregistrement impossible",
    });
    if (refus) {
      console.error(
        "[referral] save program (enabled):",
        reponse.error?.message ?? `rpc=${reponse.data}`,
      );
    }
    return refus;
  };

  const { data: updated, error: updateError } = await supabase
    .from("referral_programs")
    .update({ ...config, updated_at: new Date().toISOString() })
    .eq("campaign_id", parsed.data.campaignId)
    .eq("organization_id", organization.id)
    .select("id");
  if (updateError) {
    console.error("[referral] save program (update):", updateError.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

  if (updated && updated.length > 0) {
    const refus = await basculerInterrupteur(updated[0].id);
    if (refus) return { ok: false, error: refus };
  } else {
    const { error: insertError } = await supabase
      .from("referral_programs")
      .insert({
        campaign_id: parsed.data.campaignId,
        organization_id: organization.id,
        enabled,
        ...config,
      });
    if (insertError) {
      // Course : une ligne vient d'apparaître (unique campaign_id) → on met à jour.
      if (insertError.code === "23505") {
        const { data: retried, error: retryError } = await supabase
          .from("referral_programs")
          .update({ ...config, updated_at: new Date().toISOString() })
          .eq("campaign_id", parsed.data.campaignId)
          .eq("organization_id", organization.id)
          .select("id");
        if (retryError) {
          console.error("[referral] save program (retry):", retryError.message);
          return { ok: false, error: "Enregistrement impossible" };
        }
        if (retried && retried.length > 0) {
          const refus = await basculerInterrupteur(retried[0].id);
          if (refus) return { ok: false, error: refus };
        }
      } else {
        console.error("[referral] save program (insert):", insertError.message);
        // ── UNE SEULE CAUSE, UN SEUL VOCABULAIRE ──
        //
        // `enabled` reste dans la ligne à la création (voir plus haut : la
        // création est atomique, le trigger `referral_programs_guard_publication`
        // fait le gardien) — donc c'est ce trigger qui refuse, par un `P0001`
        // que le test `code === "23505"` ne reconnaît pas et qui tombait ici.
        // Le commerçant lisait « Enregistrement impossible » à la création et
        // « Le module Parrainage n'est pas activé sur votre compte » à la
        // modification, pour un refus rigoureusement identique, à dix lignes
        // d'écart dans la même fonction.
        //
        // Seule l'issue `module` est traduite : `guard_module_publication` ne
        // porte qu'un `raise`, celui d'`assert_module_publish_allowed`. Un
        // refus RLS arrive en `42501` avec un tout autre texte et reste, à
        // juste titre, « Enregistrement impossible ».
        if (classerTransition({ data: null, error: insertError }) === "module") {
          return {
            ok: false,
            error: "Le module Parrainage n'est pas activé sur votre compte.",
          };
        }
        return { ok: false, error: "Enregistrement impossible" };
      }
    }
  }

  revalidatePath(`/dashboard/campaigns/${parsed.data.campaignId}`);
  // Le flag/États du parrainage sont rendus dans le HTML ISR de /play/[slug] :
  // purge le cache des QR de la campagne pour que l'activation/désactivation
  // s'y reflète sans attendre l'expiration ISR (30 s).
  await revalidatePlaySlugs(supabase, { campaignId: parsed.data.campaignId });
  return { ok: true, data: undefined };
}
