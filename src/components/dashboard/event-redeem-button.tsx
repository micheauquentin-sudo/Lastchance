"use client";

import { useActionState } from "react";
import { redeemEventPrize } from "@/actions/participations";
import { FieldError } from "@/components/ui/input";

/**
 * Validation en caisse d'un gain de Mode événement (code EVENT-…). Miroir de
 * JackpotRedeemButton : même libellé « Valider la remise », flux unifié côté
 * page caisse. La RPC redeem_event_prize fait foi (atomique, org-scopée).
 */
export function EventRedeemButton({ code }: { code: string }) {
  const [state, formAction, pending] = useActionState(redeemEventPrize, null);

  return (
    <form action={formAction} className="space-y-2.5">
      <input type="hidden" name="code" value={code} />
      <button
        type="submit"
        disabled={pending}
        className="whitespace-nowrap rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 disabled:bg-orange-300"
      >
        {pending ? "…" : "Valider la remise"}
      </button>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}
