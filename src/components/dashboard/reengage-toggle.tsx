"use client";

import { useActionState } from "react";
import { updateAutoReengage } from "@/actions/reengagement";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

/**
 * Interrupteur d'opt-in à la relance automatique. Envoie l'état au
 * serveur au changement (auto-submit) ; le bouton reste un repli si le
 * JS d'auto-submit ne se déclenche pas.
 */
export function ReengageToggle({ enabled }: { enabled: boolean }) {
  const [state, formAction, pending] = useActionState(updateAutoReengage, null);

  return (
    <form action={formAction} className="space-y-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="auto_reengage"
          defaultChecked={enabled}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
        />
        <span className="text-sm text-zinc-700">
          Envoyer automatiquement un email de relance aux clients inactifs
          (aucun gain depuis 60 jours), au maximum une fois par mois. Seuls
          les clients ayant accepté vos communications sont concernés.
        </span>
      </label>
      <FieldError message={state && !state.ok ? state.error : undefined} />
      {state?.ok && (
        <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
      )}
      <noscript>
        <Button type="submit" variant="secondary" disabled={pending}>
          Enregistrer
        </Button>
      </noscript>
    </form>
  );
}
