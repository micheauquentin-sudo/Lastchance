"use client";

import { useActionState } from "react";
import { createCheckoutSession, createPortalSession } from "@/actions/billing";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

export function BillingButtons({
  hasSubscription,
}: {
  hasSubscription: boolean;
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
        {!hasSubscription && (
          <form action={checkoutAction}>
            <Button type="submit" disabled={checkoutPending}>
              {checkoutPending ? "Redirection…" : "Démarrer mon abonnement"}
            </Button>
          </form>
        )}
        {hasSubscription && (
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
