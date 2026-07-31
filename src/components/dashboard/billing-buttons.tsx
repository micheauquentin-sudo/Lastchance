"use client";

import { useActionState } from "react";
import { createCheckoutSession, createPortalSession } from "@/actions/billing";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

/**
 * Les deux boutons répondent à deux questions différentes et ne s'excluent
 * PAS : un abonnement résilié laisse un portail à consulter et un checkout à
 * reprendre. Les traiter comme une alternative sur « possède un client
 * Stripe » faisait disparaître le checkout au premier abandon de la page de
 * paiement. Le calcul vit dans `billingActions` (src/lib/subscription.ts).
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {canCheckout && (
          <form action={checkoutAction}>
            <Button type="submit" disabled={checkoutPending}>
              {checkoutPending ? "Redirection…" : "Démarrer mon abonnement"}
            </Button>
          </form>
        )}
        {canManage && (
          <form action={portalAction}>
            <Button type="submit" variant="secondary" disabled={portalPending}>
              {portalPending ? "Redirection…" : "Gérer mon abonnement"}
            </Button>
          </form>
        )}
      </div>
      <FieldError
        message={
          checkoutState && !checkoutState.ok
            ? checkoutState.error
            : portalState && !portalState.ok
              ? portalState.error
              : undefined
        }
      />
    </div>
  );
}
