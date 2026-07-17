"use server";

import { headers } from "next/headers";
import {
  computePlayerKey,
  nextPlayWindowStart,
  pickWeightedIndex,
  playWindowStart,
  signClaimToken,
  verifyClaimToken,
} from "@/lib/spin";
import { loadPlayContext } from "@/lib/play-context";
import { enabledEngagementActions } from "@/lib/engagement";
import { claimSchema, spinEngagementSchema } from "@/lib/validations/play";
import { buildGoogleWalletSaveUrl } from "@/lib/google-wallet";
import { getOrgOwnerEmail } from "@/lib/merchant-contact";
import { sendPrizeEmail, sendWinNotificationEmail } from "@/lib/resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { monitored, reportError, reportSecurityEvent } from "@/lib/monitoring";
import { isConsistentClaimResourceChain } from "@/lib/public-resource-guards";
import { writeAuditLog } from "@/lib/audit";
import { sendWebhookEvent } from "@/lib/webhooks";
import { randomCode, type ActionResult } from "@/lib/utils";
import { clientIpFromHeaders } from "@/lib/request-ip";

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
  const ua = h.get("user-agent") ?? "unknown";
  return { ip, playerKey: computePlayerKey(ip, ua) };
}

export async function spinWheel(
  slug: string,
  engagementInput?: unknown,
  turnstileToken?: string,
  source?: string,
): Promise<SpinResult> {
  // Opération critique : durée mesurée, lenteurs et erreurs remontées.
  return monitored("play.spinWheel", () =>
    spinWheelInner(slug, engagementInput, turnstileToken, source),
  );
}

/** Origine de la partie, normalisée (jamais confiance à l'entrée client). */
function normalizeSource(source?: string): "direct" | "share" {
  return source === "share" ? "share" : "direct";
}

