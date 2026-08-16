"use client";

import { updateDataRetention } from "@/actions/privacy";
import { Button } from "@/components/ui/button";
import { FieldError, Label } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

const OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Conservation illimitée" },
  { value: "12", label: "12 mois" },
  { value: "24", label: "24 mois" },
  { value: "36", label: "36 mois" },
];

/**
 * Durée de conservation des participations et abonnés désinscrits.
 * Purge appliquée chaque nuit par le cron /api/cron/purge-data.
 *
 * useActionForm et non useActionState : l'état de chargement doit retomber
 * même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
 */
export function DataRetentionForm({ months }: { months: number | null }) {
  // Pas de resetOnSuccess : le select non contrôlé (defaultValue={months})
  // reviendrait visuellement à l'ANCIENNE valeur le temps que la
  // revalidation ramène la nouvelle prop.
  const { state, pending, onSubmit } = useActionForm(updateDataRetention, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1 max-w-xs">
          <Label htmlFor="retention-months">
            Conserver les données personnelles
          </Label>
          <select
            id="retention-months"
            name="months"
            aria-describedby="retention-anonymisation"
            defaultValue={months != null ? String(months) : ""}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "…" : "Enregistrer"}
        </Button>
        {state?.ok && (
          <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
        )}
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </div>
      {/*
        CE RÉGLAGE A UNE CONSÉQUENCE QUE PERSONNE NE DEVINE : la purge
        anonymise les participations, or c'est sur elles que repose la limite
        « une seule fois par personne » d'une roue. Passé le délai, un joueur
        déjà venu redevient inconnu et rejoue. Le commerçant qui règle 12 mois
        croit régler une durée d'archivage ; il règle aussi la mémoire de ses
        propres limites de jeu. Le dire ici coûte une ligne.
      */}
      <p id="retention-anonymisation" className="max-w-prose text-xs text-zinc-500">
        Au-delà de cette durée, les parties sont anonymisées : les limites « une
        seule fois par personne » repartent de zéro pour un joueur qui revient
        après ce délai.
      </p>
    </form>
  );
}
