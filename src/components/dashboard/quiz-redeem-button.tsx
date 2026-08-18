"use client";

import { useActionForm } from "@/lib/use-action-form";
import { redeemQuizReward } from "@/actions/participations";
import { FieldError } from "@/components/ui/input";

/**
 * Validation en caisse d'un lot de quiz (code QUIZ-…). Miroir de
 * CalendarRedeemButton / ReferralRedeemButton : même libellé « Valider la
 * remise », flux unifié côté page caisse. La RPC redeem_quiz_reward fait foi
 * (atomique, org-scopée, verrouillée).
 */
export function QuizRedeemButton({ code }: { code: string }) {
  const { state, pending, onSubmit } = useActionForm(redeemQuizReward, {
    // `reloadOnSuccess` : le risque n'est PAS le doublon — la base refuse la
    // seconde remise. C'est que le caissier, devant un client qui attend, lit
    // un écran inchangé, reclique, obtient un refus, et en conclut que le lot
    // n'est pas remis. Il ne donne rien, alors que la base le compte remis et
    // qu'il n'y a pas de marche arrière. Le formulaire ne porte qu'un id caché
    // (et le panier, déjà soumis) : le rechargement ne coûte rien.
    reloadOnSuccess: true,
    // Marque la page rechargée comme ISSUE DE CE GESTE. Sans ce drapeau, la
    // confirmation verte de la caisse ne reposait que sur l'horloge : tout
    // porteur du même code, dans les 90 s, lisait « ✓ Remise enregistrée —
    // remettez le lot au client », c'est-à-dire l'ordre d'en donner un second.
    reloadWith: { remis: "1" },
  });

  return (
    <form onSubmit={onSubmit} className="space-y-2.5">
      <input type="hidden" name="code" value={code} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-800 disabled:bg-orange-300 whitespace-nowrap"
      >
        {pending ? "…" : "Valider la remise"}
      </button>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}
