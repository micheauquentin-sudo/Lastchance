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
  try {
    return await Sentry.startSpan({ name, op: "function" }, fn);
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
