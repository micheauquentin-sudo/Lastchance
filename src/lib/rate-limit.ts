import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { upstashRateLimit } from "@/lib/upstash";
import { reportError } from "@/lib/monitoring";

export interface RateLimitRule {
  /** Nombre maximum d'événements autorisés dans la fenêtre. */
  limit: number;
  /** Durée de la fenêtre glissante (fixe) en secondes. */
  windowSeconds: number;
}

/**
 * Règles de limitation par usage. Calibrées pour être invisibles aux
 * utilisateurs légitimes (un joueur tourne la roue une fois) tout en
 * bloquant l'automatisation.
 */
export const RATE_LIMITS = {
  /** Anti double-clic / anti-course : au plus un spin toutes les 4 s
   *  par empreinte joueur (ferme la race sur la limite de jeu). */
  spinBurst: { limit: 1, windowSeconds: 4 },
  /** Débit soutenu par empreinte joueur. */
  spin: { limit: 8, windowSeconds: 60 },
  /** Débit par IP, tous joueurs confondus (drainage de stock, bots). */
  spinIp: { limit: 40, windowSeconds: 60 },
  /** Réclamation de gain par empreinte joueur. */
  claim: { limit: 15, windowSeconds: 60 },
  /** Recherche/validation de codes par un compte de caisse. */
  cashier: { limit: 30, windowSeconds: 60 },
  /** Connexions par IP (credential stuffing). */
  authLogin: { limit: 10, windowSeconds: 300 },
  /** Créations de compte par IP (spam d'inscriptions). */
  authSignup: { limit: 5, windowSeconds: 3600 },
  /** Campagnes newsletter envoyées par organisation (anti-spam/abus). */
  newsletterSend: { limit: 5, windowSeconds: 86_400 },
  /** Compteur de scan par QR et IP (anti-inflation des statistiques). */
  scanIp: { limit: 60, windowSeconds: 60 },
  /** Inscriptions par championnat et IP. Le seuil tient compte du Wi-Fi
   *  partagé d'un commerce ; Turnstile reste la première barrière anti-bot. */
  pronoRegisterIp: { limit: 120, windowSeconds: 3600 },
  /** Demandes de lien de récupération par championnat et IP. */
  pronoRecoverIp: { limit: 10, windowSeconds: 3600 },
  /** Demandes de lien par email ciblé (anti-harcèlement d'une adresse). */
  pronoRecoverEmail: { limit: 3, windowSeconds: 3600 },
  /** Plafond réseau large pour ne pas pénaliser les clients derrière le même NAT. */
  pronoPredictIp: { limit: 300, windowSeconds: 60 },
  /** Débit soutenu par joueur inscrit (une grille complète ≈ 10 requêtes). */
  pronoPredictPlayer: { limit: 40, windowSeconds: 60 },
  /** Synchronisations manuelles du calendrier par utilisateur et organisation. */
  contestSync: { limit: 6, windowSeconds: 300 },
  /** Rafraîchissement du mode TV (classement public) par championnat et IP :
   *  un écran légitime interroge toutes les 30 s, la marge couvre plusieurs
   *  écrans derrière la même box. */
  pronoTvIp: { limit: 30, windowSeconds: 60 },
  /** Tentatives de code de ligue par championnat et IP — anti-bruteforce
   *  des codes d'invitation (6-8 caractères). */
  pronoLeagueJoinIp: { limit: 10, windowSeconds: 600 },
  /** Créations de ligue par joueur inscrit (le plafond dur est de
   *  200 ligues par championnat, appliqué par la RPC). */
  pronoLeagueCreatePlayer: { limit: 5, windowSeconds: 3600 },
  /** Tampons de chasse au trésor par IP, tous joueurs confondus — plafond
   *  réseau large (Wi-Fi partagé d'un mall/festival : ~50 joueurs actifs à
   *  4 scans/10 min) tout en cappant un bot mono-IP à ~20 complétions d'une
   *  chasse de 10 étapes/10 min. La vraie barrière anti-abus est ailleurs :
   *  entropie des jetons (32^16) + seau par cookie `huntScanPlayer` + cap de
   *  stock. Fail-closed sûr : sur panne Upstash, `check_rate_limit` (Postgres,
   *  déjà requis par le scan) prend le relais — jamais de verrouillage global. */
  huntScanIp: { limit: 200, windowSeconds: 600 },
  /** Tampons par empreinte joueur (cookie/hash) — débit soutenu ; les
   *  re-scans sont idempotents côté RPC. */
  huntScanPlayer: { limit: 30, windowSeconds: 3600 },
  /** Tampons de fidélité par IP, tous passeports confondus — plafond réseau
   *  LARGE (boutique = Wi-Fi partagé : un comptoir voit défiler beaucoup de
   *  clients derrière la même IP). La vraie barrière anti-abus est ailleurs :
   *  code tournant recalculé côté serveur + cooldown min_stamp_interval +
   *  cookie par passeport. Ne PAS resserrer (leçon huntScanIp). */
  loyaltyStampIp: { limit: 300, windowSeconds: 600 },
  /** Tampons/consommations par passeport (cookie/hash) — débit soutenu ; le
   *  cooldown serveur (min_stamp_interval) reste la borne métier. */
  loyaltyStampMember: { limit: 30, windowSeconds: 3600 },
  /** ÉCHECS de code tournant par programme et IP — seau dédié, incrémenté
   *  uniquement quand `record_loyalty_stamp` répond `invalid_code` (voir
   *  recordRateLimitFailure). Contrairement aux tampons réussis, que plusieurs
   *  clients légitimes derrière le Wi-Fi d'une boutique produisent en rafale
   *  (d'où le plafond large de loyaltyStampIp), des échecs en masse ne sont
   *  jamais légitimes : on peut donc serrer fort sans rejouer le sur-blocage
   *  huntScanIp. 15 essais/5 min plafonnent un devineur à ~0,03 % de chances
   *  sur le triplet de codes acceptable. */
  loyaltyStampCodeFailure: { limit: 15, windowSeconds: 300 },
  /** Lecture du code tournant au comptoir par membre et programme — un écran
   *  légitime interroge toutes les quelques secondes ; marge confortable. */
  loyaltyCounter: { limit: 60, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

/** Construit une clé de seau lisible et sans collision entre usages. */
export function rateLimitBucket(...parts: Array<string | number>): string {
  return parts.map((p) => String(p)).join(":");
}

/**
 * Retourne `true` si l'action est autorisée, `false` si la limite est
 * atteinte.
 *
 * Si Upstash est configuré (UPSTASH_REDIS_REST_URL/TOKEN), le verdict
 * vient de Redis — rapide et hors DB. Sinon (ou en cas d'erreur
 * Upstash), le compteur atomique en base prend le relais (résiste au
 * multi-instance serverless, contrairement à un compteur en mémoire).
 *
 * Fail-open par défaut pour les fonctions de confort. Les opérations critiques
 * (spin, scan) passent `failClosed` afin qu'une panne de protection ne devienne
 * jamais un contournement. Tous les incidents remontent au monitoring.
 */
/**
 * Début de la fenêtre fixe courante, aligné exactement comme
 * `public.check_rate_limit` (et comme Upstash) : floor(epoch / window) * window.
 */
function windowStartIso(rule: RateLimitRule, nowMs: number): string {
  const seconds =
    Math.floor(nowMs / 1000 / rule.windowSeconds) * rule.windowSeconds;
  return new Date(seconds * 1000).toISOString();
}

/**
 * Compteur d'ÉCHECS — à n'incrémenter QUE sur un échec avéré (code faux,
 * jeton invalide…), jamais sur une tentative légitime. Le couple
 * recordRateLimitFailure / rateLimitFailureExceeded permet ce que `rateLimit`
 * ne sait pas faire : consulter le compteur AVANT d'évaluer la tentative
 * suivante sans l'incrémenter au passage (sinon les succès des clients
 * légitimes derrière la même IP rempliraient le seau).
 *
 * Ces deux fonctions passent délibérément par le compteur Postgres et non par
 * Upstash : l'incrément et la lecture doivent viser le MÊME compteur, or notre
 * client Upstash n'expose qu'un INCR (pas de lecture seule). Les échecs sont
 * rares en régime normal — le surcoût en écritures reste négligeable.
 */
export async function recordRateLimitFailure(
  bucket: string,
  rule: RateLimitRule,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("check_rate_limit", {
      p_bucket: bucket,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) reportError("rate-limit.failure-record", error.message);
  } catch (err) {
    reportError("rate-limit.failure-record", err);
  }
}

/**
 * `true` si le seau d'échecs est saturé pour la fenêtre courante — lecture
 * seule (aucun incrément). Fail-closed : si le compteur est illisible on
 * bloque, l'appelant ayant de toute façon besoin de la base juste après.
 */
export async function rateLimitFailureExceeded(
  bucket: string,
  rule: RateLimitRule,
  nowMs: number = Date.now(),
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("rate_limits")
      .select("count")
      .eq("bucket", bucket)
      .eq("window_start", windowStartIso(rule, nowMs))
      .maybeSingle();
    if (error) {
      reportError("rate-limit.failure-read", error.message);
      return true;
    }
    return ((data?.count as number | undefined) ?? 0) >= rule.limit;
  } catch (err) {
    reportError("rate-limit.failure-read", err);
    return true;
  }
}

export async function rateLimit(
  bucket: string,
  rule: RateLimitRule,
  options: { failClosed?: boolean } = {},
): Promise<boolean> {
  const upstashVerdict = await upstashRateLimit(bucket, rule);
  if (upstashVerdict !== null) return upstashVerdict;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_bucket: bucket,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) {
      reportError("rate-limit.rpc", error.message);
      return !options.failClosed;
    }
    return data !== false;
  } catch (err) {
    reportError("rate-limit", err);
    return !options.failClosed;
  }
}
