"use client";

import { updateCampaignShareInvite } from "@/actions/campaigns";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

/**
 * L'interrupteur « partage après jeu » d'UNE campagne.
 *
 * Ce réglage ne décide QUE du bloc gratuit « Faites gagner vos proches »
 * (partager le lien du jeu, sans récompense) affiché après la partie sur les
 * quinze mécaniques. Le PARRAINAGE RÉCOMPENSÉ, juste en dessous, garde sa
 * propre case : décocher le parrainage ne masquait pas ce bloc-ci — c'est
 * précisément la confusion que ce réglage lève.
 */
export function CampaignShareSettings({
  campaignId,
  enabled,
}: {
  campaignId: string;
  enabled: boolean;
}) {
  const { state, onSubmit } = useActionForm(updateCampaignShareInvite, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  return (
    <Card>
      <h2 className="mb-1 font-black text-k-ink">Partage du jeu</h2>
      <p className="mb-4 text-sm font-bold text-k-body">
        Après leur partie, gagnée ou perdue, vos clients peuvent partager le
        lien du jeu à leurs proches. C&apos;est gratuit pour vous : ce partage
        ne donne aucune récompense — pour récompenser vos parrains, activez le
        parrainage ci-dessous.
      </p>

      <form onSubmit={onSubmit} className="space-y-3">
        <input type="hidden" name="id" value={campaignId} />
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="share_enabled"
            defaultChecked={enabled}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
          />
          <span className="text-sm text-zinc-700">
            Proposer le partage du jeu après une partie
          </span>
        </label>

        <FieldError message={state && !state.ok ? state.error : undefined} />
        {state?.ok && (
          <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
        )}
      </form>
    </Card>
  );
}
