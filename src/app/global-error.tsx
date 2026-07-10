"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Filet de sécurité global : remplace le layout racine quand une erreur
 * non gérée le fait planter, et remonte l'erreur à Sentry.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body className="min-h-screen flex items-center justify-center bg-zinc-50 text-zinc-900">
        <div className="text-center px-6">
          <h1 className="text-xl font-semibold">Une erreur est survenue</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Nos équipes ont été prévenues. Rechargez la page pour réessayer.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Recharger la page
          </button>
        </div>
      </body>
    </html>
  );
}
