"use client";

import { activerExperiencesVitrine } from "@/actions/vitrine";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/input";

const activerAction = () => activerExperiencesVitrine();

/**
 * Le jeu peut être prêt sans être annoncé : l'ordre des blocs de la Vitrine
 * est un consentement de publication, pas un état implicite du plateau Duo ou
 * du pack Bande. Cette carte rend l'écart visible et le résout par un seul
 * geste, sans ouvrir les autres portes facultatives.
 */
export function ExperiencesVisibilite({ peutEditer }: { peutEditer: boolean }) {
  const { state, pending, onSubmit } = useActionForm(activerAction, {
    networkError: "Activation impossible, réessayez.",
    toastOnSuccess: "Jeux affichés sur votre vitrine.",
  });

  return (
    <Card className="border-k-orange/40 bg-k-yellow/20">
      <h2>Afficher vos jeux</h2>
      <p className="mt-2 text-sm text-k-body">
        Le bloc « Jeux et expériences » est masqué : vos clients ne voient ni
        Portrait de la Bande ni Duo Miroir. Activez-le pour les afficher sur
        votre vitrine publique.
      </p>
      <form onSubmit={onSubmit} className="mt-4">
        {state && !state.ok ? <FieldError message={state.error} /> : null}
        {state?.ok ? (
          <p className="text-sm font-semibold text-k-body" role="status">
            Jeux affichés sur votre vitrine.
          </p>
        ) : null}
        {peutEditer ? (
          <Button type="submit" disabled={pending}>
            {pending ? "Activation…" : "Afficher les jeux"}
          </Button>
        ) : null}
      </form>
    </Card>
  );
}
