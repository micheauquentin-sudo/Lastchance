"use client";

import { updateReserverActivity } from "@/actions/reserver";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { useActionForm } from "@/lib/use-action-form";
import {
  RESERVER_ACTIVITY_DESCRIPTION_MAX,
  RESERVER_ACTIVITY_NAME_MAX,
} from "@/lib/reserver";
import type { ReserverActivityView } from "@/lib/reserver-context";
import { champDescription } from "@/components/reserver/champs";

/**
 * Réglages d'une activité : nom, description, et L'INTERRUPTEUR.
 *
 * ── IL N'Y A PAS DE BOUTON SUPPRIMER, ET CE N'EST PAS UN OUBLI ──
 *
 * La migration ne donne AUCUN `grant delete` sur ces tables, et sa section 5
 * explique pourquoi : la cascade de la FK composite emporterait les créneaux,
 * puis les réservations de ces créneaux — donc l'historique des arrivées — sans
 * qu'aucun écran n'ait compté ce qui allait disparaître. Couper l'activité
 * ferme les réservations à venir et ne touche à rien de ce qui est déjà pris.
 * Un bouton « Supprimer » ici n'échouerait pas silencieusement : il n'aurait
 * simplement aucune action derrière lui, ce qui est pire.
 *
 * L'interrupteur est une case à cocher et non un `role="switch"` maison : elle
 * est dans le `<form>`, donc son état part avec l'enregistrement, elle est
 * atteignable au clavier sans une ligne de JavaScript, et un lecteur d'écran
 * annonce « coché / non coché » sans qu'on ait à le lui apprendre.
 */
export function ActiviteReglagesForm({ activite }: { activite: ReserverActivityView }) {
  // useActionForm et non useActionState : l'état de chargement doit retomber
  // même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
  const { state, pending, onSubmit } = useActionForm(
    updateReserverActivity,
    { networkError: "Enregistrement impossible, réessayez." },
  );

  return (
    <Card>
      <h2>Réglages de l&apos;activité</h2>
      <form onSubmit={onSubmit} className="mt-4">
        <input type="hidden" name="id" value={activite.id} />

        <div>
          <Label htmlFor="activite-nom">Nom de l&apos;activité</Label>
          <Input
            id="activite-nom"
            name="name"
            required
            maxLength={RESERVER_ACTIVITY_NAME_MAX}
            defaultValue={activite.name}
          />
        </div>

        <div className="mt-4">
          <Label htmlFor="activite-description">
            Description <span className="font-semibold text-k-body">(facultatif)</span>
          </Label>
          <textarea
            id="activite-description"
            name="description"
            rows={4}
            maxLength={RESERVER_ACTIVITY_DESCRIPTION_MAX}
            defaultValue={activite.description ?? ""}
            placeholder="Durée, ce qui est fourni, où se présenter…"
            className={champDescription}
          />
          <p className="mt-1.5 text-xs font-semibold text-k-body">
            Ce texte s&apos;affiche sur la page que vos clients ouvrent en
            scannant votre QR code.
          </p>
        </div>

        <div className="mt-5 rounded-xl border-2 border-k-ink bg-k-bg p-4">
          <label
            htmlFor="activite-active"
            className="flex cursor-pointer items-start gap-3"
          >
            <input
              id="activite-active"
              name="active"
              type="checkbox"
              value="on"
              defaultChecked={activite.active}
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-2 border-k-ink accent-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
            />
            <span>
              <span className="block text-sm font-black text-k-ink">
                Activité ouverte aux réservations
              </span>
              <span className="mt-0.5 block text-sm font-semibold text-k-body">
                Décochez pour fermer tous ses créneaux d&apos;un coup. Les
                réservations déjà confirmées et les arrivées déjà enregistrées
                restent intactes.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
          {state?.ok ? (
            <p className="text-sm font-bold text-emerald-700">Enregistré.</p>
          ) : null}
        </div>
        <FieldError message={state && !state.ok ? state.error : undefined} />

        <InfoBulle
          id="activite-suppression"
          resume="Pourquoi je ne peux pas supprimer une activité ?"
          className="mt-4"
        >
          Supprimer emporterait ses créneaux, et avec eux toutes les
          réservations et toutes les arrivées enregistrées — votre historique de
          remplissage disparaîtrait sans prévenir. Couper l&apos;activité produit
          l&apos;effet que vous cherchez : plus personne ne peut réserver, et
          rien n&apos;est perdu.
        </InfoBulle>
      </form>
    </Card>
  );
}
