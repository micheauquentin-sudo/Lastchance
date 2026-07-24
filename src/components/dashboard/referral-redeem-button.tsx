"use client";

import { useActionState } from "react";
import { redeemReferralReward } from "@/actions/participations";
import { FieldError } from "@/components/ui/input";

/**
 * Validation en caisse d'un lot de parrainage (code PARRAIN-…). Miroir de
 * CalendarRedeemButton : même libellé « Valider la remise », flux unifié côté
 * page caisse. La RPC redeem_referral_reward fait foi (atomique, org-scopée ;
 * ne traite que les versements 'lot' — les 'spin' passent par le flux GAIN-…).
 */
export function ReferralRedeemButton({ code }: { code: string }) {
  const [state, formAction, pending] = useActionState(redeemReferralReward, null);

  return (
    <form action={formAction} className="space-y-2.5">
      <input type="hidden" name="code" value={code} />
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
