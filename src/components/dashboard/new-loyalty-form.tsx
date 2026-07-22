"use client";

import { useActionState, useState } from "react";
import { createLoyaltyProgram } from "@/actions/loyalty";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function NewLoyaltyForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createLoyaltyProgram, null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Nouveau programme</Button>;
  }

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      <div>
        <Label htmlFor="loyalty-name">Nom du programme</Label>
        <Input
          id="loyalty-name"
          name="name"
          required
          maxLength={80}
          placeholder="Ex : Carte fidélité du café"
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
    </form>
  );
}
