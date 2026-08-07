"use client";

import { updateWheelSchedule } from "@/actions/prizes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { FieldError, Label } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";
import type { Wheel } from "@/types/database";

// 0=dimanche..6=samedi (comme Date.getDay()), affichés Lun→Dim.
const DAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 0, label: "Dim" },
];

const HOURS = Array.from({ length: 25 }, (_, h) => h);

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
 */
export function WheelScheduleEditor({ wheel }: { wheel: Wheel }) {
  const { state, pending, onSubmit } = useActionForm(updateWheelSchedule, {
    networkError: "Enregistrement impossible, réessayez.",
  });
  const activeDays = wheel.schedule_days ?? [];

  return (
    <Card>
      <h2 className="font-semibold mb-1">Planification</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Laissez vide pour une roue toujours active. Sinon, elle ne tourne
        que sur le créneau choisi (heure locale).
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="id" value={wheel.id} />

        <div>
          <Label>Jours actifs</Label>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <label
                key={d.value}
                className="cursor-pointer select-none rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-700 has-[:checked]:border-orange-400 has-[:checked]:bg-orange-50 has-[:checked]:text-orange-700"
              >
                <input
                  type="checkbox"
                  name="schedule_days"
                  value={d.value}
                  defaultChecked={activeDays.includes(d.value)}
                  className="sr-only"
                />
                {d.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Aucun jour coché = tous les jours.
          </p>
          <InfoBulle
            id="aide-creneau-jours"
            resume="Aucun jour coché : le jeu est-il fermé ?"
            className="mt-2"
          >
            Non — c&apos;est l&apos;inverse. Zéro case cochée signifie{" "}
            <strong>tous les jours</strong>, pas « aucun jour » : le jeu tourne
            en permanence. Ne cochez que si vous voulez le RESTREINDRE, par
            exemple au week-end.
          </InfoBulle>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="schedule_start_hour">Début</Label>
            <select
              id="schedule_start_hour"
              name="schedule_start_hour"
              defaultValue={wheel.schedule_start_hour ?? ""}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">—</option>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}h
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="schedule_end_hour">Fin</Label>
            <select
              id="schedule_end_hour"
              name="schedule_end_hour"
              defaultValue={wheel.schedule_end_hour ?? ""}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">—</option>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}h
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-zinc-400">
          Fin exclusive. Un début supérieur à la fin (ex. 22h→2h) couvre la
          nuit.
        </p>
        <InfoBulle
          id="aide-creneau-fin"
          resume="« Fin exclusive », ça veut dire quoi ?"
        >
          L&apos;heure de fin n&apos;est pas jouable. De 17h à 19h, un client
          peut jouer à 17h00 et à 18h59, mais plus à 19h00. Pour couvrir la
          soirée entière jusqu&apos;à minuit, choisissez 24h en fin.
        </InfoBulle>
        <InfoBulle
          id="aide-creneau-nuit"
          resume="Comment ouvrir de 22h à 2h du matin ?"
        >
          Mettez simplement 22h en début et 2h en fin. Un début SUPÉRIEUR à la
          fin n&apos;est pas une erreur : il se lit comme un créneau qui
          traverse minuit. Les jours cochés désignent alors le jour où le
          créneau COMMENCE.
        </InfoBulle>

        <FieldError message={state && !state.ok ? state.error : undefined} />
        <Button type="submit" variant="secondary" disabled={pending} className="w-full">
          {pending ? "…" : "Enregistrer le créneau"}
        </Button>
        {state?.ok && (
          <p className="text-center text-sm text-emerald-600">
            Créneau enregistré.
          </p>
        )}
      </form>
    </Card>
  );
}
