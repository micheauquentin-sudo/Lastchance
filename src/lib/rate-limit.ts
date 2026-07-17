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
  /** Connexions par IP (credential stuffing). */
  authLogin: { limit: 10, windowSeconds: 300 },
  /** Créations de compte par IP (spam d'inscriptions). */
  authSignup: { limit: 5, windowSeconds: 3600 },
  /** Campagnes newsletter envoyées par organisation (anti-spam/abus). */
  newsletterSend: { limit: 5, windowSeconds: 86_400 },
  /** Compteur de scan par QR et IP (anti-inflation des statistiques). */
  scanIp: { limit: 60, windowSeconds: 60 },
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
