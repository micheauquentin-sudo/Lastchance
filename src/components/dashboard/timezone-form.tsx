"use client";

import { useActionState } from "react";
import { updateOrganizationTimezone } from "@/actions/organizations";

const TIMEZONES = [
  "Europe/Paris",
  "Europe/Brussels",
  "Europe/Luxembourg",
  "Europe/Zurich",
  "America/Guadeloupe",
  "America/Martinique",
  "Indian/Reunion",
  "Pacific/Noumea",
  "Pacific/Tahiti",
];

export function TimezoneForm({ timezone }: { timezone: string }) {
  const [state, action, pending] = useActionState(updateOrganizationTimezone, null);
  return (
    <form action={action} className="space-y-3">
      <label htmlFor="timezone" className="block text-sm font-medium text-zinc-700">
        Fuseau horaire
      </label>
      <div className="flex gap-2">
        <select
          id="timezone"
          name="timezone"
          defaultValue={timezone}
          className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
        >
          {!TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
          {TIMEZONES.map((value) => <option key={value}>{value}</option>)}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "…" : "Enregistrer"}
        </button>
      </div>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-600">Fuseau mis à jour.</p>}
    </form>
  );
}
