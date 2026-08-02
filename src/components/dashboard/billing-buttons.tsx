"use client";

import { useActionState } from "react";
import { createCheckoutSession, createPortalSession } from "@/actions/billing";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { billingButtonsToShow } from "@/lib/subscription";

/**
 * Les deux boutons répondent à deux questions différentes et ne s'excluent
 * PAS : un abonnement résilié laisse un portail à consulter et un checkout à
 * reprendre. Les traiter comme une alternative sur « possède un client
 * Stripe » faisait disparaître le checkout au premier abandon de la page de
 * paiement. Le calcul vit dans `billingActions` (src/lib/subscription.ts).
 *
 * CE QUE LE REFUS DU SERVEUR PEUT OUVRIR. `canCheckout`/`canManage` sont
 * calculés au RENDU de la page, à partir de ce que le webhook Stripe a écrit ;
 * le refus, lui, vient d'interroger Stripe. Quand ce refus nomme « Gérer mon
 * abonnement » alors que `canManage` l'avait caché — webhook en retard ou
 * jamais appliqué —, l'écran doit ouvrir cette sortie plutôt que de la
 * nommer dans le vide. La règle et sa justification de sécurité sont dans
 * `billingButtonsToShow`.
 */
export function BillingButtons({
  canCheckout,
  canManage,
}: {
  canCheckout: boolean;
  canManage: boolean;
}) {
  const [checkoutState, checkoutAction, checkoutPending] = useActionState(
    createCheckoutSession,
    null,
  );
  const [portalState, portalAction, portalPending] = useActionState(
    createPortalSession,
    null,
  );

  const checkoutError =
    checkoutState && !checkoutState.ok ? checkoutState.error : null;
  const { showCheckout, showPortal } = billingButtonsToShow({
    canCheckout,
    canManage,
    checkoutError,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {showCheckout && (
          <form action={checkoutAction}>
            <Button type="submit" disabled={checkoutPending}>
              {checkoutPending ? "Redirection…" : "Démarrer mon abonnement"}
            </Button>
          </form>
        )}
        {showPortal && (
          <form action={portalAction}>
            <Button type="submit" variant="secondary" disabled={portalPending}>
              {portalPending ? "Redirection…" : "Gérer mon abonnement"}
            </Button>
          </form>
        )}
      </div>
      <FieldError
        message={
          checkoutError
            ?? (portalState && !portalState.ok ? portalState.error : undefined)
        }
      />
    </div>
  );
}
