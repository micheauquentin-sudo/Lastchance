"use client";

import { useActionState, useState } from "react";
import { createJackpotCampaign } from "@/actions/jackpot";
import { Button } from "@/components/ui/button";
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
    </form>
  );
}
