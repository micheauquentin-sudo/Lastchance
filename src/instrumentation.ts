import * as Sentry from "@sentry/nextjs";

/**
 * Point d'entrée d'instrumentation Next.js : charge la config Sentry
 * adaptée au runtime au démarrage du serveur.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/**
 * Capture toutes les erreurs non gérées des Server Components,
 * Server Actions et Route Handlers.
 */
export const onRequestError = Sentry.captureRequestError;
