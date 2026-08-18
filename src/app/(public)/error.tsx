"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * L'erreur est CAPTURÉE, jamais affichée.
 *
 * Une frontière de segment intercepte l'erreur avant `global-error.tsx`, qui
 * était jusqu'ici le seul endroit à la remonter à Sentry. Poser ces frontières
 * sans ce `useEffect` aurait donc ÉTEINT le signal — et précisément sur les
 * parcours publics, ceux qu'un inconnu peut sonder. Le texte affiché ne change
 * pas d'un mot : on remonte à Sentry, on n'expose rien au visiteur.
 */
export default function SegmentError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main role="alert" className="flex min-h-[60vh] items-center justify-center px-6 text-center">
      <div>
        <h1 className="text-xl font-bold text-k-ink">Cette page n&apos;a pas pu s&apos;afficher</h1>
        <p className="mt-2 text-sm text-k-muted">Rien n&apos;a été perdu. Réessayez, la page se recharge sans quitter le site.</p>
        <button onClick={reset} className="mt-5 rounded-xl bg-k-ink px-5 py-3 text-sm font-semibold text-white">Réessayer</button>
      </div>
    </main>
  );
}
