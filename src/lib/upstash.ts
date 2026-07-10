import "server-only";

import { optionalEnv } from "@/lib/env";
import type { RateLimitRule } from "@/lib/rate-limit";

/**
 * Rate limiting Upstash Redis (REST) — couche optionnelle, activée par
 * `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
 *
 * Même sémantique que le compteur en base (fenêtre fixe alignée), mais
 * hors DB : sous forte charge ou multi-établissements, les compteurs
 * n'ajoutent plus d'écritures PostgreSQL. Implémenté en REST pur
 * (INCR + EXPIRE en pipeline) — aucune dépendance npm.
 *
 * Retourne :
 *   · true / false — verdict Upstash (autorisé / bloqué)
 *   · null — non configuré ou erreur réseau → l'appelant retombe sur
 *     le compteur en base (jamais de blocage à tort).
 */
export async function upstashRateLimit(
  bucket: string,
  rule: RateLimitRule,
  nowMs: number = Date.now(),
): Promise<boolean | null> {
  const url = optionalEnv("UPSTASH_REDIS_REST_URL");
  const token = optionalEnv("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) return null;
  if (rule.limit < 1 || rule.windowSeconds < 1) return true;

  // Fenêtre fixe alignée (même découpage que public.check_rate_limit).
  const windowStart =
    Math.floor(nowMs / 1000 / rule.windowSeconds) * rule.windowSeconds;
  const key = `rl:${bucket}:${windowStart}`;

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      // EXPIRE NX : le TTL n'est posé qu'à la création de la clé
      // (fenêtre + marge → purge automatique, pas de cron).
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(rule.windowSeconds + 60), "NX"],
      ]),
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) {
      console.error(`[upstash] HTTP ${res.status}`);
      return null;
    }

    const results = (await res.json()) as Array<{
      result?: number;
      error?: string;
    }>;
    const count = results?.[0]?.result;
    if (typeof count !== "number") {
      console.error("[upstash] réponse inattendue:", JSON.stringify(results));
      return null;
    }
    return count <= rule.limit;
  } catch (err) {
    console.error("[upstash]:", err);
    return null;
  }
}
