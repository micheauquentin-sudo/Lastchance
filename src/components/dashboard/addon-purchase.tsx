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

/** Une ressource à laquelle l'achat peut être borné (une compétition). */
export interface RessourceAchat {
  id: string;
  nom: string;
}

export function AchatAddon({
  entitlement,
  price,
  paliers,
  ressources,
  libelleRessource,
}: {
  entitlement: string;
  /** Prix affiché hors pass à jauge, en euros. */
  price?: number;
  /** Paliers réellement vendus, pour un pass à jauge. */
  paliers?: readonly PalierAchat[];
  /**
   * Ressources sélectionnables, pour un pass BORNÉ à une seule d'entre elles.
   * Absent = le pass ouvre son module entier et ne demande aucun choix.
   */
  ressources?: readonly RessourceAchat[];
  /** Comment nommer ce choix au commerçant (« la compétition »). */
  libelleRessource?: string;
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

  // UN PASS BORNÉ SANS AUCUNE RESSOURCE N'EST PAS ACHETABLE, et le dire vaut
  // mieux qu'un bouton qui mène au refus de l'action : « ce qui est proposé est
  // ce qui aboutit » est la règle de cet écran. Le commerçant apprend du même
  // coup le geste qui débloque — créer le brouillon, ce qui ne coûte rien.
  if (ressources && ressources.length === 0) {
    return (
      <p className="rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
        Cette option s&apos;achète pour <strong>{libelleRessource ?? "une ressource"}</strong>.
        Créez-la d&apos;abord — un brouillon suffit —, puis revenez ici pour
        l&apos;acheter.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {boutons.map((bouton) => (
          // LE CHOIX EST DANS LE FORMULAIRE, un par bouton : chaque `<form>` ne
          // poste que ses propres champs. Un `select` hissé au-dessus de la
          // boucle ne serait envoyé par aucun d'eux.
          <form key={bouton.label} action={action} className="space-y-2">
            <input type="hidden" name="addon" value={entitlement} />
            {bouton.capacity !== undefined && (
              <input type="hidden" name="capacity" value={bouton.capacity} />
            )}
            {ressources && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-zinc-700">
                  Pour {libelleRessource ?? "cette ressource"}
                </span>
                <select
                  name="resource"
                  required
                  defaultValue=""
                  className="w-full rounded-xl border-2 border-zinc-300 px-3 py-2"
                >
                  <option value="" disabled>
                    Choisissez…
                  </option>
                  {ressources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nom}
                    </option>
                  ))}
                </select>
              </label>
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
