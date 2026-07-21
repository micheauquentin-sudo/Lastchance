"use client";

import { useActionState } from "react";
import { retryNewsletterCampaign } from "@/actions/newsletter";
import { FieldError } from "@/components/ui/input";

/** Relance d'une campagne en échec (total ou partiel) — re-file le job. */
export function RetryCampaignButton({ campaignId }: { campaignId: string }) {
  const [state, formAction, pending] = useActionState(retryNewsletterCampaign, null);

  return (
    <form action={formAction} className="mt-1">
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
