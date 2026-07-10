import * as Sentry from "@sentry/nextjs";

/**
 * Sentry côté serveur (runtime Node.js).
 * No-op complet si SENTRY_DSN n'est pas défini : l'app fonctionne
 * sans configuration et sans dépendance réseau supplémentaire.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  // Tracing des performances : 10 % des requêtes par défaut,
  // ajustable sans redéploiement de code via l'env.
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),

  // Ne jamais envoyer les cookies / headers d'authentification.
  sendDefaultPii: false,
});
