"use client";

import { useActionState } from "react";
import { updateDataRetention } from "@/actions/privacy";
import { Button } from "@/components/ui/button";
import { FieldError, Label } from "@/components/ui/input";

const OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Conservation illimitée" },
  { value: "12", label: "12 mois" },
  { value: "24", label: "24 mois" },
  { value: "36", label: "36 mois" },
];

/**
 * Durée de conservation des participations et abonnés désinscrits.
 * Purge appliquée chaque nuit par le cron /api/cron/purge-data.
 */
export function DataRetentionForm({ months }: { months: number | null }) {
  const [state, formAction, pending] = useActionState(updateDataRetention, null);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <div className="flex-1 max-w-xs">
        <Label htmlFor="retention-months">Conserver les données personnelles</Label>
        <select
          id="retention-months"
          name="months"
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
    </form>
  );
}
