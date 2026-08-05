"use client";

import { useActionState } from "react";
import {
  activateAddonGrant,
  createAddonCheckoutSession,
} from "@/actions/billing";
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

/**
 * Le bouton qui fait DÉMARRER un pass déjà payé.
 *
 * `useActionState` comme son voisin d'achat, mais pour une autre raison :
 * l'action ne redirige pas, elle revalide. Ce qui compte ici est que le refus
 * s'affiche — « cette option ne peut plus être démarrée » est le seul retour
 * possible quand la fenêtre d'activation vient d'expirer entre le rendu de la
 * page et le clic.
 *
 * LE BOUTON DIT CE QU'IL DÉCLENCHE. Démarrer est irréversible : les jours
 * payés commencent à courir et rien ne les rend. Annoncer la date de fin AVANT
 * le clic est la seule façon qu'un commerçant qui prépare son animation ne
 * lance pas son Quiz express de sept jours trois semaines trop tôt.
 */
export function DemarrerAddon({
  grantId,
  nom,
  finSiDemarreMaintenant,
}: {
  grantId: string;
  nom: string;
  /** Date de fin telle qu'elle sera posée, déjà formatée. */
  finSiDemarreMaintenant: string;
}) {
  const [state, action, pending] = useActionState(activateAddonGrant, null);

  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="grant" value={grantId} />
        <Button type="submit" disabled={pending}>
          {pending ? "Démarrage…" : `Démarrer ${nom}`}
        </Button>
      </form>
      <p className="text-xs text-zinc-600">
        Une fois démarré, ce pass court jusqu&apos;au{" "}
        <strong>{finSiDemarreMaintenant}</strong>. Ce départ ne peut pas être
        annulé.
      </p>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </div>
  );
}
