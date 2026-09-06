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
    const result = await Sentry.startSpan({ name, op: "function" }, fn);
    // Une route peut signaler un échec par une Response 4xx/5xx sans lever
    // d'exception. Ces réponses doivent compter dans le taux d'erreur.
    if (typeof Response !== "undefined" && result instanceof Response && !result.ok) {
      ok = false;
    }
    return result;
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

/**
 * Compte une occurrence d'un événement qui n'a pas de durée propre.
 *
 * Même table que `monitored()` — donc même purge à 30 jours, même synthèse
 * `ops_metrics_summary`, même back-office : un compteur n'a pas mérité sa
 * table. `duration_ms = 0` et `ok = true` parce que ce n'est ni une latence
 * ni un échec ; c'est le NOMBRE DE LIGNES qui porte l'information, et zéro
 * ligne est la valeur saine.
 *
 * Best-effort comme la mesure de latence : compter ne doit jamais faire
 * échouer ce qu'on compte.
 */
export function recordCounter(op: string): void {
  void recordOpMetric(op, 0, true);
}

/**
 * Variante ATTENDUE du compteur, pour les rares faits qu'on n'a pas le droit
 * de perdre.
 *
 * `recordCounter` lâche sa promesse (`void`) : sur une invocation serverless,
 * rendre la réponse coupe les écritures en vol, et le compteur saute. C'est
 * acceptable pour une mesure de charge — pas pour un fait dont dépend une
 * DÉCISION D'EXPLOITATION (« ce chemin de compatibilité sert-il encore ? »).
 * Un compteur qu'on lit pour décider de retirer du code doit être exact dans
 * le sens « présence », sinon on retire à l'aveugle.
 *
 * Reste best-effort côté échec : la base indisponible ne fait pas échouer
 * l'opération métier, elle fait seulement perdre la mesure — mais l'écriture
 * a bien été attendue.
 */
export async function recordDurableCounter(op: string): Promise<void> {
  await recordOpMetric(op, 0, true);
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
