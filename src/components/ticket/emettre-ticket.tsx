"use client";

import { useState } from "react";
import { emettreTicketOr } from "@/actions/ticket-or";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { FieldError, Label } from "@/components/ui/input";
import { TicketQr } from "@/components/ticket/ticket-qr";
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
 * Le QR et le code sont rendus par l'action, montrés en grand, et aucune
 * lecture ultérieure ne les redonne. C'est ce qui fait qu'un ticket SE REMET à
 * quelqu'un plutôt qu'il ne se consulte : s'il restait lisible dans un
 * historique, n'importe quel membre pourrait le rejouer depuis son propre
 * téléphone, et « constaté par le staff » ne voudrait plus rien dire.
 *
 * ── LE QR, ET LE CODE SOUS LE QR ──
 *
 * Le client scanne l'écran du comptoir : plus rien à taper, plus de faute de
 * frappe sur dix caractères dictés dans le bruit. Le code écrit reste dessous
 * comme chemin de SECOURS — appareil photo capricieux, écran trop sombre,
 * client sans smartphone. Le QR ne transporte que l'URL publique du ticket,
 * c'est-à-dire ce même code : il n'ouvre aucun droit de plus.
 *
 * ── SANS LOT, LE BOUTON PRÉVIENT AU LIEU DE REFUSER ──
 *
 * Émettre reste possible : le commerçant peut vouloir distribuer aujourd'hui et
 * remplir son stock ce soir. Mais l'écran le DIT, parce qu'un ticket ouvert sur
 * une carte vide rend « il n'y a plus rien à gagner » à un client qui vient de
 * revenir — la pire des premières impressions.
 */
export function EmettreTicket({
  sansLot,
  baseUrl,
}: {
  sansLot: boolean;
  /**
   * Origine ABSOLUE de l'application (`APP_URL`), calculée par la page RSC. Un
   * chemin relatif produirait un QR qui ne mène nulle part, et
   * `window.location.origin` ferait diverger l'aperçu du PNG téléchargé.
   */
  baseUrl: string;
}) {
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
        <div className="rounded-2xl border-2 border-k-ink bg-white px-4 py-5 text-center">
          <p className="text-xs font-black uppercase tracking-wide text-k-body">
            À faire scanner par le client
          </p>

          <div className="mt-4">
            <TicketQr
              url={`${baseUrl}/ticket/${dernier.code}`}
              code={dernier.code}
            />
          </div>

          {/* LE CHEMIN DE SECOURS, sous le QR et non à sa place : appareil
              photo capricieux, écran trop sombre, client sans smartphone. */}
          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-k-body">
            Ou dictez ce code
          </p>
          <p className="mt-1 font-mono text-2xl font-black tracking-widest tabular-nums text-k-ink">
            {dernier.code}
          </p>

          <p className="mt-3 text-xs text-k-body">
            {dernier.expireLe
              ? `Valable jusqu'au ${new Date(dernier.expireLe).toLocaleDateString("fr-FR")}.`
              : "Valable un mois."}{" "}
            Ni ce QR ni ce code ne seront réaffichés : faites scanner tout de
            suite, ou notez le code.
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
