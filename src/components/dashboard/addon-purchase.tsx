"use client";

import { useActionState } from "react";
import { createAddonCheckoutSession } from "@/actions/billing";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

/**
 * Le bouton d'achat d'un add-on autonome.
 *
 * `useActionState` et non `useActionForm`, pour la même raison que l'achat de
 * crédits SMS : l'action se termine par `redirect(url)` vers Stripe. Passer par
 * `useActionForm` ferait transiter le `NEXT_REDIRECT` par son `catch` et
 * afficherait une erreur au moment précis où le paiement s'ouvre.
 *
 * UN FORMULAIRE PAR PALIER, et non un `select` : chaque palier de jauge est un
 * produit Stripe distinct, à son prix. Un `select` laisserait croire qu'on
 * choisit une option d'un même achat, alors qu'on choisit CE qu'on achète — et
 * le prix affiché sur le bouton doit être celui qui sera débité.
 */

export interface PalierAchat {
  maxPlayers: number;
  price: number;
}

export function AchatAddon({
  entitlement,
  price,
  paliers,
}: {
  entitlement: string;
  /** Prix affiché hors pass à jauge, en euros. */
  price?: number;
  /** Paliers réellement vendus, pour un pass à jauge. */
  paliers?: readonly PalierAchat[];
}) {
  const [state, action, pending] = useActionState(
    createAddonCheckoutSession,
    null,
  );

  const boutons =
    paliers && paliers.length > 0
      ? paliers.map((palier) => ({
          capacity: String(palier.maxPlayers),
          label: `${palier.maxPlayers} joueurs — ${palier.price} €`,
        }))
      : [{ capacity: undefined, label: price ? `Acheter — ${price} €` : "Acheter" }];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {boutons.map((bouton) => (
          <form key={bouton.label} action={action}>
            <input type="hidden" name="addon" value={entitlement} />
            {bouton.capacity !== undefined && (
              <input type="hidden" name="capacity" value={bouton.capacity} />
            )}
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "Redirection…" : bouton.label}
            </Button>
          </form>
        ))}
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </div>
  );
}
