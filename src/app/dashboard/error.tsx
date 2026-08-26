"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * L'erreur est CAPTURÉE, jamais affichée.
 *
 * Cette frontière existait avant le groupe `(player)` et souffrait déjà du
 * défaut que la garde de `route-boundaries.test.ts` vient de rendre visible :
 * elle interceptait l'erreur, donc `global-error.tsx` — seul appelant de
 * Sentry jusqu'ici — ne la voyait jamais. Le tableau de bord commerçant
 * plantait en silence.
 */
export default function DashboardError({
  error,
  reset,
}: {
  /** Next attache un `digest` aux erreurs serveur : c'est la clé du journal. */
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <Card role="alert" className="mx-auto max-w-lg py-8 text-center">
      <h2 className="text-lg font-black text-k-ink">Cette page n&apos;a pas pu être chargée</h2>
      <p className="mt-2 text-sm font-bold text-k-body">
        Vos données n&apos;ont pas été modifiées. Réessayez dans un instant.
      </p>
      <Button onClick={reset} className="mt-5">
        Réessayer
      </Button>
      {/* LE DIGEST, ET RIEN D'AUTRE.
          Le message d'erreur n'est JAMAIS affiché — il peut porter un fragment
          de requête ou un nom de colonne. Le `digest` est un condensé opaque
          que Next attache aux erreurs serveur et qui accompagne l'événement
          Sentry capturé juste au-dessus : c'est le seul moyen, pour quelqu'un
          qui voit cet écran, de désigner SON incident plutôt que « une
          erreur ». Sans lui, chaque signalement repart de zéro. */}
      {error.digest && (
        <p className="mt-4 text-xs font-bold text-k-body">
          Code de l&apos;incident :{" "}
          <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </Card>
  );
}
