"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * L'erreur est CAPTURÉE, jamais affichée — même raison que
 * `src/app/dashboard/error.tsx` : cette frontière interceptait l'erreur avant
 * `global-error.tsx`, seul appelant de Sentry jusqu'ici.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-white p-8 text-center">
      <h2 className="font-bold">Chargement impossible</h2>
      <p className="mt-2 text-sm text-zinc-500">Aucune action n&apos;a été appliquée.</p>
      <button onClick={reset} className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">Réessayer</button>
    </div>
  );
}
