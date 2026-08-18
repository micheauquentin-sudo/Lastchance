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
  error: Error;
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
    </Card>
  );
}
