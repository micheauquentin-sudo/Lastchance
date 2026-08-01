"use client";

import { updateWeeklyDigest } from "@/actions/notifications";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

/**
 * Interrupteur du rapport hebdomadaire du lundi (opt-OUT : la colonne vaut
 * `true` par défaut).
 *
 * C'EST LA SORTIE QUE PROMET CHAQUE E-MAIL. Le pied de page du rapport pointe
 * vers `/dashboard/settings#weekly-digest` ; si l'ancre ou l'interrupteur
 * manquent, le commerçant atterrit sur un écran sans issue et se désabonne par
 * le seul moyen qui lui reste — le bouton « spam » de sa messagerie, qui coûte
 * la délivrabilité de tous les e-mails du domaine, codes de gain compris.
 * `weekly-digest-anchor.test.ts` tient les deux bouts ensemble.
 *
 * Même forme que `NotifyWinToggle`, volontairement : les deux réglages de
 * notification vivent dans la même carte et doivent se manipuler pareil.
 * `useActionForm` et non `useActionState` : l'état de chargement doit retomber
 * même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
 */
export function WeeklyDigestToggle({ enabled }: { enabled: boolean }) {
  const { state, onSubmit } = useActionForm(updateWeeklyDigest, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="weekly_digest"
          defaultChecked={enabled}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
        />
        {/* CE QUE LE COMMERÇANT REÇOIT, pas le nom de la colonne : quand, et
            quoi. « Rapport hebdomadaire » seul ne dit ni l'un ni l'autre, et
            un réglage qu'on ne comprend pas ne se coupe pas — il se signale. */}
        <span className="text-sm text-zinc-700">
          Rapport hebdomadaire par e-mail : chaque lundi, le bilan de la
          semaine écoulée — joueurs, lots gagnés et retirés, podium des
          récompenses — comparé à la semaine précédente.
        </span>
      </label>
      <FieldError message={state && !state.ok ? state.error : undefined} />
      {state?.ok && (
        <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
      )}
    </form>
  );
}
