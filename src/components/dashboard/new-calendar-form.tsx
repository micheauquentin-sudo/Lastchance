"use client";

import { useActionState, useState } from "react";
import { createCalendar } from "@/actions/calendar";
import { Button } from "@/components/ui/button";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { FieldError, Input, Label } from "@/components/ui/input";

/**
 * `instanceId` : suffixe d'identifiants, pour que la page liste puisse monter
 * DEUX fois ce formulaire — en tête d'écran et dans l'état vide — sans
 * dupliquer un `id` dans le document (ce qui casserait `htmlFor` et
 * `aria-describedby`, donc l'annonce au lecteur d'écran).
 */
export function NewCalendarForm({ instanceId = "" }: { instanceId?: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createCalendar, null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Nouveau calendrier</Button>;
  }

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      <div>
        <Label htmlFor={`calendar-name${instanceId}`}>Nom du calendrier</Label>
        <Input
          id={`calendar-name${instanceId}`}
          name="name"
          required
          maxLength={120}
          placeholder="Ex : Calendrier de l'Avent de la boutique"
          autoFocus
          className="w-72"
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
      <InfoBulle
        id={`creation-calendrier${instanceId}`}
        resume="Ce qui va se passer"
        defaultOpen
        className="w-full"
      >
        Créer prépare un calendrier en brouillon : rien n&apos;est publié et
        aucune case ne peut encore être ouverte. Vous garnissez ensuite les
        cases, jour par jour, sur la page qui s&apos;ouvre. Vous le retrouverez
        à tout moment dans la liste de vos calendriers.
      </InfoBulle>
    </form>
  );
}
