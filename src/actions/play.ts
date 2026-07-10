"use server";

import { headers } from "next/headers";
import {
  computePlayerKey,
  pickWeightedIndex,
  playWindowStart,
  signClaimToken,
  verifyClaimToken,
} from "@/lib/spin";
import { loadPlayContext } from "@/lib/play-context";
import { enabledEngagementActions } from "@/lib/engagement";
import { claimSchema, spinEngagementSchema } from "@/lib/validations/play";
import { sendPrizeEmail } from "@/lib/resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { monitored, reportError } from "@/lib/monitoring";
import { writeAuditLog } from "@/lib/audit";
import { randomCode, type ActionResult } from "@/lib/utils";

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
 * Empreinte joueur pseudonymisée + IP source.
 *
 * `x-forwarded-for` / User-Agent sont falsifiables par le client : ils
 * suffisent à distinguer les joueurs mais pas à empêcher un attaquant
 * déterminé de générer des empreintes. La protection réelle contre le
 * spam / drainage repose sur le rate limiting (par empreinte ET par IP)
 * et, si activé, sur Turnstile.
 */
async function getPlayerFingerprint(): Promise<{
  ip: string;
  playerKey: string;
}> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  const ua = h.get("user-agent") ?? "unknown";
  return { ip, playerKey: computePlayerKey(ip, ua) };
}

export async function spinWheel(
  slug: string,
  engagementInput?: unknown,
  turnstileToken?: string,
): Promise<ActionResult<SpinOutcome>> {
  // Opération critique : durée mesurée, lenteurs et erreurs remontées.
  return monitored("play.spinWheel", () =>
    spinWheelInner(slug, engagementInput, turnstileToken),
  );
}

async function spinWheelInner(
  slug: string,
  engagementInput?: unknown,
  turnstileToken?: string,
): Promise<ActionResult<SpinOutcome>> {
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
      )) &&
      (await rateLimit(
        rateLimitBucket("spin:burst", wheel.id, playerKey),
        RATE_LIMITS.spinBurst,
      )) &&
      (await rateLimit(
        rateLimitBucket("spin", wheel.id, playerKey),
        RATE_LIMITS.spin,
      ));
    if (!allowed) {
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
        return {
          ok: false,
          error:
            wheel.play_limit === "once"
              ? "Vous avez déjà joué à ce jeu."
              : wheel.play_limit === "daily"
                ? "Vous avez déjà joué aujourd'hui. Revenez demain !"
                : "Vous avez déjà joué cette semaine. Revenez la semaine prochaine !",
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
      const { error: newsletterError } = await admin
        .from("newsletter_subscribers")
        .upsert(
          {
            organization_id: campaign.organization_id,
            email: engagement.email,
            source: "wheel",
          },
          { onConflict: "organization_id,email", ignoreDuplicates: true },
        );
      if (newsletterError) {
        reportError("play.newsletter", newsletterError.message);
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
      })
      .select("id")
      .single();

    if (spinError || !spin) {
      reportError("play.insert-spin", spinError?.message);
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
      .select("collect_email, collect_phone")
      .eq("id", spin.campaign_id)
      .single();

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

    const { data: prize } = await admin
      .from("prizes")
      .select("label, description")
      .eq("id", spin.prize_id)
      .single();

    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", spin.organization_id)
      .single();

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

    await admin.from("spins").update({ claimed: true }).eq("id", spin.id);

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

    return { ok: true, data: { redeemCode } };
  } catch (err) {
    reportError("play.claimPrize", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}
