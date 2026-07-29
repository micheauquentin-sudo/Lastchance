"use client";

import { updateNotifyOnWin } from "@/actions/notifications";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

/**
 * Interrupteur : email temps réel au propriétaire à chaque gain réclamé.
 * `useActionForm` et non `useActionState` : l'état de chargement doit retomber
 * même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
 */
export function NotifyWinToggle({ enabled }: { enabled: boolean }) {
  const { state, onSubmit } = useActionForm(updateNotifyOnWin, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="notify_on_win"
          defaultChecked={enabled}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
        />
        <span className="text-sm text-zinc-700">
          Recevoir un email dès qu&apos;un client gagne et réclame son lot
          (nom, lot, code à valider).
        </span>
      </label>
      <FieldError message={state && !state.ok ? state.error : undefined} />
      {state?.ok && (
        <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
      )}
    </form>
  );
}
