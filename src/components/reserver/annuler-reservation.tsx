"use client";

import { useCallback } from "react";
import { cancelReservationStaff } from "@/actions/reserver";
import { FieldError } from "@/components/ui/input";
import type { CancelReservationResult, CancelReservationState } from "@/lib/reserver";
import { useActionForm } from "@/lib/use-action-form";
import type { ActionResult } from "@/lib/utils";

/**
 * « ANNULER (STAFF) » — le geste qui rend une place au créneau.
 *
 * ── POURQUOI CE BOUTON EXISTE ──
 *
 * Jusqu'ici, aucun geste commerçant ne libérait une place : `cancel_reservation`
 * exige l'empreinte du cookie du joueur, et `reservations` n'a aucun grant
 * `update`. Un client qui annulait par téléphone laissait son siège gelé
 * jusqu'à l'heure du créneau. Ce bouton appelle
 * `cancel_reservation_staff` (migration 20261003120000), qui revérifie tout en
 * SQL et journalise l'acteur sous `reservation.cancel_staff`.
 *
 * ── IL NE S'AFFICHE QUE LÀ OÙ IL PEUT ABOUTIR ──
 *
 * Même règle que le bouton du joueur : une arrivée enregistrée ne s'annule plus,
 * une réservation déjà annulée n'a rien à annuler, et un créneau commencé ne se
 * désiste plus (la RPC rend `too_late` — elle protège le taux de présence du
 * commerçant contre son propre clic). Proposer un bouton qui échouera est pire
 * que ne pas en proposer ; c'est l'appelant qui décide de le rendre.
 *
 * ── CONFIRMATION EN DEUX TEMPS, ET ELLE NOMME LA CONSÉQUENCE ──
 *
 * « Annuler la réservation ? » ne dit pas qu'AUCUN message ne part vers le
 * client. C'est pourtant ce que le commerçant doit savoir avant de cliquer :
 * la personne se présentera au comptoir avec un code que l'écran d'arrivée
 * refusera, sans avoir rien reçu. Le module n'envoie aujourd'hui qu'une
 * confirmation à la réservation — pas d'email d'annulation (RES-2).
 */
export function AnnulerReservationStaff({
  reservationId,
  code,
}: {
  reservationId: string;
  code: string;
}) {
  /**
   * Adaptateur : la RPC rend un ÉTAT, pas un booléen. Sans ce pont,
   * `reloadOnSuccess` rechargerait la page sur `too_late` comme sur
   * `cancelled` — le commerçant verrait la ligne inchangée et n'aurait aucune
   * explication. Les trois états non réussis deviennent donc un refus lisible.
   */
  const action = useCallback(
    async (
      _prev: ActionResult<CancelReservationResult> | null,
      formData: FormData,
    ): Promise<ActionResult<CancelReservationResult>> => {
      const resultat = await cancelReservationStaff(null, formData);
      if (!resultat.ok || resultat.data.state === "cancelled") return resultat;
      return { ok: false, error: REFUS[resultat.data.state] };
    },
    [],
  );

  // `reloadOnSuccess` : la ligne annulée, le remplissage du créneau et les
  // places restantes sont TOUS dérivés de props serveur, sans aucun état local.
  // Sans rechargement, l'écran affiche encore « confirmée » sur une place déjà
  // rendue — et le clic suivant repart de la même prop périmée.
  const { state, pending, onSubmit } = useActionForm(action, {
    reloadOnSuccess: true,
    networkError:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — rien n'a été annulé.",
  });

  return (
    <form
      onSubmit={(event) => {
        if (
          !confirm(
            `Annuler la réservation ${code} ? Sa place repart immédiatement au créneau, et AUCUN message n'est envoyé au client : prévenez-le vous-même.`,
          )
        ) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
      className="shrink-0"
    >
      <input type="hidden" name="reservationId" value={reservationId} />
      <button
        type="submit"
        disabled={pending}
        // Le créneau porte une LISTE de ces boutons, tous étiquetés pareil : à
        // la lecture d'écran, « Annuler (staff) » douze fois de suite ne dit
        // pas laquelle. Le nom accessible porte donc le code, la surface
        // visible reste courte.
        aria-label={`Annuler (staff) la réservation ${code}`}
        className="rounded-lg border-2 border-k-ink/25 bg-white px-2.5 py-1 text-xs font-bold text-k-body hover:border-k-ink hover:text-k-ink disabled:pointer-events-none disabled:opacity-60"
      >
        {pending ? "Annulation…" : "Annuler (staff)"}
      </button>
      <div aria-live="assertive">
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </div>
    </form>
  );
}

/**
 * Les trois états qui ne sont pas une annulation. `unknown` couvre l'identifiant
 * inconnu ET la réservation d'une autre organisation — la RPC les rend
 * indistincts volontairement, et ce message ne doit donc pas les distinguer non
 * plus.
 */
const REFUS: Record<Exclude<CancelReservationState, "cancelled">, string> = {
  unknown: "Cette réservation est introuvable. Rechargez la page.",
  already_checked_in:
    "Ce client est déjà arrivé : une arrivée enregistrée ne s'annule pas.",
  too_late:
    "Ce créneau a commencé : la place ne se libère plus (elle ne serait reprise par personne, et l'absence resterait dans vos statistiques).",
};
