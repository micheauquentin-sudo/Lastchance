"use client";

import { useActionState, useState } from "react";
import { createContest } from "@/actions/pronostics";
import { COMPETITIONS } from "@/lib/competitions";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function NewContestForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createContest, null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Nouveau championnat</Button>;
  }

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      <div>
        <Label htmlFor="contest-competition">Compétition</Label>
        <select
          id="contest-competition"
          name="competition_key"
          required
          className="w-56 rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
        >
          {COMPETITIONS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.icon} {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="contest-name">Nom du championnat</Label>
        <Input
          id="contest-name"
          name="name"
          required
          maxLength={120}
          placeholder="Ex : Pronos du comptoir"
          autoFocus
          className="w-56"
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
