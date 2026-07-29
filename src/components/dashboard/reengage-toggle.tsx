"use client";

import { updateAutoReengage } from "@/actions/reengagement";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

/**
 * Interrupteur d'opt-in à la relance automatique. Envoie l'état au
 * serveur au changement (auto-submit : `requestSubmit()` déclenche
 * l'événement submit que le hook intercepte). Contrepartie assumée : sans
 * JavaScript le formulaire n'est plus soumissible, le repli <noscript>
 * (bouton Enregistrer) a donc été retiré.
 * useActionForm et non useActionState : l'état de chargement doit retomber
 * même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
 */
export function ReengageToggle({ enabled }: { enabled: boolean }) {
  const { state, onSubmit } = useActionForm(updateAutoReengage, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
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
    </form>
  );
}
