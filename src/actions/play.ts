"use server";

import { headers } from "next/headers";
import {
  signClaimToken,
  verifyClaimToken,
} from "@/lib/spin";
import { loadPlayContext } from "@/lib/play-context";
import { claimSchema } from "@/lib/validations/play";
import { buildGoogleWalletSaveUrl } from "@/lib/google-wallet";
import { buildAppleWalletPassUrl } from "@/lib/apple-wallet";
import { getOrgOwnerEmail } from "@/lib/merchant-contact";
import { sendPrizeEmail, sendWinNotificationEmail } from "@/lib/resend";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  observeSharedKey,
  RATE_LIMITS,
  rateLimit,
  rateLimitBucket,
} from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { monitored, reportError, reportSecurityEvent } from "@/lib/monitoring";
import { isConsistentClaimResourceChain } from "@/lib/public-resource-guards";
import { writeAuditLog } from "@/lib/audit";
import type { ActionResult } from "@/lib/utils";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { anonymousPlayerKey } from "@/lib/anonymous-player";

export interface SpinOutcome {
  /** Index du segment gagné dans la liste des lots actifs (ordre d'affichage). */
  prizeIndex: number;
  label: string;
  description: string;
  isLosing: boolean;
  /** Présent uniquement pour un lot gagnant : à renvoyer au claim. */
  claimToken: string | null;
}

/**
 * Résultat de spinWheel : comme ActionResult, mais l'échec peut porter
 * une prochaine date d'éligibilité (limite de jeu atteinte) pour
 * afficher un compte à rebours plutôt qu'un simple message bloquant.
 */
export type SpinResult =
  | { ok: true; data: SpinOutcome }
  | { ok: false; error: string; nextEligibleAt?: string };

/**
 * Empreinte joueur pseudonymisée + IP source.
 *
 * L'IP est extraite d'un en-tête de plateforme normalisé (Vercel ou
 * Cloudflare configuré). Le User-Agent reste contrôlable par le client :
 * l'empreinte distingue les usages ordinaires mais Turnstile et la limite IP
 * restent les protections contre une automatisation déterminée.
 */
async function getPlayerFingerprint(): Promise<{
  ip: string;
  playerKey: string;
}> {
  const h = await headers();
  const ip = clientIpFromHeaders(h);
  return { ip, playerKey: await anonymousPlayerKey() };
}

/** Pose le cookie anonyme avant le premier spin, sans collecter de donnée. */
export async function prepareAnonymousPlayer(): Promise<void> {
  await anonymousPlayerKey();
}

/** Récupère un gain récent si la réponse réseau ou la page a été perdue. */
export async function recoverPendingWin(slug: string): Promise<SpinOutcome | null> {
  const ctx = await loadPlayContext(String(slug));
  if (!ctx.ok) return null;
  const playerKey = await anonymousPlayerKey();
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: spin } = await ctx.admin
    .from("spins")
    .select("id, prize_id")
    .eq("wheel_id", ctx.wheel.id)
    .eq("player_key", playerKey)
    .eq("is_losing", false)
    .eq("claimed", false)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!spin?.prize_id) return null;
  const prizeIndex = ctx.prizes.findIndex((prize) => prize.id === spin.prize_id);
  if (prizeIndex < 0) return null;
  const prize = ctx.prizes[prizeIndex];
  return {
    prizeIndex,
    label: prize.label,
    description: prize.description,
    isLosing: false,
    claimToken: signClaimToken(spin.id),
  };
}

export async function spinWheel(
  slug: string,
  _engagementInput?: unknown,
  turnstileToken?: string,
  source?: string,
): Promise<SpinResult> {
  // Opération critique : durée mesurée, lenteurs et erreurs remontées.
  return monitored("play.spinWheel", () =>
    spinWheelInner(slug, turnstileToken, source),
  );
}

/** Origine de la partie, normalisée (jamais confiance à l'entrée client). */
function normalizeSource(source?: string): "direct" | "share" {
  return source === "share" ? "share" : "direct";
}

