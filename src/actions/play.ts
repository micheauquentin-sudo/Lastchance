"use server";

import { headers } from "next/headers";
import {
  signClaimToken,
  verifyClaimToken,
} from "@/lib/spin";
import { loadPlayContext } from "@/lib/play-context";
import { claimSchema } from "@/lib/validations/play";
import { isSkillGameType } from "@/lib/validations/skill";
import { buildGoogleWalletSaveUrl } from "@/lib/google-wallet";
import { buildAppleWalletPassUrl } from "@/lib/apple-wallet";
import { getOrgOwnerEmail } from "@/lib/merchant-contact";
import { sendPrizeEmail, sendWinNotificationEmail } from "@/lib/resend";
import {
  enqueuePrizeRedeemSms,
  recordPrizeSmsConsent,
} from "@/lib/sms-prize";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  RATE_LIMITS,
  rateLimit,
  rateLimitBucket,
} from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import {
  monitored,
  recordCounter,
  reportError,
  reportSecurityEvent,
} from "@/lib/monitoring";
import { isConsistentClaimResourceChain } from "@/lib/public-resource-guards";
import { writeAuditLog } from "@/lib/audit";
import type { ActionResult } from "@/lib/utils";
import { clientIpFromHeaders, observerPressionIp } from "@/lib/request-ip";
import {
  anonymousPlayerKey,
  peekAnonymousPlayerKey,
} from "@/lib/anonymous-player";
import { ensureProgressivePlayerIdentity } from "@/lib/player-identity";

