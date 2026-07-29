"use client";

import { redeemParticipation } from "@/actions/participations";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

/**
 * Remise d'un lot en caisse.
 *
 * `useActionForm` et non `useActionState` : c'est ici que le défaut de
 * transition figée (docs/bugs.md) faisait le plus de dégâts — le caissier
 * voyait « … » indéfiniment devant un client qui attend, sans savoir si le lot
 * était remis, alors que la remise ÉTAIT enregistrée.
 */
export function RedeemButton({
  id,
  compact = false,
}: {
  id: string;
  /** Tableau des participations : bouton seul, sans champ panier. */
  compact?: boolean;
}) {
  const { state, pending, onSubmit } = useActionForm(redeemParticipation, {
    networkError: "Remise impossible, réessayez.",
  });

  return (
    <form onSubmit={onSubmit} className="space-y-2.5">
      <input type="hidden" name="id" value={id} />
      {!compact && (
        <div>
          <label
            htmlFor="redeem-basket"
            className="mb-1 block text-xs font-semibold text-zinc-600"
          >
            Montant du panier (facultatif)
          </label>
          <input
            id="redeem-basket"
            name="basket"
            inputMode="decimal"
            placeholder="Ex : 12,50"
            className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <span className="ml-1.5 text-xs text-zinc-500">
            € — alimente le revenu attribuable
          </span>
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 disabled:bg-orange-300 whitespace-nowrap"
      >
        {pending ? "…" : "Valider la remise"}
      </button>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}
