"use client";

import { useActionState, useState } from "react";
import { createJackpotCampaign } from "@/actions/jackpot";
import { Button } from "@/components/ui/button";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { FieldError, Input, Label } from "@/components/ui/input";

export function NewJackpotForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createJackpotCampaign, null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Nouveau jackpot</Button>;
  }

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      <div>
        <Label htmlFor="jackpot-name">Nom du jackpot</Label>
        <Input
          id="jackpot-name"
          name="name"
          required
          maxLength={80}
          placeholder="Ex : La grande cagnotte du bar"
          autoFocus
          className="w-64"
        />
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
      <FieldError message={state && !state.ok ? state.error : undefined} />
      <InfoBulle id="creation-jackpot" resume="Ce qui va se passer" className="w-full">
        Créer prépare une cagnotte en brouillon : rien n&apos;est publié et
        personne ne peut encore y contribuer. Vous réglez ensuite le palier à
        atteindre et le lot commun sur la page qui s&apos;ouvre. Vous la
        retrouverez à tout moment dans la liste de vos jackpots.
      </InfoBulle>
    </form>
  );
}
