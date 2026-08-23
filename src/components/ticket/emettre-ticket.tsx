"use client";

import { useState } from "react";
import { emettreTicketOr } from "@/actions/ticket-or";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { FieldError, Label } from "@/components/ui/input";
import {
  TICKET_JOURS_DEFAUT,
  TICKET_JOURS_MAX,
  TICKET_JOURS_MIN,
} from "@/lib/ticket-or";

/**
 * ÉMETTRE UN TICKET D'OR AU COMPTOIR (TKT-1).
 *
 * ── LE CODE NE S'AFFICHE QU'UNE FOIS, ET C'EST VOULU ──
 *
 * Il est rendu par l'action, montré en grand, et aucune lecture ultérieure ne
 * le redonne. C'est ce qui fait qu'un ticket SE REMET à quelqu'un plutôt qu'il
 * ne se consulte : s'il restait lisible dans un historique, n'importe quel
 * membre pourrait le rejouer depuis son propre téléphone, et « constaté par le
 * staff » ne voudrait plus rien dire.
 *
 * ── SANS LOT, LE BOUTON PRÉVIENT AU LIEU DE REFUSER ──
 *
 * Émettre reste possible : le commerçant peut vouloir distribuer aujourd'hui et
 * remplir son stock ce soir. Mais l'écran le DIT, parce qu'un ticket ouvert sur
 * une carte vide rend « il n'y a plus rien à gagner » à un client qui vient de
 * revenir — la pire des premières impressions.
 */
export function EmettreTicket({ sansLot }: { sansLot: boolean }) {
  const [dernier, setDernier] = useState<{
    code: string;
    expireLe: string | null;
  } | null>(null);

  const { state, pending, onSubmit } = useActionForm(emettreTicketOr, {
    networkError: "Émission impossible, réessayez.",
    onSuccess: (data) => setDernier(data),
  });

  return (
    <div className="space-y-4">
      {sansLot ? (
        <p
          role="status"
          className="rounded-xl border-2 border-amber-600/30 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"
        >
          Aucun lot n&apos;est tirable pour l&apos;instant : un ticket ouvert
          aujourd&apos;hui n&apos;offrirait rien. Ajoutez au moins un lot
          ci-dessous.
        </p>
      ) : null}

      {dernier ? (
        <div className="rounded-2xl border-2 border-k-ink bg-white px-4 py-4 text-center">
          <p className="text-xs font-black uppercase tracking-wide text-k-body">
            À remettre au client
          </p>
          <p className="mt-2 font-mono text-2xl font-black tracking-widest tabular-nums text-k-ink">
            {dernier.code}
          </p>
          <p className="mt-2 text-xs text-k-body">
            {dernier.expireLe
              ? `Valable jusqu'au ${new Date(dernier.expireLe).toLocaleDateString("fr-FR")}.`
              : "Valable un mois."}{" "}
            Ce code ne sera plus affiché : notez-le ou remettez-le tout de suite.
          </p>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="ticket-jours">Valable (jours)</Label>
          <input
            id="ticket-jours"
            name="jours"
            type="number"
            min={TICKET_JOURS_MIN}
            max={TICKET_JOURS_MAX}
            defaultValue={TICKET_JOURS_DEFAUT}
            className="w-28 rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Émission…" : "Émettre un ticket"}
        </Button>
        {state && !state.ok ? (
          <div className="w-full">
            <FieldError message={state.error} />
          </div>
        ) : null}
      </form>
    </div>
  );
}
