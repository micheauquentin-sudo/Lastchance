"use client";

import { useActionState, useState } from "react";
import { createCampaign } from "@/actions/campaigns";
import { Button } from "@/components/ui/button";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { FieldError, Input, Label } from "@/components/ui/input";

/**
 * `instanceId` : suffixe d'identifiants, pour que la page liste puisse monter
 * DEUX fois ce formulaire — en tête d'écran et dans l'état vide — sans
 * dupliquer un `id` dans le document (ce qui casserait `htmlFor` et
 * `aria-describedby`, donc l'annonce au lecteur d'écran).
 */
export function NewCampaignForm({ instanceId = "" }: { instanceId?: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createCampaign, null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Nouvelle campagne</Button>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <Label htmlFor={`campaign-name${instanceId}`}>Nom de la campagne</Label>
        <Input
          id={`campaign-name${instanceId}`}
          name="name"
          required
          maxLength={120}
          placeholder="Ex : Soirées d'été"
          autoFocus
          className="w-52"
        />
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Création…" : "Créer"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(false)}
        disabled={pending}
      >
        Annuler
      </Button>
      <InfoBulle
        id={`creation-campagne${instanceId}`}
        resume="Ce qui va se passer"
        defaultOpen
        className="w-full"
      >
        Créer prépare une campagne en brouillon : rien n&apos;est publié et
        aucun joueur ne peut encore jouer. L&apos;atelier s&apos;ouvre aussitôt
        et vous guide en cinq étapes : le jeu, les lots, l&apos;habillage, le
        créneau, puis la vérification. Vous la retrouverez à tout moment dans la
        liste de vos campagnes.
      </InfoBulle>
    </form>
  );
}
