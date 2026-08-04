"use client";

import { retryNewsletterCampaign } from "@/actions/newsletter";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

/**
 * Relance d'une campagne en échec (total ou partiel) — re-file le job.
 * `useActionForm` et non `useActionState` : l'état de chargement doit retomber
 * même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
 *
 * Ce bouton est un CAS PLUS FRANC que le composer, et pour trois raisons qui
 * s'additionnent : il ne rend AUCUN succès (seul `state.error` est affiché),
 * la campagne repasse `queued` — un état que seule la pastille rendue par le
 * serveur montre —, et le bouton lui-même ne disparaît que par ce rendu, la
 * page ne l'affichant que sur `failed`/`partial`. Rafraîchissement manqué : le
 * commerçant relit « Échec » sous un bouton toujours là, et reclique. La clé
 * d'idempotence de la relance porte `Date.now()` : le second clic dépose un
 * VRAI second job, et les abonnés reçoivent deux fois le même message.
 */
export function RetryCampaignButton({ campaignId }: { campaignId: string }) {
  const { state, pending, onSubmit } = useActionForm(retryNewsletterCampaign, {
    reloadOnSuccess: true,
    networkError: "Relance impossible, réessayez.",
  });

  return (
    <form onSubmit={onSubmit} className="mt-1">
      <input type="hidden" name="id" value={campaignId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-semibold text-k-ink underline underline-offset-2 hover:text-k-orange disabled:opacity-60"
      >
        {pending ? "Relance…" : "Relancer l'envoi"}
      </button>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}
