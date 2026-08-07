"use client";

import { useActionState, useState } from "react";
import { createHunt } from "@/actions/hunts";
import { Button } from "@/components/ui/button";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { FieldError, Input, Label } from "@/components/ui/input";

/**
 * `instanceId` : suffixe d'identifiants, pour que la page liste puisse monter
 * DEUX fois ce formulaire — en tête d'écran et dans l'état vide — sans
 * dupliquer un `id` dans le document (ce qui casserait `htmlFor` et
 * `aria-describedby`, donc l'annonce au lecteur d'écran).
 */
export function NewHuntForm({ instanceId = "" }: { instanceId?: string }) {
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
        <Label htmlFor={`hunt-name${instanceId}`}>Nom de la chasse</Label>
        <Input
          id={`hunt-name${instanceId}`}
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
      <InfoBulle
        id={`creation-chasse${instanceId}`}
        resume="Ce qui va se passer"
        defaultOpen
        className="w-full"
      >
        Créer prépare une chasse en brouillon : rien n&apos;est publié et aucun
        joueur ne peut encore la commencer. L&apos;atelier s&apos;ouvre ensuite
        à sa première étape — le lot final —, puis vous placez le parcours, les
        indices et les affiches ; rien n&apos;est ouvert aux joueurs tant que
        vous ne l&apos;avez pas décidé. Vous la retrouverez à tout moment dans
        la liste de vos chasses.
      </InfoBulle>
    </form>
  );
}
