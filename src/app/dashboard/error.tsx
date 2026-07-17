"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
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
