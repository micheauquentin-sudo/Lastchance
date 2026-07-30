"use client";

import { useActionForm } from "@/lib/use-action-form";
import { redeemHuntCompletion } from "@/actions/participations";
import { FieldError } from "@/components/ui/input";

/**
 * Validation en caisse d'un lot de chasse au trésor (code CHASSE-…). Miroir
 * de RedeemButton : même libellé « Valider la remise », flux unifié côté
 * page caisse. La RPC redeem_hunt_completion fait foi (atomique, org-scopée).
 */
export function HuntRedeemButton({ code }: { code: string }) {
  const { state, pending, onSubmit } = useActionForm(redeemHuntCompletion, {
    // `reloadOnSuccess` : le risque n'est PAS le doublon — la base refuse la
    // seconde remise. C'est que le caissier, devant un client qui attend, lit
    // un écran inchangé, reclique, obtient un refus, et en conclut que le lot
    // n'est pas remis. Il ne donne rien, alors que la base le compte remis et
    // qu'il n'y a pas de marche arrière. Le formulaire ne porte qu'un id caché
    // (et le panier, déjà soumis) : le rechargement ne coûte rien.
    reloadOnSuccess: true,
  });

  return (
    <form onSubmit={onSubmit} className="space-y-2.5">
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