export interface SpinOutcome {
  /** Index du segment gagné dans la liste des lots actifs (ordre d'affichage). */
  prizeIndex: number;
  label: string;
  description: string;
  /**
   * Icône du lot, choisie par le commerçant (null : aucune — le rendu
   * retombe alors sur le 🎁 générique). Toujours rendue dans un élément
   * `aria-hidden` à part, jamais concaténée au libellé.
   */
  emoji: string | null;
  isLosing: boolean;
  /** Présent uniquement pour un lot gagnant : à renvoyer au claim. */
  claimToken: string | null;
  /**
   * Identifiant du spin réel (gagnant OU perdant) — sert de PREUVE de
   * participation au parrainage (validateReferral). Ne vaut rien sans le cookie
   * device correspondant : la RPC validate_referral exige que le spin appartienne
   * au device filleul et à la campagne.
   */
  spinId: string;
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

/**
 * Récupère un gain récent si la réponse réseau ou la page a été perdue.
 *
 * La fenêtre de reprise est celle du `play_limit` de la roue, calculée DANS la
 * base (`recover_pending_spin`) : un cutoff fixe côté TypeScript — 30 min —
 * laissait le joueur sans son code dès que la limite était plus large (une
 * partie par jour, par semaine, une seule à vie), alors que la base tenait
 * toujours le spin non réclamé et refusait tout nouveau tour. Le gain était
 * gagné, enregistré, et irrécupérable.
 */
export async function recoverPendingWin(slug: string): Promise<SpinOutcome | null> {
  const ctx = await loadPlayContext(String(slug));
  if (!ctx.ok) return null;
  const playerKey = await anonymousPlayerKey();
  const { data: rows } = await ctx.admin.rpc("recover_pending_spin", {
    p_wheel_id: ctx.wheel.id,
    p_player_key: playerKey,
  });
  const spin = (rows as Array<{
    spin_id: string;
    prize_id: string | null;
    created_at: string;
  }> | null)?.[0];
  if (!spin?.prize_id) return null;
  const prizeIndex = ctx.prizes.findIndex((prize) => prize.id === spin.prize_id);
  // Lot retiré ou désactivé depuis le tirage : rien à rendre au joueur ici (le
  // spin reste en base, le commerçant le voit) — le shell public ne saurait pas
  // animer un segment absent de sa liste.
  if (prizeIndex < 0) return null;
  const prize = ctx.prizes[prizeIndex];
  return {
    prizeIndex,
    label: prize.label,
    description: prize.description,
    emoji: prize.emoji,
    isLosing: false,
    claimToken: signClaimToken(spin.spin_id),
    spinId: spin.spin_id,
  };
}

export async function spinWheel(
  slug: string,
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

    // Porte *skill-gated* : cette action matérialise UN tirage direct (jeux de
    // RÉVÉLATION — wheel, scratch, flip_card, cups, slot, memory, chest, dice,
    // draw_card). Les jeux de DÉFI (rps/reflex/gauge/puzzle/mystery_word/
    // estimate) n'accordent un tirage qu'APRÈS résolution SERVEUR du défi
    // (submitSkillChallenge). Appelée directement sur une roue configurée en
    // défi, elle contournerait entièrement la porte de compétence : on refuse
    // avec la MÊME réponse neutre que l'indisponibilité (miroir de la garde
    // isSkillGameType côté skill), sans révéler la nature du jeu (pas d'oracle).
    if (isSkillGameType(wheel.game_type)) {
      return { ok: false, error: "Jeu indisponible." };
    }

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
    //
    // DÉMARRÉ SANS ÊTRE ATTENDU : son verdict est ignoré par construction, il
    // ne peut donc rien décider en aval. Le laisser en tête coûtait un
    // aller-retour base COMPLET avant que le premier seau d'identité ne
    // commence — trois allers-retours en série pour un tour de roue. Il est
    // attendu plus bas, avant tout retour : une invocation serverless qui rend
    // sa réponse coupe les écritures en vol, et le compteur serait perdu.
    // L'ordre qui, lui, EST porteur de sens (après Turnstile) ne bouge pas.
    const pressionIp = observerPressionIp(
      ["spin:ip", wheel.id],
      ip,
      RATE_LIMITS.spinIp,
      "spin_ip_pressure",
      { wheel_id: wheel.id },
      );

    // Seaux `failClosed` sur l'IDENTITÉ joueur (empreinte cookie) : anti
    // double-clic (burst) et débit soutenu — ce qui ferme aussi la course sur
    // la limite de jeu ci-dessous. La saturer ne borne que ce joueur.
    //
    // CES DEUX-LÀ RESTENT EN SÉRIE, ET COURT-CIRCUITÉS. Les fondre dans un
    // `Promise.all` consommerait le seau soutenu (8/60 s) à chaque double-clic
    // — précisément ce que `spinBurst` (1/4 s) existe pour absorber sans
    // pénaliser le joueur. Un joueur nerveux épuiserait son quota de la minute
    // en quatre tours au lieu de huit. Le `&&` n'est pas une maladresse.
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
    await pressionIp;
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
      if (spin?.denial_reason === "campaign_closed") {
        // La campagne a fermé ENTRE la lecture du contexte et le tirage — la
        // course que la garde de `perform_atomic_spin` existe pour fermer
        // (migration 20261211120000). Le joueur voyait une roue jouable il y a
        // une seconde : lui répondre « plus aucun lot disponible » l'enverrait
        // chercher un problème de stock qui n'existe pas.
        return { ok: false, error: "Ce jeu vient de se terminer." };
      }
      return { ok: false, error: "Plus aucun lot disponible pour le moment." };
    }

    const winnerIdx = prizes.findIndex((item) => item.id === spin.prize_id);
    const prize = prizes[winnerIdx];
    if (winnerIdx < 0 || !prize) {
      reportError("play.atomic-spin-prize", "Lot tiré absent du contexte public");
      return { ok: false, error: "Une erreur est survenue, réessayez." };
    }

    // Pont progressif : le player_key historique reste l'autorité du spin.
    // Le nouveau cookie commun ne fait que relier cette progression après un
    // tirage réellement matérialisé ; son indisponibilité est non bloquante.
    await ensureProgressivePlayerIdentity({
      organizationId: campaign.organization_id,
      experienceKind: "campaign",
      experienceId: campaign.id,
      legacyIdentityHash: playerKey,
      acquisitionSource: normalizeSource(source) === "share" ? "share" : "qr",
      acquisitionQrCodeId: ctx.qr.id,
    });