async function spinWheelInner(
  slug: string,
  engagementInput?: unknown,
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

    // Rate limiting : par IP (drainage de stock, bots) puis par empreinte
    // joueur (débit soutenu + anti double-clic, ce qui ferme aussi la
    // course sur la limite de jeu ci-dessous).
    const allowed =
      (await rateLimit(
        rateLimitBucket("spin:ip", wheel.id, ip),
        RATE_LIMITS.spinIp,
        { failClosed: true },
      )) &&
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

    // Actions d'engagement : si la campagne en a activé, le joueur
    // doit en avoir choisi une (revérifié côté serveur, jamais confiance
    // au client seul).
    const parsedEngagement = spinEngagementSchema.safeParse(
      engagementInput ?? null,
    );
    if (!parsedEngagement.success) {
      return { ok: false, error: "Action invalide." };
    }
    const engagement = parsedEngagement.data;
    const requiredActions = enabledEngagementActions(campaign.engagement);

    if (requiredActions.length > 0) {
      const chosen = requiredActions.find(
        (a) => a.action === engagement?.action,
      );
      if (!chosen) {
        return {
          ok: false,
          error: "Choisissez une action pour débloquer la roue.",
        };
      }
      if (chosen.action === "newsletter" && !engagement?.email) {
        return {
          ok: false,
          error: "Votre email est requis pour l'inscription à la newsletter.",
        };
      }
    }

    // Limite de jeu — vérifiée sur les spins, pas les participations :
    // impossible de relancer la roue jusqu'au lot désiré.
    const windowStart = playWindowStart(wheel.play_limit, new Date());
    if (windowStart) {
      const { count } = await admin
        .from("spins")
        .select("id", { count: "exact", head: true })
        .eq("wheel_id", wheel.id)
        .eq("player_key", playerKey)
        .gte("created_at", windowStart.toISOString());
      if ((count ?? 0) > 0) {
        const next = nextPlayWindowStart(wheel.play_limit, new Date());
        return {
          ok: false,
          error:
            wheel.play_limit === "once"
              ? "Vous avez déjà joué à ce jeu."
              : wheel.play_limit === "daily"
                ? "Vous avez déjà joué aujourd'hui. Revenez demain !"
                : "Vous avez déjà joué cette semaine. Revenez la semaine prochaine !",
          nextEligibleAt: next ? next.toISOString() : undefined,
        };
      }
    }

    // Inscription newsletter (consentement explicite du joueur), avant le
    // tirage : l'action est faite même si la roue ne donne rien.
    if (
      requiredActions.length > 0 &&
      engagement?.action === "newsletter" &&
      engagement.email
    ) {
      const { data: newSubscriber, error: newsletterError } = await admin
        .from("newsletter_subscribers")
        .upsert(
          {
            organization_id: campaign.organization_id,
            email: engagement.email,
            source: "wheel",
          },
          { onConflict: "organization_id,email", ignoreDuplicates: true },
        )
        .select("id");
      if (newsletterError) {
        reportError("play.newsletter", newsletterError.message);
      } else if ((newSubscriber?.length ?? 0) > 0) {
        const { data: webhookOrg } = await admin
          .from("organizations")
          .select("webhook_url, webhook_secret")
          .eq("id", campaign.organization_id)
          .maybeSingle();
        // Nouvel abonné uniquement (ignoreDuplicates ne renvoie rien sur
        // un doublon) : évite de spammer le webhook à chaque revisite.
        await sendWebhookEvent({
          webhookUrl: webhookOrg?.webhook_url ?? null,
          webhookSecret: webhookOrg?.webhook_secret ?? "",
          event: "newsletter.subscriber.created",
          data: { email: engagement.email, source: "wheel" },
        });
      }
    }

    // Tirage pondéré serveur, avec réservation atomique du stock.
    // Si le stock d'un lot vient de s'épuiser (course), on l'exclut
    // et on retire à nouveau.
    const exhausted = new Set<string>();
    let winnerIdx = -1;

    for (let attempt = 0; attempt < prizes.length + 1; attempt++) {
      const idx = pickWeightedIndex(
        prizes.map((p) => ({
          weight: p.weight,
          outOfStock: exhausted.has(p.id) || p.stock === 0,
        })),
      );
      if (idx === -1) break;

      const prize = prizes[idx];
      if (prize.is_losing) {
        winnerIdx = idx;
        break;
      }
      const { data: reserved } = await admin.rpc("decrement_prize_stock", {
        p_prize_id: prize.id,
      });
      if (reserved) {
        winnerIdx = idx;
        break;
      }
      exhausted.add(prize.id);
    }

    if (winnerIdx === -1) {
      return { ok: false, error: "Plus aucun lot disponible pour le moment." };
    }

    const prize = prizes[winnerIdx];

    const { data: spin, error: spinError } = await admin
      .from("spins")
      .insert({
        organization_id: campaign.organization_id,
        campaign_id: campaign.id,
        wheel_id: wheel.id,
        prize_id: prize.is_losing ? null : prize.id,
        is_losing: prize.is_losing,
        player_key: playerKey,
        engagement_action:
          requiredActions.length > 0 ? (engagement?.action ?? null) : null,
        source: normalizeSource(source),
      })
      .select("id")
      .single();

    if (spinError || !spin) {
      reportError("play.insert-spin", spinError?.message);
      // Le stock du lot a été réservé avant l'insertion : sans spin
      // enregistré, la réservation serait perdue — on la restitue
      // (best-effort, no-op si le stock est illimité).
      if (!prize.is_losing) {
        const { error: restoreError } = await admin.rpc(
          "restore_prize_stock",
          { p_prize_id: prize.id },
        );
        if (restoreError) {
          reportError("play.restore-stock", restoreError.message);
        }
      }
      return { ok: false, error: "Une erreur est survenue, réessayez." };
    }

    return {
      ok: true,
      data: {
        prizeIndex: winnerIdx,
        label: prize.label,
        description: prize.description,
        isLosing: prize.is_losing,
        claimToken: prize.is_losing ? null : signClaimToken(spin.id),
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

    const { ip } = await getPlayerFingerprint();
    if (!(await rateLimit(rateLimitBucket("claim:ip", ip), RATE_LIMITS.claim))) {
      return {
        ok: false,
        error: "Trop de tentatives. Patientez un instant avant de réessayer.",
      };
    }

    const payload = verifyClaimToken(parsed.data.claimToken);
    if (!payload) {
      return {
        ok: false,
        error: "Ce gain a expiré ou le lien est invalide. Rejouez plus tard.",
      };
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
        .select("id, name, notify_on_win, webhook_url, webhook_secret")
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

    const redeemCode = randomCode(4, "GAIN");

    // spin_id est UNIQUE sur participations : anti-double-claim au
    // niveau base même en cas de course entre deux requêtes.
    const { error: insertError } = await admin.from("participations").insert({
      organization_id: spin.organization_id,
      campaign_id: spin.campaign_id,
      wheel_id: spin.wheel_id,
      prize_id: spin.prize_id,
      spin_id: spin.id,
      first_name: collectsData ? parsed.data.firstName : null,
      email: collectEmail ? parsed.data.email : null,
      phone: collectPhone ? parsed.data.phone : null,
      accepted_terms: true,
      marketing_opt_in: collectsData ? parsed.data.marketingOptIn : false,
      redeem_code: redeemCode,
      player_key: spin.player_key,
    });

    if (insertError) {
      // Double-claim (contrainte UNIQUE) : cas attendu, pas une erreur.
      const duplicate = insertError.code === "23505";
      if (duplicate) {
        console.warn("[play] double claim refusé:", insertError.message);
      } else {
        reportError("play.insert-participation", insertError.message);
      }
      return {
        ok: false,
        error: duplicate
          ? "Ce gain a déjà été enregistré."
          : "Impossible d'enregistrer votre participation, réessayez.",
      };
    }

    await admin
      .from("spins")
      .update({ claimed: true })
      .eq("id", spin.id)
      .eq("organization_id", spin.organization_id)
      .eq("campaign_id", spin.campaign_id)
      .eq("wheel_id", spin.wheel_id)
      .eq("claimed", false);

    // Unification du consentement : un gagnant qui coche l'opt-in
    // marketing rejoint la base newsletter (même opt-in, même lien de
    // désinscription). C'est cette base que cible la relance automatique.
    if (collectsData && parsed.data.marketingOptIn && parsed.data.email) {
      const { data: newSubscriber, error: subError } = await admin
        .from("newsletter_subscribers")
        .upsert(
          {
            organization_id: spin.organization_id,
            email: parsed.data.email,
            source: "claim",
          },
          { onConflict: "organization_id,email", ignoreDuplicates: true },
        )
        .select("id");
      if (subError) {
        reportError("play.claim-newsletter", subError.message);
      } else if ((newSubscriber?.length ?? 0) > 0) {
        await sendWebhookEvent({
          webhookUrl: org?.webhook_url ?? null,
          webhookSecret: org?.webhook_secret ?? "",
          event: "newsletter.subscriber.created",
          data: { email: parsed.data.email, source: "claim" },
        });
      }
    }

    await sendWebhookEvent({
      webhookUrl: org?.webhook_url ?? null,
      webhookSecret: org?.webhook_secret ?? "",
      event: "participation.claimed",
      data: {
        first_name: parsed.data.firstName ?? null,
        email: collectEmail ? (parsed.data.email ?? null) : null,
        phone: collectPhone ? (parsed.data.phone ?? null) : null,
        prize_label: prize?.label ?? null,
        redeem_code: redeemCode,
      },
    });

    await writeAuditLog({
      organizationId: spin.organization_id,
      actor: "public",
      action: "participation.claim",
      metadata: { campaign_id: spin.campaign_id, prize_id: spin.prize_id },
    });

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

    const walletUrl = buildGoogleWalletSaveUrl({
      organizationName: org?.name ?? "votre commerce",
      prizeLabel: prize?.label ?? "Votre gain",
      redeemCode,
    });

    return { ok: true, data: { redeemCode, walletUrl } };
  } catch (err) {
    reportError("play.claimPrize", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}
