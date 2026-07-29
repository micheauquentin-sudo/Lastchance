"use client";

import { retryNewsletterCampaign } from "@/actions/newsletter";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

/**
 * Relance d'une campagne en échec (total ou partiel) — re-file le job.
 * `useActionForm` et non `useActionState` : l'état de chargement doit retomber
 * même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
 */
export function RetryCampaignButton({ campaignId }: { campaignId: string }) {
  const { state, pending, onSubmit } = useActionForm(retryNewsletterCampaign, {
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
