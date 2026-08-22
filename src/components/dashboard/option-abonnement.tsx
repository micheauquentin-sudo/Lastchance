"use client";

import { useActionState } from "react";
import { toggleSubscriptionOption } from "@/actions/billing";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

/**
 * L'interrupteur d'une option vendue en LIGNE de l'abonnement.
 *
 * ── POURQUOI CE N'EST PAS `AchatAddon` ──
 *
 * `AchatAddon` ouvre un tunnel Stripe et se termine par un `redirect` : c'est
 * la forme d'un ACHAT. Ici, rien ne s'achète séparément — on modifie
 * l'abonnement en cours. Le commerçant ne quitte pas la page, Stripe proratise
 * seul, et la prochaine facture porte une ligne de plus.
 *
 * D'où `useActionState` sans redirection, et un libellé qui dit le geste
 * (« Ajouter à mon abonnement ») plutôt que le montant seul : le prix est déjà
 * au-dessus, et « Acheter — 20 € » laisserait croire à un second prélèvement,
 * c'est-à-dire exactement le défaut que ce lot ferme.
 */
export function OptionAbonnement({
  entitlement,
  nom,
  prixMensuel,
  active,
}: {
  entitlement: string;
  nom: string;
  prixMensuel: number;
  /** L'option est-elle déjà sur l'abonnement ? Décide du geste proposé. */
  active: boolean;
}) {
  const [state, action, pending] = useActionState(
    toggleSubscriptionOption,
    null,
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="option" value={entitlement} />
      <input
        type="hidden"
        name="geste"
        value={active ? "retirer" : "ajouter"}
      />
      <Button
        type="submit"
        disabled={pending}
        variant={active ? "secondary" : "primary"}
        className="w-full"
      >
        {pending
          ? "…"
          : active
            ? `Retirer ${nom} de mon abonnement`
            : `Ajouter à mon abonnement — ${prixMensuel} €/mois`}
      </Button>
      {/* Le prorata est dit AVANT le clic, pas découvert sur la facture. */}
      <p className="text-xs text-zinc-600">
        {active
          ? "Le retrait prend effet tout de suite ; le temps déjà payé revient en avoir sur la prochaine facture."
          : "Ajoutée à votre abonnement en cours : une seule facture, une seule date, et seuls les jours restants du mois sont facturés."}
      </p>
      {state && !state.ok && <FieldError message={state.error} />}
    </form>
  );
}