    return {
      ok: true,
      data: {
        prizeIndex: winnerIdx,
        label: prize.label,
        description: prize.description,
        emoji: prize.emoji,
        isLosing: spin.is_losing,
        claimToken: spin.is_losing ? null : signClaimToken(spin.spin_id),
        spinId: spin.spin_id,
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
  /**
   * Consentement SMS (case dédiée du formulaire de gain). Il voyage ICI et non
   * dans un second appel : le dépôt du code de retrait par SMS a lieu dans
   * cette même fonction et lit `sms_consents` avant tout — voir
   * `recordPrizeSmsConsent`.
   */
  smsOptIn?: boolean;
}): Promise<ActionResult<ClaimResult>> {
  // Opération critique : durée mesurée, lenteurs et erreurs remontées.
  return monitored("play.claimPrize", () => claimPrizeInner(input));
}

/** Le message rendu quand un gain réclamé ne se relit PAS (cas résiduel). */
const ALREADY_CLAIMED = "Ce gain a déjà été enregistré.";

/**
 * Assemble la réponse du claim autour d'un code de retrait déjà émis. Un seul
 * endroit construit les URL Wallet : le chemin nominal et le chemin de rejeu
 * doivent rendre EXACTEMENT la même chose, sans quoi le second serait un
 * demi-succès qui ressemble au premier.
 */
function claimResultFrom(params: {
  organizationName: string;
  prizeLabel: string;
  redeemCode: string;
  redeemExpiresAt: string | null;
}): ClaimResult {
  return {
    redeemCode: params.redeemCode,
    walletUrl: buildGoogleWalletSaveUrl({
      organizationName: params.organizationName,
      prizeLabel: params.prizeLabel,
      redeemCode: params.redeemCode,
      redeemExpiresAt: params.redeemExpiresAt,
    }),
    appleWalletUrl: buildAppleWalletPassUrl(params.redeemCode),
  };
}

/**
 * RELIT le gain déjà enregistré de CE spin et le rend en SUCCÈS.
 *
 * ── LE DÉFAUT FERMÉ ─────────────────────────────────────────
 *
 * La réponse du claim se perd (une 4G qui décroche au fond d'un magasin), le
 * serveur a pourtant committé. L'écran affiche « Connexion perdue […]
 * réessayez » — ce que ses deux `catch` promettent expressément — le gagnant
 * réappuie, et il obtenait « Ce gain a déjà été enregistré. » : le lot était
 * décrémenté, la participation et le code existaient en base, et il ne voyait
 * JAMAIS son code. Recharger ne le sauvait pas non plus : `recoverPendingWin`
 * filtre `claimed = false`. Le code et l'invitation au rejeu se contredisaient.
 *
 * ── POURQUOI CE N'EST PAS UNE SECONDE ÉMISSION ──────────────
 *
 * Rien n'est écrit ici : une seule lecture, sur `spin_id`, colonne UNIQUE de
 * `participations`. Aucune seconde participation, aucun second décrément de
 * stock, aucun second mouvement de budget. La transaction reste à usage unique
 * — c'est sa RÉPONSE qui devient rejouable, pas la transaction.
 *
 * Ce que cette phrase a affirmé de FAUX pendant un temps, et par quoi elle est
 * remplacée : « c'est [l'unicité de `spin_id`] qui fait lever
 * `gain already claimed` à la RPC ». Non — `claim_winning_spin` ouvre sur un
 * `select … for update` du spin (20260723110000:97-99), qui SÉRIALISE les
 * appels concurrents : le second attend, relit `claimed = true` et sort sur
 * `gain unavailable` bien avant d'atteindre l'insertion. Le handler
 * `unique_violation` qui porte `gain already claimed` (:189-191) est
 * inatteignable par cette voie. L'unicité de `spin_id` reste vraie et reste ce
 * qui rend CETTE lecture non ambiguë ; elle n'est simplement pas le mécanisme
 * qui refuse le second appel.
 *
 * ── ET L'AUTORITÉ ? ─────────────────────────────────────────
 *
 * Le jeton signé HMAC désigne CE spin, et il n'est remis qu'au joueur qui
 * vient de le tirer. Quiconque peut appeler ce rejeu pouvait déjà faire le
 * premier claim et lire le code à ce moment-là : on ne distribue rien à qui ne
 * l'avait pas.
 *
 * ── E-MAIL ET SMS : CE QUE CE CHEMIN NE RATTRAPE PAS ────────
 *
 * Cette section affirmait : « ils ont été traités par le claim d'origine, qui
 * les a exécutés AVANT de rendre la main ». C'est FAUX dans un cas sur deux, et
 * la nuance est celle-ci :
 *
 *  • la RÉPONSE s'est perdue en transit (4G qui décroche) — l'invocation
 *    d'origine est allée à son terme, l'e-mail et le SMS SONT partis, et les
 *    rejouer enverrait bien un second message à chaque « Réessayer » ;
 *  • l'INVOCATION est morte APRÈS le commit de la RPC (délai serverless
 *    dépassé, redéploiement en vol, OOM) — `sendPrizeEmail`,
 *    `recordPrizeSmsConsent` et `enqueuePrizeRedeemSms` sont tous appelés
 *    APRÈS `claim_winning_spin`, donc rien n'est parti. Le gagnant a son code à
 *    l'écran, mais aucun e-mail, aucun SMS, et son consentement coché n'a
 *    jamais été écrit.
 *
 * ── CE QUI A ÉTÉ TRANCHÉ, ET POURQUOI ───────────────────────
 *
 * On ne réémet PAS, on COMPTE (`play.claim-replay-sans-renvoi`). Réémettre
 * demanderait de savoir laquelle des deux histoires s'est produite ; or aucune
 * trace par participation n'existe pour l'e-mail de gain (`sendPrizeEmail`
 * n'écrit pas dans `email_log`, contrairement aux campagnes). Sans ce
 * discriminant, réémettre traite le premier cas — de loin le plus fréquent —
 * comme le second, et transforme un bouton « Réessayer » en générateur de
 * doublons. Le compteur, lui, rend la population MESURABLE au lieu de la
 * laisser supposée : si elle s'avère non nulle en production, le correctif
 * juste est une trace d'envoi par participation, pas un renvoi à l'aveugle.
 * C'est la leçon déjà payée ici sur le repli du registre universel — un chemin
 * muet est un chemin dont on ne peut rien décider.
 */
async function replayExistingClaim(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    spinId: string;
    organizationId: string;
    organizationName: string;
    prizeLabel: string;
  },
): Promise<ActionResult<ClaimResult>> {
  const { data, error } = await admin
    .from("participations")
    .select("redeem_code, redeem_expires_at")
    .eq("spin_id", params.spinId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  const row = data as {
    redeem_code: string | null;
    redeem_expires_at: string | null;
  } | null;

  if (error || !row?.redeem_code) {
    // Un spin `claimed` sans participation lisible ne devrait pas exister (les
    // deux écritures sont dans la même transaction). Si ça arrive, on retombe
    // sur l'ancien refus plutôt que d'inventer un code — mais on le SIGNALE,
    // parce que c'est alors un gagnant qui n'a réellement plus rien.
    reportError(
      "play.claim-replay",
      error?.message ?? "spin réclamé sans participation lisible",
    );
    return { ok: false, error: ALREADY_CLAIMED };
  }

  // Le rejeu a servi : on le compte. Zéro ligne est la valeur saine ; une
  // population non nulle dit combien de gagnants ont pu repartir sans e-mail ni
  // SMS (voir « CE QUI A ÉTÉ TRANCHÉ » ci-dessus). Best-effort, jamais bloquant.
  recordCounter("play.claim-replay-sans-renvoi");

  return {
    ok: true,
    data: claimResultFrom({
      organizationName: params.organizationName,
      prizeLabel: params.prizeLabel,
      redeemCode: row.redeem_code,
      redeemExpiresAt: row.redeem_expires_at,
    }),
  };
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

    // LE GAIN APPARTIENT À L'APPAREIL QUI L'A TIRÉ — défense en profondeur.
    //
    // ── Ce que le jeton prouve, et ce qu'il ne prouve pas ──
    //
    // Le jeton de claim signe `{ spinId, exp }` et rien d'autre. L'en-tête de
    // `replayExistingClaim` argumente que « quiconque peut appeler ce rejeu
    // pouvait déjà faire le premier claim » : c'est vrai du REJEU, pas du
    // PREMIER claim. Un jeton capté pendant sa fenêtre de 15 min (extension de
    // navigateur, capture d'un devtools, journal partagé) laisse un tiers
    // encaisser le lot sous SON adresse — et le gagnant légitime obtient
    // ensuite « Ce gain a déjà été enregistré ».
    //
    // `spins.player_key` existe et est renseignée. On la confronte au cookie de
    // l'appelant, ce que rien ne faisait.
    //
    // ── POURQUOI L'ABSENCE DE COOKIE NE REFUSE PAS ──
    //
    // Refuser sans cookie coûterait son lot à un gagnant qui a nettoyé son
    // navigateur entre le tirage et la réclamation — un cas rare mais dont le
    // prix est un client humilié au comptoir, pour une menace qui, elle, reste
    // hypothétique. On refuse donc le cookie qui CONTREDIT, jamais celui qui
    // manque : un tiers qui a navigué EN A un, et il ne correspond pas. Le
    // contournement existe encore (effacer son propre cookie), mais il devient
    // un geste délibéré, et il est journalisé.
    // Test de VÉRACITÉ et non `!== null` : un spin dont la colonne est absente
    // ou vide n'est lié à aucun appareil, et `undefined !== null` aurait fait
    // refuser ces gains-là — une régression introduite par la garde elle-même.
    const cleAppelant = await peekAnonymousPlayerKey();
    if (cleAppelant && spin.player_key && cleAppelant !== spin.player_key) {
      // Même libellé que « gain introuvable » : distinguer les deux donnerait
      // un oracle qui confirme qu'un spin_id porte bien un gain.
      reportSecurityEvent("claim_player_key_mismatch", { spin_id: spin.id });
      return { ok: false, error: "Gain introuvable." };
    }
    if (cleAppelant === null) {
      reportSecurityEvent("claim_sans_cookie_joueur", { spin_id: spin.id });
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

    // ── LE GAIN DÉJÀ ENREGISTRÉ SE RELIT, IL NE SE REFUSE PLUS ──────────
    // Contrôlé APRÈS la chaîne de ressources et non avant : ce qu'on s'apprête
    // à rendre porte le nom du commerce et le libellé du lot, qui n'ont de sens
    // que si le spin, la campagne, la roue et le lot appartiennent bien au même
    // tenant. Vérifier l'appartenance puis servir, jamais l'inverse.
    if (spin.claimed) {
      return await replayExistingClaim(admin, {
        spinId: spin.id,
        organizationId: spin.organization_id,
        organizationName: org.name ?? "votre commerce",
        prizeLabel: prize.label ?? "Votre gain",
      });
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
      // ── ON NE DÉCIDE PAS SUR LE TEXTE DE L'EXCEPTION ──────────────────
      //
      // La version précédente cherchait « already claimed » dans le message.
      // Mesuré contre la définition VIVANTE de `claim_winning_spin`
      // (20260723110000_merchant_automations.sql:97-99, et non celle de 00019
      // qu'elle remplace) : la RPC ouvre sur
      // `select … from public.spins where id = p_spin_id FOR UPDATE`. Ce verrou
      // SÉRIALISE les rejeux concurrents — le second n'entre pas en collision,
      // il ATTEND, relit `claimed = true` et sort sur `gain unavailable`. Le
      // `raise exception 'gain already claimed'` (:189-191) ne vit que dans le
      // handler `unique_violation`, que le verrou rend inatteignable.
      //
      // Ce que cela coûtait au joueur, en production : un double-tap pendant
      // que la première invocation tourne donnait `duplicate = false`, donc
      // « Impossible d'enregistrer votre participation, réessayez. » — une
      // IMPASSE devant un gain réel, dont il ne sortait qu'au TROISIÈME tap
      // (celui qui trouve enfin `spin.claimed` en amont) — et un
      // `reportError` à chaque fois, c'est-à-dire une alerte Sentry qui ne
      // signalait aucune panne.
      //
      // La question à poser n'est pas « quel message la base a-t-elle rendu »
      // mais « la participation existe-t-elle ? ». C'est un fait, pas une
      // chaîne de caractères, et il reste vrai quel que soit le chemin par
      // lequel la RPC a refusé. `replayExistingClaim` la relit sur `spin_id`
      // (colonne UNIQUE) et n'écrit rien.
      const { count, error: relectureError } = await admin
        .from("participations")
        .select("id", { count: "exact", head: true })
        .eq("spin_id", spin.id)
        .eq("organization_id", spin.organization_id);

      // Relecture impossible, ou aucune participation : on ne peut pas
      // affirmer que c'est un rejeu, donc on ne le prétend pas. On signale et
      // on rend l'erreur franche. Test sur « entier strictement positif » et
      // non `!== 0` : `count` vaut aussi `null` quand la requête n'a pas abouti,
      // et rien ne garantit qu'un client le renseigne toujours — seul un compte
      // positif LU est une preuve que la participation existe.
      if (relectureError || !(typeof count === "number" && count > 0)) {
        reportError("play.claim-transaction", insertError?.message);
        return {
          ok: false,
          error: "Impossible d'enregistrer votre participation, réessayez.",
        };
      }

      // La participation existe : ce refus est un REJEU, pas une panne. Le
      // gagnant qui a réappuyé n'a rien fait de mal — on lui rend le code que
      // sa propre première requête vient d'obtenir, sans alerte.
      return await replayExistingClaim(admin, {
        spinId: spin.id,
        organizationId: spin.organization_id,
        organizationName: org.name ?? "votre commerce",
        prizeLabel: prize.label ?? "Votre gain",
      });
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

    // Échéance SERVEUR posée par le trigger à l'insertion. Lue AVANT l'email,
    // et non plus après : sans elle, le message annonçait un code « à présenter
    // en caisse » sans dire qu'il expire, alors que la caisse le refuse passé
    // l'heure. Le gagnant revenait au comptoir se faire refuser sans comprendre.
    // Les pass Wallet la reflètent aussi (expiration côté portefeuille).
    const { data: participationRow } = await admin
      .from("participations")
      .select("redeem_expires_at")
      .eq("redeem_code", redeemCode)
      .maybeSingle();
    const redeemExpiresAt =
      (participationRow as { redeem_expires_at: string | null } | null)
        ?.redeem_expires_at ?? null;

    // Best-effort : le code est déjà affiché à l'écran.
    if (collectEmail && parsed.data.email) {
      await sendPrizeEmail({
        to: parsed.data.email,
        firstName: parsed.data.firstName || "cher client",
        prizeLabel: prize?.label ?? "Votre gain",
        prizeDescription: prize?.description ?? "",
        redeemCode,
        organizationName: org?.name ?? "votre commerce",
        redeemExpiresAt,
      });
    }

    // Le même code, par SMS, pour le gagnant qui a laissé un TÉLÉPHONE et pas
    // une adresse : sans ce dépôt il ne recevait strictement rien, et n'avait
    // plus rien à présenter en caisse une fois l'onglet fermé.
    //
    // Best-effort au sens fort : `enqueuePrizeRedeemSms` ne lève jamais et rend
    // un booléen qu'on ignore ici volontairement. Les quatre conditions
    // (consentement, expéditeur déclaré, crédit, mention STOP) vivent dans ce
    // module ; aucune n'a de raison d'être rejouée ici, et une seconde
    // vérification serait la seconde source de vérité habituelle.
    if (collectPhone && parsed.data.phone) {
      // ── LE CONSENTEMENT D'ABORD, LE DÉPÔT ENSUITE ──────────────────
      // L'ordre était inversé, et c'est tout le défaut : le dépôt ci-dessous
      // commence par lire `sms_consents` et sort sans rien faire s'il ne trouve
      // rien, alors que le consentement n'était écrit qu'APRÈS, par un second
      // appel du navigateur. Au premier gain d'un couple (organisation,
      // numéro), aucun SMS ne partait jamais.
      if (parsed.data.smsOptIn) {
        await recordPrizeSmsConsent(admin, {
          organizationId: spin.organization_id,
          phone: parsed.data.phone,
        });
      }
      await enqueuePrizeRedeemSms(admin, {
        organizationId: spin.organization_id,
        organizationName: org?.name ?? "votre commerce",
        prizeLabel: prize?.label ?? "Votre gain",
        redeemCode,
        phone: parsed.data.phone,
        participationId: claimRow.participation_id,
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


    return {
      ok: true,
      data: claimResultFrom({
        organizationName: org?.name ?? "votre commerce",
        prizeLabel: prize?.label ?? "Votre gain",
        redeemCode,
        redeemExpiresAt,
      }),
    };
  } catch (err) {
    reportError("play.claimPrize", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}
