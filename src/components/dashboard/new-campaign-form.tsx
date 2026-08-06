"use client";

import { useActionState, useState } from "react";
import { createCampaign } from "@/actions/campaigns";
import { Button } from "@/components/ui/button";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { FieldError, Input } from "@/components/ui/input";

export function NewCampaignForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createCampaign, null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Nouvelle campagne</Button>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-2">
      <div>
        <Input
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
      <InfoBulle id="creation-campagne" resume="Ce qui va se passer" className="w-full">
        Créer prépare une campagne en brouillon : rien n&apos;est publié et
        aucun joueur ne peut encore jouer. Vous réglez ensuite la roue, les
        lots et les dates sur la page qui s&apos;ouvre. Vous la retrouverez à
        tout moment dans la liste de vos campagnes.
      </InfoBulle>
    </form>
  );
}
