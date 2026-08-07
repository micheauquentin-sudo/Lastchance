"use client";

import { useActionState } from "react";
import { previewSpin } from "@/actions/preview";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/input";

/**
 * Mode démo : lance un tirage réel (probabilités, stock épuisé exclu)
 * sans rien écrire en base — n'affecte ni les statistiques ni le
 * stock. Utile pour vérifier la config ou former le personnel.
 */
export function WheelPreviewTest({
  wheelId,
  estJeuDeDefi = false,
}: {
  wheelId: string;
  /**
   * Sur les six jeux de DÉFI, l'essai joue toujours la branche « défi réussi »
   * (`src/actions/preview.ts`). La divergence était documentée dans le code et
   * invisible à l'écran : le commerçant lisait un taux de gain optimiste sans
   * savoir qu'il supposait un joueur qui ne se trompe jamais.
   */
  estJeuDeDefi?: boolean;
}) {
  const [state, formAction, pending] = useActionState(previewSpin, null);

  return (
    <Card>
      <h2 className="font-semibold mb-1">Tester le jeu</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Simule un tirage avec les probabilités réelles — n&apos;affecte ni
        vos statistiques ni votre stock.
      </p>
      {estJeuDeDefi && (
        <p className="mb-4 rounded-lg border border-orange-200 bg-orange-50/60 px-3 py-2 text-xs text-zinc-700">
          ⚠️ Votre jeu comporte une épreuve. L&apos;essai simule un client qui la
          RÉUSSIT : en boutique, ceux qui échouent repartent perdants, et le taux
          de gain réel est plus bas que celui affiché ici (à
          pierre-feuille-ciseaux, environ une réussite sur trois).
        </p>
      )}
      <form action={formAction}>
        <input type="hidden" name="wheelId" value={wheelId} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "…" : "Lancer un essai"}
        </Button>
      </form>
      <FieldError message={state && !state.ok ? state.error : undefined} />
      {state?.ok && (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
          {state.data.isLosing ? (
            <p className="text-zinc-600">🎲 Résultat de l&apos;essai : perdu.</p>
          ) : (
            <p className="text-zinc-900">
              🎉 Résultat de l&apos;essai :{" "}
              <span className="font-semibold">{state.data.label}</span>
              {state.data.description && (
                <span className="text-zinc-500"> — {state.data.description}</span>
              )}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
