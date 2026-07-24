"use server";

import { headers } from "next/headers";
import { anonymousPlayerKey } from "@/lib/anonymous-player";
import { monitored, reportError, reportSecurityEvent } from "@/lib/monitoring";
import { loadPlayContext } from "@/lib/play-context";
import {
  observeSharedKey,
  RATE_LIMITS,
  rateLimit,
  rateLimitBucket,
} from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request-ip";
import {
  evaluateSkill,
  generateSkillSeed,
  hashPlayerKey,
  playerKeyHashMatches,
  resolveSkillSeed,
  signSkillChallenge,
  toPublicChallenge,
  verifySkillChallenge,
  type SkillChallengePublic,
} from "@/lib/skill";
import { signClaimToken } from "@/lib/spin";
import { verifyTurnstile } from "@/lib/turnstile";
import {
  isSkillGameType,
  parseSkillAttempt,
  parseSkillConfig,
  startSkillChallengeSchema,
  submitSkillChallengeSchema,
} from "@/lib/validations/skill";
import type { ActionResult } from "@/lib/utils";

const GENERIC_ERROR = "Une erreur est survenue, réessayez.";
const RATE_LIMITED = "Trop de tentatives. Patientez un instant avant de réessayer.";
const UNAVAILABLE = "Ce défi n'est pas disponible.";
const EXPIRED = "Ce défi a expiré. Relancez la partie.";

// ════════════════════════════════════════════════════════════
// DÉFIS *skill-gated* (jeux rapides · vague 2)
//
// Deux temps, en amont du tirage :
//   • startSkillChallenge : présente le défi (données PUBLIQUES seulement, via
//     toPublicChallenge). NE TIRE PAS, ne consomme rien. Émet un jeton signé.
//   • submitSkillChallenge : le SERVEUR évalue la tentative, puis matérialise
//     l'issue via perform_atomic_spin qui CONSOMME la participation dans les
//     DEUX cas (réussite → tirage normal ; échec → spin PERDANT forcé).
//
// RATE-LIMIT (ADR-032) : `failClosed` uniquement sur la clé d'IDENTITÉ device
// (anonymousPlayerKey, hash SHA-256 sans PII), jamais sur une clé partagée. La
// clé IP ne porte qu'un compteur d'OBSERVABILITÉ (observeSharedKey). Le submit
// réutilise les MÊMES seaux que le spin (`spin:burst`, `spin`, `spin:ip`) : un
// défi soumis EST un tour de jeu, il partage donc le même budget.
//
// NON-FUITE : les secrets (mystery_word.word, estimate.target/tolerance,
// puzzle.order) ne quittent JAMAIS le serveur. Le client ne reçoit que
// SkillChallengePublic. Aucune réponse d'échec ne révèle la « bonne réponse »
// (pas d'oracle).
// ════════════════════════════════════════════════════════════

export interface SkillChallengeStart {
  challenge: SkillChallengePublic;
  challengeToken: string;
}

/**
 * Présente un défi skill-gated : résout la campagne active + sa roue (dont le
 * game_type doit être un jeu de DÉFI), pose l'identité device, applique
 * Turnstile (si configuré) et le rate-limit, puis renvoie la vue PUBLIQUE du
 * défi + un jeton signé. NE consomme AUCUNE participation, NE tire pas.
 */
export async function startSkillChallenge(input: {
  slug: string;
  turnstileToken?: string;
}): Promise<ActionResult<SkillChallengeStart>> {
  const parsed = startSkillChallengeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  return monitored("skill.start", () =>
    startInner(parsed.data.slug, input.turnstileToken),
  );
}

