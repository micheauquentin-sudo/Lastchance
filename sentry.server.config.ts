import * as Sentry from "@sentry/nextjs";
import { scrubSentryBreadcrumb, scrubSentryEvent } from "@/lib/sentry-scrub";

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

  // Dernière barrière avant l'envoi : secrets, jetons, URLs signées, email,
  // téléphone et données personnelles retirés des exceptions ET du fil
  // d'Ariane (src/lib/sentry-scrub.ts). Le diagnostic — texte d'erreur,
  // codes, durées, identifiants techniques — est conservé.
  beforeSend: (event) => scrubSentryEvent(event),
  beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb),

  // `beforeSend` ne voit PAS les transactions de performance. Elles portent
  // pourtant `request.url` et un nom de transaction — donc, sur les routes
  // `/commande/<jeton>` et `/hunt/<jeton>`, un jeton porteur rejouable.
  beforeSendTransaction: (event) => scrubSentryEvent(event),
});
