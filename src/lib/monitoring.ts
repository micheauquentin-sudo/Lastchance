import * as Sentry from "@sentry/nextjs";

/**
 * Monitoring des opérations critiques (spin, claim, webhook Stripe…).
 *
 * - `monitored()` : mesure la durée, crée un span de tracing Sentry et
 *   signale les opérations lentes (console + événement Sentry), même
 *   quand la transaction n'est pas échantillonnée par le tracing.
 * - `reportError()` : journalise ET remonte une erreur à Sentry — à
 *   utiliser dans les catch qui renvoient un message générique à
 *   l'utilisateur, sinon l'erreur reste invisible côté monitoring.
 *
 * Tout est no-op côté Sentry si le DSN n'est pas configuré.
 */

/** Seuil au-delà duquel une opération est considérée comme lente. */
export function slowThresholdMs(): number {
  const parsed = Number(process.env.SLOW_OPERATION_THRESHOLD_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2000;
}

export async function monitored<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  let ok = true;
  try {
    return await Sentry.startSpan({ name, op: "function" }, fn);
  } catch (error) {
    ok = false;
    throw error;
  } finally {
    const durationMs = Date.now() - start;
    if (durationMs >= slowThresholdMs()) {
      console.warn(`[perf] opération lente : ${name} (${durationMs}ms)`);
      Sentry.captureMessage(`Opération lente : ${name}`, {
        level: "warning",
        tags: { operation: name },
        extra: { duration_ms: durationMs },
      });
    }
    // Mesure réelle pour le monitoring (latence p95, taux d'erreur) —
    // best-effort : jamais bloquant, jamais d'échec propagé.
    void recordOpMetric(name, durationMs, ok);
  }
}

/**
 * Trace l'opération dans ops_metrics (purge à 30 j par le cron). Le
 * back-office en tire p50/p95 et taux d'erreur réels — plus d'état
 * « OK » statique. Import paresseux : ce module est aussi chargé côté
 * client (reportError), le client admin ne doit jamais y entrer.
 */
async function recordOpMetric(
  op: string,
  durationMs: number,
  ok: boolean,
): Promise<void> {
  if (typeof window !== "undefined") return;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    await createAdminClient()
      .from("ops_metrics")
      .insert({ op, duration_ms: Math.max(0, Math.round(durationMs)), ok });
  } catch {
    // Base indisponible ou env de test sans Supabase : la mesure saute,
    // l'opération métier, elle, ne doit jamais en souffrir.
  }
}

export function reportError(scope: string, error: unknown): void {
  console.error(`[${scope}]`, error);
  Sentry.captureException(error, { tags: { scope } });
}

export function reportSecurityEvent(
  event: string,
  extra: Record<string, unknown> = {},
): void {
  console.warn(`[security] ${event}`, extra);
  Sentry.captureMessage(`Security event: ${event}`, {
    level: "warning",
    tags: { security_event: event },
    extra,
  });
}
