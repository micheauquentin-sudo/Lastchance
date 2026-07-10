import * as Sentry from "@sentry/nextjs";

/**
 * Sentry pour le runtime Edge (proxy / middleware).
 * Mêmes réglages que le serveur Node.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  sendDefaultPii: false,
});
