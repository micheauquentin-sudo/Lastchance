"use client";

import { useActionForm } from "@/lib/use-action-form";
import { redeemStockHold } from "@/actions/participations";
import { FieldError } from "@/components/ui/input";

/**
 * Retrait en caisse d'une réservation de stock (code RESA-…). Miroir de
 * `ContestRedeemButton` pour le flux, panier facultatif compris : une unité se
 * retire au comptoir, et le montant dépensé à cette occasion alimente le revenu
 * attribuable.
 *
 * Le routeur universel `redeem_reward_by_code` fait foi (atomique, org-scopé,
 * verrouillé), et son bras source `redeem_stock_hold` est BORNÉ PAR LA FENÊTRE
 * AUX DEUX BOUTS. La borne BASSE n'existe que là : un retrait tenté avant
 * l'ouverture ressort en `source_refused`, un état pour lequel le registre n'a
 * pas de mot. C'est la carte au-dessus qui le phrase — « Retrait pas encore
 * ouvert » — à partir de la fenêtre que la caisse lit déjà ; ce bouton ne
 * s'affiche donc pas dans ce cas, et l'erreur ci-dessous ne rattrape que la
 * course (la fenêtre s'ouvre ou se ferme pendant que le client attend).
 */
export function StockRedeemButton({ code }: { code: string }) {
  const { state, pending, onSubmit } = useActionForm(redeemStockHold, {
    // `reloadOnSuccess` : le risque n'est PAS le doublon — la base refuse le
    // second retrait. C'est que le caissier, devant un client qui attend, lit un
    // écran inchangé, reclique, obtient un refus, et en conclut que rien n'a été
    // remis. Il ne donne rien, alors que la base compte l'unité sortie.
    reloadOnSuccess: true,
    // Marque la page rechargée comme ISSUE DE CE GESTE. Sans ce drapeau, la
    // confirmation verte ne reposerait que sur l'horloge : tout porteur du même
    // code, dans les 90 s, lirait l'ordre de remettre une seconde unité.
    reloadWith: { remis: "1" },
  });

  return (
    <form onSubmit={onSubmit} className="space-y-2.5">
      <input type="hidden" name="code" value={code} />
      <div>
        <label
          htmlFor="stock-redeem-basket"
          className="mb-1 block text-xs font-semibold text-zinc-600"
        >
          Montant du panier (facultatif)
        </label>
        <input
          id="stock-redeem-basket"
          name="basket"
          inputMode="decimal"
          placeholder="Ex : 12,50"
          className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <span className="ml-1.5 text-xs text-zinc-500">
          € — alimente le revenu attribuable
        </span>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-800 disabled:bg-orange-300 whitespace-nowrap"
      >
        {pending ? "…" : "Valider le retrait"}
      </button>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}
