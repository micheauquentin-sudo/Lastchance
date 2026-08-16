import * as Sentry from "@sentry/nextjs";
import { scrubSentryBreadcrumb, scrubSentryEvent } from "@/lib/sentry-scrub";

/**
 * Sentry côté client (navigateur).
 * No-op complet si NEXT_PUBLIC_SENTRY_DSN n'est pas défini.
 * Pas de session replay : inutile pour la bêta et coûteux (poids + vie privée).
 *
 * Le navigateur est le runtime le plus exposé (URLs de jeu signées, saisies
 * du joueur dans le fil d'Ariane) : il partage exactement le même
 * assainissement que le serveur, sans copie locale.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate: Number(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1",
  ),
  sendDefaultPii: false,
  beforeSend: (event) => scrubSentryEvent(event),
  beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb),
  // Le navigateur est le seul runtime à VISITER `/commande/<jeton>` et
  // `/hunt/<jeton>` : ses transactions de navigation en portent l'URL, et
  // `beforeSend` ne les intercepte pas.
  beforeSendTransaction: (event) => scrubSentryEvent(event),
});

/** Trace les navigations du routeur App Router. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
