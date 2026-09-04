"use client";

import { useRef, useState } from "react";
import { updateWheelSchedule } from "@/actions/prizes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChampsCreneau } from "@/components/dashboard/atelier-roue-creneau";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
import type { Wheel } from "@/types/database";

/**
 * Planification horaire d'une roue (multi-roues). Laissée vide, la roue
 * est toujours active. Renseignée, elle ne s'active que sur le créneau —
 * la roue active au moment du jeu est choisie par créneau puis position
 * (voir lib/wheel-schedule.ts). Heures locales de l'établissement.
 *
 * `useActionForm` et non `useActionState` : c'était le DERNIER éditeur de cet
 * écran à porter le hook natif, dont le `pending` peut ne jamais retomber
 * après un `revalidatePath` (~1 fois sur 8, docs/bugs.md). Un bouton figé sur
 * « … » y laissait croire que le créneau n'était pas enregistré alors qu'il
 * l'était — et dans un parcours en étapes, il bloque la suite.
 *
 * ── LES CONTRÔLES SONT PARTAGÉS AVEC LE STUDIO (VIT-46) ──
 *
 * Ils vivent dans `atelier-roue-creneau.tsx` et sont désormais CONTRÔLÉS. Ce
 * qui part est identique — les mêmes `name`, les mêmes valeurs — mais la
 * vérité n'est plus dans le seul DOM, ce qui permet au studio de lire le même
 * créneau pour en faire sa signature d'enregistrement.
 */
export function WheelScheduleEditor({ wheel }: { wheel: Wheel }) {
  const { state, pending, onSubmit } = useActionForm(updateWheelSchedule, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Enregistré.",
  });
  // Cocher un jour ou choisir une heure enregistre tout seul : ce formulaire
  // n'a que des cases et des listes, aucune saisie libre à laisser en plan.
  // Le bouton reste — il est le recours quand la validation du navigateur
  // refuse l'envoi, et plusieurs parcours l'utilisent encore.
  const formRef = useRef<HTMLFormElement>(null);
  const { enAttente, bloqueParValidation } = useAutoSave(formRef);

  const [debut, setDebut] = useState(
    wheel.schedule_start_hour === null ? "" : String(wheel.schedule_start_hour),
  );
  const [fin, setFin] = useState(
    wheel.schedule_end_hour === null ? "" : String(wheel.schedule_end_hour),
  );
  const [jours, setJours] = useState<number[]>([
    ...(wheel.schedule_days ?? []),
  ]);

  return (
    <Card>
      <h2 className="font-semibold mb-1">Planification</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Laissez vide pour une roue toujours active. Sinon, elle ne tourne
        que sur le créneau choisi (heure locale).
      </p>
      <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="id" value={wheel.id} />

        <ChampsCreneau
          debut={debut}
          fin={fin}
          jours={jours}
          onDebut={setDebut}
          onFin={setFin}
          onJours={setJours}
        />

        <FieldError message={state && !state.ok ? state.error : undefined} />
        <Button type="submit" variant="secondary" disabled={pending} className="w-full">
          {pending ? "…" : "Enregistrer le créneau"}
        </Button>
        {state?.ok && (
          <p className="text-center text-sm text-emerald-600">
            Créneau enregistré.
          </p>
        )}
        {enAttente && !pending && (
          <p className="text-center text-sm font-semibold text-k-body">
            Modification en attente d&apos;enregistrement…
          </p>
        )}
        {/* Un enregistrement automatique silencieusement inopérant est pire que
            pas d'enregistrement du tout. */}
        {bloqueParValidation && (
          <p role="alert" className="text-sm font-semibold text-red-700">
            Non enregistré : un champ requis est vide ou invalide.
          </p>
        )}
      </form>
    </Card>
  );
}
