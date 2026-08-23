"use client";

import {
  creerLotTicketOr,
  modifierLotTicketOr,
  supprimerLotTicketOr,
} from "@/actions/ticket-or";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  TICKET_LIBELLE_MAX,
  TICKET_POIDS_MAX,
  type LotTicketOrView,
} from "@/lib/ticket-or";

/**
 * LES LOTS DU TICKET D'OR (TKT-1) — le stock, pesé.
 *
 * ── LE CHAMP STOCK EST VIDE PAR DÉFAUT, ET C'EST « ILLIMITÉ » ──
 *
 * Vide et « 0 » sont deux intentions différentes : « je ne compte pas » et
 * « il n'y en a plus ». Les confondre aurait épuisé un café offert au premier
 * tirage. L'aide sous le champ le dit, parce que personne ne devine qu'un champ
 * vide veut dire quelque chose.
 *
 * ── LE POIDS N'EST PAS UN POURCENTAGE ──
 *
 * Même sémantique que la roue : une part relative au total. L'écran ne calcule
 * pas de pourcentage — il changerait à chaque lot ajouté, et un chiffre qui
 * bouge tout seul se lit comme une erreur.
 */
export function LotsTicket({
  lots,
  peutRegler,
}: {
  lots: LotTicketOrView[];
  peutRegler: boolean;
}) {
  const creer = useActionForm(creerLotTicketOr, {
    networkError: "Création impossible, réessayez.",
    resetOnSuccess: true,
  });

  if (!peutRegler) {
    return (
      <p className="text-sm text-zinc-500">
        Le réglage des lots est réservé au propriétaire et aux éditeurs. Vous
        pouvez émettre des tickets ci-dessus.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {lots.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Aucun lot pour l&apos;instant. Un ticket ouvert sans lot n&apos;offre
          rien : ajoutez-en au moins un.
        </p>
      ) : (
        <ul className="space-y-3">
          {lots.map((lot) => (
            <li key={lot.id}>
              <LotForm lot={lot} />
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={creer.onSubmit}
        className="space-y-3 rounded-2xl border-2 border-dashed border-k-ink/25 px-4 py-4"
      >
        <p className="text-sm font-black uppercase tracking-wide text-k-body">
          Ajouter un lot
        </p>
        <ChampsLot />
        {creer.state && !creer.state.ok ? (
          <FieldError message={creer.state.error} />
        ) : null}
        <Button type="submit" disabled={creer.pending}>
          {creer.pending ? "Ajout…" : "Ajouter"}
        </Button>
      </form>
    </div>
  );
}

function LotForm({ lot }: { lot: LotTicketOrView }) {
  const modifier = useActionForm(modifierLotTicketOr, {
    networkError: "Enregistrement impossible, réessayez.",
  });
  const supprimer = useActionForm(supprimerLotTicketOr, {
    networkError: "Suppression impossible, réessayez.",
  });

  return (
    <div className="space-y-3 rounded-2xl border-2 border-k-ink/15 px-4 py-4">
      <form onSubmit={modifier.onSubmit} className="space-y-3">
        <input type="hidden" name="id" value={lot.id} />
        <ChampsLot lot={lot} />
        {modifier.state && !modifier.state.ok ? (
          <FieldError message={modifier.state.error} />
        ) : null}
        {modifier.state?.ok ? (
          <p className="text-sm font-semibold text-green-700">Enregistré.</p>
        ) : null}
        <Button type="submit" variant="secondary" disabled={modifier.pending}>
          {modifier.pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </form>

      <form onSubmit={supprimer.onSubmit}>
        <input type="hidden" name="id" value={lot.id} />
        {supprimer.state && !supprimer.state.ok ? (
          <FieldError message={supprimer.state.error} />
        ) : null}
        <button
          type="submit"
          disabled={supprimer.pending}
          className="text-xs font-semibold text-red-600 underline underline-offset-2 disabled:opacity-50"
        >
          {supprimer.pending ? "Suppression…" : "Retirer ce lot"}
        </button>
      </form>
    </div>
  );
}

function ChampsLot({ lot }: { lot?: LotTicketOrView }) {
  const cle = lot?.id ?? "nouveau";
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <Label htmlFor={`lot-libelle-${cle}`}>Lot</Label>
        <Input
          id={`lot-libelle-${cle}`}
          name="libelle"
          defaultValue={lot?.libelle ?? ""}
          required
          maxLength={TICKET_LIBELLE_MAX}
          placeholder="Un café offert"
        />
      </div>

      <div>
        <Label htmlFor={`lot-poids-${cle}`}>Poids</Label>
        <input
          id={`lot-poids-${cle}`}
          name="poids"
          type="number"
          min={0}
          max={TICKET_POIDS_MAX}
          defaultValue={lot?.poids ?? 1}
          className="w-24 rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
        />
      </div>

      <div>
        <Label htmlFor={`lot-stock-${cle}`}>Stock</Label>
        <input
          id={`lot-stock-${cle}`}
          name="stock"
          type="number"
          min={0}
          defaultValue={lot?.stock ?? ""}
          placeholder="illimité"
          className="w-28 rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
          aria-describedby={`lot-stock-aide-${cle}`}
        />
        <p id={`lot-stock-aide-${cle}`} className="mt-1 text-xs text-zinc-500">
          Vide = illimité
        </p>
      </div>

      <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-k-ink">
        <input
          type="checkbox"
          name="actif"
          defaultChecked={lot?.actif ?? true}
          className="size-4 accent-k-ink"
        />
        Tirable
      </label>
    </div>
  );
}
