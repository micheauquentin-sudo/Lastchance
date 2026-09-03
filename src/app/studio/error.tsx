"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";

/**
 * L'erreur est CAPTURÉE, jamais affichée — motif de `/vitrine-studio/error.tsx`
 * et de `/poster/error.tsx`.
 *
 * Une frontière de segment intercepte l'erreur avant `global-error.tsx`, qui
 * serait sinon le seul endroit à la remonter à Sentry. La poser sans ce
 * `useEffect` ÉTEINDRAIT le signal au lieu de l'améliorer.
 *
 * ── ELLE EST POSÉE SUR `/studio`, PAS SUR UN MODULE ──
 *
 * Les douze animations du produit auront leur studio sous ce segment. Une
 * frontière par module aurait été douze copies à tenir d'accord, et le
 * treizième studio serait arrivé sans la sienne — sans que rien ne le signale,
 * puisqu'une frontière manquante ne casse rien tant que rien ne tombe.
 *
 * ── LA SORTIE DE SECOURS MÈNE AU TABLEAU DE BORD ──
 *
 * Un studio est plein écran : il n'a ni menu ni fil d'Ariane. Un commerçant
 * dont l'aperçu vient de tomber n'a donc AUCUN moyen de revenir en arrière si
 * l'écran d'erreur ne lui en donne pas un. « Réessayer » suffit quand la panne
 * est passagère ; le lien sert quand elle ne l'est pas.
 */
export default function SegmentError({
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
    <main
      role="alert"
      className="flex min-h-dvh items-center justify-center px-6 text-center"
    >
      <div>
        <h1 className="text-xl font-bold text-k-ink">
          Le studio n&apos;a pas pu s&apos;afficher
        </h1>
        <p className="mt-2 text-sm text-k-muted">
          Rien n&apos;a été perdu : vos réglages enregistrés sont intacts, et ce
          que vous n&apos;aviez pas encore enregistré n&apos;a jamais quitté cet
          écran.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-xl bg-k-ink px-5 py-3 text-sm font-semibold text-white"
          >
            Réessayer
          </button>
          <Link
            href="/dashboard"
            className="rounded-xl border-2 border-k-ink px-5 py-3 text-sm font-semibold text-k-ink"
          >
            Revenir au tableau de bord
          </Link>
        </div>
      </div>
    </main>
  );
}