async function spinWheelInner(
  slug: string,
  turnstileToken?: string,
  source?: string,
): Promise<SpinResult> {
  try {
    const ctx = await loadPlayContext(String(slug));
    if (!ctx.ok) return { ok: false, error: ctx.error };
    const { admin, campaign, wheel, prizes } = ctx;

    if (prizes.length < 2) {
      return { ok: false, error: "Cette roue n'est pas encore configurée." };
    }

    const { ip, playerKey } = await getPlayerFingerprint();

    // Challenge anti-bot (no-op si Turnstile non configuré).
    if (!(await verifyTurnstile(turnstileToken, ip))) {
      reportSecurityEvent("captcha_failed", { wheel_id: wheel.id });
      // Signal visible côté dashboard (encart anti-abus) : pas bloquant.
      await writeAuditLog({
        organizationId: campaign.organization_id,
        actor: "public",
        action: "security.captcha_failed",
        metadata: { wheel_id: wheel.id },
      });
      return {
        ok: false,
        error: "Vérification anti-robot échouée. Rechargez la page et réessayez.",
      };
    }

    // Clé PARTAGÉE (IP) : compteur LARGE et fail-OPEN, observabilité pure. Le
    // devinage anti-bot est déjà arrêté EN AMONT par Turnstile (vérifié plus
    // haut), et la valeur n'est distribuée qu'au `claim`, lui-même borné par
    // l'identité du gain. Une IP partagée (CGNAT, Wi-Fi de commerce) ne peut
    // donc plus servir d'interrupteur qui empêche toute une salle de jouer
    // (ADR-032) : elle incrémente, elle alerte au dépassement, elle ne refuse
    // jamais.
    await observeSharedKey(
      rateLimitBucket("spin:ip", wheel.id, ip),
      RATE_LIMITS.spinIp,
      "spin_ip_pressure",
      { wheel_id: wheel.id },
    );

    // Seaux `failClosed` sur l'IDENTITÉ joueur (empreinte cookie) : anti
    // double-clic (burst) et débit soutenu — ce qui ferme aussi la course sur
    // la limite de jeu ci-dessous. La saturer ne borne que ce joueur.
    const allowed =
      (await rateLimit(
        rateLimitBucket("spin:burst", wheel.id, playerKey),
        RATE_LIMITS.spinBurst,
        { failClosed: true },
      )) &&
      (await rateLimit(
        rateLimitBucket("spin", wheel.id, playerKey),
        RATE_LIMITS.spin,
        { failClosed: true },
      ));
    if (!allowed) {
      reportSecurityEvent("spin_rate_limited", { wheel_id: wheel.id });
      await writeAuditLog({
        organizationId: campaign.organization_id,
        actor: "public",
        action: "security.rate_limited",
        metadata: { wheel_id: wheel.id, scope: "spin" },
      });
      return {
        ok: false,
        error: "Trop de tentatives. Patientez un instant avant de rejouer.",
      };
    }

    // Éligibilité, tirage cryptographique, réservation du stock et insertion
    // du spin sont une seule transaction PostgreSQL verrouillée par joueur.
    const { data: spinRows, error: spinError } = await admin.rpc(
      "perform_atomic_spin",
      {
        p_organization_id: campaign.organization_id,
        p_campaign_id: campaign.id,
        p_wheel_id: wheel.id,
        p_player_key: playerKey,
        p_engagement_action: null,
        p_source: normalizeSource(source),
      },
    );
    if (spinError) {
      reportError("play.atomic-spin", spinError.message);
      return { ok: false, error: "Une erreur est survenue, réessayez." };
    }
    const spin = (spinRows as Array<{
      spin_id: string | null;
      prize_id: string | null;
      is_losing: boolean;
      denial_reason: string | null;
      next_eligible_at: string | null;
    }> | null)?.[0];
    if (!spin?.spin_id) {
      if (spin?.denial_reason === "limit_reached") {
        return {
          ok: false,
          error:
            wheel.play_limit === "once"
              ? "Vous avez déjà joué à ce jeu."
              : wheel.play_limit === "daily"
                ? "Vous avez déjà joué aujourd'hui. Revenez demain !"
                : "Vous avez déjà joué cette semaine. Revenez la semaine prochaine !",
          nextEligibleAt: spin.next_eligible_at ?? undefined,
        };
      }
      return { ok: false, error: "Plus aucun lot disponible pour le moment." };
    }

    const winnerIdx = prizes.findIndex((item) => item.id === spin.prize_id);
    const prize = prizes[winnerIdx];
    if (winnerIdx < 0 || !prize) {
      reportError("play.atomic-spin-prize", "Lot tiré absent du contexte public");
      return { ok: false, error: "Une erreur est survenue, réessayez." };
    }

    return {
      ok: true,
      data: {
        prizeIndex: winnerIdx,
        label: prize.label,
        description: prize.description,
        isLosing: spin.is_losing,
        claimToken: spin.is_losing ? null : signClaimToken(spin.spin_id),
      },
    };
  } catch (err) {
    reportError("play.spinWheel", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}

export interface ClaimResult {
  redeemCode: string;
  /** null si Google Wallet n'est pas configuré pour cette instance. */
  walletUrl: string | null;
  /** null si Apple Wallet n'est pas configuré pour cette instance. */
  appleWalletUrl: string | null;
}

/**
 * Enregistre la participation après le gain. Les données demandées
 * (email, téléphone, prénom) dépendent de la configuration de la
 * campagne — si elle ne collecte rien, le code est délivré directement.
 * Le claim token signé garantit que le gain vient bien d'un spin serveur
 * récent et non réclamé.
 */
export async function claimPrize(input: {
  claimToken: string;
  firstName?: string;
  email?: string;
  phone?: string;
  acceptedTerms?: boolean;
  marketingOptIn?: boolean;
  /** Consentement anniversaire explicite (case dédiée) — facultatif. */
  birthdayOptIn?: boolean;
  /** Date de naissance YYYY-MM-DD — ignorée sans le double consentement. */
  birthDate?: string;
}): Promise<ActionResult<ClaimResult>> {
  // Opération critique : durée mesurée, lenteurs et erreurs remontées.
  return monitored("play.claimPrize", () => claimPrizeInner(input));
}

async function claimPrizeInner(
  input: Parameters<typeof claimPrize>[0],
): Promise<ActionResult<ClaimResult>> {
  try {
    const parsed = claimSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    // ── ORDRE DES GARDES DU CLAIM ────────────────────────────────────────
    // 1. Le JETON D'ABORD. Il est signé HMAC, à durée de vie courte, et
    //    désigne UN spin précis : c'est la seule valeur non falsifiable dont
    //    dispose l'appelant. Sa vérification est purement locale (aucune
    //    requête, aucun appel sortant), donc rien à protéger en amont — et
    //    AUCUN seau n'est consommé avant elle : un flot de jetons forgés ne
    //    peut pas entamer le budget d'un joueur légitime.
    const payload = verifyClaimToken(parsed.data.claimToken);
    if (!payload) {
      return {
        ok: false,
        error: "Ce gain a expiré ou le lien est invalide. Rejouez plus tard.",
      };
    }

    // 2. Seau `failClosed` sur l'IDENTITÉ DU GAIN (spin_id issu du jeton
    //    vérifié). Clé propre à un porteur : le saturer ne borne que le rejeu
    //    de CE gain, jamais un tiers. Remplace l'ancien `claim:ip` — seau
    //    fail-closed sur clé PARTAGÉE (IP seule, portée PLATEFORME, toutes
    //    organisations confondues), consommé avant même la vérification du
    //    jeton : un voisin de CGNAT, ou un abus visant une autre organisation,
    //    suffisait à empêcher un joueur d'encaisser son lot.
    if (
      !(await rateLimit(
        rateLimitBucket("claim:spin", payload.spinId),
        RATE_LIMITS.claim,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de tentatives. Patientez un instant avant de réessayer.",
      };
    }

    // 3. Clé PARTAGÉE (IP) : compteur LARGE et fail-OPEN, observabilité pure.
    //    Il incrémente, il alerte au dépassement, il ne refuse JAMAIS — le
    //    verdict est volontairement ignoré (`rateLimit` appelé sans
    //    `failClosed`).
    const { ip } = await getPlayerFingerprint();
    if (!(await rateLimit(rateLimitBucket("claim:ip", ip), RATE_LIMITS.claimIp))) {
      reportSecurityEvent("claim_ip_pressure", {
        spin_id: payload.spinId,
        limit: RATE_LIMITS.claimIp.limit,
        window_seconds: RATE_LIMITS.claimIp.windowSeconds,
      });
    }

    const admin = createAdminClient();

    const { data: spin } = await admin
      .from("spins")
      .select("*")
      .eq("id", payload.spinId)
      .maybeSingle();

    if (!spin || spin.is_losing || !spin.prize_id) {
      return { ok: false, error: "Gain introuvable." };
    }
    if (spin.claimed) {
      return { ok: false, error: "Ce gain a déjà été enregistré." };
    }

    // Exigences de collecte définies par la campagne (source de vérité
    // serveur : le client ne peut pas contourner le formulaire).
    const { data: campaign } = await admin
      .from("campaigns")
      .select("id, organization_id, collect_email, collect_phone")
      .eq("id", spin.campaign_id)
      .eq("organization_id", spin.organization_id)
      .maybeSingle();

    const [{ data: wheel }, { data: prize }, { data: org }] = await Promise.all([
      admin
        .from("wheels")
        .select("id, organization_id, campaign_id")
        .eq("id", spin.wheel_id)
        .eq("organization_id", spin.organization_id)
        .eq("campaign_id", spin.campaign_id)
        .maybeSingle(),
      admin
        .from("prizes")
        .select("id, organization_id, wheel_id, label, description")
        .eq("id", spin.prize_id)
        .eq("organization_id", spin.organization_id)
        .eq("wheel_id", spin.wheel_id)
        .maybeSingle(),
      admin
        .from("organizations")
        .select("id, name, notify_on_win")
        .eq("id", spin.organization_id)
        .maybeSingle(),
    ]);

    if (
      !campaign ||
      !wheel ||
      !prize ||
      !org ||
      !isConsistentClaimResourceChain({ spin, campaign, wheel, prize })
    ) {
      reportError("play.claim-resource-chain", "Chaîne de gain incohérente");
      reportSecurityEvent("claim_resource_chain_rejected", { spin_id: spin.id });
      return { ok: false, error: "Gain introuvable." };
    }

    const collectEmail = campaign?.collect_email ?? true;
    const collectPhone = campaign?.collect_phone ?? false;
    const collectsData = collectEmail || collectPhone;

    if (collectEmail && !parsed.data.email) {
      return { ok: false, error: "Votre email est requis." };
    }
    if (collectPhone && !parsed.data.phone) {
      return { ok: false, error: "Votre numéro de téléphone est requis." };
    }
    if (collectsData && !parsed.data.firstName) {
      return { ok: false, error: "Votre prénom est requis." };
    }
    // RGPD : consentement explicite dès qu'une donnée est collectée.
    if (collectsData && !parsed.data.acceptedTerms) {
      return {
        ok: false,
        error: "Vous devez accepter les conditions du jeu",
      };
    }

    const { data: claimRows, error: insertError } = await admin.rpc(
      "claim_winning_spin",
      {
        p_spin_id: spin.id,
        p_first_name: parsed.data.firstName || null,
        p_email: parsed.data.email,
        p_phone: parsed.data.phone,
        p_accepted_terms: parsed.data.acceptedTerms,
        p_marketing_opt_in: parsed.data.marketingOptIn,
      },
    );
    const claimRow = (claimRows as Array<{
      participation_id: string;
      redeem_code: string;
    }> | null)?.[0];
    if (insertError || !claimRow) {
      const duplicate = insertError?.message.includes("already claimed") ?? false;
      if (!duplicate) reportError("play.claim-transaction", insertError?.message);
      return {
        ok: false,
        error: duplicate
          ? "Ce gain a déjà été enregistré."
          : "Impossible d'enregistrer votre participation, réessayez.",
      };
    }
    const redeemCode = claimRow.redeem_code;

    // Anniversaire : persisté UNIQUEMENT avec le double consentement
    // (opt-in marketing ET case anniversaire) et un email présent — la
    // ligne newsletter_subscribers vient d'être créée par la RPC de
    // claim. Best-effort : jamais bloquant pour le gain.
    if (
      parsed.data.marketingOptIn &&
      parsed.data.birthdayOptIn &&
      parsed.data.birthDate &&
      parsed.data.email
    ) {
      const { error: birthdayError } = await admin
        .from("newsletter_subscribers")
        .update({ birth_date: parsed.data.birthDate })
        .eq("organization_id", spin.organization_id)
        .eq("email", parsed.data.email);
      if (birthdayError) {
        reportError("play.claim-birthday", birthdayError.message);
      }
    }

    // Best-effort : le code est déjà affiché à l'écran.
    if (collectEmail && parsed.data.email) {
      await sendPrizeEmail({
        to: parsed.data.email,
        firstName: parsed.data.firstName || "cher client",
        prizeLabel: prize?.label ?? "Votre gain",
        prizeDescription: prize?.description ?? "",
        redeemCode,
        organizationName: org?.name ?? "votre commerce",
      });
    }

    // Notification temps réel au commerçant (best-effort, désactivable).
    if (org?.notify_on_win) {
      const ownerEmail = await getOrgOwnerEmail(admin, spin.organization_id);
      if (ownerEmail) {
        await sendWinNotificationEmail({
          to: ownerEmail,
          prizeLabel: prize?.label ?? "Un lot",
          customerFirstName: parsed.data.firstName ?? "",
          redeemCode,
        });
      }
    }

    // Échéance SERVEUR posée par le trigger à l'insertion : les pass
    // Wallet la reflètent (expiration automatique côté portefeuille).
    const { data: participationRow } = await admin
      .from("participations")
      .select("redeem_expires_at")
      .eq("redeem_code", redeemCode)
      .maybeSingle();
    const redeemExpiresAt =
      (participationRow as { redeem_expires_at: string | null } | null)
        ?.redeem_expires_at ?? null;

    const walletUrl = buildGoogleWalletSaveUrl({
      organizationName: org?.name ?? "votre commerce",
      prizeLabel: prize?.label ?? "Votre gain",
      redeemCode,
      redeemExpiresAt,
    });
    const appleWalletUrl = buildAppleWalletPassUrl(redeemCode);

    return { ok: true, data: { redeemCode, walletUrl, appleWalletUrl } };
  } catch (err) {
    reportError("play.claimPrize", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}
