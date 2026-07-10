import * as Sentry from "@sentry/nextjs";

/**
 * Sentry côté client (navigateur).
 * No-op complet si NEXT_PUBLIC_SENTRY_DSN n'est pas défini.
 * Pas de session replay : inutile pour la bêta et coûteux (poids + vie privée).
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate: Number(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1",
  ),
  sendDefaultPii: false,
});

/** Trace les navigations du routeur App Router. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