async function startInner(
  slug: string,
  turnstileToken: string | undefined,
): Promise<ActionResult<SkillChallengeStart>> {
  try {
    const ctx = await loadPlayContext(slug);
    if (!ctx.ok) return { ok: false, error: UNAVAILABLE };
    const { campaign, wheel } = ctx;

    const gameType = wheel.game_type;
    if (!isSkillGameType(gameType)) return { ok: false, error: UNAVAILABLE };

    const ip = clientIpFromHeaders(await headers());
    const deviceKey = await anonymousPlayerKey();

    // Challenge anti-bot (no-op si Turnstile non configuré) — comme la roue.
    if (!(await verifyTurnstile(turnstileToken, ip))) {
      reportSecurityEvent("captcha_failed", { wheel_id: wheel.id });
      return {
        ok: false,
        error: "Vérification anti-robot échouée. Rechargez la page et réessayez.",
      };
    }

    // Clé PARTAGÉE (IP) : observabilité seule, jamais un refus (ADR-032).
    await observeSharedKey(
      rateLimitBucket("spin:ip", wheel.id, ip),
      RATE_LIMITS.spinIp,
      "spin_ip_pressure",
      { wheel_id: wheel.id },
    );

    // Clé d'IDENTITÉ device : `failClosed`. Débit soutenu seulement (le start
    // est idempotent et sans secret ; pas de seau burst qui casserait le combo
    // start→submit rapproché). La saturer ne borne que ce device.
    if (
      !(await rateLimit(
        rateLimitBucket("skill:start", wheel.id, deviceKey),
        RATE_LIMITS.spin,
        { failClosed: true },
      ))
    ) {
      return { ok: false, error: RATE_LIMITED };
    }

    // Relecture de skill_config (service role). loadPlayContext a chargé la roue
    // avec `*`, donc skill_config est présent — non déclaré sur le type Wheel
    // (secret server-only), d'où le cast localisé.
    const rawConfig = (wheel as { skill_config?: unknown }).skill_config ?? null;
    const configResult = parseSkillConfig(gameType, rawConfig);
    if (!configResult.ok) {
      // Roue mal configurée par le commerçant : réponse neutre, pas d'oracle.
      reportError("skill.start-config", `wheel ${wheel.id}: ${configResult.error}`);
      return { ok: false, error: UNAVAILABLE };
    }

    const seed = generateSkillSeed();
    const nonce = generateSkillSeed();
    const challengeToken = signSkillChallenge({
      playerKeyHash: hashPlayerKey(deviceKey),
      organizationId: campaign.organization_id,
      campaignId: campaign.id,
      wheelId: wheel.id,
      gameType,
      seed,
      nonce,
    });

    // La vue publique n'expose AUCUN secret (garant structurel de non-fuite).
    const challenge = toPublicChallenge(gameType, configResult.config);
    return { ok: true, data: { challenge, challengeToken } };
  } catch (err) {
    reportError("skill.start", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export interface SkillSubmitOutcome {
  state: "won" | "lost" | "blocked";
  // NB : la RÉUSSITE au défi (`succeeded`) n'est JAMAIS renvoyée au client sur
  // une issue non gagnante. Sur `lost`, l'exposer serait un ORACLE : rejouer le
  // jeton (valide ~10 min) en variant la réponse et lire `succeeded` extrairait
  // le secret (mystery_word/estimate/puzzle) par force brute. L'info reste
  // server-only (elle pilote `p_force_losing`) ; un échec ne dit RIEN sur la
  // proximité/justesse de la réponse.
  /** Index du lot tiré dans la roue (animation) — null si perdant sans lot. */
  prizeIndex: number | null;
  label: string | null;
  description: string | null;
  /** Gain non perdant : jeton signé à passer à claimPrize (flux GAIN-…). */
  claimToken: string | null;
  /** Identifiant du spin réel (gagnant OU perdant) — preuve de participation. */
  spinId: string | null;
  /** Limite atteinte : prochaine éligibilité pour un compte à rebours. */
  nextEligibleAt: string | null;
}

/**
 * Soumet la tentative d'un défi : vérifie le jeton (signature, expiration,
 * identité device), évalue la réussite CÔTÉ SERVEUR, puis matérialise l'issue
 * via perform_atomic_spin — réussite = tirage normal, échec = spin PERDANT forcé
 * (la participation est consommée dans les deux cas). Miroir de la fin de
 * spinWheel. Aucune réponse ne révèle la solution (pas d'oracle).
 */
export async function submitSkillChallenge(input: {
  slug: string;
  challengeToken: string;
  attempt: unknown;
}): Promise<ActionResult<SkillSubmitOutcome>> {
  const parsed = submitSkillChallengeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  return monitored("skill.submit", () =>
    submitInner(parsed.data.slug, parsed.data.challengeToken, parsed.data.attempt),
  );
}

async function submitInner(
  slug: string,
  challengeToken: string,
  rawAttempt: unknown,
): Promise<ActionResult<SkillSubmitOutcome>> {
  try {
    // 1. Le JETON D'ABORD : vérification purement locale (HMAC), aucun seau
    //    consommé — un flot de jetons forgés n'entame aucun budget légitime.
    const payload = verifySkillChallenge(challengeToken);
    if (!payload) return { ok: false, error: EXPIRED };

    // 2. Chaîne de ressources : la campagne active du slug doit correspondre au
    //    jeton (org/campagne/roue/game_type), sinon rejet neutre.
    const ctx = await loadPlayContext(slug);
    if (!ctx.ok) return { ok: false, error: UNAVAILABLE };
    const { admin, campaign, wheel, prizes } = ctx;

    const gameType = wheel.game_type;
    if (
      !isSkillGameType(gameType) ||
      payload.gameType !== gameType ||
      payload.organizationId !== campaign.organization_id ||
      payload.campaignId !== campaign.id ||
      payload.wheelId !== wheel.id
    ) {
      return { ok: false, error: UNAVAILABLE };
    }

    // 3. Identité device : le jeton est lié au device qui l'a demandé.
    const deviceKey = await anonymousPlayerKey();
    if (!playerKeyHashMatches(payload.playerKeyHash, hashPlayerKey(deviceKey))) {
      reportSecurityEvent("skill_player_mismatch", { wheel_id: wheel.id });
      return { ok: false, error: UNAVAILABLE };
    }

    // 4. Tentative validée selon le game_type porté par le jeton.
    const attemptResult = parseSkillAttempt(gameType, rawAttempt);
    if (!attemptResult.ok) return { ok: false, error: attemptResult.error };

    const ip = clientIpFromHeaders(await headers());

    // 5. Rate-limit — MÊMES seaux que le spin (un défi soumis EST un tour de
    //    jeu). Clé PARTAGÉE d'abord (observabilité), puis IDENTITÉ (failClosed).
    await observeSharedKey(
      rateLimitBucket("spin:ip", wheel.id, ip),
      RATE_LIMITS.spinIp,
      "spin_ip_pressure",
      { wheel_id: wheel.id },
    );
    const allowed =
      (await rateLimit(
        rateLimitBucket("spin:burst", wheel.id, deviceKey),
        RATE_LIMITS.spinBurst,
        { failClosed: true },
      )) &&
      (await rateLimit(
        rateLimitBucket("spin", wheel.id, deviceKey),
        RATE_LIMITS.spin,
        { failClosed: true },
      ));
    if (!allowed) {
      reportSecurityEvent("spin_rate_limited", { wheel_id: wheel.id });
      return { ok: false, error: RATE_LIMITED };
    }

    // 6. Relecture des SECRETS (service role) et évaluation SERVEUR.
    const rawConfig = (wheel as { skill_config?: unknown }).skill_config ?? null;
    const configResult = parseSkillConfig(gameType, rawConfig);
    if (!configResult.ok) {
      reportError("skill.submit-config", `wheel ${wheel.id}: ${configResult.error}`);
      return { ok: false, error: UNAVAILABLE };
    }

    const resolvedSeed = resolveSkillSeed(payload.seed);
    const { succeeded } = evaluateSkill(
      gameType,
      attemptResult.attempt,
      configResult.config,
      resolvedSeed,
    );

    // 7. Matérialisation : réussite → tirage normal ; échec → spin PERDANT forcé.
    //    play_limit appliqué DANS la RPC, AVANT la branche (anti-brute-force).
    const { data: spinRows, error: spinError } = await admin.rpc("perform_atomic_spin", {
      p_organization_id: campaign.organization_id,
      p_campaign_id: campaign.id,
      p_wheel_id: wheel.id,
      p_player_key: deviceKey,
      p_engagement_action: null,
      p_source: "direct",
      p_force_losing: !succeeded,
    });
    if (spinError) {
      reportError("skill.atomic-spin", spinError.message);
      return { ok: false, error: GENERIC_ERROR };
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
          ok: true,
          data: {
            state: "blocked",
            prizeIndex: null,
            label: null,
            description: null,
            claimToken: null,
            spinId: null,
            nextEligibleAt: spin.next_eligible_at ?? null,
          },
        };
      }
      // Succès sans lot disponible (stock épuisé, aucune config perdante) :
      // même issue que la roue — indisponibilité neutre.
      return { ok: false, error: "Plus aucun lot disponible pour le moment." };
    }

    // Perte : défi raté (force_losing, prize_id null) OU défi réussi mais tirage
    // perdant (segment perdant). Issue UNIFORME sans oracle — ni prizeIndex ni
    // libellé : leur présence trahirait « défi réussi mais tirage perdant » vs
    // « défi raté » (oracle IMPLICITE de justesse). Le shell affiche un message
    // générique de perte. Défense en profondeur au-dessus de Fix#2a (1 tentative
    // par fenêtre pour les jeux à secret, qui rend déjà l'oracle inexploitable).
    if (spin.is_losing) {
      return {
        ok: true,
        data: {
          state: "lost",
          prizeIndex: null,
          label: null,
          description: null,
          claimToken: null,
          spinId: spin.spin_id,
          nextEligibleAt: null,
        },
      };
    }

    // Gain : succès du défi ET tirage gagnant. Jeton de claim (flux GAIN-…).
    const winnerIdx = prizes.findIndex((p) => p.id === spin.prize_id);
    const prize = prizes[winnerIdx];
    if (winnerIdx < 0 || !prize) {
      reportError("skill.atomic-spin-prize", "Lot tiré absent du contexte public");
      return { ok: false, error: GENERIC_ERROR };
    }
    return {
      ok: true,
      data: {
        state: "won",
        prizeIndex: winnerIdx,
        label: prize.label,
        description: prize.description,
        claimToken: signClaimToken(spin.spin_id),
        spinId: spin.spin_id,
        nextEligibleAt: null,
      },
    };
  } catch (err) {
    reportError("skill.submit", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}
