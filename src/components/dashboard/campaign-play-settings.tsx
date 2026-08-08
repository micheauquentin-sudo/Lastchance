"use client";

import { useRef } from "react";
import { updateCampaignClaim } from "@/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
import type { Campaign } from "@/types/database";

/*
 * `CampaignEngagementSettings` VIVAIT ICI — la carte « Actions avant de jouer »,
 * qui conditionnait le lancement du jeu à une action du joueur (newsletter,
 * Instagram, TikTok, avis Google). Elle n'était plus rendue par aucune page et
 * son action serveur était gelée depuis des semaines ; elle est supprimée avec
 * `updateCampaignEngagement`. Ce qui la remplace n'est PAS une porte :
 * `updateCampaignPrejeuInvitation` propose les comptes de la maison sans jamais
 * bloquer le jeu, et les liens sont réglés une fois pour toutes côté
 * organisation (`updateOrganizationSocialLinks`).
 */

/**
 * Carte campagne : ce qui est demandé au gagnant avant d'afficher le
 * code (email, téléphone, ou rien) + compte à rebours avant masquage
 * de l'écran du code.
 *
 * `useActionForm` et non `useActionState` : l'état de chargement doit
 * retomber même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
 */
export function CampaignClaimSettings({ campaign }: { campaign: Campaign }) {
  // ENREGISTREMENT AUTOMATIQUE. `useAutoSave` s'ajoute À CÔTÉ de
  // `useActionForm` — jamais autour : deux gardes mécaniques du dépôt cherchent
  // l'appel littéral. Le bouton et le « Configuration enregistrée. » RESTENT.
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useActionForm(updateCampaignClaim, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Enregistré.",
  });
  const { enAttente, bloqueParValidation } = useAutoSave(formRef);

  return (
    <Card>
      <h2 className="font-semibold mb-1">Après le gain</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Choisissez ce qui est demandé au gagnant avant d&apos;afficher son
        code. Rien de coché = le code s&apos;affiche directement.
      </p>

      <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
        <input type="hidden" name="id" value={campaign.id} />

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="collect_email"
            defaultChecked={campaign.collect_email}
            className="mt-0.5 h-4 w-4 shrink-0 accent-orange-600"
          />
          <span>
            <span className="font-medium text-zinc-900">
              Demander l&apos;email
            </span>
            <span className="block text-xs text-zinc-500 mt-0.5">
              Le gagnant reçoit aussi son code par email.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="collect_phone"
            defaultChecked={campaign.collect_phone}
            className="mt-0.5 h-4 w-4 shrink-0 accent-orange-600"
          />
          <span>
            <span className="font-medium text-zinc-900">
              Demander le téléphone
            </span>
            <span className="block text-xs text-zinc-500 mt-0.5">
              Numéro visible dans Participations et l&apos;export CSV.
            </span>
          </span>
        </label>

        <div>
          <Label htmlFor="code_ttl_seconds">
            Délai de retrait du code (secondes)
          </Label>
          <Input
            id="code_ttl_seconds"
            name="code_ttl_seconds"
            type="number"
            min={10}
            max={600}
            defaultValue={campaign.code_ttl_seconds ?? ""}
            placeholder="Vide = le code reste affiché"
          />
          <p className="text-xs text-zinc-500 mt-1.5">
            Ex : 60 — le gagnant a 60 secondes pour présenter son code. Passé
            ce délai il devient <strong>invalide en caisse</strong>, y compris
            depuis l&apos;email ou le pass Wallet : ce n&apos;est pas un simple
            masquage. Vide = pas d&apos;expiration (10 à 600 s).
          </p>
        </div>

        <FieldError message={state && !state.ok ? state.error : undefined} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "…" : "Enregistrer"}
        </Button>
        {state?.ok && (
          <p className="text-sm text-emerald-600 text-center">
            Configuration enregistrée.
          </p>
        )}
        {enAttente && !pending && (
          <p className="text-center text-sm font-semibold text-k-body">
            Modification en attente d&apos;enregistrement…
          </p>
        )}
        {/* Un enregistrement automatique silencieusement inopérant est pire que
            pas d'enregistrement du tout : le délai de retrait est borné (10 à
            600 s), et une valeur hors bornes ne partirait jamais. */}
        {bloqueParValidation && (
          <p role="alert" className="text-sm font-semibold text-red-700">
            Non enregistré : un champ requis est vide ou invalide.
          </p>
        )}
      </form>
    </Card>
  );
}
