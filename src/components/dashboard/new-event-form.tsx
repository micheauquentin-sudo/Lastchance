"use client";

import { useActionState, useState } from "react";
import { createEventGame } from "@/actions/events";
import { Button } from "@/components/ui/button";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { FieldError, Input, Label } from "@/components/ui/input";

/** Création d'un jeu du Mode événement (miroir NewJackpotForm). */
/**
 * `instanceId` : suffixe d'identifiants, pour que la page liste puisse monter
 * DEUX fois ce formulaire — en tête d'écran et dans l'état vide — sans
 * dupliquer un `id` dans le document (ce qui casserait `htmlFor` et
 * `aria-describedby`, donc l'annonce au lecteur d'écran).
 */
export function NewEventForm({ instanceId = "" }: { instanceId?: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createEventGame, null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Nouveau jeu</Button>;
  }

  return (
    <form
      action={formAction}
      className="w-full max-w-xl flex flex-wrap items-end gap-2 rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      <div className="w-full sm:w-auto">
        <Label htmlFor={`event-name${instanceId}`}>Nom du jeu</Label>
        <Input
          id={`event-name${instanceId}`}
          name="name"
          required
          maxLength={120}
          placeholder="Ex : Le grand quiz du samedi"
          autoFocus
          className="w-full sm:w-64"
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
        id={`creation-evenement${instanceId}`}
        resume="Ce qui va se passer"
        defaultOpen
        className="w-full"
      >
        Créer prépare un jeu en brouillon : rien n&apos;est publié et la salle ne
        voit encore rien. Vous atterrissez directement dans l&apos;atelier, à
        l&apos;étape « Le jeu », puis viennent les manches et la soirée. Vous le
        retrouverez à tout moment dans la liste de vos jeux d&apos;événement.
      </InfoBulle>
    </form>
  );
}
