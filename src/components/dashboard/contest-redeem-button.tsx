"use client";

import { useActionForm } from "@/lib/use-action-form";
import { redeemContestAward } from "@/actions/participations";
import { FieldError } from "@/components/ui/input";

/**
 * Validation en caisse d'un lot de pronostics (code PRONO-…). Miroir de
 * QuizRedeemButton pour le flux, AVEC le champ panier facultatif de
 * RedeemButton : un lot de championnat se retire au comptoir, le montant
 * dépensé à cette occasion alimente le revenu attribuable.
 *
 * La RPC redeem_contest_award fait foi (atomique, org-scopée, verrouillée) —
 * l'action renvoie le motif exact d'un refus (déjà remis / annulé / expiré).
 */
export function ContestRedeemButton({ code }: { code: string }) {
  const { state, pending, onSubmit } = useActionForm(redeemContestAward);

  return (
    <form onSubmit={onSubmit} className="space-y-2.5">
      <input type="hidden" name="code" value={code} />
      <div>
        <label
          htmlFor="contest-redeem-basket"
          className="mb-1 block text-xs font-semibold text-zinc-600"
        >
          Montant du panier (facultatif)
        </label>
        <input
          id="contest-redeem-basket"
          name="basket"
          inputMode="decimal"
          placeholder="Ex : 12,50"
          className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <span className="ml-1.5 text-xs text-zinc-500">
          € — alimente le revenu attribuable
        </span>
      </div>
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
