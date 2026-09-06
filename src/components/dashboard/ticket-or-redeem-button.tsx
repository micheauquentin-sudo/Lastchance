"use client";

import { useActionForm } from "@/lib/use-action-form";
import { redeemTicketOr } from "@/actions/participations";
import { FieldError } from "@/components/ui/input";

/**
 * Remise en caisse du lot d'un Ticket d'Or (code TICKET-…, TKT-1). Miroir de
 * `HuntRedeemButton` pour le flux : un code caché, un bouton, aucun panier —
 * le module n'attribue ni panier ni revenu, et un champ que rien ne lirait
 * ferait saisir un montant pour rien.
 *
 * Le routeur universel `redeem_reward_by_code` fait foi (atomique, org-scopé,
 * verrouillé) ; son bras source `redeem_ticket_or` n'est appelable que par le
 * `service_role`, donc jamais depuis ici.
 */
export function TicketOrRedeemButton({ code }: { code: string }) {
  const { state, pending, onSubmit } = useActionForm(redeemTicketOr, {
    // `reloadOnSuccess` : le risque n'est PAS le doublon — la base refuse la
    // seconde remise. C'est que le caissier, devant un client qui attend, lit un
    // écran inchangé, reclique, obtient un refus, et en conclut que rien n'a été
    // remis. Il ne donne rien, alors que la base compte le lot sorti.
    reloadOnSuccess: true,
    // Marque la page rechargée comme ISSUE DE CE GESTE. Sans ce drapeau, la
    // confirmation verte ne reposerait que sur l'horloge : tout porteur du même
    // code, dans les 90 s, lirait l'ordre de remettre un second lot.
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
