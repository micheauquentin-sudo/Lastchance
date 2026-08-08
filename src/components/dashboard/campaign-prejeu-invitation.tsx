"use client";

import Link from "next/link";
import { updateCampaignPrejeuInvitation } from "@/actions/campaigns";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

/**
 * L'interrupteur « Avant de jouer » d'UNE campagne.
 *
 * Les liens, eux, sont ORG-WIDE (Réglages) : ce réglage-ci ne décide que de
 * les proposer ou non sur ce jeu. Quand aucun lien n'est renseigné, la case
 * reste actionnable — l'ordre des deux gestes n'est pas imposé — mais l'écran
 * dit où aller, sans quoi le commerçant coche, ne voit rien apparaître côté
 * joueur, et conclut à une panne.
 */
export function CampaignPrejeuInvitation({
  campaignId,
  enabled,
  aDesLiens,
}: {
  campaignId: string;
  enabled: boolean;
  /** L'organisation a-t-elle au moins un des trois liens renseignés ? */
  aDesLiens: boolean;
}) {
  const { state, onSubmit } = useActionForm(updateCampaignPrejeuInvitation, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  return (
    <Card>
      <h2 className="mb-1 font-black text-k-ink">Avant de jouer</h2>
      <p className="mb-4 text-sm font-bold text-k-body">
        Proposez à vos clients de vous noter ou de vous suivre juste avant leur
        partie. Facultatif pour eux : ils peuvent continuer sans rien faire, et
        leur gain n&apos;en dépend jamais.
      </p>

      <form onSubmit={onSubmit} className="space-y-3">
        <input type="hidden" name="id" value={campaignId} />
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="prejeu_invitation"
            defaultChecked={enabled}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
          />
          <span className="text-sm text-zinc-700">
            Proposer de nous noter / nous suivre avant la partie
          </span>
        </label>

        {!aDesLiens && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Aucun lien n&apos;est encore renseigné : rien ne sera proposé à vos
            clients.{" "}
            <Link
              href="/dashboard/settings"
              className="font-semibold underline"
            >
              Renseignez d&apos;abord vos liens dans Réglages
            </Link>
            .
          </p>
        )}

        <FieldError message={state && !state.ok ? state.error : undefined} />
        {state?.ok && (
          <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
        )}
      </form>
    </Card>
  );
}
