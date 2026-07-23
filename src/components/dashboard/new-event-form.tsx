"use client";

import { useActionState, useState } from "react";
import { createEventGame } from "@/actions/events";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

/** Création d'un jeu du Mode événement (miroir NewJackpotForm). */
export function NewEventForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createEventGame, null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Nouveau jeu</Button>;
  }

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      <div>
        <Label htmlFor="event-name">Nom du jeu</Label>
        <Input
          id="event-name"
          name="name"
          required
          maxLength={120}
          placeholder="Ex : Le grand quiz du samedi"
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
