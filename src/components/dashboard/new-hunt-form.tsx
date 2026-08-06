"use client";

import { useActionState, useState } from "react";
import { createHunt } from "@/actions/hunts";
import { Button } from "@/components/ui/button";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { FieldError, Input, Label } from "@/components/ui/input";

export function NewHuntForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createHunt, null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Nouvelle chasse</Button>;
  }

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      <div>
        <Label htmlFor="hunt-name">Nom de la chasse</Label>
        <Input
          id="hunt-name"
          name="name"
          required
          maxLength={80}
          placeholder="Ex : La chasse du printemps"
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
      <InfoBulle id="creation-chasse" resume="Ce qui va se passer" className="w-full">
        Créer prépare une chasse en brouillon : rien n&apos;est publié et aucun
        joueur ne peut encore la commencer. Vous placez ensuite les étapes, les
        indices et les lots sur la page qui s&apos;ouvre. Vous la retrouverez à
        tout moment dans la liste de vos chasses.
      </InfoBulle>
    </form>
  );
}
